#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-header-publication-execution-authorization";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const CONTRACT = "evavo.work-header-publication-execution-authorization.v1";
const SCHEMA_SHA256 = "f56a746773e4e08db8e2d22c5bcc0fa50f8416bbfedbc6f8c18c26326ea3dff4";
const SCHEMA_URL = new URL("../contracts/work-header-publication-execution-authorization-v1.schema.json", import.meta.url);
const PLAN_CONTRACT = "evavo.work-header-publication-transaction-plan.v1";
const PLAN_SCHEMA_SHA256 = "f9e11403cabe947e50f0681300527fc164d551e2a8c4615f16bd723e2550d73f";
const ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";
const CONFIRMATION_STATEMENT = "I explicitly authorize execution of this exact reviewed publication transaction.";
const TARGET_KINDS = new Set(["website-header-source-update", "cloudinary-stable-id-replacement"]);
const allowed = (p, output = false) => assertAllowedLocalPath(p, { envName: ROOTS_ENV, output, label: "work header publication execution authorization" });
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function assertCurrentSchemaDigest() {
  const bytes = await readFile(SCHEMA_URL);
  const current = sha256(bytes);
  if (current !== SCHEMA_SHA256) throw new Error(`Execution-authorization schema bytes drifted from governed SHA-256 (${current}).`);
}
async function bound(filePath) {
  const resolved = await allowed(filePath, false);
  const bytes = await readFile(resolved);
  if (!bytes.length) throw new Error(`Evidence file is empty: ${resolved}`);
  return Object.freeze({ path: resolved, bytes, sha256: sha256(bytes), byteLength: bytes.length });
}
function assertNoMutationAuthority(value, label) {
  if (value?.publicationAllowed !== false || value?.cloudOverwriteAllowed !== false || value?.websiteMutationAllowed !== false || value?.executionAllowed !== false) throw new Error(`${label} carries forbidden direct execution or mutation authority.`);
}
async function resolveCandidateFromPlan(plan) {
  const prepFile = await bound(plan.publicationPreparationReceiptPath);
  if (prepFile.sha256 !== plan.publicationPreparationReceiptSha256 || prepFile.byteLength !== plan.publicationPreparationReceiptByteLength) throw new Error("Publication transaction plan is bound to changed preparation bytes.");
  const prep = JSON.parse(prepFile.bytes.toString("utf8"));
  if (prep.contract !== "evavo.work-header-publication-preparation.v1" || prep.preparationState !== "prepared-unexecuted") throw new Error("Publication preparation is invalid or stale.");
  assertNoMutationAuthority(prep, "Publication preparation");
  const identity = prep.preparationIdentity;
  if (!identity?.approvalDecisionPath || identity.route !== plan.route || identity.candidateId !== plan.candidateId || identity.candidateSha256 !== plan.candidateSha256 || identity.candidateByteLength !== plan.candidateByteLength) throw new Error("Publication transaction candidate identity drifted from preparation.");
  const decisionFile = await bound(identity.approvalDecisionPath);
  if (decisionFile.sha256 !== identity.approvalDecisionSha256 || decisionFile.byteLength !== identity.approvalDecisionByteLength) throw new Error("Approval-decision bytes changed after transaction planning.");
  const decision = JSON.parse(decisionFile.bytes.toString("utf8"));
  if (decision.contract !== "evavo.work-header-approval-decision.v1" || decision.decision !== "approved" || decision.decisionSource !== "explicit-caller" || decision.automaticDecision !== false || decision.publicationPreparationAllowed !== true) throw new Error("Execution authorization requires the same explicit approved reviewer decision.");
  const packetFile = await bound(decision.evidenceIdentity?.approvalPacketPath);
  if (packetFile.sha256 !== decision.evidenceIdentity?.approvalPacketSha256 || packetFile.byteLength !== decision.evidenceIdentity?.approvalPacketByteLength) throw new Error("Approval packet bytes changed after transaction planning.");
  const packet = JSON.parse(packetFile.bytes.toString("utf8"));
  if (packet.contract !== "evavo.work-header-approval-packet.v2" || packet.fullReceiptLineageVerified !== true || packet.browserResponseMetadataBound !== true) throw new Error("Approval packet no longer proves full reviewed browser lineage.");
  const candidate = await bound(packet.immutablePreviewCandidateArtifactPath);
  if (candidate.sha256 !== plan.candidateSha256 || candidate.byteLength !== plan.candidateByteLength) throw new Error("Exact reviewed candidate bytes changed after transaction planning.");
  return Object.freeze({ prepFile, prep, decisionFile, decision, packetFile, packet, candidate });
}
async function verifyPlan(planReceiptPath, currentTargetRecheckPath) {
  const planFile = await bound(planReceiptPath);
  const plan = JSON.parse(planFile.bytes.toString("utf8"));
  if (plan.contract !== PLAN_CONTRACT || plan.schemaSha256 !== PLAN_SCHEMA_SHA256 || plan.transactionState !== "planned-unexecuted" || !TARGET_KINDS.has(plan.targetKind)) throw new Error("Publication transaction plan contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(plan, "Publication transaction plan");
  if (plan.explicitExecutionConfirmationRequired !== true || plan.backupCapturedBeforeExecution !== true || plan.rollbackEvidenceVerifiedBeforeExecution !== true) throw new Error("Publication transaction plan lacks explicit-confirmation or rollback prerequisites.");
  const candidateChain = await resolveCandidateFromPlan(plan);
  const snapshot = await bound(plan.currentTargetSnapshot?.path);
  if (snapshot.sha256 !== plan.currentTargetSnapshot?.sha256 || snapshot.byteLength !== plan.currentTargetSnapshot?.byteLength || plan.currentTargetSnapshot?.immutableEvidence !== true) throw new Error("Current-target snapshot changed after transaction planning.");
  const backup = await bound(plan.rollbackEvidence?.backupPath);
  if (backup.sha256 !== plan.rollbackEvidence?.backupSha256 || backup.byteLength !== plan.rollbackEvidence?.backupByteLength || plan.rollbackEvidence?.rollbackReady !== true || plan.rollbackEvidence?.restoreTargetIdentifier !== plan.targetIdentifier) throw new Error("Rollback backup changed or is no longer ready.");
  if (backup.path === snapshot.path || backup.sha256 !== snapshot.sha256 || backup.byteLength !== snapshot.byteLength) throw new Error("Rollback backup no longer exactly matches the planned current-target snapshot.");
  const recheck = await bound(currentTargetRecheckPath);
  if (recheck.sha256 !== snapshot.sha256 || recheck.byteLength !== snapshot.byteLength) throw new Error("Current target changed after transaction planning; execution authorization is stale and must not be issued.");
  return Object.freeze({ planFile, plan, candidateChain, snapshot, backup, recheck });
}

async function authorize(args) {
  await assertCurrentSchemaDigest();
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required to create an execution-authorization receipt.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);
  if (args.confirmExecutionAuthorization !== true) throw new Error("confirmExecutionAuthorization=true is required and must come from an explicit caller action.");
  if (args.confirmationStatement !== CONFIRMATION_STATEMENT) throw new Error(`confirmationStatement must exactly equal: ${CONFIRMATION_STATEMENT}`);
  const review = await verifyPlan(args.transactionPlanReceiptPath, args.currentTargetRecheckPath);
  const plan = review.plan;
  const receipt = {
    contract: CONTRACT,
    schemaSha256: SCHEMA_SHA256,
    authorizationState: "authorized-unexecuted",
    transactionPlanReceiptPath: review.planFile.path,
    transactionPlanReceiptSha256: review.planFile.sha256,
    transactionPlanReceiptByteLength: review.planFile.byteLength,
    route: plan.route,
    candidateId: plan.candidateId,
    candidateSha256: plan.candidateSha256,
    candidateByteLength: plan.candidateByteLength,
    targetKind: plan.targetKind,
    targetIdentifier: plan.targetIdentifier,
    currentTargetSnapshotSha256: review.snapshot.sha256,
    currentTargetSnapshotByteLength: review.snapshot.byteLength,
    rollbackBackupSha256: review.backup.sha256,
    rollbackBackupByteLength: review.backup.byteLength,
    explicitExecutionConfirmation: true,
    confirmationStatement: CONFIRMATION_STATEMENT,
    transactionPlanReverified: true,
    candidateBytesReverified: true,
    currentTargetStillMatchesSnapshot: true,
    rollbackBackupStillMatchesSnapshot: true,
    executionAuthorizedForOneTransactionOnly: true,
    authorizationExpiresOnAnyEvidenceDrift: true,
    executionAllowed: false,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
  };
  const receiptPath = await allowed(args.receiptPath, true);
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeCreateOnlyBundle([{ path: receiptPath, data: payload, encoding: "utf8" }]);
  return Object.freeze({ ok: true, receiptPath, receiptSha256: sha256(Buffer.from(payload, "utf8")), route: plan.route, candidateId: plan.candidateId, candidateSha256: plan.candidateSha256, targetKind: plan.targetKind, targetIdentifier: plan.targetIdentifier, authorizationState: "authorized-unexecuted", executionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

async function verifyAuthorization(receiptPath, currentTargetRecheckPath) {
  await assertCurrentSchemaDigest();
  const receiptFile = await bound(receiptPath);
  const value = JSON.parse(receiptFile.bytes.toString("utf8"));
  if (value.contract !== CONTRACT || value.schemaSha256 !== SCHEMA_SHA256 || value.authorizationState !== "authorized-unexecuted" || value.explicitExecutionConfirmation !== true || value.confirmationStatement !== CONFIRMATION_STATEMENT) throw new Error("Execution-authorization receipt contract/schema/confirmation is invalid or stale.");
  assertNoMutationAuthority(value, "Execution-authorization receipt");
  if (value.executionAuthorizedForOneTransactionOnly !== true || value.authorizationExpiresOnAnyEvidenceDrift !== true || value.transactionPlanReverified !== true || value.candidateBytesReverified !== true || value.currentTargetStillMatchesSnapshot !== true || value.rollbackBackupStillMatchesSnapshot !== true) throw new Error("Execution-authorization receipt lacks required single-transaction safety invariants.");
  const review = await verifyPlan(value.transactionPlanReceiptPath, currentTargetRecheckPath);
  if (review.planFile.sha256 !== value.transactionPlanReceiptSha256 || review.planFile.byteLength !== value.transactionPlanReceiptByteLength) throw new Error("Execution authorization is bound to changed transaction-plan bytes.");
  if (review.plan.route !== value.route || review.plan.candidateId !== value.candidateId || review.plan.candidateSha256 !== value.candidateSha256 || review.plan.candidateByteLength !== value.candidateByteLength || review.plan.targetKind !== value.targetKind || review.plan.targetIdentifier !== value.targetIdentifier) throw new Error("Execution authorization candidate/target identity drifted from transaction plan.");
  if (review.snapshot.sha256 !== value.currentTargetSnapshotSha256 || review.snapshot.byteLength !== value.currentTargetSnapshotByteLength || review.backup.sha256 !== value.rollbackBackupSha256 || review.backup.byteLength !== value.rollbackBackupByteLength) throw new Error("Execution authorization snapshot/rollback evidence drifted.");
  return Object.freeze({ ok: true, receiptPath: receiptFile.path, receiptSha256: receiptFile.sha256, receiptByteLength: receiptFile.byteLength, schemaSha256: SCHEMA_SHA256, transactionPlanReverified: true, candidateBytesReverified: true, currentTargetStillMatchesSnapshot: true, rollbackBackupStillMatchesSnapshot: true, authorizationValidForOneTransactionOnly: true, authorizationState: "authorized-unexecuted", executionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

const tools = [
  { name: "evavo_work_header_publication_execution_authorization_capabilities", description: "Describe the explicit single-transaction execution-authorization gate. It records deliberate execution consent after re-verifying the transaction plan, exact candidate, unchanged target and rollback backup, but still performs no mutation.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_authorize_work_header_publication_execution", description: "Create a create-only execution-authorization receipt only after exact explicit confirmation and fresh reverification of the reviewed transaction, candidate, target snapshot and rollback backup. This tool never mutates website or Cloudinary targets.", inputSchema: { type: "object", properties: { transactionPlanReceiptPath: { type: "string", minLength: 1 }, currentTargetRecheckPath: { type: "string", minLength: 1 }, confirmationStatement: { type: "string" }, confirmExecutionAuthorization: { type: "boolean" }, receiptPath: { type: "string", minLength: 1 }, confirmLocalWrite: { type: "boolean" } }, required: ["transactionPlanReceiptPath", "currentTargetRecheckPath", "confirmationStatement", "confirmExecutionAuthorization", "receiptPath", "confirmLocalWrite"], additionalProperties: false } },
  { name: "evavo_verify_work_header_publication_execution_authorization", description: "Read-only reverification of an execution authorization against the exact transaction plan, candidate bytes, current-target recheck and rollback backup. Any evidence drift invalidates authorization. It performs no mutation.", inputSchema: { type: "object", properties: { receiptPath: { type: "string", minLength: 1 }, currentTargetRecheckPath: { type: "string", minLength: 1 } }, required: ["receiptPath", "currentTargetRecheckPath"], additionalProperties: false } },
];
function capabilities() {
  return Object.freeze({ contract: CONTRACT, serverVersion: SERVER_VERSION, schemaSha256: SCHEMA_SHA256, explicitExecutionConfirmationRequired: true, exactConfirmationStatementRequired: true, transactionPlanReverificationRequired: true, candidateBytesReverificationRequired: true, currentTargetRecheckRequired: true, rollbackBackupReverificationRequired: true, singleTransactionAuthorizationOnly: true, authorizationExpiresOnAnyEvidenceDrift: true, createOnlyReceiptWrite: true, executionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false, allowedRootCount: configuredLocalRootCount(ROOTS_ENV), writesEnabled: writesEnabled() });
}
async function callTool(name, args) {
  if (name === "evavo_work_header_publication_execution_authorization_capabilities") return capabilities();
  if (name === "evavo_authorize_work_header_publication_execution") return authorize(args ?? {});
  if (name === "evavo_verify_work_header_publication_execution_authorization") return verifyAuthorization(args?.receiptPath, args?.currentTargetRecheckPath);
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
