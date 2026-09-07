#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-header-publication-rollback-readiness";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const CONTRACT = "evavo.work-header-publication-rollback-readiness.v1";
const SCHEMA_SHA256 = "cc56d28b46f98cea1f97b46aa9988522c6b97424ee853a7c6c968a45ffd77f6d";
const SCHEMA_URL = new URL("../contracts/work-header-publication-rollback-readiness-v1.schema.json", import.meta.url);
const EXECUTION_RESULT_CONTRACT = "evavo.work-header-publication-execution-result.v1";
const EXECUTION_RESULT_SCHEMA_SHA256 = "6d94ca926dea8c5c0fdc025c3d65a8692ae5c8c6e61db2d37a536ae352d52445";
const CLAIM_CONTRACT = "evavo.work-header-publication-execution-claim.v1";
const AUTHORIZATION_CONTRACT = "evavo.work-header-publication-execution-authorization.v1";
const PLAN_CONTRACT = "evavo.work-header-publication-transaction-plan.v1";
const ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";
const allowed = (p, output = false) => assertAllowedLocalPath(p, { envName: ROOTS_ENV, output, label: "work header publication rollback readiness" });
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function assertCurrentSchemaDigest() {
  const bytes = await readFile(SCHEMA_URL);
  const current = sha256(bytes);
  if (current !== SCHEMA_SHA256) throw new Error(`Rollback-readiness schema bytes drifted from governed SHA-256 (${current}).`);
}

async function bound(filePath) {
  const resolved = await allowed(filePath, false);
  const bytes = await readFile(resolved);
  if (!bytes.length) throw new Error(`Evidence file is empty: ${resolved}`);
  return Object.freeze({ path: resolved, bytes, sha256: sha256(bytes), byteLength: bytes.length });
}

function assertNoMutationAuthority(value, label) {
  for (const field of ["publicationAllowed", "cloudOverwriteAllowed", "websiteMutationAllowed"]) {
    if (value?.[field] !== false) throw new Error(`${label} carries forbidden mutation authority (${field}).`);
  }
  if (value?.executionAllowed !== undefined && value.executionAllowed !== false) throw new Error(`${label} carries forbidden direct execution authority.`);
}

function deterministicReceiptPath(resultPath) {
  return `${resultPath}.rollback-readiness.json`;
}

async function reverifyExecutionResult(executionResultReceiptPath) {
  const resultFile = await bound(executionResultReceiptPath);
  const result = JSON.parse(resultFile.bytes.toString("utf8"));
  if (result.contract !== EXECUTION_RESULT_CONTRACT || result.schemaSha256 !== EXECUTION_RESULT_SCHEMA_SHA256 || result.resultState !== "executed-verified") throw new Error("Execution-result receipt contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(result, "Execution-result receipt");
  for (const field of ["claimReverifiedBeforeAttestation", "candidateBytesReverified", "postExecutionTargetMatchesCandidate", "postExecutionTargetDiffersFromPreviousTarget", "rollbackBackupPreserved", "resultIsEvidenceOnly"]) {
    if (result[field] !== true) throw new Error(`Execution-result receipt lacks required invariant ${field}.`);
  }

  const claimFile = await bound(result.claimReceiptPath);
  if (claimFile.sha256 !== result.claimReceiptSha256 || claimFile.byteLength !== result.claimReceiptByteLength) throw new Error("Execution-result claim lineage changed after attestation.");
  const claim = JSON.parse(claimFile.bytes.toString("utf8"));
  if (claim.contract !== CLAIM_CONTRACT || claim.claimState !== "claimed-unexecuted") throw new Error("Execution claim contract/state is invalid or stale.");
  assertNoMutationAuthority(claim, "Execution claim");

  const authorizationFile = await bound(result.authorizationReceiptPath);
  if (authorizationFile.sha256 !== result.authorizationReceiptSha256 || authorizationFile.byteLength !== result.authorizationReceiptByteLength) throw new Error("Execution-result authorization lineage changed after attestation.");
  const authorization = JSON.parse(authorizationFile.bytes.toString("utf8"));
  if (authorization.contract !== AUTHORIZATION_CONTRACT || authorization.authorizationState !== "authorized-unexecuted") throw new Error("Execution authorization contract/state is invalid or stale.");
  assertNoMutationAuthority(authorization, "Execution authorization");

  const planFile = await bound(result.transactionPlanReceiptPath);
  if (planFile.sha256 !== result.transactionPlanReceiptSha256 || planFile.byteLength !== result.transactionPlanReceiptByteLength) throw new Error("Execution-result transaction-plan lineage changed after attestation.");
  const plan = JSON.parse(planFile.bytes.toString("utf8"));
  if (plan.contract !== PLAN_CONTRACT || plan.transactionState !== "planned-unexecuted") throw new Error("Publication transaction plan contract/state is invalid or stale.");
  assertNoMutationAuthority(plan, "Publication transaction plan");

  for (const field of ["route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier"]) {
    if (result[field] !== plan[field]) throw new Error(`Execution-result identity drifted from transaction plan for ${field}.`);
  }

  const postTarget = await bound(result.postExecutionTargetPath);
  if (postTarget.sha256 !== result.postExecutionTargetSha256 || postTarget.byteLength !== result.postExecutionTargetByteLength || postTarget.sha256 !== result.candidateSha256 || postTarget.byteLength !== result.candidateByteLength) throw new Error("Current published target no longer exactly matches the executed reviewed candidate bytes.");

  const snapshot = await bound(plan.currentTargetSnapshot?.path);
  if (snapshot.sha256 !== result.previousTargetSnapshotSha256 || snapshot.byteLength !== result.previousTargetSnapshotByteLength || snapshot.sha256 !== plan.currentTargetSnapshot?.sha256 || snapshot.byteLength !== plan.currentTargetSnapshot?.byteLength) throw new Error("Previous-target snapshot bytes changed after publication execution.");

  const backup = await bound(plan.rollbackEvidence?.backupPath);
  if (backup.sha256 !== result.rollbackBackupSha256 || backup.byteLength !== result.rollbackBackupByteLength || backup.sha256 !== snapshot.sha256 || backup.byteLength !== snapshot.byteLength) throw new Error("Rollback backup no longer exactly matches the previous-target snapshot.");
  if (backup.path === snapshot.path) throw new Error("Rollback backup must remain a separate physical evidence file from the previous-target snapshot.");
  if (plan.rollbackEvidence?.rollbackReady !== true || plan.rollbackEvidence?.restoreTargetIdentifier !== result.targetIdentifier) throw new Error("Transaction plan no longer declares a rollback-ready backup for the same target.");

  return Object.freeze({ resultFile, result, claimFile, claim, authorizationFile, authorization, planFile, plan, postTarget, snapshot, backup });
}

async function prepare(args) {
  await assertCurrentSchemaDigest();
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required to write rollback-readiness evidence.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);
  if (typeof args.executionResultReceiptPath !== "string") throw new Error("executionResultReceiptPath is required.");

  const review = await reverifyExecutionResult(args.executionResultReceiptPath);
  const receiptPath = await allowed(deterministicReceiptPath(review.resultFile.path), true);
  const receipt = {
    contract: CONTRACT,
    schemaSha256: SCHEMA_SHA256,
    rollbackState: "rollback-ready-unexecuted",
    executionResultReceiptPath: review.resultFile.path,
    executionResultReceiptSha256: review.resultFile.sha256,
    executionResultReceiptByteLength: review.resultFile.byteLength,
    route: review.result.route,
    candidateId: review.result.candidateId,
    candidateSha256: review.result.candidateSha256,
    candidateByteLength: review.result.candidateByteLength,
    targetKind: review.result.targetKind,
    targetIdentifier: review.result.targetIdentifier,
    publishedTargetPath: review.postTarget.path,
    publishedTargetSha256: review.postTarget.sha256,
    publishedTargetByteLength: review.postTarget.byteLength,
    rollbackBackupPath: review.backup.path,
    rollbackBackupSha256: review.backup.sha256,
    rollbackBackupByteLength: review.backup.byteLength,
    previousTargetSnapshotSha256: review.snapshot.sha256,
    previousTargetSnapshotByteLength: review.snapshot.byteLength,
    executionResultReverified: true,
    currentPublishedTargetReverified: true,
    rollbackBackupReverified: true,
    currentPublishedTargetMatchesCandidate: true,
    rollbackBackupMatchesPreviousTarget: true,
    rollbackPreparationOnly: true,
    rollbackExecutionAllowed: false,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
  };
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeCreateOnlyBundle([{ path: receiptPath, data: payload, encoding: "utf8" }]);
  return Object.freeze({ ok: true, receiptPath, receiptSha256: sha256(Buffer.from(payload, "utf8")), rollbackState: receipt.rollbackState, route: receipt.route, candidateId: receipt.candidateId, targetKind: receipt.targetKind, targetIdentifier: receipt.targetIdentifier, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

async function verify(receiptPath) {
  await assertCurrentSchemaDigest();
  const receiptFile = await bound(receiptPath);
  const value = JSON.parse(receiptFile.bytes.toString("utf8"));
  if (value.contract !== CONTRACT || value.schemaSha256 !== SCHEMA_SHA256 || value.rollbackState !== "rollback-ready-unexecuted") throw new Error("Rollback-readiness receipt contract/schema/state is invalid or stale.");
  if (value.rollbackPreparationOnly !== true || value.rollbackExecutionAllowed !== false || value.publicationAllowed !== false || value.cloudOverwriteAllowed !== false || value.websiteMutationAllowed !== false) throw new Error("Rollback-readiness receipt carries forbidden execution or mutation authority.");
  for (const field of ["executionResultReverified", "currentPublishedTargetReverified", "rollbackBackupReverified", "currentPublishedTargetMatchesCandidate", "rollbackBackupMatchesPreviousTarget"]) if (value[field] !== true) throw new Error(`Rollback-readiness receipt lacks required invariant ${field}.`);
  const expectedPath = await allowed(deterministicReceiptPath(value.executionResultReceiptPath), false);
  if (receiptFile.path !== expectedPath) throw new Error("Rollback-readiness receipt is not at the deterministic create-only path for its execution result.");

  const review = await reverifyExecutionResult(value.executionResultReceiptPath);
  if (review.resultFile.sha256 !== value.executionResultReceiptSha256 || review.resultFile.byteLength !== value.executionResultReceiptByteLength) throw new Error("Rollback-readiness receipt is bound to changed execution-result bytes.");
  for (const field of ["route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier"]) if (value[field] !== review.result[field]) throw new Error(`Rollback-readiness identity drifted for ${field}.`);
  if (value.publishedTargetPath !== review.postTarget.path || value.publishedTargetSha256 !== review.postTarget.sha256 || value.publishedTargetByteLength !== review.postTarget.byteLength) throw new Error("Rollback-readiness published-target binding drifted.");
  if (value.rollbackBackupPath !== review.backup.path || value.rollbackBackupSha256 !== review.backup.sha256 || value.rollbackBackupByteLength !== review.backup.byteLength) throw new Error("Rollback-readiness backup binding drifted.");
  if (value.previousTargetSnapshotSha256 !== review.snapshot.sha256 || value.previousTargetSnapshotByteLength !== review.snapshot.byteLength) throw new Error("Rollback-readiness previous-target snapshot binding drifted.");

  return Object.freeze({ ok: true, receiptPath: receiptFile.path, receiptSha256: receiptFile.sha256, receiptByteLength: receiptFile.byteLength, rollbackState: value.rollbackState, executionResultReverified: true, currentPublishedTargetReverified: true, rollbackBackupReverified: true, currentPublishedTargetMatchesCandidate: true, rollbackBackupMatchesPreviousTarget: true, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

const tools = [
  { name: "evavo_work_header_publication_rollback_readiness_capabilities", description: "Describe fail-closed post-publication rollback readiness evidence. This tool can verify and prepare rollback evidence but cannot execute a rollback or mutate website/Cloudinary state.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_prepare_work_header_publication_rollback", description: "Reverify the executed publication result, current published candidate bytes and separate rollback backup, then create a deterministic rollback-ready-unexecuted receipt. No rollback is executed.", inputSchema: { type: "object", properties: { executionResultReceiptPath: { type: "string", minLength: 1 }, confirmLocalWrite: { type: "boolean" } }, required: ["executionResultReceiptPath", "confirmLocalWrite"], additionalProperties: false } },
  { name: "evavo_verify_work_header_publication_rollback_readiness", description: "Reverify an existing rollback-readiness receipt against current published target bytes, execution-result lineage and the exact previous-target rollback backup.", inputSchema: { type: "object", properties: { receiptPath: { type: "string", minLength: 1 } }, required: ["receiptPath"], additionalProperties: false } },
];
function capabilities() { return Object.freeze({ contract: CONTRACT, serverVersion: SERVER_VERSION, schemaSha256: SCHEMA_SHA256, executionResultReverificationRequired: true, currentPublishedTargetMustStillMatchCandidate: true, rollbackBackupMustExactlyMatchPreviousTarget: true, separateRollbackBackupRequired: true, deterministicCreateOnlyReceipt: true, rollbackPreparationOnly: true, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false, allowedRootCount: configuredLocalRootCount(ROOTS_ENV), writesEnabled: writesEnabled() }); }
async function callTool(name, args) {
  if (name === "evavo_work_header_publication_rollback_readiness_capabilities") return capabilities();
  if (name === "evavo_prepare_work_header_publication_rollback") return prepare(args ?? {});
  if (name === "evavo_verify_work_header_publication_rollback_readiness") return verify(args?.receiptPath);
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}
const response = (id, result) => ({ jsonrpc: "2.0", id, result });
const toolResult = (payload, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError });
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  try {
    const message = JSON.parse(line); let outgoing;
    if (message.method === "initialize") outgoing = response(message.id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } });
    else if (message.method === "notifications/initialized") outgoing = null;
    else if (message.method === "tools/list") outgoing = response(message.id, { tools });
    else if (message.method === "tools/call") { try { outgoing = response(message.id, toolResult(await callTool(message.params?.name, message.params?.arguments ?? {}))); } catch (error) { outgoing = response(message.id, toolResult({ ok: false, message: error instanceof Error ? error.message : String(error) }, true)); } }
    else outgoing = response(message.id, toolResult({ ok: false, message: `Unsupported method ${String(message.method)}.` }, true));
    if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`);
  } catch (error) { process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: String(error) }, true)))}\n`); }
}
