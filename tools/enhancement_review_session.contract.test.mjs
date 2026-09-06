import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./enhancement_review_session_mcp.mjs", import.meta.url), "utf8");

test("enhancement review admits manifest before trusting manifest supplied source paths", () => {
  const admission = source.indexOf("const admittedManifest = admitEnhancementStudioReviewManifest(manifest)");
  const sourceRead = source.indexOf("allowed(manifest.source_path");
  const candidateRead = source.indexOf("allowed(manifest.candidate_path");
  assert.ok(admission >= 0, "manifest admission call is missing");
  assert.ok(sourceRead > admission, "source path is trusted before manifest admission");
  assert.ok(candidateRead > admission, "candidate path is trusted before manifest admission");
});

test("enhancement review session pins schema geometry proofs and unapproved authority", () => {
  for (const token of [
    'SERVER_VERSION = "1.7.0"',
    'contract: "evavo.enhancement-art-review-session.v1_5"',
    "manifestAdmissionBeforeManifestPathReads: true",
    "exactManifestSchemaDigestRequired: true",
    "requiredManifestSchemaSha256: ENHANCEMENT_ART_REVIEW_SCHEMA_SHA256",
    "manifestGeometryPreservationRequired: true",
    "manifestAdmissionVerified: true",
    "manifestGeometryPreservationVerified: true",
    "proofBindings",
    "proofSha256AndLengthBound: true",
    "enhancementReviewSessionReverificationAvailable: true",
    'approvalState: "unapproved"',
    "publicationAllowed: false",
    "cloudOverwriteAllowed: false",
    "websiteMutationAllowed: false",
  ]) assert.ok(source.includes(token), `missing hardened enhancement-session token: ${token}`);
});

test("enhancement session verifier rejects stale lineage and proof bytes", () => {
  for (const token of [
    "evavo_verify_enhancement_review_session",
    "verifyEnhancementReviewSession",
    "Enhancement manifest bytes changed after review session creation.",
    "Durable image-review session binding changed after enhancement review.",
    "proof bytes changed after enhancement review.",
    "staleManifestSourceCandidateOrProofEvidenceRejected: true",
  ]) assert.ok(source.includes(token), `missing enhancement-session verification token: ${token}`);
});

test("stale enhancement schema is rejected before downstream review", () => {
  assert.ok(source.includes("Enhancement Studio manifest schema digest is stale or unsupported."));
  assert.ok(source.includes("Art Studio manifest admission did not verify the current enhancement-review schema digest."));
});
