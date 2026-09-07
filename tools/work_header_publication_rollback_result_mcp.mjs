#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-header-publication-rollback-result";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const CONTRACT = "evavo.work-header-publication-rollback-result.v1";
const SCHEMA_SHA256 = "bf3df377b176564d2b5e02bc2802fa959b8b6a38a0eaffd0fccde3c7eb831114";
const SCHEMA_URL = new URL("../contracts/work-header-publication-rollback-result-v1.schema.json", import.meta.url);
const POSTFLIGHT_CONTRACT = "evavo.work-header-publication-postflight.v1";
const POSTFLIGHT_SCHEMA_SHA256 = "5a1a2a9a329d3ce4eecd81981e3aa35cd2d6d2d3487f78b6b56672bacca99ae8";
const ROLLBACK_READINESS_CONTRACT = "evavo.work-header-publication-rollback-readiness.v1";
const ROLLBACK_READINESS_SCHEMA_SHA256 = "cc56d28b46f98cea1f97b46aa9988522c6b97424ee853a7c6c968a45ffd77f6d";
const EXECUTION_RESULT_CONTRACT = "evavo.work-header-publication-execution-result.v1";
const EXECUTION_RESULT_SCHEMA_SHA256 = "6d94ca926dea8c5c0fdc025c3d65a8692ae5c8c6e61db2d37a536ae352d52445";
const ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";
const allowed = (p, output = false) => assertAllowedLocalPath(p, { envName: ROOTS_ENV, output, label: "work header publication rollback result" });
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function assertCurrentSchemaDigest() {
  const bytes = await readFile(SCHEMA_URL);
  const current = sha256(bytes);
  if (current !== SCHEMA_SHA256) throw new Error(`Rollback-result schema bytes drifted from governed SHA-256 (${current}).`);
}

async function bound(filePath) {
  const resolved = await allowed(filePath, false);
  const bytes = await readFile(resolved);
  if (!bytes.length) throw new Error(`Evidence file is empty: ${resolved}`);
  return Object.freeze({ path: resolved, bytes, sha256: sha256(bytes), byteLength: bytes.length });
}

function assertNoAuthority(value, label) {
  for (const field of ["publicationAllowed", "cloudOverwriteAllowed", "websiteMutationAllowed"]) {
    if (value?.[field] !== false) throw new Error(`${label} carries forbidden mutation authority (${field}).`);
  }
  if (value?.executionAllowed !== undefined && value.executionAllowed !== false) throw new Error(`${label} carries forbidden publication execution authority.`);
  if (value?.rollbackExecutionAllowed !== undefined && value.rollbackExecutionAllowed !== false) throw new Error(`${label} carries forbidden rollback execution authority.`);
}

function deterministicResultPath(readinessPath) {
  return `${readinessPath}.rollback-result.json`;
}

async function reverifyHistoricalPublicationEvidence(postflightReceiptPath, rollbackReadinessReceiptPath) {
  const postflightFile = await bound(postflightReceiptPath);
  const postflight = JSON.parse(postflightFile.bytes.toString("utf8"));
  if (postflight.contract !== POSTFLIGHT_CONTRACT || postflight.schemaSha256 !== POSTFLIGHT_SCHEMA_SHA256 || postflight.postflightState !== "published-verified-rollback-ready") throw new Error("Publication-postflight receipt contract/schema/state is invalid or stale.");
  assertNoAuthority(postflight, "Publication-postflight receipt");
  for (const field of ["executionResultReverified", "rollbackReadinessReverified", "liveTargetReverified", "liveTargetMatchesReviewedCandidate", "rollbackBackupStillReady", "postflightEvidenceOnly"]) if (postflight[field] !== true) throw new Error(`Publication-postflight receipt lacks required historical invariant ${field}.`);

  const readinessFile = await bound(rollbackReadinessReceiptPath);
  const readiness = JSON.parse(readinessFile.bytes.toString("utf8"));
  if (readiness.contract !== ROLLBACK_READINESS_CONTRACT || readiness.schemaSha256 !== ROLLBACK_READINESS_SCHEMA_SHA256 || readiness.rollbackState !== "rollback-ready-unexecuted") throw new Error("Rollback-readiness receipt contract/schema/state is invalid or stale.");
  assertNoAuthority(readiness, "Rollback-readiness receipt");
  if (readiness.rollbackPreparationOnly !== true || readiness.rollbackExecutionAllowed !== false) throw new Error("Rollback-readiness receipt must remain preparation-only.");
  for (const field of ["executionResultReverified", "currentPublishedTargetReverified", "rollbackBackupReverified", "currentPublishedTargetMatchesCandidate", "rollbackBackupMatchesPreviousTarget"]) if (readiness[field] !== true) throw new Error(`Rollback-readiness receipt lacks required historical invariant ${field}.`);

  if (postflight.rollbackReadinessReceiptPath !== readinessFile.path || postflight.rollbackReadinessReceiptSha256 !== readinessFile.sha256 || postflight.rollbackReadinessReceiptByteLength !== readinessFile.byteLength) throw new Error("Publication-postflight receipt is bound to different rollback-readiness evidence.");

  const executionFile = await bound(readiness.executionResultReceiptPath);
  const execution = JSON.parse(executionFile.bytes.toString("utf8"));
  if (execution.contract !== EXECUTION_RESULT_CONTRACT || execution.schemaSha256 !== EXECUTION_RESULT_SCHEMA_SHA256 || execution.resultState !== "executed-verified") throw new Error("Publication execution-result receipt contract/schema/state is invalid or stale.");
  assertNoAuthority(execution, "Publication execution-result receipt");
  for (const field of ["claimReverifiedBeforeAttestation", "candidateBytesReverified", "postExecutionTargetMatchesCandidate", "postExecutionTargetDiffersFromPreviousTarget", "rollbackBackupPreserved", "resultIsEvidenceOnly"]) if (execution[field] !== true) throw new Error(`Execution-result receipt lacks required historical invariant ${field}.`);

  if (readiness.executionResultReceiptSha256 !== executionFile.sha256 || readiness.executionResultReceiptByteLength !== executionFile.byteLength) throw new Error("Rollback-readiness receipt is bound to changed execution-result evidence.");
  if (postflight.executionResultReceiptPath !== executionFile.path || postflight.executionResultReceiptSha256 !== executionFile.sha256 || postflight.executionResultReceiptByteLength !== executionFile.byteLength) throw new Error("Publication-postflight receipt is bound to different execution-result evidence.");

  for (const field of ["route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier"]) {
    if (postflight[field] !== readiness[field] || readiness[field] !== execution[field]) throw new Error(`Historical publication identity drifted for ${field}.`);
  }

  const backup = await bound(readiness.rollbackBackupPath);
  if (backup.sha256 !== readiness.rollbackBackupSha256 || backup.byteLength !== readiness.rollbackBackupByteLength) throw new Error("Rollback backup bytes changed after rollback readiness was recorded.");
  if (backup.sha256 !== postflight.rollbackBackupSha256 || backup.byteLength !== postflight.rollbackBackupByteLength || backup.path !== postflight.rollbackBackupPath) throw new Error("Publication-postflight rollback-backup binding drifted from readiness evidence.");
  if (backup.sha256 !== execution.previousTargetSnapshotSha256 || backup.byteLength !== execution.previousTargetSnapshotByteLength) throw new Error("Rollback backup no longer exactly represents the pre-publication target bytes.");
  if (backup.sha256 !== execution.rollbackBackupSha256 || backup.byteLength !== execution.rollbackBackupByteLength) throw new Error("Execution-result rollback-backup identity drifted.");
  if (backup.sha256 === execution.candidateSha256 && backup.byteLength === execution.candidateByteLength) throw new Error("Rollback backup unexpectedly equals the published candidate; rollback state would be ambiguous.");

  return Object.freeze({ postflightFile, postflight, readinessFile, readiness, executionFile, execution, backup });
}

async function attest(args) {
  await assertCurrentSchemaDigest();
  if (args.confirmObservedExternalRollback !== true) throw new Error("confirmObservedExternalRollback=true is required and must describe a rollback that already occurred outside this evidence tool.");
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required to write rollback-result evidence.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);
  for (const name of ["publicationPostflightReceiptPath", "rollbackReadinessReceiptPath", "postRollbackTargetPath"]) if (typeof args[name] !== "string" || !args[name]) throw new Error(`${name} is required.`);

  const review = await reverifyHistoricalPublicationEvidence(args.publicationPostflightReceiptPath, args.rollbackReadinessReceiptPath);
  const postRollbackTarget = await bound(args.postRollbackTargetPath);
  if (postRollbackTarget.path === review.backup.path) throw new Error("Post-rollback live target must be physically separate from the immutable rollback backup evidence.");
  if (postRollbackTarget.sha256 !== review.backup.sha256 || postRollbackTarget.byteLength !== review.backup.byteLength) throw new Error("Post-rollback target does not exactly match the preserved pre-publication target bytes.");
  if (postRollbackTarget.sha256 === review.execution.candidateSha256 && postRollbackTarget.byteLength === review.execution.candidateByteLength) throw new Error("Post-rollback target still matches the published candidate; rollback cannot be attested.");

  const resultPath = await allowed(deterministicResultPath(review.readinessFile.path), true);
  const receipt = {
    contract: CONTRACT,
    schemaSha256: SCHEMA_SHA256,
    resultState: "rollback-executed-verified",
    publicationPostflightReceiptPath: review.postflightFile.path,
    publicationPostflightReceiptSha256: review.postflightFile.sha256,
    publicationPostflightReceiptByteLength: review.postflightFile.byteLength,
    rollbackReadinessReceiptPath: review.readinessFile.path,
    rollbackReadinessReceiptSha256: review.readinessFile.sha256,
    rollbackReadinessReceiptByteLength: review.readinessFile.byteLength,
    executionResultReceiptPath: review.executionFile.path,
    executionResultReceiptSha256: review.executionFile.sha256,
    executionResultReceiptByteLength: review.executionFile.byteLength,
    route: review.execution.route,
    candidateId: review.execution.candidateId,
    candidateSha256: review.execution.candidateSha256,
    candidateByteLength: review.execution.candidateByteLength,
    targetKind: review.execution.targetKind,
    targetIdentifier: review.execution.targetIdentifier,
    previousPublishedTargetSha256: review.execution.previousTargetSnapshotSha256,
    previousPublishedTargetByteLength: review.execution.previousTargetSnapshotByteLength,
    rollbackBackupPath: review.backup.path,
    rollbackBackupSha256: review.backup.sha256,
    rollbackBackupByteLength: review.backup.byteLength,
    postRollbackTargetPath: postRollbackTarget.path,
    postRollbackTargetSha256: postRollbackTarget.sha256,
    postRollbackTargetByteLength: postRollbackTarget.byteLength,
    publicationPostflightReverifiedBeforeRollbackAttestation: true,
    rollbackReadinessReverifiedBeforeAttestation: true,
    rollbackBackupReverified: true,
    postRollbackTargetMatchesPreviousTarget: true,
    postRollbackTargetDiffersFromPublishedCandidate: true,
    rollbackResultIsEvidenceOnly: true,
    rollbackExecutionAllowed: false,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
  };
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeCreateOnlyBundle([{ path: resultPath, data: payload, encoding: "utf8" }]);
  return Object.freeze({ ok: true, resultPath, resultSha256: sha256(Buffer.from(payload, "utf8")), resultState: receipt.resultState, route: receipt.route, candidateId: receipt.candidateId, targetKind: receipt.targetKind, targetIdentifier: receipt.targetIdentifier, postRollbackTargetMatchesPreviousTarget: true, rollbackResultIsEvidenceOnly: true, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

async function verify(resultReceiptPath) {
  await assertCurrentSchemaDigest();
  const resultFile = await bound(resultReceiptPath);
  const value = JSON.parse(resultFile.bytes.toString("utf8"));
  if (value.contract !== CONTRACT || value.schemaSha256 !== SCHEMA_SHA256 || value.resultState !== "rollback-executed-verified") throw new Error("Rollback-result receipt contract/schema/state is invalid or stale.");
  assertNoAuthority(value, "Rollback-result receipt");
  for (const field of ["publicationPostflightReverifiedBeforeRollbackAttestation", "rollbackReadinessReverifiedBeforeAttestation", "rollbackBackupReverified", "postRollbackTargetMatchesPreviousTarget", "postRollbackTargetDiffersFromPublishedCandidate", "rollbackResultIsEvidenceOnly"]) if (value[field] !== true) throw new Error(`Rollback-result receipt lacks required invariant ${field}.`);
  const expectedPath = await allowed(deterministicResultPath(value.rollbackReadinessReceiptPath), false);
  if (resultFile.path !== expectedPath) throw new Error("Rollback-result receipt is not at the deterministic create-only path for its readiness receipt.");

  const review = await reverifyHistoricalPublicationEvidence(value.publicationPostflightReceiptPath, value.rollbackReadinessReceiptPath);
  if (review.postflightFile.sha256 !== value.publicationPostflightReceiptSha256 || review.postflightFile.byteLength !== value.publicationPostflightReceiptByteLength) throw new Error("Rollback-result publication-postflight lineage drifted.");
  if (review.readinessFile.sha256 !== value.rollbackReadinessReceiptSha256 || review.readinessFile.byteLength !== value.rollbackReadinessReceiptByteLength) throw new Error("Rollback-result readiness lineage drifted.");
  if (review.executionFile.path !== value.executionResultReceiptPath || review.executionFile.sha256 !== value.executionResultReceiptSha256 || review.executionFile.byteLength !== value.executionResultReceiptByteLength) throw new Error("Rollback-result execution-result lineage drifted.");
  for (const field of ["route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier"]) if (value[field] !== review.execution[field]) throw new Error(`Rollback-result identity drifted for ${field}.`);
  if (value.previousPublishedTargetSha256 !== review.execution.previousTargetSnapshotSha256 || value.previousPublishedTargetByteLength !== review.execution.previousTargetSnapshotByteLength) throw new Error("Rollback-result previous-target identity drifted.");
  if (value.rollbackBackupPath !== review.backup.path || value.rollbackBackupSha256 !== review.backup.sha256 || value.rollbackBackupByteLength !== review.backup.byteLength) throw new Error("Rollback-result backup binding drifted.");

  const postRollbackTarget = await bound(value.postRollbackTargetPath);
  if (postRollbackTarget.sha256 !== value.postRollbackTargetSha256 || postRollbackTarget.byteLength !== value.postRollbackTargetByteLength) throw new Error("Post-rollback target bytes changed after rollback attestation.");
  if (postRollbackTarget.sha256 !== review.backup.sha256 || postRollbackTarget.byteLength !== review.backup.byteLength) throw new Error("Current post-rollback target no longer exactly matches the previous target backup.");
  if (postRollbackTarget.sha256 === review.execution.candidateSha256 && postRollbackTarget.byteLength === review.execution.candidateByteLength) throw new Error("Current target has returned to the published candidate; rollback-result evidence is stale.");

  return Object.freeze({ ok: true, resultPath: resultFile.path, resultSha256: resultFile.sha256, resultByteLength: resultFile.byteLength, resultState: value.resultState, publicationPostflightReverified: true, rollbackReadinessReverified: true, rollbackBackupReverified: true, currentTargetMatchesPreviousTarget: true, currentTargetDiffersFromPublishedCandidate: true, rollbackResultIsEvidenceOnly: true, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

const tools = [
  { name: "evavo_work_header_publication_rollback_result_capabilities", description: "Describe evidence-only attestation of an externally executed Work-header rollback. This server cannot execute rollback, website or Cloudinary mutations.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_attest_work_header_publication_rollback_result", description: "After an externally performed rollback, reverify historical publication postflight/readiness evidence and prove the current target exactly matches the preserved pre-publication backup. Writes deterministic create-only evidence only.", inputSchema: { type: "object", properties: { publicationPostflightReceiptPath: { type: "string", minLength: 1 }, rollbackReadinessReceiptPath: { type: "string", minLength: 1 }, postRollbackTargetPath: { type: "string", minLength: 1 }, confirmObservedExternalRollback: { type: "boolean" }, confirmLocalWrite: { type: "boolean" } }, required: ["publicationPostflightReceiptPath", "rollbackReadinessReceiptPath", "postRollbackTargetPath", "confirmObservedExternalRollback", "confirmLocalWrite"], additionalProperties: false } },
  { name: "evavo_verify_work_header_publication_rollback_result", description: "Read-only reverification that an attested rollback still leaves the current target equal to the exact pre-publication backup and different from the published candidate.", inputSchema: { type: "object", properties: { resultReceiptPath: { type: "string", minLength: 1 } }, required: ["resultReceiptPath"], additionalProperties: false } },
];
function capabilities() { return Object.freeze({ contract: CONTRACT, serverVersion: SERVER_VERSION, schemaSha256: SCHEMA_SHA256, publicationPostflightRequired: true, rollbackReadinessRequired: true, historicalExecutionEvidenceRequired: true, externalRollbackObservationConfirmationRequired: true, postRollbackTargetMustExactlyMatchPrePublicationBackup: true, postRollbackTargetMustDifferFromPublishedCandidate: true, deterministicCreateOnlyResultReceipt: true, rollbackResultIsEvidenceOnly: true, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false, allowedRootCount: configuredLocalRootCount(ROOTS_ENV), writesEnabled: writesEnabled() }); }
async function callTool(name, args) {
  if (name === "evavo_work_header_publication_rollback_result_capabilities") return capabilities();
  if (name === "evavo_attest_work_header_publication_rollback_result") return attest(args ?? {});
  if (name === "evavo_verify_work_header_publication_rollback_result") return verify(args?.resultReceiptPath);
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
  } catch (error) {
    process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: String(error) }, true)))}\n`);
  }
}
