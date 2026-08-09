#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";

const BATCH_SCHEMA = "evavo.raw-art-provider-runtime-batch.v1";
const RECEIPT_SCHEMA = "evavo.raw-art-runtime-cycle-receipt.v1";
const HASH64 = /^[0-9a-f]{64}$/u;

const sha256 = (value) =>
  createHash("sha256")
    .update(Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8"))
    .digest("hex");
const stable = (value) => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};
const hashObject = (value) => sha256(stable(value));

function parseArguments(argv) {
  const values = { jobIds: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--submit-all") {
      values.submitAll = true;
      continue;
    }
    if (token === "--confirm") {
      values.confirm = true;
      continue;
    }
    if (!token.startsWith("--")) throw new Error(`Unexpected argument ${token}.`);
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${token}.`);
    index += 1;
    if (key === "job-id") values.jobIds.push(value);
    else if (["runtime-batch", "worker", "actor", "receipt", "timeout-ms"].includes(key)) {
      values[key.replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = value;
    } else {
      throw new Error(`Unsupported argument ${token}.`);
    }
  }
  return values;
}

async function readJson(filePath, label) {
  const requested = path.resolve(filePath);
  const state = await lstat(requested);
  if (!state.isFile() || state.isSymbolicLink() || state.size < 1 || state.size > 64 * 1024 * 1024) {
    throw new Error(`${label} must be a bounded regular file.`);
  }
  const resolved = await realpath(requested);
  if (resolved !== requested) throw new Error(`${label} must use its canonical path.`);
  const bytes = await readFile(resolved);
  return { path: resolved, bytes, sha256: sha256(bytes), value: JSON.parse(bytes.toString("utf8")) };
}

function selectedJobs(batch, ids, submitAll) {
  if (batch.schema !== BATCH_SCHEMA) throw new Error(`Expected ${BATCH_SCHEMA}.`);
  if (!Array.isArray(batch.jobs) || batch.jobs.length < 1) throw new Error("Runtime batch has no jobs.");
  const requested = new Set(ids);
  if (!submitAll && requested.size < 1) throw new Error("Select --job-id values or use --submit-all.");
  const selected = [];
  for (const job of batch.jobs) {
    const id = String(job.jobId ?? job.id ?? job.requestId ?? "");
    if (!id) throw new Error("Runtime batch job lacks an ID.");
    if (!submitAll && !requested.has(id)) continue;
    if (!job.contract?.runtimeJob || typeof job.contract.runtimeJob !== "object") {
      throw new Error(`Runtime batch job ${id} lacks contract.runtimeJob.`);
    }
    selected.push({ id, runtimeJob: job.contract.runtimeJob });
  }
  const missing = [...requested].filter((id) => !selected.some((entry) => entry.id === id));
  if (missing.length) throw new Error(`Unknown job IDs: ${missing.join(", ")}`);
  return selected;
}

async function callMcp(entrypoint, tool, args, timeoutMs) {
  const initId = `init-${randomBytes(6).toString("hex")}`;
  const callId = `call-${randomBytes(6).toString("hex")}`;
  const messages = [
    {
      jsonrpc: "2.0",
      id: initId,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "art-studio-runtime-cycle", version: "1.0.0" },
      },
    },
    { jsonrpc: "2.0", method: "notifications/initialized", params: {} },
    { jsonrpc: "2.0", id: callId, method: "tools/call", params: { name: tool, arguments: args } },
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entrypoint], {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
      if (error) reject(error);
      else resolve(value);
    };
    const parse = () => {
      const lines = stdout.split(/\r?\n/u);
      stdout = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let value;
        try {
          value = JSON.parse(line);
        } catch {
          continue;
        }
        if (value.id !== callId) continue;
        if (value.error) finish(new Error(value.error.message));
        else finish(null, value.result);
      }
    };
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (Buffer.byteLength(stdout) > 4 * 1024 * 1024) finish(new Error("MCP output is unbounded."));
      parse();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      if (Buffer.byteLength(stderr) > 4 * 1024 * 1024) finish(new Error("MCP error output is unbounded."));
    });
    child.once("error", (error) => finish(error));
    child.once("close", (code) => {
      if (!settled) finish(new Error(`MCP exited before replying with code ${code ?? -1}: ${stderr.slice(-1000)}`));
    });
    const timer = setTimeout(() => finish(new Error(`MCP timed out after ${timeoutMs}ms.`)), timeoutMs);
    child.stdin.end(`${messages.map((value) => JSON.stringify(value)).join("\n")}\n`);
  });
}

async function runWorker(mode, timeoutMs) {
  return new Promise((resolve, reject) => {
    const script = mode === "until-idle" ? "worker:until-idle" : "worker:once";
    const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const started = Date.now();
    const child = spawn(executable, [script], {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const append = (current, chunk) => `${current}${chunk}`.slice(-2_000_000);
    child.stdout.on("data", (chunk) => (stdout = append(stdout, chunk.toString("utf8"))));
    child.stderr.on("data", (chunk) => (stderr = append(stderr, chunk.toString("utf8"))));
    child.once("error", reject);
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        script,
        exitCode: code ?? -1,
        signal: signal ?? null,
        durationMs: Date.now() - started,
        stdoutSha256: sha256(stdout),
        stderrSha256: sha256(stderr),
        stdoutTail: stdout.slice(-32768),
        stderrTail: stderr.slice(-32768),
      });
    });
  });
}

async function writeReceipt(destination, value) {
  const target = path.resolve(destination);
  await mkdir(path.dirname(target), { recursive: true });
  try {
    await lstat(target);
    throw new Error(`Receipt already exists: ${target}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const temporary = `${target}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    const handle = await open(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    );
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await link(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function main() {
  const input = parseArguments(process.argv.slice(2));
  if (input.confirm !== true) throw new Error("Execution requires --confirm.");
  if (!input.runtimeBatch || !input.receipt) {
    throw new Error("--runtime-batch and --receipt are required.");
  }
  const timeoutMs = Number(input.timeoutMs ?? 1_800_000);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 7_200_000) {
    throw new Error("--timeout-ms must be 1000..7200000.");
  }
  const batch = await readJson(input.runtimeBatch, "Runtime batch");
  const jobs = selectedJobs(batch.value, input.jobIds, input.submitAll === true);
  const entrypoint = path.join(process.cwd(), "apps", "mcp", "dist", "index.js");
  const response = await callMcp(
    entrypoint,
    "submit_art_runtime_jobs",
    {
      jobs: jobs.map((entry) => entry.runtimeJob),
      actor: input.actor ?? "art-studio-runtime-cycle",
    },
    timeoutMs,
  );
  const worker = await runWorker(input.worker ?? "once", timeoutMs);
  const body = {
    schema: RECEIPT_SCHEMA,
    status: worker.exitCode === 0 ? "passed" : "failed",
    runtimeBatchPath: batch.path,
    runtimeBatchFileSha256: batch.sha256,
    selectedJobIds: jobs.map((entry) => entry.id),
    selectedRuntimeJobsSha256: hashObject(jobs.map((entry) => entry.runtimeJob)),
    submissionResponseSha256: hashObject(response),
    worker,
    effects: {
      runtimeSubmission: true,
      providerWorkerExecution: true,
      candidateApproval: false,
      repositoryMutation: false,
      publication: false,
      forcePush: false,
    },
  };
  const receipt = { ...body, receiptSha256: hashObject(body) };
  if (!HASH64.test(receipt.receiptSha256)) throw new Error("Receipt hash is invalid.");
  await writeReceipt(input.receipt, receipt);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  process.exitCode = worker.exitCode === 0 ? 0 : 3;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
