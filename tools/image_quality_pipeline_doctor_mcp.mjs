#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const SERVER_NAME = "evavo-image-quality-pipeline-doctor";
const SERVER_VERSION = "1.20.0";
const PROTOCOL_VERSION = "2025-03-26";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHECKS = Object.freeze([
  { id: "alpha-aware-quality", file: "packages/media/src/existing-image-quality-review.ts", tokens: ["alpha-weighted-visible-pixels", "visiblePixelRatio", "transparentRgbDetectionMode"] },
  { id: "profile-aware-defects", file: "packages/media/src/existing-image-defect-detection.ts", tokens: ["resolveTransparentRgbMode", "haloColorDistanceThreshold"] },
  { id: "defect-regions", file: "packages/media/src/defect-region-components.ts", tokens: ["segmentDefectMaskRegions", "retainedComponentCount"] },
  { id: "finishing-plan", file: "packages/media/src/existing-image-finishing-plan.ts", tokens: ["planExistingImageFinishing", "automaticRepairAllowed: false", "localized-repair", "manual-review"] },
  { id: "artifact-signals", file: "packages/media/src/image-artifact-signals.ts", tokens: ["ringingRiskRatio", "posterizationRisk", "nearestNeighbourUpscaleRisk"] },
  { id: "enhancement-session", file: "tools/enhancement_review_session_mcp.mjs", tokens: ["evavo.enhancement-art-review-session.v1_5", "evavo_verify_enhancement_review_session", "proofSha256AndLengthBound: true"] },
  { id: "work-preview-core-v7", file: "packages/media/src/work-header-preview-admission.ts", tokens: ["evavo.work-header-candidate-preview-capture.v7", "browserResponseBodyIdentityVerified", "browserResponseMetadataBound", "browserResponseBindings", "atomicEvidenceBundleVerified: true"] },
  { id: "work-preview-mcp-v170", file: "tools/work_header_preview_admission_mcp.mjs", tokens: ['SERVER_VERSION = "1.7.0"', "browserResponseMetadataShaAndLengthBound: true", "browserResponseMetadataPersistedPerProfile: true", "evavo_verify_work_header_preview_admission"] },
  { id: "work-page-review-input-safety", file: "packages/media/src/work-header-page-render-review.ts", tokens: ["MAX_SCREENSHOT_BYTES", "MAX_NOTES = 24", "MAX_NOTE_CHARACTERS = 500", "MAX_NOTES_CHARACTERS = 4_000", "pageSlug must be a canonical Work detail route under /work/.", "must be boolean.", "notes exceed the"] },
  { id: "work-page-review-v200", file: "tools/work_header_page_render_review_mcp.mjs", tokens: ['SERVER_VERSION = "2.0.0"', "selectionReceiptShaAndLengthBound: true", "candidateReviewReceiptShaAndLengthBound: true", "previewAdmissionReceiptShaAndLengthBound: true", "previewManifestShaAndLengthBound: true", "pageSourceBindingsShaAndLengthReverified: true", "fullReceiptLineageVerifiedBeforeApprovalPacket: true", "approvalPacketReverificationAvailable: true", "approvalPacketCoreRecomputedDuringVerification: true", "staleApprovalPacketLineageRejected: true", "evavo_verify_work_header_approval_packet", "approvalPacketRecomputedAndMatched: true", "automaticPublicationAllowed: false"] },
  { id: "work-explicit-approval-decision", file: "tools/work_header_approval_decision_mcp.mjs", tokens: ['SERVER_VERSION = "1.0.0"', 'CONTRACT = "evavo.work-header-approval-decision.v1"', "explicitReviewerDecisionRequired: true", "automaticDecisionAllowed: false", "approvalPacketReverificationRequired: true", "fullReceiptLineageRequired: true", "evidenceIdentityDigestRequired: true", "approvedDecisionAllowsPublicationPreparationOnly: true", "evavo_record_work_header_approval_decision", "evavo_verify_work_header_approval_decision", "publicationAllowed: false", "cloudOverwriteAllowed: false", "websiteMutationAllowed: false"] },
  { id: "work-publication-preparation", file: "tools/work_header_publication_preparation_mcp.mjs", tokens: ['CONTRACT = "evavo.work-header-publication-preparation.v1"', "explicitApprovedDecisionRequired: true", "approvalDecisionReverificationRequired: true", "fullReceiptLineageRequired: true", "exactCandidateBytesRequired: true", "backupRequiredBeforeExecution: true", "rollbackEvidenceRequiredBeforeExecution: true", "stableUrlOrPublicIdPreservationRequiredForCloudinary: true", "sourceCodeBackupOrRevertPointRequiredForWebsite: true", "evavo_prepare_work_header_publication", "evavo_verify_work_header_publication_preparation", "executionAllowed: false", "publicationAllowed: false", "cloudOverwriteAllowed: false", "websiteMutationAllowed: false"] },
  { id: "work-publication-transaction-plan", file: "tools/work_header_publication_transaction_plan_mcp.mjs", tokens: ['SERVER_VERSION = "1.0.0"', 'CONTRACT = "evavo.work-header-publication-transaction-plan.v1"', 'SCHEMA_SHA256 = "f9e11403cabe947e50f0681300527fc164d551e2a8c4615f16bd723e2550d73f"', "explicitApprovedPreparationRequired: true", "preparationReverificationRequired: true", "exactCandidateBytesRequired: true", "currentTargetSnapshotRequired: true", "separateRollbackBackupRequired: true", "exactRollbackByteMatchRequired: true", "explicitExecutionConfirmationRequired: true", "evavo_plan_work_header_publication_transaction", "evavo_verify_work_header_publication_transaction_plan", "executionAllowed: false", "publicationAllowed: false", "cloudOverwriteAllowed: false", "websiteMutationAllowed: false"] },
  { id: "work-publication-transaction-schema", file: "contracts/work-header-publication-transaction-plan-v1.schema.json", tokens: ["evavo.work-header-publication-transaction-plan.v1", '"planned-unexecuted"', '"backupCapturedBeforeExecution"', '"rollbackEvidenceVerifiedBeforeExecution"', '"additionalProperties": false'] },
  { id: "durable-review", file: "tools/image_review_session_mcp.mjs", tokens: ["evavo.image-review-session.v1_1", "sourceSha256AndLengthBound: true", "staleEvidenceVerification: true"] },
  { id: "safe-bundle", file: "tools/lib/create_only_bundle.mjs", tokens: ["writeCreateOnlyBundle", "rollback", "preflight"] },
  { id: "mcp-registration", file: ".mcp.json", tokens: ["evavo-image-review-session-v1", "evavo-image-quality-pipeline-doctor-v1", "evavo-work-header-preview-admission-v1", "evavo-work-header-page-render-review-v1", "evavo-work-header-approval-decision-v1", "evavo-work-header-publication-preparation-v1", "evavo-work-header-publication-transaction-plan-v1"] },
]);

async function inspect() {
  const checks = [];
  for (const check of CHECKS) {
    try {
      const source = await readFile(path.join(repoRoot, check.file), "utf8");
      const missing = check.tokens.filter((token) => !source.includes(token));
      checks.push({ id: check.id, file: check.file, ok: missing.length === 0, missing });
    } catch (error) {
      checks.push({ id: check.id, file: check.file, ok: false, missing: ["file-unreadable"], error: String(error) });
    }
  }
  const blockers = checks.filter((x) => !x.ok).map((x) => x.id);
  return Object.freeze({ contract: "evavo.image-quality-pipeline-doctor.v1_20", ready: blockers.length === 0, blockerCount: blockers.length, blockers, checks, executionPerformed: false, sourceMutationPerformed: false, publicationAllowed: false, nextAction: blockers.length ? "Repair failing image-quality contract surfaces." : "Static preservation, browser-loaded byte lineage, fail-closed page-review inputs, approval-packet reverification, explicit reviewer decisions, non-executing publication preparation and exact rollback-backed transaction planning are aligned; runtime execution and publication remain separate." });
}
const tools = Object.freeze([
  { name: "evavo_image_quality_pipeline_doctor_capabilities", description: "Describe the read-only EVAVO image quality pipeline doctor.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_run_image_quality_pipeline_doctor", description: "Inspect preservation and exact evidence lineage through browser preview, page review, explicit reviewer decision, publication preparation and rollback-backed non-executing transaction planning without mutating source.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
]);
const capabilities = () => Object.freeze({ contract: "evavo.image-quality-pipeline-doctor.v1_20", serverVersion: SERVER_VERSION, readOnly: true, browserResponseBodyLineageChecked: true, pageReviewInputSafetyChecked: true, fullPageReviewReceiptLineageChecked: true, approvalPacketReverificationChecked: true, explicitReviewerDecisionBoundaryChecked: true, publicationPreparationBoundaryChecked: true, publicationTransactionPlanBoundaryChecked: true, rollbackBackupEqualityChecked: true, runtimeExecutionPerformed: false, sourceMutationPerformed: false, publicationAllowed: false, checkCount: CHECKS.length });
async function callTool(name) { if (name === "evavo_image_quality_pipeline_doctor_capabilities") return capabilities(); if (name === "evavo_run_image_quality_pipeline_doctor") return inspect(); throw new Error(`Unknown tool ${name}`); }
const response = (id, result) => ({ jsonrpc: "2.0", id, result });
const toolResult = (payload, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError });
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  try { const message = JSON.parse(line); let outgoing; if (message.method === "initialize") outgoing = response(message.id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } }); else if (message.method === "notifications/initialized") outgoing = null; else if (message.method === "tools/list") outgoing = response(message.id, { tools }); else if (message.method === "tools/call") { try { outgoing = response(message.id, toolResult(await callTool(message.params?.name))); } catch (error) { outgoing = response(message.id, toolResult({ ok: false, message: String(error) }, true)); } } if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`); } catch (error) { process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: String(error) }, true)))}\n`); }
}
