#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-header-publication-transaction-plan";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const CONTRACT = "evavo.work-header-publication-transaction-plan.v1";
const SCHEMA_SHA256 = "f9e11403cabe947e50f0681300527fc164d551e2a8c4615f16bd723e2550d73f";
const SCHEMA_URL = new URL("../contracts/work-header-publication-transaction-plan-v1.schema.json", import.meta.url);
const PREPARATION_SCHEMA_SHA256 = "57fb248558c3945c4845904c3f22daa65c4c32b0ef8a85af14af28e3fbdf6a5b";
const ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";
const TARGET_KINDS = new Set(["website-header-source-update", "cloudinary-stable-id-replacement"]);
const allowed = (p, output = false) => assertAllowedLocalPath(p, { envName: ROOTS_ENV, output, label: "work header publication transaction plan" });
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const canonical = (value) => JSON.stringify(value);

async function assertCurrentSchemaDigest() {
  const bytes = await readFile(SCHEMA_URL);
  const current = sha256(bytes);
  if (current !== SCHEMA_SHA256) throw new Error(`Publication-transaction schema bytes drifted from governed SHA-256 (${current}).`);
  return Object.freeze({ sha256: current, byteLength: bytes.length });
}

async function bound(filePath) {
  const resolved = await allowed(filePath, false);
  const bytes = await readFile(resolved);
  if (!bytes.length) throw new Error(`Evidence file is empty: ${resolved}`);
  return Object.freeze({ path: resolved, bytes, sha256: sha256(bytes), byteLength: bytes.length });
}

function assertNoMutationAuthority(value, label) {
  if (value?.publicationAllowed !== false || value?.cloudOverwriteAllowed !== false || value?.websiteMutationAllowed !== false) throw new Error(`${label} carries forbidden direct mutation authority.`);
}

async function verifyPreparation(filePath) {
  const preparationFile = await bound(filePath);
  const value = JSON.parse(preparationFile.bytes.toString("utf8"));
  if (value.contract !== "evavo.work-header-publication-preparation.v1" || value.schemaSha256 !== PREPARATION_SCHEMA_SHA256 || value.preparationState !== "prepared-unexecuted" || !TARGET_KINDS.has(value.targetKind)) throw new Error("Publication-preparation receipt is invalid, stale or unsupported.");
  assertNoMutationAuthority(value, "Publication-preparation receipt");
  if (value.executionAllowed !== false || value.backupRequiredBeforeExecution !== true || value.rollbackEvidenceRequiredBeforeExecution !== true || value.explicitReviewerApprovalRequiredAndVerified !== true || value.fullReceiptLineageVerified !== true || value.browserResponseMetadataVerified !== true || value.candidateBytesVerified !== true) throw new Error("Publication preparation lacks the verified non-executing safety boundary.");
  const identity = value.preparationIdentity;
  if (!identity?.approvalDecisionPath || value.preparationIdentitySha256 !== sha256(Buffer.from(canonical(identity), "utf8"))) throw new Error("Publication-preparation identity digest is invalid.");
  if (identity.targetKind !== value.targetKind || identity.targetIdentifier !== value.targetIdentifier || identity.candidateSha256 !== value.preparationIdentity.candidateSha256 || !Number.isInteger(identity.candidateByteLength) || identity.candidateByteLength < 1) throw new Error("Publication-preparation target/candidate identity is malformed.");

  const decisionFile = await bound(identity.approvalDecisionPath);
  if (decisionFile.sha256 !== identity.approvalDecisionSha256 || decisionFile.byteLength !== identity.approvalDecisionByteLength) throw new Error("Publication preparation is bound to changed approval-decision bytes.");
  const decision = JSON.parse(decisionFile.bytes.toString("utf8"));
  if (decision.contract !== "evavo.work-header-approval-decision.v1" || decision.decision !== "approved" || decision.decisionSource !== "explicit-caller" || decision.automaticDecision !== false || decision.publicationPreparationAllowed !== true) throw new Error("Publication transaction requires the same explicit approved reviewer decision.");
  assertNoMutationAuthority(decision, "Approval-decision receipt");

  const decisionIdentity = decision.evidenceIdentity;
  if (!decisionIdentity?.approvalPacketPath || decision.evidenceIdentitySha256 !== sha256(Buffer.from(canonical(decisionIdentity), "utf8"))) throw new Error("Approval-decision evidence identity is invalid.");
  if (decisionIdentity.route !== identity.route || decisionIdentity.candidateId !== identity.candidateId || decisionIdentity.candidateSha256 !== identity.candidateSha256 || decisionIdentity.candidateByteLength !== identity.candidateByteLength) throw new Error("Publication preparation and approval decision candidate identity drifted.");

  const packetFile = await bound(decisionIdentity.approvalPacketPath);
  if (packetFile.sha256 !== decisionIdentity.approvalPacketSha256 || packetFile.byteLength !== decisionIdentity.approvalPacketByteLength) throw new Error("Approval packet bytes changed after explicit approval.");
  const packet = JSON.parse(packetFile.bytes.toString("utf8"));
  if (packet.contract !== "evavo.work-header-approval-packet.v2" || packet.fullReceiptLineageVerified !== true || packet.browserResponseMetadataBound !== true || packet.publicationAllowed !== false) throw new Error("Approval packet no longer proves full review lineage.");

  const candidate = await bound(packet.immutablePreviewCandidateArtifactPath);
  if (candidate.sha256 !== identity.candidateSha256 || candidate.byteLength !== identity.candidateByteLength || candidate.sha256 !== packet.immutablePreviewCandidateArtifactSha256 || candidate.byteLength !== packet.immutablePreviewCandidateArtifactByteLength) throw new Error("Exact candidate bytes changed after publication preparation.");

  return Object.freeze({ preparationFile, preparation: value, identity, decisionFile, decision, packetFile, packet, candidate });
}

async function planTransaction(args) {
  await assertCurrentSchemaDigest();
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required to create a publication transaction plan receipt.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);
  const review = await verifyPreparation(args.publicationPreparationReceiptPath);
  const snapshot = await bound(args.currentTargetSnapshotPath);
  const backup = await bound(args.rollbackBackupPath);
  if (snapshot.path === backup.path) throw new Error("Rollback backup must be a separate immutable file from the current-target snapshot.");
  if (snapshot.sha256 !== backup.sha256 || snapshot.byteLength !== backup.byteLength) throw new Error("Rollback backup does not exactly reproduce the captured current target bytes.");
  if (snapshot.sha256 === review.candidate.sha256 && snapshot.byteLength === review.candidate.byteLength) throw new Error("Current target already matches the reviewed candidate; publication transaction is unnecessary.");

  const targetKind = review.preparation.targetKind;
  const targetIdentifier = review.preparation.targetIdentifier;
  const receipt = {
    contract: CONTRACT,
    schemaSha256: SCHEMA_SHA256,
    transactionState: "planned-unexecuted",
    targetKind,
    targetIdentifier,
    publicationPreparationReceiptPath: review.preparationFile.path,
    publicationPreparationReceiptSha256: review.preparationFile.sha256,
    publicationPreparationReceiptByteLength: review.preparationFile.byteLength,
    route: review.identity.route,
    candidateId: review.identity.candidateId,
    candidateSha256: review.candidate.sha256,
    candidateByteLength: review.candidate.byteLength,
    currentTargetSnapshot: { path: snapshot.path, sha256: snapshot.sha256, byteLength: snapshot.byteLength, immutableEvidence: true },
    rollbackEvidence: { backupPath: backup.path, backupSha256: backup.sha256, backupByteLength: backup.byteLength, restoreTargetIdentifier: targetIdentifier, rollbackReady: true },
    explicitExecutionConfirmationRequired: true,
    backupCapturedBeforeExecution: true,
    rollbackEvidenceVerifiedBeforeExecution: true,
    stableUrlOrPublicIdMustBePreserved: targetKind === "cloudinary-stable-id-replacement",
    websiteRevertPointRequired: targetKind === "website-header-source-update",
    executionAllowed: false,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
  };
  const receiptPath = await allowed(args.receiptPath, true);
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeCreateOnlyBundle([{ path: receiptPath, data: payload, encoding: "utf8" }]);
  return Object.freeze({ ok: true, receiptPath, receiptSha256: sha256(Buffer.from(payload, "utf8")), route: receipt.route, candidateId: receipt.candidateId, candidateSha256: receipt.candidateSha256, targetKind, targetIdentifier, transactionState: receipt.transactionState, backupCapturedBeforeExecution: true, rollbackEvidenceVerifiedBeforeExecution: true, executionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

async function verifyTransactionPlan(receiptPath) {
  await assertCurrentSchemaDigest();
  const receiptFile = await bound(receiptPath);
  const value = JSON.parse(receiptFile.bytes.toString("utf8"));
  if (value.contract !== CONTRACT || value.schemaSha256 !== SCHEMA_SHA256 || value.transactionState !== "planned-unexecuted" || !TARGET_KINDS.has(value.targetKind)) throw new Error("Publication transaction plan contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(value, "Publication transaction plan");
  if (value.executionAllowed !== false || value.explicitExecutionConfirmationRequired !== true || value.backupCapturedBeforeExecution !== true || value.rollbackEvidenceVerifiedBeforeExecution !== true) throw new Error("Publication transaction plan lacks the non-executing rollback-safe boundary.");

  const preparation = await verifyPreparation(value.publicationPreparationReceiptPath);
  if (preparation.preparationFile.sha256 !== value.publicationPreparationReceiptSha256 || preparation.preparationFile.byteLength !== value.publicationPreparationReceiptByteLength) throw new Error("Publication transaction plan is bound to changed preparation bytes.");
  if (preparation.identity.route !== value.route || preparation.identity.candidateId !== value.candidateId || preparation.candidate.sha256 !== value.candidateSha256 || preparation.candidate.byteLength !== value.candidateByteLength || preparation.preparation.targetKind !== value.targetKind || preparation.preparation.targetIdentifier !== value.targetIdentifier) throw new Error("Publication transaction plan candidate/target identity drifted from preparation.");

  const snapshot = await bound(value.currentTargetSnapshot?.path);
  if (snapshot.sha256 !== value.currentTargetSnapshot?.sha256 || snapshot.byteLength !== value.currentTargetSnapshot?.byteLength || value.currentTargetSnapshot?.immutableEvidence !== true) throw new Error("Current-target snapshot evidence changed after transaction planning.");
  const backup = await bound(value.rollbackEvidence?.backupPath);
  if (backup.sha256 !== value.rollbackEvidence?.backupSha256 || backup.byteLength !== value.rollbackEvidence?.backupByteLength || value.rollbackEvidence?.rollbackReady !== true || value.rollbackEvidence?.restoreTargetIdentifier !== value.targetIdentifier) throw new Error("Rollback backup evidence changed or is not ready.");
  if (snapshot.path === backup.path || snapshot.sha256 !== backup.sha256 || snapshot.byteLength !== backup.byteLength) throw new Error("Rollback evidence no longer exactly reproduces the captured current target bytes.");
  if (value.stableUrlOrPublicIdMustBePreserved !== (value.targetKind === "cloudinary-stable-id-replacement")) throw new Error("Stable public-ID preservation requirement drifted from target kind.");
  if (value.websiteRevertPointRequired !== (value.targetKind === "website-header-source-update")) throw new Error("Website revert-point requirement drifted from target kind.");

  return Object.freeze({ ok: true, receiptPath: receiptFile.path, receiptSha256: receiptFile.sha256, receiptByteLength: receiptFile.byteLength, schemaSha256: SCHEMA_SHA256, preparationReverifiedAndMatched: true, candidateBytesReverified: true, currentTargetSnapshotVerified: true, rollbackBackupVerified: true, exactRollbackByteMatchVerified: true, route: value.route, candidateId: value.candidateId, candidateSha256: value.candidateSha256, targetKind: value.targetKind, targetIdentifier: value.targetIdentifier, explicitExecutionConfirmationRequired: true, executionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

const tools = [
  { name: "evavo_work_header_publication_transaction_plan_capabilities", description: "Describe the schema-bound non-executing transaction-plan stage that requires exact current-target backup and rollback evidence before any later publication execution can be considered.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_plan_work_header_publication_transaction", description: "Create a create-only publication transaction plan after re-verifying the explicit approved preparation, exact candidate bytes, current target snapshot and a separate byte-identical rollback backup. This tool never mutates website or Cloudinary targets.", inputSchema: { type: "object", properties: { publicationPreparationReceiptPath: { type: "string", minLength: 1 }, currentTargetSnapshotPath: { type: "string", minLength: 1 }, rollbackBackupPath: { type: "string", minLength: 1 }, receiptPath: { type: "string", minLength: 1 }, confirmLocalWrite: { type: "boolean" } }, required: ["publicationPreparationReceiptPath", "currentTargetSnapshotPath", "rollbackBackupPath", "receiptPath", "confirmLocalWrite"], additionalProperties: false } },
  { name: "evavo_verify_work_header_publication_transaction_plan", description: "Read-only reverification of a publication transaction plan against its preparation, explicit approval, exact candidate, current-target snapshot and byte-identical rollback backup evidence. It grants no mutation authority.", inputSchema: { type: "object", properties: { receiptPath: { type: "string", minLength: 1 } }, required: ["receiptPath"], additionalProperties: false } },
];

function capabilities() {
  return Object.freeze({ contract: CONTRACT, serverVersion: SERVER_VERSION, schemaSha256: SCHEMA_SHA256, readOnlyTargetAccess: true, explicitApprovedPreparationRequired: true, preparationReverificationRequired: true, exactCandidateBytesRequired: true, currentTargetSnapshotRequired: true, separateRollbackBackupRequired: true, exactRollbackByteMatchRequired: true, explicitExecutionConfirmationRequired: true, createOnlyReceiptWrite: true, rollbackSafeReceiptWrite: true, executionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false, allowedRootCount: configuredLocalRootCount(ROOTS_ENV), writesEnabled: writesEnabled() });
}

async function callTool(name, args) {
  if (name === "evavo_work_header_publication_transaction_plan_capabilities") return capabilities();
  if (name === "evavo_plan_work_header_publication_transaction") return planTransaction(args ?? {});
  if (name === "evavo_verify_work_header_publication_transaction_plan") return verifyTransactionPlan(args?.receiptPath);
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
  } catch (error) { process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: String(error) }, true)))}\n`); }
}
