import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { assessLegacyBookArtDryRunReadiness } from "../dist/legacy-registration-readiness.js";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFklEQVR4nGPkEpHTYGBgYGBigAI4AwAJzABqHri4XAAAAABJRU5ErkJggg==",
  "base64",
);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const sha = (character) => character.repeat(64);

function input() {
  const identity = {
    workspaceId: "workspace-1",
    projectId: "project-1",
    bookId: "book-1",
    editionId: "paperback-1",
    requestId: "request-legacy-readiness-1",
  };
  const artifactReference =
    "book-cover-artifact://project-1/candidates/legacy-candidate-1.png";
  const contentSha256 = hash(PNG);
  return {
    outputKind: "evavo_legacy_book_art_byte_registration_input",
    schemaVersion: 1,
    registrationId: "legacy-readiness-1",
    registeredAt: "2026-08-07T04:10:00.000Z",
    purpose: "front_cover_art",
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommitSha: "a".repeat(40),
    sourcePath: "storage/book-art/legacy-candidate-1.png",
    stateImportInput: {
      outputKind: "evavo_legacy_website_book_art_state_import_input",
      schemaVersion: 1,
      identity,
      sourceBriefFingerprint: sha("a"),
      qualityAuthority: {
        outputKind: "book_cover_artwork_quality_authority",
        version: "book_cover_artwork_quality_authority_v1",
        status: "shortlisted",
        projectId: identity.projectId,
        artDirectionDigestSha256: sha("a"),
        candidate: {
          candidateId: "legacy-candidate-1",
          artifactReference,
          expectedSha256: contentSha256,
          provenance: {
            origin: "human_digital_art",
            creatorName: "Named art director",
            creatorRole: "art director",
            rightsStatus: "approved_commercial",
            rightsReference: "rights-record-1",
            sourceReference: "legacy-source-1",
            c2pa: { status: "not_checked" },
            ingredientSha256s: [],
          },
        },
        governedArtifact: {
          reference: artifactReference,
          checksumSha256: contentSha256,
          kind: "source_artwork",
          mimeType: "image/png",
          byteLength: PNG.byteLength,
          widthPx: 2,
          heightPx: 3,
        },
        humanReview: {
          decision: "shortlist",
          reviewerName: "Named art director",
          reviewerRole: "art director",
          reviewedAt: "2026-08-07T04:00:00.000Z",
          answers: { generated_text_contamination: "pass" },
        },
        hardErrors: [],
        warnings: [],
        requiredRevisions: [],
        authorityDigestSha256: sha("e"),
      },
    },
  };
}

function assertNoAuthority(receipt) {
  assert.equal(receipt.dryRunOnly, true);
  assert.equal(receipt.sourceArtifactWriteAttempted, false);
  assert.equal(receipt.evidenceArtifactWriteAttempted, false);
  assert.equal(receipt.providerCallPerformed, false);
  assert.equal(receipt.selectionPerformed, false);
  assert.equal(receipt.promotionPerformed, false);
  assert.equal(receipt.bookUseBindingCreated, false);
  assert.equal(receipt.canonicalWriterChanged, false);
  assert.equal(receipt.runtimeCutoverApproved, false);
  assert.equal(receipt.publicationPerformed, false);
}

test("proves exact legacy bytes are ready without any write authority", async () => {
  const receipt = await assessLegacyBookArtDryRunReadiness(input(), PNG);
  assert.equal(receipt.status, "ready", receipt.blockers.join("\n"));
  assert.equal(receipt.sourceContentSha256, hash(PNG));
  assert.equal(receipt.sourceByteLength, PNG.byteLength);
  assert.match(receipt.registrationPlanFingerprintSha256 ?? "", /^[a-f0-9]{64}$/);
  assert.match(receipt.stateImportFingerprintSha256 ?? "", /^[a-f0-9]{64}$/);
  assert.match(receipt.readinessFingerprintSha256, /^[a-f0-9]{64}$/);
  assertNoAuthority(receipt);
});

test("fails closed for a revoked Proxy instead of throwing", async () => {
  const { proxy, revoke } = Proxy.revocable(input(), {});
  revoke();
  const receipt = await assessLegacyBookArtDryRunReadiness(proxy, PNG);
  assert.equal(receipt.status, "blocked");
  assert.ok(receipt.blockers.some((item) => item.includes("could not be inspected safely")));
  assertNoAuthority(receipt);
});

test("fails closed for throwing accessors instead of leaking a private exception", async () => {
  const hostile = input();
  Object.defineProperty(hostile, "outputKind", {
    enumerable: true,
    get() {
      throw new Error("private hostile accessor detail");
    },
  });
  const receipt = await assessLegacyBookArtDryRunReadiness(hostile, PNG);
  assert.equal(receipt.status, "blocked");
  assert.equal(JSON.stringify(receipt).includes("private hostile accessor detail"), false);
  assertNoAuthority(receipt);
});

test("fails closed for hostile byte objects and keeps a deterministic blocked receipt", async () => {
  const first = Proxy.revocable(PNG, {});
  first.revoke();
  const receiptA = await assessLegacyBookArtDryRunReadiness(input(), first.proxy);

  const second = Proxy.revocable(PNG, {});
  second.revoke();
  const receiptB = await assessLegacyBookArtDryRunReadiness(input(), second.proxy);

  assert.equal(receiptA.status, "blocked");
  assert.equal(receiptA.readinessFingerprintSha256, receiptB.readinessFingerprintSha256);
  assertNoAuthority(receiptA);
});
