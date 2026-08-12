#!/usr/bin/env node

import path from "node:path";
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
  record,
  repositoryName,
  reviewFail,
  semanticHandoff,
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
} from "./layered-godot-repository-review/contract.mjs";
export { runGitReadOnly } from "./layered-godot-repository-review/git-readonly.mjs";

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

export async function reviewLayeredGodotRepository(
  {
    integrationPlan,
    writeReceipt,
    auditReceipt,
    runtimeValidationReceipt,
    handoffReceipt,
    workspaceRoot,
    expectedRepository,
  },
  dependencies = {},
) {
  const defaults = dependencies.complete === true ? {} : await resolveDefaultDependencies();
  const deps = { ...defaults, ...dependencies };
  const repository = repositoryName(expectedRepository, "expectedRepository");
  const root = await deps.inspectWorkspaceRoot(path.resolve(workspaceRoot));
  const suppliedHandoff = validateSuppliedHandoffReceipt(handoffReceipt, repository, deps.sameFilesystemPath, root);
  const write = record(writeReceipt, "writeReceipt");
  const verified = deps.verifyWriteRequest({
    schemaVersion: "1.0",
    kind: deps.writeRequestKind,
    requestId: write.requestId,
    revision: write.revision,
    expectedRepository: repository,
    workspaceRoot: root.path,
    integrationPlan,
  });
  if (
    verified.requestSha256 !== suppliedHandoff.requestSha256 ||
    verified.integration.integrationSha256 !== suppliedHandoff.integrationSha256 ||
    write.receiptSha256 !== suppliedHandoff.writeReceiptSha256
  ) reviewFail("HANDOFF_INVALID", "Handoff receipt is not bound to the exact verified write request and receipt.");

  const gateInput = {
    integrationPlan, writeReceipt, auditReceipt, runtimeValidationReceipt,
    workspaceRoot: root.path, expectedRepository: repository,
  };
  const currentGateBefore = await deps.gateHandoff(gateInput);
  assertHandoffStillCurrent(suppliedHandoff, currentGateBefore);
  const before = await inspectGitSnapshot({
    root, repository, resources: verified.integration.resources,
    runGit: deps.runGit, sameFilesystemPath: deps.sameFilesystemPath,
  });
  const currentGateAfter = await deps.gateHandoff(gateInput);
  assertHandoffStillCurrent(suppliedHandoff, currentGateAfter);
  const after = await inspectGitSnapshot({
    root, repository, resources: verified.integration.resources,
    runGit: deps.runGit, sameFilesystemPath: deps.sameFilesystemPath,
  });
  if (
    canonicalSha256(semanticHandoff(currentGateBefore)) !== canonicalSha256(semanticHandoff(currentGateAfter)) ||
    snapshotIdentity(before) !== snapshotIdentity(after)
  ) reviewFail("REPOSITORY_DRIFT", "Repository or governed handoff state changed during read-only review.");

  const changedExpectedResources = after.modifiedExpectedPaths.length + after.untrackedExpectedPaths.length;
  const payload = {
    schemaVersion: "1.0",
    kind: LAYERED_GODOT_REPOSITORY_REVIEW_RECEIPT_KIND,
    protocolVersion: LAYERED_GODOT_REPOSITORY_REVIEW_PROTOCOL_VERSION,
    requestSha256: suppliedHandoff.requestSha256,
    integrationSha256: suppliedHandoff.integrationSha256,
    writeReceiptSha256: suppliedHandoff.writeReceiptSha256,
    handoffGateSha256: suppliedHandoff.gateSha256,
    target: { expectedRepository: repository, workspaceRoot: root.realPath },
    git: {
      version: after.version, repositoryRoot: after.root, objectFormat: after.objectFormat,
      head: after.head, branch: after.branch, originUrl: after.originUrl,
      originRepository: after.originRepository, attributesSha256: after.attributesSha256,
      snapshotSha256: snapshotIdentity(after),
    },
    workingTree: {
      stagedPaths: after.stagedPaths, modifiedExpectedPaths: after.modifiedExpectedPaths,
      untrackedExpectedPaths: after.untrackedExpectedPaths, unchangedExpectedPaths: after.unchangedExpectedPaths,
      unrelatedPaths: after.unrelatedPaths, expectedResources: verified.integration.resources.length,
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
  };
  return Object.freeze({ ...payload, reviewSha256: canonicalSha256(payload) });
}

async function readJson(filePath, label, deps) {
  const inspected = await deps.readStableRegularFile(path.resolve(filePath), label);
  if (inspected.bytes > MAXIMUM_REVIEW_INPUT_BYTES) reviewFail("INPUT_INVALID", `${label} exceeds the bounded byte limit.`);
  try { return JSON.parse(inspected.data.toString("utf8")); }
  catch { reviewFail("INPUT_INVALID", `${label} is not valid UTF-8 JSON.`); }
}

function parseCli(argv) {
  const [command, ...rest] = argv;
  if (command !== "review") reviewFail("CLI_INVALID", "Usage: layered-godot-repository-review.mjs review --plan FILE --receipt FILE --audit-receipt FILE --runtime-receipt FILE --handoff-receipt FILE --workspace DIR --repository OWNER/REPO");
  if (rest.length % 2 !== 0) reviewFail("CLI_INVALID", "CLI flags must be --flag value pairs.");
  const values = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index], value = rest[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) reviewFail("CLI_INVALID", `Invalid CLI argument near ${String(flag)}.`);
    if (values.has(flag)) reviewFail("CLI_INVALID", `Duplicate CLI argument ${flag}.`);
    values.set(flag, value);
  }
  const allowed = ["--plan", "--receipt", "--audit-receipt", "--runtime-receipt", "--handoff-receipt", "--workspace", "--repository"];
  for (const key of allowed) if (!values.has(key)) reviewFail("CLI_INVALID", `Missing ${key}.`);
  for (const key of values.keys()) if (!allowed.includes(key)) reviewFail("CLI_INVALID", `Unknown CLI argument ${key}.`);
  return {
    planPath: values.get("--plan"), receiptPath: values.get("--receipt"), auditPath: values.get("--audit-receipt"),
    runtimePath: values.get("--runtime-receipt"), handoffPath: values.get("--handoff-receipt"),
    workspaceRoot: path.resolve(values.get("--workspace")), expectedRepository: values.get("--repository"),
  };
}

async function main() {
  try {
    const cli = parseCli(process.argv.slice(2));
    const filesystem = await import("./layered-godot-workspace-writer/filesystem.mjs");
    const deps = { readStableRegularFile: filesystem.readStableRegularFile };
    const [integrationPlan, writeReceipt, auditReceipt, runtimeValidationReceipt, handoffReceipt] = await Promise.all([
      readJson(cli.planPath, "integration plan", deps), readJson(cli.receiptPath, "write receipt", deps),
      readJson(cli.auditPath, "audit receipt", deps), readJson(cli.runtimePath, "runtime validation receipt", deps),
      readJson(cli.handoffPath, "handoff receipt", deps),
    ]);
    console.log(JSON.stringify(await reviewLayeredGodotRepository({
      integrationPlan, writeReceipt, auditReceipt, runtimeValidationReceipt, handoffReceipt,
      workspaceRoot: cli.workspaceRoot, expectedRepository: cli.expectedRepository,
    }), null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      code: error instanceof LayeredGodotRepositoryReviewError ? error.code : "LAYERED_GODOT_REPOSITORY_REVIEW_FAILED",
      message: error instanceof Error ? error.message : String(error),
      ...(error instanceof LayeredGodotRepositoryReviewError && error.details !== undefined ? { details: error.details } : {}),
    }, null, 2));
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
