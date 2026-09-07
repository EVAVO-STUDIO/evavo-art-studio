#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-header-publication-execution-claim";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const CONTRACT = "evavo.work-header-publication-execution-claim.v1";
const SCHEMA_SHA256 = "0b7ee89628c1e55f057161d41f7cea4e3addcdefc442b51823ed507a1b612116";
const SCHEMA_URL = new URL("../contracts/work-header-publication-execution-claim-v1.schema.json", import.meta.url);
const AUTHORIZATION_CONTRACT = "evavo.work-header-publication-execution-authorization.v1";
const AUTHORIZATION_SCHEMA_SHA256 = "f56a746773e4e08db8e2d22c5bcc0fa50f8416bbfedbc6f8c18c26326ea3dff4";
const PLAN_CONTRACT = "evavo.work-header-publication-transaction-plan.v1";
const PLAN_SCHEMA_SHA256 = "f9e11403cabe947e50f0681300527fc164d551e2a8c4615f16bd723e2550d73f";
const ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";
const TARGET_KINDS = new Set(["website-header-source-update", "cloudinary-stable-id-replacement"]);
const allowed = (p, output = false) => assertAllowedLocalPath(p, { envName: ROOTS_ENV, output, label: "work header publication execution claim" });
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function assertCurrentSchemaDigest() {
  const bytes = await readFile(SCHEMA_URL);
  const current = sha256(bytes);
  if (current !== SCHEMA_SHA256) throw new Error(`Execution-claim schema bytes drifted from governed SHA-256 (${current}).`);
}

async function bound(filePath) {
  const resolved = await allowed(filePath, false);
  const bytes = await readFile(resolved);
  if (!bytes.length) throw new Error(`Evidence file is empty: ${resolved}`);
  return Object.freeze({ path: resolved, bytes, sha256: sha256(bytes), byteLength: bytes.length });
}

function assertNoMutationAuthority(value, label) {
  if (value?.executionAllowed !== false || value?.publicationAllowed !== false || value?.cloudOverwriteAllowed !== false || value?.websiteMutationAllowed !== false) {
    throw new Error(`${label} carries forbidden direct execution or mutation authority.`);
  }
}

async function resolveCandidateFromPlan(plan) {
  const preparationFile = await bound(plan.publicationPreparationReceiptPath);
  if (preparationFile.sha256 !== plan.publicationPreparationReceiptSha256 || preparationFile.byteLength !== plan.publicationPreparationReceiptByteLength) throw new Error("Transaction plan is bound to changed publication-preparation bytes.");
  const preparation = JSON.parse(preparationFile.bytes.toString("utf8"));
  if (preparation.contract !== "evavo.work-header-publication-preparation.v1" || preparation.preparationState !== "prepared-unexecuted") throw new Error("Publication preparation is invalid or stale.");
  assertNoMutationAuthority(preparation, "Publication preparation");
  const identity = preparation.preparationIdentity;
  if (!identity?.approvalDecisionPath || identity.route !== plan.route || identity.candidateId !== plan.candidateId || identity.candidateSha256 !== plan.candidateSha256 || identity.candidateByteLength !== plan.candidateByteLength) throw new Error("Transaction plan candidate identity drifted from publication preparation.");

  const decisionFile = await bound(identity.approvalDecisionPath);
  if (decisionFile.sha256 !== identity.approvalDecisionSha256 || decisionFile.byteLength !== identity.approvalDecisionByteLength) throw new Error("Approval-decision bytes changed after transaction planning.");
  const decision = JSON.parse(decisionFile.bytes.toString("utf8"));
  if (decision.contract !== "evavo.work-header-approval-decision.v1" || decision.decision !== "approved" || decision.decisionSource !== "explicit-caller" || decision.automaticDecision !== false || decision.publicationPreparationAllowed !== true) throw new Error("Execution claim requires the same explicit approved reviewer decision.");

  const packetFile = await bound(decision.evidenceIdentity?.approvalPacketPath);
  if (packetFile.sha256 !== decision.evidenceIdentity?.approvalPacketSha256 || packetFile.byteLength !== decision.evidenceIdentity?.approvalPacketByteLength) throw new Error("Approval-packet bytes changed after transaction planning.");
  const packet = JSON.parse(packetFile.bytes.toString("utf8"));
  if (packet.contract !== "evavo.work-header-approval-packet.v2" || packet.fullReceiptLineageVerified !== true || packet.browserResponseMetadataBound !== true) throw new Error("Approval packet no longer proves full reviewed browser lineage.");

  const candidate = await bound(packet.immutablePreviewCandidateArtifactPath);
  if (candidate.sha256 !== plan.candidateSha256 || candidate.byteLength !== plan.candidateByteLength) throw new Error("Exact reviewed candidate bytes changed after transaction planning.");
  return Object.freeze({ preparationFile, preparation, decisionFile, decision, packetFile, packet, candidate });
}

async function verifyAuthorizationChain(authorizationReceiptPath, currentTargetRecheckPath) {
  const authorizationFile = await bound(authorizationReceiptPath);
  const authorization = JSON.parse(authorizationFile.bytes.toString("utf8"));
  if (authorization.contract !== AUTHORIZATION_CONTRACT || authorization.schemaSha256 !== AUTHORIZATION_SCHEMA_SHA256 || authorization.authorizationState !== "authorized-unexecuted") throw new Error("Execution authorization contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(authorization, "Execution authorization");
  if (authorization.explicitExecutionConfirmation !== true || authorization.executionAuthorizedForOneTransactionOnly !== true || authorization.authorizationExpiresOnAnyEvidenceDrift !== true || authorization.transactionPlanReverified !== true || authorization.candidateBytesReverified !== true || authorization.currentTargetStillMatchesSnapshot !== true || authorization.rollbackBackupStillMatchesSnapshot !== true) throw new Error("Execution authorization lacks required single-transaction safety invariants.");

  const planFile = await bound(authorization.transactionPlanReceiptPath);
  if (planFile.sha256 !== authorization.transactionPlanReceiptSha256 || planFile.byteLength !== authorization.transactionPlanReceiptByteLength) throw new Error("Execution authorization is bound to changed transaction-plan bytes.");
  const plan = JSON.parse(planFile.bytes.toString("utf8"));
  if (plan.contract !== PLAN_CONTRACT || plan.schemaSha256 !== PLAN_SCHEMA_SHA256 || plan.transactionState !== "planned-unexecuted" || !TARGET_KINDS.has(plan.targetKind)) throw new Error("Publication transaction plan contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(plan, "Publication transaction plan");
  if (plan.explicitExecutionConfirmationRequired !== true || plan.backupCapturedBeforeExecution !== true || plan.rollbackEvidenceVerifiedBeforeExecution !== true) throw new Error("Publication transaction plan lacks execution-confirmation or rollback prerequisites.");
  if (plan.route !== authorization.route || plan.candidateId !== authorization.candidateId || plan.candidateSha256 !== authorization.candidateSha256 || plan.candidateByteLength !== authorization.candidateByteLength || plan.targetKind !== authorization.targetKind || plan.targetIdentifier !== authorization.targetIdentifier) throw new Error("Execution authorization candidate/target identity drifted from transaction plan.");

  const candidateChain = await resolveCandidateFromPlan(plan);
  const snapshot = await bound(plan.currentTargetSnapshot?.path);
  if (snapshot.sha256 !== plan.currentTargetSnapshot?.sha256 || snapshot.byteLength !== plan.currentTargetSnapshot?.byteLength || plan.currentTargetSnapshot?.immutableEvidence !== true) throw new Error("Current-target snapshot changed after transaction planning.");
  const backup = await bound(plan.rollbackEvidence?.backupPath);
  if (backup.sha256 !== plan.rollbackEvidence?.backupSha256 || backup.byteLength !== plan.rollbackEvidence?.backupByteLength || plan.rollbackEvidence?.rollbackReady !== true || plan.rollbackEvidence?.restoreTargetIdentifier !== plan.targetIdentifier) throw new Error("Rollback backup changed or is no longer ready.");
  if (backup.path === snapshot.path || backup.sha256 !== snapshot.sha256 || backup.byteLength !== snapshot.byteLength) throw new Error("Rollback backup no longer exactly matches the planned current-target snapshot.");
  if (snapshot.sha256 !== authorization.currentTargetSnapshotSha256 || snapshot.byteLength !== authorization.currentTargetSnapshotByteLength || backup.sha256 !== authorization.rollbackBackupSha256 || backup.byteLength !== authorization.rollbackBackupByteLength) throw new Error("Authorization snapshot/rollback evidence drifted from the transaction plan.");

  const recheck = await bound(currentTargetRecheckPath);
  if (recheck.sha256 !== snapshot.sha256 || recheck.byteLength !== snapshot.byteLength) throw new Error("Current target changed after execution authorization; single-use claim must not be issued.");
  return Object.freeze({ authorizationFile, authorization, planFile, plan, candidateChain, snapshot, backup, recheck });
}

function deterministicClaimPath(authorizationPath) {
  return `${authorizationPath}.execution-claim.json`;
}

async function claim(args) {
  await assertCurrentSchemaDigest();
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required to create the single-use execution claim.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);
  if (args.confirmSingleUseClaim !== true) throw new Error("confirmSingleUseClaim=true is required and must come from an explicit caller action immediately before execution.");
  const review = await verifyAuthorizationChain(args.authorizationReceiptPath, args.currentTargetRecheckPath);
  const claimPath = await allowed(deterministicClaimPath(review.authorizationFile.path), true);
  const receipt = {
    contract: CONTRACT,
    schemaSha256: SCHEMA_SHA256,
    claimState: "claimed-unexecuted",
    authorizationReceiptPath: review.authorizationFile.path,
    authorizationReceiptSha256: review.authorizationFile.sha256,
    authorizationReceiptByteLength: review.authorizationFile.byteLength,
    transactionPlanReceiptPath: review.planFile.path,
    transactionPlanReceiptSha256: review.planFile.sha256,
    transactionPlanReceiptByteLength: review.planFile.byteLength,
    route: review.plan.route,
    candidateId: review.plan.candidateId,
    candidateSha256: review.plan.candidateSha256,
    candidateByteLength: review.plan.candidateByteLength,
    targetKind: review.plan.targetKind,
    targetIdentifier: review.plan.targetIdentifier,
    currentTargetSnapshotSha256: review.snapshot.sha256,
    currentTargetSnapshotByteLength: review.snapshot.byteLength,
    rollbackBackupSha256: review.backup.sha256,
    rollbackBackupByteLength: review.backup.byteLength,
    currentTargetRecheckedAtClaim: true,
    rollbackBackupReverifiedAtClaim: true,
    authorizationReverifiedAtClaim: true,
    deterministicClaimPathRequired: true,
    singleUseClaimEstablished: true,
    claimInvalidOnAnyEvidenceDrift: true,
    executionAllowed: false,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false
  };
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeCreateOnlyBundle([{ path: claimPath, data: payload, encoding: "utf8" }]);
  return Object.freeze({ ok: true, claimPath, claimSha256: sha256(Buffer.from(payload, "utf8")), route: receipt.route, candidateId: receipt.candidateId, candidateSha256: receipt.candidateSha256, targetKind: receipt.targetKind, targetIdentifier: receipt.targetIdentifier, claimState: receipt.claimState, singleUseClaimEstablished: true, executionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

async function verifyClaim(authorizationReceiptPath, currentTargetRecheckPath) {
  await assertCurrentSchemaDigest();
  const authorizationFile = await bound(authorizationReceiptPath);
  const claimPath = deterministicClaimPath(authorizationFile.path);
  const claimFile = await bound(claimPath);
  const value = JSON.parse(claimFile.bytes.toString("utf8"));
  if (value.contract !== CONTRACT || value.schemaSha256 !== SCHEMA_SHA256 || value.claimState !== "claimed-unexecuted") throw new Error("Single-use execution claim contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(value, "Single-use execution claim");
  if (value.deterministicClaimPathRequired !== true || value.singleUseClaimEstablished !== true || value.claimInvalidOnAnyEvidenceDrift !== true || value.currentTargetRecheckedAtClaim !== true || value.rollbackBackupReverifiedAtClaim !== true || value.authorizationReverifiedAtClaim !== true) throw new Error("Single-use execution claim lacks required safety invariants.");
  if (value.authorizationReceiptPath !== authorizationFile.path || value.authorizationReceiptSha256 !== authorizationFile.sha256 || value.authorizationReceiptByteLength !== authorizationFile.byteLength) throw new Error("Single-use execution claim is bound to changed authorization bytes.");

  const review = await verifyAuthorizationChain(authorizationFile.path, currentTargetRecheckPath);
  if (review.planFile.path !== value.transactionPlanReceiptPath || review.planFile.sha256 !== value.transactionPlanReceiptSha256 || review.planFile.byteLength !== value.transactionPlanReceiptByteLength) throw new Error("Single-use execution claim transaction-plan lineage drifted.");
  if (review.plan.route !== value.route || review.plan.candidateId !== value.candidateId || review.plan.candidateSha256 !== value.candidateSha256 || review.plan.candidateByteLength !== value.candidateByteLength || review.plan.targetKind !== value.targetKind || review.plan.targetIdentifier !== value.targetIdentifier) throw new Error("Single-use execution claim candidate/target identity drifted.");
  if (review.snapshot.sha256 !== value.currentTargetSnapshotSha256 || review.snapshot.byteLength !== value.currentTargetSnapshotByteLength || review.backup.sha256 !== value.rollbackBackupSha256 || review.backup.byteLength !== value.rollbackBackupByteLength) throw new Error("Single-use execution claim snapshot/rollback evidence drifted.");
  return Object.freeze({ ok: true, claimPath: claimFile.path, claimSha256: claimFile.sha256, claimByteLength: claimFile.byteLength, authorizationReceiptSha256: authorizationFile.sha256, transactionPlanReceiptSha256: review.planFile.sha256, candidateBytesReverified: true, currentTargetStillMatchesSnapshot: true, rollbackBackupStillMatchesSnapshot: true, singleUseClaimVerified: true, claimState: "claimed-unexecuted", executionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

const tools = [
  { name: "evavo_work_header_publication_execution_claim_capabilities", description: "Describe the deterministic create-only single-use claim that consumes one execution authorization before any future executor may attempt the exact reviewed transaction. This tool performs no website or Cloudinary mutation.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_claim_work_header_publication_execution", description: "Atomically establish the deterministic one-time claim for an exact execution authorization after freshly reverifying authorization, transaction plan, candidate bytes, current target and rollback backup. A second claim for the same authorization fails because the deterministic claim receipt is create-only.", inputSchema: { type: "object", properties: { authorizationReceiptPath: { type: "string", minLength: 1 }, currentTargetRecheckPath: { type: "string", minLength: 1 }, confirmSingleUseClaim: { type: "boolean" }, confirmLocalWrite: { type: "boolean" } }, required: ["authorizationReceiptPath", "currentTargetRecheckPath", "confirmSingleUseClaim", "confirmLocalWrite"], additionalProperties: false } },
  { name: "evavo_verify_work_header_publication_execution_claim", description: "Read-only reverification of the deterministic single-use execution claim against the exact authorization, transaction plan, candidate bytes, unchanged target and rollback backup. Any evidence drift invalidates the claim.", inputSchema: { type: "object", properties: { authorizationReceiptPath: { type: "string", minLength: 1 }, currentTargetRecheckPath: { type: "string", minLength: 1 } }, required: ["authorizationReceiptPath", "currentTargetRecheckPath"], additionalProperties: false } }
];

function capabilities() {
  return Object.freeze({ contract: CONTRACT, serverVersion: SERVER_VERSION, schemaSha256: SCHEMA_SHA256, deterministicClaimPathRequired: true, createOnlySingleUseClaim: true, authorizationReverificationRequired: true, transactionPlanReverificationRequired: true, candidateBytesReverificationRequired: true, currentTargetRecheckRequired: true, rollbackBackupReverificationRequired: true, secondClaimForSameAuthorizationRejected: true, claimInvalidOnAnyEvidenceDrift: true, executionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false, allowedRootCount: configuredLocalRootCount(ROOTS_ENV), writesEnabled: writesEnabled() });
}

async function callTool(name, args) {
  if (name === "evavo_work_header_publication_execution_claim_capabilities") return capabilities();
  if (name === "evavo_claim_work_header_publication_execution") return claim(args ?? {});
  if (name === "evavo_verify_work_header_publication_execution_claim") return verifyClaim(args?.authorizationReceiptPath, args?.currentTargetRecheckPath);
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
    process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: error instanceof Error ? error.message : String(error) }, true))}\n`);
  }
}
