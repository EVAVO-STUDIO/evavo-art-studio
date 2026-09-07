#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-header-publication-execution-result";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const CONTRACT = "evavo.work-header-publication-execution-result.v1";
const SCHEMA_SHA256 = "6d94ca926dea8c5c0fdc025c3d65a8692ae5c8c6e61db2d37a536ae352d52445";
const SCHEMA_URL = new URL("../contracts/work-header-publication-execution-result-v1.schema.json", import.meta.url);
const CLAIM_CONTRACT = "evavo.work-header-publication-execution-claim.v1";
const CLAIM_SCHEMA_SHA256 = "0b7ee89628c1e55f057161d41f7cea4e3addcdefc442b51823ed507a1b612116";
const AUTHORIZATION_CONTRACT = "evavo.work-header-publication-execution-authorization.v1";
const AUTHORIZATION_SCHEMA_SHA256 = "f56a746773e4e08db8e2d22c5bcc0fa50f8416bbfedbc6f8c18c26326ea3dff4";
const PLAN_CONTRACT = "evavo.work-header-publication-transaction-plan.v1";
const PLAN_SCHEMA_SHA256 = "f9e11403cabe947e50f0681300527fc164d551e2a8c4615f16bd723e2550d73f";
const ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";
const TARGET_KINDS = new Set(["website-header-source-update", "cloudinary-stable-id-replacement"]);
const allowed = (p, output = false) => assertAllowedLocalPath(p, { envName: ROOTS_ENV, output, label: "work header publication execution result" });
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function assertCurrentSchemaDigest() {
  const bytes = await readFile(SCHEMA_URL);
  const current = sha256(bytes);
  if (current !== SCHEMA_SHA256) throw new Error(`Execution-result schema bytes drifted from governed SHA-256 (${current}).`);
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

function deterministicResultPath(claimPath) {
  return `${claimPath}.execution-result.json`;
}

async function resolveCandidateFromPlan(plan) {
  const preparationFile = await bound(plan.publicationPreparationReceiptPath);
  if (preparationFile.sha256 !== plan.publicationPreparationReceiptSha256 || preparationFile.byteLength !== plan.publicationPreparationReceiptByteLength) throw new Error("Transaction plan is bound to changed publication-preparation bytes.");
  const preparation = JSON.parse(preparationFile.bytes.toString("utf8"));
  if (preparation.contract !== "evavo.work-header-publication-preparation.v1" || preparation.preparationState !== "prepared-unexecuted") throw new Error("Publication preparation is invalid or stale.");
  assertNoMutationAuthority(preparation, "Publication preparation");
  const identity = preparation.preparationIdentity;
  if (!identity?.approvalDecisionPath || identity.route !== plan.route || identity.candidateId !== plan.candidateId || identity.candidateSha256 !== plan.candidateSha256 || identity.candidateByteLength !== plan.candidateByteLength) throw new Error("Transaction-plan candidate identity drifted from publication preparation.");

  const decisionFile = await bound(identity.approvalDecisionPath);
  if (decisionFile.sha256 !== identity.approvalDecisionSha256 || decisionFile.byteLength !== identity.approvalDecisionByteLength) throw new Error("Approval-decision bytes changed after transaction planning.");
  const decision = JSON.parse(decisionFile.bytes.toString("utf8"));
  if (decision.contract !== "evavo.work-header-approval-decision.v1" || decision.decision !== "approved" || decision.decisionSource !== "explicit-caller" || decision.automaticDecision !== false || decision.publicationPreparationAllowed !== true) throw new Error("Execution-result attestation requires the same explicit approved reviewer decision.");

  const packetFile = await bound(decision.evidenceIdentity?.approvalPacketPath);
  if (packetFile.sha256 !== decision.evidenceIdentity?.approvalPacketSha256 || packetFile.byteLength !== decision.evidenceIdentity?.approvalPacketByteLength) throw new Error("Approval-packet bytes changed after transaction planning.");
  const packet = JSON.parse(packetFile.bytes.toString("utf8"));
  if (packet.contract !== "evavo.work-header-approval-packet.v2" || packet.fullReceiptLineageVerified !== true || packet.browserResponseMetadataBound !== true || packet.exactTriggeredBrowserRequestBindingVerified !== true) throw new Error("Approval packet no longer proves full reviewed browser lineage.");
  const candidate = await bound(packet.immutablePreviewCandidateArtifactPath);
  if (candidate.sha256 !== plan.candidateSha256 || candidate.byteLength !== plan.candidateByteLength) throw new Error("Exact reviewed candidate bytes changed after transaction planning.");
  return Object.freeze({ preparationFile, decisionFile, packetFile, candidate });
}

async function reverifyClaimChain(claimReceiptPath) {
  const claimFile = await bound(claimReceiptPath);
  const claim = JSON.parse(claimFile.bytes.toString("utf8"));
  if (claim.contract !== CLAIM_CONTRACT || claim.schemaSha256 !== CLAIM_SCHEMA_SHA256 || claim.claimState !== "claimed-unexecuted") throw new Error("Single-use execution claim contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(claim, "Single-use execution claim");
  if (claim.deterministicClaimPathRequired !== true || claim.singleUseClaimEstablished !== true || claim.claimInvalidOnAnyEvidenceDrift !== true || claim.currentTargetRecheckedAtClaim !== true || claim.rollbackBackupReverifiedAtClaim !== true || claim.authorizationReverifiedAtClaim !== true) throw new Error("Single-use execution claim lacks required safety invariants.");
  const expectedClaimPath = `${claim.authorizationReceiptPath}.execution-claim.json`;
  if (claimFile.path !== await allowed(expectedClaimPath, false)) throw new Error("Execution claim is not at the deterministic single-use path for its authorization.");

  const authorizationFile = await bound(claim.authorizationReceiptPath);
  if (authorizationFile.sha256 !== claim.authorizationReceiptSha256 || authorizationFile.byteLength !== claim.authorizationReceiptByteLength) throw new Error("Single-use claim is bound to changed authorization bytes.");
  const authorization = JSON.parse(authorizationFile.bytes.toString("utf8"));
  if (authorization.contract !== AUTHORIZATION_CONTRACT || authorization.schemaSha256 !== AUTHORIZATION_SCHEMA_SHA256 || authorization.authorizationState !== "authorized-unexecuted") throw new Error("Execution authorization contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(authorization, "Execution authorization");
  if (authorization.explicitExecutionConfirmation !== true || authorization.executionAuthorizedForOneTransactionOnly !== true || authorization.authorizationExpiresOnAnyEvidenceDrift !== true || authorization.transactionPlanReverified !== true || authorization.candidateBytesReverified !== true || authorization.currentTargetStillMatchesSnapshot !== true || authorization.rollbackBackupStillMatchesSnapshot !== true) throw new Error("Execution authorization lacks required single-transaction safety invariants.");

  const planFile = await bound(claim.transactionPlanReceiptPath);
  if (planFile.sha256 !== claim.transactionPlanReceiptSha256 || planFile.byteLength !== claim.transactionPlanReceiptByteLength || planFile.path !== authorization.transactionPlanReceiptPath || planFile.sha256 !== authorization.transactionPlanReceiptSha256 || planFile.byteLength !== authorization.transactionPlanReceiptByteLength) throw new Error("Execution claim/authorization transaction-plan lineage is stale.");
  const plan = JSON.parse(planFile.bytes.toString("utf8"));
  if (plan.contract !== PLAN_CONTRACT || plan.schemaSha256 !== PLAN_SCHEMA_SHA256 || plan.transactionState !== "planned-unexecuted" || !TARGET_KINDS.has(plan.targetKind)) throw new Error("Publication transaction plan contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(plan, "Publication transaction plan");
  if (plan.explicitExecutionConfirmationRequired !== true || plan.backupCapturedBeforeExecution !== true || plan.rollbackEvidenceVerifiedBeforeExecution !== true) throw new Error("Publication transaction plan lacks execution-confirmation or rollback prerequisites.");

  for (const field of ["route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier"]) {
    if (claim[field] !== authorization[field] || claim[field] !== plan[field]) throw new Error(`Execution claim identity drifted for ${field}.`);
  }

  const candidateChain = await resolveCandidateFromPlan(plan);
  const snapshot = await bound(plan.currentTargetSnapshot?.path);
  if (snapshot.sha256 !== plan.currentTargetSnapshot?.sha256 || snapshot.byteLength !== plan.currentTargetSnapshot?.byteLength || plan.currentTargetSnapshot?.immutableEvidence !== true) throw new Error("Previous target snapshot changed after transaction planning.");
  const backup = await bound(plan.rollbackEvidence?.backupPath);
  if (backup.sha256 !== plan.rollbackEvidence?.backupSha256 || backup.byteLength !== plan.rollbackEvidence?.backupByteLength || plan.rollbackEvidence?.rollbackReady !== true || plan.rollbackEvidence?.restoreTargetIdentifier !== plan.targetIdentifier) throw new Error("Rollback backup changed or is no longer ready.");
  if (backup.path === snapshot.path || backup.sha256 !== snapshot.sha256 || backup.byteLength !== snapshot.byteLength) throw new Error("Rollback backup no longer exactly matches the planned previous-target snapshot.");
  if (snapshot.sha256 !== claim.currentTargetSnapshotSha256 || snapshot.byteLength !== claim.currentTargetSnapshotByteLength || backup.sha256 !== claim.rollbackBackupSha256 || backup.byteLength !== claim.rollbackBackupByteLength) throw new Error("Execution claim snapshot/rollback bindings drifted.");
  if (snapshot.sha256 !== authorization.currentTargetSnapshotSha256 || snapshot.byteLength !== authorization.currentTargetSnapshotByteLength || backup.sha256 !== authorization.rollbackBackupSha256 || backup.byteLength !== authorization.rollbackBackupByteLength) throw new Error("Execution authorization snapshot/rollback bindings drifted.");

  return Object.freeze({ claimFile, claim, authorizationFile, authorization, planFile, plan, candidateChain, snapshot, backup });
}

async function attest(args) {
  await assertCurrentSchemaDigest();
  if (args.confirmObservedExternalExecution !== true) throw new Error("confirmObservedExternalExecution=true is required and must describe an execution that already occurred outside this attestation tool.");
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required to write result evidence.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);
  if (typeof args.claimReceiptPath !== "string" || typeof args.postExecutionTargetPath !== "string") throw new Error("claimReceiptPath and postExecutionTargetPath are required.");

  const review = await reverifyClaimChain(args.claimReceiptPath);
  const postTarget = await bound(args.postExecutionTargetPath);
  if (postTarget.path === review.snapshot.path || postTarget.path === review.backup.path) throw new Error("Post-execution target must be distinct from the immutable previous-target snapshot and rollback backup.");
  if (postTarget.sha256 !== review.candidateChain.candidate.sha256 || postTarget.byteLength !== review.candidateChain.candidate.byteLength) throw new Error("Post-execution target does not exactly match the reviewed candidate bytes.");
  if (postTarget.sha256 === review.snapshot.sha256 && postTarget.byteLength === review.snapshot.byteLength) throw new Error("Post-execution target does not differ from the previous target snapshot; execution cannot be attested.");

  const resultPath = await allowed(deterministicResultPath(review.claimFile.path), true);
  const receipt = {
    contract: CONTRACT,
    schemaSha256: SCHEMA_SHA256,
    resultState: "executed-verified",
    claimReceiptPath: review.claimFile.path,
    claimReceiptSha256: review.claimFile.sha256,
    claimReceiptByteLength: review.claimFile.byteLength,
    authorizationReceiptPath: review.authorizationFile.path,
    authorizationReceiptSha256: review.authorizationFile.sha256,
    authorizationReceiptByteLength: review.authorizationFile.byteLength,
    transactionPlanReceiptPath: review.planFile.path,
    transactionPlanReceiptSha256: review.planFile.sha256,
    transactionPlanReceiptByteLength: review.planFile.byteLength,
    route: review.plan.route,
    candidateId: review.plan.candidateId,
    candidateSha256: review.candidateChain.candidate.sha256,
    candidateByteLength: review.candidateChain.candidate.byteLength,
    targetKind: review.plan.targetKind,
    targetIdentifier: review.plan.targetIdentifier,
    previousTargetSnapshotSha256: review.snapshot.sha256,
    previousTargetSnapshotByteLength: review.snapshot.byteLength,
    rollbackBackupSha256: review.backup.sha256,
    rollbackBackupByteLength: review.backup.byteLength,
    postExecutionTargetPath: postTarget.path,
    postExecutionTargetSha256: postTarget.sha256,
    postExecutionTargetByteLength: postTarget.byteLength,
    claimReverifiedBeforeAttestation: true,
    candidateBytesReverified: true,
    postExecutionTargetMatchesCandidate: true,
    postExecutionTargetDiffersFromPreviousTarget: true,
    rollbackBackupPreserved: true,
    resultIsEvidenceOnly: true,
    executionAllowed: false,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
  };
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeCreateOnlyBundle([{ path: resultPath, data: payload, encoding: "utf8" }]);
  return Object.freeze({ ok: true, resultPath, resultSha256: sha256(Buffer.from(payload, "utf8")), resultState: "executed-verified", route: receipt.route, candidateId: receipt.candidateId, candidateSha256: receipt.candidateSha256, targetKind: receipt.targetKind, targetIdentifier: receipt.targetIdentifier, resultIsEvidenceOnly: true, executionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

async function verifyResult(resultReceiptPath) {
  await assertCurrentSchemaDigest();
  const resultFile = await bound(resultReceiptPath);
  const value = JSON.parse(resultFile.bytes.toString("utf8"));
  if (value.contract !== CONTRACT || value.schemaSha256 !== SCHEMA_SHA256 || value.resultState !== "executed-verified") throw new Error("Execution-result receipt contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(value, "Execution-result receipt");
  if (value.claimReverifiedBeforeAttestation !== true || value.candidateBytesReverified !== true || value.postExecutionTargetMatchesCandidate !== true || value.postExecutionTargetDiffersFromPreviousTarget !== true || value.rollbackBackupPreserved !== true || value.resultIsEvidenceOnly !== true) throw new Error("Execution-result receipt lacks required evidence invariants.");
  const expectedResultPath = await allowed(deterministicResultPath(value.claimReceiptPath), false);
  if (resultFile.path !== expectedResultPath) throw new Error("Execution-result receipt is not at the deterministic create-only result path for its claim.");

  const review = await reverifyClaimChain(value.claimReceiptPath);
  if (review.claimFile.sha256 !== value.claimReceiptSha256 || review.claimFile.byteLength !== value.claimReceiptByteLength || review.authorizationFile.path !== value.authorizationReceiptPath || review.authorizationFile.sha256 !== value.authorizationReceiptSha256 || review.authorizationFile.byteLength !== value.authorizationReceiptByteLength || review.planFile.path !== value.transactionPlanReceiptPath || review.planFile.sha256 !== value.transactionPlanReceiptSha256 || review.planFile.byteLength !== value.transactionPlanReceiptByteLength) throw new Error("Execution-result receipt is bound to stale claim/authorization/transaction-plan lineage.");
  for (const field of ["route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier"]) {
    const current = field === "candidateSha256" ? review.candidateChain.candidate.sha256 : field === "candidateByteLength" ? review.candidateChain.candidate.byteLength : review.plan[field];
    if (value[field] !== current) throw new Error(`Execution-result identity drifted for ${field}.`);
  }
  if (value.previousTargetSnapshotSha256 !== review.snapshot.sha256 || value.previousTargetSnapshotByteLength !== review.snapshot.byteLength || value.rollbackBackupSha256 !== review.backup.sha256 || value.rollbackBackupByteLength !== review.backup.byteLength) throw new Error("Execution-result previous-target/rollback evidence drifted.");
  const postTarget = await bound(value.postExecutionTargetPath);
  if (postTarget.sha256 !== value.postExecutionTargetSha256 || postTarget.byteLength !== value.postExecutionTargetByteLength || postTarget.sha256 !== review.candidateChain.candidate.sha256 || postTarget.byteLength !== review.candidateChain.candidate.byteLength) throw new Error("Post-execution target bytes changed or no longer match the reviewed candidate.");
  if (postTarget.path === review.snapshot.path || postTarget.path === review.backup.path || (postTarget.sha256 === review.snapshot.sha256 && postTarget.byteLength === review.snapshot.byteLength)) throw new Error("Post-execution target no longer proves a distinct executed target.");

  return Object.freeze({ ok: true, resultPath: resultFile.path, resultSha256: resultFile.sha256, resultByteLength: resultFile.byteLength, claimReverified: true, authorizationReverified: true, transactionPlanReverified: true, candidateBytesReverified: true, postExecutionTargetReverified: true, rollbackBackupPreserved: true, resultIsEvidenceOnly: true, resultState: "executed-verified", executionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

const tools = [
  { name: "evavo_work_header_publication_execution_result_capabilities", description: "Describe post-execution evidence attestation. This tool can verify an external/manual execution after the single-use claim but cannot perform or authorize website/Cloudinary mutation.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_attest_work_header_publication_execution_result", description: "Create a deterministic create-only result receipt after an external execution has already occurred, only when the single-use claim and complete reviewed lineage reverify and the post-execution target exactly matches the reviewed candidate while the rollback backup remains preserved.", inputSchema: { type: "object", properties: { claimReceiptPath: { type: "string", minLength: 1 }, postExecutionTargetPath: { type: "string", minLength: 1 }, confirmObservedExternalExecution: { type: "boolean" }, confirmLocalWrite: { type: "boolean" } }, required: ["claimReceiptPath", "postExecutionTargetPath", "confirmObservedExternalExecution", "confirmLocalWrite"], additionalProperties: false } },
  { name: "evavo_verify_work_header_publication_execution_result", description: "Read-only reverification of an execution-result receipt against the exact claim, authorization, transaction plan, reviewed candidate, post-execution target and preserved rollback backup. Any evidence drift invalidates the result.", inputSchema: { type: "object", properties: { resultReceiptPath: { type: "string", minLength: 1 } }, required: ["resultReceiptPath"], additionalProperties: false } },
];

function capabilities() {
  return Object.freeze({ contract: CONTRACT, serverVersion: SERVER_VERSION, schemaSha256: SCHEMA_SHA256, observedExternalExecutionOnly: true, deterministicCreateOnlyResultPath: true, claimReverificationRequired: true, authorizationReverificationRequired: true, transactionPlanReverificationRequired: true, candidateBytesReverificationRequired: true, postExecutionTargetMustExactlyMatchCandidate: true, postExecutionTargetMustDifferFromPreviousTarget: true, rollbackBackupMustRemainPreserved: true, secondResultForSameClaimRejected: true, resultIsEvidenceOnly: true, executionPerformedByThisTool: false, executionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false, allowedRootCount: configuredLocalRootCount(ROOTS_ENV), writesEnabled: writesEnabled() });
}

async function callTool(name, args) {
  if (name === "evavo_work_header_publication_execution_result_capabilities") return capabilities();
  if (name === "evavo_attest_work_header_publication_execution_result") return attest(args ?? {});
  if (name === "evavo_verify_work_header_publication_execution_result") return verifyResult(args?.resultReceiptPath);
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
    process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: String(error) }, true)))}\n`);
  }
}
