#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";
import { recheckPublicationTarget } from "./lib/publication_target_recheck.mjs";

const SERVER_NAME = "evavo-work-header-publication-rollback-authorization";
const SERVER_VERSION = "1.3.0";
const PROTOCOL_VERSION = "2025-03-26";
const CONTRACT = "evavo.work-header-publication-rollback-authorization.v1";
const SCHEMA_SHA256 = "751c202db89dc1438a822eccf45365071d96be0eabe6680d372103d0f7b6c6e9";
const SCHEMA_URL = new URL("../contracts/work-header-publication-rollback-authorization-v1.schema.json", import.meta.url);
const READINESS_CONTRACT = "evavo.work-header-publication-rollback-readiness.v1";
const READINESS_SCHEMA_SHA256 = "cc56d28b46f98cea1f97b46aa9988522c6b97424ee853a7c6c968a45ffd77f6d";
const EXECUTION_RESULT_CONTRACT = "evavo.work-header-publication-execution-result.v1";
const POSTFLIGHT_CONTRACT = "evavo.work-header-publication-postflight.v1";
const POSTFLIGHT_SCHEMA_SHA256 = "69b9a40178e78892c330e6f2b5bca33b3be8413ef81ef404c1dd9edad9d24ff2";
const RECOVERABILITY_CONTRACT = "evavo.work-header-publication-recoverability.v1";
const RECOVERABILITY_SCHEMA_SHA256 = "c2fceba4d6d9bfa7ed4d1ec252c74d133a30b5e7f4a33847cc8fd354c275ae15";
const TRANSACTION_STATE_CONTRACT = "evavo.work-header-publication-transaction-state.v1";
const TRANSACTION_STATE_SCHEMA_SHA256 = "0c88d1977075832287f9acf73500e7211687a594b0b0650f4dcadf367024583c";
const CONFIRMATION_STATEMENT = "I explicitly authorize rollback of this exact reviewed Work-header publication transaction.";
const ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";
const allowed = (p, output = false) => assertAllowedLocalPath(p, { envName: ROOTS_ENV, output, label: "work header publication rollback authorization" });
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function assertCurrentSchemaDigest() {
  const bytes = await readFile(SCHEMA_URL);
  const current = sha256(bytes);
  if (current !== SCHEMA_SHA256) throw new Error(`Rollback-authorization schema bytes drifted from governed SHA-256 (${current}).`);
}
async function bound(filePath) {
  const resolved = await allowed(filePath, false);
  const bytes = await readFile(resolved);
  if (!bytes.length) throw new Error(`Evidence file is empty: ${resolved}`);
  return Object.freeze({ path: resolved, bytes, sha256: sha256(bytes), byteLength: bytes.length });
}
function assertNoMutationAuthority(value, label) {
  if (value?.rollbackExecutionAllowed !== undefined && value.rollbackExecutionAllowed !== false) throw new Error(`${label} carries forbidden rollback execution authority.`);
  if (value?.executionAllowed !== undefined && value.executionAllowed !== false) throw new Error(`${label} carries forbidden execution authority.`);
  for (const field of ["publicationAllowed", "cloudOverwriteAllowed", "websiteMutationAllowed"]) if (value?.[field] !== false) throw new Error(`${label} carries forbidden mutation authority (${field}).`);
}
function deterministicAuthorizationPath(readinessPath) { return `${readinessPath}.rollback-authorization.json`; }

async function reverifyReadiness(readinessReceiptPath) {
  const readinessFile = await bound(readinessReceiptPath);
  const readiness = JSON.parse(readinessFile.bytes.toString("utf8"));
  if (readiness.contract !== READINESS_CONTRACT || readiness.schemaSha256 !== READINESS_SCHEMA_SHA256 || readiness.rollbackState !== "rollback-ready-unexecuted") throw new Error("Rollback-readiness receipt contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(readiness, "Rollback-readiness receipt");
  for (const field of ["executionResultReverified", "currentPublishedTargetReverified", "rollbackBackupReverified", "currentPublishedTargetMatchesCandidate", "rollbackBackupMatchesPreviousTarget", "rollbackPreparationOnly"]) if (readiness[field] !== true) throw new Error(`Rollback-readiness receipt lacks required invariant ${field}.`);

  const resultFile = await bound(readiness.executionResultReceiptPath);
  if (resultFile.sha256 !== readiness.executionResultReceiptSha256 || resultFile.byteLength !== readiness.executionResultReceiptByteLength) throw new Error("Rollback-readiness receipt is bound to changed execution-result bytes.");
  const result = JSON.parse(resultFile.bytes.toString("utf8"));
  if (result.contract !== EXECUTION_RESULT_CONTRACT || result.resultState !== "executed-verified") throw new Error("Execution-result receipt contract/state is invalid or stale.");
  assertNoMutationAuthority(result, "Execution-result receipt");
  if (result.resultIsEvidenceOnly !== true || result.postExecutionTargetMatchesCandidate !== true || result.rollbackBackupPreserved !== true) throw new Error("Execution-result receipt lacks required post-publication evidence invariants.");
  for (const field of ["route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier"]) if (readiness[field] !== result[field]) throw new Error(`Rollback-readiness identity drifted from execution result for ${field}.`);

  const publishedTarget = await bound(readiness.publishedTargetPath);
  if (publishedTarget.sha256 !== readiness.publishedTargetSha256 || publishedTarget.byteLength !== readiness.publishedTargetByteLength || publishedTarget.sha256 !== readiness.candidateSha256 || publishedTarget.byteLength !== readiness.candidateByteLength) throw new Error("Current published target no longer exactly matches the reviewed candidate bytes.");
  const backup = await bound(readiness.rollbackBackupPath);
  if (backup.sha256 !== readiness.rollbackBackupSha256 || backup.byteLength !== readiness.rollbackBackupByteLength || backup.sha256 !== readiness.previousTargetSnapshotSha256 || backup.byteLength !== readiness.previousTargetSnapshotByteLength) throw new Error("Rollback backup no longer exactly matches the previous-target snapshot bytes.");
  if (backup.path === publishedTarget.path) throw new Error("Rollback backup must remain physically separate from the current published target.");
  return Object.freeze({ readinessFile, readiness, resultFile, result, publishedTarget, backup });
}

async function reverifyPostflight(postflightReceiptPath, readinessReview) {
  const postflightFile = await bound(postflightReceiptPath);
  const postflight = JSON.parse(postflightFile.bytes.toString("utf8"));
  if (postflight.contract !== POSTFLIGHT_CONTRACT || postflight.schemaSha256 !== POSTFLIGHT_SCHEMA_SHA256 || postflight.postflightState !== "published-verified-rollback-ready") throw new Error("Publication-postflight receipt contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(postflight, "Publication-postflight receipt");
  for (const field of ["executionResultReverified", "rollbackReadinessReverified", "targetAwareLiveRecheckVerified", "liveTargetMatchesReviewedCandidate", "cloudinaryLiveRemoteRecheckRequiredWhenApplicable", "rollbackBackupStillReady", "postflightEvidenceOnly"]) if (postflight[field] !== true) throw new Error(`Publication-postflight receipt lacks required invariant ${field}.`);
  if (postflight.rollbackReadinessReceiptPath !== readinessReview.readinessFile.path || postflight.rollbackReadinessReceiptSha256 !== readinessReview.readinessFile.sha256 || postflight.rollbackReadinessReceiptByteLength !== readinessReview.readinessFile.byteLength) throw new Error("Publication-postflight receipt is bound to different rollback-readiness evidence.");
  if (postflight.executionResultReceiptPath !== readinessReview.resultFile.path || postflight.executionResultReceiptSha256 !== readinessReview.resultFile.sha256 || postflight.executionResultReceiptByteLength !== readinessReview.resultFile.byteLength) throw new Error("Publication-postflight receipt is bound to different execution-result evidence.");
  for (const field of ["route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier"]) if (postflight[field] !== readinessReview.readiness[field]) throw new Error(`Publication-postflight identity drifted for ${field}.`);

  const recheckArgs = postflight.liveTargetRecheckMode === "live-remote-cloudinary"
    ? { currentTargetRecheckUrl: postflight.liveTargetReference }
    : postflight.liveTargetRecheckMode === "governed-local-website-source"
      ? { currentTargetRecheckPath: postflight.liveTargetReference }
      : null;
  if (!recheckArgs) throw new Error("Publication-postflight target-aware live recheck mode is invalid.");
  const live = await recheckPublicationTarget({
    targetKind: readinessReview.readiness.targetKind,
    targetIdentifier: readinessReview.readiness.targetIdentifier,
    ...recheckArgs,
    readLocal: bound,
  });
  if (live.sha256 !== postflight.liveTargetSha256 || live.byteLength !== postflight.liveTargetByteLength || live.sha256 !== readinessReview.publishedTarget.sha256 || live.byteLength !== readinessReview.publishedTarget.byteLength) throw new Error("Publication-postflight live-target binding no longer matches current published candidate bytes.");
  if (live.mode !== postflight.liveTargetRecheckMode) throw new Error("Publication-postflight live-target recheck mode drifted.");
  const liveReference = live.mode === "live-remote-cloudinary" ? live.url : live.path;
  if (liveReference !== postflight.liveTargetReference) throw new Error("Publication-postflight live-target reference drifted.");
  const finalUrl = live.mode === "live-remote-cloudinary" ? live.finalUrl : null;
  if (finalUrl !== postflight.liveTargetFinalUrl) throw new Error("Publication-postflight live-target final URL drifted.");
  if (postflight.rollbackBackupPath !== readinessReview.backup.path || postflight.rollbackBackupSha256 !== readinessReview.backup.sha256 || postflight.rollbackBackupByteLength !== readinessReview.backup.byteLength) throw new Error("Publication-postflight rollback-backup binding drifted.");
  return Object.freeze({ postflightFile, postflight, live, liveReference });
}

async function reverifyRecoverability(recoverabilityReceiptPath, readinessReview, postflightReview) {
  const recoverabilityFile = await bound(recoverabilityReceiptPath);
  const recoverability = JSON.parse(recoverabilityFile.bytes.toString("utf8"));
  if (recoverability.contract !== RECOVERABILITY_CONTRACT || recoverability.schemaSha256 !== RECOVERABILITY_SCHEMA_SHA256 || recoverability.recoverabilityState !== "published-rollback-recovery-ready") throw new Error("Publication recoverability receipt contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(recoverability, "Publication recoverability receipt");
  for (const field of ["transactionStateReverified", "sourcePostflightBindingReverified", "liveTargetReverified", "liveTargetMatchesCandidate", "rollbackBackupReverified", "rollbackBackupDiffersFromCandidate", "targetAwareLiveRecheckRequired", "recoverabilityEvidenceOnly"]) if (recoverability[field] !== true) throw new Error(`Publication recoverability receipt lacks required invariant ${field}.`);

  const transactionFile = await bound(recoverability.transactionStateReceiptPath);
  if (transactionFile.sha256 !== recoverability.transactionStateReceiptSha256 || transactionFile.byteLength !== recoverability.transactionStateReceiptByteLength) throw new Error("Publication recoverability receipt is bound to changed transaction-state evidence.");
  const transaction = JSON.parse(transactionFile.bytes.toString("utf8"));
  if (transaction.contract !== TRANSACTION_STATE_CONTRACT || transaction.schemaSha256 !== TRANSACTION_STATE_SCHEMA_SHA256 || transaction.transactionState !== "published-verified-rollback-ready" || transaction.terminal !== false || transaction.rollbackReadyWhenPublished !== true || transaction.candidateLiveWhenPublished !== true) throw new Error("Recoverability transaction-state evidence is invalid or stale.");
  assertNoMutationAuthority(transaction, "Recoverability transaction-state receipt");
  for (const field of ["sourcePostflightReverified", "liveTargetReverified", "rollbackBackupReverified", "transactionStateEvidenceOnly"]) if (transaction[field] !== true) throw new Error(`Recoverability transaction state lacks required invariant ${field}.`);

  if (recoverability.sourcePostflightReceiptPath !== postflightReview.postflightFile.path || recoverability.sourcePostflightReceiptSha256 !== postflightReview.postflightFile.sha256 || recoverability.sourcePostflightReceiptByteLength !== postflightReview.postflightFile.byteLength) throw new Error("Recoverability receipt is not bound to the exact publication postflight being authorized.");
  if (transaction.sourcePostflightReceiptPath !== postflightReview.postflightFile.path || transaction.sourcePostflightReceiptSha256 !== postflightReview.postflightFile.sha256 || transaction.sourcePostflightReceiptByteLength !== postflightReview.postflightFile.byteLength) throw new Error("Recoverability transaction state is not bound to the exact publication postflight being authorized.");

  for (const field of ["route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier"]) {
    if (recoverability[field] !== readinessReview.readiness[field] || transaction[field] !== readinessReview.readiness[field]) throw new Error(`Recoverability lineage identity drifted for ${field}.`);
  }
  if (recoverability.liveTargetReference !== postflightReview.liveReference || recoverability.liveTargetSha256 !== postflightReview.live.sha256 || recoverability.liveTargetByteLength !== postflightReview.live.byteLength) throw new Error("Recoverability live-target binding drifted from the fresh publication-postflight recheck.");
  if (transaction.liveTargetPath !== postflightReview.liveReference || transaction.liveTargetSha256 !== postflightReview.live.sha256 || transaction.liveTargetByteLength !== postflightReview.live.byteLength) throw new Error("Recoverability transaction-state live target drifted from the fresh publication-postflight recheck.");
  if (recoverability.rollbackBackupPath !== readinessReview.backup.path || recoverability.rollbackBackupSha256 !== readinessReview.backup.sha256 || recoverability.rollbackBackupByteLength !== readinessReview.backup.byteLength) throw new Error("Recoverability rollback-backup binding drifted from rollback readiness.");
  if (transaction.rollbackBackupPath !== readinessReview.backup.path || transaction.rollbackBackupSha256 !== readinessReview.backup.sha256 || transaction.rollbackBackupByteLength !== readinessReview.backup.byteLength) throw new Error("Recoverability transaction-state backup drifted from rollback readiness.");
  if (recoverability.rollbackBackupSha256 === recoverability.candidateSha256 && recoverability.rollbackBackupByteLength === recoverability.candidateByteLength) throw new Error("Recoverability backup is not distinct from the candidate; rollback cannot be authorized.");
  return Object.freeze({ recoverabilityFile, recoverability, transactionFile, transaction });
}

async function authorize(args) {
  await assertCurrentSchemaDigest();
  if (args.confirmRollbackAuthorization !== true) throw new Error("confirmRollbackAuthorization=true is required.");
  if (args.confirmationStatement !== CONFIRMATION_STATEMENT) throw new Error("Exact rollback confirmation statement is required.");
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required to write rollback-authorization evidence.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);
  if (typeof args.rollbackReadinessReceiptPath !== "string" || typeof args.publicationPostflightReceiptPath !== "string" || typeof args.recoverabilityReceiptPath !== "string") throw new Error("rollbackReadinessReceiptPath, publicationPostflightReceiptPath and recoverabilityReceiptPath are required.");

  const review = await reverifyReadiness(args.rollbackReadinessReceiptPath);
  const postflight = await reverifyPostflight(args.publicationPostflightReceiptPath, review);
  const recoverability = await reverifyRecoverability(args.recoverabilityReceiptPath, review, postflight);
  const receiptPath = await allowed(deterministicAuthorizationPath(review.readinessFile.path), true);
  const receipt = {
    contract: CONTRACT,
    schemaSha256: SCHEMA_SHA256,
    authorizationState: "rollback-authorized-unexecuted",
    rollbackReadinessReceiptPath: review.readinessFile.path,
    rollbackReadinessReceiptSha256: review.readinessFile.sha256,
    rollbackReadinessReceiptByteLength: review.readinessFile.byteLength,
    publicationPostflightReceiptPath: postflight.postflightFile.path,
    publicationPostflightReceiptSha256: postflight.postflightFile.sha256,
    publicationPostflightReceiptByteLength: postflight.postflightFile.byteLength,
    recoverabilityReceiptPath: recoverability.recoverabilityFile.path,
    recoverabilityReceiptSha256: recoverability.recoverabilityFile.sha256,
    recoverabilityReceiptByteLength: recoverability.recoverabilityFile.byteLength,
    route: review.readiness.route,
    candidateId: review.readiness.candidateId,
    candidateSha256: review.readiness.candidateSha256,
    candidateByteLength: review.readiness.candidateByteLength,
    targetKind: review.readiness.targetKind,
    targetIdentifier: review.readiness.targetIdentifier,
    publishedTargetSha256: review.publishedTarget.sha256,
    publishedTargetByteLength: review.publishedTarget.byteLength,
    rollbackBackupSha256: review.backup.sha256,
    rollbackBackupByteLength: review.backup.byteLength,
    previousTargetSnapshotSha256: review.readiness.previousTargetSnapshotSha256,
    previousTargetSnapshotByteLength: review.readiness.previousTargetSnapshotByteLength,
    confirmationStatement: CONFIRMATION_STATEMENT,
    explicitRollbackConfirmation: true,
    rollbackReadinessReverified: true,
    publicationPostflightReverified: true,
    recoverabilityReverified: true,
    recoverabilityLiveTargetMatchedCandidateAtVerification: true,
    recoverabilityRollbackBackupStillReady: true,
    postflightLiveTargetMatchedCandidateAtVerification: true,
    postflightRollbackBackupStillReady: true,
    currentPublishedTargetStillMatchesCandidate: true,
    rollbackBackupStillMatchesPreviousTarget: true,
    rollbackAuthorizedForOneTransactionOnly: true,
    authorizationExpiresOnAnyEvidenceDrift: true,
    rollbackExecutionAllowed: false,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
  };
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeCreateOnlyBundle([{ path: receiptPath, data: payload, encoding: "utf8" }]);
  return Object.freeze({ ok: true, receiptPath, receiptSha256: sha256(Buffer.from(payload, "utf8")), authorizationState: receipt.authorizationState, route: receipt.route, candidateId: receipt.candidateId, publicationPostflightReverified: true, recoverabilityReverified: true, rollbackAuthorizedForOneTransactionOnly: true, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

async function verify(receiptPath) {
  await assertCurrentSchemaDigest();
  const receiptFile = await bound(receiptPath);
  const value = JSON.parse(receiptFile.bytes.toString("utf8"));
  if (value.contract !== CONTRACT || value.schemaSha256 !== SCHEMA_SHA256 || value.authorizationState !== "rollback-authorized-unexecuted") throw new Error("Rollback-authorization receipt contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(value, "Rollback-authorization receipt");
  for (const field of ["explicitRollbackConfirmation", "rollbackReadinessReverified", "publicationPostflightReverified", "recoverabilityReverified", "recoverabilityLiveTargetMatchedCandidateAtVerification", "recoverabilityRollbackBackupStillReady", "postflightLiveTargetMatchedCandidateAtVerification", "postflightRollbackBackupStillReady", "currentPublishedTargetStillMatchesCandidate", "rollbackBackupStillMatchesPreviousTarget", "rollbackAuthorizedForOneTransactionOnly", "authorizationExpiresOnAnyEvidenceDrift"]) if (value[field] !== true) throw new Error(`Rollback-authorization receipt lacks required invariant ${field}.`);
  if (value.confirmationStatement !== CONFIRMATION_STATEMENT) throw new Error("Rollback-authorization confirmation statement drifted.");
  const expectedPath = await allowed(deterministicAuthorizationPath(value.rollbackReadinessReceiptPath), false);
  if (receiptFile.path !== expectedPath) throw new Error("Rollback-authorization receipt is not at the deterministic create-only path for its readiness receipt.");

  const review = await reverifyReadiness(value.rollbackReadinessReceiptPath);
  if (review.readinessFile.sha256 !== value.rollbackReadinessReceiptSha256 || review.readinessFile.byteLength !== value.rollbackReadinessReceiptByteLength) throw new Error("Rollback authorization is bound to changed rollback-readiness evidence.");
  const postflight = await reverifyPostflight(value.publicationPostflightReceiptPath, review);
  if (postflight.postflightFile.sha256 !== value.publicationPostflightReceiptSha256 || postflight.postflightFile.byteLength !== value.publicationPostflightReceiptByteLength) throw new Error("Rollback authorization is bound to changed publication-postflight evidence.");
  const recoverability = await reverifyRecoverability(value.recoverabilityReceiptPath, review, postflight);
  if (recoverability.recoverabilityFile.sha256 !== value.recoverabilityReceiptSha256 || recoverability.recoverabilityFile.byteLength !== value.recoverabilityReceiptByteLength) throw new Error("Rollback authorization is bound to changed publication-recoverability evidence.");
  for (const field of ["route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier"]) if (value[field] !== review.readiness[field]) throw new Error(`Rollback-authorization identity drifted for ${field}.`);
  if (value.publishedTargetSha256 !== review.publishedTarget.sha256 || value.publishedTargetByteLength !== review.publishedTarget.byteLength) throw new Error("Rollback-authorization published-target binding drifted.");
  if (value.rollbackBackupSha256 !== review.backup.sha256 || value.rollbackBackupByteLength !== review.backup.byteLength || value.previousTargetSnapshotSha256 !== review.readiness.previousTargetSnapshotSha256 || value.previousTargetSnapshotByteLength !== review.readiness.previousTargetSnapshotByteLength) throw new Error("Rollback-authorization backup/previous-target binding drifted.");
  return Object.freeze({ ok: true, receiptPath: receiptFile.path, receiptSha256: receiptFile.sha256, receiptByteLength: receiptFile.byteLength, authorizationState: value.authorizationState, rollbackReadinessReverified: true, publicationPostflightReverified: true, recoverabilityReverified: true, currentPublishedTargetStillMatchesCandidate: true, rollbackBackupStillMatchesPreviousTarget: true, rollbackAuthorizedForOneTransactionOnly: true, authorizationExpiresOnAnyEvidenceDrift: true, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

const tools = [
  { name: "evavo_work_header_publication_rollback_authorization_capabilities", description: "Describe explicit, single-transaction rollback authorization gated by rollback readiness, target-aware publication postflight and a freshly verified publication-recoverability receipt. This tool cannot execute rollback or mutate website/Cloudinary state.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_authorize_work_header_publication_rollback", description: "After exact explicit caller confirmation, reverify rollback readiness, target-aware publication postflight and the published recoverability proof against the live candidate and distinct backup, then create one deterministic rollback-authorized-unexecuted receipt. No rollback is executed.", inputSchema: { type: "object", properties: { rollbackReadinessReceiptPath: { type: "string", minLength: 1 }, publicationPostflightReceiptPath: { type: "string", minLength: 1 }, recoverabilityReceiptPath: { type: "string", minLength: 1 }, confirmRollbackAuthorization: { type: "boolean" }, confirmationStatement: { type: "string", const: CONFIRMATION_STATEMENT }, confirmLocalWrite: { type: "boolean" } }, required: ["rollbackReadinessReceiptPath", "publicationPostflightReceiptPath", "recoverabilityReceiptPath", "confirmRollbackAuthorization", "confirmationStatement", "confirmLocalWrite"], additionalProperties: false } },
  { name: "evavo_verify_work_header_publication_rollback_authorization", description: "Reverify rollback authorization against exact readiness, target-aware publication postflight, publication recoverability evidence, current published candidate and previous-target backup. Any drift invalidates authorization.", inputSchema: { type: "object", properties: { receiptPath: { type: "string", minLength: 1 } }, required: ["receiptPath"], additionalProperties: false } },
];
function capabilities() { return Object.freeze({ contract: CONTRACT, serverVersion: SERVER_VERSION, schemaSha256: SCHEMA_SHA256, explicitRollbackConfirmationRequired: true, exactConfirmationStatementRequired: true, rollbackReadinessReverificationRequired: true, publicationPostflightReverificationRequired: true, publicationRecoverabilityReverificationRequired: true, recoverabilityTransactionStateBindingRequired: true, recoverabilitySourcePostflightBindingRequired: true, recoverabilityLiveTargetMustMatchCandidate: true, recoverabilityRollbackBackupMustRemainDistinctAndReady: true, targetAwarePublicationPostflightRequired: true, cloudinaryPostflightLiveRemoteRecheckRequired: true, postflightLiveTargetMustMatchCandidate: true, postflightRollbackBackupMustRemainReady: true, currentPublishedTargetRecheckRequired: true, rollbackBackupReverificationRequired: true, singleRollbackTransactionAuthorizationOnly: true, authorizationExpiresOnAnyEvidenceDrift: true, deterministicCreateOnlyAuthorizationReceipt: true, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false, allowedRootCount: configuredLocalRootCount(ROOTS_ENV), writesEnabled: writesEnabled() }); }
async function callTool(name, args) {
  if (name === "evavo_work_header_publication_rollback_authorization_capabilities") return capabilities();
  if (name === "evavo_authorize_work_header_publication_rollback") return authorize(args ?? {});
  if (name === "evavo_verify_work_header_publication_rollback_authorization") return verify(args?.receiptPath);
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
