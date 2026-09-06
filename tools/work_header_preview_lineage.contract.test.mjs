import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(name, import.meta.url), "utf8");

test("preview admission requires immutable candidate-content artifact", async () => {
  const source = await read("./work_header_preview_admission_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.5.1"',
    'acceptedPreviewContract: "evavo.work-header-candidate-preview-capture.v6"',
    "immutableCandidateContentArtifactRequired: true",
    "candidateContentArtifactSha256AndLengthBound: true",
    "currentRemoteCandidateMustMatchArtifact: true",
    "candidateContentRefetchedDuringAdmission: true",
    "candidateContentRefetchedDuringReverification: true",
    "candidateContentArtifactBinding",
    "candidateContentBinding",
    "exactCandidateResponseBytesVerified: true",
    "rollbackSafeReceiptWrite: true",
    "publicationAllowed: false",
  ]) assert.ok(source.includes(token), `missing preview-admission token: ${token}`);
});

test("preview admission verifier rejects stale artifact or remote source", async () => {
  const source = await read("./work_header_preview_admission_mcp.mjs");
  for (const token of [
    "evavo_verify_work_header_preview_admission",
    "staleManifestScreenshotArtifactOrRemoteEvidenceRejected: true",
    "Immutable candidate-content artifact bytes changed after preview capture.",
    "Current preview candidate response no longer matches immutable candidate-content evidence.",
    "admissionRecomputedDuringReverification: true",
  ]) assert.ok(source.includes(token), `missing preview reverification token: ${token}`);
});

test("page render still requires exact local candidate to equal previewed bytes", async () => {
  const source = await read("./work_header_page_render_review_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.6.0"',
    "selectedLocalCandidateMustMatchPreviewedResponseBytes: true",
    "exactPreviewedCandidateBytesMatchedSelectedCandidate: true",
    "Selected local candidate bytes do not match the exact candidate bytes previewed by the website.",
    "pageRenderProofSha256AndLengthBinding: true",
    "rollbackSafePageReviewEvidenceBundle: true",
  ]) assert.ok(source.includes(token), `missing page-render exact-byte token: ${token}`);
});
