#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-header-publication-rollback-execution-result";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const CONTRACT = "evavo.work-header-publication-rollback-execution-result.v1";
const SCHEMA_SHA256 = "2c963f8ba6adb05deb871e62c0803d78c55f68da551127c01b07c82df2480352";
const SCHEMA_URL = new URL("../contracts/work-header-publication-rollback-execution-result-v1.schema.json", import.meta.url);
const CLAIM_CONTRACT = "evavo.work-header-publication-rollback-execution-claim.v1";
const CLAIM_SCHEMA_SHA256 = "2abc5c031803e2d29c40fe80dcc118ca4ee984e3f0a9a1fe7da17455acbf4e78";
const AUTHORIZATION_CONTRACT = "evavo.work-header-publication-rollback-authorization.v1";
const AUTHORIZATION_SCHEMA_SHA256 = "926c76be30d9d84f880613e703f542f7bf1c7c16d003db395565b46ad084ccb4";
const READINESS_CONTRACT = "evavo.work-header-publication-rollback-readiness.v1";
const READINESS_SCHEMA_SHA256 = "cc56d28b46f98cea1f97b46aa9988522c6b97424ee853a7c6c968a45ffd77f6d";
const ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";
const allowed = (p, output = false) => assertAllowedLocalPath(p, { envName: ROOTS_ENV, output, label: "work header publication rollback execution result" });
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function assertCurrentSchemaDigest() {
  const bytes = await readFile(SCHEMA_URL);
  const current = sha256(bytes);
  if (current !== SCHEMA_SHA256) throw new Error(`Rollback execution-result schema bytes drifted from governed SHA-256 (${current}).`);
}
async function bound(filePath) {
  const resolved = await allowed(filePath, false);
  const bytes = await readFile(resolved);
  if (!bytes.length) throw new Error(`Evidence file is empty: ${resolved}`);
  return Object.freeze({ path: resolved, bytes, sha256: sha256(bytes), byteLength: bytes.length });
}
function assertNoMutationAuthority(value, label) {
  if (value?.rollbackExecutionAllowed !== false || value?.publicationAllowed !== false || value?.cloudOverwriteAllowed !== false || value?.websiteMutationAllowed !== false) throw new Error(`${label} carries forbidden rollback execution or mutation authority.`);
}
function deterministicResultPath(claimPath) {
  return `${claimPath}.rollback-result.json`;
}

async function reverifyClaimLineage(claimReceiptPath) {
  const claimFile = await bound(claimReceiptPath);
  const claim = JSON.parse(claimFile.bytes.toString("utf8"));
  if (claim.contract !== CLAIM_CONTRACT || claim.schemaSha256 !== CLAIM_SCHEMA_SHA256 || claim.claimState !== "rollback-claimed-unexecuted") throw new Error("Rollback execution claim contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(claim, "Rollback execution claim");
  if (claim.singleUseRollbackClaimEstablished !== true || claim.claimInvalidOnAnyEvidenceDrift !== true || claim.currentPublishedTargetRecheckedAtClaim !== true || claim.rollbackBackupReverifiedAtClaim !== true || claim.rollbackAuthorizationReverifiedAtClaim !== true) throw new Error("Rollback execution claim lacks required safety invariants.");

  const authorizationFile = await bound(claim.authorizationReceiptPath);
  if (authorizationFile.sha256 !== claim.authorizationReceiptSha256 || authorizationFile.byteLength !== claim.authorizationReceiptByteLength) throw new Error("Rollback claim authorization lineage changed after claim creation.");
  const authorization = JSON.parse(authorizationFile.bytes.toString("utf8"));
  if (authorization.contract !== AUTHORIZATION_CONTRACT || authorization.schemaSha256 !== AUTHORIZATION_SCHEMA_SHA256 || authorization.authorizationState !== "rollback-authorized-unexecuted") throw new Error("Rollback authorization contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(authorization, "Rollback authorization");
  if (authorization.explicitRollbackConfirmation !== true || authorization.rollbackAuthorizedForOneTransactionOnly !== true || authorization.authorizationExpiresOnAnyEvidenceDrift !== true) throw new Error("Rollback authorization lacks explicit single-transaction confirmation.");

  const readinessFile = await bound(claim.rollbackReadinessReceiptPath);
  if (readinessFile.sha256 !== claim.rollbackReadinessReceiptSha256 || readinessFile.byteLength !== claim.rollbackReadinessReceiptByteLength || readinessFile.path !== authorization.rollbackReadinessReceiptPath || readinessFile.sha256 !== authorization.rollbackReadinessReceiptSha256 || readinessFile.byteLength !== authorization.rollbackReadinessReceiptByteLength) throw new Error("Rollback claim readiness lineage changed after claim creation.");
  const readiness = JSON.parse(readinessFile.bytes.toString("utf8"));
  if (readiness.contract !== READINESS_CONTRACT || readiness.schemaSha256 !== READINESS_SCHEMA_SHA256 || readiness.rollbackState !== "rollback-ready-unexecuted") throw new Error("Rollback readiness contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(readiness, "Rollback readiness");
  if (readiness.rollbackBackupMatchesPreviousTarget !== true || readiness.rollbackPreparationOnly !== true) throw new Error("Rollback readiness no longer proves the exact previous-target backup.");

  for (const field of ["route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier"]) {
    if (claim[field] !== authorization[field] || claim[field] !== readiness[field]) throw new Error(`Rollback execution identity drifted for ${field}.`);
  }

  const backup = await bound(claim.rollbackBackupPath);
  if (backup.sha256 !== claim.rollbackBackupSha256 || backup.byteLength !== claim.rollbackBackupByteLength || backup.path !== readiness.rollbackBackupPath || backup.sha256 !== readiness.rollbackBackupSha256 || backup.byteLength !== readiness.rollbackBackupByteLength || backup.sha256 !== claim.previousTargetSnapshotSha256 || backup.byteLength !== claim.previousTargetSnapshotByteLength || backup.sha256 !== readiness.previousTargetSnapshotSha256 || backup.byteLength !== readiness.previousTargetSnapshotByteLength) throw new Error("Rollback backup no longer exactly matches the previous-target snapshot bytes.");

  return Object.freeze({ claimFile, claim, authorizationFile, authorization, readinessFile, readiness, backup });
}

async function attest(args) {
  await assertCurrentSchemaDigest();
  if (args.confirmObservedExternalRollback !== true) throw new Error("confirmObservedExternalRollback=true is required; this tool only attests a rollback that already occurred outside this tool.");
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required to create rollback-result evidence.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);
  if (typeof args.claimReceiptPath !== "string" || typeof args.postRollbackTargetPath !== "string") throw new Error("claimReceiptPath and postRollbackTargetPath are required.");

  const review = await reverifyClaimLineage(args.claimReceiptPath);
  const postTarget = await bound(args.postRollbackTargetPath);
  if (postTarget.path !== review.claim.publishedTargetPath) throw new Error("Post-rollback target path must be the exact target path that was claimed for rollback.");
  if (postTarget.sha256 !== review.backup.sha256 || postTarget.byteLength !== review.backup.byteLength || postTarget.sha256 !== review.claim.previousTargetSnapshotSha256 || postTarget.byteLength !== review.claim.previousTargetSnapshotByteLength) throw new Error("Post-rollback target does not exactly match the previous-target backup bytes.");
  if (postTarget.sha256 === review.claim.candidateSha256 && postTarget.byteLength === review.claim.candidateByteLength) throw new Error("Post-rollback target still matches the published candidate; rollback was not observed.");

  const resultPath = await allowed(deterministicResultPath(review.claimFile.path), true);
  const receipt = {
    contract: CONTRACT,
    schemaSha256: SCHEMA_SHA256,
    resultState: "rollback-executed-verified",
    claimReceiptPath: review.claimFile.path,
    claimReceiptSha256: review.claimFile.sha256,
    claimReceiptByteLength: review.claimFile.byteLength,
    authorizationReceiptPath: review.authorizationFile.path,
    authorizationReceiptSha256: review.authorizationFile.sha256,
    authorizationReceiptByteLength: review.authorizationFile.byteLength,
    rollbackReadinessReceiptPath: review.readinessFile.path,
    rollbackReadinessReceiptSha256: review.readinessFile.sha256,
    rollbackReadinessReceiptByteLength: review.readinessFile.byteLength,
    route: review.claim.route,
    candidateId: review.claim.candidateId,
    candidateSha256: review.claim.candidateSha256,
    candidateByteLength: review.claim.candidateByteLength,
    targetKind: review.claim.targetKind,
    targetIdentifier: review.claim.targetIdentifier,
    previousTargetSnapshotSha256: review.claim.previousTargetSnapshotSha256,
    previousTargetSnapshotByteLength: review.claim.previousTargetSnapshotByteLength,
    rollbackBackupPath: review.backup.path,
    rollbackBackupSha256: review.backup.sha256,
    rollbackBackupByteLength: review.backup.byteLength,
    postRollbackTargetPath: postTarget.path,
    postRollbackTargetSha256: postTarget.sha256,
    postRollbackTargetByteLength: postTarget.byteLength,
    claimReverifiedBeforeAttestation: true,
    authorizationReverifiedBeforeAttestation: true,
    rollbackReadinessReverifiedBeforeAttestation: true,
    rollbackBackupReverified: true,
    postRollbackTargetMatchesPreviousTarget: true,
    postRollbackTargetDiffersFromCandidate: true,
    observedExternalRollbackOnly: true,
    deterministicCreateOnlyResultPath: true,
    secondResultForSameClaimRejected: true,
    resultIsEvidenceOnly: true,
    rollbackExecutionAllowed: false,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
  };
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeCreateOnlyBundle([{ path: resultPath, data: payload, encoding: "utf8" }]);
  return Object.freeze({ ok: true, resultPath, resultSha256: sha256(Buffer.from(payload, "utf8")), resultState: receipt.resultState, route: receipt.route, candidateId: receipt.candidateId, targetKind: receipt.targetKind, targetIdentifier: receipt.targetIdentifier, postRollbackTargetMatchesPreviousTarget: true, postRollbackTargetDiffersFromCandidate: true, resultIsEvidenceOnly: true, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

async function verifyResult(claimReceiptPath) {
  await assertCurrentSchemaDigest();
  const claimFile = await bound(claimReceiptPath);
  const resultFile = await bound(deterministicResultPath(claimFile.path));
  const value = JSON.parse(resultFile.bytes.toString("utf8"));
  if (value.contract !== CONTRACT || value.schemaSha256 !== SCHEMA_SHA256 || value.resultState !== "rollback-executed-verified") throw new Error("Rollback execution-result contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(value, "Rollback execution-result");
  for (const field of ["claimReverifiedBeforeAttestation", "authorizationReverifiedBeforeAttestation", "rollbackReadinessReverifiedBeforeAttestation", "rollbackBackupReverified", "postRollbackTargetMatchesPreviousTarget", "postRollbackTargetDiffersFromCandidate", "observedExternalRollbackOnly", "deterministicCreateOnlyResultPath", "secondResultForSameClaimRejected", "resultIsEvidenceOnly"]) if (value[field] !== true) throw new Error(`Rollback execution-result lacks required invariant ${field}.`);

  const review = await reverifyClaimLineage(claimFile.path);
  if (value.claimReceiptPath !== review.claimFile.path || value.claimReceiptSha256 !== review.claimFile.sha256 || value.claimReceiptByteLength !== review.claimFile.byteLength) throw new Error("Rollback result claim lineage drifted.");
  if (value.authorizationReceiptPath !== review.authorizationFile.path || value.authorizationReceiptSha256 !== review.authorizationFile.sha256 || value.authorizationReceiptByteLength !== review.authorizationFile.byteLength) throw new Error("Rollback result authorization lineage drifted.");
  if (value.rollbackReadinessReceiptPath !== review.readinessFile.path || value.rollbackReadinessReceiptSha256 !== review.readinessFile.sha256 || value.rollbackReadinessReceiptByteLength !== review.readinessFile.byteLength) throw new Error("Rollback result readiness lineage drifted.");
  for (const field of ["route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier"]) if (value[field] !== review.claim[field]) throw new Error(`Rollback result identity drifted for ${field}.`);
  if (value.previousTargetSnapshotSha256 !== review.claim.previousTargetSnapshotSha256 || value.previousTargetSnapshotByteLength !== review.claim.previousTargetSnapshotByteLength || value.rollbackBackupPath !== review.backup.path || value.rollbackBackupSha256 !== review.backup.sha256 || value.rollbackBackupByteLength !== review.backup.byteLength) throw new Error("Rollback result previous-target/backup lineage drifted.");

  const postTarget = await bound(value.postRollbackTargetPath);
  if (postTarget.path !== review.claim.publishedTargetPath || postTarget.sha256 !== value.postRollbackTargetSha256 || postTarget.byteLength !== value.postRollbackTargetByteLength || postTarget.sha256 !== review.backup.sha256 || postTarget.byteLength !== review.backup.byteLength) throw new Error("Current post-rollback target no longer exactly matches the previous-target backup bytes.");
  if (postTarget.sha256 === review.claim.candidateSha256 && postTarget.byteLength === review.claim.candidateByteLength) throw new Error("Current post-rollback target unexpectedly matches the rolled-back candidate.");

  return Object.freeze({ ok: true, resultPath: resultFile.path, resultSha256: resultFile.sha256, resultByteLength: resultFile.byteLength, claimReceiptSha256: review.claimFile.sha256, authorizationReceiptSha256: review.authorizationFile.sha256, rollbackReadinessReceiptSha256: review.readinessFile.sha256, postRollbackTargetSha256: postTarget.sha256, rollbackBackupSha256: review.backup.sha256, postRollbackTargetMatchesPreviousTarget: true, postRollbackTargetDiffersFromCandidate: true, resultIsEvidenceOnly: true, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

const tools = [
  { name: "evavo_work_header_publication_rollback_execution_result_capabilities", description: "Describe evidence-only attestation for a rollback that already occurred externally after a valid single-use rollback claim. This tool never performs rollback.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_attest_work_header_publication_rollback_execution_result", description: "After an external rollback has already occurred, reverify the single-use rollback claim, authorization, readiness and backup, then prove the exact target now equals the previous-target backup and differs from the rolled-back candidate. Creates one deterministic evidence receipt; no mutation occurs.", inputSchema: { type: "object", properties: { claimReceiptPath: { type: "string", minLength: 1 }, postRollbackTargetPath: { type: "string", minLength: 1 }, confirmObservedExternalRollback: { type: "boolean" }, confirmLocalWrite: { type: "boolean" } }, required: ["claimReceiptPath", "postRollbackTargetPath", "confirmObservedExternalRollback", "confirmLocalWrite"], additionalProperties: false } },
  { name: "evavo_verify_work_header_publication_rollback_execution_result", description: "Read-only reverification of a rollback execution-result against the exact claim, authorization, readiness, previous-target backup and current rolled-back target bytes.", inputSchema: { type: "object", properties: { claimReceiptPath: { type: "string", minLength: 1 } }, required: ["claimReceiptPath"], additionalProperties: false } },
];
function capabilities() { return Object.freeze({ contract: CONTRACT, serverVersion: SERVER_VERSION, schemaSha256: SCHEMA_SHA256, observedExternalRollbackOnly: true, deterministicCreateOnlyResultPath: true, claimReverificationRequired: true, authorizationReverificationRequired: true, rollbackReadinessReverificationRequired: true, rollbackBackupReverificationRequired: true, postRollbackTargetMustExactlyMatchPreviousTarget: true, postRollbackTargetMustDifferFromCandidate: true, secondResultForSameClaimRejected: true, resultIsEvidenceOnly: true, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false, allowedRootCount: configuredLocalRootCount(ROOTS_ENV), writesEnabled: writesEnabled() }); }
async function callTool(name, args) {
  if (name === "evavo_work_header_publication_rollback_execution_result_capabilities") return capabilities();
  if (name === "evavo_attest_work_header_publication_rollback_execution_result") return attest(args ?? {});
  if (name === "evavo_verify_work_header_publication_rollback_execution_result") return verifyResult(args?.claimReceiptPath);
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
