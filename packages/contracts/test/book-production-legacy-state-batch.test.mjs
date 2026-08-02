import assert from "node:assert/strict";
import test from "node:test";

import {
  fingerprintLegacyWebsiteBookArtSourceRecord,
  importLegacyWebsiteBookArtStateBatch,
} from "../dist/index.js";

const sha = (character) => character.repeat(64);

function legacyInput(id, checksumCharacter) {
  return {
    outputKind: "evavo_legacy_website_book_art_state_import_input",
    schemaVersion: 1,
    identity: {
      workspaceId: "workspace-1",
      projectId: "project-1",
      bookId: "book-1",
      editionId: "paperback-1",
      requestId: `request-${id}`,
    },
    sourceBriefFingerprint: sha("a"),
    qualityAuthority: {
      outputKind: "book_cover_artwork_quality_authority",
      version: "book_cover_artwork_quality_authority_v1",
      status: "shortlisted",
      projectId: "project-1",
      artDirectionDigestSha256: sha("a"),
      candidate: {
        candidateId: id,
        artifactReference: `book-cover-artifact://project-1/art/${id}.png`,
        expectedSha256: sha(checksumCharacter),
        provenance: {
          origin: "generative_assisted",
          rightsStatus: "approved_commercial",
          rightsReference: `rights-${id}`,
          sourceReference: `source-${id}`,
          ingredientSha256s: [sha("d")],
          generation: {
            provider: "reviewed-provider",
            model: "reviewed-model",
            modelVersion: "1.0",
            promptSha256: sha("c"),
          },
        },
      },
      governedArtifact: {
        reference: `book-cover-artifact://project-1/art/${id}.png`,
        checksumSha256: sha(checksumCharacter),
        kind: "source_artwork",
        mimeType: "image/png",
        byteLength: 1000,
        widthPx: 3000,
        heightPx: 4800,
      },
      humanReview: {
        decision: "shortlist",
        answers: { generated_text_contamination: "pass" },
      },
      hardErrors: [],
      warnings: [],
      requiredRevisions: [],
      authorityDigestSha256: sha(checksumCharacter === "b" ? "e" : "f"),
    },
  };
}

async function item(id, checksumCharacter) {
  const input = legacyInput(id, checksumCharacter);
  return {
    migrationItemId: `migration-${id}`,
    sourceRecordFingerprint: await fingerprintLegacyWebsiteBookArtSourceRecord(input),
    input,
  };
}

async function batch(items) {
  const resolvedItems = items ?? [await item("candidate-1", "b"), await item("candidate-2", "c")];
  return {
    outputKind: "evavo_legacy_website_book_art_batch_input",
    schemaVersion: 1,
    batchId: "batch-cover-art-1",
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommit: "a".repeat(40),
    expectedMigrationItemIds: resolvedItems.map((entry) => entry.migrationItemId),
    items: resolvedItems,
  };
}

test("processes every expected item once with deterministic ordering and fingerprint", async () => {
  const first = await batch();
  const second = await batch([...first.items].reverse());
  second.expectedMigrationItemIds.reverse();
  const firstResult = await importLegacyWebsiteBookArtStateBatch(first);
  const secondResult = await importLegacyWebsiteBookArtStateBatch(second);
  assert.equal(firstResult.status, "ready_for_promotion_review", firstResult.blockers.join("\n"));
  assert.deepEqual(firstResult.processedMigrationItemIds, ["migration-candidate-1", "migration-candidate-2"]);
  assert.equal(firstResult.counts.expected, 2);
  assert.equal(firstResult.counts.processed, 2);
  assert.equal(firstResult.counts.candidateImported, 2);
  assert.equal(firstResult.authoritativeWritesPerformed, false);
  assert.equal(firstResult.batchFingerprint, secondResult.batchFingerprint);
});

test("blocks duplicate item identities before processing any state", async () => {
  const repeated = await item("candidate-1", "b");
  const value = await batch([repeated, structuredClone(repeated)]);
  value.expectedMigrationItemIds = [repeated.migrationItemId];
  const result = await importLegacyWebsiteBookArtStateBatch(value);
  assert.equal(result.status, "blocked");
  assert.equal(result.counts.processed, 0);
  assert.equal(result.itemResults.length, 0);
  assert.ok(result.duplicateMigrationItemIds.includes(repeated.migrationItemId));
});

test("blocks missing or unexpected state instead of reporting partial coverage", async () => {
  const value = await batch([await item("candidate-1", "b")]);
  value.expectedMigrationItemIds = ["migration-candidate-1", "migration-candidate-2"];
  const result = await importLegacyWebsiteBookArtStateBatch(value);
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.missingMigrationItemIds, ["migration-candidate-2"]);
  assert.equal(result.counts.processed, 0);
});

test("blocks a tampered source-record fingerprint", async () => {
  const value = await batch();
  value.items[0].sourceRecordFingerprint = sha("9");
  const result = await importLegacyWebsiteBookArtStateBatch(value);
  assert.equal(result.status, "blocked");
  assert.equal(result.itemResults.length, 0);
  assert.ok(result.blockers.some((entry) => entry.includes("does not match its exact canonical input")));
});

test("retains item-level failures as needs-resolution without claiming writes", async () => {
  const value = await batch();
  value.items[1].input.qualityAuthority.candidate.provenance.rightsStatus = "blocked";
  value.items[1].sourceRecordFingerprint = await fingerprintLegacyWebsiteBookArtSourceRecord(value.items[1].input);
  const result = await importLegacyWebsiteBookArtStateBatch(value);
  assert.equal(result.status, "needs_resolution");
  assert.equal(result.counts.processed, 2);
  assert.equal(result.counts.blocked, 1);
  assert.equal(result.authoritativeWritesPerformed, false);
  assert.equal(result.artifactBytesRewritten, false);
  assert.equal(result.publicationPerformed, false);
});
