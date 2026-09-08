#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-header-publication-rollback-postflight";
const SERVER_VERSION = "1.2.0";
const PROTOCOL_VERSION = "2025-03-26";
const CONTRACT = "evavo.work-header-publication-rollback-postflight.v1";
const SCHEMA_SHA256 = "42e349a9fa2da8b6c80ee304e24b91b1ee4cac4adacadc1d68410fb7f47ffe3b";
const SCHEMA_URL = new URL("../contracts/work-header-publication-rollback-postflight-v1.schema.json", import.meta.url);
const ROLLBACK_RESULT_CONTRACT = "evavo.work-header-publication-rollback-execution-result.v1";
const ROLLBACK_RESULT_SCHEMA_SHA256 = "2c963f8ba6adb05deb871e62c0803d78c55f68da551127c01b07c82df2480352";
const ROLLBACK_CLAIM_CONTRACT = "evavo.work-header-publication-rollback-execution-claim.v1";
const ROLLBACK_AUTHORIZATION_CONTRACT = "evavo.work-header-publication-rollback-authorization.v1";
const ROLLBACK_AUTHORIZATION_SCHEMA_SHA256 = "751c202db89dc1438a822eccf45365071d96be0eabe6680d372103d0f7b6c6e9";
const RECOVERABILITY_CONTRACT = "evavo.work-header-publication-recoverability.v1";
const RECOVERABILITY_SCHEMA_SHA256 = "c2fceba4d6d9bfa7ed4d1ec252c74d133a30b5e7f4a33847cc8fd354c275ae15";
const PUBLICATION_POSTFLIGHT_CONTRACT = "evavo.work-header-publication-postflight.v1";
const PUBLICATION_POSTFLIGHT_SCHEMA_SHA256 = "69b9a40178e78892c330e6f2b5bca33b3be8413ef81ef404c1dd9edad9d24ff2";
const ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";
const allowed = (p, output = false) => assertAllowedLocalPath(p, { envName: ROOTS_ENV, output, label: "work header publication rollback postflight" });
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function assertCurrentSchemaDigest() {
  const bytes = await readFile(SCHEMA_URL);
  const current = sha256(bytes);
  if (current !== SCHEMA_SHA256) throw new Error(`Rollback-postflight schema bytes drifted from governed SHA-256 (${current}).`);
}
async function bound(filePath) {
  const resolved = await allowed(filePath, false);
  const bytes = await readFile(resolved);
  if (!bytes.length) throw new Error(`Evidence file is empty: ${resolved}`);
  return Object.freeze({ path: resolved, bytes, sha256: sha256(bytes), byteLength: bytes.length });
}
function assertNoMutationAuthority(value, label) {
  for (const field of ["executionAllowed", "rollbackExecutionAllowed", "publicationAllowed", "cloudOverwriteAllowed", "websiteMutationAllowed"]) {
    if (value?.[field] !== undefined && value[field] !== false) throw new Error(`${label} carries forbidden execution or mutation authority (${field}).`);
  }
}
function deterministicReceiptPath(resultPath) { return `${resultPath}.rollback-postflight.json`; }

async function reverifyAuthorizationRecoverability(authorization, result, backup) {
  if (authorization.contract !== ROLLBACK_AUTHORIZATION_CONTRACT || authorization.schemaSha256 !== ROLLBACK_AUTHORIZATION_SCHEMA_SHA256 || authorization.authorizationState !== "rollback-authorized-unexecuted") throw new Error("Rollback authorization contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(authorization, "Rollback authorization");
  for (const field of ["explicitRollbackConfirmation", "rollbackReadinessReverified", "publicationPostflightReverified", "recoverabilityReverified", "recoverabilityLiveTargetMatchedCandidateAtVerification", "recoverabilityRollbackBackupStillReady", "postflightLiveTargetMatchedCandidateAtVerification", "postflightRollbackBackupStillReady", "rollbackAuthorizedForOneTransactionOnly", "authorizationExpiresOnAnyEvidenceDrift"]) if (authorization[field] !== true) throw new Error(`Rollback authorization lacks required recoverability/postflight invariant ${field}.`);
  const recoverabilityFile = await bound(authorization.recoverabilityReceiptPath);
  if (recoverabilityFile.sha256 !== authorization.recoverabilityReceiptSha256 || recoverabilityFile.byteLength !== authorization.recoverabilityReceiptByteLength) throw new Error("Rollback authorization recoverability lineage changed after authorization.");
  const recoverability = JSON.parse(recoverabilityFile.bytes.toString("utf8"));
  if (recoverability.contract !== RECOVERABILITY_CONTRACT || recoverability.schemaSha256 !== RECOVERABILITY_SCHEMA_SHA256 || recoverability.recoverabilityState !== "published-rollback-recovery-ready") throw new Error("Publication recoverability contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(recoverability, "Publication recoverability");
  for (const field of ["transactionStateReverified", "sourcePostflightBindingReverified", "liveTargetReverified", "liveTargetMatchesCandidate", "rollbackBackupReverified", "rollbackBackupDiffersFromCandidate", "recoverabilityEvidenceOnly"]) if (recoverability[field] !== true) throw new Error(`Publication recoverability lacks required invariant ${field}.`);
  for (const field of ["route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier"]) if (recoverability[field] !== result[field] || authorization[field] !== result[field]) throw new Error(`Rollback recoverability lineage identity drifted for ${field}.`);
  if (recoverability.rollbackBackupPath !== backup.path || recoverability.rollbackBackupSha256 !== backup.sha256 || recoverability.rollbackBackupByteLength !== backup.byteLength) throw new Error("Rollback recoverability backup no longer matches the preserved previous-target backup.");
  if (recoverability.rollbackBackupSha256 === result.candidateSha256 && recoverability.rollbackBackupByteLength === result.candidateByteLength) throw new Error("Rollback recoverability backup is not distinct from candidate bytes.");
  return Object.freeze({ recoverabilityFile, recoverability });
}

async function reverifyRollbackResult(rollbackExecutionResultReceiptPath) {
  const resultFile = await bound(rollbackExecutionResultReceiptPath);
  const result = JSON.parse(resultFile.bytes.toString("utf8"));
  if (result.contract !== ROLLBACK_RESULT_CONTRACT || result.schemaSha256 !== ROLLBACK_RESULT_SCHEMA_SHA256 || result.resultState !== "rollback-executed-verified") throw new Error("Rollback execution-result contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(result, "Rollback execution-result");
  for (const field of ["claimReverifiedBeforeAttestation", "authorizationReverifiedBeforeAttestation", "rollbackReadinessReverifiedBeforeAttestation", "rollbackBackupReverified", "postRollbackTargetMatchesPreviousTarget", "postRollbackTargetDiffersFromCandidate", "observedExternalRollbackOnly", "deterministicCreateOnlyResultPath", "secondResultForSameClaimRejected", "resultIsEvidenceOnly"]) if (result[field] !== true) throw new Error(`Rollback execution-result lacks required invariant ${field}.`);

  const claimFile = await bound(result.claimReceiptPath);
  if (claimFile.sha256 !== result.claimReceiptSha256 || claimFile.byteLength !== result.claimReceiptByteLength) throw new Error("Rollback result is bound to changed claim evidence.");
  const claim = JSON.parse(claimFile.bytes.toString("utf8"));
  if (claim.contract !== ROLLBACK_CLAIM_CONTRACT || claim.claimState !== "rollback-claimed-unexecuted") throw new Error("Rollback claim contract/state is invalid or stale.");
  assertNoMutationAuthority(claim, "Rollback claim");

  const authorizationFile = await bound(result.authorizationReceiptPath);
  if (authorizationFile.sha256 !== result.authorizationReceiptSha256 || authorizationFile.byteLength !== result.authorizationReceiptByteLength || authorizationFile.path !== claim.authorizationReceiptPath || authorizationFile.sha256 !== claim.authorizationReceiptSha256 || authorizationFile.byteLength !== claim.authorizationReceiptByteLength) throw new Error("Rollback result/claim authorization lineage drifted.");
  const authorization = JSON.parse(authorizationFile.bytes.toString("utf8"));

  for (const field of ["route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier"]) {
    if (result[field] !== claim[field] || result[field] !== authorization[field]) throw new Error(`Rollback lineage identity drifted for ${field}.`);
  }

  const backup = await bound(result.rollbackBackupPath);
  if (backup.sha256 !== result.rollbackBackupSha256 || backup.byteLength !== result.rollbackBackupByteLength || backup.sha256 !== result.previousTargetSnapshotSha256 || backup.byteLength !== result.previousTargetSnapshotByteLength) throw new Error("Rollback-result backup no longer exactly matches previous-target bytes.");
  const recoverability = await reverifyAuthorizationRecoverability(authorization, result, backup);
  return Object.freeze({ resultFile, result, claimFile, claim, authorizationFile, authorization, backup, recoverability });
}

async function reverifyPublicationPostflight(review) {
  const path = review.authorization.publicationPostflightReceiptPath;
  if (typeof path !== "string" || !path) throw new Error("Rollback authorization is missing publication-postflight path lineage.");
  const file = await bound(path);
  if (file.sha256 !== review.authorization.publicationPostflightReceiptSha256 || file.byteLength !== review.authorization.publicationPostflightReceiptByteLength) throw new Error("Rollback authorization is bound to changed publication-postflight bytes.");
  const value = JSON.parse(file.bytes.toString("utf8"));
  if (value.contract !== PUBLICATION_POSTFLIGHT_CONTRACT || value.schemaSha256 !== PUBLICATION_POSTFLIGHT_SCHEMA_SHA256 || value.postflightState !== "published-verified-rollback-ready") throw new Error("Publication-postflight contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(value, "Publication-postflight receipt");
  for (const field of ["executionResultReverified", "rollbackReadinessReverified", "targetAwareLiveRecheckVerified", "liveTargetMatchesReviewedCandidate", "cloudinaryLiveRemoteRecheckRequiredWhenApplicable", "rollbackBackupStillReady", "postflightEvidenceOnly"]) if (value[field] !== true) throw new Error(`Publication-postflight receipt lacks required invariant ${field}.`);
  for (const field of ["route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier"]) if (value[field] !== review.result[field]) throw new Error(`Publication-postflight identity drifted from rollback result for ${field}.`);
  if (!new Set(["governed-local-website-source", "live-remote-cloudinary"]).has(value.liveTargetRecheckMode) || typeof value.liveTargetReference !== "string" || !value.liveTargetReference) throw new Error("Publication postflight target-aware provenance is malformed.");
  if (value.liveTargetSha256 !== review.result.candidateSha256 || value.liveTargetByteLength !== review.result.candidateByteLength) throw new Error("Publication postflight no longer proves the candidate was the verified live target before rollback.");
  if (value.rollbackBackupSha256 !== review.backup.sha256 || value.rollbackBackupByteLength !== review.backup.byteLength) throw new Error("Publication postflight rollback-backup lineage drifted.");
  if (review.recoverability.recoverability.sourcePostflightReceiptPath !== file.path || review.recoverability.recoverability.sourcePostflightReceiptSha256 !== file.sha256 || review.recoverability.recoverability.sourcePostflightReceiptByteLength !== file.byteLength) throw new Error("Publication recoverability is not bound to the exact original publication postflight.");
  return Object.freeze({ file, value });
}

async function reviewRollbackClosure(rollbackExecutionResultReceiptPath, liveTargetPath) {
  const rollback = await reverifyRollbackResult(rollbackExecutionResultReceiptPath);
  const publicationPostflight = await reverifyPublicationPostflight(rollback);
  const live = await bound(liveTargetPath);
  if (live.path !== rollback.result.postRollbackTargetPath) throw new Error("Rollback postflight must inspect the exact target path attested by the rollback result.");
  if (live.sha256 !== rollback.result.postRollbackTargetSha256 || live.byteLength !== rollback.result.postRollbackTargetByteLength || live.sha256 !== rollback.result.previousTargetSnapshotSha256 || live.byteLength !== rollback.result.previousTargetSnapshotByteLength) throw new Error("Current live target no longer exactly matches the verified previous-target bytes after rollback.");
  if (live.sha256 !== rollback.backup.sha256 || live.byteLength !== rollback.backup.byteLength) throw new Error("Current live target no longer exactly matches the preserved rollback backup.");
  if (live.sha256 === rollback.result.candidateSha256 && live.byteLength === rollback.result.candidateByteLength) throw new Error("Current live target still matches the rolled-back candidate; transaction cannot be closed.");
  return Object.freeze({ rollback, publicationPostflight, live });
}

async function prepare(args) {
  await assertCurrentSchemaDigest();
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required to create rollback-postflight evidence.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);
  if (typeof args.rollbackExecutionResultReceiptPath !== "string" || typeof args.liveTargetPath !== "string") throw new Error("rollbackExecutionResultReceiptPath and liveTargetPath are required.");
  const review = await reviewRollbackClosure(args.rollbackExecutionResultReceiptPath, args.liveTargetPath);
  const receiptPath = await allowed(deterministicReceiptPath(review.rollback.resultFile.path), true);
  const receipt = {
    contract: CONTRACT,
    schemaSha256: SCHEMA_SHA256,
    rollbackPostflightState: "rolled-back-verified-closed",
    rollbackExecutionResultReceiptPath: review.rollback.resultFile.path,
    rollbackExecutionResultReceiptSha256: review.rollback.resultFile.sha256,
    rollbackExecutionResultReceiptByteLength: review.rollback.resultFile.byteLength,
    publicationPostflightReceiptPath: review.publicationPostflight.file.path,
    publicationPostflightReceiptSha256: review.publicationPostflight.file.sha256,
    publicationPostflightReceiptByteLength: review.publicationPostflight.file.byteLength,
    route: review.rollback.result.route,
    candidateId: review.rollback.result.candidateId,
    candidateSha256: review.rollback.result.candidateSha256,
    candidateByteLength: review.rollback.result.candidateByteLength,
    targetKind: review.rollback.result.targetKind,
    targetIdentifier: review.rollback.result.targetIdentifier,
    liveTargetPath: review.live.path,
    liveTargetSha256: review.live.sha256,
    liveTargetByteLength: review.live.byteLength,
    previousTargetSnapshotSha256: review.rollback.result.previousTargetSnapshotSha256,
    previousTargetSnapshotByteLength: review.rollback.result.previousTargetSnapshotByteLength,
    rollbackBackupPath: review.rollback.backup.path,
    rollbackBackupSha256: review.rollback.backup.sha256,
    rollbackBackupByteLength: review.rollback.backup.byteLength,
    rollbackExecutionResultReverified: true,
    publicationPostflightLineageReverified: true,
    liveTargetReverified: true,
    liveTargetMatchesPreviousTarget: true,
    liveTargetDiffersFromCandidate: true,
    rollbackBackupStillMatchesLiveTarget: true,
    transactionClosedAfterVerifiedRollback: true,
    rollbackPostflightEvidenceOnly: true,
    executionAllowed: false,
    rollbackExecutionAllowed: false,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
  };
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeCreateOnlyBundle([{ path: receiptPath, data: payload, encoding: "utf8" }]);
  return Object.freeze({ ok: true, receiptPath, receiptSha256: sha256(Buffer.from(payload, "utf8")), rollbackPostflightState: receipt.rollbackPostflightState, route: receipt.route, candidateId: receipt.candidateId, publicationPostflightTargetAwareLineageVerified: true, recoverabilityGateInheritedFromAuthorization: true, liveTargetMatchesPreviousTarget: true, liveTargetDiffersFromCandidate: true, transactionClosedAfterVerifiedRollback: true, rollbackPostflightEvidenceOnly: true, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

async function verify(receiptPath) {
  await assertCurrentSchemaDigest();
  const file = await bound(receiptPath);
  const value = JSON.parse(file.bytes.toString("utf8"));
  if (value.contract !== CONTRACT || value.schemaSha256 !== SCHEMA_SHA256 || value.rollbackPostflightState !== "rolled-back-verified-closed") throw new Error("Rollback-postflight receipt contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(value, "Rollback-postflight receipt");
  for (const field of ["rollbackExecutionResultReverified", "publicationPostflightLineageReverified", "liveTargetReverified", "liveTargetMatchesPreviousTarget", "liveTargetDiffersFromCandidate", "rollbackBackupStillMatchesLiveTarget", "transactionClosedAfterVerifiedRollback", "rollbackPostflightEvidenceOnly"]) if (value[field] !== true) throw new Error(`Rollback-postflight receipt lacks required invariant ${field}.`);
  const expectedPath = await allowed(deterministicReceiptPath(value.rollbackExecutionResultReceiptPath), false);
  if (file.path !== expectedPath) throw new Error("Rollback-postflight receipt is not at the deterministic create-only path for its rollback result.");
  const review = await reviewRollbackClosure(value.rollbackExecutionResultReceiptPath, value.liveTargetPath);
  if (review.rollback.resultFile.sha256 !== value.rollbackExecutionResultReceiptSha256 || review.rollback.resultFile.byteLength !== value.rollbackExecutionResultReceiptByteLength) throw new Error("Rollback-postflight result lineage drifted.");
  if (review.publicationPostflight.file.path !== value.publicationPostflightReceiptPath || review.publicationPostflight.file.sha256 !== value.publicationPostflightReceiptSha256 || review.publicationPostflight.file.byteLength !== value.publicationPostflightReceiptByteLength) throw new Error("Rollback-postflight publication-postflight lineage drifted.");
  for (const field of ["route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier"]) if (value[field] !== review.rollback.result[field]) throw new Error(`Rollback-postflight identity drifted for ${field}.`);
  if (value.liveTargetPath !== review.live.path || value.liveTargetSha256 !== review.live.sha256 || value.liveTargetByteLength !== review.live.byteLength) throw new Error("Rollback-postflight live-target binding drifted.");
  if (value.previousTargetSnapshotSha256 !== review.rollback.result.previousTargetSnapshotSha256 || value.previousTargetSnapshotByteLength !== review.rollback.result.previousTargetSnapshotByteLength || value.rollbackBackupPath !== review.rollback.backup.path || value.rollbackBackupSha256 !== review.rollback.backup.sha256 || value.rollbackBackupByteLength !== review.rollback.backup.byteLength) throw new Error("Rollback-postflight previous-target/backup binding drifted.");
  return Object.freeze({ ok: true, receiptPath: file.path, receiptSha256: file.sha256, receiptByteLength: file.byteLength, rollbackPostflightState: value.rollbackPostflightState, rollbackExecutionResultReverified: true, publicationPostflightLineageReverified: true, publicationPostflightTargetAwareLineageVerified: true, recoverabilityGateInheritedFromAuthorization: true, recoverabilityLineageReverified: true, liveTargetReverified: true, liveTargetMatchesPreviousTarget: true, liveTargetDiffersFromCandidate: true, rollbackBackupStillMatchesLiveTarget: true, transactionClosedAfterVerifiedRollback: true, rollbackPostflightEvidenceOnly: true, executionAllowed: false, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

const tools = [
  { name: "evavo_work_header_publication_rollback_postflight_capabilities", description: "Describe terminal evidence-only closure after an externally executed and verified Work-header rollback. It carries recoverability-gated authorization lineage and proves the restored target equals the exact previous bytes.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_prepare_work_header_publication_rollback_postflight", description: "Reverify rollback execution-result lineage, recoverability-gated authorization, the target-aware original publication postflight, current restored target and preserved backup; then create deterministic terminal evidence. No rollback or publication is executed.", inputSchema: { type: "object", properties: { rollbackExecutionResultReceiptPath: { type: "string", minLength: 1 }, liveTargetPath: { type: "string", minLength: 1 }, confirmLocalWrite: { type: "boolean" } }, required: ["rollbackExecutionResultReceiptPath", "liveTargetPath", "confirmLocalWrite"], additionalProperties: false } },
  { name: "evavo_verify_work_header_publication_rollback_postflight", description: "Read-only reverification of terminal rollback-postflight evidence against the recoverability-gated rollback result, original publication postflight, restored target and previous-target backup.", inputSchema: { type: "object", properties: { receiptPath: { type: "string", minLength: 1 } }, required: ["receiptPath"], additionalProperties: false } },
];
function capabilities() { return Object.freeze({ contract: CONTRACT, serverVersion: SERVER_VERSION, schemaSha256: SCHEMA_SHA256, rollbackExecutionResultReverificationRequired: true, recoverabilityGateInheritedFromAuthorization: true, recoverabilityLineageReverificationRequired: true, publicationPostflightLineageReverificationRequired: true, publicationPostflightTargetAwareLineageRequired: true, currentLiveTargetMustExactlyMatchPreviousTarget: true, currentLiveTargetMustDifferFromCandidate: true, rollbackBackupMustStillMatchLiveTarget: true, deterministicCreateOnlyReceipt: true, terminalTransactionClosureEvidence: true, rollbackPostflightEvidenceOnly: true, executionAllowed: false, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false, allowedRootCount: configuredLocalRootCount(ROOTS_ENV), writesEnabled: writesEnabled() }); }
async function callTool(name, args) {
  if (name === "evavo_work_header_publication_rollback_postflight_capabilities") return capabilities();
  if (name === "evavo_prepare_work_header_publication_rollback_postflight") return prepare(args ?? {});
  if (name === "evavo_verify_work_header_publication_rollback_postflight") return verify(args?.receiptPath);
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
