#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";
import { recheckPublicationTarget } from "./lib/publication_target_recheck.mjs";

const SERVER_NAME = "evavo-work-header-publication-transaction-state";
const SERVER_VERSION = "1.1.0";
const PROTOCOL_VERSION = "2025-03-26";
const CONTRACT = "evavo.work-header-publication-transaction-state.v1";
const SCHEMA_SHA256 = "0c88d1977075832287f9acf73500e7211687a594b0b0650f4dcadf367024583c";
const SCHEMA_URL = new URL("../contracts/work-header-publication-transaction-state-v1.schema.json", import.meta.url);
const PUBLICATION_POSTFLIGHT_CONTRACT = "evavo.work-header-publication-postflight.v1";
const PUBLICATION_POSTFLIGHT_SCHEMA_SHA256 = "69b9a40178e78892c330e6f2b5bca33b3be8413ef81ef404c1dd9edad9d24ff2";
const ROLLBACK_POSTFLIGHT_CONTRACT = "evavo.work-header-publication-rollback-postflight.v1";
const ROLLBACK_POSTFLIGHT_SCHEMA_SHA256 = "42e349a9fa2da8b6c80ee304e24b91b1ee4cac4adacadc1d68410fb7f47ffe3b";
const ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";
const allowed = (p, output = false) => assertAllowedLocalPath(p, { envName: ROOTS_ENV, output, label: "work header publication transaction state" });
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function assertCurrentSchemaDigest() {
  const bytes = await readFile(SCHEMA_URL);
  const current = sha256(bytes);
  if (current !== SCHEMA_SHA256) throw new Error(`Transaction-state schema bytes drifted from governed SHA-256 (${current}).`);
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
function deterministicReceiptPath(sourcePath, state) {
  const suffix = state === "rolled-back-verified-closed" ? ".transaction-state.rolled-back.json" : ".transaction-state.published.json";
  return `${sourcePath}${suffix}`;
}

async function reverifyPublishedPostflight(file) {
  const value = JSON.parse(file.bytes.toString("utf8"));
  if (value.contract !== PUBLICATION_POSTFLIGHT_CONTRACT || value.schemaSha256 !== PUBLICATION_POSTFLIGHT_SCHEMA_SHA256 || value.postflightState !== "published-verified-rollback-ready") throw new Error("Publication postflight contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(value, "Publication postflight");
  for (const field of ["executionResultReverified", "rollbackReadinessReverified", "targetAwareLiveRecheckVerified", "liveTargetMatchesReviewedCandidate", "cloudinaryLiveRemoteRecheckRequiredWhenApplicable", "rollbackBackupStillReady", "postflightEvidenceOnly"]) if (value[field] !== true) throw new Error(`Publication postflight lacks required invariant ${field}.`);
  const recheckArgs = value.liveTargetRecheckMode === "live-remote-cloudinary"
    ? { currentTargetRecheckUrl: value.liveTargetReference }
    : value.liveTargetRecheckMode === "governed-local-website-source"
      ? { currentTargetRecheckPath: value.liveTargetReference }
      : null;
  if (!recheckArgs) throw new Error("Published transaction state requires valid target-aware live recheck provenance.");
  const live = await recheckPublicationTarget({ targetKind: value.targetKind, targetIdentifier: value.targetIdentifier, ...recheckArgs, readLocal: bound });
  if (live.mode !== value.liveTargetRecheckMode || live.sha256 !== value.liveTargetSha256 || live.byteLength !== value.liveTargetByteLength || live.sha256 !== value.candidateSha256 || live.byteLength !== value.candidateByteLength) throw new Error("Published transaction state no longer has the exact reviewed candidate live.");
  const liveReference = live.mode === "live-remote-cloudinary" ? live.url : live.path;
  if (liveReference !== value.liveTargetReference) throw new Error("Published transaction live-target reference drifted from postflight evidence.");
  const backup = await bound(value.rollbackBackupPath);
  if (backup.sha256 !== value.rollbackBackupSha256 || backup.byteLength !== value.rollbackBackupByteLength) throw new Error("Published transaction rollback backup drifted after postflight.");
  return Object.freeze({
    transactionState: "published-verified-rollback-ready",
    terminal: false,
    sourcePostflightContract: value.contract,
    file,
    value,
    live: Object.freeze({ path: liveReference, sha256: live.sha256, byteLength: live.byteLength }),
    backup,
    candidateLiveWhenPublished: true,
    previousTargetLiveWhenRolledBack: false,
    rollbackReadyWhenPublished: true,
  });
}

async function reverifyRolledBackPostflight(file) {
  const value = JSON.parse(file.bytes.toString("utf8"));
  if (value.contract !== ROLLBACK_POSTFLIGHT_CONTRACT || value.schemaSha256 !== ROLLBACK_POSTFLIGHT_SCHEMA_SHA256 || value.rollbackPostflightState !== "rolled-back-verified-closed") throw new Error("Rollback postflight contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(value, "Rollback postflight");
  for (const field of ["rollbackExecutionResultReverified", "publicationPostflightLineageReverified", "liveTargetReverified", "liveTargetMatchesPreviousTarget", "liveTargetDiffersFromCandidate", "rollbackBackupStillMatchesLiveTarget", "transactionClosedAfterVerifiedRollback", "rollbackPostflightEvidenceOnly"]) if (value[field] !== true) throw new Error(`Rollback postflight lacks required invariant ${field}.`);
  const live = await bound(value.liveTargetPath);
  if (live.sha256 !== value.liveTargetSha256 || live.byteLength !== value.liveTargetByteLength || live.sha256 !== value.previousTargetSnapshotSha256 || live.byteLength !== value.previousTargetSnapshotByteLength) throw new Error("Rolled-back transaction state no longer has the exact previous target live.");
  if (live.sha256 === value.candidateSha256 && live.byteLength === value.candidateByteLength) throw new Error("Rolled-back transaction unexpectedly still matches candidate bytes.");
  const backup = await bound(value.rollbackBackupPath);
  if (backup.sha256 !== value.rollbackBackupSha256 || backup.byteLength !== value.rollbackBackupByteLength || backup.sha256 !== live.sha256 || backup.byteLength !== live.byteLength) throw new Error("Rolled-back transaction backup no longer matches restored live target.");
  return Object.freeze({
    transactionState: "rolled-back-verified-closed",
    terminal: true,
    sourcePostflightContract: value.contract,
    file,
    value,
    live,
    backup,
    candidateLiveWhenPublished: false,
    previousTargetLiveWhenRolledBack: true,
    rollbackReadyWhenPublished: false,
  });
}

async function inspectSourcePostflight(sourcePostflightReceiptPath) {
  const file = await bound(sourcePostflightReceiptPath);
  const value = JSON.parse(file.bytes.toString("utf8"));
  if (value.contract === PUBLICATION_POSTFLIGHT_CONTRACT) return reverifyPublishedPostflight(file);
  if (value.contract === ROLLBACK_POSTFLIGHT_CONTRACT) return reverifyRolledBackPostflight(file);
  throw new Error("sourcePostflightReceiptPath must point to a governed publication or rollback postflight receipt.");
}

function receiptFromReview(review) {
  return {
    contract: CONTRACT,
    schemaSha256: SCHEMA_SHA256,
    transactionState: review.transactionState,
    terminal: review.terminal,
    sourcePostflightContract: review.sourcePostflightContract,
    sourcePostflightReceiptPath: review.file.path,
    sourcePostflightReceiptSha256: review.file.sha256,
    sourcePostflightReceiptByteLength: review.file.byteLength,
    route: review.value.route,
    candidateId: review.value.candidateId,
    candidateSha256: review.value.candidateSha256,
    candidateByteLength: review.value.candidateByteLength,
    targetKind: review.value.targetKind,
    targetIdentifier: review.value.targetIdentifier,
    liveTargetPath: review.live.path,
    liveTargetSha256: review.live.sha256,
    liveTargetByteLength: review.live.byteLength,
    rollbackBackupPath: review.backup.path,
    rollbackBackupSha256: review.backup.sha256,
    rollbackBackupByteLength: review.backup.byteLength,
    sourcePostflightReverified: true,
    liveTargetReverified: true,
    rollbackBackupReverified: true,
    candidateLiveWhenPublished: review.candidateLiveWhenPublished,
    previousTargetLiveWhenRolledBack: review.previousTargetLiveWhenRolledBack,
    rollbackReadyWhenPublished: review.rollbackReadyWhenPublished,
    transactionStateEvidenceOnly: true,
    executionAllowed: false,
    rollbackExecutionAllowed: false,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
  };
}

async function prepare(args) {
  await assertCurrentSchemaDigest();
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required to create transaction-state evidence.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);
  if (typeof args.sourcePostflightReceiptPath !== "string") throw new Error("sourcePostflightReceiptPath is required.");
  const review = await inspectSourcePostflight(args.sourcePostflightReceiptPath);
  const receipt = receiptFromReview(review);
  const receiptPath = await allowed(deterministicReceiptPath(review.file.path, review.transactionState), true);
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeCreateOnlyBundle([{ path: receiptPath, data: payload, encoding: "utf8" }]);
  return Object.freeze({ ok: true, receiptPath, receiptSha256: sha256(Buffer.from(payload, "utf8")), transactionState: receipt.transactionState, terminal: receipt.terminal, sourcePostflightReverified: true, liveTargetReverified: true, rollbackBackupReverified: true, targetAwarePublishedStateReverified: review.transactionState === "published-verified-rollback-ready", transactionStateEvidenceOnly: true, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

async function verify(receiptPath) {
  await assertCurrentSchemaDigest();
  const file = await bound(receiptPath);
  const value = JSON.parse(file.bytes.toString("utf8"));
  if (value.contract !== CONTRACT || value.schemaSha256 !== SCHEMA_SHA256) throw new Error("Transaction-state receipt contract/schema is invalid or stale.");
  assertNoMutationAuthority(value, "Transaction-state receipt");
  for (const field of ["sourcePostflightReverified", "liveTargetReverified", "rollbackBackupReverified", "transactionStateEvidenceOnly"]) if (value[field] !== true) throw new Error(`Transaction-state receipt lacks required invariant ${field}.`);
  const review = await inspectSourcePostflight(value.sourcePostflightReceiptPath);
  const expected = receiptFromReview(review);
  const expectedPath = await allowed(deterministicReceiptPath(review.file.path, review.transactionState), false);
  if (file.path !== expectedPath) throw new Error("Transaction-state receipt is not at the deterministic path for its source postflight evidence.");
  for (const field of ["transactionState", "terminal", "sourcePostflightContract", "sourcePostflightReceiptPath", "sourcePostflightReceiptSha256", "sourcePostflightReceiptByteLength", "route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier", "liveTargetPath", "liveTargetSha256", "liveTargetByteLength", "rollbackBackupPath", "rollbackBackupSha256", "rollbackBackupByteLength", "candidateLiveWhenPublished", "previousTargetLiveWhenRolledBack", "rollbackReadyWhenPublished"]) {
    if (value[field] !== expected[field]) throw new Error(`Transaction-state receipt drifted for ${field}.`);
  }
  return Object.freeze({ ok: true, receiptPath: file.path, receiptSha256: file.sha256, receiptByteLength: file.byteLength, transactionState: value.transactionState, terminal: value.terminal, sourcePostflightReverified: true, liveTargetReverified: true, rollbackBackupReverified: true, targetAwarePublishedStateReverified: value.transactionState === "published-verified-rollback-ready", transactionStateEvidenceOnly: true, executionAllowed: false, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

const tools = [
  { name: "evavo_work_header_publication_transaction_state_capabilities", description: "Describe the evidence-only transaction-state ledger for a successfully published Work header or a verified rollback. Published state is rechecked target-aware, including live remote Cloudinary stable IDs. It never executes publication or rollback.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_record_work_header_publication_transaction_state", description: "Reverify a publication or rollback postflight plus current live/backup bytes, using target-aware live remote rechecks for published Cloudinary targets, then write deterministic create-only transaction-state evidence.", inputSchema: { type: "object", properties: { sourcePostflightReceiptPath: { type: "string", minLength: 1 }, confirmLocalWrite: { type: "boolean" } }, required: ["sourcePostflightReceiptPath", "confirmLocalWrite"], additionalProperties: false } },
  { name: "evavo_verify_work_header_publication_transaction_state", description: "Read-only reverification of transaction state against the exact source postflight, target-aware current published target and rollback backup bytes.", inputSchema: { type: "object", properties: { receiptPath: { type: "string", minLength: 1 } }, required: ["receiptPath"], additionalProperties: false } },
];
function capabilities() {
  return Object.freeze({ contract: CONTRACT, serverVersion: SERVER_VERSION, schemaSha256: SCHEMA_SHA256, acceptedSourcePostflightContracts: [PUBLICATION_POSTFLIGHT_CONTRACT, ROLLBACK_POSTFLIGHT_CONTRACT], publishedState: "published-verified-rollback-ready", rolledBackState: "rolled-back-verified-closed", publishedStateTerminal: false, rolledBackStateTerminal: true, exactSourcePostflightShaAndLengthRequired: true, currentLiveTargetReverificationRequired: true, targetAwarePublishedStateReverificationRequired: true, cloudinaryPublishedStateUsesLiveRemoteRecheck: true, rollbackBackupReverificationRequired: true, deterministicCreateOnlyReceiptPath: true, transactionStateEvidenceOnly: true, executionAllowed: false, rollbackExecutionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false, allowedRootCount: configuredLocalRootCount(ROOTS_ENV), writesEnabled: writesEnabled() });
}
async function callTool(name, args) {
  if (name === "evavo_work_header_publication_transaction_state_capabilities") return capabilities();
  if (name === "evavo_record_work_header_publication_transaction_state") return prepare(args ?? {});
  if (name === "evavo_verify_work_header_publication_transaction_state") return verify(args?.receiptPath);
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
