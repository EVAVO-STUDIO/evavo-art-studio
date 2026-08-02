import assert from "node:assert/strict";
import test from "node:test";

import {
  BookArtworkUsePersistenceError,
  InMemoryBookArtworkUsePersistenceAdapterV1,
  fingerprintArtStudioBookPromotionBatch,
  fingerprintWebsiteBookArtworkUseIntent,
  joinBookArtPromotionsToUseIntents,
  keyFromBinding,
  persistBookArtworkUseBatch,
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

function useIntent(id, checksumCharacter, revision = 1) {
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
    cropOrPlacementSha256: sha(revision === 1 ? (checksumCharacter === "b" ? "5" : "6") : (checksumCharacter === "b" ? "7" : "8")),
    boundAt: revision === 1 ? "2026-08-02T02:00:00.000Z" : "2026-08-02T03:00:00.000Z",
    boundBy: "Book Studio designer",
    useFingerprint: sha(revision === 1 ? (checksumCharacter === "b" ? "7" : "0") : (checksumCharacter === "b" ? "1" : "2")),
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

async function useItem(id, checksumCharacter, revision = 1) {
  const input = useIntent(id, checksumCharacter, revision);
  return {
    migrationItemId: input.migrationItemId,
    sourceRecordFingerprint: await fingerprintWebsiteBookArtworkUseIntent(input),
    input,
  };
}

async function useBatch(revision = 1) {
  const items = [await useItem("candidate-1", "b", revision), await useItem("candidate-2", "c", revision)];
  return {
    outputKind: "evavo_website_book_artwork_use_intent_batch",
    schemaVersion: 1,
    batchId: `source-use-batch-${revision}`,
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommit,
    expectedMigrationItemIds: items.map((item) => item.migrationItemId),
    items,
  };
}

async function promotionBatch() {
  const items = [
    { migrationItemId: "migration-candidate-1", artifact: promotedArtifact("candidate-1", "b") },
    { migrationItemId: "migration-candidate-2", artifact: promotedArtifact("candidate-2", "c") },
  ];
  const unsigned = {
    outputKind: "evavo_art_studio_book_promotion_batch",
    schemaVersion: 1,
    batchId: "art-promotion-batch-1",
    sourceArtImportBatchFingerprint,
    expectedMigrationItemIds: items.map((item) => item.migrationItemId),
    items,
  };
  return { ...unsigned, batchFingerprint: await fingerprintArtStudioBookPromotionBatch(unsigned) };
}

async function joinResult(revision = 1) {
  return joinBookArtPromotionsToUseIntents({
    outputKind: "evavo_book_art_promotion_join_input",
    schemaVersion: 1,
    joinId: `book-art-promotion-join-${revision}`,
    sourceManifestFingerprint,
    sourceArtImportBatchFingerprint,
    useIntents: await useBatch(revision),
    promotions: await promotionBatch(),
  });
}

function expectationsFromJoin(join, currentStates = []) {
  const currentByKey = new Map(currentStates.map((state) => [state.keyId, state]));
  return join.itemResults.map((item) => {
    const key = keyFromBinding(item.importResult.binding);
    const keyId = ["book-art-use", key.workspaceId, key.projectId, key.bookId, key.editionId ?? "no-edition", key.purpose, key.sceneOrPlacementId].join(":");
    const current = currentByKey.get(keyId);
    return current
      ? { key, expectedRevision: current.revision, expectedStateFingerprint: current.stateFingerprint }
      : { key, expectedRevision: 0 };
  });
}

function persistenceRequest(join, expectations, overrides = {}) {
  return {
    outputKind: "evavo_book_artwork_use_persistence_input",
    schemaVersion: 1,
    authorityMode: "shadow_migration",
    persistenceId: "book-art-use-persistence-1",
    idempotencyKey: "book-art-use-idempotency-1",
    promotionJoinResult: join,
    expectations,
    persistedAt: "2026-08-02T04:00:00.000Z",
    persistedBy: "Docs Suite migration worker",
    ...overrides,
  };
}

test("persists one complete binding batch atomically to the shadow store", async () => {
  const adapter = new InMemoryBookArtworkUsePersistenceAdapterV1();
  const join = await joinResult();
  const expectations = expectationsFromJoin(join);
  const result = await persistBookArtworkUseBatch({ adapter, request: persistenceRequest(join, expectations) });

  assert.equal(result.status, "persisted_to_shadow_store");
  assert.equal(result.persistedStates.length, 2);
  assert.ok(result.persistedStates.every((state) => state.revision === 1));
  assert.ok(result.persistedStates.every((state) => state.authorityMode === "shadow_migration"));
  assert.equal(result.bindingsPersistedToShadowStore, true);
  assert.equal(result.shadowStoreWritesPerformed, true);
  assert.equal(result.atomic, true);
  assert.equal(result.partialWritesPerformed, false);
  assert.equal(result.canonicalBookStateMutated, false);
  assert.equal(result.websiteRuntimeStillAuthoritative, true);
  assert.equal(result.dualAuthoritativeWritesAllowed, false);
  assert.equal(result.runtimeCutoverApproved, false);
  assert.equal(result.publicationPerformed, false);

  const stored = await adapter.readMany({ keys: expectations.map((item) => item.key) });
  assert.deepEqual(stored.map((state) => state?.stateFingerprint), result.persistedStates.map((state) => state.stateFingerprint));
});

test("returns an exact idempotent replay without another shadow-store write", async () => {
  const adapter = new InMemoryBookArtworkUsePersistenceAdapterV1();
  const join = await joinResult();
  const request = persistenceRequest(join, expectationsFromJoin(join));
  const first = await persistBookArtworkUseBatch({ adapter, request });
  const replay = await persistBookArtworkUseBatch({ adapter, request });

  assert.equal(first.status, "persisted_to_shadow_store");
  assert.equal(replay.status, "idempotent_replay");
  assert.equal(replay.shadowStoreWritesPerformed, false);
  assert.equal(replay.receipt?.receiptFingerprint, first.receipt?.receiptFingerprint);
  assert.deepEqual(replay.persistedStates.map((state) => state.stateFingerprint), first.persistedStates.map((state) => state.stateFingerprint));
});

test("rejects one idempotency key reused for different exact input", async () => {
  const adapter = new InMemoryBookArtworkUsePersistenceAdapterV1();
  const join = await joinResult();
  const request = persistenceRequest(join, expectationsFromJoin(join));
  await persistBookArtworkUseBatch({ adapter, request });

  await assert.rejects(
    persistBookArtworkUseBatch({
      adapter,
      request: { ...request, persistedBy: "Different migration worker" },
    }),
    (error) => error instanceof BookArtworkUsePersistenceError && error.code === "BOOK_ARTWORK_USE_PERSISTENCE_IDEMPOTENCY_CONFLICT",
  );
});

test("returns a stale compare-and-swap conflict without partial writes", async () => {
  const adapter = new InMemoryBookArtworkUsePersistenceAdapterV1();
  const firstJoin = await joinResult();
  const initial = await persistBookArtworkUseBatch({
    adapter,
    request: persistenceRequest(firstJoin, expectationsFromJoin(firstJoin)),
  });
  const secondJoin = await joinResult(2);
  const mixedExpectations = expectationsFromJoin(secondJoin, initial.persistedStates);
  mixedExpectations[1] = { key: mixedExpectations[1].key, expectedRevision: 0 };
  const conflict = await persistBookArtworkUseBatch({
    adapter,
    request: persistenceRequest(secondJoin, mixedExpectations, {
      persistenceId: "book-art-use-persistence-2",
      idempotencyKey: "book-art-use-idempotency-2",
      persistedAt: "2026-08-02T05:00:00.000Z",
    }),
  });

  assert.equal(conflict.status, "conflict");
  assert.equal(conflict.persistedStates.length, 0);
  assert.equal(conflict.shadowStoreWritesPerformed, false);
  assert.ok(conflict.conflicts.some((item) => item.reason === "unexpected_existing_state"));
  const stored = await adapter.readMany({ keys: mixedExpectations.map((item) => item.key) });
  assert.deepEqual(stored.map((state) => state?.revision), [1, 1]);
});

test("updates complete binding state with revision and previous-fingerprint continuity", async () => {
  const adapter = new InMemoryBookArtworkUsePersistenceAdapterV1();
  const firstJoin = await joinResult();
  const initial = await persistBookArtworkUseBatch({
    adapter,
    request: persistenceRequest(firstJoin, expectationsFromJoin(firstJoin)),
  });
  const secondJoin = await joinResult(2);
  const update = await persistBookArtworkUseBatch({
    adapter,
    request: persistenceRequest(secondJoin, expectationsFromJoin(secondJoin, initial.persistedStates), {
      persistenceId: "book-art-use-persistence-2",
      idempotencyKey: "book-art-use-idempotency-2",
      persistedAt: "2026-08-02T05:00:00.000Z",
    }),
  });

  assert.equal(update.status, "persisted_to_shadow_store");
  assert.ok(update.persistedStates.every((state) => state.revision === 2));
  for (const state of update.persistedStates) {
    const previous = initial.persistedStates.find((item) => item.keyId === state.keyId);
    assert.equal(state.previousStateFingerprint, previous?.stateFingerprint);
  }
});

test("rejects incomplete expectation coverage and tampered join evidence", async () => {
  const adapter = new InMemoryBookArtworkUsePersistenceAdapterV1();
  const join = await joinResult();
  const expectations = expectationsFromJoin(join);
  await assert.rejects(
    persistBookArtworkUseBatch({ adapter, request: persistenceRequest(join, expectations.slice(0, 1)) }),
    (error) => error instanceof BookArtworkUsePersistenceError && error.code === "BOOK_ARTWORK_USE_PERSISTENCE_EXPECTATION_INVALID",
  );

  const tampered = structuredClone(join);
  tampered.itemResults[0].warnings.push("Tampered after join fingerprinting.");
  await assert.rejects(
    persistBookArtworkUseBatch({ adapter, request: persistenceRequest(tampered, expectations) }),
    (error) => error instanceof BookArtworkUsePersistenceError && error.code === "BOOK_ARTWORK_USE_PERSISTENCE_SOURCE_INVALID",
  );
});

test("rejects a provider that claims success with partial persisted state", async () => {
  const join = await joinResult();
  const expectations = expectationsFromJoin(join);
  const honest = new InMemoryBookArtworkUsePersistenceAdapterV1();
  const malicious = {
    readMany: (input) => honest.readMany(input),
    async compareAndSwapBatch(input) {
      const result = await honest.compareAndSwapBatch(input);
      return { ...result, persistedStates: result.persistedStates.slice(0, 1) };
    },
  };
  await assert.rejects(
    persistBookArtworkUseBatch({ adapter: malicious, request: persistenceRequest(join, expectations) }),
    (error) => error instanceof BookArtworkUsePersistenceError && error.code === "BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_RESULT_INVALID",
  );
});
