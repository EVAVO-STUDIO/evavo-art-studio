#!/usr/bin/env node

import { createHash } from "node:crypto";
import path from "node:path";
import { types as utilTypes } from "node:util";
import { fileURLToPath } from "node:url";

import {
  LayeredGodotGitOperatorError,
  MAXIMUM_OPERATOR_INPUT_BYTES,
  operatorFail,
  sha256,
  snapshotJsonValue,
} from "./layered-godot-git-operator/contract.mjs";
import {
  commitLayeredGodotHandoff as commitRuntimeHandoff,
} from "./layered-godot-git-operator-runtime-v1.mjs";
import { runGit } from "./layered-godot-git-operator/git-exec.mjs";

export {
  LAYERED_GODOT_GIT_COMMIT_RECEIPT_KIND,
  LAYERED_GODOT_GIT_OPERATOR_PROTOCOL_VERSION,
  LayeredGodotGitOperatorError,
  canonicalSha256,
} from "./layered-godot-git-operator-runtime-v1.mjs";
export { runGit } from "./layered-godot-git-operator/git-exec.mjs";

const DEPENDENCY_KEYS = [
  "complete",
  "reviewRepository",
  "verifyWriteRequest",
  "writeRequestKind",
  "inspectWorkspaceRoot",
  "sameFilesystemPath",
  "readStableRegularFile",
  "runGit",
];
const FUNCTION_DEPENDENCY_KEYS = [
  "reviewRepository",
  "verifyWriteRequest",
  "inspectWorkspaceRoot",
  "sameFilesystemPath",
  "readStableRegularFile",
  "runGit",
];

async function resolveDefaultDependencies() {
  const [reviewer, writer, filesystem] = await Promise.all([
    import("./layered-godot-repository-review.mjs"),
    import("./layered-godot-workspace-writer.mjs"),
    import("./layered-godot-workspace-writer/filesystem.mjs"),
  ]);
  return {
    reviewRepository: reviewer.reviewLayeredGodotRepository,
    verifyWriteRequest: writer.verifyLayeredGodotWorkspaceWriteRequest,
    writeRequestKind: writer.LAYERED_GODOT_WORKSPACE_WRITE_REQUEST_KIND,
    inspectWorkspaceRoot: filesystem.inspectWorkspaceRoot,
    sameFilesystemPath: filesystem.sameFilesystemPath,
    readStableRegularFile: filesystem.readStableRegularFile,
    runGit,
  };
}

function inspectPlainObject(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    utilTypes.isProxy(value)
  ) {
    operatorFail("INPUT_INVALID", `${label} must be a plain non-Proxy object.`);
  }
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    operatorFail("INPUT_INVALID", `${label} could not be inspected safely.`);
  }
  if (prototype !== Object.prototype && prototype !== null) {
    operatorFail("INPUT_INVALID", `${label} must use a plain object prototype.`);
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
    operatorFail(
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
    operatorFail("INPUT_INVALID", `${label} must be a non-Proxy Buffer.`);
  }
  if (
    typeof SharedArrayBuffer !== "undefined" &&
    value.buffer instanceof SharedArrayBuffer
  ) {
    operatorFail("INPUT_INVALID", `${label} must not use shared memory.`);
  }
  const first = Buffer.from(value);
  const second = Buffer.from(value);
  if (!first.equals(second)) {
    operatorFail("INPUT_INVALID", `${label} changed while it was captured.`);
  }
  return first;
}

function captureDependencies(value) {
  const descriptors = inspectPlainObject(value, "dependencies");
  const allowed = new Set(DEPENDENCY_KEYS);
  const captured = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") {
      operatorFail("INPUT_INVALID", "dependencies contains a symbolic property.");
    }
    if (!allowed.has(key)) {
      operatorFail(
        "INPUT_INVALID",
        `dependencies contains unsupported field ${key}.`,
      );
    }
    const dependency = dataProperty(descriptors, key, "dependencies", {
      enumerable: true,
    });
    if (utilTypes.isProxy(dependency)) {
      operatorFail(
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
    operatorFail("INPUT_INVALID", "dependencies.complete must be boolean.");
  }
  return Object.freeze(captured);
}

function validateResolvedDependencies(value) {
  for (const key of FUNCTION_DEPENDENCY_KEYS) {
    if (typeof value[key] !== "function" || utilTypes.isProxy(value[key])) {
      operatorFail(
        "INPUT_INVALID",
        `dependencies.${key} must be a non-Proxy function.`,
      );
    }
  }
  if (
    typeof value.writeRequestKind !== "string" ||
    value.writeRequestKind.length < 1 ||
    value.writeRequestKind.length > 512 ||
    value.writeRequestKind.includes("\0")
  ) {
    operatorFail(
      "INPUT_INVALID",
      "dependencies.writeRequestKind must be a bounded non-empty string.",
    );
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
  if (rootPath.length < 1 || realPath.length < 1) {
    operatorFail(
      "INPUT_INVALID",
      "inspectWorkspaceRoot result paths must be non-empty strings.",
    );
  }
  return Object.freeze({ path: rootPath, realPath });
}

function captureVerifiedWriteRequest(value) {
  const verifiedDescriptors = inspectPlainObject(value, "verifiedWriteRequest");
  const requestSha256 = sha256(
    dataProperty(verifiedDescriptors, "requestSha256", "verifiedWriteRequest", {
      type: "string",
    }),
    "verifiedWriteRequest.requestSha256",
  );
  const integrationValue = dataProperty(
    verifiedDescriptors,
    "integration",
    "verifiedWriteRequest",
  );
  const integrationDescriptors = inspectPlainObject(
    integrationValue,
    "verifiedWriteRequest.integration",
  );
  const integrationSha256 = sha256(
    dataProperty(
      integrationDescriptors,
      "integrationSha256",
      "verifiedWriteRequest.integration",
      { type: "string" },
    ),
    "verifiedWriteRequest.integration.integrationSha256",
  );
  const resourceValues = dataProperty(
    integrationDescriptors,
    "resources",
    "verifiedWriteRequest.integration",
  );
  if (
    !Array.isArray(resourceValues) ||
    utilTypes.isProxy(resourceValues) ||
    Object.getPrototypeOf(resourceValues) !== Array.prototype ||
    resourceValues.length !== 7
  ) {
    operatorFail(
      "INPUT_INVALID",
      "verifiedWriteRequest.integration.resources must be an intrinsic seven-entry array.",
    );
  }
  const arrayDescriptors = Object.getOwnPropertyDescriptors(resourceValues);
  if (Reflect.ownKeys(arrayDescriptors).length !== resourceValues.length + 1) {
    operatorFail(
      "INPUT_INVALID",
      "verifiedWriteRequest.integration.resources must be dense without extra properties.",
    );
  }

  const resources = [];
  const paths = new Set();
  let totalBytes = 0;
  for (let index = 0; index < resourceValues.length; index += 1) {
    const itemDescriptor = arrayDescriptors[String(index)];
    if (
      itemDescriptor === undefined ||
      !Object.prototype.hasOwnProperty.call(itemDescriptor, "value") ||
      itemDescriptor.get !== undefined ||
      itemDescriptor.set !== undefined ||
      itemDescriptor.enumerable !== true
    ) {
      operatorFail(
        "INPUT_INVALID",
        `verifiedWriteRequest.integration.resources[${index}] must be an enumerable data property.`,
      );
    }
    const label = `verifiedWriteRequest.integration.resources[${index}]`;
    const descriptors = inspectPlainObject(itemDescriptor.value, label);
    const resourcePath = dataProperty(descriptors, "path", label, {
      type: "string",
    });
    const content = dataProperty(descriptors, "content", label, {
      type: "string",
    });
    const data = copyStableBuffer(
      dataProperty(descriptors, "data", label),
      `${label}.data`,
    );
    const recordedSha256 = sha256(
      dataProperty(descriptors, "sha256", label, { type: "string" }),
      `${label}.sha256`,
    );
    const bytes = dataProperty(descriptors, "bytes", label, {
      type: "number",
    });
    if (
      resourcePath.length < 1 ||
      resourcePath.length > 8192 ||
      resourcePath.includes("\0") ||
      paths.has(resourcePath)
    ) {
      operatorFail(
        "INPUT_INVALID",
        `${label}.path must be a unique bounded string without NUL bytes.`,
      );
    }
    paths.add(resourcePath);
    if (
      !Number.isSafeInteger(bytes) ||
      bytes < 0 ||
      bytes !== data.byteLength
    ) {
      operatorFail(
        "INPUT_INVALID",
        `${label}.bytes must equal the captured Buffer byte length.`,
      );
    }
    if (!Buffer.from(content, "utf8").equals(data)) {
      operatorFail(
        "INPUT_INVALID",
        `${label}.content must equal the captured UTF-8 bytes.`,
      );
    }
    if (
      createHash("sha256").update(data).digest("hex") !== recordedSha256
    ) {
      operatorFail(
        "INPUT_INVALID",
        `${label}.sha256 must equal the captured bytes.`,
      );
    }
    totalBytes += bytes;
    if (totalBytes > MAXIMUM_OPERATOR_INPUT_BYTES) {
      operatorFail(
        "INPUT_INVALID",
        "verifiedWriteRequest resources exceed the bounded byte limit.",
      );
    }
    resources.push(
      Object.freeze({
        path: resourcePath,
        content,
        data,
        sha256: recordedSha256,
        bytes,
      }),
    );
  }
  return Object.freeze({
    requestSha256,
    integration: Object.freeze({
      integrationSha256,
      resources: Object.freeze(resources),
    }),
  });
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
    operatorFail("INPUT_INVALID", `${label}.bytes must equal its captured data.`);
  }
  if (createHash("sha256").update(data).digest("hex") !== recordedSha256) {
    operatorFail("INPUT_INVALID", `${label}.sha256 must equal its captured data.`);
  }
  return Object.freeze({ data, bytes, sha256: recordedSha256 });
}

function captureGitResult(value, label) {
  const descriptors = inspectPlainObject(value, label);
  const code = dataProperty(descriptors, "code", label, { type: "number" });
  if (!Number.isInteger(code)) {
    operatorFail("INPUT_INVALID", `${label}.code must be an integer.`);
  }
  return Object.freeze({
    code,
    stdout: copyStableBuffer(
      dataProperty(descriptors, "stdout", label),
      `${label}.stdout`,
    ),
    stderr: copyStableBuffer(
      dataProperty(descriptors, "stderr", label),
      `${label}.stderr`,
    ),
  });
}

function wrapDependencies(resolved) {
  return Object.freeze({
    complete: true,
    writeRequestKind: resolved.writeRequestKind,
    sameFilesystemPath: resolved.sameFilesystemPath,
    inspectWorkspaceRoot: async (...args) =>
      captureWorkspaceRoot(await resolved.inspectWorkspaceRoot(...args)),
    verifyWriteRequest: (...args) =>
      captureVerifiedWriteRequest(resolved.verifyWriteRequest(...args)),
    reviewRepository: async (...args) =>
      snapshotJsonValue(
        await resolved.reviewRepository(...args),
        "currentRepositoryReviewReceipt",
      ),
    readStableRegularFile: async (...args) =>
      captureStableFileRead(
        await resolved.readStableRegularFile(...args),
        "readStableRegularFile result",
      ),
    runGit: async (...args) =>
      captureGitResult(await resolved.runGit(...args), "runGit result"),
  });
}

export async function commitLayeredGodotHandoff(input, dependencies = {}) {
  const request = snapshotJsonValue(input, "gitOperatorInput");
  const capturedDependencies = captureDependencies(dependencies);
  const defaults =
    capturedDependencies.complete === true
      ? {}
      : await resolveDefaultDependencies();
  const overrides = Object.fromEntries(
    Object.entries(capturedDependencies).filter(([key]) => key !== "complete"),
  );
  const resolved = validateResolvedDependencies({ ...defaults, ...overrides });
  return commitRuntimeHandoff(request, wrapDependencies(resolved));
}

async function readJson(filePath, label, readStableRegularFile) {
  const inspected = captureStableFileRead(
    await readStableRegularFile(path.resolve(filePath), label),
    label,
  );
  if (inspected.bytes > MAXIMUM_OPERATOR_INPUT_BYTES) {
    operatorFail("INPUT_INVALID", `${label} exceeds the bounded byte limit.`);
  }
  try {
    return JSON.parse(inspected.data.toString("utf8"));
  } catch {
    operatorFail("INPUT_INVALID", `${label} is not valid UTF-8 JSON.`);
  }
}

function parseCli(argv) {
  const [command, ...rest] = argv;
  if (command !== "commit") {
    operatorFail(
      "CLI_INVALID",
      "Usage: layered-godot-git-operator.mjs commit --plan FILE --receipt FILE --audit-receipt FILE --runtime-receipt FILE --handoff-receipt FILE --review-receipt FILE --workspace DIR --repository OWNER/REPO --message TEXT",
    );
  }
  if (rest.length % 2 !== 0) {
    operatorFail("CLI_INVALID", "CLI flags must be --flag value pairs.");
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
      operatorFail("CLI_INVALID", `Invalid CLI argument near ${String(flag)}.`);
    }
    if (values.has(flag)) {
      operatorFail("CLI_INVALID", `Duplicate CLI argument ${flag}.`);
    }
    values.set(flag, value);
  }
  const allowed = [
    "--plan",
    "--receipt",
    "--audit-receipt",
    "--runtime-receipt",
    "--handoff-receipt",
    "--review-receipt",
    "--workspace",
    "--repository",
    "--message",
  ];
  for (const key of allowed) {
    if (!values.has(key)) operatorFail("CLI_INVALID", `Missing ${key}.`);
  }
  for (const key of values.keys()) {
    if (!allowed.includes(key)) {
      operatorFail("CLI_INVALID", `Unknown CLI argument ${key}.`);
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
    const stableRead = filesystem.readStableRegularFile;
    const [
      integrationPlan,
      writeReceipt,
      auditReceipt,
      runtimeValidationReceipt,
      handoffReceipt,
      repositoryReviewReceipt,
    ] = await Promise.all([
      readJson(values.get("--plan"), "integration plan", stableRead),
      readJson(values.get("--receipt"), "write receipt", stableRead),
      readJson(values.get("--audit-receipt"), "audit receipt", stableRead),
      readJson(values.get("--runtime-receipt"), "runtime receipt", stableRead),
      readJson(values.get("--handoff-receipt"), "handoff receipt", stableRead),
      readJson(
        values.get("--review-receipt"),
        "repository review receipt",
        stableRead,
      ),
    ]);
    console.log(
      JSON.stringify(
        await commitLayeredGodotHandoff({
          integrationPlan,
          writeReceipt,
          auditReceipt,
          runtimeValidationReceipt,
          handoffReceipt,
          repositoryReviewReceipt,
          workspaceRoot: path.resolve(values.get("--workspace")),
          expectedRepository: values.get("--repository"),
          commitMessage: values.get("--message"),
          authorization: { commit: true, push: false, forcePush: false },
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
            error instanceof LayeredGodotGitOperatorError
              ? error.code
              : "LAYERED_GODOT_GIT_OPERATOR_FAILED",
          message: error instanceof Error ? error.message : String(error),
          ...(error instanceof LayeredGodotGitOperatorError &&
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
