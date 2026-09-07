#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-header-publication-rollback-authorization";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const CONTRACT = "evavo.work-header-publication-rollback-authorization.v1";
const SCHEMA_SHA256 = "926c76be30d9d84f880613e703f542f7bf1c7c16d003db395565b46ad084ccb4";
const SCHEMA_URL = new URL("../contracts/work-header-publication-rollback-authorization-v1.schema.json", import.meta.url);
const READINESS_CONTRACT = "evavo.work-header-publication-rollback-readiness.v1";
const READINESS_SCHEMA_SHA256 = "cc56d28b46f98cea1f97b46aa9988522c6b97424ee853a7c6c968a45ffd77f6d";
const EXECUTION_RESULT_CONTRACT = "evavo.work-header-publication-execution-result.v1";
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
  for (const field of ["publicationAllowed", "cloudOverwriteAllowed", "websiteMutationAllowed"]) {
    if (value?.[field] !== false) throw new Error(`${label} carries forbidden mutation authority (${field}).`);
  }
}

function deterministicAuthorizationPath(readinessPath) {
  return `${readinessPath}.rollback-authorization.json`;
}

async function reverifyReadiness(readinessReceiptPath) {
  const readinessFile = await bound(readinessReceiptPath);
  const readiness = JSON.parse(readinessFile.bytes.toString("utf8"));
  if (readiness.contract !== READINESS_CONTRACT || readiness.schemaSha256 !== READINESS_SCHEMA_SHA256 || readiness.rollbackState !== "rollback-ready-unexecuted") throw new Error("Rollback-readiness receipt contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(readiness, "Rollback-readiness receipt");
  if (readiness.executionResultReverified !== true || readiness.currentPublishedTargetReverified !== true || readiness.rollbackBackupReverified !== true || readiness.currentPublishedTargetMatchesCandidate !== true || readiness.rollbackBackupMatchesPreviousTarget !== true || readiness.rollbackPreparationOnly !== true) {
    throw new Error("Rollback-readiness receipt lacks required safety invariants.");
  }

  const resultFile = await bound(readiness.executionResultReceiptPath);
  if (resultFile.sha256 !== readiness.executionResultReceiptSha256 || resultFile.byteLength !== readiness.executionResultReceiptByteLength) throw new Error("Rollback-readiness receipt is bound to changed execution-result bytes.");
  const result = JSON.parse(resultFile.bytes.toString("utf8"));
  if (result.contract !== EXECUTION_RESULT_CONTRACT || result.resultState !== "executed-verified") throw new Error("Execution-result receipt contract/state is invalid or stale.");
  assertNoMutationAuthority(result, "Execution-result receipt");
  if (result.resultIsEvidenceOnly !== true || result.postExecutionTargetMatchesCandidate !== true || result.rollbackBackupPreserved !== true) throw new Error("Execution-result receipt lacks required post-publication evidence invariants.");

  for (const field of ["route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier"]) {
    if (readiness[field] !== result[field]) throw new Error(`Rollback-readiness identity drifted from execution result for ${field}.`);
  }

  const publishedTarget = await bound(readiness.publishedTargetPath);
  if (publishedTarget.sha256 !== readiness.publishedTargetSha256 || publishedTarget.byteLength !== readiness.publishedTargetByteLength || publishedTarget.sha256 !== readiness.candidateSha256 || publishedTarget.byteLength !== readiness.candidateByteLength) {
    throw new Error("Current published target no longer exactly matches the reviewed candidate bytes.");
  }

  const backup = await bound(readiness.rollbackBackupPath);
  if (backup.sha256 !== readiness.rollbackBackupSha256 || backup.byteLength !== readiness.rollbackBackupByteLength || backup.sha256 !== readiness.previousTargetSnapshotSha256 || backup.byteLength !== readiness.previousTargetSnapshotByteLength) {
    throw new Error("Rollback backup no longer exactly matches the previous-target snapshot bytes.");
  }
  if (backup.path === publishedTarget.path) throw new Error("Rollback backup must remain physically separate from the current published target.");

  return Object.freeze({ readinessFile, readiness, resultFile, result, publishedTarget, backup });
}

async function authorize(args) {
  await assertCurrentSchemaDigest();
  if (args.confirmRollbackAuthorization !== true) throw new Error("confirmRollbackAuthorization=true is required.");
  if (args.confirmationStatement !== CONFIRMATION_STATEMENT) throw new Error("Exact rollback confirmation statement is required.");
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required to write rollback-authorization evidence.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);
  if (typeof args.rollbackReadinessReceiptPath !== "string") throw new Error("rollbackReadinessReceiptPath is required.");

  const review = await reverifyReadiness(args.rollbackReadinessReceiptPath);
  const receiptPath = await allowed(deterministicAuthorizationPath(review.readinessFile.path), true);
  const receipt = {
    contract: CONTRACT,
    schemaSha256: SCHEMA_SHA256,
    authorizationState: "rollback-authorized-unexecuted",
    rollbackReadinessReceiptPath: review.readinessFile.path,
    rollbackReadinessReceiptSha256: review.readinessFile.sha256,
    rollbackReadinessReceiptByteLength: review.readinessFile.byteLength,
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
  return Object.freeze({ ok: true, receiptPath, receiptSha256: sha256(Buffer.from(payload, "utf8")), authorizationState: receipt.authorizationState, route: receipt.route, candidateId: receipt.candidateId, targetKind: receipt.targetKind, targetIdentifier: receipt.targetIdentifier, rollbackAuthorizedForOneTransactionOnly: true, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

async function verify(receiptPath) {
  await assertCurrentSchemaDigest();
  const receiptFile = await bound(receiptPath);
  const value = JSON.parse(receiptFile.bytes.toString("utf8"));
  if (value.contract !== CONTRACT || value.schemaSha256 !== SCHEMA_SHA256 || value.authorizationState !== "rollback-authorized-unexecuted") throw new Error("Rollback-authorization receipt contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(value, "Rollback-authorization receipt");
  if (value.confirmationStatement !== CONFIRMATION_STATEMENT || value.explicitRollbackConfirmation !== true || value.rollbackReadinessReverified !== true || value.currentPublishedTargetStillMatchesCandidate !== true || value.rollbackBackupStillMatchesPreviousTarget !== true || value.rollbackAuthorizedForOneTransactionOnly !== true || value.authorizationExpiresOnAnyEvidenceDrift !== true) {
    throw new Error("Rollback-authorization receipt lacks required explicit confirmation or safety invariants.");
  }
  const expectedPath = await allowed(deterministicAuthorizationPath(value.rollbackReadinessReceiptPath), false);
  if (receiptFile.path !== expectedPath) throw new Error("Rollback-authorization receipt is not at the deterministic create-only path for its readiness receipt.");

  const review = await reverifyReadiness(value.rollbackReadinessReceiptPath);
  if (review.readinessFile.sha256 !== value.rollbackReadinessReceiptSha256 || review.readinessFile.byteLength !== value.rollbackReadinessReceiptByteLength) throw new Error("Rollback authorization is bound to changed rollback-readiness evidence.");
  for (const field of ["route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier"]) if (value[field] !== review.readiness[field]) throw new Error(`Rollback-authorization identity drifted for ${field}.`);
  if (value.publishedTargetSha256 !== review.publishedTarget.sha256 || value.publishedTargetByteLength !== review.publishedTarget.byteLength) throw new Error("Rollback-authorization published-target binding drifted.");
  if (value.rollbackBackupSha256 !== review.backup.sha256 || value.rollbackBackupByteLength !== review.backup.byteLength || value.previousTargetSnapshotSha256 !== review.readiness.previousTargetSnapshotSha256 || value.previousTargetSnapshotByteLength !== review.readiness.previousTargetSnapshotByteLength) throw new Error("Rollback-authorization backup/previous-target binding drifted.");

  return Object.freeze({ ok: true, receiptPath: receiptFile.path, receiptSha256: receiptFile.sha256, receiptByteLength: receiptFile.byteLength, authorizationState: value.authorizationState, rollbackReadinessReverified: true, currentPublishedTargetStillMatchesCandidate: true, rollbackBackupStillMatchesPreviousTarget: true, rollbackAuthorizedForOneTransactionOnly: true, authorizationExpiresOnAnyEvidenceDrift: true, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

const tools = [
  { name: "evavo_work_header_publication_rollback_authorization_capabilities", description: "Describe explicit, single-transaction rollback authorization. This tool can authorize evidence for one exact rollback but cannot execute rollback or mutate website/Cloudinary state.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_authorize_work_header_publication_rollback", description: "After exact explicit caller confirmation, reverify rollback readiness, current published candidate bytes and the previous-target backup, then create one deterministic rollback-authorized-unexecuted receipt. No rollback is executed.", inputSchema: { type: "object", properties: { rollbackReadinessReceiptPath: { type: "string", minLength: 1 }, confirmRollbackAuthorization: { type: "boolean" }, confirmationStatement: { type: "string", const: CONFIRMATION_STATEMENT }, confirmLocalWrite: { type: "boolean" } }, required: ["rollbackReadinessReceiptPath", "confirmRollbackAuthorization", "confirmationStatement", "confirmLocalWrite"], additionalProperties: false } },
  { name: "evavo_verify_work_header_publication_rollback_authorization", description: "Reverify an existing rollback authorization against the exact rollback-readiness receipt, current published candidate bytes and previous-target backup. Any evidence drift invalidates authorization.", inputSchema: { type: "object", properties: { receiptPath: { type: "string", minLength: 1 } }, required: ["receiptPath"], additionalProperties: false } },
];
function capabilities() { return Object.freeze({ contract: CONTRACT, serverVersion: SERVER_VERSION, schemaSha256: SCHEMA_SHA256, explicitRollbackConfirmationRequired: true, exactConfirmationStatementRequired: true, rollbackReadinessReverificationRequired: true, currentPublishedTargetRecheckRequired: true, rollbackBackupReverificationRequired: true, singleRollbackTransactionAuthorizationOnly: true, authorizationExpiresOnAnyEvidenceDrift: true, deterministicCreateOnlyAuthorizationReceipt: true, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false, allowedRootCount: configuredLocalRootCount(ROOTS_ENV), writesEnabled: writesEnabled() }); }
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
