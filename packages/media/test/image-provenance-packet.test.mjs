import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createImageProvenancePacket } from "../dist/index.js";

const image = Buffer.from("evavo-provenance-packet-image");
const sha = createHash("sha256").update(image).digest("hex");
const otherSha = createHash("sha256").update(Buffer.from("other")).digest("hex");

test("provenance packet reports absent evidence without inferring authorship", () => {
  const result = createImageProvenancePacket(image);
  assert.equal(result.status, "absent");
  assert.equal(result.asset.sha256, sha);
  assert.equal(result.originAssessment.aiGenerated, "not-determined");
  assert.equal(result.originAssessment.pixelHeuristicsUsedForOrigin, false);
  assert.equal(result.publicationAllowed, false);
});

test("matching source binding verifies exact byte lineage only", () => {
  const result = createImageProvenancePacket(image, {
    evidence: [{ id: "candidate", kind: "source-binding", assetSha256: sha, relation: "candidate-review" }],
  });
  assert.equal(result.status, "verified");
  assert.equal(result.summary.hashBindingsVerified, 1);
  assert.equal(result.evidence[0].originClaimVerified, false);
  assert.equal(result.originAssessment.aiGenerated, "not-determined");
});

test("wrong source hash fails closed", () => {
  const result = createImageProvenancePacket(image, {
    evidence: [{ id: "wrong", kind: "source-binding", assetSha256: otherSha }],
  });
  assert.equal(result.status, "invalid");
  assert.equal(result.evidence[0].assetHashMatches, false);
});

test("externally verified content credential is reported but does not become pixel authorship inference", () => {
  const result = createImageProvenancePacket(image, {
    evidence: [{
      id: "c2pa",
      kind: "content-credential",
      assetSha256: sha,
      verificationStatus: "verified",
      verifier: "trusted-c2pa-verifier",
      recordId: "manifest-1",
      issuer: "example-issuer",
      reportedOrigin: "ai-generated",
    }],
  });
  assert.equal(result.status, "verified");
  assert.equal(result.summary.externalVerificationsReported, 1);
  assert.equal(result.summary.verifiedOriginClaims, 1);
  assert.equal(result.originAssessment.provenanceReportedOrigin, "ai-generated");
  assert.equal(result.originAssessment.aiGenerated, "not-determined");
  assert.equal(result.evidence[0].externalVerificationPerformedByArtStudio, false);
});

test("matching external evidence remains unverified without successful authentication", () => {
  const result = createImageProvenancePacket(image, {
    evidence: [{
      id: "receipt",
      kind: "generation-receipt",
      assetSha256: sha,
      verificationStatus: "unverified",
      recordId: "receipt-1",
      reportedOrigin: "ai-generated",
    }],
  });
  assert.equal(result.status, "unverified");
  assert.equal(result.summary.verifiedOriginClaims, 0);
  assert.equal(result.originAssessment.provenanceReportedOrigin, "not-determined");
});

test("claimed external verification bound to different bytes is invalid", () => {
  const result = createImageProvenancePacket(image, {
    evidence: [{
      id: "bad-receipt",
      kind: "generation-receipt",
      assetSha256: otherSha,
      verificationStatus: "verified",
      verifier: "provider-verifier",
      recordId: "receipt-bad",
      reportedOrigin: "ai-generated",
    }],
  });
  assert.equal(result.status, "invalid");
  assert.equal(result.summary.verifiedOriginClaims, 0);
});

test("verified external status requires verifier identity and verification record id", () => {
  assert.throws(() => createImageProvenancePacket(image, {
    evidence: [{
      id: "unscoped-verified",
      kind: "content-credential",
      assetSha256: sha,
      verificationStatus: "verified",
      reportedOrigin: "human-authored",
    }],
  }), /without verifier and verification record id/);
});

test("existing Enhancement Studio manifest is reused as hash-bound EVAVO lineage", () => {
  const result = createImageProvenancePacket(image, {
    evidence: [{
      id: "enhancement-manifest",
      kind: "evavo-record",
      record: {
        contract: "evavo.enhancement-art-review.v1",
        candidate_sha256: sha,
        source_sha256: otherSha,
        learned_candidate: true,
      },
    }],
  });
  assert.equal(result.status, "verified");
  assert.equal(result.evidence[0].hashBindingVerified, true);
  assert.equal(result.evidence[0].reportedOrigin, "machine-assisted");
  assert.equal(result.evidence[0].originClaimVerified, false);
  assert.equal(result.originAssessment.provenanceReportedOrigin, "not-determined");
});

test("contradictory externally verified human and AI origin claims invalidate packet", () => {
  const result = createImageProvenancePacket(image, {
    evidence: [
      {
        id: "human",
        kind: "content-credential",
        assetSha256: sha,
        verificationStatus: "verified",
        verifier: "verifier-a",
        recordId: "a",
        reportedOrigin: "human-authored",
      },
      {
        id: "ai",
        kind: "content-credential",
        assetSha256: sha,
        verificationStatus: "verified",
        verifier: "verifier-b",
        recordId: "b",
        reportedOrigin: "ai-generated",
      },
    ],
  });
  assert.equal(result.status, "invalid");
  assert.match(result.contradictions[0], /contradictory-verified-origin-claims/);
});
