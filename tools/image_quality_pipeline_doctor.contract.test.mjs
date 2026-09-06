import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

test("image quality doctor covers the preservation and review chain", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    'contract: "evavo.image-quality-pipeline-doctor.v1_2"',
    'SERVER_VERSION = "1.2.0"',
    'id: "alpha-aware-quality"',
    'id: "profile-aware-defects"',
    'id: "defect-regions"',
    'id: "artifact-signals"',
    'id: "unified-orchestrator"',
    'id: "durable-review-session"',
    'id: "review-mcp-profile-policy"',
    'id: "safe-output-bundle"',
    'id: "edit-mask-no-private-sharp"',
    'id: "page-review-atomic"',
    'id: "mcp-registration"',
    "runtimeExecutionPerformed: false",
    "sourceMutationPerformed: false",
  ]) assert.ok(source.includes(token), `missing doctor contract token: ${token}`);
});

test("MCP configuration exposes the quality doctor and durable review session", async () => {
  const config = await read("../.mcp.json");
  assert.ok(config.includes('"evavo-image-quality-pipeline-doctor-v1"'));
  assert.ok(config.includes('"tools/image_quality_pipeline_doctor_mcp.mjs"'));
  assert.ok(config.includes('"evavo-image-review-session-v1"'));
  assert.ok(config.includes('"tools/image_review_session_mcp.mjs"'));
});

test("doctor verifies profile-aware existing-image review output safety", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    "profileTransparentRgbMode",
    "strictWholeCanvasTransparentRgbProfiles",
    "rollbackSafeReviewOutputBundle: true",
  ]) assert.ok(source.includes(token), `missing existing-image-review doctor token: ${token}`);
});

test("doctor verifies phase-aware upscale evidence and immutable review receipts", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    "horizontalPhaseSeparation",
    "verticalPhaseSeparation",
    "sourceSha256AndLengthBound: true",
    "comparisonSha256AndLengthBound: true",
    "staleEvidenceVerification: true",
  ]) assert.ok(source.includes(token), `missing resilient review token: ${token}`);
});
