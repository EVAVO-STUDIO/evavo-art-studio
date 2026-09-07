#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-header-publication-postflight";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const CONTRACT = "evavo.work-header-publication-postflight.v1";
const SCHEMA_SHA256 = "5a1a2a9a329d3ce4eecd81981e3aa35cd2d6d2d3487f78b6b56672bacca99ae8";
const SCHEMA_URL = new URL("../contracts/work-header-publication-postflight-v1.schema.json", import.meta.url);
const EXECUTION_RESULT_CONTRACT = "evavo.work-header-publication-execution-result.v1";
const EXECUTION_RESULT_SCHEMA_SHA256 = "6d94ca926dea8c5c0fdc025c3d65a8692ae5c8c6e61db2d37a536ae352d52445";
const ROLLBACK_READINESS_CONTRACT = "evavo.work-header-publication-rollback-readiness.v1";
const ROLLBACK_READINESS_SCHEMA_SHA256 = "cc56d28b46f98cea1f97b46aa9988522c6b97424ee853a7c6c968a45ffd77f6d";
const ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";
const allowed = (p, output = false) => assertAllowedLocalPath(p, { envName: ROOTS_ENV, output, label: "work header publication postflight" });
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function assertCurrentSchemaDigest() {
  const bytes = await readFile(SCHEMA_URL);
  const current = sha256(bytes);
  if (current !== SCHEMA_SHA256) throw new Error(`Publication-postflight schema bytes drifted from governed SHA-256 (${current}).`);
}
async function bound(filePath) {
  const resolved = await allowed(filePath, false);
  const bytes = await readFile(resolved);
  if (!bytes.length) throw new Error(`Evidence file is empty: ${resolved}`);
  return Object.freeze({ path: resolved, bytes, sha256: sha256(bytes), byteLength: bytes.length });
}
function assertNoMutationAuthority(value, label) {
  for (const field of ["publicationAllowed", "cloudOverwriteAllowed", "websiteMutationAllowed"]) {
    if (value?.[field] !== false) throw new Error(`${label} carries forbidden mutation authority (${field}).`);
  }
  if (value?.executionAllowed !== undefined && value.executionAllowed !== false) throw new Error(`${label} carries forbidden execution authority.`);
  if (value?.rollbackExecutionAllowed !== undefined && value.rollbackExecutionAllowed !== false) throw new Error(`${label} carries forbidden rollback execution authority.`);
}
function deterministicReceiptPath(executionResultPath) {
  return `${executionResultPath}.postflight.json`;
}

async function reverifyExecutionResult(executionResultReceiptPath) {
  const file = await bound(executionResultReceiptPath);
  const value = JSON.parse(file.bytes.toString("utf8"));
  if (value.contract !== EXECUTION_RESULT_CONTRACT || value.schemaSha256 !== EXECUTION_RESULT_SCHEMA_SHA256 || value.resultState !== "executed-verified") throw new Error("Execution-result receipt contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(value, "Execution-result receipt");
  for (const field of ["claimReverifiedBeforeAttestation", "candidateBytesReverified", "postExecutionTargetMatchesCandidate", "postExecutionTargetDiffersFromPreviousTarget", "rollbackBackupPreserved", "resultIsEvidenceOnly"]) if (value[field] !== true) throw new Error(`Execution-result receipt lacks required invariant ${field}.`);
  const published = await bound(value.postExecutionTargetPath);
  if (published.sha256 !== value.postExecutionTargetSha256 || published.byteLength !== value.postExecutionTargetByteLength || published.sha256 !== value.candidateSha256 || published.byteLength !== value.candidateByteLength) throw new Error("Execution-result published target no longer exactly matches the reviewed candidate bytes.");
  return Object.freeze({ file, value, published });
}

async function reverifyRollbackReadiness(rollbackReadinessReceiptPath, execution) {
  const file = await bound(rollbackReadinessReceiptPath);
  const value = JSON.parse(file.bytes.toString("utf8"));
  if (value.contract !== ROLLBACK_READINESS_CONTRACT || value.schemaSha256 !== ROLLBACK_READINESS_SCHEMA_SHA256 || value.rollbackState !== "rollback-ready-unexecuted") throw new Error("Rollback-readiness receipt contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(value, "Rollback-readiness receipt");
  if (value.rollbackPreparationOnly !== true || value.rollbackExecutionAllowed !== false) throw new Error("Rollback-readiness receipt must remain preparation-only and non-executing.");
  for (const field of ["executionResultReverified", "currentPublishedTargetReverified", "rollbackBackupReverified", "currentPublishedTargetMatchesCandidate", "rollbackBackupMatchesPreviousTarget"]) if (value[field] !== true) throw new Error(`Rollback-readiness receipt lacks required invariant ${field}.`);
  if (value.executionResultReceiptPath !== execution.file.path || value.executionResultReceiptSha256 !== execution.file.sha256 || value.executionResultReceiptByteLength !== execution.file.byteLength) throw new Error("Rollback-readiness receipt is bound to changed execution-result evidence.");
  for (const field of ["route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier"]) if (value[field] !== execution.value[field]) throw new Error(`Rollback-readiness identity drifted from execution result for ${field}.`);
  const published = await bound(value.publishedTargetPath);
  if (published.sha256 !== value.publishedTargetSha256 || published.byteLength !== value.publishedTargetByteLength || published.sha256 !== execution.value.candidateSha256 || published.byteLength !== execution.value.candidateByteLength) throw new Error("Rollback-readiness published target no longer exactly matches the reviewed candidate.");
  const backup = await bound(value.rollbackBackupPath);
  if (backup.sha256 !== value.rollbackBackupSha256 || backup.byteLength !== value.rollbackBackupByteLength || backup.sha256 !== execution.value.rollbackBackupSha256 || backup.byteLength !== execution.value.rollbackBackupByteLength) throw new Error("Rollback backup changed after readiness verification.");
  if (backup.path === published.path) throw new Error("Rollback backup must remain physically separate from the published target.");
  return Object.freeze({ file, value, published, backup });
}

async function reviewPostflight(executionResultReceiptPath, rollbackReadinessReceiptPath, liveTargetPath) {
  const execution = await reverifyExecutionResult(executionResultReceiptPath);
  const rollback = await reverifyRollbackReadiness(rollbackReadinessReceiptPath, execution);
  const live = await bound(liveTargetPath);
  if (live.sha256 !== execution.value.candidateSha256 || live.byteLength !== execution.value.candidateByteLength) throw new Error("Current live target no longer exactly matches the reviewed candidate bytes.");
  if (live.sha256 !== rollback.published.sha256 || live.byteLength !== rollback.published.byteLength) throw new Error("Current live target drifted from the rollback-readiness published-target evidence.");
  if (rollback.backup.sha256 === live.sha256 && rollback.backup.byteLength === live.byteLength) throw new Error("Live target unexpectedly matches rollback backup; publication state is ambiguous.");
  return Object.freeze({ execution, rollback, live });
}

async function prepare(args) {
  await assertCurrentSchemaDigest();
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required to create postflight evidence.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);
  for (const name of ["executionResultReceiptPath", "rollbackReadinessReceiptPath", "liveTargetPath"]) if (typeof args[name] !== "string" || !args[name]) throw new Error(`${name} is required.`);
  const review = await reviewPostflight(args.executionResultReceiptPath, args.rollbackReadinessReceiptPath, args.liveTargetPath);
  const receiptPath = await allowed(deterministicReceiptPath(review.execution.file.path), true);
  const receipt = {
    contract: CONTRACT,
    schemaSha256: SCHEMA_SHA256,
    postflightState: "published-verified-rollback-ready",
    executionResultReceiptPath: review.execution.file.path,
    executionResultReceiptSha256: review.execution.file.sha256,
    executionResultReceiptByteLength: review.execution.file.byteLength,
    rollbackReadinessReceiptPath: review.rollback.file.path,
    rollbackReadinessReceiptSha256: review.rollback.file.sha256,
    rollbackReadinessReceiptByteLength: review.rollback.file.byteLength,
    route: review.execution.value.route,
    candidateId: review.execution.value.candidateId,
    candidateSha256: review.execution.value.candidateSha256,
    candidateByteLength: review.execution.value.candidateByteLength,
    targetKind: review.execution.value.targetKind,
    targetIdentifier: review.execution.value.targetIdentifier,
    liveTargetPath: review.live.path,
    liveTargetSha256: review.live.sha256,
    liveTargetByteLength: review.live.byteLength,
    rollbackBackupPath: review.rollback.backup.path,
    rollbackBackupSha256: review.rollback.backup.sha256,
    rollbackBackupByteLength: review.rollback.backup.byteLength,
    executionResultReverified: true,
    rollbackReadinessReverified: true,
    liveTargetReverified: true,
    liveTargetMatchesReviewedCandidate: true,
    rollbackBackupStillReady: true,
    postflightEvidenceOnly: true,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
  };
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeCreateOnlyBundle([{ path: receiptPath, data: payload, encoding: "utf8" }]);
  return Object.freeze({ ok: true, receiptPath, receiptSha256: sha256(Buffer.from(payload, "utf8")), postflightState: receipt.postflightState, route: receipt.route, candidateId: receipt.candidateId, candidateSha256: receipt.candidateSha256, rollbackBackupStillReady: true, postflightEvidenceOnly: true, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

async function verify(receiptPath) {
  await assertCurrentSchemaDigest();
  const file = await bound(receiptPath);
  const value = JSON.parse(file.bytes.toString("utf8"));
  if (value.contract !== CONTRACT || value.schemaSha256 !== SCHEMA_SHA256 || value.postflightState !== "published-verified-rollback-ready") throw new Error("Publication-postflight receipt contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(value, "Publication-postflight receipt");
  for (const field of ["executionResultReverified", "rollbackReadinessReverified", "liveTargetReverified", "liveTargetMatchesReviewedCandidate", "rollbackBackupStillReady", "postflightEvidenceOnly"]) if (value[field] !== true) throw new Error(`Publication-postflight receipt lacks required invariant ${field}.`);
  const expectedPath = await allowed(deterministicReceiptPath(value.executionResultReceiptPath), false);
  if (file.path !== expectedPath) throw new Error("Publication-postflight receipt is not at the deterministic create-only path for its execution result.");
  const review = await reviewPostflight(value.executionResultReceiptPath, value.rollbackReadinessReceiptPath, value.liveTargetPath);
  if (review.execution.file.sha256 !== value.executionResultReceiptSha256 || review.execution.file.byteLength !== value.executionResultReceiptByteLength) throw new Error("Publication-postflight execution-result lineage drifted.");
  if (review.rollback.file.sha256 !== value.rollbackReadinessReceiptSha256 || review.rollback.file.byteLength !== value.rollbackReadinessReceiptByteLength) throw new Error("Publication-postflight rollback-readiness lineage drifted.");
  for (const field of ["route", "candidateId", "candidateSha256", "candidateByteLength", "targetKind", "targetIdentifier"]) if (value[field] !== review.execution.value[field]) throw new Error(`Publication-postflight identity drifted for ${field}.`);
  if (value.liveTargetPath !== review.live.path || value.liveTargetSha256 !== review.live.sha256 || value.liveTargetByteLength !== review.live.byteLength) throw new Error("Publication-postflight live-target binding drifted.");
  if (value.rollbackBackupPath !== review.rollback.backup.path || value.rollbackBackupSha256 !== review.rollback.backup.sha256 || value.rollbackBackupByteLength !== review.rollback.backup.byteLength) throw new Error("Publication-postflight rollback-backup binding drifted.");
  return Object.freeze({ ok: true, receiptPath: file.path, receiptSha256: file.sha256, receiptByteLength: file.byteLength, postflightState: value.postflightState, executionResultReverified: true, rollbackReadinessReverified: true, liveTargetReverified: true, liveTargetMatchesReviewedCandidate: true, rollbackBackupStillReady: true, postflightEvidenceOnly: true, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

const tools = [
  { name: "evavo_work_header_publication_postflight_capabilities", description: "Describe read-only-after-external-execution Work-header postflight verification. It proves the current live target still equals the reviewed candidate and rollback remains ready; it cannot mutate website or Cloudinary state.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_prepare_work_header_publication_postflight", description: "Reverify the execution result, rollback readiness and current live target bytes, then write deterministic create-only postflight evidence. No publication or rollback is performed.", inputSchema: { type: "object", properties: { executionResultReceiptPath: { type: "string", minLength: 1 }, rollbackReadinessReceiptPath: { type: "string", minLength: 1 }, liveTargetPath: { type: "string", minLength: 1 }, confirmLocalWrite: { type: "boolean" } }, required: ["executionResultReceiptPath", "rollbackReadinessReceiptPath", "liveTargetPath", "confirmLocalWrite"], additionalProperties: false } },
  { name: "evavo_verify_work_header_publication_postflight", description: "Read-only reverification of publication postflight evidence against the exact execution result, rollback-readiness receipt, current live target and rollback backup.", inputSchema: { type: "object", properties: { receiptPath: { type: "string", minLength: 1 } }, required: ["receiptPath"], additionalProperties: false } },
];
function capabilities() { return Object.freeze({ contract: CONTRACT, serverVersion: SERVER_VERSION, schemaSha256: SCHEMA_SHA256, executionResultReverificationRequired: true, rollbackReadinessReverificationRequired: true, currentLiveTargetMustExactlyMatchReviewedCandidate: true, rollbackBackupMustRemainReady: true, deterministicCreateOnlyReceipt: true, postflightEvidenceOnly: true, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false, allowedRootCount: configuredLocalRootCount(ROOTS_ENV), writesEnabled: writesEnabled() }); }
async function callTool(name, args) {
  if (name === "evavo_work_header_publication_postflight_capabilities") return capabilities();
  if (name === "evavo_prepare_work_header_publication_postflight") return prepare(args ?? {});
  if (name === "evavo_verify_work_header_publication_postflight") return verify(args?.receiptPath);
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
