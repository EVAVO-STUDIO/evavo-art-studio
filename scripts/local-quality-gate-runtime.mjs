import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

import {
  DEFAULT_COMMAND_TIMEOUT_MS,
  LocalQualityGateError,
  RECEIPT_RELATIVE_ROOT,
  REPOSITORY_ROOT,
  assertCommandSafe,
  buildPlan as buildLibraryPlan,
  canonicalProfile,
  parsePrePushUpdates,
  planFingerprint,
  planForChanges,
  serialisablePlan,
  timeoutFromEnvironment,
} from "./local-quality-gate-library.mjs";

const ZERO_SHA = /^0{40}$/u;
const SHA = /^[0-9a-f]{40}$/u;
const RUNTIME_TEST_PATH = "scripts/test-local-quality-gate-runtime.mjs";

export const RUNTIME_CONTRACT_COMMAND = Object.freeze({
  label: "Validate local quality-gate runtime",
  executable: process.execPath,
  args: Object.freeze(["--test", RUNTIME_TEST_PATH]),
});

function fail(code, message, options = {}) {
  throw new LocalQualityGateError(code, message, options);
}

function normaliseRoot(root) {
  if (typeof root !== "string" || !root || root.includes("\0")) {
    fail("LOCAL_GATE_ROOT_INVALID", "repository root must be a safe path.");
  }
  return path.resolve(root);
}

function safePath(root, relativePath) {
  const absoluteRoot = normaliseRoot(root);
  const candidate = path.resolve(absoluteRoot, relativePath);
  const relation = path.relative(absoluteRoot, candidate);
  if (relation.startsWith("..") || path.isAbsolute(relation)) {
    fail(
      "LOCAL_GATE_PATH_ESCAPED",
      `${relativePath} escaped the repository root.`,
    );
  }
  return candidate;
}

function ensureOrdinaryDirectory(file, label) {
  if (fs.existsSync(file)) {
    const state = fs.lstatSync(file);
    if (state.isSymbolicLink() || !state.isDirectory()) {
      fail(
        "LOCAL_GATE_RECEIPT_DIRECTORY_INVALID",
        `${label} must be an ordinary directory.`,
      );
    }
    return;
  }
  fs.mkdirSync(file, { recursive: true, mode: 0o700 });
  const state = fs.lstatSync(file);
  if (state.isSymbolicLink() || !state.isDirectory()) {
    fail(
      "LOCAL_GATE_RECEIPT_DIRECTORY_INVALID",
      `${label} must be an ordinary directory.`,
    );
  }
}

function safeGit(args, options = {}) {
  const result = (options.spawnSync ?? spawnSync)("git", args, {
    cwd: options.root ?? REPOSITORY_ROOT,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: options.timeoutMs ?? 30_000,
    stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    env: options.environment ?? process.env,
  });
  if (result.error) {
    if (options.optional) return undefined;
    fail(
      "LOCAL_GATE_GIT_EXECUTION_FAILED",
      `git ${args.join(" ")} failed.`,
      { cause: result.error },
    );
  }
  if (result.status !== 0) {
    if (options.optional) return undefined;
    fail(
      "LOCAL_GATE_GIT_COMMAND_FAILED",
      `git ${args.join(" ")} failed: ${(result.stderr ?? "").trim()}`,
    );
  }
  return (result.stdout ?? "").trim();
}

function headSha(root = REPOSITORY_ROOT, options = {}) {
  const value = safeGit(["rev-parse", "HEAD"], {
    root,
    optional: true,
    ...options,
  });
  return value && SHA.test(value) ? value : null;
}

export function safeWorktreeSnapshot(root = REPOSITORY_ROOT, options = {}) {
  const status = safeGit(
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { root, ...options },
  );
  return Object.freeze({
    status,
    clean: status.length === 0,
    sha256: createHash("sha256").update(status, "utf8").digest("hex"),
  });
}

function baseForNewRef(localSha, root, options = {}) {
  const mergeBase = safeGit(
    ["merge-base", localSha, "refs/remotes/origin/main"],
    { root, optional: true, ...options },
  );
  if (mergeBase && SHA.test(mergeBase)) return mergeBase;
  const roots = safeGit(["rev-list", "--max-parents=0", localSha], {
    root,
    ...options,
  });
  const first = roots.split(/\r?\n/u).find((entry) => SHA.test(entry));
  if (!first) {
    fail(
      "LOCAL_GATE_BASE_UNAVAILABLE",
      `could not determine a base commit for ${localSha}`,
    );
  }
  return first;
}

function filesForUpdates(updates, root = REPOSITORY_ROOT, options = {}) {
  const files = new Set();
  for (const update of updates) {
    if (ZERO_SHA.test(update.localSha)) continue;
    const base = ZERO_SHA.test(update.remoteSha)
      ? baseForNewRef(update.localSha, root, options)
      : update.remoteSha;
    const output = safeGit(
      ["diff", "--name-only", "--diff-filter=ACMRD", `${base}..${update.localSha}`],
      { root, ...options },
    );
    for (const file of output.split(/\r?\n/u).filter(Boolean)) files.add(file);
  }
  return [...files].sort((left, right) => left.localeCompare(right));
}

function changedFilesFromWorkingTree(root = REPOSITORY_ROOT, options = {}) {
  const files = new Set();
  const upstream = safeGit(["rev-parse", "--verify", "@{upstream}"], {
    root,
    optional: true,
    ...options,
  });
  const range = upstream && SHA.test(upstream)
    ? `${upstream}...HEAD`
    : "HEAD^..HEAD";
  for (const args of [
    ["diff", "--name-only", "--diff-filter=ACMRD", range],
    ["diff", "--name-only", "--diff-filter=ACMRD"],
    ["diff", "--cached", "--name-only", "--diff-filter=ACMRD"],
    ["ls-files", "--others", "--exclude-standard"],
  ]) {
    const output = safeGit(args, { root, optional: true, ...options });
    if (output === undefined) continue;
    for (const file of output.split(/\r?\n/u).filter(Boolean)) files.add(file);
  }
  return [...files].sort((left, right) => left.localeCompare(right));
}

export function buildRuntimePlan(requestedProfile, options = {}) {
  const profile = canonicalProfile(requestedProfile);
  const root = options.root ?? REPOSITORY_ROOT;
  if (profile !== "changed" && profile !== "push") {
    return buildLibraryPlan(requestedProfile, options);
  }

  if (profile === "changed") {
    const plan = planForChanges(
      options.files ?? changedFilesFromWorkingTree(root, options),
      options,
    );
    return Object.freeze({ ...plan, requestedProfile });
  }

  const updates = options.updates ?? [];
  if (
    updates.some(
      (entry) =>
        entry.remoteRef === "refs/heads/main" &&
        !ZERO_SHA.test(entry.localSha),
    )
  ) {
    const releasePlan = buildLibraryPlan("release", options);
    return Object.freeze({ ...releasePlan, requestedProfile });
  }
  const plan = planForChanges(
    updates.length
      ? filesForUpdates(updates, root, options)
      : options.files ?? changedFilesFromWorkingTree(root, options),
    options,
  );
  return Object.freeze({ ...plan, requestedProfile });
}

function terminateProcessTree(child, options = {}, force = false) {
  if (!child?.pid) return;
  const platform = options.platform ?? process.platform;
  if (platform === "win32") {
    (options.spawnSync ?? spawnSync)(
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

export async function runCommand(entry, options = {}) {
  assertCommandSafe(entry);
  const root = options.root ?? REPOSITORY_ROOT;
  const timeoutMs = options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1_000 ||
    timeoutMs > 4 * 60 * 60 * 1_000
  ) {
    fail(
      "LOCAL_GATE_TIMEOUT_INVALID",
      "command timeout must be an integer from 1000 to 14400000.",
    );
  }

  const started = Date.now();
  const child = (options.spawn ?? spawn)(entry.executable, entry.args, {
    cwd: root,
    env: options.environment ?? process.env,
    shell: false,
    stdio: options.stdio ?? "inherit",
    detached: (options.platform ?? process.platform) !== "win32",
    windowsHide: true,
  });

  return await new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let aborted = false;
    let forceTimer;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(forceTimer);
      options.signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => {
      aborted = true;
      terminateProcessTree(child, options, false);
      forceTimer ??= setTimeout(
        () => terminateProcessTree(child, options, true),
        5_000,
      );
      forceTimer.unref?.();
    };
    if (options.signal?.aborted) onAbort();
    else options.signal?.addEventListener("abort", onAbort, { once: true });

    const timer = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child, options, false);
      forceTimer ??= setTimeout(
        () => terminateProcessTree(child, options, true),
        5_000,
      );
      forceTimer.unref?.();
    }, timeoutMs);
    timer.unref?.();

    child.once("error", (error) => {
      finish(() =>
        reject(
          new LocalQualityGateError(
            "LOCAL_GATE_COMMAND_SPAWN_FAILED",
            `${entry.label} could not start: ${error.message}`,
            { cause: error },
          ),
        ),
      );
    });
    child.once("exit", (code, signal) => {
      const result = Object.freeze({
        label: entry.label,
        command: Object.freeze([entry.executable, ...entry.args]),
        status: timedOut
          ? "timed-out"
          : aborted
            ? "cancelled"
            : code === 0
              ? "passed"
              : "failed",
        exitCode: code,
        signal,
        durationMs: Date.now() - started,
      });
      finish(() => {
        if (timedOut) {
          const error = new LocalQualityGateError(
            "LOCAL_GATE_COMMAND_TIMEOUT",
            `${entry.label} exceeded the ${timeoutMs} ms command timeout.`,
          );
          error.result = result;
          reject(error);
        } else if (aborted) {
          const error = new LocalQualityGateError(
            "LOCAL_GATE_CANCELLED",
            `${entry.label} was cancelled.`,
          );
          error.result = result;
          reject(error);
        } else if (code !== 0) {
          const error = new LocalQualityGateError(
            "LOCAL_GATE_COMMAND_FAILED",
            `${entry.label} failed with exit code ${code ?? "unknown"}${
              signal ? ` (${signal})` : ""
            }.`,
          );
          error.result = result;
          reject(error);
        } else {
          resolve(result);
        }
      });
    });
  });
}

function safeTimestamp(value) {
  return value.replace(/[:.]/gu, "-");
}

function writeExclusive(file, bytes) {
  const descriptor = fs.openSync(file, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function replaceAtomic(file, bytes) {
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`,
  );
  writeExclusive(temporary, bytes);
  try {
    if (process.platform === "win32" && fs.existsSync(file)) {
      fs.rmSync(file, { force: true });
    }
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
  }
}

export function writeRuntimeReceipt(receipt, options = {}) {
  const root = options.root ?? REPOSITORY_ROOT;
  const artStudioRoot = safePath(root, ".art-studio");
  const receiptRoot = safePath(root, RECEIPT_RELATIVE_ROOT);
  ensureOrdinaryDirectory(artStudioRoot, ".art-studio");
  ensureOrdinaryDirectory(receiptRoot, RECEIPT_RELATIVE_ROOT);

  const endedAt =
    typeof receipt.endedAt === "string"
      ? receipt.endedAt
      : new Date().toISOString();
  const head =
    typeof receipt.headSha === "string"
      ? receipt.headSha.slice(0, 12)
      : "no-head";
  const name = `${safeTimestamp(endedAt)}-${receipt.profile}-${head}-${receipt.runId}.json`;
  const bytes = `${JSON.stringify(receipt, null, 2)}\n`;
  const versionedPath = path.join(receiptRoot, name);
  const latestPath = path.join(receiptRoot, "latest.json");
  writeExclusive(versionedPath, bytes);
  replaceAtomic(latestPath, bytes);
  return Object.freeze({ versionedPath, latestPath });
}

function readLatestReceipt(root = REPOSITORY_ROOT) {
  const receiptRoot = safePath(root, RECEIPT_RELATIVE_ROOT);
  const file = path.join(receiptRoot, "latest.json");
  if (!fs.existsSync(file)) return undefined;
  const rootState = fs.lstatSync(receiptRoot);
  const fileState = fs.lstatSync(file);
  if (
    rootState.isSymbolicLink() ||
    !rootState.isDirectory() ||
    fileState.isSymbolicLink() ||
    !fileState.isFile()
  ) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

function cacheEligible(plan, environment) {
  return (
    environment.EVAVO_ART_LOCAL_GATE_CACHE === "1" &&
    plan.profile !== "release" &&
    plan.requestedProfile !== "push" &&
    plan.requestedProfile !== "prepush"
  );
}

function lockfileSha256(root) {
  const file = path.join(root, "pnpm-lock.yaml");
  return fs.existsSync(file)
    ? createHash("sha256").update(fs.readFileSync(file)).digest("hex")
    : null;
}

function errorShape(error) {
  return {
    code: error?.code ?? "LOCAL_GATE_UNEXPECTED_ERROR",
    message: error instanceof Error ? error.message : String(error),
    result: error?.result,
  };
}

export async function runLocalQualityGate(plan, options = {}) {
  const root = options.root ?? REPOSITORY_ROOT;
  const environment = {
    ...process.env,
    ...(options.environment ?? {}),
  };
  const timeoutMs =
    options.timeoutMs ?? timeoutFromEnvironment(environment);
  const startedAt = new Date().toISOString();
  const runId = randomUUID();
  const commandResults = [];
  const before = safeWorktreeSnapshot(root, options);
  const head = headSha(root, options);
  const fingerprint = planFingerprint(plan, {
    root,
    headSha: head,
    worktreeSha256: before.sha256,
    lockfileSha256: lockfileSha256(root),
  });

  let receipt;
  try {
    if (plan.requireCleanStart && !before.clean) {
      fail(
        "LOCAL_GATE_WORKTREE_DIRTY",
        "release validation requires a clean starting worktree.",
      );
    }

    if (!options.skipRuntimeSelfTest) {
      commandResults.push(
        await runCommand(RUNTIME_CONTRACT_COMMAND, {
          root,
          environment,
          timeoutMs,
          signal: options.signal,
          stdio: options.stdio,
        }),
      );
    }

    const previous = cacheEligible(plan, environment)
      ? readLatestReceipt(root)
      : undefined;
    const cacheHit =
      previous?.status === "passed" &&
      previous?.fingerprint === fingerprint &&
      previous?.headSha === head &&
      previous?.after?.sha256 === before.sha256;

    if (!cacheHit) {
      for (const entry of plan.commands) {
        commandResults.push(
          await runCommand(entry, {
            root,
            environment,
            timeoutMs,
            signal: options.signal,
            stdio: options.stdio,
          }),
        );
      }
    }

    const after = safeWorktreeSnapshot(root, options);
    if (plan.proveNoMutation && after.status !== before.status) {
      fail(
        "LOCAL_GATE_SOURCE_MUTATED",
        "local validation changed the repository worktree.",
      );
    }

    receipt = Object.freeze({
      schema: "evavo.art-studio.local-quality-receipt.v2",
      runId,
      requestedProfile: plan.requestedProfile,
      profile: plan.profile,
      reason: plan.reason,
      status: "passed",
      cacheHit,
      startedAt,
      endedAt: new Date().toISOString(),
      headSha: head,
      fingerprint,
      before,
      after,
      plan: serialisablePlan(plan),
      commandResults: Object.freeze(commandResults),
      authority: Object.freeze({
        cloudRequired: false,
        githubActionsRequired: false,
        vercelRequired: false,
        deployment: false,
        publication: false,
        repositoryMutation: false,
        storageMutation: false,
        forcePush: false,
      }),
    });
    const paths = writeRuntimeReceipt(receipt, { root });
    return Object.freeze({ receipt, paths });
  } catch (error) {
    const after = safeWorktreeSnapshot(root, {
      ...options,
      optional: true,
    });
    receipt = Object.freeze({
      schema: "evavo.art-studio.local-quality-receipt.v2",
      runId,
      requestedProfile: plan.requestedProfile,
      profile: plan.profile,
      reason: plan.reason,
      status:
        error?.code === "LOCAL_GATE_CANCELLED"
          ? "cancelled"
          : error?.code === "LOCAL_GATE_COMMAND_TIMEOUT"
            ? "timed-out"
            : "failed",
      cacheHit: false,
      startedAt,
      endedAt: new Date().toISOString(),
      headSha: head,
      fingerprint,
      before,
      after,
      plan: serialisablePlan(plan),
      commandResults: Object.freeze(commandResults),
      error: errorShape(error),
      authority: Object.freeze({
        cloudRequired: false,
        githubActionsRequired: false,
        vercelRequired: false,
        deployment: false,
        publication: false,
        repositoryMutation: false,
        storageMutation: false,
        forcePush: false,
      }),
    });
    try {
      error.receiptPaths = writeRuntimeReceipt(receipt, { root });
    } catch (receiptError) {
      error.receiptWriteError = errorShape(receiptError);
    }
    throw error;
  }
}

export function parseGateArguments(argv) {
  if (!Array.isArray(argv)) {
    throw new TypeError("gate arguments must be an array");
  }
  let requestedProfile;
  let planOnly = false;
  for (const argument of argv) {
    if (argument === "--plan") {
      planOnly = true;
      continue;
    }
    if (argument.startsWith("--")) {
      fail(
        "LOCAL_GATE_ARGUMENT_UNSUPPORTED",
        `unsupported local gate argument ${argument}.`,
      );
    }
    if (requestedProfile !== undefined) {
      fail(
        "LOCAL_GATE_ARGUMENT_UNSUPPORTED",
        "the local gate accepts one profile and optional --plan.",
      );
    }
    requestedProfile = argument;
  }
  return Object.freeze({
    requestedProfile: requestedProfile ?? "changed",
    planOnly,
  });
}

export async function runLocalQualityGateCli(argv, options = {}) {
  const parsed = parseGateArguments(argv);
  const canonical = canonicalProfile(parsed.requestedProfile);
  let updates = options.updates;
  if (canonical === "push" && updates === undefined) {
    const input =
      options.stdinText !== undefined
        ? options.stdinText
        : process.stdin.isTTY
          ? ""
          : fs.readFileSync(0, "utf8");
    updates = parsePrePushUpdates(input);
  }
  const root = options.root ?? REPOSITORY_ROOT;
  const plan = buildRuntimePlan(parsed.requestedProfile, {
    ...options,
    root,
    updates: updates ?? [],
  });
  const write = options.writeStdout ?? ((value) => process.stdout.write(value));
  write(`${JSON.stringify(serialisablePlan(plan), null, 2)}\n`);
  if (parsed.planOnly) return Object.freeze({ plan, execution: null });
  const execution = await runLocalQualityGate(plan, {
    ...options,
    root,
  });
  write(
    `${JSON.stringify({
      schema: "evavo.art-studio.local-quality-result.v2",
      status: execution.receipt.status,
      profile: execution.receipt.profile,
      requestedProfile: execution.receipt.requestedProfile,
      cacheHit: execution.receipt.cacheHit,
      headSha: execution.receipt.headSha,
      fingerprint: execution.receipt.fingerprint,
      receipt: path
        .relative(root, execution.paths.versionedPath)
        .replaceAll(path.sep, "/"),
      latestReceipt: path
        .relative(root, execution.paths.latestPath)
        .replaceAll(path.sep, "/"),
      githubActionsRequired: false,
      vercelRequired: false,
    })}\n`,
  );
  return Object.freeze({ plan, execution });
}
