import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

test("image quality doctor covers immutable Work preview candidate artifact lineage", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    'contract: "evavo.image-quality-pipeline-doctor.v1_11"',
    'SERVER_VERSION = "1.11.0"',
    'id: "alpha-aware-quality"',
    'id: "profile-aware-defects"',
    'id: "defect-regions"',
    'id: "finishing-plan"',
    'id: "artifact-signals"',
    'id: "enhancement-session"',
    'id: "work-preview-core-v6"',
    'id: "work-preview-mcp-v151"',
    'id: "work-page-review-exact-bytes"',
    'id: "durable-review"',
    'id: "safe-bundle"',
    'id: "mcp-registration"',
    "runtimeExecutionPerformed: false",
    "sourceMutationPerformed: false",
  ]) assert.ok(source.includes(token), `missing doctor contract token: ${token}`);
});

test("doctor verifies immutable candidate artifact plus current remote check", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    "evavo.work-header-candidate-preview-capture.v6",
    "candidateContentArtifact",
    "immutableCandidateContentArtifactVerified",
    "candidateContentArtifactPath",
    'SERVER_VERSION = "1.5.1"',
    "immutableCandidateContentArtifactRequired: true",
    "candidateContentArtifactSha256AndLengthBound: true",
    "currentRemoteCandidateMustMatchArtifact: true",
    "candidateContentRefetchedDuringReverification: true",
    "evavo_verify_work_header_preview_admission",
    "selectedLocalCandidateMustMatchPreviewedResponseBytes: true",
  ]) assert.ok(source.includes(token), `missing immutable preview token: ${token}`);
});

test("MCP configuration exposes hardened image-review chain", async () => {
  const config = await read("../.mcp.json");
  for (const token of ['"evavo-image-quality-pipeline-doctor-v1"', '"evavo-image-review-session-v1"', '"evavo-enhancement-review-session-v1"', '"evavo-work-header-preview-admission-v1"', '"evavo-work-header-page-render-review-v1"']) assert.ok(config.includes(token), `missing MCP registration token: ${token}`);
});
