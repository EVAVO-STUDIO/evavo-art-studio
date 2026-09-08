#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";
import { recheckPublicationTarget } from "./lib/publication_target_recheck.mjs";

const SERVER_NAME = "evavo-work-header-publication-recoverability";
const SERVER_VERSION = "1.0.1";
const PROTOCOL_VERSION = "2025-03-26";
const CONTRACT = "evavo.work-header-publication-recoverability.v1";
const SCHEMA_SHA256 = "c2fceba4d6d9bfa7ed4d1ec252c74d133a30b5e7f4a33847cc8fd354c275ae15";
const SCHEMA_URL = new URL("../contracts/work-header-publication-recoverability-v1.schema.json", import.meta.url);
const TRANSACTION_STATE_CONTRACT = "evavo.work-header-publication-transaction-state.v1";
const TRANSACTION_STATE_SCHEMA_SHA256 = "0c88d1977075832287f9acf73500e7211687a594b0b0650f4dcadf367024583c";
const PUBLICATION_POSTFLIGHT_CONTRACT = "evavo.work-header-publication-postflight.v1";
const ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";
const allowed = (p, output = false) => assertAllowedLocalPath(p, { envName: ROOTS_ENV, output, label: "work header publication recoverability" });
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function assertCurrentSchemaDigest() {
  const bytes = await readFile(SCHEMA_URL);
  const current = sha256(bytes);
  if (current !== SCHEMA_SHA256) throw new Error(`Publication recoverability schema bytes drifted from governed SHA-256 (${current}).`);
}
async function bound(filePath) {
  const resolved = await allowed(filePath, false);
  const bytes = await readFile(resolved);
  if (!bytes.length) throw new Error(`Evidence file is empty: ${resolved}`);
  return Object.freeze({ path: resolved, bytes, sha256: sha256(bytes), byteLength: bytes.length });
}
function assertNoAuthority(value, label) {
  for (const field of ["executionAllowed", "rollbackExecutionAllowed", "publicationAllowed", "cloudOverwriteAllowed", "websiteMutationAllowed"]) {
    if (value?.[field] !== undefined && value[field] !== false) throw new Error(`${label} carries forbidden execution or mutation authority (${field}).`);
  }
}
function deterministicReceiptPath(transactionStatePath) {
  return `${transactionStatePath}.recoverability.json`;
}

async function inspectTransactionState(transactionStateReceiptPath) {
  const transaction = await bound(transactionStateReceiptPath);
  const state = JSON.parse(transaction.bytes.toString("utf8"));
  if (state.contract !== TRANSACTION_STATE_CONTRACT || state.schemaSha256 !== TRANSACTION_STATE_SCHEMA_SHA256) throw new Error("Publication transaction-state receipt contract/schema is invalid or stale.");
  if (state.transactionState !== "published-verified-rollback-ready" || state.terminal !== false || state.rollbackReadyWhenPublished !== true || state.candidateLiveWhenPublished !== true) throw new Error("Recoverability proof requires a published, non-terminal, rollback-ready transaction state.");
  assertNoAuthority(state, "Publication transaction state");
  for (const field of ["sourcePostflightReverified", "liveTargetReverified", "rollbackBackupReverified", "transactionStateEvidenceOnly"]) if (state[field] !== true) throw new Error(`Publication transaction state lacks required invariant ${field}.`);

  const sourcePostflight = await bound(state.sourcePostflightReceiptPath);
  if (sourcePostflight.sha256 !== state.sourcePostflightReceiptSha256 || sourcePostflight.byteLength !== state.sourcePostflightReceiptByteLength) throw new Error("Publication transaction state is bound to changed source-postflight bytes.");
  const postflight = JSON.parse(sourcePostflight.bytes.toString("utf8"));
  if (postflight.contract !== PUBLICATION_POSTFLIGHT_CONTRACT || postflight.postflightState !== "published-verified-rollback-ready") throw new Error("Recoverability proof requires the governed publication postflight state.");
  assertNoAuthority(postflight, "Publication postflight");
  for (const field of ["route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier", "rollbackBackupPath", "rollbackBackupSha256", "rollbackBackupByteLength"]) {
    if (postflight[field] !== state[field]) throw new Error(`Transaction-state/postflight identity drifted for ${field}.`);
  }

  const recheckArgs = state.targetKind === "cloudinary-stable-id-replacement"
    ? { currentTargetRecheckUrl: state.liveTargetPath }
    : { currentTargetRecheckPath: state.liveTargetPath };
  const live = await recheckPublicationTarget({ targetKind: state.targetKind, targetIdentifier: state.targetIdentifier, ...recheckArgs, readLocal: bound });
  const liveReference = live.mode === "live-remote-cloudinary" ? live.url : live.path;
  if (liveReference !== state.liveTargetPath || live.sha256 !== state.liveTargetSha256 || live.byteLength !== state.liveTargetByteLength) throw new Error("Current live publication target drifted from the recorded transaction state.");
  if (live.sha256 !== state.candidateSha256 || live.byteLength !== state.candidateByteLength) throw new Error("Current live publication target no longer matches the exact reviewed candidate bytes.");

  const backup = await bound(state.rollbackBackupPath);
  if (backup.sha256 !== state.rollbackBackupSha256 || backup.byteLength !== state.rollbackBackupByteLength) throw new Error("Rollback backup bytes drifted after publication.");
  if (backup.sha256 === state.candidateSha256 && backup.byteLength === state.candidateByteLength) throw new Error("Rollback backup is not a distinct previous-target snapshot; recoverability cannot be proven.");

  return Object.freeze({ transaction, state, sourcePostflight, postflight, live, liveReference, backup });
}

function receiptFrom(review) {
  const state = review.state;
  return Object.freeze({
    contract: CONTRACT,
    schemaSha256: SCHEMA_SHA256,
    recoverabilityState: "published-rollback-recovery-ready",
    transactionStateReceiptPath: review.transaction.path,
    transactionStateReceiptSha256: review.transaction.sha256,
    transactionStateReceiptByteLength: review.transaction.byteLength,
    sourcePostflightReceiptPath: review.sourcePostflight.path,
    sourcePostflightReceiptSha256: review.sourcePostflight.sha256,
    sourcePostflightReceiptByteLength: review.sourcePostflight.byteLength,
    route: state.route,
    candidateId: state.candidateId,
    candidateSha256: state.candidateSha256,
    candidateByteLength: state.candidateByteLength,
    targetKind: state.targetKind,
    targetIdentifier: state.targetIdentifier,
    liveTargetReference: review.liveReference,
    liveTargetSha256: review.live.sha256,
    liveTargetByteLength: review.live.byteLength,
    rollbackBackupPath: review.backup.path,
    rollbackBackupSha256: review.backup.sha256,
    rollbackBackupByteLength: review.backup.byteLength,
    transactionStateReverified: true,
    sourcePostflightBindingReverified: true,
    liveTargetReverified: true,
    liveTargetMatchesCandidate: true,
    rollbackBackupReverified: true,
    rollbackBackupDiffersFromCandidate: true,
    targetAwareLiveRecheckRequired: true,
    recoverabilityEvidenceOnly: true,
    executionAllowed: false,
    rollbackExecutionAllowed: false,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
  });
}

async function prepare(args) {
  await assertCurrentSchemaDigest();
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required to create recoverability evidence.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);
  if (typeof args.transactionStateReceiptPath !== "string") throw new Error("transactionStateReceiptPath is required.");
  const review = await inspectTransactionState(args.transactionStateReceiptPath);
  const receipt = receiptFrom(review);
  const receiptPath = await allowed(deterministicReceiptPath(review.transaction.path), true);
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeCreateOnlyBundle([{ path: receiptPath, data: payload, encoding: "utf8" }]);
  return Object.freeze({ ok: true, receiptPath, receiptSha256: sha256(Buffer.from(payload, "utf8")), recoverabilityState: receipt.recoverabilityState, transactionStateReverified: true, sourcePostflightBindingReverified: true, liveTargetReverified: true, rollbackBackupReverified: true, recoverabilityEvidenceOnly: true, executionAllowed: false, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

async function verify(receiptPath) {
  await assertCurrentSchemaDigest();
  const file = await bound(receiptPath);
  const value = JSON.parse(file.bytes.toString("utf8"));
  if (value.contract !== CONTRACT || value.schemaSha256 !== SCHEMA_SHA256 || value.recoverabilityState !== "published-rollback-recovery-ready") throw new Error("Publication recoverability receipt contract/schema/state is invalid or stale.");
  assertNoAuthority(value, "Publication recoverability receipt");
  for (const field of ["transactionStateReverified", "sourcePostflightBindingReverified", "liveTargetReverified", "liveTargetMatchesCandidate", "rollbackBackupReverified", "rollbackBackupDiffersFromCandidate", "targetAwareLiveRecheckRequired", "recoverabilityEvidenceOnly"]) if (value[field] !== true) throw new Error(`Publication recoverability receipt lacks required invariant ${field}.`);
  const review = await inspectTransactionState(value.transactionStateReceiptPath);
  const expected = receiptFrom(review);
  const expectedPath = await allowed(deterministicReceiptPath(review.transaction.path), false);
  if (file.path !== expectedPath) throw new Error("Publication recoverability receipt is not stored at its deterministic transaction-state path.");
  for (const field of ["transactionStateReceiptPath", "transactionStateReceiptSha256", "transactionStateReceiptByteLength", "sourcePostflightReceiptPath", "sourcePostflightReceiptSha256", "sourcePostflightReceiptByteLength", "route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier", "liveTargetReference", "liveTargetSha256", "liveTargetByteLength", "rollbackBackupPath", "rollbackBackupSha256", "rollbackBackupByteLength"]) if (value[field] !== expected[field]) throw new Error(`Publication recoverability receipt drifted for ${field}.`);
  return Object.freeze({ ok: true, receiptPath: file.path, receiptSha256: file.sha256, receiptByteLength: file.byteLength, recoverabilityState: value.recoverabilityState, transactionStateReverified: true, sourcePostflightBindingReverified: true, liveTargetReverified: true, rollbackBackupReverified: true, recoverabilityEvidenceOnly: true, executionAllowed: false, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

const tools = [
  { name: "evavo_work_header_publication_recoverability_capabilities", description: "Describe read-only recoverability proof for a published Work header. It re-verifies transaction state, publication postflight lineage, the live exact candidate bytes and the distinct rollback backup; it never executes rollback or publication.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_prepare_work_header_publication_recoverability", description: "Reverify a published rollback-ready transaction, target-aware current live bytes and the distinct rollback backup, then write deterministic create-only recoverability evidence.", inputSchema: { type: "object", properties: { transactionStateReceiptPath: { type: "string", minLength: 1 }, confirmLocalWrite: { type: "boolean" } }, required: ["transactionStateReceiptPath", "confirmLocalWrite"], additionalProperties: false } },
  { name: "evavo_verify_work_header_publication_recoverability", description: "Read-only reverification of a recoverability receipt against the exact transaction-state receipt, source postflight, current live target and rollback backup.", inputSchema: { type: "object", properties: { receiptPath: { type: "string", minLength: 1 } }, required: ["receiptPath"], additionalProperties: false } },
];
function capabilities() {
  return Object.freeze({ contract: CONTRACT, serverVersion: SERVER_VERSION, schemaSha256: SCHEMA_SHA256, acceptedTransactionState: "published-verified-rollback-ready", recoverabilityState: "published-rollback-recovery-ready", exactTransactionStateShaAndLengthRequired: true, exactSourcePostflightShaAndLengthRequired: true, targetAwareCurrentLiveRecheckRequired: true, liveTargetMustMatchReviewedCandidate: true, rollbackBackupMustReverify: true, rollbackBackupMustDifferFromCandidate: true, deterministicCreateOnlyReceiptPath: true, recoverabilityEvidenceOnly: true, executionAllowed: false, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false, allowedRootCount: configuredLocalRootCount(ROOTS_ENV), writesEnabled: writesEnabled() });
}
async function callTool(name, args) {
  if (name === "evavo_work_header_publication_recoverability_capabilities") return capabilities();
  if (name === "evavo_prepare_work_header_publication_recoverability") return prepare(args ?? {});
  if (name === "evavo_verify_work_header_publication_recoverability") return verify(args?.receiptPath);
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
