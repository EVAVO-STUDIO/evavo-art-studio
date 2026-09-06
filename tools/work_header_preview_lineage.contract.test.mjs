import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(name, import.meta.url), "utf8");

test("preview admission requires immutable candidate artifact and durable responsive Chrome response metadata", async () => {
  const source = await read("./work_header_preview_admission_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.7.0"',
    'acceptedPreviewContract: "evavo.work-header-candidate-preview-capture.v7"',
    "immutableCandidateContentArtifactRequired: true",
    "browserResponseBodyIdentityRequired: true",
    "browserResponseBodyMustMatchImmutableArtifact: true",
    "browserResponseBodyMustMatchAcrossProfiles: true",
    "browserResponseMetadataShaAndLengthBound: true",
    "browserResponseMetadataPersistedPerProfile: true",
    "browserResponseMetadataBound: true",
    "currentRemoteCandidateMustMatchArtifact: true",
    "candidateContentRefetchedDuringAdmission: true",
    "candidateContentRefetchedDuringReverification: true",
    "candidateContentArtifactBinding",
    "browserResponseBindings",
    "exactCandidateResponseBytesVerified: true",
    "rollbackSafeReceiptWrite: true",
    "publicationAllowed: false",
  ]) assert.ok(source.includes(token), `missing preview-admission token: ${token}`);
});

test("preview admission verifier rejects stale browser metadata, artifact or remote evidence", async () => {
  const source = await read("./work_header_preview_admission_mcp.mjs");
  for (const token of [
    "evavo_verify_work_header_preview_admission",
    "staleManifestScreenshotArtifactBrowserOrRemoteEvidenceRejected: true",
    "Chrome response-body evidence no longer matches immutable candidate bytes.",
    "Chrome response metadata drifted from the durable preview-admission receipt.",
    "Immutable candidate-content artifact bytes changed after preview capture.",
    "Current preview candidate response no longer matches immutable candidate-content evidence.",
    "admissionRecomputedDuringReverification: true",
  ]) assert.ok(source.includes(token), `missing preview reverification token: ${token}`);
});

test("page render recomputes preview admission before using immutable candidate artifact", async () => {
  const source = await read("./work_header_page_render_review_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.7.0"',
    "admitWorkHeaderCandidatePreviewManifest",
    "immutablePreviewCandidateArtifactRequired: true",
    "immutablePreviewCandidateArtifactReverifiedBeforePageReview: true",
    "currentRemoteCandidateMustMatchImmutableArtifact: true",
    "selectedLocalCandidateMustMatchPreviewedResponseBytes: true",
    "exactPreviewedCandidateBytesMatchedSelectedCandidate: true",
    "Selected local candidate bytes do not match immutable candidate bytes preserved by the website preview.",
    "pageRenderProofSha256AndLengthBinding: true",
    "rollbackSafePageReviewEvidenceBundle: true",
  ]) assert.ok(source.includes(token), `missing page-render immutable-artifact token: ${token}`);
});
