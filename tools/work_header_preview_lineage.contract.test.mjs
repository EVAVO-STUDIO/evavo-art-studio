import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(name, import.meta.url), "utf8");

test("preview admission requires exact triggered Chrome request and responsive response metadata", async () => {
  const source = await read("./work_header_preview_admission_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.8.0"',
    'acceptedPreviewContract: "evavo.work-header-candidate-preview-capture.v8"',
    "immutableCandidateContentArtifactRequired: true",
    "exactTriggeredBrowserRequestBindingRequired: true",
    'exactTriggeredBrowserRequestMethod: "GET"',
    "browserResponseMetadataShaAndLengthBound: true",
    "browserResponseMetadataPersistedPerProfile: true",
    "exactTriggeredBrowserRequestBindingVerified: true",
    "evavo_verify_work_header_preview_admission",
    "publicationAllowed: false",
  ]) assert.ok(source.includes(token), `missing preview-admission token: ${token}`);
});

test("page render persists normalized review inputs and recomputes evidence plus proof before approval", async () => {
  const source = await read("./work_header_page_render_review_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "2.2.0"',
    "normalizedPageReviewInputsPersisted: true",
    "pageReviewEvidenceRecomputedDuringVerification: true",
    "pageReviewProofRecomputedDuringVerification: true",
    "tamperedPageReviewScoresFlagsOrNotesRejected: true",
    "normalizedReviewInputsPersisted: true",
    "pageReviewSpecFromEvidence",
    "Page-render evidence changed after review or no longer recomputes from persisted normalized review inputs.",
    "Page-render proof no longer recomputes from exact screenshots and normalized review inputs.",
    "pageReviewEvidenceRecomputedAndMatched: true",
    "pageReviewProofRecomputedAndMatched: true",
    "selectionReceiptShaAndLengthBound: true",
    "candidateReviewReceiptShaAndLengthBound: true",
    "previewAdmissionReceiptShaAndLengthBound: true",
    "previewManifestShaAndLengthBound: true",
    "pageSourceBindingsShaAndLengthReverified: true",
    "fullReceiptLineageVerifiedBeforeApprovalPacket: true",
    "selectedLocalCandidateMustMatchPreviewedResponseBytes: true",
    "publicationAllowed: false",
    "cloudOverwriteAllowed: false",
    "websiteMutationAllowed: false",
  ]) assert.ok(source.includes(token), `missing deterministic page-review token: ${token}`);
});

test("approval packet requires deterministic page-review recomputation and has a read-only full-lineage verifier", async () => {
  const source = await read("./work_header_page_render_review_mcp.mjs");
  for (const token of [
    "evavo_verify_work_header_approval_packet",
    "verifyApprovalPacketReceipt",
    "approvalPacketReverificationAvailable: true",
    "approvalPacketCoreRecomputedDuringVerification: true",
    "staleApprovalPacketLineageRejected: true",
    "pageReviewEvidenceRecomputedAndMatched !== true",
    "pageReviewProofRecomputedAndMatched !== true",
    "Approval packet is bound to a stale or non-recomputable page-render receipt.",
    "Approval packet selection receipt lineage is stale.",
    "Approval packet candidate-review lineage is stale.",
    "Approval packet preview-admission lineage is stale.",
    "Approval packet immutable candidate lineage is stale.",
    "approval packet Chrome request/response metadata drifted from the fully verified page-render lineage.",
    "Approval packet core evidence drifted for",
    "approvalPacketRecomputedAndMatched: true",
    "fullReceiptLineageVerified: true",
    'approvalState: "unapproved"',
    "publicationAllowed: false",
    "cloudOverwriteAllowed: false",
    "websiteMutationAllowed: false",
  ]) assert.ok(source.includes(token), `missing approval reverification token: ${token}`);
});
