import assert from "node:assert/strict";
import test from "node:test";

import {
  fingerprintArtStudioBookPromotionBatch,
  fingerprintWebsiteBookArtworkUseIntent,
  importLegacyWebsiteBookArtworkUseBatch,
  joinBookArtPromotionsToUseIntents,
} from "../src/index.ts";

const sha = (character) => character.repeat(64);
const sourceCommit = "a".repeat(40);
const sourceManifestFingerprint = sha("8");
const sourceArtImportBatchFingerprint = sha("9");

function identity(id) {
  return {
    workspaceId: "workspace-1",
    projectId: "project-1",
    bookId: "book-1",
    editionId: "paperback-1",
    requestId: `request-${id}`,
  };
}

function useIntent(id, checksumCharacter) {
  const qualityDigest = sha(checksumCharacter === "b" ? "e" : "f");
  const selectionDigest = sha(checksumCharacter === "b" ? "1" : "2");
  return {
    outputKind: "evavo_legacy_website_book_artwork_use_intent",
    schemaVersion: 1,
    migrationItemId: `migration-${id}`,
    identity: identity(id),
    purpose: "front_cover_art",
    sourceBriefFingerprint: sha("a"),
    legacySelectionBinding: {
      outputKind: "book_cover_artwork_selection_binding",
      version: "book_cover_artwork_selection_binding_v1",
      status: "selected_for_composition",
      projectId: "project-1",
      assetId: `asset-${id}`,
      candidateId: id,
      conceptTerritoryId: `territory-${id}`,
      sourceArtifactReference: `book-cover-artifact://project-1/art/${id}.png`,
      sourceArtifactSha256: sha(checksumCharacter),
      artworkQualityAuthorityDigestSha256: qualityDigest,
      candidateSetAuthorityDigestSha256: selectionDigest,
      artDirectionDigestSha256: sha("a"),
      selectedBy: "Named art director",
      selectedByRole: "art director",
      selectedAt: "2026-08-02T00:00:00.000Z",
      blockedClaims: ["Selection does not prove final rendering or publication approval."],
      bindingDigestSha256: sha(checksumCharacter === "b" ? "3" : "4"),
    },
    sceneOrPlacementId: `cover-scene-${id}`,
    cropOrPlacementSha256: sha(checksumCharacter === "b" ? "5" : "6"),
    boundAt: "2026-08-02T02:00:00.000Z",
    boundBy: "Book Studio designer",
    useFingerprint: sha(checksumCharacter === "b" ? "7" : "0"),
  };
}

function promotedArtifact(id, checksumCharacter) {
  const qualityDigest = sha(checksumCharacter === "b" ? "e" : "f");
  const selectionDigest = sha(checksumCharacter === "b" ? "1" : "2");
  return {
    outputKind: "evavo_book_art_artifact_receipt",
    schemaVersion: 1,
    contract: "evavo_book_art_handoff_v1",
    identity: identity(id),
    sourceBriefFingerprint: sha("a"),
    status: "approved",
    artifactId: id,
    artifactReference: `book-cover-artifact://project-1/art/${id}.png`,
    contentSha256: sha(checksumCharacter),
    byteLength: 123456,
    mimeType: "image/png",
    widthPx: 3000,
    heightPx: 4800,
    provenance: {
      origin: "ai_assisted",
      provider: "reviewed-provider",
      model: "reviewed-model",
      promptSha256: sha("c"),
      sourceArtifactIds: [`source-${id}`],
      rightsEvidenceIds: [`rights-${id}`],
      rightsStatus: "approved_commercial",
      aiDisclosure: "ai_assisted",
    },
    technicalQualityReceiptSha256: qualityDigest,
    selectionReceiptSha256: selectionDigest,
    promotionReceiptSha256: sha(checksumCharacter === "b" ? "d" : "c"),
    promotedBy: "Art Studio promotion authority",
    promotedAt: "2026-08-02T01:00:00.000Z",
    generatedTextDetected: false,
    unresolvedRisks: [],
    artifactFingerprint: sha(checksumCharacter === "b" ? "4" : "5"),
    publicationPerformed: false,
  };
}

async function useItem(id, checksumCharacter) {
  const input = useIntent(id, checksumCharacter);
  return {
    migrationItemId: input.migrationItemId,
    sourceRecordFingerprint: await fingerprintWebsiteBookArtworkUseIntent(input),
    input,
  };
}

async function useBatch(items) {
  const resolvedItems = items ?? [await useItem("candidate-1", "b"), await useItem("candidate-2", "c")];
  return {
    outputKind: "evavo_website_book_artwork_use_intent_batch",
    schemaVersion: 1,
    batchId: "source-use-batch-1",
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommit,
    expectedMigrationItemIds: resolvedItems.map((item) => item.migrationItemId),
    items: resolvedItems,
  };
}

async function promotionBatch(items) {
  const resolvedItems = items ?? [
    { migrationItemId: "migration-candidate-1", artifact: promotedArtifact("candidate-1", "b") },
    { migrationItemId: "migration-candidate-2", artifact: promotedArtifact("candidate-2", "c") },
  ];
  const unsigned = {
    outputKind: "evavo_art_studio_book_promotion_batch",
    schemaVersion: 1,
    batchId: "art-promotion-batch-1",
    sourceArtImportBatchFingerprint,
    expectedMigrationItemIds: resolvedItems.map((item) => item.migrationItemId),
    items: resolvedItems,
  };
  return {
    ...unsigned,
    batchFingerprint: await fingerprintArtStudioBookPromotionBatch(unsigned),
  };
}

async function joinInput(useIntents, promotions) {
  return {
    outputKind: "evavo_book_art_promotion_join_input",
    schemaVersion: 1,
    joinId: "book-art-promotion-join-1",
    sourceManifestFingerprint,
    sourceArtImportBatchFingerprint,
    useIntents: useIntents ?? await useBatch(),
    promotions: promotions ?? await promotionBatch(),
  };
}

test("joins every exact promotion to one use intent and produces a valid unpersisted Docs batch", async () => {
  const first = await joinInput();
  const reversedUse = await useBatch([...first.useIntents.items].reverse());
  reversedUse.expectedMigrationItemIds.reverse();
  const reversedPromotion = await promotionBatch([...first.promotions.items].reverse());
  reversedPromotion.expectedMigrationItemIds.reverse();
  reversedPromotion.batchFingerprint = await fingerprintArtStudioBookPromotionBatch(reversedPromotion);
  const second = await joinInput(reversedUse, reversedPromotion);

  const firstResult = await joinBookArtPromotionsToUseIntents(first);
  const secondResult = await joinBookArtPromotionsToUseIntents(second);
  assert.equal(firstResult.status, "ready_for_binding_validation", firstResult.blockers.join("\n"));
  assert.deepEqual(firstResult.processedMigrationItemIds, ["migration-candidate-1", "migration-candidate-2"]);
  assert.equal(firstResult.counts.ready, 2);
  assert.equal(firstResult.docsSuiteBatchInput.items.length, 2);
  assert.equal(firstResult.sourceManifestFingerprint, sourceManifestFingerprint);
  assert.equal(firstResult.sourceArtImportBatchFingerprint, sourceArtImportBatchFingerprint);
  assert.equal(firstResult.promotionBatchFingerprint, first.promotions.batchFingerprint);
  assert.equal(firstResult.joinFingerprint, secondResult.joinFingerprint);
  assert.equal(firstResult.authoritativeWritesPerformed, false);
  assert.equal(firstResult.bindingsPersisted, false);

  const downstream = await importLegacyWebsiteBookArtworkUseBatch(firstResult.docsSuiteBatchInput);
  assert.equal(downstream.status, "ready_for_persistence", downstream.blockers.join("\n"));
  assert.equal(downstream.counts.ready, 2);
  assert.equal(downstream.bindingsPersisted, false);
});

test("blocks missing promotions without emitting a partial Docs batch", async () => {
  const promotions = await promotionBatch([
    { migrationItemId: "migration-candidate-1", artifact: promotedArtifact("candidate-1", "b") },
  ]);
  promotions.expectedMigrationItemIds = ["migration-candidate-1", "migration-candidate-2"];
  promotions.batchFingerprint = await fingerprintArtStudioBookPromotionBatch(promotions);
  const result = await joinBookArtPromotionsToUseIntents(await joinInput(await useBatch(), promotions));
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.missingPromotionIds, ["migration-candidate-2"]);
  assert.equal(result.docsSuiteBatchInput.items.length, 0);
});

test("blocks mismatched expected sets and duplicate promotion identities", async () => {
  const promotions = await promotionBatch();
  promotions.expectedMigrationItemIds = ["migration-candidate-1"];
  promotions.items.push(structuredClone(promotions.items[0]));
  promotions.batchFingerprint = await fingerprintArtStudioBookPromotionBatch(promotions);
  const result = await joinBookArtPromotionsToUseIntents(await joinInput(await useBatch(), promotions));
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((entry) => entry.includes("do not declare the same exact migration item set")));
  assert.ok(result.duplicateMigrationItemIds.includes("migration-candidate-1"));
  assert.equal(result.docsSuiteBatchInput.items.length, 0);
});

test("blocks tampered source intent and promotion-batch fingerprints", async () => {
  const sourceTamper = await joinInput();
  sourceTamper.useIntents.items[0].input.boundBy = "Different binder";
  const sourceResult = await joinBookArtPromotionsToUseIntents(sourceTamper);
  assert.equal(sourceResult.status, "blocked");
  assert.ok(sourceResult.blockers.some((entry) => entry.includes("source fingerprint does not match")));

  const promotionTamper = await joinInput();
  promotionTamper.promotions.items[0].artifact.promotedBy = "Different promoter";
  const promotionResult = await joinBookArtPromotionsToUseIntents(promotionTamper);
  assert.equal(promotionResult.status, "blocked");
  assert.ok(promotionResult.blockers.some((entry) => entry.includes("promotion batch fingerprint does not match")));
});

test("blocks a promotion batch derived from a different Art import batch", async () => {
  const value = await joinInput();
  value.promotions.sourceArtImportBatchFingerprint = sha("2");
  value.promotions.batchFingerprint = await fingerprintArtStudioBookPromotionBatch(value.promotions);
  const result = await joinBookArtPromotionsToUseIntents(value);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((entry) => entry.includes("different source Art-import batch")));
  assert.equal(result.docsSuiteBatchInput.items.length, 0);
});

test("retains non-approved or stale promoted artwork as needs-resolution with no partial batch", async () => {
  const nonApproved = await joinInput();
  nonApproved.promotions.items[1].artifact.status = "review_required";
  delete nonApproved.promotions.items[1].artifact.promotionReceiptSha256;
  nonApproved.promotions.batchFingerprint = await fingerprintArtStudioBookPromotionBatch(nonApproved.promotions);
  const nonApprovedResult = await joinBookArtPromotionsToUseIntents(nonApproved);
  assert.equal(nonApprovedResult.status, "needs_resolution");
  assert.equal(nonApprovedResult.counts.ready, 1);
  assert.equal(nonApprovedResult.counts.blocked, 1);
  assert.equal(nonApprovedResult.docsSuiteBatchInput.items.length, 0);

  const stale = await joinInput();
  stale.useIntents.items[0].input.legacySelectionBinding.sourceArtifactReference = "book-cover-artifact://project-1/art/different.png";
  stale.useIntents.items[0].sourceRecordFingerprint = await fingerprintWebsiteBookArtworkUseIntent(stale.useIntents.items[0].input);
  const staleResult = await joinBookArtPromotionsToUseIntents(stale);
  assert.equal(staleResult.status, "needs_resolution");
  assert.ok(staleResult.blockers.some((entry) => entry.includes("reference differs")));
  assert.equal(staleResult.docsSuiteBatchInput.items.length, 0);
});

test("records invalid chain fingerprints as structural blockers", async () => {
  const value = await joinInput();
  value.sourceManifestFingerprint = "not-a-sha";
  value.sourceArtImportBatchFingerprint = "not-a-sha";
  const result = await joinBookArtPromotionsToUseIntents(value);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((entry) => entry.includes("source-manifest fingerprint is invalid")));
  assert.ok(result.blockers.some((entry) => entry.includes("source Art-import batch fingerprint is invalid")));
  assert.equal(result.authoritativeWritesPerformed, false);
  assert.equal(result.bindingsPersisted, false);
  assert.equal(result.publicationPerformed, false);
});
