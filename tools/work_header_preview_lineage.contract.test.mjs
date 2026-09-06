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

test("page render binds full receipt and source lineage before approval", async () => {
  const source = await read("./work_header_page_render_review_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.9.0"',
    "selectionReceiptShaAndLengthBound: true",
    "candidateReviewReceiptShaAndLengthBound: true",
    "previewAdmissionReceiptShaAndLengthBound: true",
    "previewManifestShaAndLengthBound: true",
    "pageSourceBindingsShaAndLengthReverified: true",
    "fullReceiptLineageVerifiedBeforeApprovalPacket: true",
    "selectionReceiptByteLength",
    "candidateReviewReceiptByteLength",
    "previewAdmissionReceiptByteLength",
    "previewManifestByteLength",
    "candidateReviewProofSha256",
    "browserResponseBindings",
    "fullReceiptLineageBound: true",
    "fullReceiptLineageVerified: true",
    "Page-render receipt is bound to a different preview-admission receipt version.",
    "Page-render receipt preview-manifest lineage is stale.",
    "Page-render review is bound to a different selection receipt version.",
    "Page-render candidate-review lineage is stale.",
    "binding drifted from admitted preview evidence.",
    "Approval packet selection input does not match the fully verified page-render lineage.",
    "selectedLocalCandidateMustMatchPreviewedResponseBytes: true",
    "pageRenderProofSha256AndLengthBinding: true",
    "rollbackSafePageReviewEvidenceBundle: true",
    "rollbackSafeApprovalReceiptWrite: true",
    "publicationAllowed: false",
    "cloudOverwriteAllowed: false",
    "websiteMutationAllowed: false",
  ]) assert.ok(source.includes(token), `missing page-render full-lineage token: ${token}`);
});
