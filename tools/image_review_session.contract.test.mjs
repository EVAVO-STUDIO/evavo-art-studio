import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(name, import.meta.url), "utf8");

test("durable image review receipts use canonical evidence integrity and deterministic recomputation", async () => {
  const source = await read("./image_review_session_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.2.0"',
    'RECEIPT_CONTRACT = "evavo.image-review-session.v1_2"',
    'REVIEW_EVIDENCE_INTEGRITY_CONTRACT = "evavo.image-review-evidence-integrity.v1"',
    "canonicalize",
    "canonicalJson",
    "digestReviewEvidence",
    "reviewEvidenceSha256",
    "reviewEvidenceCanonicalDigestRequired: true",
    "reviewEvidenceRecomputedDuringVerification: true",
    "reviewEvidenceTamperRejected: true",
    "filenameInputPersistedForRecomputation: true",
    "orchestrateImageReview",
    "Image-review receipt review evidence was modified after review.",
    "Image-review evidence no longer matches deterministic review-engine recomputation.",
  ]) assert.ok(source.includes(token), `missing durable review integrity token: ${token}`);
});

test("durable image review receipts stay exact-byte-bound and non-authoritative", async () => {
  const source = await read("./image_review_session_mcp.mjs");
  for (const token of [
    "sourceSha256AndLengthBound: true",
    "comparisonSha256AndLengthBound: true",
    "staleEvidenceVerification: true",
    "sourceBinding",
    "comparisonBindings",
    "finishingPlanNeverAuthorizesRepair: true",
    "sourceMutationPerformed: false",
    "visualReviewRequired: true",
    "publicationAllowed: false",
    "cloudOverwriteAllowed: false",
    "websiteMutationAllowed: false",
    'approvalState: "unapproved"',
  ]) assert.ok(source.includes(token), `missing durable review safety token: ${token}`);
});

test("review session receipt is create-only and leaves source immutable", async () => {
  const source = await read("./image_review_session_mcp.mjs");
  assert.ok(source.includes("writeCreateOnlyBundle"));
  assert.ok(source.includes("createOnlyReceiptWrite: true"));
  assert.ok(source.includes("sourceMutationPerformed: false"));
  assert.ok(!source.includes("writeFile(source"), "source mutation primitive unexpectedly present");
});
