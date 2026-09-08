#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";
import { recheckPublicationTarget } from "./lib/publication_target_recheck.mjs";

const SERVER_NAME = "evavo-work-header-publication-rollback-execution-claim";
const SERVER_VERSION = "1.2.0";
const PROTOCOL_VERSION = "2025-03-26";
const CONTRACT = "evavo.work-header-publication-rollback-execution-claim.v1";
const SCHEMA_SHA256 = "2abc5c031803e2d29c40fe80dcc118ca4ee984e3f0a9a1fe7da17455acbf4e78";
const SCHEMA_URL = new URL("../contracts/work-header-publication-rollback-execution-claim-v1.schema.json", import.meta.url);
const AUTHORIZATION_CONTRACT = "evavo.work-header-publication-rollback-authorization.v1";
const AUTHORIZATION_SCHEMA_SHA256 = "3f23166dc2901ba09f222682b2d6e2be4ab84e4d0ad4d469ae9c041e3bac211b";
const READINESS_CONTRACT = "evavo.work-header-publication-rollback-readiness.v1";
const READINESS_SCHEMA_SHA256 = "cc56d28b46f98cea1f97b46aa9988522c6b97424ee853a7c6c968a45ffd77f6d";
const POSTFLIGHT_CONTRACT = "evavo.work-header-publication-postflight.v1";
const POSTFLIGHT_SCHEMA_SHA256 = "69b9a40178e78892c330e6f2b5bca33b3be8413ef81ef404c1dd9edad9d24ff2";
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
function deterministicClaimPath(authorizationPath) { return `${authorizationPath}.rollback-execution-claim.json`; }

async function reverifyTargetAwarePostflight(authorization, readiness, publishedTarget) {
  const postflightFile = await bound(authorization.publicationPostflightReceiptPath);
  if (postflightFile.sha256 !== authorization.publicationPostflightReceiptSha256 || postflightFile.byteLength !== authorization.publicationPostflightReceiptByteLength) throw new Error("Rollback authorization is bound to changed publication-postflight evidence.");
  const postflight = JSON.parse(postflightFile.bytes.toString("utf8"));
  if (postflight.contract !== POSTFLIGHT_CONTRACT || postflight.schemaSha256 !== POSTFLIGHT_SCHEMA_SHA256 || postflight.postflightState !== "published-verified-rollback-ready") throw new Error("Publication postflight contract/schema/state is invalid or stale.");
  for (const field of ["targetAwareLiveRecheckVerified", "liveTargetMatchesReviewedCandidate", "cloudinaryLiveRemoteRecheckRequiredWhenApplicable", "rollbackBackupStillReady", "postflightEvidenceOnly"]) if (postflight[field] !== true) throw new Error(`Publication postflight lacks required invariant ${field}.`);
  for (const field of ["route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier"]) if (postflight[field] !== readiness[field]) throw new Error(`Publication postflight identity drifted from readiness for ${field}.`);
  const recheckArgs = postflight.liveTargetRecheckMode === "live-remote-cloudinary"
    ? { currentTargetRecheckUrl: postflight.liveTargetReference }
    : postflight.liveTargetRecheckMode === "governed-local-website-source"
      ? { currentTargetRecheckPath: postflight.liveTargetReference }
      : null;
  if (!recheckArgs) throw new Error("Publication postflight target-aware recheck mode is invalid.");
  const live = await recheckPublicationTarget({ targetKind: readiness.targetKind, targetIdentifier: readiness.targetIdentifier, ...recheckArgs, readLocal: bound });
  if (live.sha256 !== publishedTarget.sha256 || live.byteLength !== publishedTarget.byteLength || live.sha256 !== readiness.candidateSha256 || live.byteLength !== readiness.candidateByteLength) throw new Error("Rollback claim target-aware live recheck no longer matches the reviewed candidate bytes.");
  if (live.mode !== postflight.liveTargetRecheckMode) throw new Error("Rollback claim live recheck mode drifted from publication postflight.");
  return Object.freeze({ postflightFile, postflight, live });
}

async function reverifyAuthorization(authorizationReceiptPath) {
  const authorizationFile = await bound(authorizationReceiptPath);
  const authorization = JSON.parse(authorizationFile.bytes.toString("utf8"));
  if (authorization.contract !== AUTHORIZATION_CONTRACT || authorization.schemaSha256 !== AUTHORIZATION_SCHEMA_SHA256 || authorization.authorizationState !== "rollback-authorized-unexecuted") throw new Error("Rollback authorization contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(authorization, "Rollback authorization");
  for (const field of ["explicitRollbackConfirmation", "rollbackReadinessReverified", "publicationPostflightReverified", "postflightLiveTargetMatchedCandidateAtVerification", "postflightRollbackBackupStillReady", "currentPublishedTargetStillMatchesCandidate", "rollbackBackupStillMatchesPreviousTarget", "rollbackAuthorizedForOneTransactionOnly", "authorizationExpiresOnAnyEvidenceDrift"]) if (authorization[field] !== true) throw new Error(`Rollback authorization lacks required safety invariant ${field}.`);

  const readinessFile = await bound(authorization.rollbackReadinessReceiptPath);
  if (readinessFile.sha256 !== authorization.rollbackReadinessReceiptSha256 || readinessFile.byteLength !== authorization.rollbackReadinessReceiptByteLength) throw new Error("Rollback authorization is bound to changed readiness evidence.");
  const readiness = JSON.parse(readinessFile.bytes.toString("utf8"));
  if (readiness.contract !== READINESS_CONTRACT || readiness.schemaSha256 !== READINESS_SCHEMA_SHA256 || readiness.rollbackState !== "rollback-ready-unexecuted") throw new Error("Rollback readiness contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(readiness, "Rollback readiness");
  if (readiness.currentPublishedTargetMatchesCandidate !== true || readiness.rollbackBackupMatchesPreviousTarget !== true || readiness.rollbackPreparationOnly !== true) throw new Error("Rollback readiness lacks required current-target/backup invariants.");
  for (const field of ["route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier"]) if (authorization[field] !== readiness[field]) throw new Error(`Rollback authorization identity drifted from readiness for ${field}.`);

  const publishedTarget = await bound(readiness.publishedTargetPath);
  if (publishedTarget.sha256 !== readiness.publishedTargetSha256 || publishedTarget.byteLength !== readiness.publishedTargetByteLength || publishedTarget.sha256 !== readiness.candidateSha256 || publishedTarget.byteLength !== readiness.candidateByteLength) throw new Error("Published-target evidence no longer exactly matches the reviewed candidate bytes.");
  const postflight = await reverifyTargetAwarePostflight(authorization, readiness, publishedTarget);

  const backup = await bound(readiness.rollbackBackupPath);
  if (backup.sha256 !== readiness.rollbackBackupSha256 || backup.byteLength !== readiness.rollbackBackupByteLength || backup.sha256 !== readiness.previousTargetSnapshotSha256 || backup.byteLength !== readiness.previousTargetSnapshotByteLength) throw new Error("Rollback backup no longer exactly matches the previous-target snapshot bytes.");
  if (backup.path === publishedTarget.path) throw new Error("Rollback backup must remain physically separate from published-target evidence.");
  if (authorization.publishedTargetSha256 !== publishedTarget.sha256 || authorization.publishedTargetByteLength !== publishedTarget.byteLength || authorization.rollbackBackupSha256 !== backup.sha256 || authorization.rollbackBackupByteLength !== backup.byteLength || authorization.previousTargetSnapshotSha256 !== readiness.previousTargetSnapshotSha256 || authorization.previousTargetSnapshotByteLength !== readiness.previousTargetSnapshotByteLength) throw new Error("Rollback authorization target/backup evidence drifted from readiness.");
  return Object.freeze({ authorizationFile, authorization, readinessFile, readiness, publishedTarget, backup, postflight });
}

async function claim(args) {
  await assertCurrentSchemaDigest();
  if (args.confirmSingleUseRollbackClaim !== true) throw new Error("confirmSingleUseRollbackClaim=true is required from an explicit caller action immediately before rollback execution.");
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required to create rollback execution-claim evidence.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);
  if (typeof args.authorizationReceiptPath !== "string") throw new Error("authorizationReceiptPath is required.");
  const review = await reverifyAuthorization(args.authorizationReceiptPath);
  const claimPath = await allowed(deterministicClaimPath(review.authorizationFile.path), true);
  const receipt = {
    contract: CONTRACT, schemaSha256: SCHEMA_SHA256, claimState: "rollback-claimed-unexecuted",
    authorizationReceiptPath: review.authorizationFile.path, authorizationReceiptSha256: review.authorizationFile.sha256, authorizationReceiptByteLength: review.authorizationFile.byteLength,
    rollbackReadinessReceiptPath: review.readinessFile.path, rollbackReadinessReceiptSha256: review.readinessFile.sha256, rollbackReadinessReceiptByteLength: review.readinessFile.byteLength,
    route: review.readiness.route, candidateId: review.readiness.candidateId, candidateSha256: review.readiness.candidateSha256, candidateByteLength: review.readiness.candidateByteLength,
    targetKind: review.readiness.targetKind, targetIdentifier: review.readiness.targetIdentifier,
    publishedTargetPath: review.publishedTarget.path, publishedTargetSha256: review.publishedTarget.sha256, publishedTargetByteLength: review.publishedTarget.byteLength,
    rollbackBackupPath: review.backup.path, rollbackBackupSha256: review.backup.sha256, rollbackBackupByteLength: review.backup.byteLength,
    previousTargetSnapshotSha256: review.readiness.previousTargetSnapshotSha256, previousTargetSnapshotByteLength: review.readiness.previousTargetSnapshotByteLength,
    currentPublishedTargetRecheckedAtClaim: true, rollbackBackupReverifiedAtClaim: true, rollbackAuthorizationReverifiedAtClaim: true,
    deterministicClaimPathRequired: true, singleUseRollbackClaimEstablished: true, claimInvalidOnAnyEvidenceDrift: true,
    rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false,
  };
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeCreateOnlyBundle([{ path: claimPath, data: payload, encoding: "utf8" }]);
  return Object.freeze({ ok: true, claimPath, claimSha256: sha256(Buffer.from(payload, "utf8")), claimState: receipt.claimState, route: receipt.route, candidateId: receipt.candidateId, publicationPostflightGateInheritedFromAuthorization: true, targetAwareCurrentPublishedTargetRechecked: true, singleUseRollbackClaimEstablished: true, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

async function verifyClaim(authorizationReceiptPath) {
  await assertCurrentSchemaDigest();
  const authorizationFile = await bound(authorizationReceiptPath);
  const claimFile = await bound(deterministicClaimPath(authorizationFile.path));
  const value = JSON.parse(claimFile.bytes.toString("utf8"));
  if (value.contract !== CONTRACT || value.schemaSha256 !== SCHEMA_SHA256 || value.claimState !== "rollback-claimed-unexecuted") throw new Error("Rollback execution claim contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(value, "Rollback execution claim");
  for (const field of ["currentPublishedTargetRecheckedAtClaim", "rollbackBackupReverifiedAtClaim", "rollbackAuthorizationReverifiedAtClaim", "deterministicClaimPathRequired", "singleUseRollbackClaimEstablished", "claimInvalidOnAnyEvidenceDrift"]) if (value[field] !== true) throw new Error(`Rollback execution claim lacks required invariant ${field}.`);
  if (value.authorizationReceiptPath !== authorizationFile.path || value.authorizationReceiptSha256 !== authorizationFile.sha256 || value.authorizationReceiptByteLength !== authorizationFile.byteLength) throw new Error("Rollback execution claim is bound to changed authorization bytes.");
  const review = await reverifyAuthorization(authorizationFile.path);
  if (value.rollbackReadinessReceiptPath !== review.readinessFile.path || value.rollbackReadinessReceiptSha256 !== review.readinessFile.sha256 || value.rollbackReadinessReceiptByteLength !== review.readinessFile.byteLength) throw new Error("Rollback execution claim readiness lineage drifted.");
  for (const field of ["route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier"]) if (value[field] !== review.readiness[field]) throw new Error(`Rollback execution claim identity drifted for ${field}.`);
  if (value.publishedTargetPath !== review.publishedTarget.path || value.publishedTargetSha256 !== review.publishedTarget.sha256 || value.publishedTargetByteLength !== review.publishedTarget.byteLength) throw new Error("Rollback execution claim current-target binding drifted.");
  if (value.rollbackBackupPath !== review.backup.path || value.rollbackBackupSha256 !== review.backup.sha256 || value.rollbackBackupByteLength !== review.backup.byteLength || value.previousTargetSnapshotSha256 !== review.readiness.previousTargetSnapshotSha256 || value.previousTargetSnapshotByteLength !== review.readiness.previousTargetSnapshotByteLength) throw new Error("Rollback execution claim backup/previous-target binding drifted.");
  return Object.freeze({ ok: true, claimPath: claimFile.path, claimSha256: claimFile.sha256, claimByteLength: claimFile.byteLength, authorizationReceiptSha256: authorizationFile.sha256, rollbackReadinessReceiptSha256: review.readinessFile.sha256, publicationPostflightGateInheritedFromAuthorization: true, targetAwareCurrentPublishedTargetRechecked: true, currentPublishedTargetStillMatchesCandidate: true, rollbackBackupStillMatchesPreviousTarget: true, singleUseRollbackClaimVerified: true, claimState: "rollback-claimed-unexecuted", rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

const tools = [
  { name: "evavo_work_header_publication_rollback_execution_claim_capabilities", description: "Describe the deterministic create-only single-use rollback claim established only after a postflight-gated rollback authorization plus a target-aware live target recheck. Cloudinary uses the governed live stable URL; website source uses the governed local source. This tool never executes rollback.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_claim_work_header_publication_rollback_execution", description: "Create one deterministic rollback-execution claim after freshly reverifying the postflight-gated rollback authorization, readiness, target-aware live current candidate bytes and exact previous-target backup. No caller-supplied local Cloudinary target is trusted and no target mutation occurs.", inputSchema: { type: "object", properties: { authorizationReceiptPath: { type: "string", minLength: 1 }, confirmSingleUseRollbackClaim: { type: "boolean" }, confirmLocalWrite: { type: "boolean" } }, required: ["authorizationReceiptPath", "confirmSingleUseRollbackClaim", "confirmLocalWrite"], additionalProperties: false } },
  { name: "evavo_verify_work_header_publication_rollback_execution_claim", description: "Read-only reverification of the deterministic rollback-execution claim against unchanged postflight-gated authorization, readiness, target-aware live candidate bytes and previous-target backup.", inputSchema: { type: "object", properties: { authorizationReceiptPath: { type: "string", minLength: 1 } }, required: ["authorizationReceiptPath"], additionalProperties: false } },
];
function capabilities() { return Object.freeze({ contract: CONTRACT, serverVersion: SERVER_VERSION, schemaSha256: SCHEMA_SHA256, deterministicClaimPathRequired: true, createOnlySingleUseRollbackClaim: true, rollbackAuthorizationReverificationRequired: true, publicationPostflightGateInheritedFromAuthorization: true, targetAwarePublicationPostflightReverificationRequired: true, targetAwareCurrentPublishedTargetRecheckRequired: true, cloudinaryLiveRemoteRecheckRequired: true, cloudinaryCallerLocalRecheckRejected: true, rollbackReadinessReverificationRequired: true, rollbackBackupReverificationRequired: true, secondClaimForSameAuthorizationRejected: true, claimInvalidOnAnyEvidenceDrift: true, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false, allowedRootCount: configuredLocalRootCount(ROOTS_ENV), writesEnabled: writesEnabled() }); }
async function callTool(name, args) {
  if (name === "evavo_work_header_publication_rollback_execution_claim_capabilities") return capabilities();
  if (name === "evavo_claim_work_header_publication_rollback_execution") return claim(args ?? {});
  if (name === "evavo_verify_work_header_publication_rollback_execution_claim") return verifyClaim(args?.authorizationReceiptPath);
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
