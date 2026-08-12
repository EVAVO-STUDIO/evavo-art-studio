#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants as FS_CONSTANTS } from "node:fs";
import { lstat, mkdir, mkdtemp, open, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LayeredGodotWorkspaceWriterError,
  canonicalSha256,
  fail,
  repositoryName,
} from "./layered-godot-workspace-writer.mjs";
import {
  LAYERED_GODOT_WORKSPACE_AUDIT_RECEIPT_KIND,
  LAYERED_GODOT_WORKSPACE_AUDITOR_PROTOCOL_VERSION,
  auditLayeredGodotWorkspace,
} from "./layered-godot-workspace-auditor.mjs";
import {
  filesystemIdentity,
  inspectWorkspaceRoot,
  readStableRegularFile,
  sameFilesystemIdentity,
  sameFilesystemPath,
} from "./layered-godot-workspace-writer/filesystem.mjs";
import { assertNoOutstandingTransactions } from "./layered-godot-workspace-writer/journal.mjs";

export const LAYERED_GODOT_RUNTIME_VALIDATOR_PROTOCOL_VERSION = "2026-08-12.1";
export const LAYERED_GODOT_RUNTIME_VALIDATION_RECEIPT_KIND =
  "evavo.layered-production.godot-runtime-validation-receipt";
export const REQUIRED_GODOT_VERSION = "4.6.2";

const MAXIMUM_PLAN_BYTES = 32 * 1024 * 1024;
const MAXIMUM_RECEIPT_BYTES = 4 * 1024 * 1024;
const MAXIMUM_EXECUTABLE_BYTES = 512 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;
const MAXIMUM_TIMEOUT_MS = 300_000;
const VERSION_TIMEOUT_MS = 15_000;
const VERSION_OUTPUT_BYTES = 64 * 1024;
const RUNTIME_OUTPUT_BYTES = 512 * 1024;
const NOFOLLOW = FS_CONSTANTS.O_NOFOLLOW ?? 0;

const PROJECT_FILE = `[application]\nconfig/name="EVAVO Layered Godot Runtime Validation"\n\n[rendering]\nrenderer/rendering_method="gl_compatibility"\nrenderer/rendering_method.mobile="gl_compatibility"\n`;

const VALIDATOR_SCRIPT = `extends SceneTree\n\nfunc fail(message: String, code: int) -> void:\n    push_error(message)\n    quit(code)\n\nfunc _init() -> void:\n    var user_args := OS.get_cmdline_user_args()\n    if user_args.size() != 1:\n        fail("EVAVO layered runtime validator expects one res:// scene path.", 20)\n        return\n    var scene_path := String(user_args[0])\n    var packed := ResourceLoader.load(scene_path, "PackedScene", ResourceLoader.CACHE_MODE_IGNORE_DEEP)\n    if packed == null or not packed is PackedScene:\n        fail("EVAVO layered runtime scene could not be loaded as PackedScene: " + scene_path, 21)\n        return\n    var instance := packed.instantiate()\n    if instance == null:\n        fail("EVAVO layered runtime scene could not be instantiated: " + scene_path, 22)\n        return\n    print(JSON.stringify({\n        "event": "evavo_layered_godot_runtime_validated",\n        "scene": scene_path,\n        "rootName": String(instance.name),\n        "rootType": instance.get_class()\n    }))\n    instance.free()\n    quit(0)\n`;

function runtimeFail(code, message, details = undefined) {
  fail(`LAYERED_GODOT_RUNTIME_${code}`, message, details);
}
function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactUtcTimestamp(value, label) {
  if (typeof value !== "string" || value.length > 64) {
    runtimeFail("AUDIT_INVALID", `${label} must be a bounded UTC timestamp.`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    runtimeFail("AUDIT_INVALID", `${label} must be canonical UTC ISO-8601.`);
  }
}
function stableAuditPayload(value) {
  const { auditSha256: _auditSha256, auditedAt: _auditedAt, ...stable } = value;
  return stable;
}
function assertAuditReceiptSelfHash(auditReceipt) {
  if (!isObject(auditReceipt)) runtimeFail("AUDIT_INVALID", "Audit receipt must be a JSON object.");
  if (
    auditReceipt.schemaVersion !== "1.0" ||
    auditReceipt.kind !== LAYERED_GODOT_WORKSPACE_AUDIT_RECEIPT_KIND ||
    auditReceipt.protocolVersion !== LAYERED_GODOT_WORKSPACE_AUDITOR_PROTOCOL_VERSION
  ) {
    runtimeFail("AUDIT_INVALID", "Audit receipt schema, kind or protocol is not current.");
  }
  if (typeof auditReceipt.auditSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(auditReceipt.auditSha256)) {
    runtimeFail("AUDIT_INVALID", "Audit receipt SHA-256 is malformed.");
  }
  const { auditSha256, ...withoutHash } = auditReceipt;
  if (canonicalSha256(withoutHash) !== auditSha256) {
    runtimeFail("AUDIT_INVALID", "Audit receipt self-hash does not match its canonical payload.");
  }
  exactUtcTimestamp(auditReceipt.auditedAt, "auditReceipt.auditedAt");
  if (!isObject(auditReceipt.authority)) runtimeFail("AUDIT_INVALID", "Audit receipt authority is missing.");
  for (const key of [
    "fileWritePerformed",
    "targetRepositoryMutationPerformed",
    "godotExecutionPerformed",
    "runtimeActivationPerformed",
    "gitCommitCreated",
    "gitPushPerformed",
    "deploymentPerformed",
    "publicationPerformed",
    "forcePushPerformed",
  ]) {
    if (auditReceipt.authority[key] !== false) {
      runtimeFail("AUDIT_INVALID", `Audit receipt must retain read-only authority (${key}).`);
    }
  }
}
function assertAuditMatchesCurrent(supplied, current) {
  assertAuditReceiptSelfHash(supplied);
  if (canonicalSha256(stableAuditPayload(supplied)) !== canonicalSha256(stableAuditPayload(current))) {
    runtimeFail(
      "AUDIT_STALE",
      "Supplied audit receipt does not match the exact current plan, write receipt, repository, workspace and filesystem identities.",
    );
  }
}
function assertAuditUnchanged(before, after) {
  if (canonicalSha256(stableAuditPayload(before)) !== canonicalSha256(stableAuditPayload(after))) {
    runtimeFail(
      "TARGET_DRIFT",
      "Approved workspace resources or their filesystem identities changed while Godot validation was running.",
    );
  }
}
function assertSandboxSafeScene(integrationPlan) {
  if (!isObject(integrationPlan) || !isObject(integrationPlan.scene)) {
    runtimeFail("PLAN_INVALID", "Integration plan scene contract is missing.");
  }
  const scenePath = integrationPlan.scene.path;
  const sceneText = integrationPlan.scene.tscnDraft;
  if (typeof scenePath !== "string" || !scenePath.endsWith(".tscn")) {
    runtimeFail("PLAN_INVALID", "Integration scene path must be a .tscn resource.");
  }
  if (typeof sceneText !== "string" || sceneText.length === 0) {
    runtimeFail("PLAN_INVALID", "Integration scene draft must contain exact text.");
  }
  if (!sceneText.startsWith("[gd_scene")) runtimeFail("SCENE_UNSAFE", "Integration scene must be a Godot text scene.");
  const forbidden = ["[ext_resource", "ExtResource(", "GDScript", "script =", "script=", "uid://", "res://.godot", "file://"];
  const found = forbidden.find((token) => sceneText.includes(token));
  if (found) {
    runtimeFail(
      "SCENE_UNSAFE",
      `Integration scene contains external/script execution surface ${found}; only self-contained engine-native scene drafts may be sandbox-instantiated.`,
    );
  }
  return Object.freeze({ scenePath, sceneText });
}
function appendBounded(chunks, chunk, state, maximumBytes, streamName, child) {
  const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  state.bytes += data.byteLength;
  if (state.bytes > maximumBytes) {
    state.limitExceeded = streamName;
    child.kill("SIGKILL");
    return;
  }
  chunks.push(data);
}

export async function runBoundedProcess(executable, args, { timeoutMs, maximumOutputBytes, cwd = undefined, env = process.env }) {
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    const state = { stdout: { bytes: 0 }, stderr: { bytes: 0 }, timedOut: false };
    let settled = false;
    const timer = setTimeout(() => {
      state.timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => appendBounded(stdoutChunks, chunk, state.stdout, maximumOutputBytes, "stdout", child));
    child.stderr.on("data", (chunk) => appendBounded(stderrChunks, chunk, state.stderr, maximumOutputBytes, "stderr", child));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new LayeredGodotWorkspaceWriterError("LAYERED_GODOT_RUNTIME_EXECUTION_FAILED", `Could not execute Godot: ${error.message}`));
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (state.timedOut) {
        reject(new LayeredGodotWorkspaceWriterError("LAYERED_GODOT_RUNTIME_TIMEOUT", `Godot execution exceeded ${timeoutMs} ms.`));
        return;
      }
      const exceeded = state.stdout.limitExceeded ?? state.stderr.limitExceeded;
      if (exceeded) {
        reject(new LayeredGodotWorkspaceWriterError("LAYERED_GODOT_RUNTIME_OUTPUT_LIMIT", `Godot ${exceeded} exceeded the ${maximumOutputBytes}-byte evidence limit.`));
        return;
      }
      resolve(Object.freeze({
        exitCode: code ?? 1,
        signal: signal ?? null,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        stdoutBytes: state.stdout.bytes,
        stderrBytes: state.stderr.bytes,
      }));
    });
  });
}

export async function inspectGodotExecutable(executablePath) {
  if (typeof executablePath !== "string" || !path.isAbsolute(executablePath)) {
    runtimeFail("EXECUTABLE_INVALID", "Godot executable must be an explicit absolute path.");
  }
  const before = await lstat(executablePath, { bigint: true });
  if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1n) {
    runtimeFail("EXECUTABLE_INVALID", "Godot executable must be one singly linked regular file.");
  }
  if (before.size <= 0n || before.size > BigInt(MAXIMUM_EXECUTABLE_BYTES)) {
    runtimeFail("EXECUTABLE_INVALID", "Godot executable size is outside the bounded validation range.");
  }
  if (process.platform !== "win32" && (Number(before.mode) & 0o111) === 0) {
    runtimeFail("EXECUTABLE_INVALID", "Godot executable does not have an executable permission bit.");
  }
  const resolved = await realpath(executablePath);
  if (!sameFilesystemPath(resolved, executablePath)) {
    runtimeFail("EXECUTABLE_INVALID", "Godot executable path resolves through a symbolic path.");
  }
  const beforeIdentity = filesystemIdentity(before);
  const handle = await open(executablePath, FS_CONSTANTS.O_RDONLY | NOFOLLOW);
  try {
    const opened = await handle.stat({ bigint: true });
    if (!sameFilesystemIdentity(beforeIdentity, filesystemIdentity(opened))) {
      runtimeFail("EXECUTABLE_CHANGED", "Godot executable changed while it was opened.");
    }
    const digest = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let offset = 0;
    while (offset < Number(opened.size)) {
      const length = Math.min(buffer.byteLength, Number(opened.size) - offset);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      if (bytesRead <= 0) break;
      digest.update(buffer.subarray(0, bytesRead));
      offset += bytesRead;
    }
    if (offset !== Number(opened.size)) runtimeFail("EXECUTABLE_CHANGED", "Godot executable could not be read completely.");
    const after = await handle.stat({ bigint: true });
    if (!sameFilesystemIdentity(beforeIdentity, filesystemIdentity(after))) {
      runtimeFail("EXECUTABLE_CHANGED", "Godot executable changed while it was hashed.");
    }
    return Object.freeze({
      path: resolved,
      sha256: digest.digest("hex"),
      bytes: Number(opened.size),
      filesystemIdentity: beforeIdentity,
    });
  } finally {
    await handle.close();
  }
}

function hashText(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function parseVersionOutput(result) {
  const combined = `${result.stdout}\n${result.stderr}`.trim();
  const version = combined.split(/\r?\n/u).map((entry) => entry.trim()).find(Boolean) ?? "";
  if (!new RegExp(`^${REQUIRED_GODOT_VERSION.replaceAll(".", "\\.")}(?:[.\\s]|$)`, "u").test(version)) {
    runtimeFail("VERSION_MISMATCH", `Godot ${REQUIRED_GODOT_VERSION} is required; executable reported ${version || "no version"}.`);
  }
  return version;
}
function parseRuntimeEvidence(stdout, sceneResourcePath) {
  for (const line of stdout.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const value = JSON.parse(trimmed);
      if (
        value?.event === "evavo_layered_godot_runtime_validated" &&
        value.scene === sceneResourcePath &&
        typeof value.rootName === "string" &&
        typeof value.rootType === "string"
      ) {
        return Object.freeze({ event: value.event, scene: value.scene, rootName: value.rootName, rootType: value.rootType });
      }
    } catch {
      // Non-evidence engine output is ignored.
    }
  }
  runtimeFail("EVIDENCE_MISSING", "Godot exited successfully without the required scene-instantiation evidence event.");
}

async function writeSandbox(integrationPlan, scene) {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "evavo-layered-godot-runtime-"));
  try {
    const resourcePaths = new Set();
    if (!Array.isArray(integrationPlan.resources) || integrationPlan.resources.length !== 7) {
      runtimeFail("PLAN_INVALID", "Runtime validator requires exactly seven integration resources.");
    }
    for (const resource of integrationPlan.resources) {
      if (!isObject(resource) || typeof resource.path !== "string" || typeof resource.content !== "string" || resourcePaths.has(resource.path)) {
        runtimeFail("PLAN_INVALID", "Integration resources must be seven unique exact text resources.");
      }
      resourcePaths.add(resource.path);
      const target = path.resolve(sandbox, ...resource.path.split("/"));
      const relative = path.relative(sandbox, target);
      if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        runtimeFail("PLAN_INVALID", `Integration resource ${resource.path} escapes the validation sandbox.`);
      }
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, resource.content, { encoding: "utf8", flag: "wx", mode: 0o600 });
    }
    if (!resourcePaths.has(scene.scenePath)) runtimeFail("PLAN_INVALID", "Integration scene is not one of the exact seven resources.");
    await writeFile(path.join(sandbox, "project.godot"), PROJECT_FILE, { encoding: "utf8", flag: "wx", mode: 0o600 });
    const validatorPath = path.join(sandbox, "evavo_runtime_validator.gd");
    await writeFile(validatorPath, VALIDATOR_SCRIPT, { encoding: "utf8", flag: "wx", mode: 0o600 });
    for (const directory of ["home", "xdg-data", "xdg-config", "xdg-cache"]) {
      await mkdir(path.join(sandbox, directory), { mode: 0o700 });
    }
    return Object.freeze({
      path: sandbox,
      validatorPath,
      sceneResourcePath: `res://${scene.scenePath.replaceAll(path.sep, "/")}`,
    });
  } catch (error) {
    await rm(sandbox, { recursive: true, force: true });
    throw error;
  }
}
function sandboxEnvironment(sandbox) {
  return {
    ...process.env,
    HOME: path.join(sandbox, "home"),
    XDG_DATA_HOME: path.join(sandbox, "xdg-data"),
    XDG_CONFIG_HOME: path.join(sandbox, "xdg-config"),
    XDG_CACHE_HOME: path.join(sandbox, "xdg-cache"),
    APPDATA: path.join(sandbox, "xdg-config"),
    LOCALAPPDATA: path.join(sandbox, "xdg-data"),
  };
}

export async function validateLayeredGodotRuntime(
  { integrationPlan, writeReceipt, auditReceipt, workspaceRoot, expectedRepository, godotExecutable, timeoutMs = DEFAULT_TIMEOUT_MS },
  dependencies = {},
) {
  const auditWorkspace = dependencies.auditWorkspace ?? auditLayeredGodotWorkspace;
  const inspectExecutable = dependencies.inspectExecutable ?? inspectGodotExecutable;
  const executeProcess = dependencies.executeProcess ?? runBoundedProcess;
  const selectedRepository = repositoryName(expectedRepository, "expectedRepository");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > MAXIMUM_TIMEOUT_MS) {
    runtimeFail("INPUT_INVALID", `timeoutMs must be an integer from 1000 to ${MAXIMUM_TIMEOUT_MS}.`);
  }
  const root = await inspectWorkspaceRoot(path.resolve(workspaceRoot));
  await assertNoOutstandingTransactions(root);
  const preAudit = await auditWorkspace({
    integrationPlan,
    writeReceipt,
    workspaceRoot: root.path,
    expectedRepository: selectedRepository,
  });
  assertAuditMatchesCurrent(auditReceipt, preAudit);
  const scene = assertSandboxSafeScene(integrationPlan);
  const executable = await inspectExecutable(godotExecutable);

  let reportedVersion;
  let sandbox;
  let runtimeResult;
  let evidence;
  let cleanupError;
  let executionError;
  try {
    const versionResult = await executeProcess(executable.path, ["--version"], {
      timeoutMs: VERSION_TIMEOUT_MS,
      maximumOutputBytes: VERSION_OUTPUT_BYTES,
    });
    if (versionResult.exitCode !== 0) runtimeFail("VERSION_FAILED", `Godot --version exited with ${versionResult.exitCode}.`);
    reportedVersion = parseVersionOutput(versionResult);
    sandbox = await writeSandbox(integrationPlan, scene);
    runtimeResult = await executeProcess(
      executable.path,
      ["--headless", "--path", sandbox.path, "--script", sandbox.validatorPath, "--", sandbox.sceneResourcePath],
      {
        timeoutMs,
        maximumOutputBytes: RUNTIME_OUTPUT_BYTES,
        cwd: sandbox.path,
        env: sandboxEnvironment(sandbox.path),
      },
    );
    if (runtimeResult.exitCode !== 0) {
      runtimeFail("ENGINE_FAILED", `Godot scene validation exited with ${runtimeResult.exitCode}.`, {
        stderrSha256: hashText(runtimeResult.stderr),
        stderrBytes: runtimeResult.stderrBytes,
        stdoutSha256: hashText(runtimeResult.stdout),
        stdoutBytes: runtimeResult.stdoutBytes,
      });
    }
    evidence = parseRuntimeEvidence(runtimeResult.stdout, sandbox.sceneResourcePath);
  } catch (error) {
    executionError = error;
  } finally {
    if (sandbox) {
      try {
        await rm(sandbox.path, { recursive: true, force: true });
      } catch (error) {
        cleanupError = error;
      }
    }
  }

  let postAudit;
  let integrityError;
  try {
    await assertNoOutstandingTransactions(root);
    postAudit = await auditWorkspace({
      integrationPlan,
      writeReceipt,
      workspaceRoot: root.path,
      expectedRepository: selectedRepository,
    });
    assertAuditUnchanged(preAudit, postAudit);
  } catch (error) {
    integrityError = error;
  }
  if (integrityError) throw integrityError;
  if (cleanupError) {
    runtimeFail("SANDBOX_CLEANUP_FAILED", `Ephemeral Godot validation sandbox could not be removed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
  }
  if (executionError) throw executionError;

  const receiptWithoutHash = {
    schemaVersion: "1.0",
    kind: LAYERED_GODOT_RUNTIME_VALIDATION_RECEIPT_KIND,
    protocolVersion: LAYERED_GODOT_RUNTIME_VALIDATOR_PROTOCOL_VERSION,
    requestSha256: preAudit.requestSha256,
    integrationSha256: preAudit.integrationSha256,
    writeReceiptSha256: preAudit.writeReceiptSha256,
    inputAuditSha256: auditReceipt.auditSha256,
    preExecutionAuditSha256: preAudit.auditSha256,
    postExecutionAuditSha256: postAudit.auditSha256,
    target: { expectedRepository: selectedRepository, workspaceRoot: preAudit.target.workspaceRoot },
    engine: {
      requiredVersion: REQUIRED_GODOT_VERSION,
      reportedVersion,
      executablePath: executable.path,
      executableSha256: executable.sha256,
      executableBytes: executable.bytes,
      filesystemIdentity: executable.filesystemIdentity,
    },
    sandbox: {
      strategy: "ephemeral-exact-resource-copy",
      exactIntegrationResources: 7,
      scenePath: scene.scenePath,
      targetWorkspaceMounted: false,
      removedAfterValidation: true,
    },
    execution: {
      headless: true,
      sceneInstantiationPerformed: true,
      sceneTreeActivationPerformed: false,
      exitCode: runtimeResult.exitCode,
      stdoutSha256: hashText(runtimeResult.stdout),
      stdoutBytes: runtimeResult.stdoutBytes,
      stderrSha256: hashText(runtimeResult.stderr),
      stderrBytes: runtimeResult.stderrBytes,
      evidence,
    },
    validatedAt: new Date().toISOString(),
    authority: {
      godotExecutionPerformed: true,
      sandboxFileWritePerformed: true,
      targetRepositoryReadPerformed: true,
      targetRepositoryMutationPerformed: false,
      targetRuntimeActivationPerformed: false,
      gitCommitCreated: false,
      gitPushPerformed: false,
      deploymentPerformed: false,
      publicationPerformed: false,
      forcePushPerformed: false,
    },
  };
  return Object.freeze({ ...receiptWithoutHash, validationSha256: canonicalSha256(receiptWithoutHash) });
}

async function readBoundedJson(filePath, label, maximumBytes) {
  const inspected = await readStableRegularFile(path.resolve(filePath), label);
  if (inspected.bytes > maximumBytes) runtimeFail("INPUT_INVALID", `${label} exceeds the bounded byte limit.`);
  try {
    return JSON.parse(inspected.data.toString("utf8"));
  } catch {
    runtimeFail("INPUT_INVALID", `${label} is not valid UTF-8 JSON.`);
  }
}
function parseCliArguments(argv) {
  const [command, ...rest] = argv;
  if (command !== "validate") {
    runtimeFail("CLI_INVALID", "Usage: layered-godot-runtime-validator.mjs validate --plan FILE --receipt FILE --audit-receipt FILE --workspace DIR --repository OWNER/REPO --godot ABSOLUTE_FILE [--timeout-ms MS]");
  }
  const values = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) runtimeFail("CLI_INVALID", `Invalid CLI argument near ${String(flag)}.`);
    if (values.has(flag)) runtimeFail("CLI_INVALID", `Duplicate CLI argument ${flag}.`);
    values.set(flag, value);
  }
  for (const required of ["--plan", "--receipt", "--audit-receipt", "--workspace", "--repository", "--godot"]) {
    if (!values.has(required)) runtimeFail("CLI_INVALID", `Missing required CLI argument ${required}.`);
  }
  for (const key of values.keys()) {
    if (!["--plan", "--receipt", "--audit-receipt", "--workspace", "--repository", "--godot", "--timeout-ms"].includes(key)) {
      runtimeFail("CLI_INVALID", `Unknown CLI argument ${key}.`);
    }
  }
  return {
    planPath: values.get("--plan"),
    receiptPath: values.get("--receipt"),
    auditReceiptPath: values.get("--audit-receipt"),
    workspaceRoot: path.resolve(values.get("--workspace")),
    expectedRepository: values.get("--repository"),
    godotExecutable: path.resolve(values.get("--godot")),
    timeoutMs: values.has("--timeout-ms") ? Number(values.get("--timeout-ms")) : DEFAULT_TIMEOUT_MS,
  };
}
async function main() {
  try {
    const cli = parseCliArguments(process.argv.slice(2));
    const [integrationPlan, writeReceipt, auditReceipt] = await Promise.all([
      readBoundedJson(cli.planPath, "integration plan file", MAXIMUM_PLAN_BYTES),
      readBoundedJson(cli.receiptPath, "write receipt file", MAXIMUM_RECEIPT_BYTES),
      readBoundedJson(cli.auditReceiptPath, "audit receipt file", MAXIMUM_RECEIPT_BYTES),
    ]);
    console.log(JSON.stringify(await validateLayeredGodotRuntime({
      integrationPlan,
      writeReceipt,
      auditReceipt,
      workspaceRoot: cli.workspaceRoot,
      expectedRepository: cli.expectedRepository,
      godotExecutable: cli.godotExecutable,
      timeoutMs: cli.timeoutMs,
    }), null, 2));
  } catch (error) {
    const payload = {
      code: error instanceof LayeredGodotWorkspaceWriterError ? error.code : "LAYERED_GODOT_RUNTIME_FAILED",
      message: error instanceof Error ? error.message : String(error),
      ...(error instanceof LayeredGodotWorkspaceWriterError && error.details !== undefined ? { details: error.details } : {}),
    };
    console.error(JSON.stringify(payload, null, 2));
    process.exitCode = 1;
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
