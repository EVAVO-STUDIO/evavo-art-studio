import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(name, import.meta.url), "utf8");

test("preview admission writes exact-candidate-byte rollback-safe receipt", async () => {
  const source = await read("./work_header_preview_admission_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.4.0"',
    'acceptedPreviewContract: "evavo.work-header-candidate-preview-capture.v5"',
    'contract: "evavo.work-header-preview-admission.v1"',
    "writeCreateOnlyBundle",
    "rollbackSafeReceiptWrite: true",
    "manifestSha256AndLengthBound: true",
    "candidateContentBinding",
    "candidateContentSha256AndLengthBound: true",
    "candidateContentRefetchedDuringAdmission: true",
    "exactCandidateResponseBytesVerified: true",
    'approvalState: "unapproved"',
    "publicationAllowed: false",
    "cloudOverwriteAllowed: false",
    "websiteMutationAllowed: false",
  ]) assert.ok(source.includes(token), `missing preview-admission token: ${token}`);
});

test("preview admission reverifies remote candidate bytes as well as manifest/screenshots", async () => {
  const source = await read("./work_header_preview_admission_mcp.mjs");
  for (const token of [
    "evavo_verify_work_header_preview_admission",
    "previewAdmissionReverificationAvailable: true",
    "candidateContentRefetchedDuringReverification: true",
    "staleManifestScreenshotOrCandidateEvidenceRejected: true",
    "Preview candidate response bytes changed after Art Studio admission.",
    "admissionRecomputedDuringReverification: true",
    "candidateContentBytesVerified",
  ]) assert.ok(source.includes(token), `missing preview reverification token: ${token}`);
});

test("page render requires exact local candidate to equal previewed response bytes", async () => {
  const source = await read("./work_header_page_render_review_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.6.0"',
    "previewAdmissionReceiptPath",
    "verifyPreviewAdmissionReceipt",
    "exactPreviewedCandidateResponseSha256AndLengthRequired: true",
    "selectedLocalCandidateMustMatchPreviewedResponseBytes: true",
    "previewCandidateResponseRefetchedBeforePageReview: true",
    "exactPreviewedCandidateBytesMatchedSelectedCandidate: true",
    "Selected local candidate bytes do not match the exact candidate bytes previewed by the website.",
    "previewedCandidateResponse",
    "rawCallerScreenshotPathsAccepted: false",
  ]) assert.ok(source.includes(token), `missing page-render exact-byte token: ${token}`);
});

test("page-render proof and responsive source bindings include byte lengths", async () => {
  const source = await read("./work_header_page_render_review_mcp.mjs");
  for (const token of [
    "proofByteLength",
    "previewManifestByteLength",
    "previewAdmissionReceiptByteLength",
    "screenshotSha256AndLengthBinding: true",
    "pageRenderProofSha256AndLengthBinding: true",
  ]) assert.ok(source.includes(token), `missing page-render byte-length token: ${token}`);
});

test("page-render proof/receipt and approval receipt use rollback-safe create-only writes", async () => {
  const source = await read("./work_header_page_render_review_mcp.mjs");
  for (const token of [
    "writeCreateOnlyBundle",
    "rollbackSafePageReviewEvidenceBundle: true",
    "rollbackSafeApprovalReceiptWrite: true",
    "{ path: proofPath, data: result.proofPng }",
  ]) assert.ok(source.includes(token), `missing atomic evidence-write token: ${token}`);
});
