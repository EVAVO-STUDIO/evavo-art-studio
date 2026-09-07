import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(name, import.meta.url), "utf8");

test("live publication page postflight admission is exact-byte, runtime-quality and rollback gated", async () => {
  const source = await read("./work_header_publication_page_postflight_admission_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.0.0"',
    'evavo.work-header-publication-page-postflight-admission.v1',
    '7f7a2116736c69f92458e07811fd688815d3b5d61423867adcd032df2e205d24',
    'evavo.work-header-publication-postflight.v1',
    'evavo.work-header-publication-page-postflight.v1',
    "livePageMatchesReviewedCandidate !== true",
    "responsiveBrowserBytesStable !== true",
    "runtimeMediaAndLayoutVerified !== true",
    "exactPageLoadRequestBound !== true",
    "rollbackBackupStillReady",
    "browserLoadedCandidateBytesVerifiedAcrossProfiles",
    "evavo_admit_work_header_publication_page_postflight",
    "evavo_verify_work_header_publication_page_postflight_admission",
    "deterministicCreateOnlyReceipt: true",
    "evidenceOnly: true",
    "publicationAllowed: false",
    "cloudOverwriteAllowed: false",
    "websiteMutationAllowed: false",
  ]) assert.ok(source.includes(token), `missing page-postflight admission token: ${token}`);
});

test("page postflight admission schema remains fail closed", async () => {
  const schema = await read("../contracts/work-header-publication-page-postflight-admission-v1.schema.json");
  for (const token of [
    '"$id": "evavo.work-header-publication-page-postflight-admission.v1"',
    '"additionalProperties": false',
    '"admissionState": { "const": "live-page-verified-rollback-ready" }',
    '"browserLoadedCandidateBytesVerifiedAcrossProfiles": { "const": true }',
    '"runtimeMediaAndLayoutVerified": { "const": true }',
    '"rollbackBackupStillReady": { "const": true }',
    '"publicationAllowed": { "const": false }',
    '"cloudOverwriteAllowed": { "const": false }',
    '"websiteMutationAllowed": { "const": false }',
  ]) assert.ok(schema.includes(token), `missing fail-closed schema token: ${token}`);
});
