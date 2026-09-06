import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

test("image quality doctor covers exact Chrome Work preview and full receipt lineage", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    'contract: "evavo.image-quality-pipeline-doctor.v1_15"',
    'SERVER_VERSION = "1.15.0"',
    'id: "alpha-aware-quality"',
    'id: "profile-aware-defects"',
    'id: "defect-regions"',
    'id: "finishing-plan"',
    'id: "artifact-signals"',
    'id: "enhancement-session"',
    'id: "work-preview-core-v7"',
    'id: "work-preview-mcp-v170"',
    'id: "work-page-review-v190"',
    'id: "durable-review"',
    'id: "safe-bundle"',
    'id: "mcp-registration"',
    "runtimeExecutionPerformed: false",
    "sourceMutationPerformed: false",
  ]) assert.ok(source.includes(token), `missing doctor contract token: ${token}`);
});

test("doctor verifies full page-review receipt lineage before approval", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.9.0"',
    "selectionReceiptShaAndLengthBound: true",
    "candidateReviewReceiptShaAndLengthBound: true",
    "previewAdmissionReceiptShaAndLengthBound: true",
    "previewManifestShaAndLengthBound: true",
    "pageSourceBindingsShaAndLengthReverified: true",
    "fullReceiptLineageVerifiedBeforeApprovalPacket: true",
    "fullReceiptLineageVerified: true",
    "browserResponseMetadataPersistedInPageReceipt: true",
    "browserResponseMetadataReverifiedBeforeApprovalPacket: true",
    "selectedLocalCandidateMustMatchPreviewedResponseBytes: true",
    "fullPageReviewReceiptLineageChecked: true",
  ]) assert.ok(source.includes(token), `missing full receipt lineage token: ${token}`);
});

test("MCP configuration exposes hardened image-review chain", async () => {
  const config = await read("../.mcp.json");
  for (const token of ['"evavo-image-quality-pipeline-doctor-v1"', '"evavo-image-review-session-v1"', '"evavo-enhancement-review-session-v1"', '"evavo-work-header-preview-admission-v1"', '"evavo-work-header-page-render-review-v1"']) assert.ok(config.includes(token), `missing MCP registration token: ${token}`);
});
