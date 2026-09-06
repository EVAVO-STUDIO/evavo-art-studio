#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const SERVER_NAME = "evavo-image-quality-pipeline-doctor";
const SERVER_VERSION = "1.16.0";
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
  { id: "work-page-review-v200", file: "tools/work_header_page_render_review_mcp.mjs", tokens: ['SERVER_VERSION = "2.0.0"', "selectionReceiptShaAndLengthBound: true", "candidateReviewReceiptShaAndLengthBound: true", "previewAdmissionReceiptShaAndLengthBound: true", "previewManifestShaAndLengthBound: true", "pageSourceBindingsShaAndLengthReverified: true", "fullReceiptLineageVerifiedBeforeApprovalPacket: true", "approvalPacketReverificationAvailable: true", "approvalPacketCoreRecomputedDuringVerification: true", "staleApprovalPacketLineageRejected: true", "evavo_verify_work_header_approval_packet", "approvalPacketRecomputedAndMatched: true", "automaticPublicationAllowed: false"] },
  { id: "durable-review", file: "tools/image_review_session_mcp.mjs", tokens: ["evavo.image-review-session.v1_1", "sourceSha256AndLengthBound: true", "staleEvidenceVerification: true"] },
  { id: "safe-bundle", file: "tools/lib/create_only_bundle.mjs", tokens: ["writeCreateOnlyBundle", "rollback", "preflight"] },
  { id: "mcp-registration", file: ".mcp.json", tokens: ["evavo-image-review-session-v1", "evavo-image-quality-pipeline-doctor-v1", "evavo-work-header-preview-admission-v1", "evavo-work-header-page-render-review-v1"] },
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
  return Object.freeze({ contract: "evavo.image-quality-pipeline-doctor.v1_16", ready: blockers.length === 0, blockerCount: blockers.length, blockers, checks, executionPerformed: false, sourceMutationPerformed: false, publicationAllowed: false, nextAction: blockers.length ? "Repair failing image-quality contract surfaces." : "Static preservation, browser-loaded byte lineage, full page-review receipt lineage and read-only approval-packet reverification are aligned; runtime execution and visual approval remain separate." });
}
const tools = Object.freeze([
  { name: "evavo_image_quality_pipeline_doctor_capabilities", description: "Describe the read-only EVAVO image quality pipeline doctor.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_run_image_quality_pipeline_doctor", description: "Inspect preservation and exact evidence lineage through browser preview, page review and approval-packet reverification without mutating source.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
]);
const capabilities = () => Object.freeze({ contract: "evavo.image-quality-pipeline-doctor.v1_16", serverVersion: SERVER_VERSION, readOnly: true, browserResponseBodyLineageChecked: true, fullPageReviewReceiptLineageChecked: true, approvalPacketReverificationChecked: true, runtimeExecutionPerformed: false, sourceMutationPerformed: false, publicationAllowed: false, checkCount: CHECKS.length });
async function callTool(name) { if (name === "evavo_image_quality_pipeline_doctor_capabilities") return capabilities(); if (name === "evavo_run_image_quality_pipeline_doctor") return inspect(); throw new Error(`Unknown tool ${name}`); }
const response = (id, result) => ({ jsonrpc: "2.0", id, result });
const toolResult = (payload, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError });
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  try { const message = JSON.parse(line); let outgoing; if (message.method === "initialize") outgoing = response(message.id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } }); else if (message.method === "notifications/initialized") outgoing = null; else if (message.method === "tools/list") outgoing = response(message.id, { tools }); else if (message.method === "tools/call") { try { outgoing = response(message.id, toolResult(await callTool(message.params?.name))); } catch (error) { outgoing = response(message.id, toolResult({ ok: false, message: String(error) }, true)); } } if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`); } catch (error) { process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: String(error) }, true)))}\n`); }
}
