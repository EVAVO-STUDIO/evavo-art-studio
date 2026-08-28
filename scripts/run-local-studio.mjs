#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import readline from "node:readline";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { runCommand } from "./local-quality-gate.mjs";

export const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const STACK_RELATIVE_ROOT = ".art-studio/local-stack";
export const STACK_LOCK_RELATIVE_PATH = `${STACK_RELATIVE_ROOT}/stack.lock.json`;
export const DEFAULT_STACK_SERVICES = Object.freeze(["web", "api", "worker"]);
export const DEFAULT_STARTUP_TIMEOUT_MS = 90_000;
export const DEFAULT_BUILD_TIMEOUT_MS = 30 * 60 * 1_000;
export const DEFAULT_LOG_LIMIT_BYTES = 8 * 1024 * 1024;
export const DEFAULT_HTTP_BODY_LIMIT_BYTES = 2 * 1024 * 1024;

const SERVICE_DEFINITIONS = Object.freeze({
  web: Object.freeze({
    id: "web",
    packageName: "@evavo/art-studio-web",
    command: Object.freeze([
      "pnpm",
      "--filter",
      "@evavo/art-studio-web",
      "dev",
    ]),
    readiness: Object.freeze({
      type: "web-health",
      url: "http://127.0.0.1:4200/",
      port: 4200,
      bodyMarker: "EVAVO Art Studio",
    }),
  }),
  api: Object.freeze({
    id: "api",
    packageName: "@evavo/art-studio-api",
    command: Object.freeze([
      "pnpm",
      "--filter",
      "@evavo/art-studio-api",
      "dev",
    ]),
    readiness: Object.freeze({
      type: "api-health",
      url: "http://127.0.0.1:4100/health",
      port: 4100,
    }),
  }),
  worker: Object.freeze({
    id: "worker",
    packageName: "@evavo/art-studio-worker",
    command: Object.freeze([
      process.execPath,
      "scripts/run-local-worker.mjs",
      "daemon",
    ]),
    readiness: Object.freeze({ type: "worker-output" }),
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
    fail(
      "LOCAL_STACK_INTEGER_INVALID",
      `${label} must be an integer from ${minimum} to ${maximum}.`,
    );
  }
  return parsed;
}

function safePath(root, relativePath) {
  const candidate = path.resolve(root, relativePath);
  const relation = path.relative(path.resolve(root), candidate);
  if (relation.startsWith("..") || path.isAbsolute(relation)) {
    fail(
      "LOCAL_STACK_PATH_ESCAPED",
      `${relativePath} escaped the repository root.`,
    );
  }
  return candidate;
}

function assertOrdinaryDirectory(file, label) {
  if (!fs.existsSync(file)) return;
  const state = fs.lstatSync(file);
  if (state.isSymbolicLink() || !state.isDirectory()) {
    fail(
      "LOCAL_STACK_DIRECTORY_INVALID",
      `${label} must be an ordinary directory.`,
    );
  }
}

function ensureOrdinaryDirectory(file, label) {
  assertOrdinaryDirectory(file, label);
  fs.mkdirSync(file, { recursive: true, mode: 0o700 });
  assertOrdinaryDirectory(file, label);
}

function ensureStateRoot(root) {
  const artStudioRoot = safePath(root, ".art-studio");
  const stackRoot = safePath(root, STACK_RELATIVE_ROOT);
  const sessionsRoot = safePath(root, `${STACK_RELATIVE_ROOT}/sessions`);
  ensureOrdinaryDirectory(artStudioRoot, ".art-studio");
  ensureOrdinaryDirectory(stackRoot, STACK_RELATIVE_ROOT);
  ensureOrdinaryDirectory(sessionsRoot, `${STACK_RELATIVE_ROOT}/sessions`);
  return stackRoot;
}

export function parseServiceSelection(value) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_STACK_SERVICES;
  }
  if (typeof value !== "string" || value.includes("\0")) {
    fail(
      "LOCAL_STACK_SERVICES_INVALID",
      "services must be a comma-separated safe string.",
    );
  }
  const services = value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (!services.length) {
    fail("LOCAL_STACK_SERVICES_EMPTY", "at least one local service is required.");
  }
  const unique = [...new Set(services)];
  if (unique.length !== services.length) {
    fail(
      "LOCAL_STACK_SERVICES_DUPLICATE",
      "services may not contain duplicates.",
    );
  }
  for (const service of unique) {
    if (!Object.hasOwn(SERVICE_DEFINITIONS, service)) {
      fail(
        "LOCAL_STACK_SERVICE_UNSUPPORTED",
        `unsupported local service ${service}; expected web, api or worker.`,
      );
    }
  }
  return Object.freeze(
    unique.sort(
      (left, right) =>
        DEFAULT_STACK_SERVICES.indexOf(left) -
        DEFAULT_STACK_SERVICES.indexOf(right),
    ),
  );
}

function stackCommand(label, ...commandLine) {
  return Object.freeze({
    label,
    executable: commandLine[0],
    args: Object.freeze(commandLine.slice(1)),
  });
}

export function buildStackPlan(options = {}) {
  const services = parseServiceSelection(options.services);
  const build = options.build !== false;
  const buildCommands = [];
  if (build) {
    buildCommands.push(
      stackCommand(
        "Build shared Art Studio domain packages once",
        "pnpm",
        "run",
        "build:domain",
      ),
    );
    if (services.includes("api")) {
      buildCommands.push(
        stackCommand(
          "Build local Art Studio API",
          "pnpm",
          "--filter",
          "@evavo/art-studio-api",
          "build",
        ),
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
    schema: "evavo.art-studio.local-stack-plan.v2",
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

function parseLinuxStartIdentity(content) {
  const closing = content.lastIndexOf(")");
  if (closing < 0) return null;
  const fields = content.slice(closing + 1).trim().split(/\s+/u);
  // /proc/<pid>/stat field 22 is index 19 after removing fields 1 and 2.
  const startTicks = fields[19];
  return /^\d+$/u.test(startTicks ?? "")
    ? `linux-start-ticks:${startTicks}`
    : null;
}

export function processIdentity(pid, options = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  const platform = options.platform ?? process.platform;
  const run = options.spawnSync ?? spawnSync;

  if (platform === "win32") {
    const script = [
      "$ErrorActionPreference = 'Stop'",
      "$process = Get-Process -Id ([int]$env:EVAVO_ART_STACK_PID)",
      "[Console]::Out.Write($process.StartTime.ToUniversalTime().Ticks)",
    ].join("; ");
    const result = run(
      options.powershellExecutable ?? "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ],
      {
        encoding: "utf8",
        shell: false,
        windowsHide: true,
        timeout: 10_000,
        env: {
          ...process.env,
          ...(options.environment ?? {}),
          EVAVO_ART_STACK_PID: String(pid),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const ticks = (result.stdout ?? "").trim();
    return !result.error && result.status === 0 && /^\d+$/u.test(ticks)
      ? `win-start-ticks:${ticks}`
      : null;
  }

  const procFile = `/proc/${pid}/stat`;
  try {
    if (fs.existsSync(procFile)) {
      return parseLinuxStartIdentity(fs.readFileSync(procFile, "utf8"));
    }
  } catch {
    // Fall through to the portable ps probe.
  }

  const result = run("ps", ["-o", "lstart=", "-p", String(pid)], {
    encoding: "utf8",
    shell: false,
    timeout: 10_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const started = (result.stdout ?? "").trim().replace(/\s+/gu, " ");
  return !result.error && result.status === 0 && started
    ? `ps-start:${started}`
    : null;
}

function readLock(file) {
  if (!fs.existsSync(file)) return undefined;
  const state = fs.lstatSync(file);
  if (state.isSymbolicLink() || !state.isFile()) {
    fail(
      "LOCAL_STACK_LOCK_INVALID",
      "local stack lock must be an ordinary file.",
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(
      "LOCAL_STACK_LOCK_JSON_INVALID",
      "local stack lock is not valid JSON.",
      { cause: error },
    );
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    !Number.isInteger(parsed.pid) ||
    typeof parsed.runId !== "string" ||
    !parsed.runId ||
    (parsed.ownerIdentity !== undefined &&
      (typeof parsed.ownerIdentity !== "string" || !parsed.ownerIdentity))
  ) {
    fail(
      "LOCAL_STACK_LOCK_SHAPE_INVALID",
      "local stack lock has an invalid shape.",
    );
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
  const temporary = path.join(
    directory,
    `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`,
  );
  writeFileExclusive(temporary, value);
  try {
    if (process.platform === "win32" && fs.existsSync(file)) {
      fs.rmSync(file, { force: true });
    }
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
  }
}

export function inspectStackLock(root = REPOSITORY_ROOT) {
  const file = safePath(root, STACK_LOCK_RELATIVE_PATH);
  const lock = readLock(file);
  if (!lock) {
    return Object.freeze({
      exists: false,
      active: false,
      stale: false,
      identityVerified: false,
      identityMatches: false,
      lock: null,
    });
  }
  const alive = processAlive(lock.pid);
  const observedIdentity = alive ? processIdentity(lock.pid) : null;
  const hasBoundIdentity =
    typeof lock.ownerIdentity === "string" && lock.ownerIdentity.length > 0;
  const identityVerified = hasBoundIdentity && observedIdentity !== null;
  // When process identity cannot be inspected, fail closed and keep an alive PID
  // active. A proven mismatch is the only safe automatic PID-reuse recovery.
  const identityMatches = hasBoundIdentity
    ? observedIdentity === null || observedIdentity === lock.ownerIdentity
    : alive;
  const active = alive && identityMatches;
  return Object.freeze({
    exists: true,
    active,
    stale: !active,
    identityVerified,
    identityMatches,
    observedIdentity,
    lock: Object.freeze(lock),
  });
}

export function acquireStackLock(
  root = REPOSITORY_ROOT,
  services = DEFAULT_STACK_SERVICES,
) {
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

  const ownerIdentity = processIdentity(process.pid);
  if (!ownerIdentity) {
    fail(
      "LOCAL_STACK_PROCESS_IDENTITY_UNAVAILABLE",
      "the supervisor could not bind its lock to the current process start identity.",
    );
  }
  const lock = Object.freeze({
    schema: "evavo.art-studio.local-stack-lock.v2",
    runId: randomUUID(),
    pid: process.pid,
    ownerIdentity,
    startedAt: new Date().toISOString(),
    services: [...services],
    children: {},
  });
  try {
    writeFileExclusive(file, lock);
  } catch (error) {
    if (error?.code === "EEXIST") {
      fail(
        "LOCAL_STACK_ALREADY_RUNNING",
        "another supervisor acquired the local stack lock concurrently.",
        { cause: error },
      );
    }
    throw error;
  }
  return lock;
}

function lockOwnedByCurrentProcess(current, lock) {
  return (
    current &&
    current.runId === lock.runId &&
    current.pid === process.pid &&
    current.ownerIdentity === lock.ownerIdentity &&
    processIdentity(process.pid) === lock.ownerIdentity
  );
}

function updateStackLock(root, lock, children) {
  const file = safePath(root, STACK_LOCK_RELATIVE_PATH);
  const current = readLock(file);
  if (!lockOwnedByCurrentProcess(current, lock)) {
    fail(
      "LOCAL_STACK_LOCK_OWNERSHIP_LOST",
      "local stack lock ownership changed during startup.",
    );
  }
  replaceFileAtomic(file, {
    ...current,
    updatedAt: new Date().toISOString(),
    children,
  });
}

export function releaseStackLock(root, runId) {
  const file = safePath(root, STACK_LOCK_RELATIVE_PATH);
  if (!fs.existsSync(file)) return false;
  const current = readLock(file);
  const identity = processIdentity(process.pid);
  if (
    current.runId !== runId ||
    current.pid !== process.pid ||
    (current.ownerIdentity && current.ownerIdentity !== identity)
  ) {
    return false;
  }
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
    // An indeterminate loopback probe is not safe evidence that the port is free.
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once("connect", () => finish(false));
    socket.once("error", (error) => {
      finish(error?.code === "ECONNREFUSED" || error?.code === "EADDRNOTAVAIL");
    });
  });
}

function createBoundedLog(file, maximumBytes) {
  ensureOrdinaryDirectory(path.dirname(file), path.dirname(file));
  const descriptor = fs.openSync(file, "wx", 0o600);
  let written = 0;
  let truncated = false;
  return Object.freeze({
    write(line) {
      if (truncated) return;
      const bytes = Buffer.from(`${line}\n`, "utf8");
      if (written + bytes.length > maximumBytes) {
        const marker = Buffer.from(
          "[evavo local stack] log limit reached; additional output omitted\n",
          "utf8",
        );
        if (written + marker.length <= maximumBytes) {
          fs.writeSync(descriptor, marker);
          written += marker.length;
        }
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
    spawnSync(
      "taskkill",
      ["/PID", String(child.pid), "/T", "/F"],
      {
        shell: false,
        stdio: "ignore",
        timeout: 10_000,
        windowsHide: true,
      },
    );
    return;
  }
  const signal = force ? "SIGKILL" : "SIGTERM";
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // The child has already exited.
    }
  }
}

function stripAnsi(value) {
  return value.replace(
    // eslint-disable-next-line no-control-regex
    /\u001B(?:[@-_][0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\))/gu,
    "",
  );
}

export function workerOutputMatches(line) {
  if (typeof line !== "string" || line.length > 1_000_000) return false;
  const clean = stripAnsi(line).trim();
  if (!clean.startsWith("{") || !clean.endsWith("}")) return false;
  try {
    const parsed = JSON.parse(clean);
    return (
      parsed?.service === "evavo-art-studio-worker" &&
      typeof parsed.workerId === "string" &&
      Number.isInteger(parsed.claimed) &&
      Number.isInteger(parsed.completed) &&
      Number.isInteger(parsed.failed)
    );
  } catch {
    return false;
  }
}

function lineStream(stream, service, level, log, onLine) {
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  lines.on("line", (line) => {
    log.write(`[${level}] ${line}`);
    process[level === "stderr" ? "stderr" : "stdout"].write(
      `[art-studio:${service}] ${line}\n`,
    );
    onLine(line);
  });
  return lines;
}

function spawnService(plan, options) {
  const [executable, ...args] = plan.command;
  const log = createBoundedLog(options.logFile, options.maximumLogBytes);
  let resolveReadyOutput;
  const readyOutput = new Promise((resolve) => {
    resolveReadyOutput = resolve;
  });
  let outputReady = false;
  const onLine = (line) => {
    if (
      !outputReady &&
      plan.readiness.type === "worker-output" &&
      workerOutputMatches(line)
    ) {
      outputReady = true;
      resolveReadyOutput(line);
    }
  };
  const child = spawn(executable, args, {
    cwd: options.root,
    env: {
      ...options.environment,
      EVAVO_ART_STACK_RUN_ID: options.runId,
      EVAVO_ART_STACK_SERVICE_ID: plan.id,
    },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
    windowsHide: true,
  });
  const stdout = lineStream(
    child.stdout,
    plan.id,
    "stdout",
    log,
    onLine,
  );
  const stderr = lineStream(
    child.stderr,
    plan.id,
    "stderr",
    log,
    onLine,
  );
  return Object.freeze({
    plan,
    child,
    log,
    stdout,
    stderr,
    readyOutput,
    get outputReady() {
      return outputReady;
    },
  });
}

async function wait(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readBoundedResponseText(
  response,
  maximumBytes = DEFAULT_HTTP_BODY_LIMIT_BYTES,
) {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(contentLength) &&
    contentLength > 0 &&
    contentLength > maximumBytes
  ) {
    throw new Error("readiness response exceeded the bounded body limit.");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) {
        throw new Error("readiness response exceeded the bounded body limit.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

export async function responseMatchesReadiness(response, readiness) {
  if (!(response instanceof Response) || response.status !== 200) return false;
  if (readiness.type === "api-health") {
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) return false;
    const body = await response.json();
    return body?.status === "ok" && body?.service === "evavo-art-studio-api";
  }
  if (readiness.type === "web-health") {
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) return false;
    if (
      typeof readiness.bodyMarker !== "string" ||
      !readiness.bodyMarker ||
      readiness.bodyMarker.length > 1_024
    ) {
      return false;
    }
    const body = await readBoundedResponseText(response);
    return body.includes(readiness.bodyMarker);
  }
  return false;
}

async function waitForHttp(record, readiness, deadline, fetchImplementation = fetch) {
  while (Date.now() < deadline) {
    if (record.child.exitCode !== null || record.child.signalCode !== null) {
      fail(
        "LOCAL_STACK_SERVICE_EXITED",
        `${record.plan.id} exited before becoming ready.`,
      );
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_000);
    timer.unref?.();
    try {
      const response = await fetchImplementation(readiness.url, {
        cache: "no-store",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "cache-control": "no-store",
          "x-evavo-art-stack-probe": "1",
        },
      });
      if (await responseMatchesReadiness(response, readiness)) return;
    } catch {
      // Retry until the bounded startup deadline.
    } finally {
      clearTimeout(timer);
    }
    await wait(250);
  }
  fail(
    "LOCAL_STACK_READINESS_TIMEOUT",
    `${record.plan.id} did not become ready before the startup deadline.`,
  );
}

async function waitForWorker(record, deadline) {
  while (Date.now() < deadline) {
    if (record.child.exitCode !== null || record.child.signalCode !== null) {
      fail(
        "LOCAL_STACK_SERVICE_EXITED",
        "worker exited before becoming ready.",
      );
    }
    if (record.outputReady) return;
    await Promise.race([record.readyOutput, wait(250)]);
  }
  fail(
    "LOCAL_STACK_READINESS_TIMEOUT",
    "worker emitted no structured Art Studio heartbeat before the startup deadline.",
  );
}

async function waitForReadiness(
  record,
  startupTimeoutMs,
  fetchImplementation = fetch,
) {
  const deadline = Date.now() + startupTimeoutMs;
  if (record.plan.readiness.type === "worker-output") {
    return await waitForWorker(record, deadline);
  }
  return await waitForHttp(
    record,
    record.plan.readiness,
    deadline,
    fetchImplementation,
  );
}

async function stopRecords(records) {
  for (const record of records) terminateProcessTree(record.child, false);
  const deadline = Date.now() + 10_000;
  while (
    records.some(
      (record) =>
        record.child.exitCode === null && record.child.signalCode === null,
    ) &&
    Date.now() < deadline
  ) {
    await wait(100);
  }
  for (const record of records) {
    if (
      record.child.exitCode === null &&
      record.child.signalCode === null
    ) {
      terminateProcessTree(record.child, true);
    }
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

  const acquire = options.acquireStackLock ?? acquireStackLock;
  const checkPort = options.portAvailable ?? portAvailable;
  const execute = options.runCommand ?? runCommand;
  const launch = options.spawnService ?? spawnService;
  const awaitReady = options.waitForReadiness ?? waitForReadiness;
  const stop = options.stopRecords ?? stopRecords;

  const lock = acquire(root, plan.services);
  const sessionRoot = safePath(
    root,
    `${STACK_RELATIVE_ROOT}/sessions/${lock.runId}`,
  );
  ensureOrdinaryDirectory(
    sessionRoot,
    `${STACK_RELATIVE_ROOT}/sessions/${lock.runId}`,
  );
  const records = [];
  let stopping = false;
  try {
    for (const servicePlan of plan.servicePlans) {
      const port = servicePlan.readiness.port;
      if (port && !(await checkPort("127.0.0.1", port))) {
        fail(
          "LOCAL_STACK_PORT_OCCUPIED",
          `${servicePlan.id} cannot start because 127.0.0.1:${port} is already in use or could not be proven free.`,
        );
      }
    }

    for (const buildCommand of plan.buildCommands) {
      process.stdout.write(
        `\n[art-studio local stack] ${buildCommand.label}\n`,
      );
      await execute(buildCommand, {
        root,
        timeoutMs: buildTimeoutMs,
        environment,
      });
    }

    for (const servicePlan of plan.servicePlans) {
      const record = launch(servicePlan, {
        root,
        environment,
        runId: lock.runId,
        maximumLogBytes,
        logFile: path.join(sessionRoot, `${servicePlan.id}.log`),
      });
      records.push(record);
      record.child.once("error", (error) => {
        if (!stopping) {
          process.stderr.write(
            `[art-studio:${servicePlan.id}] spawn error: ${error.message}\n`,
          );
        }
      });
    }
    updateStackLock(
      root,
      lock,
      Object.fromEntries(
        records.map((record) => [record.plan.id, record.child.pid]),
      ),
    );
    await Promise.all(
      records.map((record) =>
        awaitReady(record, startupTimeoutMs, options.fetch ?? fetch),
      ),
    );

    for (const record of records) {
      if (
        record.child.exitCode !== null ||
        record.child.signalCode !== null
      ) {
        fail(
          "LOCAL_STACK_SERVICE_EXITED",
          `${record.plan.id} exited immediately after readiness.`,
        );
      }
    }

    process.stdout.write(
      `${JSON.stringify({
        schema: "evavo.art-studio.local-stack-ready.v2",
        runId: lock.runId,
        services: plan.services,
        sessionRoot: path
          .relative(root, sessionRoot)
          .replaceAll(path.sep, "/"),
        githubActionsRequired: false,
        vercelRequired: false,
      })}\n`,
    );

    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback) => {
        if (settled) return;
        settled = true;
        options.signal?.removeEventListener("abort", onAbort);
        callback();
      };
      const onAbort = () => finish(resolve);
      options.signal?.addEventListener("abort", onAbort, { once: true });

      for (const record of records) {
        record.child.once("exit", (code, signal) => {
          if (stopping || options.signal?.aborted) return;
          finish(() =>
            reject(
              Object.assign(
                new Error(
                  `${record.plan.id} exited unexpectedly with code ${
                    code ?? "unknown"
                  }${signal ? ` (${signal})` : ""}.`,
                ),
                { code: "LOCAL_STACK_SERVICE_EXITED" },
              ),
            ),
          );
        });
      }

      const exited = records.find(
        (record) =>
          record.child.exitCode !== null ||
          record.child.signalCode !== null,
      );
      if (exited) {
        finish(() =>
          reject(
            Object.assign(
              new Error(`${exited.plan.id} exited before supervision attached.`),
              { code: "LOCAL_STACK_SERVICE_EXITED" },
            ),
          ),
        );
      } else if (options.signal?.aborted) {
        finish(resolve);
      }
    });
  } finally {
    stopping = true;
    await stop(records);
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
      if (services === undefined) {
        fail(
          "LOCAL_STACK_ARGUMENT_INVALID",
          "--services requires a comma-separated value.",
        );
      }
      index += 1;
    } else if (argument.startsWith("--services=")) {
      services = argument.slice("--services=".length);
    } else {
      fail(
        "LOCAL_STACK_ARGUMENT_UNSUPPORTED",
        `unsupported argument ${argument}.`,
      );
    }
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
    await runLocalStack(plan, {
      root: REPOSITORY_ROOT,
      signal: controller.signal,
    });
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
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
