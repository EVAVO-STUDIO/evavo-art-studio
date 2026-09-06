import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(name, import.meta.url), "utf8");

test("preview admission writes durable rollback-safe source-bound receipt", async () => {
  const source = await read("./work_header_preview_admission_mcp.mjs");
  for (const token of [
    'contract: "evavo.work-header-preview-admission.v1"',
    "writeCreateOnlyBundle",
    "rollbackSafeReceiptWrite: true",
    "manifestSha256",
    "screenshotBindings",
    'approvalState: "unapproved"',
    "publicationAllowed: false",
    "cloudOverwriteAllowed: false",
    "websiteMutationAllowed: false",
  ]) assert.ok(source.includes(token), `missing preview-admission token: ${token}`);
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
