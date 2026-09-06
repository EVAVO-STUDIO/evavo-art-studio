import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(name, import.meta.url), "utf8");

test("preview admission writes durable rollback-safe source-bound receipt", async () => {
  const source = await read("./work_header_preview_admission_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.3.0"',
    'contract: "evavo.work-header-preview-admission.v1"',
    "writeCreateOnlyBundle",
    "rollbackSafeReceiptWrite: true",
    "manifestSha256AndLengthBound: true",
    "screenshotBindings",
    "atomicPreviewEvidenceBundleVerified: true",
    'approvalState: "unapproved"',
    "publicationAllowed: false",
    "cloudOverwriteAllowed: false",
    "websiteMutationAllowed: false",
  ]) assert.ok(source.includes(token), `missing preview-admission token: ${token}`);
});

test("preview admission has read-only stale-evidence reverification", async () => {
  const source = await read("./work_header_preview_admission_mcp.mjs");
  for (const token of [
    "evavo_verify_work_header_preview_admission",
    "previewAdmissionReverificationAvailable: true",
    "staleManifestOrScreenshotEvidenceRejected: true",
    "admissionRecomputedDuringReverification: true",
    "Preview manifest bytes changed after Art Studio admission.",
    "screenshot bytes changed after preview capture.",
    "atomicEvidenceBundleVerified",
  ]) assert.ok(source.includes(token), `missing preview reverification token: ${token}`);
});

test("page render accepts screenshots only through a reverified preview admission receipt", async () => {
  const source = await read("./work_header_page_render_review_mcp.mjs");
  for (const token of [
    "previewAdmissionReceiptPath",
    "verifyPreviewAdmissionReceipt",
    "previewAdmissionReceiptRequiredForPageRenderReview: true",
    "previewAdmissionReceiptReverifiedBeforePageReview: true",
    "previewAdmissionReceiptReverifiedBeforeApprovalPacket: true",
    "rawCallerScreenshotPathsAccepted: false",
  ]) assert.ok(source.includes(token), `missing page-render lineage token: ${token}`);
  assert.ok(!source.includes('required: ["selectionReceiptPath", "candidateImagePath", "pageSlug", "pageTitle", "currentDesktopPath"'), "raw caller screenshot path schema unexpectedly returned");
});

test("page-render proof/receipt and approval receipt use rollback-safe create-only writes", async () => {
  const source = await read("./work_header_page_render_review_mcp.mjs");
  for (const token of [
    "writeCreateOnlyBundle",
    "rollbackSafePageReviewEvidenceBundle: true",
    "rollbackSafeApprovalReceiptWrite: true",
    "{ path: proofPath, data: result.proofPng }",
  ]) assert.ok(source.includes(token), `missing atomic evidence-write token: ${token}`);
  assert.ok(!source.includes("await writeFile(proofPath"), "sequential proof write unexpectedly returned");
  assert.ok(!source.includes("await writeFile(receiptPath"), "sequential receipt write unexpectedly returned");
});
