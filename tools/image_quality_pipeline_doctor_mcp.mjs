#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const SERVER_NAME = "evavo-image-quality-pipeline-doctor";
const SERVER_VERSION = "1.3.0";
const PROTOCOL_VERSION = "2025-03-26";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CHECKS = Object.freeze([
  Object.freeze({ id: "alpha-aware-quality", file: "packages/media/src/existing-image-quality-review.ts", tokens: ["alpha-weighted-visible-pixels", "visiblePixelRatio", "alphaWeightRatio", "fully-transparent-no-visible-artwork", "transparentRgbDetectionMode", "edge-only"] }),
  Object.freeze({ id: "profile-aware-defects", file: "packages/media/src/existing-image-defect-detection.ts", tokens: ["resolveTransparentRgbMode", "haloColorDistanceThreshold", "hardJumps", "edge-only"] }),
  Object.freeze({ id: "defect-regions", file: "packages/media/src/defect-region-components.ts", tokens: ["segmentDefectMaskRegions", "retainedComponentCount", "mergeGap", "touchesCanvasEdge"] }),
  Object.freeze({ id: "finishing-plan-core", file: "packages/media/src/existing-image-finishing-plan.ts", tokens: ["planExistingImageFinishing", "smallest preservation-first next", "automaticRepairAllowed: false", "preservation-polish", "localized-repair", "manual-review"] }),
  Object.freeze({ id: "artifact-signals", file: "packages/media/src/image-artifact-signals.ts", tokens: ["evavo.image-artifact-signals.v1_1", "ringingRiskRatio", "posterizationRisk", "horizontalPhaseSeparation", "verticalPhaseSeparation", "nearestNeighbourUpscaleRisk", "pixel-art"] }),
  Object.freeze({ id: "unified-orchestrator", file: "packages/media/src/image-review-orchestrator.ts", tokens: ["strictTransparentRgb", "detectExistingImageDefects", "segmentDefectMaskRegions", "detectImageArtifactSignals", "probable-nearest-neighbour-upscale-of-non-pixel-art", "pass-to-visual-review"] }),
  Object.freeze({ id: "binary-edit-mask", file: "packages/media/src/existing-image-diff.ts", tokens: ["changeMaskPng", "binary", "opaqueRgbChangedPixels", "alphaChangedPixels"] }),
  Object.freeze({ id: "multi-region-inspection", file: "packages/media/src/existing-image-inspection-proof.ts", tokens: ["changeRegions", "maximumRegions: 3", "source-region-01", "segmentDefectMaskRegions"] }),
  Object.freeze({ id: "safe-output-bundle", file: "tools/lib/create_only_bundle.mjs", tokens: ["writeCreateOnlyBundle", "rollback", "link", "preflight"] }),
  Object.freeze({ id: "durable-review-session", file: "tools/image_review_session_mcp.mjs", tokens: ["evavo.image-review-session.v1", "sourceSha256AndLengthBound: true", "comparisonSha256AndLengthBound: true", "staleEvidenceVerification: true", "createOnlyReceiptWrite: true", "publicationAllowed: false"] }),
  Object.freeze({ id: "review-mcp-profile-policy", file: "tools/existing_image_review_mcp.mjs", tokens: ["profileTransparentRgbMode", "strictWholeCanvasTransparentRgbProfiles", "rollbackSafeReviewOutputBundle: true", 'SERVER_VERSION = "1.2.0"'] }),
  Object.freeze({ id: "defect-mcp-source-bound", file: "tools/existing_image_defect_detection_mcp.mjs", tokens: ["sourceSha256AndLengthBound: true", "maskSha256AndLengthBound: true", "overlaySha256AndLengthBound: true", "writeCreateOnlyBundle", 'SERVER_VERSION = "1.3.0"'] }),
  Object.freeze({ id: "finishing-plan-mcp", file: "tools/existing_image_finishing_plan_mcp.mjs", tokens: ["exactSourceMaskOverlayBindingRequired: true", "staleDefectEvidenceRejected: true", "smallestPreservationFirstOperationPreferred: true", "automaticRepairAllowed: false", "evavo_verify_existing_image_finishing_plan"] }),
  Object.freeze({ id: "inspection-mcp-regions", file: "tools/existing_image_inspection_mcp.mjs", tokens: ["connectedChangeRegionSegmentation: true", "rollbackSafeCreateOnlyProofWrite: true", 'SERVER_VERSION = "1.1.0"'] }),
  Object.freeze({ id: "edit-mask-no-private-sharp", file: "tools/existing_image_edit_mask_mcp.mjs", tokens: ["readRasterImageDimensions", "fragilePackageNodeModulesImportRemoved: true", "writeCreateOnlyBundle"] }),
  Object.freeze({ id: "page-review-atomic", file: "tools/work_header_page_render_review_mcp.mjs", tokens: ["rollbackSafePageReviewEvidenceBundle: true", "rollbackSafeApprovalReceiptWrite: true", "writeCreateOnlyBundle"] }),
  Object.freeze({ id: "mcp-registration", file: ".mcp.json", tokens: ["evavo-image-review-orchestrator-v1", "evavo-image-review-session-v1", "evavo-image-quality-pipeline-doctor-v1", "evavo-existing-image-review-v1", "evavo-existing-image-defect-detection-v1", "evavo-existing-image-finishing-plan-v1"] }),
]);

async function inspect() {
  const checks = [];
  for (const check of CHECKS) {
    const target = path.join(repoRoot, check.file);
    try {
      const source = await readFile(target, "utf8");
      const missing = check.tokens.filter((token) => !source.includes(token));
      checks.push({ id: check.id, file: check.file, ok: missing.length === 0, missing });
    } catch (error) {
      checks.push({ id: check.id, file: check.file, ok: false, missing: ["file-unreadable"], error: error instanceof Error ? error.message : String(error) });
    }
  }
  const blockers = checks.filter((check) => !check.ok).map((check) => check.id);
  return Object.freeze({
    contract: "evavo.image-quality-pipeline-doctor.v1_3",
    ready: blockers.length === 0,
    blockerCount: blockers.length,
    blockers,
    checks,
    executionPerformed: false,
    sourceMutationPerformed: false,
    publicationAllowed: false,
    nextAction: blockers.length
      ? "Repair the failing contract surfaces before relying on automated image review/finishing planning."
      : "Static quality and preservation-planning contracts are aligned; runtime tests and mandatory visual confirmation remain separate requirements.",
  });
}

const tools = Object.freeze([
  Object.freeze({ name: "evavo_image_quality_pipeline_doctor_capabilities", description: "Describe the read-only static doctor for EVAVO image review, defect, evidence and preservation-finishing tooling.", inputSchema: { type: "object", properties: {}, additionalProperties: false } }),
  Object.freeze({ name: "evavo_run_image_quality_pipeline_doctor", description: "Inspect alpha-aware QA, artifact signals, exact-byte-bound defect evidence, durable review sessions, preservation-first finishing plans and rollback-safe outputs. Read-only; does not execute image processing.", inputSchema: { type: "object", properties: {}, additionalProperties: false } }),
]);
function capabilities() {
  return Object.freeze({ contract: "evavo.image-quality-pipeline-doctor.v1_3", serverVersion: SERVER_VERSION, readOnly: true, sourceMutationPerformed: false, runtimeExecutionPerformed: false, publicationAllowed: false, checkCount: CHECKS.length });
}
async function callTool(name) {
  if (name === "evavo_image_quality_pipeline_doctor_capabilities") return capabilities();
  if (name === "evavo_run_image_quality_pipeline_doctor") return inspect();
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}
const response = (id, result) => ({ jsonrpc: "2.0", id, result });
const toolResult = (payload, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError });
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  try {
    const message = JSON.parse(line);
    let outgoing;
    if (message.method === "initialize") outgoing = response(message.id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } });
    else if (message.method === "notifications/initialized") outgoing = null;
    else if (message.method === "tools/list") outgoing = response(message.id, { tools });
    else if (message.method === "tools/call") { try { outgoing = response(message.id, toolResult(await callTool(message.params?.name))); } catch (error) { outgoing = response(message.id, toolResult({ ok: false, message: error instanceof Error ? error.message : String(error) }, true)); } }
    else outgoing = response(message.id, toolResult({ ok: false, message: `Unsupported method ${JSON.stringify(message.method)}.` }, true));
    if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`);
  } catch (error) { process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: String(error) }, true)))}\n`); }
}
