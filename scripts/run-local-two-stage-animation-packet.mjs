#!/usr/bin/env node
import { access, lstat, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  LocalArtifactStore,
  normalizeJson,
  stableStringify,
} from "@evavo/art-artifacts";
import { LocalRuntimeRepository } from "@evavo/art-runtime";
import { compileSpriteSupervisorWorkflow } from "@evavo/art-sprite-supervisor";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKET_SCHEMA = "evavo.local-two-stage-animation-execution.v1";
const RECEIPT_KIND = "evavo.local-two-stage-animation-execution-receipt.v1";
const MAX_PACKET_BYTES = 32 * 1024 * 1024;
const MAX_CAPTURE_BYTES = 1024 * 1024;
const TERMINAL = new Set([
  "review-required",
  "succeeded",
  "failed",
  "cancelled",
]);
const ALLOWED_TASK_KINDS = new Set([
  "art.candidate.generate",
  "art.candidate.edit",
  "art.candidate.master-alpha",
  "art.candidate.select",
  "art.candidate.promote",
  "sprite.family.verify",
  "sprite.family.deliver",
]);
const PROVIDER_TASK_KINDS = new Map([
  ["art.candidate.generate", "generate"],
  ["art.candidate.edit", "edit"],
]);

function fail(message) {
  throw new Error(message);
}

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(label + " must be an object");
  }
  return value;
}

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== "--packet" || !argv[1]) {
    fail("usage: run-local-two-stage-animation-packet.mjs --packet <file>");
  }
  return path.resolve(argv[1]);
}

function boundedInteger(raw, fallback, minimum, maximum, name) {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    fail(name + " must be an integer in [" + minimum + ", " + maximum + "]");
  }
  return value;
}

function runtimeRoot() {
  return path.resolve(
    process.env.EVAVO_ART_RUNTIME_ROOT || path.join(ROOT, ".art-studio", "runtime"),
  );
}

function artifactRoot() {
  return path.resolve(
    process.env.EVAVO_ART_ARTIFACT_ROOT ||
      path.join(ROOT, ".art-studio", "artifacts"),
  );
}

function assertLeaseEnvironment() {
  if (process.env.EVAVO_CREATIVE_GPU_LEASE_HELD !== "true") {
    fail("shared creative GPU lease is not attested");
  }
  for (const name of [
    "EVAVO_CREATIVE_GPU_LEASE_JOB_ID",
    "EVAVO_CREATIVE_GPU_LEASE_WORKER_ID",
  ]) {
    const value = process.env[name];
    if (!value || !/^[A-Za-z0-9._:-]{1,128}$/u.test(value)) {
      fail(name + " is missing or invalid");
    }
  }
}

async function loadPacket(filePath) {
  const info = await lstat(filePath);
  if (!info.isFile() || info.isSymbolicLink()) {
    fail("execution packet must be one regular non-symlink file");
  }
  if (info.size < 1 || info.size > MAX_PACKET_BYTES) {
    fail(
      "execution packet must contain 1 to " +
        MAX_PACKET_BYTES +
        " bytes",
    );
  }
  let value;
  try {
    value = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    fail(
      "execution packet is invalid JSON: " +
        (error instanceof Error ? error.message : String(error)),
    );
  }
  const packet = record(value, "execution packet");
  const keys = Object.keys(packet).sort();
  if (
    keys.length !== 2 ||
    keys[0] !== "schema" ||
    keys[1] !== "workflow" ||
    packet.schema !== PACKET_SCHEMA
  ) {
    fail(
      "execution packet must contain exactly schema=" +
        PACKET_SCHEMA +
        " and workflow",
    );
  }
  return packet;
}

function canonical(value) {
  return stableStringify(normalizeJson(value));
}

function assertProviderTask(task) {
  const expectedOperation = PROVIDER_TASK_KINDS.get(task.kind);
  if (!expectedOperation) return;
  const payload = record(task.payloadTemplate, task.id + ".payloadTemplate");
  if (payload.operation !== expectedOperation) {
    fail(
      "provider task " +
        task.id +
        " operation differs from its fixed task kind",
    );
  }
  const selection = record(
    payload.selection,
    task.id + ".payloadTemplate.selection",
  );
  if (
    !Array.isArray(selection.allowedAdapterIds) ||
    selection.allowedAdapterIds.length !== 1 ||
    typeof selection.allowedAdapterIds[0] !== "string" ||
    !selection.allowedAdapterIds[0].startsWith("draw-things:")
  ) {
    fail(
      "provider task " +
        task.id +
        " must be locked to exactly one draw-things:* adapter",
    );
  }
  if (selection.allowFallback !== false) {
    fail("provider task " + task.id + " must disable provider fallback");
  }
  if (
    selection.preferredAdapterId !== undefined &&
    selection.preferredAdapterId !== selection.allowedAdapterIds[0]
  ) {
    fail(
      "provider task " +
        task.id +
        " preferred adapter differs from its local allow-list",
    );
  }
}

function containsForbiddenExecutableField(value) {
  if (Array.isArray(value)) {
    return value.some(containsForbiddenExecutableField);
  }
  if (!value || typeof value !== "object") return false;
  for (const [key, entry] of Object.entries(value)) {
    if (
      key === "godotExecutable" ||
      key === "executable" ||
      key === "command" ||
      key === "shell"
    ) {
      return true;
    }
    if (containsForbiddenExecutableField(entry)) return true;
  }
  return false;
}

function validateWorkflow(input) {
  const supplied = record(input, "workflow");
  const request = record(supplied.request, "workflow.request");
  const compiled = compileSpriteSupervisorWorkflow(request);
  if (canonical(supplied) !== canonical(compiled)) {
    fail(
      "execution packet workflow differs from the deterministically recompiled supervisor workflow",
    );
  }
  if (
    compiled.rootJob.kind !== "art.sprite-production.supervise" ||
    compiled.rootJob.queue !== "control" ||
    compiled.rootJob.labels.supervisorTick !== "0"
  ) {
    fail("execution packet does not contain the canonical supervisor root job");
  }
  if (
    !compiled.request.metadata ||
    typeof compiled.request.metadata !== "object" ||
    Array.isArray(compiled.request.metadata) ||
    compiled.request.metadata.localOnly !== true
  ) {
    fail("two-stage supervisor workflow must declare metadata.localOnly=true");
  }
  if (compiled.request.policy.maximumActiveChildren !== 1) {
    fail(
      "two-stage local supervisor workflow must keep maximumActiveChildren=1",
    );
  }
  if (!compiled.request.tasks.length) {
    fail("two-stage supervisor workflow contains no tasks");
  }
  for (const task of compiled.request.tasks) {
    if (!ALLOWED_TASK_KINDS.has(task.kind)) {
      fail(
        "two-stage local supervisor workflow contains unsupported task kind " +
          task.kind,
      );
    }
    assertProviderTask(task);
    if (containsForbiddenExecutableField(task.payloadTemplate)) {
      fail(
        "two-stage supervisor task " +
          task.id +
          " contains a caller-selected executable or command field",
      );
    }
  }
  if (
    !compiled.request.tasks.some(
      (task) => task.kind === "sprite.family.verify",
    )
  ) {
    fail("two-stage supervisor workflow must include family verification");
  }
  return compiled;
}

async function verifyInitialArtifacts(workflow, artifacts) {
  for (const artifactId of workflow.rootJob.inputArtifacts) {
    const verification = await artifacts.verify(artifactId);
    if (
      !verification.exists ||
      !verification.descriptorValid ||
      !verification.contentValid
    ) {
      fail(
        "initial workflow artifact failed immutable verification: " +
          artifactId,
      );
    }
  }
}

async function supervisorState(workflow, artifacts) {
  const namespace =
    "sprite-supervisor/" + workflow.request.spritePlan.project.projectId;
  const reference = await artifacts.resolveReference(
    namespace,
    workflow.runId,
  );
  if (!reference) return null;
  const verification = await artifacts.verify(reference.artifactId);
  if (
    !verification.exists ||
    !verification.descriptorValid ||
    !verification.contentValid
  ) {
    fail("supervisor state reference failed immutable verification");
  }
  const descriptor = await artifacts.get(reference.artifactId);
  if (
    !descriptor ||
    descriptor.mediaType !== "application/json" ||
    descriptor.labels.artifactRole !== "sprite-supervisor-state" ||
    descriptor.labels.runId !== workflow.runId ||
    descriptor.labels.workflowSha256 !== workflow.workflowSha256
  ) {
    fail("supervisor state reference resolves to incompatible state");
  }
  let state;
  try {
    state = JSON.parse(
      (await artifacts.read(reference.artifactId)).toString("utf8"),
    );
  } catch {
    fail("supervisor state artifact is invalid JSON");
  }
  const body = record(state, "supervisor state");
  if (
    body.runId !== workflow.runId ||
    body.workflowSha256 !== workflow.workflowSha256 ||
    body.spritePlanId !== workflow.request.spritePlan.planId ||
    typeof body.status !== "string" ||
    typeof body.tick !== "number"
  ) {
    fail("supervisor state body does not match compiled workflow identity");
  }
  return { reference, state: body };
}

function appendBounded(current, chunk) {
  const combined = Buffer.concat([current, chunk]);
  return combined.length <= MAX_CAPTURE_BYTES
    ? combined
    : combined.subarray(combined.length - MAX_CAPTURE_BYTES);
}

async function runWorkerCycle(environment) {
  const workerEntry = path.join(
    ROOT,
    "apps",
    "worker",
    "dist",
    "index.js",
  );
  await access(workerEntry);
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerEntry, "until-idle"], {
      cwd: ROOT,
      env: environment,
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    child.stdout.on("data", (chunk) => {
      stdout = appendBounded(stdout, Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendBounded(stderr, Buffer.from(chunk));
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve({
          stdout: stdout.toString("utf8"),
          stderr: stderr.toString("utf8"),
        });
        return;
      }
      reject(
        new Error(
          "Art Studio worker until-idle exited " +
            String(code) +
            ": " +
            stderr.toString("utf8").trim().slice(-4000),
        ),
      );
    });
  });
}

async function receipt(workflow, rootJob, stateRecord, artifacts) {
  const state = stateRecord.state;
  const releaseEvidenceArtifactId =
    typeof state.releaseEvidenceArtifactId === "string"
      ? state.releaseEvidenceArtifactId
      : null;
  let releaseEvidence = null;
  if (releaseEvidenceArtifactId) {
    const verification = await artifacts.verify(
      releaseEvidenceArtifactId,
    );
    if (
      !verification.exists ||
      !verification.descriptorValid ||
      !verification.contentValid
    ) {
      fail("supervisor release evidence failed immutable verification");
    }
    releaseEvidence = JSON.parse(
      (await artifacts.read(releaseEvidenceArtifactId)).toString("utf8"),
    );
  }
  return {
    schemaVersion: 1,
    kind: RECEIPT_KIND,
    ok: state.status === "succeeded",
    terminalStatus: state.status,
    runId: workflow.runId,
    requestSha256: workflow.requestSha256,
    workflowSha256: workflow.workflowSha256,
    spritePlanId: workflow.request.spritePlan.planId,
    spritePlanSha256: workflow.request.spritePlan.planSha256,
    rootRuntimeJobId: rootJob.id,
    stateTick: state.tick,
    stateArtifactId: stateRecord.reference.artifactId,
    releaseEvidenceArtifactId,
    releaseEvidence,
    requiredReleaseArtifactRoles:
      workflow.request.policy.requiredReleaseArtifactRoles,
    artifactBindings: state.artifactBindings,
    sharedGpuLeaseAttested: true,
    localOnly: true,
    cloudFallbackAllowed: false,
    networkDownloadAuthorityGranted: false,
  };
}

async function main() {
  assertLeaseEnvironment();
  if (
    !process.env.EVAVO_ART_DRAWTHINGS_CATALOG ||
    !process.env.EVAVO_ART_DRAWTHINGS_COMFYUI_BASE_URL
  ) {
    fail(
      "Draw Things catalog and bridge environment are required for two-stage execution",
    );
  }
  if (
    process.env.EVAVO_ART_DRAWTHINGS_COMFYUI_ALLOW_REMOTE !== "false"
  ) {
    fail("Draw Things remote ComfyUI authority must remain disabled");
  }

  const packetPath = parseArgs(process.argv.slice(2));
  const packet = await loadPacket(packetPath);
  const workflow = validateWorkflow(packet.workflow);
  const runtime = new LocalRuntimeRepository({ root: runtimeRoot() });
  const artifacts = new LocalArtifactStore({ root: artifactRoot() });
  await verifyInitialArtifacts(workflow, artifacts);

  const rootJob = await runtime.submit(
    workflow.rootJob,
    "local-two-stage-animation",
  );

  const maximumRuntimeMs = boundedInteger(
    process.env.EVAVO_ART_SUPERVISOR_MAX_RUNTIME_MS,
    2 * 60 * 60 * 1000,
    60_000,
    6 * 60 * 60 * 1000,
    "EVAVO_ART_SUPERVISOR_MAX_RUNTIME_MS",
  );
  const deadline = Date.now() + maximumRuntimeMs;
  const environment = {
    ...process.env,
    EVAVO_ART_RUNTIME_ROOT: runtimeRoot(),
    EVAVO_ART_ARTIFACT_ROOT: artifactRoot(),
    EVAVO_ART_WORKER_CONCURRENCY: "1",
    EVAVO_ART_WORKER_QUEUES: [
      "control",
      "provider",
      "media",
      "selection",
    ].join(path.delimiter),
    EVAVO_ART_WORKER_ID:
      "two-stage-animation:" + String(process.pid),
    HF_HUB_OFFLINE: "1",
    TRANSFORMERS_OFFLINE: "1",
    DIFFUSERS_OFFLINE: "1",
    HF_HUB_DISABLE_TELEMETRY: "1",
    NO_PROXY: "127.0.0.1,localhost,::1",
    no_proxy: "127.0.0.1,localhost,::1",
  };
  delete environment.OPENAI_API_KEY;
  delete environment.OPENAI_ORG_ID;
  delete environment.OPENAI_PROJECT_ID;

  let cycles = 0;
  while (Date.now() < deadline) {
    cycles += 1;
    await runWorkerCycle(environment);
    const current = await supervisorState(workflow, artifacts);
    if (current && TERMINAL.has(String(current.state.status))) {
      const result = await receipt(
        workflow,
        rootJob,
        current,
        artifacts,
      );
      result.workerCycles = cycles;
      process.stdout.write(JSON.stringify(result) + "\n");
      process.exitCode = current.state.status === "succeeded" ? 0 : 2;
      return;
    }

    const root = await runtime.get(rootJob.id);
    if (
      !current &&
      root &&
      new Set([
        "failed",
        "cancelled",
        "blocked",
        "dead-letter",
      ]).has(root.state)
    ) {
      fail(
        "supervisor root terminated before durable state was created: " +
          root.state +
          " " +
          (root.failure?.code || ""),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  fail(
    "two-stage animation supervisor exceeded EVAVO_ART_SUPERVISOR_MAX_RUNTIME_MS",
  );
}

main().catch((error) => {
  process.stderr.write(
    JSON.stringify({
      schemaVersion: 1,
      kind: RECEIPT_KIND,
      ok: false,
      error:
        error instanceof Error ? error.message : String(error),
      sharedGpuLeaseAttested:
        process.env.EVAVO_CREATIVE_GPU_LEASE_HELD === "true",
      localOnly: true,
      cloudFallbackAllowed: false,
      networkDownloadAuthorityGranted: false,
    }) + "\n",
  );
  process.exitCode = 2;
});
