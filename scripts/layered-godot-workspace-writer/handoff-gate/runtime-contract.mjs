import { canonicalSha256 } from "../../layered-godot-workspace-writer.mjs";
import {
  LAYERED_GODOT_RUNTIME_VALIDATION_RECEIPT_KIND,
  LAYERED_GODOT_RUNTIME_VALIDATOR_PROTOCOL_VERSION,
  REQUIRED_GODOT_VERSION,
} from "../../layered-godot-runtime-validator.mjs";
import { sameFilesystemPath } from "../filesystem.mjs";
import {
  RUNTIME_AUTHORITY_KEYS,
  absolutePath,
  boundedText,
  exactObject,
  gateFail,
  repository,
  safeBytes,
  sha,
  utc,
  validateFilesystemIdentity,
} from "./common.mjs";

export function validateRuntimeReceipt(
  value,
  { currentAudit, auditReceipt, repository: selectedRepository, root, integrationPlan },
) {
  const code = "RUNTIME_RECEIPT_INVALID";
  const label = "runtimeValidationReceipt";
  const receipt = exactObject(
    value,
    [
      "schemaVersion",
      "kind",
      "protocolVersion",
      "requestSha256",
      "integrationSha256",
      "writeReceiptSha256",
      "inputAuditSha256",
      "preExecutionAuditSha256",
      "postExecutionAuditSha256",
      "target",
      "engine",
      "sandbox",
      "execution",
      "validatedAt",
      "authority",
      "validationSha256",
    ],
    label,
    code,
  );

  if (
    receipt.schemaVersion !== "1.0" ||
    receipt.kind !== LAYERED_GODOT_RUNTIME_VALIDATION_RECEIPT_KIND ||
    receipt.protocolVersion !== LAYERED_GODOT_RUNTIME_VALIDATOR_PROTOCOL_VERSION
  ) {
    gateFail(code, "Runtime receipt schema, kind or protocol is not current.");
  }

  sha(receipt.validationSha256, `${label}.validationSha256`, code);
  const { validationSha256, ...payload } = receipt;
  if (canonicalSha256(payload) !== validationSha256) {
    gateFail(code, "Runtime validation receipt self-hash is invalid.");
  }

  for (const [key, expected] of [
    ["requestSha256", currentAudit.requestSha256],
    ["integrationSha256", currentAudit.integrationSha256],
    ["writeReceiptSha256", currentAudit.writeReceiptSha256],
    ["inputAuditSha256", auditReceipt.auditSha256],
  ]) {
    if (sha(receipt[key], `${label}.${key}`, code) !== expected) {
      gateFail(code, `Runtime validation receipt ${key} is not bound to the current handoff.`);
    }
  }
  sha(receipt.preExecutionAuditSha256, `${label}.preExecutionAuditSha256`, code);
  sha(receipt.postExecutionAuditSha256, `${label}.postExecutionAuditSha256`, code);

  const target = exactObject(
    receipt.target,
    ["expectedRepository", "workspaceRoot"],
    `${label}.target`,
    code,
  );
  if (
    repository(target.expectedRepository, `${label}.target.expectedRepository`, code) !==
      selectedRepository ||
    !sameFilesystemPath(
      absolutePath(target.workspaceRoot, `${label}.target.workspaceRoot`, code),
      root.realPath,
    ) ||
    !sameFilesystemPath(currentAudit.target.workspaceRoot, root.realPath)
  ) {
    gateFail(code, "Runtime validation target is not the selected repository workspace.");
  }

  const engine = exactObject(
    receipt.engine,
    [
      "requiredVersion",
      "reportedVersion",
      "executablePath",
      "executableSha256",
      "executableBytes",
      "filesystemIdentity",
    ],
    `${label}.engine`,
    code,
  );
  const reportedVersion = boundedText(
    engine.reportedVersion,
    `${label}.engine.reportedVersion`,
    240,
    code,
  );
  const versionPattern = new RegExp(
    `^${REQUIRED_GODOT_VERSION.replaceAll(".", "\\.")}(?:[.\\s]|$)`,
    "u",
  );
  if (
    engine.requiredVersion !== REQUIRED_GODOT_VERSION ||
    !versionPattern.test(reportedVersion)
  ) {
    gateFail(code, `Runtime validation engine is not exact Godot ${REQUIRED_GODOT_VERSION}.`);
  }
  absolutePath(engine.executablePath, `${label}.engine.executablePath`, code);
  sha(engine.executableSha256, `${label}.engine.executableSha256`, code);
  safeBytes(engine.executableBytes, `${label}.engine.executableBytes`, code, {
    positive: true,
  });
  validateFilesystemIdentity(
    engine.filesystemIdentity,
    `${label}.engine.filesystemIdentity`,
    code,
    engine.executableBytes,
  );

  const sandbox = exactObject(
    receipt.sandbox,
    [
      "strategy",
      "exactIntegrationResources",
      "scenePath",
      "targetWorkspaceMounted",
      "removedAfterValidation",
    ],
    `${label}.sandbox`,
    code,
  );
  if (
    sandbox.strategy !== "ephemeral-exact-resource-copy" ||
    sandbox.exactIntegrationResources !== 7 ||
    sandbox.scenePath !== integrationPlan?.scene?.path ||
    sandbox.targetWorkspaceMounted !== false ||
    sandbox.removedAfterValidation !== true
  ) {
    gateFail(code, "Runtime validation sandbox evidence is not the governed isolated form.");
  }

  const execution = exactObject(
    receipt.execution,
    [
      "headless",
      "sceneInstantiationPerformed",
      "sceneTreeActivationPerformed",
      "exitCode",
      "stdoutSha256",
      "stdoutBytes",
      "stderrSha256",
      "stderrBytes",
      "evidence",
    ],
    `${label}.execution`,
    code,
  );
  const evidence = exactObject(
    execution.evidence,
    ["event", "scene", "rootName", "rootType"],
    `${label}.execution.evidence`,
    code,
  );
  if (
    execution.headless !== true ||
    execution.sceneInstantiationPerformed !== true ||
    execution.sceneTreeActivationPerformed !== false ||
    execution.exitCode !== 0 ||
    evidence.event !== "evavo_layered_godot_runtime_validated" ||
    evidence.scene !== `res://${integrationPlan.scene.path}`
  ) {
    gateFail(code, "Runtime validation execution evidence is incomplete.");
  }
  boundedText(evidence.rootName, `${label}.execution.evidence.rootName`, 240, code);
  boundedText(evidence.rootType, `${label}.execution.evidence.rootType`, 240, code);
  sha(execution.stdoutSha256, `${label}.execution.stdoutSha256`, code);
  sha(execution.stderrSha256, `${label}.execution.stderrSha256`, code);
  safeBytes(execution.stdoutBytes, `${label}.execution.stdoutBytes`, code, {
    positive: true,
  });
  safeBytes(execution.stderrBytes, `${label}.execution.stderrBytes`, code);
  utc(receipt.validatedAt, `${label}.validatedAt`, code);

  const authority = exactObject(
    receipt.authority,
    RUNTIME_AUTHORITY_KEYS,
    `${label}.authority`,
    code,
  );
  for (const key of [
    "godotExecutionPerformed",
    "sandboxFileWritePerformed",
    "targetRepositoryReadPerformed",
  ]) {
    if (authority[key] !== true) {
      gateFail(code, `${label}.authority.${key} must be true.`);
    }
  }
  for (const key of RUNTIME_AUTHORITY_KEYS.slice(3)) {
    if (authority[key] !== false) {
      gateFail(code, `${label}.authority.${key} must remain false.`);
    }
  }
  return receipt;
}
