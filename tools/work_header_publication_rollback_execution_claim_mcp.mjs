#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-header-publication-rollback-execution-claim";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const CONTRACT = "evavo.work-header-publication-rollback-execution-claim.v1";
const SCHEMA_SHA256 = "2abc5c031803e2d29c40fe80dcc118ca4ee984e3f0a9a1fe7da17455acbf4e78";
const SCHEMA_URL = new URL("../contracts/work-header-publication-rollback-execution-claim-v1.schema.json", import.meta.url);
const AUTHORIZATION_CONTRACT = "evavo.work-header-publication-rollback-authorization.v1";
const AUTHORIZATION_SCHEMA_SHA256 = "926c76be30d9d84f880613e703f542f7bf1c7c16d003db395565b46ad084ccb4";
const READINESS_CONTRACT = "evavo.work-header-publication-rollback-readiness.v1";
const READINESS_SCHEMA_SHA256 = "cc56d28b46f98cea1f97b46aa9988522c6b97424ee853a7c6c968a45ffd77f6d";
const ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";
const allowed = (p, output = false) => assertAllowedLocalPath(p, { envName: ROOTS_ENV, output, label: "work header publication rollback execution claim" });
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function assertCurrentSchemaDigest() {
  const bytes = await readFile(SCHEMA_URL);
  const current = sha256(bytes);
  if (current !== SCHEMA_SHA256) throw new Error(`Rollback execution-claim schema bytes drifted from governed SHA-256 (${current}).`);
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
function deterministicClaimPath(authorizationPath) {
  return `${authorizationPath}.rollback-execution-claim.json`;
}

async function reverifyAuthorization(authorizationReceiptPath, currentPublishedTargetRecheckPath) {
  const authorizationFile = await bound(authorizationReceiptPath);
  const authorization = JSON.parse(authorizationFile.bytes.toString("utf8"));
  if (authorization.contract !== AUTHORIZATION_CONTRACT || authorization.schemaSha256 !== AUTHORIZATION_SCHEMA_SHA256 || authorization.authorizationState !== "rollback-authorized-unexecuted") throw new Error("Rollback authorization contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(authorization, "Rollback authorization");
  if (authorization.explicitRollbackConfirmation !== true || authorization.rollbackReadinessReverified !== true || authorization.currentPublishedTargetStillMatchesCandidate !== true || authorization.rollbackBackupStillMatchesPreviousTarget !== true || authorization.rollbackAuthorizedForOneTransactionOnly !== true || authorization.authorizationExpiresOnAnyEvidenceDrift !== true) throw new Error("Rollback authorization lacks required single-transaction safety invariants.");

  const readinessFile = await bound(authorization.rollbackReadinessReceiptPath);
  if (readinessFile.sha256 !== authorization.rollbackReadinessReceiptSha256 || readinessFile.byteLength !== authorization.rollbackReadinessReceiptByteLength) throw new Error("Rollback authorization is bound to changed readiness evidence.");
  const readiness = JSON.parse(readinessFile.bytes.toString("utf8"));
  if (readiness.contract !== READINESS_CONTRACT || readiness.schemaSha256 !== READINESS_SCHEMA_SHA256 || readiness.rollbackState !== "rollback-ready-unexecuted") throw new Error("Rollback readiness contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(readiness, "Rollback readiness");
  if (readiness.currentPublishedTargetMatchesCandidate !== true || readiness.rollbackBackupMatchesPreviousTarget !== true || readiness.rollbackPreparationOnly !== true) throw new Error("Rollback readiness lacks required current-target/backup invariants.");

  for (const field of ["route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier"]) if (authorization[field] !== readiness[field]) throw new Error(`Rollback authorization identity drifted from readiness for ${field}.`);

  const publishedTarget = await bound(readiness.publishedTargetPath);
  if (publishedTarget.sha256 !== readiness.publishedTargetSha256 || publishedTarget.byteLength !== readiness.publishedTargetByteLength || publishedTarget.sha256 !== readiness.candidateSha256 || publishedTarget.byteLength !== readiness.candidateByteLength) throw new Error("Current published target no longer exactly matches the reviewed candidate bytes.");
  const recheck = await bound(currentPublishedTargetRecheckPath);
  if (recheck.path !== publishedTarget.path || recheck.sha256 !== publishedTarget.sha256 || recheck.byteLength !== publishedTarget.byteLength) throw new Error("Rollback claim must recheck the exact current published target path and bytes.");

  const backup = await bound(readiness.rollbackBackupPath);
  if (backup.sha256 !== readiness.rollbackBackupSha256 || backup.byteLength !== readiness.rollbackBackupByteLength || backup.sha256 !== readiness.previousTargetSnapshotSha256 || backup.byteLength !== readiness.previousTargetSnapshotByteLength) throw new Error("Rollback backup no longer exactly matches the previous-target snapshot bytes.");
  if (backup.path === publishedTarget.path) throw new Error("Rollback backup must remain physically separate from the current published target.");
  if (authorization.publishedTargetSha256 !== publishedTarget.sha256 || authorization.publishedTargetByteLength !== publishedTarget.byteLength || authorization.rollbackBackupSha256 !== backup.sha256 || authorization.rollbackBackupByteLength !== backup.byteLength || authorization.previousTargetSnapshotSha256 !== readiness.previousTargetSnapshotSha256 || authorization.previousTargetSnapshotByteLength !== readiness.previousTargetSnapshotByteLength) throw new Error("Rollback authorization target/backup evidence drifted from readiness.");

  return Object.freeze({ authorizationFile, authorization, readinessFile, readiness, publishedTarget, backup });
}

async function claim(args) {
  await assertCurrentSchemaDigest();
  if (args.confirmSingleUseRollbackClaim !== true) throw new Error("confirmSingleUseRollbackClaim=true is required from an explicit caller action immediately before rollback execution.");
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required to create rollback execution-claim evidence.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);
  if (typeof args.authorizationReceiptPath !== "string" || typeof args.currentPublishedTargetRecheckPath !== "string") throw new Error("authorizationReceiptPath and currentPublishedTargetRecheckPath are required.");

  const review = await reverifyAuthorization(args.authorizationReceiptPath, args.currentPublishedTargetRecheckPath);
  const claimPath = await allowed(deterministicClaimPath(review.authorizationFile.path), true);
  const receipt = {
    contract: CONTRACT,
    schemaSha256: SCHEMA_SHA256,
    claimState: "rollback-claimed-unexecuted",
    authorizationReceiptPath: review.authorizationFile.path,
    authorizationReceiptSha256: review.authorizationFile.sha256,
    authorizationReceiptByteLength: review.authorizationFile.byteLength,
    rollbackReadinessReceiptPath: review.readinessFile.path,
    rollbackReadinessReceiptSha256: review.readinessFile.sha256,
    rollbackReadinessReceiptByteLength: review.readinessFile.byteLength,
    route: review.readiness.route,
    candidateId: review.readiness.candidateId,
    candidateSha256: review.readiness.candidateSha256,
    candidateByteLength: review.readiness.candidateByteLength,
    targetKind: review.readiness.targetKind,
    targetIdentifier: review.readiness.targetIdentifier,
    publishedTargetPath: review.publishedTarget.path,
    publishedTargetSha256: review.publishedTarget.sha256,
    publishedTargetByteLength: review.publishedTarget.byteLength,
    rollbackBackupPath: review.backup.path,
    rollbackBackupSha256: review.backup.sha256,
    rollbackBackupByteLength: review.backup.byteLength,
    previousTargetSnapshotSha256: review.readiness.previousTargetSnapshotSha256,
    previousTargetSnapshotByteLength: review.readiness.previousTargetSnapshotByteLength,
    currentPublishedTargetRecheckedAtClaim: true,
    rollbackBackupReverifiedAtClaim: true,
    rollbackAuthorizationReverifiedAtClaim: true,
    deterministicClaimPathRequired: true,
    singleUseRollbackClaimEstablished: true,
    claimInvalidOnAnyEvidenceDrift: true,
    rollbackExecutionAllowed: false,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
  };
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeCreateOnlyBundle([{ path: claimPath, data: payload, encoding: "utf8" }]);
  return Object.freeze({ ok: true, claimPath, claimSha256: sha256(Buffer.from(payload, "utf8")), claimState: receipt.claimState, route: receipt.route, candidateId: receipt.candidateId, targetKind: receipt.targetKind, targetIdentifier: receipt.targetIdentifier, singleUseRollbackClaimEstablished: true, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

async function verifyClaim(authorizationReceiptPath, currentPublishedTargetRecheckPath) {
  await assertCurrentSchemaDigest();
  const authorizationFile = await bound(authorizationReceiptPath);
  const claimFile = await bound(deterministicClaimPath(authorizationFile.path));
  const value = JSON.parse(claimFile.bytes.toString("utf8"));
  if (value.contract !== CONTRACT || value.schemaSha256 !== SCHEMA_SHA256 || value.claimState !== "rollback-claimed-unexecuted") throw new Error("Rollback execution claim contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(value, "Rollback execution claim");
  if (value.currentPublishedTargetRecheckedAtClaim !== true || value.rollbackBackupReverifiedAtClaim !== true || value.rollbackAuthorizationReverifiedAtClaim !== true || value.deterministicClaimPathRequired !== true || value.singleUseRollbackClaimEstablished !== true || value.claimInvalidOnAnyEvidenceDrift !== true) throw new Error("Rollback execution claim lacks required safety invariants.");
  if (value.authorizationReceiptPath !== authorizationFile.path || value.authorizationReceiptSha256 !== authorizationFile.sha256 || value.authorizationReceiptByteLength !== authorizationFile.byteLength) throw new Error("Rollback execution claim is bound to changed authorization bytes.");

  const review = await reverifyAuthorization(authorizationFile.path, currentPublishedTargetRecheckPath);
  if (value.rollbackReadinessReceiptPath !== review.readinessFile.path || value.rollbackReadinessReceiptSha256 !== review.readinessFile.sha256 || value.rollbackReadinessReceiptByteLength !== review.readinessFile.byteLength) throw new Error("Rollback execution claim readiness lineage drifted.");
  for (const field of ["route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier"]) if (value[field] !== review.readiness[field]) throw new Error(`Rollback execution claim identity drifted for ${field}.`);
  if (value.publishedTargetPath !== review.publishedTarget.path || value.publishedTargetSha256 !== review.publishedTarget.sha256 || value.publishedTargetByteLength !== review.publishedTarget.byteLength) throw new Error("Rollback execution claim current-target binding drifted.");
  if (value.rollbackBackupPath !== review.backup.path || value.rollbackBackupSha256 !== review.backup.sha256 || value.rollbackBackupByteLength !== review.backup.byteLength || value.previousTargetSnapshotSha256 !== review.readiness.previousTargetSnapshotSha256 || value.previousTargetSnapshotByteLength !== review.readiness.previousTargetSnapshotByteLength) throw new Error("Rollback execution claim backup/previous-target binding drifted.");

  return Object.freeze({ ok: true, claimPath: claimFile.path, claimSha256: claimFile.sha256, claimByteLength: claimFile.byteLength, authorizationReceiptSha256: authorizationFile.sha256, rollbackReadinessReceiptSha256: review.readinessFile.sha256, currentPublishedTargetStillMatchesCandidate: true, rollbackBackupStillMatchesPreviousTarget: true, singleUseRollbackClaimVerified: true, claimState: "rollback-claimed-unexecuted", rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

const tools = [
  { name: "evavo_work_header_publication_rollback_execution_claim_capabilities", description: "Describe the deterministic create-only single-use rollback claim established only after fresh rollback authorization, published-target and backup verification. This tool never executes rollback.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_claim_work_header_publication_rollback_execution", description: "Create one deterministic rollback-execution claim after freshly reverifying rollback authorization, readiness, exact current candidate bytes and exact previous-target backup. A second claim fails because the deterministic receipt is create-only. No target mutation occurs.", inputSchema: { type: "object", properties: { authorizationReceiptPath: { type: "string", minLength: 1 }, currentPublishedTargetRecheckPath: { type: "string", minLength: 1 }, confirmSingleUseRollbackClaim: { type: "boolean" }, confirmLocalWrite: { type: "boolean" } }, required: ["authorizationReceiptPath", "currentPublishedTargetRecheckPath", "confirmSingleUseRollbackClaim", "confirmLocalWrite"], additionalProperties: false } },
  { name: "evavo_verify_work_header_publication_rollback_execution_claim", description: "Read-only reverification of the deterministic rollback-execution claim against unchanged authorization, readiness, current published candidate bytes and exact previous-target backup.", inputSchema: { type: "object", properties: { authorizationReceiptPath: { type: "string", minLength: 1 }, currentPublishedTargetRecheckPath: { type: "string", minLength: 1 } }, required: ["authorizationReceiptPath", "currentPublishedTargetRecheckPath"], additionalProperties: false } },
];
function capabilities() { return Object.freeze({ contract: CONTRACT, serverVersion: SERVER_VERSION, schemaSha256: SCHEMA_SHA256, deterministicClaimPathRequired: true, createOnlySingleUseRollbackClaim: true, rollbackAuthorizationReverificationRequired: true, rollbackReadinessReverificationRequired: true, currentPublishedTargetRecheckRequired: true, rollbackBackupReverificationRequired: true, secondClaimForSameAuthorizationRejected: true, claimInvalidOnAnyEvidenceDrift: true, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false, allowedRootCount: configuredLocalRootCount(ROOTS_ENV), writesEnabled: writesEnabled() }); }
async function callTool(name, args) {
  if (name === "evavo_work_header_publication_rollback_execution_claim_capabilities") return capabilities();
  if (name === "evavo_claim_work_header_publication_rollback_execution") return claim(args ?? {});
  if (name === "evavo_verify_work_header_publication_rollback_execution_claim") return verifyClaim(args?.authorizationReceiptPath, args?.currentPublishedTargetRecheckPath);
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
