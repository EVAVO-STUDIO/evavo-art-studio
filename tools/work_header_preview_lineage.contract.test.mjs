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
    "browserResponseMetadataShaAndLengthBound: true",
    "browserResponseMetadataPersistedPerProfile: true",
    "browserResponseMetadataBound: true",
    "evavo_verify_work_header_preview_admission",
    "publicationAllowed: false",
  ]) assert.ok(source.includes(token), `missing preview-admission token: ${token}`);
});

test("page render binds full receipt and source lineage before approval", async () => {
  const source = await read("./work_header_page_render_review_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "2.0.0"',
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
    "browserResponseBindings",
    "fullReceiptLineageVerified: true",
    "selectedLocalCandidateMustMatchPreviewedResponseBytes: true",
    "publicationAllowed: false",
    "cloudOverwriteAllowed: false",
    "websiteMutationAllowed: false",
  ]) assert.ok(source.includes(token), `missing page-render full-lineage token: ${token}`);
});

test("approval packet has a read-only full-lineage verifier", async () => {
  const source = await read("./work_header_page_render_review_mcp.mjs");
  for (const token of [
    "evavo_verify_work_header_approval_packet",
    "verifyApprovalPacketReceipt",
    "approvalPacketReverificationAvailable: true",
    "approvalPacketCoreRecomputedDuringVerification: true",
    "staleApprovalPacketLineageRejected: true",
    "Approval packet is bound to a different page-render receipt version.",
    "Approval packet selection receipt lineage is stale.",
    "Approval packet candidate-review lineage is stale.",
    "Approval packet preview-admission lineage is stale.",
    "Approval packet immutable candidate lineage is stale.",
    "approval packet Chrome response metadata drifted from the fully verified page-render lineage.",
    "Approval packet core evidence drifted for",
    "approvalPacketRecomputedAndMatched: true",
    "fullReceiptLineageVerified: true",
    'approvalState: "unapproved"',
    "publicationAllowed: false",
    "cloudOverwriteAllowed: false",
    "websiteMutationAllowed: false",
  ]) assert.ok(source.includes(token), `missing approval reverification token: ${token}`);
});
