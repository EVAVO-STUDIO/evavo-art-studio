#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LayeredGodotWorkspaceWriterError, canonicalSha256, fail, repositoryName } from "./layered-godot-workspace-writer.mjs";
import { LAYERED_GODOT_WORKSPACE_AUDIT_RECEIPT_KIND, LAYERED_GODOT_WORKSPACE_AUDITOR_PROTOCOL_VERSION, auditLayeredGodotWorkspace } from "./layered-godot-workspace-auditor.mjs";
import { LAYERED_GODOT_RUNTIME_VALIDATION_RECEIPT_KIND, LAYERED_GODOT_RUNTIME_VALIDATOR_PROTOCOL_VERSION, REQUIRED_GODOT_VERSION } from "./layered-godot-runtime-validator.mjs";
import { inspectWorkspaceRoot, readStableRegularFile, sameFilesystemPath } from "./layered-godot-workspace-writer/filesystem.mjs";
import { assertNoOutstandingTransactions } from "./layered-godot-workspace-writer/journal.mjs";

export const LAYERED_GODOT_HANDOFF_GATE_PROTOCOL_VERSION = "2026-08-12.1";
export const LAYERED_GODOT_HANDOFF_GATE_RECEIPT_KIND = "evavo.layered-production.godot-handoff-gate-receipt";
const MAXIMUM_INPUT_BYTES = 32 * 1024 * 1024;
const SHA256 = /^[0-9a-f]{64}$/u;
const gateFail = (code, message, details = undefined) => fail(`LAYERED_GODOT_HANDOFF_${code}`, message, details);
function object(value, label) { if (value === null || typeof value !== "object" || Array.isArray(value)) gateFail("INPUT_INVALID", `${label} must be an object.`); return value; }
function sha(value, label) { if (typeof value !== "string" || !SHA256.test(value)) gateFail("INPUT_INVALID", `${label} must be lowercase SHA-256.`); return value; }
function utc(value, label) { if (typeof value !== "string" || value.length > 64) gateFail("INPUT_INVALID", `${label} must be canonical UTC ISO-8601.`); const parsed = new Date(value); if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) gateFail("INPUT_INVALID", `${label} must be canonical UTC ISO-8601.`); return value; }
function stableAudit(value) { const { auditSha256: _hash, auditedAt: _time, ...stable } = value; return stable; }
function validateAuditReceipt(value) {
  const receipt = object(value, "auditReceipt");
  if (receipt.schemaVersion !== "1.0" || receipt.kind !== LAYERED_GODOT_WORKSPACE_AUDIT_RECEIPT_KIND || receipt.protocolVersion !== LAYERED_GODOT_WORKSPACE_AUDITOR_PROTOCOL_VERSION) gateFail("AUDIT_INVALID", "Audit receipt schema, kind or protocol is not current.");
  sha(receipt.auditSha256, "auditReceipt.auditSha256");
  const { auditSha256, ...payload } = receipt;
  if (canonicalSha256(payload) !== auditSha256) gateFail("AUDIT_INVALID", "Audit receipt self-hash is invalid.");
  utc(receipt.auditedAt, "auditReceipt.auditedAt");
  return receipt;
}
function assertCurrentAudit(supplied, current) {
  validateAuditReceipt(supplied);
  if (canonicalSha256(stableAudit(supplied)) !== canonicalSha256(stableAudit(current))) gateFail("TARGET_DRIFT", "Selected workspace no longer matches the audit state used for runtime validation.");
}
function assertFalseAuthority(authority, keys, label) {
  const value = object(authority, label);
  for (const key of keys) if (value[key] !== false) gateFail("RUNTIME_RECEIPT_INVALID", `${label}.${key} must be false.`);
  return value;
}
function validateRuntimeReceipt(value, { currentAudit, auditReceipt, repository, root, integrationPlan }) {
  const receipt = object(value, "runtimeValidationReceipt");
  if (receipt.schemaVersion !== "1.0" || receipt.kind !== LAYERED_GODOT_RUNTIME_VALIDATION_RECEIPT_KIND || receipt.protocolVersion !== LAYERED_GODOT_RUNTIME_VALIDATOR_PROTOCOL_VERSION) gateFail("RUNTIME_RECEIPT_INVALID", "Runtime receipt schema, kind or protocol is not current.");
  sha(receipt.validationSha256, "runtimeValidationReceipt.validationSha256");
  const { validationSha256, ...payload } = receipt;
  if (canonicalSha256(payload) !== validationSha256) gateFail("RUNTIME_RECEIPT_INVALID", "Runtime validation receipt self-hash is invalid.");
  for (const [key, expected] of [["requestSha256", currentAudit.requestSha256], ["integrationSha256", currentAudit.integrationSha256], ["writeReceiptSha256", currentAudit.writeReceiptSha256], ["inputAuditSha256", auditReceipt.auditSha256]]) {
    if (sha(receipt[key], `runtimeValidationReceipt.${key}`) !== expected) gateFail("RUNTIME_RECEIPT_INVALID", `Runtime validation receipt ${key} is not bound to the current handoff.`);
  }
  sha(receipt.preExecutionAuditSha256, "runtimeValidationReceipt.preExecutionAuditSha256");
  sha(receipt.postExecutionAuditSha256, "runtimeValidationReceipt.postExecutionAuditSha256");
  const target = object(receipt.target, "runtimeValidationReceipt.target");
  if (target.expectedRepository !== repository || typeof target.workspaceRoot !== "string" || !sameFilesystemPath(target.workspaceRoot, root.realPath) || !sameFilesystemPath(currentAudit.target.workspaceRoot, root.realPath)) gateFail("RUNTIME_RECEIPT_INVALID", "Runtime validation target is not the selected repository workspace.");
  const engine = object(receipt.engine, "runtimeValidationReceipt.engine");
  if (engine.requiredVersion !== REQUIRED_GODOT_VERSION || typeof engine.reportedVersion !== "string" || !new RegExp(`^${REQUIRED_GODOT_VERSION.replaceAll(".", "\\.")}(?:[.\\s]|$)`, "u").test(engine.reportedVersion) || typeof engine.executablePath !== "string" || !path.isAbsolute(engine.executablePath) || !SHA256.test(engine.executableSha256) || !Number.isSafeInteger(engine.executableBytes) || engine.executableBytes <= 0) gateFail("RUNTIME_RECEIPT_INVALID", "Runtime validation engine evidence is malformed or not exact Godot 4.6.2.");
  const sandbox = object(receipt.sandbox, "runtimeValidationReceipt.sandbox");
  if (sandbox.strategy !== "ephemeral-exact-resource-copy" || sandbox.exactIntegrationResources !== 7 || sandbox.scenePath !== integrationPlan?.scene?.path || sandbox.targetWorkspaceMounted !== false || sandbox.removedAfterValidation !== true) gateFail("RUNTIME_RECEIPT_INVALID", "Runtime validation sandbox evidence is not the governed isolated form.");
  const execution = object(receipt.execution, "runtimeValidationReceipt.execution");
  const evidence = object(execution.evidence, "runtimeValidationReceipt.execution.evidence");
  if (execution.headless !== true || execution.sceneInstantiationPerformed !== true || execution.sceneTreeActivationPerformed !== false || execution.exitCode !== 0 || evidence.event !== "evavo_layered_godot_runtime_validated" || evidence.scene !== `res://${integrationPlan.scene.path}` || typeof evidence.rootName !== "string" || !evidence.rootName || typeof evidence.rootType !== "string" || !evidence.rootType) gateFail("RUNTIME_RECEIPT_INVALID", "Runtime validation execution evidence is incomplete.");
  for (const key of ["stdoutSha256", "stderrSha256"]) sha(execution[key], `runtimeValidationReceipt.execution.${key}`);
  for (const key of ["stdoutBytes", "stderrBytes"]) if (!Number.isSafeInteger(execution[key]) || execution[key] < 0) gateFail("RUNTIME_RECEIPT_INVALID", `runtimeValidationReceipt.execution.${key} is invalid.`);
  utc(receipt.validatedAt, "runtimeValidationReceipt.validatedAt");
  const authority = object(receipt.authority, "runtimeValidationReceipt.authority");
  if (authority.godotExecutionPerformed !== true || authority.sandboxFileWritePerformed !== true || authority.targetRepositoryReadPerformed !== true) gateFail("RUNTIME_RECEIPT_INVALID", "Runtime validation receipt does not prove its bounded execution authority.");
  assertFalseAuthority(authority, ["targetRepositoryMutationPerformed", "targetRuntimeActivationPerformed", "gitCommitCreated", "gitPushPerformed", "deploymentPerformed", "publicationPerformed", "forcePushPerformed"], "runtimeValidationReceipt.authority");
  return receipt;
}

export async function gateLayeredGodotHandoff({ integrationPlan, writeReceipt, auditReceipt, runtimeValidationReceipt, workspaceRoot, expectedRepository }, dependencies = {}) {
  const auditWorkspace = dependencies.auditWorkspace ?? auditLayeredGodotWorkspace;
  const repository = repositoryName(expectedRepository, "expectedRepository");
  const root = await inspectWorkspaceRoot(path.resolve(workspaceRoot));
  await assertNoOutstandingTransactions(root);
  const currentAudit = await auditWorkspace({ integrationPlan, writeReceipt, workspaceRoot: root.path, expectedRepository: repository });
  assertCurrentAudit(auditReceipt, currentAudit);
  const runtimeReceipt = validateRuntimeReceipt(runtimeValidationReceipt, { currentAudit, auditReceipt, repository, root, integrationPlan });
  await assertNoOutstandingTransactions(root);
  const payload = {
    schemaVersion: "1.0",
    kind: LAYERED_GODOT_HANDOFF_GATE_RECEIPT_KIND,
    protocolVersion: LAYERED_GODOT_HANDOFF_GATE_PROTOCOL_VERSION,
    requestSha256: currentAudit.requestSha256,
    integrationSha256: currentAudit.integrationSha256,
    writeReceiptSha256: currentAudit.writeReceiptSha256,
    auditReceiptSha256: auditReceipt.auditSha256,
    runtimeValidationSha256: runtimeReceipt.validationSha256,
    currentAuditSha256: currentAudit.auditSha256,
    target: { expectedRepository: repository, workspaceRoot: root.realPath },
    readiness: { repositoryReviewReady: true, gitCommitAuthorized: false, gitPushAuthorized: false, requiresExplicitRepositoryReview: true, requiresExplicitGitOperator: true },
    gatedAt: new Date().toISOString(),
    authority: { targetRepositoryReadPerformed: true, targetRepositoryMutationPerformed: false, godotExecutionPerformed: false, runtimeActivationPerformed: false, gitCommitCreated: false, gitPushPerformed: false, deploymentPerformed: false, publicationPerformed: false, forcePushPerformed: false },
  };
  return Object.freeze({ ...payload, gateSha256: canonicalSha256(payload) });
}
async function readJson(filePath, label) {
  const inspected = await readStableRegularFile(path.resolve(filePath), label);
  if (inspected.bytes > MAXIMUM_INPUT_BYTES) gateFail("INPUT_INVALID", `${label} exceeds the bounded byte limit.`);
  try { return JSON.parse(inspected.data.toString("utf8")); } catch { gateFail("INPUT_INVALID", `${label} is not valid UTF-8 JSON.`); }
}
function parseCli(argv) {
  const [command, ...rest] = argv;
  if (command !== "gate") gateFail("CLI_INVALID", "Usage: layered-godot-handoff-gate.mjs gate --plan FILE --receipt FILE --audit-receipt FILE --runtime-receipt FILE --workspace DIR --repository OWNER/REPO");
  const values = new Map();
  for (let index = 0; index < rest.length; index += 2) { const flag = rest[index]; const value = rest[index + 1]; if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) gateFail("CLI_INVALID", `Invalid CLI argument near ${String(flag)}.`); if (values.has(flag)) gateFail("CLI_INVALID", `Duplicate CLI argument ${flag}.`); values.set(flag, value); }
  const allowed = ["--plan", "--receipt", "--audit-receipt", "--runtime-receipt", "--workspace", "--repository"];
  for (const key of allowed) if (!values.has(key)) gateFail("CLI_INVALID", `Missing required CLI argument ${key}.`);
  for (const key of values.keys()) if (!allowed.includes(key)) gateFail("CLI_INVALID", `Unknown CLI argument ${key}.`);
  return { planPath: values.get("--plan"), receiptPath: values.get("--receipt"), auditPath: values.get("--audit-receipt"), runtimePath: values.get("--runtime-receipt"), workspaceRoot: path.resolve(values.get("--workspace")), expectedRepository: values.get("--repository") };
}
async function main() {
  try {
    const cli = parseCli(process.argv.slice(2));
    const [integrationPlan, writeReceipt, auditReceipt, runtimeValidationReceipt] = await Promise.all([readJson(cli.planPath, "integration plan"), readJson(cli.receiptPath, "write receipt"), readJson(cli.auditPath, "audit receipt"), readJson(cli.runtimePath, "runtime validation receipt")]);
    console.log(JSON.stringify(await gateLayeredGodotHandoff({ integrationPlan, writeReceipt, auditReceipt, runtimeValidationReceipt, workspaceRoot: cli.workspaceRoot, expectedRepository: cli.expectedRepository }), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ code: error instanceof LayeredGodotWorkspaceWriterError ? error.code : "LAYERED_GODOT_HANDOFF_FAILED", message: error instanceof Error ? error.message : String(error), ...(error instanceof LayeredGodotWorkspaceWriterError && error.details !== undefined ? { details: error.details } : {}) }, null, 2));
    process.exitCode = 1;
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
