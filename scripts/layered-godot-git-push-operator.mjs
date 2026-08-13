#!/usr/bin/env node

import { createHash } from "node:crypto";
import path from "node:path";
import { types as utilTypes } from "node:util";
import { fileURLToPath } from "node:url";

import {
  LAYERED_GODOT_GIT_PUSH_OPERATOR_PROTOCOL_VERSION,
  LAYERED_GODOT_GIT_PUSH_RECEIPT_KIND,
  LayeredGodotGitPushOperatorError,
  MAXIMUM_PUSH_INPUT_BYTES,
  canonicalSha256,
  pushFail,
  repositoryName,
  sha256,
  snapshotJsonValue,
} from "./layered-godot-git-push-operator/contract.mjs";
import { runGit } from "./layered-godot-git-push-operator/git-exec.mjs";
import {
  inspectOrigin,
  readRemoteHead,
  validateOriginIdentity,
} from "./layered-godot-git-push-operator/origin.mjs";
import {
  pushLayeredGodotCommit as pushRuntimeCommit,
} from "./layered-godot-git-push-operator/runtime.mjs";

export {
  LAYERED_GODOT_GIT_PUSH_OPERATOR_PROTOCOL_VERSION,
  LAYERED_GODOT_GIT_PUSH_RECEIPT_KIND,
  LayeredGodotGitPushOperatorError,
  canonicalSha256,
} from "./layered-godot-git-push-operator/contract.mjs";
export { runGit } from "./layered-godot-git-push-operator/git-exec.mjs";
export {
  inspectOrigin,
  readRemoteHead,
  validateOriginIdentity,
} from "./layered-godot-git-push-operator/origin.mjs";

const DEPENDENCY_KEYS = [
  "complete",
  "inspectWorkspaceRoot",
  "sameFilesystemPath",
  "runGit",
  "resolveOrigin",
];
const MAXIMUM_GIT_OUTPUT_BYTES = 2 * 1024 * 1024;

const FUNCTION_DEPENDENCY_KEYS = [
  "inspectWorkspaceRoot",
  "sameFilesystemPath",
  "runGit",
  "resolveOrigin",
];

async function resolveDefaultDependencies() {
  const filesystem = await import(
    "./layered-godot-workspace-writer/filesystem.mjs"
  );
  return {
    inspectWorkspaceRoot: filesystem.inspectWorkspaceRoot,
    sameFilesystemPath: filesystem.sameFilesystemPath,
    runGit,
    resolveOrigin: inspectOrigin,
  };
}

function inspectPlainObject(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    utilTypes.isProxy(value)
  ) {
    pushFail("INPUT_INVALID", `${label} must be a plain non-Proxy object.`);
  }
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    pushFail("INPUT_INVALID", `${label} could not be inspected safely.`);
  }
  if (prototype !== Object.prototype && prototype !== null) {
    pushFail("INPUT_INVALID", `${label} must use a plain object prototype.`);
  }
  return descriptors;
}

function dataProperty(
  descriptors,
  key,
  label,
  { type = undefined, enumerable = undefined } = {},
) {
  const descriptor = descriptors[key];
  if (
    descriptor === undefined ||
    !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
    descriptor.get !== undefined ||
    descriptor.set !== undefined ||
    (type !== undefined && typeof descriptor.value !== type) ||
    (enumerable !== undefined && descriptor.enumerable !== enumerable)
  ) {
    pushFail(
      "INPUT_INVALID",
      `${label}.${key} must be a data property${
        type === undefined ? "" : ` of type ${type}`
      }${enumerable === true ? " and enumerable" : ""}.`,
    );
  }
  return descriptor.value;
}

function copyStableBuffer(value, label) {
  if (!Buffer.isBuffer(value) || utilTypes.isProxy(value)) {
    pushFail("INPUT_INVALID", `${label} must be a non-Proxy Buffer.`);
  }
  if (
    typeof SharedArrayBuffer !== "undefined" &&
    value.buffer instanceof SharedArrayBuffer
  ) {
    pushFail("INPUT_INVALID", `${label} must not use shared memory.`);
  }
  const first = Buffer.from(value);
  const second = Buffer.from(value);
  if (!first.equals(second)) {
    pushFail("INPUT_INVALID", `${label} changed while it was captured.`);
  }
  return first;
}

function captureDependencies(value) {
  const descriptors = inspectPlainObject(value, "dependencies");
  const allowed = new Set(DEPENDENCY_KEYS);
  const captured = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") {
      pushFail("INPUT_INVALID", "dependencies contains a symbolic property.");
    }
    if (!allowed.has(key)) {
      pushFail(
        "INPUT_INVALID",
        `dependencies contains unsupported field ${key}.`,
      );
    }
    const dependency = dataProperty(descriptors, key, "dependencies", {
      enumerable: true,
    });
    if (utilTypes.isProxy(dependency)) {
      pushFail(
        "INPUT_INVALID",
        `dependencies.${key} must not be a Proxy value.`,
      );
    }
    Object.defineProperty(captured, key, {
      value: dependency,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  if (
    Object.prototype.hasOwnProperty.call(captured, "complete") &&
    typeof captured.complete !== "boolean"
  ) {
    pushFail("INPUT_INVALID", "dependencies.complete must be boolean.");
  }
  return Object.freeze(captured);
}

function validateResolvedDependencies(value) {
  for (const key of FUNCTION_DEPENDENCY_KEYS) {
    if (typeof value[key] !== "function" || utilTypes.isProxy(value[key])) {
      pushFail(
        "INPUT_INVALID",
        `dependencies.${key} must be a non-Proxy function.`,
      );
    }
  }
  return Object.freeze({ ...value });
}

function captureWorkspaceRoot(value) {
  const descriptors = inspectPlainObject(value, "inspectWorkspaceRoot result");
  const rootPath = dataProperty(
    descriptors,
    "path",
    "inspectWorkspaceRoot result",
    { type: "string" },
  );
  const realPath = dataProperty(
    descriptors,
    "realPath",
    "inspectWorkspaceRoot result",
    { type: "string" },
  );
  if (
    rootPath.length < 1 ||
    realPath.length < 1 ||
    rootPath.includes("\0") ||
    realPath.includes("\0")
  ) {
    pushFail(
      "INPUT_INVALID",
      "inspectWorkspaceRoot result paths must be non-empty strings without NUL bytes.",
    );
  }
  return Object.freeze({ path: rootPath, realPath });
}

function captureOrigin(value, expectedRepository) {
  const descriptors = inspectPlainObject(value, "resolveOrigin result");
  const originUrl = dataProperty(
    descriptors,
    "url",
    "resolveOrigin result",
    { type: "string" },
  );
  const reportedRepository = repositoryName(
    dataProperty(
      descriptors,
      "repository",
      "resolveOrigin result",
      { type: "string" },
    ),
    "resolveOrigin result.repository",
  );
  const identity = validateOriginIdentity(originUrl, expectedRepository);
  if (reportedRepository.toLowerCase() !== identity.repository.toLowerCase()) {
    pushFail(
      "ORIGIN_MISMATCH",
      "resolveOrigin result repository does not match its validated URL identity.",
    );
  }
  return identity;
}

function captureGitResult(value, label) {
  const descriptors = inspectPlainObject(value, label);
  const allowed = new Set(["exitCode", "signal", "stdout", "stderr"]);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || !allowed.has(key)) {
      pushFail("INPUT_INVALID", `${label} contains unsupported field ${String(key)}.`);
    }
  }
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(descriptors, key)) {
      pushFail("INPUT_INVALID", `${label} is missing required field ${key}.`);
    }
  }
  const exitCode = dataProperty(descriptors, "exitCode", label, {
    type: "number",
  });
  if (!Number.isInteger(exitCode)) {
    pushFail("INPUT_INVALID", `${label}.exitCode must be an integer.`);
  }
  const signal = dataProperty(descriptors, "signal", label);
  if (
    signal !== null &&
    (typeof signal !== "string" || signal.length > 128 || signal.includes("\0"))
  ) {
    pushFail("INPUT_INVALID", `${label}.signal must be null or bounded text.`);
  }
  const stdout = copyStableBuffer(
    dataProperty(descriptors, "stdout", label),
    `${label}.stdout`,
  );
  const stderr = copyStableBuffer(
    dataProperty(descriptors, "stderr", label),
    `${label}.stderr`,
  );
  if (stdout.byteLength + stderr.byteLength > MAXIMUM_GIT_OUTPUT_BYTES) {
    pushFail(
      "INPUT_INVALID",
      `${label} exceeds the bounded Git output byte limit.`,
    );
  }
  return Object.freeze({ exitCode, signal, stdout, stderr });
}

function captureStableFileRead(value, label) {
  const descriptors = inspectPlainObject(value, label);
  const data = copyStableBuffer(
    dataProperty(descriptors, "data", label),
    `${label}.data`,
  );
  const bytes = dataProperty(descriptors, "bytes", label, { type: "number" });
  const recordedSha256 = sha256(
    dataProperty(descriptors, "sha256", label, { type: "string" }),
    `${label}.sha256`,
  );
  if (
    !Number.isSafeInteger(bytes) ||
    bytes < 0 ||
    bytes !== data.byteLength
  ) {
    pushFail("INPUT_INVALID", `${label}.bytes must equal its captured data.`);
  }
  if (createHash("sha256").update(data).digest("hex") !== recordedSha256) {
    pushFail("INPUT_INVALID", `${label}.sha256 must equal its captured data.`);
  }
  return Object.freeze({ data, bytes, sha256: recordedSha256 });
}

function wrapDependencies(resolved) {
  return Object.freeze({
    complete: true,
    sameFilesystemPath: resolved.sameFilesystemPath,
    inspectWorkspaceRoot: async (...args) =>
      captureWorkspaceRoot(await resolved.inspectWorkspaceRoot(...args)),
    resolveOrigin: async (root, repository, deps) =>
      captureOrigin(
        await resolved.resolveOrigin(root, repository, deps),
        repository,
      ),
    runGit: async (...args) =>
      captureGitResult(await resolved.runGit(...args), "runGit result"),
  });
}

export async function pushLayeredGodotCommit(input, dependencies = {}) {
  const request = snapshotJsonValue(input, "gitPushInput");
  const capturedDependencies = captureDependencies(dependencies);
  const defaults =
    capturedDependencies.complete === true
      ? {}
      : await resolveDefaultDependencies();
  const overrides = Object.fromEntries(
    Object.entries(capturedDependencies).filter(([key]) => key !== "complete"),
  );
  const resolved = validateResolvedDependencies({ ...defaults, ...overrides });
  return pushRuntimeCommit(request, wrapDependencies(resolved));
}

async function readJson(filePath, label, readStableRegularFile) {
  const inspected = captureStableFileRead(
    await readStableRegularFile(path.resolve(filePath), label),
    label,
  );
  if (inspected.bytes > MAXIMUM_PUSH_INPUT_BYTES) {
    pushFail("INPUT_INVALID", `${label} exceeds the bounded byte limit.`);
  }
  try {
    return JSON.parse(inspected.data.toString("utf8"));
  } catch {
    pushFail("INPUT_INVALID", `${label} is not valid UTF-8 JSON.`);
  }
}

function parseCli(argv) {
  const [command, ...rest] = argv;
  if (command !== "push") {
    pushFail(
      "CLI_INVALID",
      "Usage: layered-godot-git-push-operator.mjs push --commit-receipt FILE --workspace DIR --repository OWNER/REPO",
    );
  }
  if (rest.length % 2 !== 0) {
    pushFail("CLI_INVALID", "CLI flags must be --flag value pairs.");
  }
  const values = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (
      !flag?.startsWith("--") ||
      value === undefined ||
      value.startsWith("--")
    ) {
      pushFail("CLI_INVALID", `Invalid CLI argument near ${String(flag)}.`);
    }
    if (values.has(flag)) {
      pushFail("CLI_INVALID", `Duplicate CLI argument ${flag}.`);
    }
    values.set(flag, value);
  }
  const allowed = ["--commit-receipt", "--workspace", "--repository"];
  for (const key of allowed) {
    if (!values.has(key)) pushFail("CLI_INVALID", `Missing ${key}.`);
  }
  for (const key of values.keys()) {
    if (!allowed.includes(key)) {
      pushFail("CLI_INVALID", `Unknown CLI argument ${key}.`);
    }
  }
  return values;
}

async function main() {
  try {
    const values = parseCli(process.argv.slice(2));
    const filesystem = await import(
      "./layered-godot-workspace-writer/filesystem.mjs"
    );
    const commitReceipt = await readJson(
      values.get("--commit-receipt"),
      "commit receipt",
      filesystem.readStableRegularFile,
    );
    console.log(
      JSON.stringify(
        await pushLayeredGodotCommit({
          commitReceipt,
          workspaceRoot: path.resolve(values.get("--workspace")),
          expectedRepository: values.get("--repository"),
          authorization: { push: true, forcePush: false, tags: false },
        }),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          code:
            error instanceof LayeredGodotGitPushOperatorError
              ? error.code
              : "LAYERED_GODOT_GIT_PUSH_FAILED",
          message: error instanceof Error ? error.message : String(error),
          ...(error instanceof LayeredGodotGitPushOperatorError &&
          error.details !== undefined
            ? { details: error.details }
            : {}),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  await main();
}
