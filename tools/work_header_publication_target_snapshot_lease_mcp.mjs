#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";
import { recheckPublicationTarget } from "./lib/publication_target_recheck.mjs";

const SERVER_NAME = "evavo-work-header-publication-target-snapshot-lease";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const CONTRACT = "evavo.work-header-publication-target-snapshot-lease.v1";
const SCHEMA_SHA256 = "652a7d5fcbc2c44fb4edffb9d93f8305110c74c3b39ece7e4eca76c5d2c7bdc6";
const SCHEMA_URL = new URL("../contracts/work-header-publication-target-snapshot-lease-v1.schema.json", import.meta.url);
const PUBLICATION_CLAIM_CONTRACT = "evavo.work-header-publication-execution-claim.v1";
const PUBLICATION_CLAIM_SCHEMA_SHA256 = "0b7ee89628c1e55f057161d41f7cea4e3addcdefc442b51823ed507a1b612116";
const ROLLBACK_CLAIM_CONTRACT = "evavo.work-header-publication-rollback-execution-claim.v1";
const ROLLBACK_CLAIM_SCHEMA_SHA256 = "2abc5c031803e2d29c40fe80dcc118ca4ee984e3f0a9a1fe7da17455acbf4e78";
const PUBLICATION_AUTH_CONTRACT = "evavo.work-header-publication-execution-authorization.v1";
const ROLLBACK_AUTH_CONTRACT = "evavo.work-header-publication-rollback-authorization.v1";
const ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";
const LEASE_ROOT_ENV = "EVAVO_WORK_HEADER_PUBLICATION_LEASE_ROOT";
const allowed = (p, output = false) => assertAllowedLocalPath(p, { envName: ROOTS_ENV, output, label: "work header publication target-snapshot lease" });
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

function expandEnvironment(value) {
  return String(value ?? "").replace(/%([^%]+)%/gu, (_match, name) => process.env[name] ?? `%${name}%`);
}
function configuredLeaseRoot() {
  const raw = String(process.env[LEASE_ROOT_ENV] ?? "").trim();
  if (!raw) throw new Error(`${LEASE_ROOT_ENV} must point to one shared governed lease root before publication or rollback execution claims can proceed.`);
  return path.resolve(expandEnvironment(raw));
}
async function assertCurrentSchemaDigest() {
  const bytes = await readFile(SCHEMA_URL);
  const current = sha256(bytes);
  if (current !== SCHEMA_SHA256) throw new Error(`Target-snapshot lease schema bytes drifted from governed SHA-256 (${current}).`);
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
function targetKey(targetKind, targetIdentifier) {
  if (!new Set(["website-header-source-update", "cloudinary-stable-id-replacement"]).has(targetKind)) throw new Error("Target-snapshot lease received an unsupported targetKind.");
  if (typeof targetIdentifier !== "string" || !targetIdentifier.trim()) throw new Error("Target-snapshot lease requires targetIdentifier.");
  return sha256(Buffer.from(`${targetKind}\u0000${targetIdentifier}`, "utf8"));
}
function leasePathFor(root, key, currentSha256, currentByteLength) {
  if (!/^[0-9a-f]{64}$/u.test(currentSha256) || !Number.isInteger(currentByteLength) || currentByteLength < 1) throw new Error("Target-snapshot lease current-target identity is malformed.");
  return path.join(root, key.slice(0, 2), `${key}.${currentSha256}.${currentByteLength}.target-snapshot-lease.json`);
}
function assertPublicationClaim(value) {
  if (value.contract !== PUBLICATION_CLAIM_CONTRACT || value.schemaSha256 !== PUBLICATION_CLAIM_SCHEMA_SHA256 || value.claimState !== "claimed-unexecuted") throw new Error("Publication execution claim contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(value, "Publication execution claim");
  for (const field of ["currentTargetRecheckedAtClaim", "rollbackBackupReverifiedAtClaim", "authorizationReverifiedAtClaim", "deterministicClaimPathRequired", "singleUseClaimEstablished", "claimInvalidOnAnyEvidenceDrift"]) if (value[field] !== true) throw new Error(`Publication execution claim lacks required invariant ${field}.`);
  return Object.freeze({ operation: "publication", currentTargetSha256: value.currentTargetSnapshotSha256, currentTargetByteLength: value.currentTargetSnapshotByteLength });
}
function assertRollbackClaim(value) {
  if (value.contract !== ROLLBACK_CLAIM_CONTRACT || value.schemaSha256 !== ROLLBACK_CLAIM_SCHEMA_SHA256 || value.claimState !== "rollback-claimed-unexecuted") throw new Error("Rollback execution claim contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(value, "Rollback execution claim");
  for (const field of ["currentPublishedTargetRecheckedAtClaim", "rollbackBackupReverifiedAtClaim", "rollbackAuthorizationReverifiedAtClaim", "deterministicClaimPathRequired", "singleUseRollbackClaimEstablished", "claimInvalidOnAnyEvidenceDrift"]) if (value[field] !== true) throw new Error(`Rollback execution claim lacks required invariant ${field}.`);
  return Object.freeze({ operation: "rollback", currentTargetSha256: value.publishedTargetSha256, currentTargetByteLength: value.publishedTargetByteLength });
}
async function verifyAuthorizationBinding(claimFile, claim) {
  if (typeof claim.authorizationReceiptPath !== "string") throw new Error("Execution claim is missing authorizationReceiptPath.");
  const authorizationFile = await bound(claim.authorizationReceiptPath);
  if (authorizationFile.sha256 !== claim.authorizationReceiptSha256 || authorizationFile.byteLength !== claim.authorizationReceiptByteLength) throw new Error("Execution claim is bound to changed authorization bytes.");
  const authorization = JSON.parse(authorizationFile.bytes.toString("utf8"));
  const expectedContract = claim.contract === PUBLICATION_CLAIM_CONTRACT ? PUBLICATION_AUTH_CONTRACT : ROLLBACK_AUTH_CONTRACT;
  const expectedState = claim.contract === PUBLICATION_CLAIM_CONTRACT ? "authorized-unexecuted" : "rollback-authorized-unexecuted";
  if (authorization.contract !== expectedContract || authorization.authorizationState !== expectedState) throw new Error("Execution claim authorization contract/state is invalid or stale.");
  assertNoMutationAuthority(authorization, "Execution authorization");
  for (const field of ["route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier"]) if (authorization[field] !== claim[field]) throw new Error(`Execution claim authorization identity drifted for ${field}.`);
  return Object.freeze({ claimFile, claim, authorizationFile, authorization });
}
async function inspectClaim(claimReceiptPath, recheckArgs = {}) {
  const claimFile = await bound(claimReceiptPath);
  const claim = JSON.parse(claimFile.bytes.toString("utf8"));
  const mode = claim.contract === PUBLICATION_CLAIM_CONTRACT ? assertPublicationClaim(claim) : assertRollbackClaim(claim);
  const chain = await verifyAuthorizationBinding(claimFile, claim);
  const live = await recheckPublicationTarget({
    targetKind: claim.targetKind,
    targetIdentifier: claim.targetIdentifier,
    currentTargetRecheckPath: recheckArgs.currentTargetRecheckPath,
    currentTargetRecheckUrl: recheckArgs.currentTargetRecheckUrl,
    readLocal: bound,
  });
  if (live.sha256 !== mode.currentTargetSha256 || live.byteLength !== mode.currentTargetByteLength) throw new Error("Target-snapshot lease cannot be established because the live target no longer matches the execution claim's current-target bytes.");
  return Object.freeze({ ...chain, ...mode, live });
}
function receiptFromReview(review) {
  const key = targetKey(review.claim.targetKind, review.claim.targetIdentifier);
  return Object.freeze({
    contract: CONTRACT,
    schemaSha256: SCHEMA_SHA256,
    leaseState: "target-snapshot-leased-unexecuted",
    operation: review.operation,
    executionClaimReceiptPath: review.claimFile.path,
    executionClaimReceiptSha256: review.claimFile.sha256,
    executionClaimReceiptByteLength: review.claimFile.byteLength,
    executionClaimContract: review.claim.contract,
    route: review.claim.route,
    candidateId: review.claim.candidateId,
    candidateSha256: review.claim.candidateSha256,
    candidateByteLength: review.claim.candidateByteLength,
    targetKind: review.claim.targetKind,
    targetIdentifier: review.claim.targetIdentifier,
    targetKeySha256: key,
    currentTargetSha256: review.currentTargetSha256,
    currentTargetByteLength: review.currentTargetByteLength,
    deterministicLeasePath: true,
    singleActiveLeasePerTargetSnapshot: true,
    publicationAndRollbackMutuallyExclusiveForSameTargetSnapshot: true,
    claimReverified: true,
    currentTargetReverified: true,
    createOnlyLease: true,
    leaseEvidenceOnly: true,
    executionAllowed: false,
    rollbackExecutionAllowed: false,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
  });
}
async function acquire(args) {
  await assertCurrentSchemaDigest();
  if (args.confirmTargetSnapshotLease !== true) throw new Error("confirmTargetSnapshotLease=true is required immediately before external publication or rollback execution.");
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required to create target-snapshot lease evidence.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);
  const review = await inspectClaim(args.executionClaimReceiptPath, args);
  const receipt = receiptFromReview(review);
  const root = configuredLeaseRoot();
  const leasePath = await allowed(leasePathFor(root, receipt.targetKeySha256, receipt.currentTargetSha256, receipt.currentTargetByteLength), true);
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  try {
    await writeCreateOnlyBundle([{ path: leasePath, data: payload, encoding: "utf8" }]);
  } catch (error) {
    if (String(error?.message ?? error).includes("refusing to overwrite existing evidence output")) throw new Error("A target-snapshot lease already exists for these exact live target bytes. A second publication or rollback execution claim for the same target snapshot is blocked until the target changes or the existing lease is explicitly resolved.");
    throw error;
  }
  return Object.freeze({ ok: true, leasePath, leaseSha256: sha256(Buffer.from(payload, "utf8")), operation: receipt.operation, route: receipt.route, candidateId: receipt.candidateId, targetKind: receipt.targetKind, targetIdentifier: receipt.targetIdentifier, targetKeySha256: receipt.targetKeySha256, currentTargetSha256: receipt.currentTargetSha256, currentTargetByteLength: receipt.currentTargetByteLength, singleActiveLeasePerTargetSnapshot: true, publicationAndRollbackMutuallyExclusiveForSameTargetSnapshot: true, leaseEvidenceOnly: true, executionAllowed: false, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}
async function verify(receiptPath, recheckArgs = {}) {
  await assertCurrentSchemaDigest();
  const file = await bound(receiptPath);
  const value = JSON.parse(file.bytes.toString("utf8"));
  if (value.contract !== CONTRACT || value.schemaSha256 !== SCHEMA_SHA256 || value.leaseState !== "target-snapshot-leased-unexecuted") throw new Error("Target-snapshot lease contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(value, "Target-snapshot lease");
  for (const field of ["deterministicLeasePath", "singleActiveLeasePerTargetSnapshot", "publicationAndRollbackMutuallyExclusiveForSameTargetSnapshot", "claimReverified", "currentTargetReverified", "createOnlyLease", "leaseEvidenceOnly"]) if (value[field] !== true) throw new Error(`Target-snapshot lease lacks required invariant ${field}.`);
  const review = await inspectClaim(value.executionClaimReceiptPath, recheckArgs);
  const expected = receiptFromReview(review);
  for (const field of ["operation", "executionClaimReceiptPath", "executionClaimReceiptSha256", "executionClaimReceiptByteLength", "executionClaimContract", "route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier", "targetKeySha256", "currentTargetSha256", "currentTargetByteLength"]) if (value[field] !== expected[field]) throw new Error(`Target-snapshot lease drifted for ${field}.`);
  const expectedPath = await allowed(leasePathFor(configuredLeaseRoot(), expected.targetKeySha256, expected.currentTargetSha256, expected.currentTargetByteLength), false);
  if (file.path !== expectedPath) throw new Error("Target-snapshot lease is not stored at the deterministic shared path for this target/current-byte identity.");
  return Object.freeze({ ok: true, leasePath: file.path, leaseSha256: file.sha256, leaseByteLength: file.byteLength, operation: value.operation, executionClaimReverified: true, currentTargetReverified: true, singleActiveLeasePerTargetSnapshot: true, publicationAndRollbackMutuallyExclusiveForSameTargetSnapshot: true, leaseEvidenceOnly: true, executionAllowed: false, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

const recheckProperties = {
  currentTargetRecheckPath: { type: "string", minLength: 1 },
  currentTargetRecheckUrl: { type: "string", minLength: 1 },
};
const tools = [
  { name: "evavo_work_header_publication_target_snapshot_lease_capabilities", description: "Describe the shared create-only target/current-byte lease that serializes publication and rollback execution claims for the same Work-header target snapshot. It never mutates the target.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_acquire_work_header_publication_target_snapshot_lease", description: "Reverify a publication or rollback execution claim plus the current target bytes, then atomically create one deterministic shared lease for that target/current-byte identity. A competing publication or rollback claim for the same live target snapshot is rejected.", inputSchema: { type: "object", properties: { executionClaimReceiptPath: { type: "string", minLength: 1 }, ...recheckProperties, confirmTargetSnapshotLease: { type: "boolean" }, confirmLocalWrite: { type: "boolean" } }, required: ["executionClaimReceiptPath", "confirmTargetSnapshotLease", "confirmLocalWrite"], additionalProperties: false } },
  { name: "evavo_verify_work_header_publication_target_snapshot_lease", description: "Read-only reverification of a target-snapshot lease against the exact execution claim, deterministic shared lease path and current live target bytes.", inputSchema: { type: "object", properties: { receiptPath: { type: "string", minLength: 1 }, ...recheckProperties }, required: ["receiptPath"], additionalProperties: false } },
];
function capabilities() {
  return Object.freeze({ contract: CONTRACT, serverVersion: SERVER_VERSION, schemaSha256: SCHEMA_SHA256, acceptedClaimContracts: [PUBLICATION_CLAIM_CONTRACT, ROLLBACK_CLAIM_CONTRACT], leaseState: "target-snapshot-leased-unexecuted", sharedLeaseRootRequired: true, leaseRootEnvironmentVariable: LEASE_ROOT_ENV, deterministicLeasePathFromTargetAndCurrentBytes: true, createOnlyLease: true, singleActiveLeasePerTargetSnapshot: true, publicationAndRollbackMutuallyExclusiveForSameTargetSnapshot: true, executionClaimReverificationRequired: true, currentTargetReverificationRequired: true, cloudinaryUsesLiveRemoteRecheck: true, websiteSourceUsesGovernedLocalRecheck: true, failClosedLeasePersistsUntilTargetBytesChangeOrExistingLeaseIsExplicitlyResolved: true, leaseEvidenceOnly: true, executionAllowed: false, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false, allowedRootCount: configuredLocalRootCount(ROOTS_ENV), writesEnabled: writesEnabled() });
}
async function callTool(name, args) {
  if (name === "evavo_work_header_publication_target_snapshot_lease_capabilities") return capabilities();
  if (name === "evavo_acquire_work_header_publication_target_snapshot_lease") return acquire(args ?? {});
  if (name === "evavo_verify_work_header_publication_target_snapshot_lease") return verify(args?.receiptPath, args ?? {});
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
    else outgoing = response(message.id, toolResult({ ok: false, message: `Unsupported method ${JSON.stringify(message.method)}.` }, true));
    if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: error instanceof Error ? error.message : String(error) }, true)))}\n`);
  }
}
