import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

test("image quality doctor covers fail-closed page review and approval-packet reverification", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    'contract: "evavo.image-quality-pipeline-doctor.v1_17"',
    'SERVER_VERSION = "1.17.0"',
    'id: "alpha-aware-quality"',
    'id: "profile-aware-defects"',
    'id: "defect-regions"',
    'id: "finishing-plan"',
    'id: "artifact-signals"',
    'id: "enhancement-session"',
    'id: "work-preview-core-v7"',
    'id: "work-preview-mcp-v170"',
    'id: "work-page-review-input-safety"',
    'id: "work-page-review-v200"',
    'id: "durable-review"',
    'id: "safe-bundle"',
    'id: "mcp-registration"',
    "runtimeExecutionPerformed: false",
    "sourceMutationPerformed: false",
  ]) assert.ok(source.includes(token), `missing doctor contract token: ${token}`);
});

test("doctor requires bounded literal Work page review inputs", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    "MAX_SCREENSHOT_BYTES",
    "MAX_NOTES = 24",
    "MAX_NOTE_CHARACTERS = 500",
    "MAX_NOTES_CHARACTERS = 4_000",
    "pageSlug must be a canonical Work detail route under /work/.",
    "must be boolean.",
    "notes exceed the",
    "pageReviewInputSafetyChecked: true",
  ]) assert.ok(source.includes(token), `missing page-input safety token: ${token}`);
});

test("doctor requires read-only approval packet verification and recomputation", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "2.0.0"',
    "selectionReceiptShaAndLengthBound: true",
    "candidateReviewReceiptShaAndLengthBound: true",
    "previewAdmissionReceiptShaAndLengthBound: true",
    "previewManifestShaAndLengthBound: true",
    "pageSourceBindingsShaAndLengthReverified: true",
    "fullReceiptLineageVerifiedBeforeApprovalPacket: true",
    "approvalPacketReverificationAvailable: true",
    "approvalPacketCoreRecomputedDuringVerification: true",
    "staleApprovalPacketLineageRejected: true",
    "evavo_verify_work_header_approval_packet",
    "approvalPacketRecomputedAndMatched: true",
    "approvalPacketReverificationChecked: true",
  ]) assert.ok(source.includes(token), `missing approval verification token: ${token}`);
});

test("MCP configuration exposes hardened image-review chain", async () => {
  const config = await read("../.mcp.json");
  for (const token of ['"evavo-image-quality-pipeline-doctor-v1"', '"evavo-image-review-session-v1"', '"evavo-enhancement-review-session-v1"', '"evavo-work-header-preview-admission-v1"', '"evavo-work-header-page-render-review-v1"']) assert.ok(config.includes(token), `missing MCP registration token: ${token}`);
});
