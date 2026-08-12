#!/usr/bin/env node

import path from "node:path";
import { types as utilTypes } from "node:util";
import { fileURLToPath } from "node:url";

import {
  EXPECTED_HANDOFF_GATE_PROTOCOL_VERSION,
  EXPECTED_HANDOFF_GATE_RECEIPT_KIND,
  LAYERED_GODOT_REPOSITORY_REVIEW_PROTOCOL_VERSION,
  LAYERED_GODOT_REPOSITORY_REVIEW_RECEIPT_KIND,
  LayeredGodotRepositoryReviewError,
  MAXIMUM_REVIEW_INPUT_BYTES,
  assertHandoffStillCurrent,
  canonicalSha256,
  exactObject,
  record,
  repositoryName,
  reviewFail,
  snapshotJsonValue,
  validateSuppliedHandoffReceipt,
} from "./layered-godot-repository-review/contract.mjs";
import {
  inspectGitSnapshot,
  runGitReadOnly,
  snapshotIdentity,
} from "./layered-godot-repository-review/git-readonly.mjs";

export {
  EXPECTED_HANDOFF_GATE_PROTOCOL_VERSION,
  EXPECTED_HANDOFF_GATE_RECEIPT_KIND,
  LAYERED_GODOT_REPOSITORY_REVIEW_PROTOCOL_VERSION,
  LAYERED_GODOT_REPOSITORY_REVIEW_RECEIPT_KIND,
  LayeredGodotRepositoryReviewError,
  canonicalSha256,
  snapshotJsonValue,
} from "./layered-godot-repository-review/contract.mjs";
export { runGitReadOnly } from "./layered-godot-repository-review/git-readonly.mjs";

const REVIEW_INPUT_KEYS = [
  "integrationPlan",
  "writeReceipt",
  "auditReceipt",
  "runtimeValidationReceipt",
  "handoffReceipt",
  "workspaceRoot",
  "expectedRepository",
];
const DEPENDENCY_KEYS = [
  "complete",
  "verifyWriteRequest",
  "writeRequestKind",
  "gateHandoff",
  "inspectWorkspaceRoot",
  "sameFilesystemPath",
  "runGit",
];
const FUNCTION_DEPENDENCY_KEYS = [
  "verifyWriteRequest",
  "gateHandoff",
  "inspectWorkspaceRoot",
  "sameFilesystemPath",
  "runGit",
];

async function resolveDefaultDependencies() {
  const [writer, gate, filesystem] = await Promise.all([
    import("./layered-godot-workspace-writer.mjs"),
    import("./layered-godot-handoff-gate.mjs"),
    import("./layered-godot-workspace-writer/filesystem.mjs"),
  ]);
  return {
    verifyWriteRequest: writer.verifyLayeredGodotWorkspaceWriteRequest,
    writeRequestKind: writer.LAYERED_GODOT_WORKSPACE_WRITE_REQUEST_KIND,
    gateHandoff: gate.gateLayeredGodotHandoff,
    inspectWorkspaceRoot: filesystem.inspectWorkspaceRoot,
    sameFilesystemPath: filesystem.sameFilesystemPath,
    runGit: runGitReadOnly,
  };
}

function captureDependencies(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    utilTypes.isProxy(value)
  ) {
    reviewFail(
      "INPUT_INVALID",
      "dependencies must be a plain non-Proxy object.",
    );
  }

  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    reviewFail("INPUT_INVALID", "dependencies could not be inspected safely.");
  }
  if (prototype !== Object.prototype && prototype !== null) {
    reviewFail("INPUT_INVALID", "dependencies must use a plain object prototype.");
  }

  const allowed = new Set(DEPENDENCY_KEYS);
  const captured = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") {
      reviewFail("INPUT_INVALID", "dependencies contains a symbolic property.");
    }
    if (!allowed.has(key)) {
      reviewFail("INPUT_INVALID", `dependencies contains unsupported field ${key}.`);
    }
    const descriptor = descriptors[key];
    if (
      !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined ||
      descriptor.enumerable !== true
    ) {
      reviewFail(
        "INPUT_INVALID",
        `dependencies.${key} must be an enumerable data property without accessors.`,
      );
    }
    if (utilTypes.isProxy(descriptor.value)) {
      reviewFail("INPUT_INVALID", `dependencies.${key} must not be a Proxy value.`);
    }
    Object.defineProperty(captured, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }

  if (
    Object.prototype.hasOwnProperty.call(captured, "complete") &&
    typeof captured.complete !== "boolean"
  ) {
    reviewFail("INPUT_INVALID", "dependencies.complete must be boolean.");
  }
  return Object.freeze(captured);
}

function inspectPlainObject(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    utilTypes.isProxy(value)
  ) {
    reviewFail("INPUT_INVALID", `${label} must be a plain non-Proxy object.`);
  }
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    reviewFail("INPUT_INVALID", `${label} could not be inspected safely.`);
  }
  if (prototype !== Object.prototype && prototype !== null) {
    reviewFail("INPUT_INVALID", `${label} must use a plain object prototype.`);
  }
  return descriptors;
}

function dataProperty(descriptors, key, label, expectedType = undefined) {
  const descriptor = descriptors[key];
  if (
    descriptor === undefined ||
    !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
    descriptor.get !== undefined ||
    descriptor.set !== undefined ||
    (expectedType !== undefined && typeof descriptor.value !== expectedType)
  ) {
    reviewFail(
      "INPUT_INVALID",
      `${label}.${key} must be a data property${
        expectedType === undefined ? "" : ` of type ${expectedType}`
      }.`,
    );
  }
  return descriptor.value;
}

function captureVerifiedWriteRequest(value) {
  const verifiedDescriptors = inspectPlainObject(value, "verifiedWriteRequest");
  const requestSha256 = dataProperty(
    verifiedDescriptors,
    "requestSha256",
    "verifiedWriteRequest",
    "string",
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
  const integrationSha256 = dataProperty(
    integrationDescriptors,
    "integrationSha256",
    "verifiedWriteRequest.integration",
    "string",
  );
  const resourcesValue = dataProperty(
    integrationDescriptors,
    "resources",
    "verifiedWriteRequest.integration",
  );
  if (
    !Array.isArray(resourcesValue) ||
    utilTypes.isProxy(resourcesValue) ||
    Object.getPrototypeOf(resourcesValue) !== Array.prototype ||
    resourcesValue.length !== 7
  ) {
    reviewFail(
      "INPUT_INVALID",
      "verifiedWriteRequest.integration.resources must be an intrinsic seven-entry array.",
    );
  }
  const resourceDescriptors = Object.getOwnPropertyDescriptors(resourcesValue);
  if (Reflect.ownKeys(resourceDescriptors).length !== resourcesValue.length + 1) {
    reviewFail(
      "INPUT_INVALID",
      "verifiedWriteRequest.integration.resources must be dense without extra properties.",
    );
  }
  const resources = [];
  for (let index = 0; index < resourcesValue.length; index += 1) {
    const entryDescriptor = resourceDescriptors[String(index)];
    if (
      entryDescriptor === undefined ||
      !Object.prototype.hasOwnProperty.call(entryDescriptor, "value") ||
      entryDescriptor.get !== undefined ||
      entryDescriptor.set !== undefined
    ) {
      reviewFail(
        "INPUT_INVALID",
        `verifiedWriteRequest.integration.resources[${index}] must be a data property.`,
      );
    }
    const entryLabel = `verifiedWriteRequest.integration.resources[${index}]`;
    const entryDescriptors = inspectPlainObject(entryDescriptor.value, entryLabel);
    resources.push(
      Object.freeze({
        path: dataProperty(entryDescriptors, "path", entryLabel, "string"),
        content: dataProperty(entryDescriptors, "content", entryLabel, "string"),
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

function captureWorkspaceRoot(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    utilTypes.isProxy(value)
  ) {
    reviewFail(
      "INPUT_INVALID",
      "inspectWorkspaceRoot must return a plain non-Proxy object.",
    );
  }
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    reviewFail(
      "INPUT_INVALID",
      "inspectWorkspaceRoot result could not be inspected safely.",
    );
  }
  if (prototype !== Object.prototype && prototype !== null) {
    reviewFail(
      "INPUT_INVALID",
      "inspectWorkspaceRoot result must use a plain object prototype.",
    );
  }
  const output = {};
  for (const key of ["path", "realPath"]) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined ||
      typeof descriptor.value !== "string" ||
      descriptor.value.length === 0
    ) {
      reviewFail(
        "INPUT_INVALID",
        `inspectWorkspaceRoot.${key} must be a non-empty data-property string.`,
      );
    }
    output[key] = descriptor.value;
  }
  return Object.freeze(output);
}

function validateResolvedDependencies(dependencies) {
  for (const key of FUNCTION_DEPENDENCY_KEYS) {
    if (typeof dependencies[key] !== "function" || utilTypes.isProxy(dependencies[key])) {
      reviewFail("INPUT_INVALID", `dependencies.${key} must be a non-Proxy function.`);
    }
  }
  if (
    typeof dependencies.writeRequestKind !== "string" ||
    dependencies.writeRequestKind.length === 0 ||
    dependencies.writeRequestKind.length > 512
  ) {
    reviewFail(
      "INPUT_INVALID",
      "dependencies.writeRequestKind must be a bounded non-empty string.",
    );
  }
  return Object.freeze({ ...dependencies });
}

export async function reviewLayeredGodotRepository(input, dependencies = {}) {
  const request = exactObject(
    snapshotJsonValue(input, "repositoryReviewInput"),
    REVIEW_INPUT_KEYS,
    "repositoryReviewInput",
    "INPUT_INVALID",
  );
  if (typeof request.workspaceRoot !== "string") {
    reviewFail(
      "INPUT_INVALID",
      "repositoryReviewInput.workspaceRoot must be a string.",
    );
  }

  const capturedDependencies = captureDependencies(dependencies);
  const defaults =
    capturedDependencies.complete === true
      ? {}
      : await resolveDefaultDependencies();
  const overrides = Object.fromEntries(
    Object.entries(capturedDependencies).filter(([key]) => key !== "complete"),
  );
  const deps = validateResolvedDependencies({ ...defaults, ...overrides });

  const repository = repositoryName(
    request.expectedRepository,
    "expectedRepository",
  );
  const root = captureWorkspaceRoot(
    await deps.inspectWorkspaceRoot(path.resolve(request.workspaceRoot)),
  );

  const suppliedHandoff = validateSuppliedHandoffReceipt(
    request.handoffReceipt,
    repository,
    deps.sameFilesystemPath,
    root,
    "handoffReceipt",
  );
  const write = record(request.writeReceipt, "writeReceipt");
  const verifiedRecord = captureVerifiedWriteRequest(
    deps.verifyWriteRequest({
      schemaVersion: "1.0",
      kind: deps.writeRequestKind,
      requestId: write.requestId,
      revision: write.revision,
      expectedRepository: repository,
      workspaceRoot: root.path,
      integrationPlan: request.integrationPlan,
    }),
  );
  const verifiedIntegration = verifiedRecord.integration;
  if (
    verifiedRecord.requestSha256 !== suppliedHandoff.requestSha256 ||
    verifiedIntegration.integrationSha256 !== suppliedHandoff.integrationSha256 ||
    write.receiptSha256 !== suppliedHandoff.writeReceiptSha256
  ) {
    reviewFail(
      "HANDOFF_INVALID",
      "Handoff receipt is not bound to the exact verified write request and receipt.",
    );
  }

  const gateInput = Object.freeze({
    integrationPlan: request.integrationPlan,
    writeReceipt: request.writeReceipt,
    auditReceipt: request.auditReceipt,
    runtimeValidationReceipt: request.runtimeValidationReceipt,
    workspaceRoot: root.path,
    expectedRepository: repository,
  });
  const currentGateBefore = validateSuppliedHandoffReceipt(
    await deps.gateHandoff(gateInput),
    repository,
    deps.sameFilesystemPath,
    root,
    "currentGateBefore",
  );
  assertHandoffStillCurrent(suppliedHandoff, currentGateBefore);

  const before = snapshotJsonValue(
    await inspectGitSnapshot({
      root,
      repository,
      resources: verifiedIntegration.resources,
      runGit: deps.runGit,
      sameFilesystemPath: deps.sameFilesystemPath,
    }),
    "gitSnapshotBefore",
  );

  const currentGateAfter = validateSuppliedHandoffReceipt(
    await deps.gateHandoff(gateInput),
    repository,
    deps.sameFilesystemPath,
    root,
    "currentGateAfter",
  );
  assertHandoffStillCurrent(suppliedHandoff, currentGateAfter);

  const after = snapshotJsonValue(
    await inspectGitSnapshot({
      root,
      repository,
      resources: verifiedIntegration.resources,
      runGit: deps.runGit,
      sameFilesystemPath: deps.sameFilesystemPath,
    }),
    "gitSnapshotAfter",
  );
  if (snapshotIdentity(before) !== snapshotIdentity(after)) {
    reviewFail(
      "REPOSITORY_DRIFT",
      "Repository or governed handoff state changed during read-only review.",
    );
  }

  const changedExpectedResources =
    after.modifiedExpectedPaths.length + after.untrackedExpectedPaths.length;
  const payload = snapshotJsonValue(
    {
      schemaVersion: "1.0",
      kind: LAYERED_GODOT_REPOSITORY_REVIEW_RECEIPT_KIND,
      protocolVersion: LAYERED_GODOT_REPOSITORY_REVIEW_PROTOCOL_VERSION,
      requestSha256: suppliedHandoff.requestSha256,
      integrationSha256: suppliedHandoff.integrationSha256,
      writeReceiptSha256: suppliedHandoff.writeReceiptSha256,
      handoffGateSha256: suppliedHandoff.gateSha256,
      target: {
        expectedRepository: repository,
        workspaceRoot: root.realPath,
      },
      git: {
        version: after.version,
        repositoryRoot: after.root,
        objectFormat: after.objectFormat,
        head: after.head,
        branch: after.branch,
        originUrl: after.originUrl,
        originRepository: after.originRepository,
        attributesSha256: after.attributesSha256,
        snapshotSha256: snapshotIdentity(after),
      },
      workingTree: {
        stagedPaths: after.stagedPaths,
        modifiedExpectedPaths: after.modifiedExpectedPaths,
        untrackedExpectedPaths: after.untrackedExpectedPaths,
        unchangedExpectedPaths: after.unchangedExpectedPaths,
        unrelatedPaths: after.unrelatedPaths,
        expectedResources: verifiedIntegration.resources.length,
        changedExpectedResources,
      },
      readiness: {
        repositoryReviewPassed: true,
        commitRequired: changedExpectedResources > 0,
        commitCandidateReady: changedExpectedResources > 0,
        alreadyIntegrated: changedExpectedResources === 0,
        gitCommitAuthorized: false,
        gitPushAuthorized: false,
        requiresExplicitGitOperator: true,
      },
      reviewedAt: new Date().toISOString(),
      authority: {
        targetRepositoryReadPerformed: true,
        targetRepositoryMutationPerformed: false,
        gitReadCommandsPerformed: true,
        gitIndexMutationPerformed: false,
        gitHookExecutionPerformed: false,
        gitCommitCreated: false,
        gitPushPerformed: false,
        deploymentPerformed: false,
        publicationPerformed: false,
        forcePushPerformed: false,
      },
    },
    "repositoryReviewReceipt",
  );
  return Object.freeze({
    ...payload,
    reviewSha256: canonicalSha256(payload),
  });
}

async function readJson(filePath, label, deps) {
  const inspected = await deps.readStableRegularFile(path.resolve(filePath), label);
  if (inspected.bytes > MAXIMUM_REVIEW_INPUT_BYTES) {
    reviewFail("INPUT_INVALID", `${label} exceeds the bounded byte limit.`);
  }
  try {
    return JSON.parse(inspected.data.toString("utf8"));
  } catch {
    reviewFail("INPUT_INVALID", `${label} is not valid UTF-8 JSON.`);
  }
}

function parseCli(argv) {
  const [command, ...rest] = argv;
  if (command !== "review") {
    reviewFail(
      "CLI_INVALID",
      "Usage: layered-godot-repository-review.mjs review --plan FILE --receipt FILE --audit-receipt FILE --runtime-receipt FILE --handoff-receipt FILE --workspace DIR --repository OWNER/REPO",
    );
  }
  if (rest.length % 2 !== 0) {
    reviewFail("CLI_INVALID", "CLI flags must be --flag value pairs.");
  }
  const values = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) {
      reviewFail("CLI_INVALID", `Invalid CLI argument near ${String(flag)}.`);
    }
    if (values.has(flag)) {
      reviewFail("CLI_INVALID", `Duplicate CLI argument ${flag}.`);
    }
    values.set(flag, value);
  }
  const allowed = [
    "--plan",
    "--receipt",
    "--audit-receipt",
    "--runtime-receipt",
    "--handoff-receipt",
    "--workspace",
    "--repository",
  ];
  for (const key of allowed) {
    if (!values.has(key)) reviewFail("CLI_INVALID", `Missing ${key}.`);
  }
  for (const key of values.keys()) {
    if (!allowed.includes(key)) reviewFail("CLI_INVALID", `Unknown CLI argument ${key}.`);
  }
  return {
    planPath: values.get("--plan"),
    receiptPath: values.get("--receipt"),
    auditPath: values.get("--audit-receipt"),
    runtimePath: values.get("--runtime-receipt"),
    handoffPath: values.get("--handoff-receipt"),
    workspaceRoot: path.resolve(values.get("--workspace")),
    expectedRepository: values.get("--repository"),
  };
}

async function main() {
  try {
    const cli = parseCli(process.argv.slice(2));
    const filesystem = await import("./layered-godot-workspace-writer/filesystem.mjs");
    const deps = { readStableRegularFile: filesystem.readStableRegularFile };
    const [
      integrationPlan,
      writeReceipt,
      auditReceipt,
      runtimeValidationReceipt,
      handoffReceipt,
    ] = await Promise.all([
      readJson(cli.planPath, "integration plan", deps),
      readJson(cli.receiptPath, "write receipt", deps),
      readJson(cli.auditPath, "audit receipt", deps),
      readJson(cli.runtimePath, "runtime validation receipt", deps),
      readJson(cli.handoffPath, "handoff receipt", deps),
    ]);
    console.log(
      JSON.stringify(
        await reviewLayeredGodotRepository({
          integrationPlan,
          writeReceipt,
          auditReceipt,
          runtimeValidationReceipt,
          handoffReceipt,
          workspaceRoot: cli.workspaceRoot,
          expectedRepository: cli.expectedRepository,
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
            error instanceof LayeredGodotRepositoryReviewError
              ? error.code
              : "LAYERED_GODOT_REPOSITORY_REVIEW_FAILED",
          message: error instanceof Error ? error.message : String(error),
          ...(error instanceof LayeredGodotRepositoryReviewError &&
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
