import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  LEGACY_BOOK_ART_DRY_RUN_READINESS_BATCH_CONTRACT,
  assessLegacyBookArtDryRunReadinessBatch,
} from "../dist/legacy-registration-readiness-batch.js";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFklEQVR4nGPkEpHTYGBgYGBigAI4AwAJzABqHri4XAAAAABJRU5ErkJggg==",
  "base64",
);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const sha = (character) => character.repeat(64);
const SOURCE_COMMIT = "a".repeat(40);

function registrationInput(index, overrides = {}) {
  const identity = {
    workspaceId: "workspace-1",
    projectId: "project-1",
    bookId: `book-${index}`,
    editionId: `paperback-${index}`,
    requestId: `request-legacy-readiness-${index}`,
  };
  const candidateId = `legacy-candidate-${index}`;
  const artifactReference =
    `book-cover-artifact://project-1/candidates/${candidateId}.png`;
  const contentSha256 = hash(PNG);
  return {
    outputKind: "evavo_legacy_book_art_byte_registration_input",
    schemaVersion: 1,
    registrationId: `legacy-readiness-${index}`,
    registeredAt: "2026-08-07T04:10:00.000Z",
    purpose: "front_cover_art",
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommitSha: SOURCE_COMMIT,
    sourcePath: `storage/book-art/${candidateId}.png`,
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
          candidateId,
          artifactReference,
          expectedSha256: contentSha256,
          provenance: {
            origin: "human_digital_art",
            creatorName: "Named art director",
            creatorRole: "art director",
            rightsStatus: "approved_commercial",
            rightsReference: `rights-record-${index}`,
            sourceReference: `legacy-source-${index}`,
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
    ...overrides,
  };
}

function item(index, overrides = {}) {
  return {
    itemId: `legacy-item-${index}`,
    registrationInput: registrationInput(index),
    sourceBytes: Buffer.from(PNG),
    ...overrides,
  };
}

function batch(items = [item(1), item(2)], overrides = {}) {
  return {
    outputKind: "evavo_legacy_book_art_dry_run_readiness_batch_input",
    schemaVersion: 1,
    contract: LEGACY_BOOK_ART_DRY_RUN_READINESS_BATCH_CONTRACT,
    batchId: "legacy-batch-1",
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommitSha: SOURCE_COMMIT,
    compiledAt: "2026-08-07T05:00:00.000Z",
    compiledBy: "named-migration-operator",
    items,
    sourceArtifactWritesAllowed: false,
    evidenceArtifactWritesAllowed: false,
    providerCallsAllowed: false,
    selectionAllowed: false,
    promotionAllowed: false,
    bookUseBindingAllowed: false,
    canonicalWriterChangeAllowed: false,
    runtimeCutoverApprovalAllowed: false,
    publicationAllowed: false,
    ...overrides,
  };
}

function assertNoAuthority(result) {
  assert.equal(result.dryRunOnly, true);
  assert.equal(result.sourceArtifactWriteAttempted, false);
  assert.equal(result.evidenceArtifactWriteAttempted, false);
  assert.equal(result.providerCallPerformed, false);
  assert.equal(result.selectionPerformed, false);
  assert.equal(result.promotionPerformed, false);
  assert.equal(result.bookUseBindingCreated, false);
  assert.equal(result.canonicalWriterChanged, false);
  assert.equal(result.runtimeCutoverApproved, false);
  assert.equal(result.publicationPerformed, false);
}

test("compiles an order-independent exact readiness receipt set", async () => {
  const first = await assessLegacyBookArtDryRunReadinessBatch(batch());
  const second = await assessLegacyBookArtDryRunReadinessBatch(
    batch([item(2), item(1)]),
  );

  assert.equal(first.status, "ready", first.blockers.join("\n"));
  assert.equal(first.itemCount, 2);
  assert.equal(first.readyCount, 2);
  assert.equal(first.blockedCount, 0);
  assert.equal(first.allItemsReady, true);
  assert.deepEqual(first.items.map((entry) => entry.itemId), [
    "legacy-item-1",
    "legacy-item-2",
  ]);
  assert.equal(first.receiptSetFingerprintSha256, second.receiptSetFingerprintSha256);
  assert.equal(first.batchFingerprintSha256, second.batchFingerprintSha256);
  assert.match(first.batchFingerprintSha256, /^[a-f0-9]{64}$/u);
  assertNoAuthority(first);
});

test("snapshots every source byte before the first asynchronous boundary", async () => {
  const mutable = Buffer.from(PNG);
  const expectedHash = hash(mutable);
  const pending = assessLegacyBookArtDryRunReadinessBatch(
    batch([item(1, { sourceBytes: mutable })]),
  );
  mutable.fill(0);
  const result = await pending;

  assert.equal(result.status, "ready", result.blockers.join("\n"));
  assert.equal(result.items[0].submittedSourceContentSha256, expectedHash);
  assert.equal(result.items[0].receipt.sourceContentSha256, expectedHash);
  assertNoAuthority(result);
});

test("one mismatched source blocks the complete batch while preserving item evidence", async () => {
  const tampered = Buffer.from(PNG);
  tampered[0] ^= 0xff;
  const result = await assessLegacyBookArtDryRunReadinessBatch(
    batch([item(1), item(2, { sourceBytes: tampered })]),
  );

  assert.equal(result.status, "blocked");
  assert.equal(result.itemCount, 2);
  assert.equal(result.readyCount, 1);
  assert.equal(result.blockedCount, 1);
  assert.ok(result.blockers.some((entry) => entry.startsWith("legacy-item-2:")));
  assertNoAuthority(result);
});

test("rejects mixed source commits and future-dated registration evidence", async () => {
  const result = await assessLegacyBookArtDryRunReadinessBatch(
    batch([
      item(1),
      item(2, {
        registrationInput: registrationInput(2, {
          sourceCommitSha: "b".repeat(40),
          registeredAt: "2026-08-07T06:00:00.000Z",
        }),
      }),
    ]),
  );

  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((entry) => entry.includes("differs from the batch source commit")));
  assert.ok(result.blockers.some((entry) => entry.includes("occurs after batch compiledAt")));
  assertNoAuthority(result);
});

test("rejects duplicated item, registration and registration-plan identities", async () => {
  const first = item(1);
  const replay = {
    itemId: first.itemId,
    registrationInput: structuredClone(first.registrationInput),
    sourceBytes: Buffer.from(PNG),
  };
  const result = await assessLegacyBookArtDryRunReadinessBatch(
    batch([first, replay]),
  );

  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((entry) => entry.includes("itemId legacy-item-1 is duplicated")));
  assert.ok(result.blockers.some((entry) => entry.includes("registrationInput.registrationId legacy-readiness-1 is duplicated")));
  assert.ok(result.blockers.some((entry) => entry.includes("registration plan is replayed")));
  assertNoAuthority(result);
});

test("rejects accessors without invoking them", async () => {
  let invoked = false;
  const value = batch();
  Object.defineProperty(value, "items", {
    enumerable: true,
    get() {
      invoked = true;
      throw new Error("private accessor detail");
    },
  });
  const result = await assessLegacyBookArtDryRunReadinessBatch(value);

  assert.equal(invoked, false);
  assert.equal(result.status, "blocked");
  assert.equal(JSON.stringify(result).includes("private accessor detail"), false);
  assert.ok(result.blockers.some((entry) => entry.includes("must be an enumerable data property")));
  assertNoAuthority(result);
});

test("contains revoked proxies and hostile source byte views", async () => {
  const top = Proxy.revocable(batch(), {});
  top.revoke();
  const topResult = await assessLegacyBookArtDryRunReadinessBatch(top.proxy);
  assert.equal(topResult.status, "blocked");
  assert.ok(topResult.blockers.some((entry) => entry.includes("could not be inspected safely")));

  const bytes = Proxy.revocable(Buffer.from(PNG), {});
  bytes.revoke();
  const byteResult = await assessLegacyBookArtDryRunReadinessBatch(
    batch([item(1, { sourceBytes: bytes.proxy })]),
  );
  assert.equal(byteResult.status, "blocked");
  assert.ok(byteResult.blockers.some((entry) => entry.includes("could not be copied safely")));
  assertNoAuthority(byteResult);
});

test("authority escalation blocks the batch without performing authority", async () => {
  const result = await assessLegacyBookArtDryRunReadinessBatch(
    batch(undefined, {
      sourceArtifactWritesAllowed: true,
      providerCallsAllowed: true,
      promotionAllowed: true,
      runtimeCutoverApprovalAllowed: true,
      publicationAllowed: true,
    }),
  );

  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((entry) => entry.includes("providerCallsAllowed must remain false")));
  assert.ok(result.blockers.some((entry) => entry.includes("publicationAllowed must remain false")));
  assertNoAuthority(result);
});
