#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const SERVER_NAME = "evavo-work-header-publication-recoverability-doctor";
const SERVER_VERSION = "1.1.0";
const PROTOCOL_VERSION = "2025-03-26";
const CONTRACT = "evavo.work-header-publication-recoverability-doctor.v1_1";
const RECOVERABILITY_SCHEMA_SHA256 = "c2fceba4d6d9bfa7ed4d1ec252c74d133a30b5e7f4a33847cc8fd354c275ae15";
const ROLLBACK_AUTHORIZATION_SCHEMA_SHA256 = "751c202db89dc1438a822eccf45365071d96be0eabe6680d372103d0f7b6c6e9";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const CHECKS = Object.freeze([
  Object.freeze({
    id: "recoverability-schema",
    file: "contracts/work-header-publication-recoverability-v1.schema.json",
    exactSha256: RECOVERABILITY_SCHEMA_SHA256,
    tokens: [
      "evavo.work-header-publication-recoverability.v1",
      "published-rollback-recovery-ready",
      "rollbackBackupDiffersFromCandidate",
      "recoverabilityEvidenceOnly",
      '"rollbackExecutionAllowed": { "const": false }',
      '"publicationAllowed": { "const": false }',
    ],
  }),
  Object.freeze({
    id: "recoverability-mcp",
    file: "tools/work_header_publication_recoverability_mcp.mjs",
    tokens: [
      'SERVER_VERSION = "1.0.1"',
      `SCHEMA_SHA256 = "${RECOVERABILITY_SCHEMA_SHA256}"`,
      'TRANSACTION_STATE_CONTRACT = "evavo.work-header-publication-transaction-state.v1"',
      'PUBLICATION_POSTFLIGHT_CONTRACT = "evavo.work-header-publication-postflight.v1"',
      "recheckPublicationTarget",
      "Current live publication target no longer matches the exact reviewed candidate bytes.",
      "Rollback backup bytes drifted after publication.",
      "Rollback backup is not a distinct previous-target snapshot; recoverability cannot be proven.",
      "evavo_verify_work_header_publication_recoverability",
      "targetAwareCurrentLiveRecheckRequired: true",
      "rollbackBackupMustDifferFromCandidate: true",
      "recoverabilityEvidenceOnly: true",
      "rollbackExecutionAllowed: false",
      "publicationAllowed: false",
    ],
  }),
  Object.freeze({
    id: "rollback-authorization-schema",
    file: "contracts/work-header-publication-rollback-authorization-v1.schema.json",
    exactSha256: ROLLBACK_AUTHORIZATION_SCHEMA_SHA256,
    tokens: [
      "evavo.work-header-publication-rollback-authorization.v1",
      "recoverabilityReceiptPath",
      "recoverabilityReceiptSha256",
      "recoverabilityReceiptByteLength",
      "recoverabilityReverified",
      "recoverabilityLiveTargetMatchedCandidateAtVerification",
      "recoverabilityRollbackBackupStillReady",
      '"rollbackExecutionAllowed": {',
      '"const": false',
    ],
  }),
  Object.freeze({
    id: "rollback-authorization-recoverability-gate",
    file: "tools/work_header_publication_rollback_authorization_mcp.mjs",
    tokens: [
      'SERVER_VERSION = "1.3.0"',
      `SCHEMA_SHA256 = "${ROLLBACK_AUTHORIZATION_SCHEMA_SHA256}"`,
      'RECOVERABILITY_CONTRACT = "evavo.work-header-publication-recoverability.v1"',
      "reverifyRecoverability",
      "recoverabilityReceiptPath",
      "recoverabilityReverified: true",
      "publicationRecoverabilityReverificationRequired: true",
      "recoverabilityTransactionStateBindingRequired: true",
      "recoverabilitySourcePostflightBindingRequired: true",
      "recoverabilityLiveTargetMustMatchCandidate: true",
      "recoverabilityRollbackBackupMustRemainDistinctAndReady: true",
      "rollbackExecutionAllowed: false",
    ],
  }),
  Object.freeze({
    id: "rollback-claim-recoverability-gate",
    file: "tools/work_header_publication_rollback_execution_claim_mcp.mjs",
    tokens: [
      'SERVER_VERSION = "1.3.0"',
      `AUTHORIZATION_SCHEMA_SHA256 = "${ROLLBACK_AUTHORIZATION_SCHEMA_SHA256}"`,
      "reverifyRecoverability",
      "recoverabilityGateInheritedFromAuthorization: true",
      "recoverabilityReceiptReverificationRequiredAtClaim: true",
      "claimInvalidOnAnyEvidenceDrift: true",
      "rollbackExecutionAllowed: false",
    ],
  }),
  Object.freeze({
    id: "rollback-result-recoverability-gate",
    file: "tools/work_header_publication_rollback_execution_result_mcp.mjs",
    tokens: [
      'SERVER_VERSION = "1.2.0"',
      `AUTHORIZATION_SCHEMA_SHA256 = "${ROLLBACK_AUTHORIZATION_SCHEMA_SHA256}"`,
      "reverifyRecoverabilityFromAuthorization",
      "recoverabilityGateInheritedFromAuthorization: true",
      "recoverabilityReceiptReverificationRequiredBeforeAttestation: true",
      "observedExternalRollbackOnly: true",
      "resultIsEvidenceOnly: true",
      "rollbackExecutionAllowed: false",
    ],
  }),
  Object.freeze({
    id: "rollback-postflight-recoverability-closure",
    file: "tools/work_header_publication_rollback_postflight_mcp.mjs",
    tokens: [
      'SERVER_VERSION = "1.2.0"',
      `ROLLBACK_AUTHORIZATION_SCHEMA_SHA256 = "${ROLLBACK_AUTHORIZATION_SCHEMA_SHA256}"`,
      "reverifyAuthorizationRecoverability",
      "recoverabilityGateInheritedFromAuthorization: true",
      "recoverabilityLineageReverificationRequired: true",
      "transactionClosedAfterVerifiedRollback: true",
      "rollbackPostflightEvidenceOnly: true",
      "rollbackExecutionAllowed: false",
    ],
  }),
  Object.freeze({
    id: "transaction-state-source",
    file: "tools/work_header_publication_transaction_state_mcp.mjs",
    tokens: [
      'CONTRACT = "evavo.work-header-publication-transaction-state.v1"',
      "published-verified-rollback-ready",
      "rolled-back-verified-closed",
      "rollbackBackupReverificationRequired: true",
      "transactionStateEvidenceOnly: true",
    ],
  }),
  Object.freeze({
    id: "publication-postflight-source",
    file: "tools/work_header_publication_postflight_mcp.mjs",
    tokens: [
      'CONTRACT = "evavo.work-header-publication-postflight.v1"',
      "targetAwareLiveRecheckRequired: true",
      "currentLiveTargetMustExactlyMatchReviewedCandidate: true",
      "rollbackBackupMustRemainReady: true",
      "postflightEvidenceOnly: true",
    ],
  }),
  Object.freeze({
    id: "recoverability-global-registration",
    file: ".mcp.json",
    tokens: [
      '"evavo-work-header-publication-recoverability-v1"',
      '"tools/work_header_publication_recoverability_mcp.mjs"',
      '"evavo-work-header-publication-recoverability-doctor-v1"',
      '"tools/work_header_publication_recoverability_doctor_mcp.mjs"',
    ],
  }),
]);

async function inspect() {
  const checks = [];
  for (const check of CHECKS) {
    const absolute = path.join(repoRoot, check.file);
    try {
      const bytes = await readFile(absolute);
      const source = bytes.toString("utf8");
      const missing = check.tokens.filter((token) => !source.includes(token));
      const actualSha256 = sha256(bytes);
      const digestOk = !check.exactSha256 || actualSha256 === check.exactSha256;
      checks.push(Object.freeze({ id: check.id, file: check.file, ok: missing.length === 0 && digestOk, missing, actualSha256, expectedSha256: check.exactSha256 ?? null }));
    } catch (error) {
      checks.push(Object.freeze({ id: check.id, file: check.file, ok: false, missing: ["file-unreadable"], error: error instanceof Error ? error.message : String(error) }));
    }
  }
  const blockers = checks.filter((check) => !check.ok).map((check) => check.id);
  return Object.freeze({
    contract: CONTRACT,
    ready: blockers.length === 0,
    blockerCount: blockers.length,
    blockers,
    checks,
    recoverabilitySchemaSha256: RECOVERABILITY_SCHEMA_SHA256,
    rollbackAuthorizationSchemaSha256: ROLLBACK_AUTHORIZATION_SCHEMA_SHA256,
    recoverabilityRequiredBeforeRollbackAuthorization: true,
    recoverabilityGateInheritedByRollbackClaim: true,
    recoverabilityGateInheritedByRollbackResult: true,
    recoverabilityLineageRequiredForTerminalRollbackClosure: true,
    recoverabilityEvidenceOnly: true,
    executionPerformed: false,
    sourceMutationPerformed: false,
    executionAllowed: false,
    rollbackExecutionAllowed: false,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
  });
}

const tools = Object.freeze([
  Object.freeze({ name: "evavo_work_header_publication_recoverability_doctor_capabilities", description: "Describe the read-only static doctor for published Work-header recoverability and the complete recoverability-gated rollback evidence chain.", inputSchema: { type: "object", properties: {}, additionalProperties: false } }),
  Object.freeze({ name: "evavo_run_work_header_publication_recoverability_doctor", description: "Check exact recoverability and rollback-authorization schema digests plus recoverability gating through authorization, single-use claim, external rollback attestation and terminal rollback closure. Never performs publication or rollback.", inputSchema: { type: "object", properties: {}, additionalProperties: false } }),
]);
const capabilities = () => Object.freeze({ contract: CONTRACT, serverVersion: SERVER_VERSION, readOnly: true, recoverabilitySchemaSha256: RECOVERABILITY_SCHEMA_SHA256, rollbackAuthorizationSchemaSha256: ROLLBACK_AUTHORIZATION_SCHEMA_SHA256, recoverabilityRequiredBeforeRollbackAuthorization: true, recoverabilityGateCheckedThroughTerminalClosure: true, targetAwareLiveRecheckChecked: true, rollbackBackupDistinctnessChecked: true, executionAllowed: false, rollbackExecutionAllowed: false, publicationAllowed: false, checkCount: CHECKS.length });
async function callTool(name) {
  if (name === "evavo_work_header_publication_recoverability_doctor_capabilities") return capabilities();
  if (name === "evavo_run_work_header_publication_recoverability_doctor") return inspect();
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}
const response = (id, result) => ({ jsonrpc: "2.0", id, result });
const toolResult = (payload, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError });
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  try {
    const message = JSON.parse(line); let outgoing = null;
    if (message.method === "initialize") outgoing = response(message.id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } });
    else if (message.method === "notifications/initialized") outgoing = null;
    else if (message.method === "tools/list") outgoing = response(message.id, { tools });
    else if (message.method === "tools/call") {
      try { outgoing = response(message.id, toolResult(await callTool(message.params?.name))); }
      catch (error) { outgoing = response(message.id, toolResult({ ok: false, message: error instanceof Error ? error.message : String(error) }, true)); }
    } else outgoing = response(message.id, toolResult({ ok: false, message: `Unsupported method ${JSON.stringify(message.method)}.` }, true));
    if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: String(error) }, true)))}\n`);
  }
}
