import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(name, import.meta.url), "utf8");

test("publication postflight is schema-bound, target-aware, evidence-only and rollback-ready", async () => {
  const source = await read("./work_header_publication_postflight_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.1.0"',
    'CONTRACT = "evavo.work-header-publication-postflight.v1"',
    'SCHEMA_SHA256 = "69b9a40178e78892c330e6f2b5bca33b3be8413ef81ef404c1dd9edad9d24ff2"',
    'EXECUTION_RESULT_CONTRACT = "evavo.work-header-publication-execution-result.v1"',
    'ROLLBACK_READINESS_CONTRACT = "evavo.work-header-publication-rollback-readiness.v1"',
    'import { recheckPublicationTarget } from "./lib/publication_target_recheck.mjs"',
    'postflightState: "published-verified-rollback-ready"',
    "executionResultReverified: true",
    "rollbackReadinessReverified: true",
    "targetAwareLiveRecheckVerified: true",
    "liveTargetMatchesReviewedCandidate: true",
    "cloudinaryLiveRemoteRecheckRequiredWhenApplicable: true",
    "rollbackBackupStillReady: true",
    "postflightEvidenceOnly: true",
    "deterministicCreateOnlyReceipt: true",
    "targetAwareLiveRecheckRequired: true",
    "websiteSourceUsesGovernedLocalRecheck: true",
    "cloudinaryUsesLiveRemoteRecheck: true",
    "cloudinaryUnversionedStableDeliveryUrlRequired: true",
    "cloudinaryCallerLocalRecheckRejected: true",
    "currentLiveTargetMustExactlyMatchReviewedCandidate: true",
    "rollbackBackupMustRemainReady: true",
    "publicationAllowed: false",
    "cloudOverwriteAllowed: false",
    "websiteMutationAllowed: false",
    "evavo_prepare_work_header_publication_postflight",
    "evavo_verify_work_header_publication_postflight",
  ]) assert.ok(source.includes(token), `missing publication-postflight token: ${token}`);
});

test("postflight reverification repeats the target-aware live check", async () => {
  const source = await read("./work_header_publication_postflight_mcp.mjs");
  for (const token of [
    "liveTargetRecheckMode",
    "liveTargetReference",
    "liveTargetFinalUrl",
    'liveTargetRecheckMode === "live-remote-cloudinary"',
    "Publication-postflight target-aware live binding drifted.",
    "Publication-postflight live target final URL drifted.",
    "Current published target no longer exactly matches the reviewed candidate bytes.",
  ]) assert.ok(source.includes(token), `missing target-aware reverification token: ${token}`);
});

test("postflight schema remains fail closed around target-aware provenance", async () => {
  const schema = JSON.parse(await read("../contracts/work-header-publication-postflight-v1.schema.json"));
  assert.equal(schema.$id, "evavo.work-header-publication-postflight.v1");
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.postflightState.const, "published-verified-rollback-ready");
  assert.deepEqual(schema.properties.liveTargetRecheckMode.enum, ["governed-local-website-source", "live-remote-cloudinary"]);
  for (const field of ["targetAwareLiveRecheckVerified", "liveTargetMatchesReviewedCandidate", "cloudinaryLiveRemoteRecheckRequiredWhenApplicable", "rollbackBackupStillReady", "postflightEvidenceOnly"]) {
    assert.equal(schema.properties[field].const, true, `${field} must remain true`);
  }
  for (const field of ["publicationAllowed", "cloudOverwriteAllowed", "websiteMutationAllowed"]) {
    assert.equal(schema.properties[field].const, false, `${field} must remain false`);
  }
});

test("supplemental MCP config exposes postflight verification without execution authority", async () => {
  const config = await read("../.mcp.work-header-publication-postflight-v1.json");
  assert.ok(config.includes('"evavo-work-header-publication-postflight-v1"'));
  assert.ok(config.includes('"tools/work_header_publication_postflight_mcp.mjs"'));
});
