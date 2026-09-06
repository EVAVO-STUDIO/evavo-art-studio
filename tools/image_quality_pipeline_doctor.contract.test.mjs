import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

test("image quality doctor covers the preservation and review chain", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    'contract: "evavo.image-quality-pipeline-doctor.v1_1"',
    'SERVER_VERSION = "1.1.0"',
    'id: "alpha-aware-quality"',
    'id: "profile-aware-defects"',
    'id: "defect-regions"',
    'id: "artifact-signals"',
    'id: "unified-orchestrator"',
    'id: "review-mcp-profile-policy"',
    'id: "safe-output-bundle"',
    'id: "edit-mask-no-private-sharp"',
    'id: "page-review-atomic"',
    "runtimeExecutionPerformed: false",
    "sourceMutationPerformed: false",
  ]) assert.ok(source.includes(token), `missing doctor contract token: ${token}`);
});

test("MCP configuration exposes the image quality doctor", async () => {
  const config = await read("../.mcp.json");
  assert.ok(config.includes('"evavo-image-quality-pipeline-doctor-v1"'));
  assert.ok(config.includes('"tools/image_quality_pipeline_doctor_mcp.mjs"'));
});

test("doctor verifies profile-aware existing-image review output safety", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    "profileTransparentRgbMode",
    "strictWholeCanvasTransparentRgbProfiles",
    "rollbackSafeReviewOutputBundle: true",
    'SERVER_VERSION = "1.2.0"',
  ]) assert.ok(source.includes(token), `missing existing-image-review doctor token: ${token}`);
});
