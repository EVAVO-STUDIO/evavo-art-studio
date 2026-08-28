#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import readline from "node:readline";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { runCommand } from "./local-quality-gate.mjs";

export const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const STACK_RELATIVE_ROOT = ".art-studio/local-stack";
export const STACK_LOCK_RELATIVE_PATH = `${STACK_RELATIVE_ROOT}/stack.lock.json`;
export const DEFAULT_STACK_SERVICES = Object.freeze(["web", "api", "worker"]);
export const DEFAULT_STARTUP_TIMEOUT_MS = 90_000;
export const DEFAULT_BUILD_TIMEOUT_MS = 30 * 60 * 1_000;
export const DEFAULT_LOG_LIMIT_BYTES = 8 * 1024 * 1024;

const SERVICE_DEFINITIONS = Object.freeze({
  web: Object.freeze({
    id: "web",
    packageName: "@evavo/art-studio-web",
    command: Object.freeze(["pnpm", "--filter", "@evavo/art-studio-web", "dev"]),
    readiness: Object.freeze({ type: "http", url: "http://127.0.0.1:4200/", port: 4200 }),
  }),
  api: Object.freeze({
    id: "api",
    packageName: "@evavo/art-studio-api",
    command: Object.freeze(["pnpm", "--filter", "@evavo/art-studio-api", "dev"]),
    readiness: Object.freeze({
      type: "api-health",
      url: "http://127.0.0.1:4100/health",
      port: 4100,
    }),
  }),
  worker: Object.freeze({
    id: "worker",
    packageName: "@evavo/art-studio-worker",
    command: Object.freeze([process.execPath, "scripts/run-local-worker.mjs", "daemon"]),
    readiness: Object.freeze({ type: "process-output" }),
  }),
});

function fail(code, message, options = {}) {
  const error = new Error(message, options);
  error.name = "LocalStudioStackError";
  error.code = code;
  throw error;
}

function boundedInteger(value, fallback, minimum, maximum, label) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    fail("LOCAL_STACK_INTEGER_INVALID", `${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

function safePath(root, relativePath) {
  const candidate = path.resolve(root, relativePath);
  const relation = path.relative(path.resolve(root), candidate);
  if (relation.startsWith("..") || path.isAbsolute(relation)) {
    fail("LOCAL_STACK_PATH_ESCAPED", `${relativePath} escaped the repository root.`);
  }
  return candidate;
}

function assertOrdinaryDirectory(file, label) {
  if (!fs.existsSync(file)) return;
  const state = fs.lstatSync(file);
  if (state.isSymbolicLink() || !state.isDirectory()) {
    fail("LOCAL_STACK_DIRECTORY_INVALID", `${label} must be an ordinary directory.`);
  }
}

function ensureStateRoot(root) {
  const artStudioRoot = safePath(root, ".art-studio");
  const stackRoot = safePath(root, STACK_RELATIVE_ROOT);
  assertOrdinaryDirectory(artStudioRoot, ".art-studio");
  assertOrdinaryDirectory(stackRoot, STACK_RELATIVE_ROOT);
  fs.mkdirSync(stackRoot, { recursive: true, mode: 0o700 });
  assertOrdinaryDirectory(stackRoot, STACK_RELATIVE_ROOT);
  return stackRoot;
}

export function parseServiceSelection(value) {
  if (value === undefined || value === null || value === "") return DEFAULT_STACK_SERVICES;
  if (typeof value !== "string" || value.includes("\0")) {
    fail("LOCAL_STACK_SERVICES_INVALID", "services must be a comma-separated safe string.");
  }
  const services = value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (!services.length) fail("LOCAL_STACK_SERVICES_EMPTY", "at least one local service is required.");
  const unique = [...new Set(services)];
  if (unique.length !== services.length) {
    fail("LOCAL_STACK_SERVICES_DUPLICATE", "services may not contain duplicates.");
  }
  for (const service of unique) {
    if (!Object.hasOwn(SERVICE_DEFINITIONS, service)) {
      fail(
        "LOCAL_STACK_SERVICE_UNSUPPORTED",
        `unsupported local service ${service}; expected web, api or worker.`,
      );
    }
  }
  return Object.freeze(unique.sort((left, right) => DEFAULT_STACK_SERVICES.indexOf(left) - DEFAULT_STACK_SERVICES.indexOf(right)));
}

function stackCommand(label, ...commandLine) {
  return Object.freeze({ label, executable: commandLine[0], args: Object.freeze(commandLine.slice(1)) });
}

export function buildStackPlan(options = {}) {
  const services = parseServiceSelection(options.services);
  const build = options.build !== false;
  const buildCommands = [];
  if (build) {
    buildCommands.push(stackCommand("Build shared Art Studio domain packages once", "pnpm", "run", "build:domain"));
    if (services.includes("api")) {
      buildCommands.push(
        stackCommand("Build local Art Studio API", "pnpm", "--filter", "@evavo/art-studio-api", "build"),
      );
    }
    if (services.includes("worker")) {
      buildCommands.push(
        stackCommand(
          "Build local Art Studio worker",
          "pnpm",
          "--filter",
          "@evavo/art-studio-worker",
          "build",
        ),
        stackCommand(
          "Verify worker storage headroom",
          process.execPath,
          "scripts/check-local-storage-headroom.mjs",
        ),
      );
    }
  }
  const servicePlans = services.map((service) => {
    const definition = SERVICE_DEFINITIONS[service];
    return Object.freeze({
      id: service,
      packageName: definition.packageName,
      command: definition.command,
      readiness: definition.readiness,
    });
  });
  return Object.freeze({
    schema: "evavo.art-studio.local-stack-plan.v1",
    services,
    build,
    buildCommands: Object.freeze(buildCommands),
    servicePlans: Object.freeze(servicePlans),
    stateRoot: STACK_RELATIVE_ROOT,
    authority: Object.freeze({
      githubActionsRequired: false,
      vercelRequired: false,
      deployment: false,
      publication: false,
      repositoryMutation: false,
      forcePush: false,
    }),
  });
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function readLock(file) {
  if (!fs.existsSync(file)) return undefined;
  const state = fs.lstatSync(file);
  if (state.isSymbolicLink() || !state.isFile()) {
    fail("LOCAL_STACK_LOCK_INVALID", "local stack lock must be an ordinary file.");
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail("LOCAL_STACK_LOCK_JSON_INVALID", "local stack lock is not valid JSON.", { cause: error });
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    !Number.isInteger(parsed.pid) ||
    typeof parsed.runId !== "string" ||
    !parsed.runId
  ) {
    fail("LOCAL_STACK_LOCK_SHAPE_INVALID", "local stack lock has an invalid shape.");
  }
  return parsed;
}

function writeFileExclusive(file, value) {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  const descriptor = fs.openSync(file, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function replaceFileAtomic(file, value) {
  const directory = path.dirname(file);
  const temporary = path.join(directory, `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  writeFileExclusive(temporary, value);
  if (process.platform === "win32" && fs.existsSync(file)) fs.rmSync(file, { force: true });
  fs.renameSync(temporary, file);
}

export function inspectStackLock(root = REPOSITORY_ROOT) {
  const file = safePath(root, STACK_LOCK_RELATIVE_PATH);
  const lock = readLock(file);
  if (!lock) return Object.freeze({ exists: false, active: false, stale: false, lock: null });
  const active = processAlive(lock.pid);
  return Object.freeze({ exists: true, active, stale: !active, lock: Object.freeze(lock) });
}

export function acquireStackLock(root = REPOSITORY_ROOT, services = DEFAULT_STACK_SERVICES) {
  ensureStateRoot(root);
  const file = safePath(root, STACK_LOCK_RELATIVE_PATH);
  const existing = inspectStackLock(root);
  if (existing.active) {
    fail(
      "LOCAL_STACK_ALREADY_RUNNING",
      `a local Art Studio stack is already active under PID ${existing.lock.pid}.`,
    );
  }
  if (existing.stale) fs.rmSync(file, { force: true });
  const lock = Object.freeze({
    schema: "evavo.art-studio.local-stack-lock.v1",
    runId: randomUUID(),
    pid: process.pid,
    startedAt: new Date().toISOString(),
    services: [...services],
    children: {},
  });
  writeFileExclusive(file, lock);
  return lock;
}

function updateStackLock(root, lock, children) {
  const file = safePath(root, STACK_LOCK_RELATIVE_PATH);
  const current = readLock(file);
  if (!current || current.runId !== lock.runId || current.pid !== process.pid) {
    fail("LOCAL_STACK_LOCK_OWNERSHIP_LOST", "local stack lock ownership changed during startup.");
  }
  replaceFileAtomic(file, { ...current, children });
}

export function releaseStackLock(root, runId) {
  const file = safePath(root, STACK_LOCK_RELATIVE_PATH);
  if (!fs.existsSync(file)) return false;
  const current = readLock(file);
  if (current.runId !== runId || current.pid !== process.pid) return false;
  fs.rmSync(file, { force: true });
  return true;
}

export async function portAvailable(host, port, timeoutMs = 500) {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (available) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(available);
    };
    socket.setTimeout(timeoutMs, () => finish(true));
    socket.once("connect", () => finish(false));
    socket.once("error", () => finish(true));
  });
}

function createBoundedLog(file, maximumBytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const descriptor = fs.openSync(file, "wx", 0o600);
  let written = 0;
  let truncated = false;
  return Object.freeze({
    write(line) {
      if (truncated) return;
      const bytes = Buffer.from(`${line}\n`, "utf8");
      if (written + bytes.length > maximumBytes) {
        const marker = Buffer.from("[evavo local stack] log limit reached; additional output omitted\n", "utf8");
        if (written + marker.length <= maximumBytes) fs.writeSync(descriptor, marker);
        truncated = true;
        return;
      }
      fs.writeSync(descriptor, bytes);
      written += bytes.length;
    },
    close() {
      try {
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
    },
    get bytesWritten() {
      return written;
    },
    get truncated() {
      return truncated;
    },
  });
}

function terminateProcessTree(child, force = false) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      shell: false,
      stdio: "ignore",
      timeout: 10_000,
    });
    return;
  }
  const signal = force ? "SIGKILL" : "SIGTERM";
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // Already stopped.
    }
  }
}

function lineStream(stream, service, level, log, onFirstLine) {
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  lines.on("line", (line) => {
    log.write(`[${level}] ${line}`);
    process[level === "stderr" ? "stderr" : "stdout"].write(`[art-studio:${service}] ${line}\n`);
    onFirstLine(line);
  });
  return lines;
}

function spawnService(plan, options) {
  const [executable, ...args] = plan.command;
  const log = createBoundedLog(options.logFile, options.maximumLogBytes);
  let resolveFirstLine;
  const firstLine = new Promise((resolve) => {
    resolveFirstLine = resolve;
  });
  let sawLine = false;
  const onFirstLine = (line) => {
    if (sawLine) return;
    sawLine = true;
    resolveFirstLine(line);
  };
  const child = spawn(executable, args, {
    cwd: options.root,
    env: options.environment,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
    windowsHide: true,
  });
  const stdout = lineStream(child.stdout, plan.id, "stdout", log, onFirstLine);
  const stderr = lineStream(child.stderr, plan.id, "stderr", log, onFirstLine);
  return Object.freeze({ plan, child, log, stdout, stderr, firstLine, get sawLine() { return sawLine; } });
}

async function wait(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForHttp(record, readiness, deadline) {
  while (Date.now() < deadline) {
    if (record.child.exitCode !== null || record.child.signalCode !== null) {
      fail("LOCAL_STACK_SERVICE_EXITED", `${record.plan.id} exited before becoming ready.`);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_000);
    timer.unref?.();
    try {
      const response = await fetch(readiness.url, {
        cache: "no-store",
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.status < 500) {
        if (readiness.type === "api-health") {
          const contentType = response.headers.get("content-type") ?? "";
          if (!contentType.toLowerCase().includes("application/json")) {
            throw new Error("API health response was not JSON.");
          }
          const body = await response.json();
          if (body?.status !== "ok" || body?.service !== "evavo-art-studio-api") {
            throw new Error("API health response identity did not match Art Studio.");
          }
        }
        return;
      }
    } catch {
      // Retry until the bounded startup deadline.
    } finally {
      clearTimeout(timer);
    }
    await wait(250);
  }
  fail("LOCAL_STACK_READINESS_TIMEOUT", `${record.plan.id} did not become ready before the startup deadline.`);
}

async function waitForWorker(record, deadline) {
  while (Date.now() < deadline) {
    if (record.child.exitCode !== null || record.child.signalCode !== null) {
      fail("LOCAL_STACK_SERVICE_EXITED", "worker exited before becoming ready.");
    }
    if (record.sawLine) return;
    await Promise.race([record.firstLine, wait(250)]);
  }
  fail("LOCAL_STACK_READINESS_TIMEOUT", "worker emitted no readiness output before the startup deadline.");
}

async function waitForReadiness(record, startupTimeoutMs) {
  const deadline = Date.now() + startupTimeoutMs;
  if (record.plan.readiness.type === "process-output") return await waitForWorker(record, deadline);
  return await waitForHttp(record, record.plan.readiness, deadline);
}

async function stopRecords(records) {
  for (const record of records) terminateProcessTree(record.child, false);
  const deadline = Date.now() + 10_000;
  while (records.some((record) => record.child.exitCode === null && record.child.signalCode === null) && Date.now() < deadline) {
    await wait(100);
  }
  for (const record of records) {
    if (record.child.exitCode === null && record.child.signalCode === null) terminateProcessTree(record.child, true);
    record.stdout.close();
    record.stderr.close();
    record.log.close();
  }
}

export async function runLocalStack(plan, options = {}) {
  const root = options.root ?? REPOSITORY_ROOT;
  const environment = { ...process.env, ...(options.environment ?? {}) };
  const buildTimeoutMs = boundedInteger(
    options.buildTimeoutMs ?? environment.EVAVO_ART_STACK_BUILD_TIMEOUT_MS,
    DEFAULT_BUILD_TIMEOUT_MS,
    1_000,
    4 * 60 * 60 * 1_000,
    "stack build timeout",
  );
  const startupTimeoutMs = boundedInteger(
    options.startupTimeoutMs ?? environment.EVAVO_ART_STACK_STARTUP_TIMEOUT_MS,
    DEFAULT_STARTUP_TIMEOUT_MS,
    1_000,
    10 * 60 * 1_000,
    "stack startup timeout",
  );
  const maximumLogBytes = boundedInteger(
    options.maximumLogBytes ?? environment.EVAVO_ART_STACK_LOG_LIMIT_BYTES,
    DEFAULT_LOG_LIMIT_BYTES,
    64 * 1_024,
    512 * 1_024 * 1_024,
    "stack log limit",
  );

  const lock = acquireStackLock(root, plan.services);
  const sessionRoot = safePath(root, `${STACK_RELATIVE_ROOT}/sessions/${lock.runId}`);
  fs.mkdirSync(sessionRoot, { recursive: true, mode: 0o700 });
  const records = [];
  let stopping = false;
  try {
    for (const servicePlan of plan.servicePlans) {
      const port = servicePlan.readiness.port;
      if (port && !(await portAvailable("127.0.0.1", port))) {
        fail(
          "LOCAL_STACK_PORT_OCCUPIED",
          `${servicePlan.id} cannot start because 127.0.0.1:${port} is already in use.`,
        );
      }
    }

    for (const buildCommand of plan.buildCommands) {
      process.stdout.write(`\n[art-studio local stack] ${buildCommand.label}\n`);
      await runCommand(buildCommand, {
        root,
        timeoutMs: buildTimeoutMs,
        environment,
      });
    }

    for (const servicePlan of plan.servicePlans) {
      const record = spawnService(servicePlan, {
        root,
        environment,
        maximumLogBytes,
        logFile: path.join(sessionRoot, `${servicePlan.id}.log`),
      });
      records.push(record);
      record.child.once("error", (error) => {
        if (!stopping) process.stderr.write(`[art-studio:${servicePlan.id}] spawn error: ${error.message}\n`);
      });
    }
    updateStackLock(
      root,
      lock,
      Object.fromEntries(records.map((record) => [record.plan.id, record.child.pid])),
    );
    await Promise.all(records.map((record) => waitForReadiness(record, startupTimeoutMs)));

    process.stdout.write(
      `${JSON.stringify({
        schema: "evavo.art-studio.local-stack-ready.v1",
        runId: lock.runId,
        services: plan.services,
        sessionRoot: path.relative(root, sessionRoot).replaceAll(path.sep, "/"),
        githubActionsRequired: false,
        vercelRequired: false,
      })}\n`,
    );

    await new Promise((resolve, reject) => {
      const onAbort = () => resolve();
      options.signal?.addEventListener("abort", onAbort, { once: true });
      for (const record of records) {
        record.child.once("exit", (code, signal) => {
          if (stopping || options.signal?.aborted) return;
          reject(
            Object.assign(
              new Error(
                `${record.plan.id} exited unexpectedly with code ${code ?? "unknown"}${signal ? ` (${signal})` : ""}.`,
              ),
              { code: "LOCAL_STACK_SERVICE_EXITED" },
            ),
          );
        });
      }
    });
  } finally {
    stopping = true;
    await stopRecords(records);
    releaseStackLock(root, lock.runId);
  }
}

function parseArguments(argv) {
  let services;
  let build = true;
  let planOnly = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--plan") planOnly = true;
    else if (argument === "--no-build") build = false;
    else if (argument === "--services") {
      services = argv[index + 1];
      index += 1;
    } else if (argument.startsWith("--services=")) services = argument.slice("--services=".length);
    else fail("LOCAL_STACK_ARGUMENT_UNSUPPORTED", `unsupported argument ${argument}.`);
  }
  return Object.freeze({ services, build, planOnly });
}

function serialisePlan(plan) {
  return {
    ...plan,
    buildCommands: plan.buildCommands.map((entry) => ({
      label: entry.label,
      command: [entry.executable, ...entry.args],
    })),
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const plan = buildStackPlan(options);
  process.stdout.write(`${JSON.stringify(serialisePlan(plan), null, 2)}\n`);
  if (options.planOnly) return;
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await runLocalStack(plan, { root: REPOSITORY_ROOT, signal: controller.signal });
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        error: {
          code: error?.code ?? "LOCAL_STACK_UNEXPECTED_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
      })}\n`,
    );
    process.exitCode = 1;
  });
}
