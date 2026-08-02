import type { BookArtworkUseBindingV1 } from "./book-studio-art-contracts";
import type { BookArtPromotionJoinResultV1 } from "./book-studio-art-promotion-join";
import type { LegacyWebsiteBookArtworkUseBatchResultV1 } from "./book-studio-legacy-art-use-batch";
import { importLegacyWebsiteBookArtworkUseBatch } from "./book-studio-legacy-art-use-batch";
import {
  BookArtworkUsePersistenceError,
  bookArtworkUseKeyId,
  fingerprintBookArtworkUseCommitReceipt,
  fingerprintBookArtworkUseState,
  keyFromBinding,
  type BookArtworkUsePersistenceAdapterV1,
  type BookArtworkUsePersistenceConflictV1,
  type BookArtworkUsePersistenceExpectationV1,
  type BookArtworkUsePersistenceInputV1,
  type BookArtworkUsePersistenceKeyV1,
  type BookArtworkUsePersistenceResultV1,
  type BookArtworkUseStateV1,
  type BookArtworkUseStoreCommitItemV1,
  type BookArtworkUseStoreCommitReceiptV1,
  type BookArtworkUseStoreCompareAndSwapRequestV1,
  type BookArtworkUseStoreCompareAndSwapResultV1,
} from "./book-studio-artwork-use-persistence";

export type {
  BookArtworkUsePersistenceAdapterV1,
  BookArtworkUsePersistenceConflictV1,
  BookArtworkUsePersistenceErrorCode,
  BookArtworkUsePersistenceExpectationV1,
  BookArtworkUsePersistenceInputV1,
  BookArtworkUsePersistenceKeyV1,
  BookArtworkUsePersistenceResultV1,
  BookArtworkUseStateV1,
  BookArtworkUseStoreCommitItemV1,
  BookArtworkUseStoreCommitReceiptV1,
  BookArtworkUseStoreCompareAndSwapRequestV1,
  BookArtworkUseStoreCompareAndSwapResultV1,
} from "./book-studio-artwork-use-persistence";
export {
  BookArtworkUsePersistenceError,
  bookArtworkUseKeyId,
  fingerprintBookArtworkUseCommitReceipt,
  fingerprintBookArtworkUseState,
  keyFromBinding,
} from "./book-studio-artwork-use-persistence";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,299}$/;
const SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const MAXIMUM_ITEMS = 10_000;

export async function persistBookArtworkUseBatch(input: Readonly<{
  adapter: BookArtworkUsePersistenceAdapterV1;
  request: BookArtworkUsePersistenceInputV1;
}>): Promise<BookArtworkUsePersistenceResultV1> {
  const adapter = requireAdapter(input?.adapter);
  const request = validateInput(input?.request);
  const join = await validateJoin(request.promotionJoinResult);
  const batch = await importLegacyWebsiteBookArtworkUseBatch(join.docsSuiteBatchInput);
  await validateBatch(batch, join);
  const bindings = batch.itemResults.map((item) => {
    if (item.importResult.status !== "ready" || !item.importResult.binding || item.importResult.blockers.length) {
      fail("BOOK_ARTWORK_USE_PERSISTENCE_SOURCE_INVALID", `Migration item ${item.migrationItemId} is not one ready binding.`);
    }
    return {
      migrationItemId: item.migrationItemId,
      sourceRecordFingerprint: requireSha(item.sourceRecordFingerprint, "sourceRecordFingerprint"),
      binding: structuredClone(item.importResult.binding),
    };
  }).sort((a, b) => bookArtworkUseKeyId(keyFromBinding(a.binding)).localeCompare(bookArtworkUseKeyId(keyFromBinding(b.binding))));
  const expectations = validateExpectations(request.expectations, bindings.map((item) => item.binding));
  const bindingByKey = new Map(bindings.map((item) => [bookArtworkUseKeyId(keyFromBinding(item.binding)), item]));
  const sourceJoinFingerprint = requireSha(join.joinFingerprint, "joinFingerprint");
  const sourceBatchFingerprint = requireSha(batch.batchFingerprint, "batchFingerprint");

  const nextStates: BookArtworkUseStateV1[] = [];
  for (const expectation of expectations) {
    const keyId = bookArtworkUseKeyId(expectation.key);
    const source = bindingByKey.get(keyId);
    if (!source) fail("BOOK_ARTWORK_USE_PERSISTENCE_SOURCE_INVALID", `No source binding exists for ${keyId}.`);
    nextStates.push(await createState({
      expectation,
      binding: source.binding,
      sourceRecordFingerprint: source.sourceRecordFingerprint,
      sourceJoinFingerprint,
      sourceBatchFingerprint,
      recordedAt: request.persistedAt,
      recordedBy: request.persistedBy,
    }));
  }

  const requestFingerprint = await fingerprintRequest({
    request,
    expectations,
    nextStates,
    sourceJoinFingerprint,
    sourceBatchFingerprint,
  });
  const storeRequest: BookArtworkUseStoreCompareAndSwapRequestV1 = {
    outputKind: "evavo_book_artwork_use_store_compare_and_swap_request",
    schemaVersion: 1,
    authorityMode: "shadow_migration",
    idempotencyKey: request.idempotencyKey,
    requestFingerprint,
    expected: expectations,
    nextStates,
    committedAt: request.persistedAt,
    committedBy: request.persistedBy,
  };

  let storeResult: BookArtworkUseStoreCompareAndSwapResultV1;
  try {
    storeResult = await adapter.compareAndSwapBatch(storeRequest);
  } catch (error) {
    if (error instanceof BookArtworkUsePersistenceError) throw error;
    fail("BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_INVALID", "Persistence adapter failed during atomic compare-and-swap.");
  }
  await validateStoreResult(storeResult, storeRequest);

  if (storeResult.status === "conflict") {
    const conflicts = compareExpectations(expectations, storeResult.currentStates);
    if (!conflicts.length) fail("BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_RESULT_INVALID", "Persistence adapter reported conflict without conflicting state.");
    return result({
      status: "conflict",
      request,
      sourceJoinFingerprint,
      sourceBatchFingerprint,
      requestFingerprint,
      expectations,
      persistedStates: [],
      conflicts,
      shadowStoreWritesPerformed: false,
    });
  }

  return result({
    status: storeResult.status === "committed" ? "persisted_to_shadow_store" : "idempotent_replay",
    request,
    sourceJoinFingerprint,
    sourceBatchFingerprint,
    requestFingerprint,
    expectations,
    persistedStates: storeResult.persistedStates,
    conflicts: [],
    receipt: storeResult.receipt,
    shadowStoreWritesPerformed: storeResult.status === "committed",
  });
}

export class InMemoryBookArtworkUsePersistenceAdapterV1 implements BookArtworkUsePersistenceAdapterV1 {
  readonly #states = new Map<string, BookArtworkUseStateV1>();
  readonly #replays = new Map<string, {
    requestFingerprint: string;
    states: BookArtworkUseStateV1[];
    receipt: BookArtworkUseStoreCommitReceiptV1;
  }>();

  public async readMany(input: Readonly<{ keys: BookArtworkUsePersistenceKeyV1[] }>): Promise<Array<BookArtworkUseStateV1 | null>> {
    if (!Array.isArray(input?.keys) || input.keys.length > MAXIMUM_ITEMS) fail("BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_INVALID", "In-memory read request is invalid.");
    return input.keys.map((key) => {
      const state = this.#states.get(bookArtworkUseKeyId(key));
      return state ? structuredClone(state) : null;
    });
  }

  public async compareAndSwapBatch(request: BookArtworkUseStoreCompareAndSwapRequestV1): Promise<BookArtworkUseStoreCompareAndSwapResultV1> {
    await validateStoreRequest(request);
    const replay = this.#replays.get(request.idempotencyKey);
    if (replay) {
      if (replay.requestFingerprint !== request.requestFingerprint) {
        fail("BOOK_ARTWORK_USE_PERSISTENCE_IDEMPOTENCY_CONFLICT", "Persistence idempotency key was reused with different exact input.");
      }
      return storeResult({
        status: "idempotent_replay",
        requestFingerprint: request.requestFingerprint,
        currentStates: request.expected.map((item) => cloneState(this.#states.get(bookArtworkUseKeyId(item.key)) ?? null)),
        persistedStates: structuredClone(replay.states),
        receipt: structuredClone(replay.receipt),
      });
    }

    const currentStates = request.expected.map((item) => cloneState(this.#states.get(bookArtworkUseKeyId(item.key)) ?? null));
    if (compareExpectations(request.expected, currentStates).length) {
      return storeResult({
        status: "conflict",
        requestFingerprint: request.requestFingerprint,
        currentStates,
        persistedStates: [],
      });
    }

    const stateByKey = new Map(request.nextStates.map((state) => [state.keyId, state]));
    for (const expectation of request.expected) {
      const keyId = bookArtworkUseKeyId(expectation.key);
      const next = stateByKey.get(keyId);
      if (!next) fail("BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_INVALID", `Next state is missing for ${keyId}.`);
      if (next.revision !== expectation.expectedRevision + 1) fail("BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_INVALID", `Next revision is invalid for ${keyId}.`);
      if ((next.previousStateFingerprint ?? undefined) !== (expectation.expectedStateFingerprint ?? undefined)) {
        fail("BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_INVALID", `Previous fingerprint is invalid for ${keyId}.`);
      }
    }

    const receipt = await createReceipt(request);
    for (const state of request.nextStates) this.#states.set(state.keyId, structuredClone(state));
    this.#replays.set(request.idempotencyKey, {
      requestFingerprint: request.requestFingerprint,
      states: structuredClone(request.nextStates),
      receipt: structuredClone(receipt),
    });
    return storeResult({
      status: "committed",
      requestFingerprint: request.requestFingerprint,
      currentStates,
      persistedStates: structuredClone(request.nextStates),
      receipt,
    });
  }
}

async function validateJoin(value: BookArtPromotionJoinResultV1): Promise<BookArtPromotionJoinResultV1> {
  if (!value || value.outputKind !== "evavo_book_art_promotion_join_result" || value.schemaVersion !== 1 || value.status !== "ready_for_binding_validation") {
    fail("BOOK_ARTWORK_USE_PERSISTENCE_SOURCE_INVALID", "Promotion join is not ready for binding persistence.");
  }
  if (value.authoritativeWritesPerformed !== false || value.bindingsPersisted !== false || value.publicationPerformed !== false) {
    fail("BOOK_ARTWORK_USE_PERSISTENCE_SOURCE_INVALID", "Promotion join authority flags are invalid.");
  }
  const supplied = requireSha(value.joinFingerprint, "joinFingerprint");
  const { joinFingerprint: _discarded, ...unsigned } = value;
  const expected = await sha256(canonical({
    ...unsigned,
    expectedMigrationItemIds: [...unsigned.expectedMigrationItemIds].sort(),
    processedMigrationItemIds: [...unsigned.processedMigrationItemIds].sort(),
    missingUseIntentIds: [...unsigned.missingUseIntentIds].sort(),
    missingPromotionIds: [...unsigned.missingPromotionIds].sort(),
    unexpectedUseIntentIds: [...unsigned.unexpectedUseIntentIds].sort(),
    unexpectedPromotionIds: [...unsigned.unexpectedPromotionIds].sort(),
    duplicateMigrationItemIds: [...unsigned.duplicateMigrationItemIds].sort(),
    itemResults: [...unsigned.itemResults].sort((a, b) => a.migrationItemId.localeCompare(b.migrationItemId)),
  }));
  if (supplied !== expected) fail("BOOK_ARTWORK_USE_PERSISTENCE_SOURCE_INVALID", "Promotion join fingerprint differs from its exact contents.");
  return structuredClone(value);
}

async function validateBatch(value: LegacyWebsiteBookArtworkUseBatchResultV1, join: BookArtPromotionJoinResultV1): Promise<void> {
  if (value.status !== "ready_for_persistence" || value.blockers.length || value.missingMigrationItemIds.length || value.unexpectedMigrationItemIds.length || value.duplicateMigrationItemIds.length) {
    fail("BOOK_ARTWORK_USE_PERSISTENCE_SOURCE_INVALID", "Artwork-use batch is incomplete or blocked.");
  }
  if (value.counts.expected !== value.counts.processed || value.counts.ready !== value.counts.expected || value.counts.blocked !== 0) {
    fail("BOOK_ARTWORK_USE_PERSISTENCE_SOURCE_INVALID", "Artwork-use batch counts do not prove exact ready coverage.");
  }
  if (value.sourceCommit !== join.sourceCommit || !sameSet(value.expectedMigrationItemIds, join.expectedMigrationItemIds)) {
    fail("BOOK_ARTWORK_USE_PERSISTENCE_SOURCE_INVALID", "Artwork-use batch identity differs from its promotion join.");
  }
  const supplied = requireSha(value.batchFingerprint, "batchFingerprint");
  const { batchFingerprint: _discarded, ...unsigned } = value;
  const expected = await sha256(canonical({
    ...unsigned,
    expectedMigrationItemIds: [...unsigned.expectedMigrationItemIds].sort(),
    processedMigrationItemIds: [...unsigned.processedMigrationItemIds].sort(),
    missingMigrationItemIds: [...unsigned.missingMigrationItemIds].sort(),
    unexpectedMigrationItemIds: [...unsigned.unexpectedMigrationItemIds].sort(),
    duplicateMigrationItemIds: [...unsigned.duplicateMigrationItemIds].sort(),
    itemResults: [...unsigned.itemResults].sort((a, b) => a.migrationItemId.localeCompare(b.migrationItemId)),
  }));
  if (supplied !== expected) fail("BOOK_ARTWORK_USE_PERSISTENCE_SOURCE_INVALID", "Artwork-use batch fingerprint differs from its exact contents.");
}

function validateExpectations(values: BookArtworkUsePersistenceExpectationV1[], bindings: BookArtworkUseBindingV1[]): BookArtworkUsePersistenceExpectationV1[] {
  if (!Array.isArray(values) || values.length < 1 || values.length > MAXIMUM_ITEMS) fail("BOOK_ARTWORK_USE_PERSISTENCE_EXPECTATION_INVALID", `Persistence requires 1-${MAXIMUM_ITEMS} expectations.`);
  const result = values.map(validateExpectation).sort((a, b) => bookArtworkUseKeyId(a.key).localeCompare(bookArtworkUseKeyId(b.key)));
  const expectedKeys = result.map((item) => bookArtworkUseKeyId(item.key));
  const bindingKeys = bindings.map((binding) => bookArtworkUseKeyId(keyFromBinding(binding)));
  const duplicates = duplicateValues(expectedKeys);
  if (duplicates.length) fail("BOOK_ARTWORK_USE_PERSISTENCE_EXPECTATION_INVALID", `Persistence expectations duplicate keys: ${duplicates.join(", ")}.`);
  if (!sameSet(expectedKeys, bindingKeys)) fail("BOOK_ARTWORK_USE_PERSISTENCE_EXPECTATION_INVALID", "Persistence expectations do not cover the exact ready binding set.");
  return result;
}

function validateExpectation(value: BookArtworkUsePersistenceExpectationV1): BookArtworkUsePersistenceExpectationV1 {
  const key = validateKey(value?.key);
  if (!Number.isSafeInteger(value?.expectedRevision) || value.expectedRevision < 0) fail("BOOK_ARTWORK_USE_PERSISTENCE_EXPECTATION_INVALID", "Expected revision is invalid.");
  if (value.expectedRevision === 0 && value.expectedStateFingerprint !== undefined) fail("BOOK_ARTWORK_USE_PERSISTENCE_EXPECTATION_INVALID", "A missing expected state cannot carry a fingerprint.");
  if (value.expectedRevision > 0 && !normaliseSha(value.expectedStateFingerprint)) fail("BOOK_ARTWORK_USE_PERSISTENCE_EXPECTATION_INVALID", "An existing expected state requires its exact fingerprint.");
  return {
    key,
    expectedRevision: value.expectedRevision,
    ...(value.expectedStateFingerprint === undefined ? {} : { expectedStateFingerprint: requireSha(value.expectedStateFingerprint, "expectedStateFingerprint") }),
  };
}

async function createState(input: Readonly<{
  expectation: BookArtworkUsePersistenceExpectationV1;
  binding: BookArtworkUseBindingV1;
  sourceRecordFingerprint: string;
  sourceJoinFingerprint: string;
  sourceBatchFingerprint: string;
  recordedAt: string;
  recordedBy: string;
}>): Promise<BookArtworkUseStateV1> {
  const key = validateKey(input.expectation.key);
  if (canonical(keyFromBinding(input.binding)) !== canonical(key)) fail("BOOK_ARTWORK_USE_PERSISTENCE_SOURCE_INVALID", "Binding identity differs from its persistence key.");
  const unsigned: Omit<BookArtworkUseStateV1, "stateFingerprint"> = {
    outputKind: "evavo_book_artwork_use_state",
    schemaVersion: 1,
    authorityMode: "shadow_migration",
    key,
    keyId: bookArtworkUseKeyId(key),
    revision: input.expectation.expectedRevision + 1,
    binding: structuredClone(input.binding),
    sourceJoinFingerprint: input.sourceJoinFingerprint,
    sourceBatchFingerprint: input.sourceBatchFingerprint,
    sourceRecordFingerprint: input.sourceRecordFingerprint,
    ...(input.expectation.expectedStateFingerprint === undefined ? {} : { previousStateFingerprint: input.expectation.expectedStateFingerprint }),
    recordedAt: input.recordedAt,
    recordedBy: input.recordedBy,
    canonicalBookStateMutated: false,
    websiteRuntimeStillAuthoritative: true,
    publicationPerformed: false,
  };
  return { ...unsigned, stateFingerprint: await fingerprintBookArtworkUseState(unsigned) };
}

async function fingerprintRequest(input: Readonly<{
  request: BookArtworkUsePersistenceInputV1;
  expectations: BookArtworkUsePersistenceExpectationV1[];
  nextStates: BookArtworkUseStateV1[];
  sourceJoinFingerprint: string;
  sourceBatchFingerprint: string;
}>): Promise<string> {
  return sha256(canonical({
    persistenceId: input.request.persistenceId,
    idempotencyKey: input.request.idempotencyKey,
    authorityMode: input.request.authorityMode,
    sourceJoinFingerprint: input.sourceJoinFingerprint,
    sourceBatchFingerprint: input.sourceBatchFingerprint,
    expectations: [...input.expectations].sort((a, b) => bookArtworkUseKeyId(a.key).localeCompare(bookArtworkUseKeyId(b.key))),
    nextStateFingerprints: [...input.nextStates].sort((a, b) => a.keyId.localeCompare(b.keyId)).map((state) => ({ keyId: state.keyId, stateFingerprint: state.stateFingerprint })),
    persistedAt: input.request.persistedAt,
    persistedBy: input.request.persistedBy,
  }));
}

async function validateStoreRequest(value: BookArtworkUseStoreCompareAndSwapRequestV1): Promise<void> {
  if (!value || value.outputKind !== "evavo_book_artwork_use_store_compare_and_swap_request" || value.schemaVersion !== 1 || value.authorityMode !== "shadow_migration") fail("BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_INVALID", "Store compare-and-swap request is invalid.");
  requireSafeId(value.idempotencyKey, "idempotencyKey");
  requireSha(value.requestFingerprint, "requestFingerprint");
  requireTimestamp(value.committedAt, "committedAt");
  requireText(value.committedBy, "committedBy", 300);
  if (!Array.isArray(value.expected) || !Array.isArray(value.nextStates) || value.expected.length !== value.nextStates.length || value.expected.length < 1 || value.expected.length > MAXIMUM_ITEMS) fail("BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_INVALID", "Store request does not contain exact complete coverage.");
  const expectedKeys = value.expected.map(validateExpectation).map((item) => bookArtworkUseKeyId(item.key));
  const nextKeys = value.nextStates.map((state) => state.keyId);
  if (!sameSet(expectedKeys, nextKeys)) fail("BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_INVALID", "Store expectations and next states differ.");
  for (const state of value.nextStates) await validateState(state);
}

async function validateStoreResult(value: BookArtworkUseStoreCompareAndSwapResultV1, request: BookArtworkUseStoreCompareAndSwapRequestV1): Promise<void> {
  if (!value || value.outputKind !== "evavo_book_artwork_use_store_compare_and_swap_result" || value.schemaVersion !== 1 || !["committed", "idempotent_replay", "conflict"].includes(value.status)) fail("BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_RESULT_INVALID", "Store result kind, version or status is invalid.");
  if (value.requestFingerprint !== request.requestFingerprint || value.atomic !== true || value.partialWritesPerformed !== false || value.canonicalBookStateMutated !== false || value.websiteRuntimeStillAuthoritative !== true || value.publicationPerformed !== false) fail("BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_RESULT_INVALID", "Store result identity or safety flags are invalid.");
  if (!Array.isArray(value.currentStates) || value.currentStates.length !== request.expected.length || !Array.isArray(value.persistedStates)) fail("BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_RESULT_INVALID", "Store result coverage is invalid.");
  for (const state of value.currentStates) if (state) await validateState(state);
  if (value.status === "conflict") {
    if (value.persistedStates.length || value.receipt !== undefined) fail("BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_RESULT_INVALID", "Conflict result cannot contain writes or a receipt.");
    return;
  }
  if (!value.receipt || value.persistedStates.length !== request.nextStates.length) fail("BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_RESULT_INVALID", "Successful store result requires every state and one receipt.");
  for (const state of value.persistedStates) await validateState(state);
  if (canonical([...value.persistedStates].sort((a, b) => a.keyId.localeCompare(b.keyId))) !== canonical([...request.nextStates].sort((a, b) => a.keyId.localeCompare(b.keyId)))) fail("BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_RESULT_INVALID", "Store changed the exact next states.");
  await validateReceipt(value.receipt, request);
}

async function validateState(value: BookArtworkUseStateV1): Promise<void> {
  if (!value || value.outputKind !== "evavo_book_artwork_use_state" || value.schemaVersion !== 1 || value.authorityMode !== "shadow_migration") fail("BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_RESULT_INVALID", "Stored state kind, version or authority is invalid.");
  const key = validateKey(value.key);
  if (value.keyId !== bookArtworkUseKeyId(key) || canonical(keyFromBinding(value.binding)) !== canonical(key)) fail("BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_RESULT_INVALID", "Stored state identity is invalid.");
  if (!Number.isSafeInteger(value.revision) || value.revision < 1) fail("BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_RESULT_INVALID", "Stored revision is invalid.");
  requireSha(value.sourceJoinFingerprint, "sourceJoinFingerprint");
  requireSha(value.sourceBatchFingerprint, "sourceBatchFingerprint");
  requireSha(value.sourceRecordFingerprint, "sourceRecordFingerprint");
  if (value.previousStateFingerprint !== undefined) requireSha(value.previousStateFingerprint, "previousStateFingerprint");
  requireTimestamp(value.recordedAt, "recordedAt");
  requireText(value.recordedBy, "recordedBy", 300);
  if (value.canonicalBookStateMutated !== false || value.websiteRuntimeStillAuthoritative !== true || value.publicationPerformed !== false) fail("BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_RESULT_INVALID", "Stored state safety flags are invalid.");
  if (requireSha(value.stateFingerprint, "stateFingerprint") !== await fingerprintBookArtworkUseState(value)) fail("BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_RESULT_INVALID", "Stored state fingerprint differs from its exact contents.");
}

async function createReceipt(request: BookArtworkUseStoreCompareAndSwapRequestV1): Promise<BookArtworkUseStoreCommitReceiptV1> {
  const stateByKey = new Map(request.nextStates.map((state) => [state.keyId, state]));
  const items: BookArtworkUseStoreCommitItemV1[] = request.expected.map((expectation) => {
    const keyId = bookArtworkUseKeyId(expectation.key);
    const state = stateByKey.get(keyId);
    if (!state) fail("BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_INVALID", `Receipt state is missing for ${keyId}.`);
    return {
      keyId,
      beforeRevision: expectation.expectedRevision,
      ...(expectation.expectedStateFingerprint === undefined ? {} : { beforeStateFingerprint: expectation.expectedStateFingerprint }),
      afterRevision: state.revision,
      afterStateFingerprint: state.stateFingerprint,
    };
  }).sort((a, b) => a.keyId.localeCompare(b.keyId));
  const unsigned: Omit<BookArtworkUseStoreCommitReceiptV1, "receiptFingerprint"> = {
    outputKind: "evavo_book_artwork_use_store_commit_receipt",
    schemaVersion: 1,
    operationId: `book-art-use-commit:${request.idempotencyKey}:${request.requestFingerprint}`,
    idempotencyKey: request.idempotencyKey,
    requestFingerprint: request.requestFingerprint,
    committedAt: request.committedAt,
    committedBy: request.committedBy,
    items,
    canonicalBookStateMutated: false,
    websiteRuntimeStillAuthoritative: true,
    publicationPerformed: false,
  };
  return { ...unsigned, receiptFingerprint: await fingerprintBookArtworkUseCommitReceipt(unsigned) };
}

async function validateReceipt(value: BookArtworkUseStoreCommitReceiptV1, request: BookArtworkUseStoreCompareAndSwapRequestV1): Promise<void> {
  if (value.outputKind !== "evavo_book_artwork_use_store_commit_receipt" || value.schemaVersion !== 1 || value.idempotencyKey !== request.idempotencyKey || value.requestFingerprint !== request.requestFingerprint) fail("BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_RESULT_INVALID", "Store receipt identity is invalid.");
  if (value.committedAt !== request.committedAt || value.committedBy !== request.committedBy || value.items.length !== request.nextStates.length || value.canonicalBookStateMutated !== false || value.websiteRuntimeStillAuthoritative !== true || value.publicationPerformed !== false) fail("BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_RESULT_INVALID", "Store receipt coverage or safety flags are invalid.");
  if (requireSha(value.receiptFingerprint, "receiptFingerprint") !== await fingerprintBookArtworkUseCommitReceipt(value)) fail("BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_RESULT_INVALID", "Store receipt fingerprint differs from its exact contents.");
}

function compareExpectations(expectations: BookArtworkUsePersistenceExpectationV1[], currentStates: Array<BookArtworkUseStateV1 | null>): BookArtworkUsePersistenceConflictV1[] {
  if (expectations.length !== currentStates.length) fail("BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_RESULT_INVALID", "Store current-state coverage is invalid.");
  const conflicts: BookArtworkUsePersistenceConflictV1[] = [];
  expectations.forEach((expectation, index) => {
    const current = currentStates[index] ?? null;
    const keyId = bookArtworkUseKeyId(expectation.key);
    if (expectation.expectedRevision === 0 && current) {
      conflicts.push({ keyId, reason: "unexpected_existing_state", expectedRevision: 0, actualRevision: current.revision, actualStateFingerprint: current.stateFingerprint });
    } else if (expectation.expectedRevision > 0 && !current) {
      conflicts.push({ keyId, reason: "missing_expected_state", expectedRevision: expectation.expectedRevision, actualRevision: 0, ...(expectation.expectedStateFingerprint ? { expectedStateFingerprint: expectation.expectedStateFingerprint } : {}) });
    } else if (current && current.revision !== expectation.expectedRevision) {
      conflicts.push({ keyId, reason: "revision_mismatch", expectedRevision: expectation.expectedRevision, actualRevision: current.revision, ...(expectation.expectedStateFingerprint ? { expectedStateFingerprint: expectation.expectedStateFingerprint } : {}), actualStateFingerprint: current.stateFingerprint });
    } else if (current && current.stateFingerprint !== expectation.expectedStateFingerprint) {
      conflicts.push({ keyId, reason: "fingerprint_mismatch", expectedRevision: expectation.expectedRevision, actualRevision: current.revision, ...(expectation.expectedStateFingerprint ? { expectedStateFingerprint: expectation.expectedStateFingerprint } : {}), actualStateFingerprint: current.stateFingerprint });
    }
  });
  return conflicts;
}

function result(input: Readonly<{
  status: BookArtworkUsePersistenceResultV1["status"];
  request: BookArtworkUsePersistenceInputV1;
  sourceJoinFingerprint: string;
  sourceBatchFingerprint: string;
  requestFingerprint: string;
  expectations: BookArtworkUsePersistenceExpectationV1[];
  persistedStates: BookArtworkUseStateV1[];
  conflicts: BookArtworkUsePersistenceConflictV1[];
  receipt?: BookArtworkUseStoreCommitReceiptV1;
  shadowStoreWritesPerformed: boolean;
}>): BookArtworkUsePersistenceResultV1 {
  return {
    outputKind: "evavo_book_artwork_use_persistence_result",
    schemaVersion: 1,
    status: input.status,
    authorityMode: "shadow_migration",
    persistenceId: input.request.persistenceId,
    idempotencyKey: input.request.idempotencyKey,
    sourceJoinFingerprint: input.sourceJoinFingerprint,
    sourceBatchFingerprint: input.sourceBatchFingerprint,
    requestFingerprint: input.requestFingerprint,
    expectedKeyIds: input.expectations.map((item) => bookArtworkUseKeyId(item.key)).sort(),
    persistedStates: structuredClone(input.persistedStates).sort((a, b) => a.keyId.localeCompare(b.keyId)),
    conflicts: structuredClone(input.conflicts).sort((a, b) => a.keyId.localeCompare(b.keyId)),
    ...(input.receipt === undefined ? {} : { receipt: structuredClone(input.receipt) }),
    bindingsPersistedToShadowStore: input.status !== "conflict",
    shadowStoreWritesPerformed: input.shadowStoreWritesPerformed,
    atomic: true,
    partialWritesPerformed: false,
    canonicalBookStateMutated: false,
    websiteRuntimeStillAuthoritative: true,
    dualAuthoritativeWritesAllowed: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

function storeResult(input: Readonly<{
  status: BookArtworkUseStoreCompareAndSwapResultV1["status"];
  requestFingerprint: string;
  currentStates: Array<BookArtworkUseStateV1 | null>;
  persistedStates: BookArtworkUseStateV1[];
  receipt?: BookArtworkUseStoreCommitReceiptV1;
}>): BookArtworkUseStoreCompareAndSwapResultV1 {
  return {
    outputKind: "evavo_book_artwork_use_store_compare_and_swap_result",
    schemaVersion: 1,
    status: input.status,
    requestFingerprint: input.requestFingerprint,
    currentStates: structuredClone(input.currentStates),
    persistedStates: structuredClone(input.persistedStates),
    ...(input.receipt === undefined ? {} : { receipt: structuredClone(input.receipt) }),
    atomic: true,
    partialWritesPerformed: false,
    canonicalBookStateMutated: false,
    websiteRuntimeStillAuthoritative: true,
    publicationPerformed: false,
  };
}

function validateInput(value: BookArtworkUsePersistenceInputV1): BookArtworkUsePersistenceInputV1 {
  if (!value || value.outputKind !== "evavo_book_artwork_use_persistence_input" || value.schemaVersion !== 1 || value.authorityMode !== "shadow_migration") fail("BOOK_ARTWORK_USE_PERSISTENCE_INVALID_INPUT", "Persistence input kind, version or authority is invalid.");
  return {
    outputKind: value.outputKind,
    schemaVersion: 1,
    authorityMode: "shadow_migration",
    persistenceId: requireSafeId(value.persistenceId, "persistenceId"),
    idempotencyKey: requireSafeId(value.idempotencyKey, "idempotencyKey"),
    promotionJoinResult: structuredClone(value.promotionJoinResult),
    expectations: structuredClone(value.expectations),
    persistedAt: requireTimestamp(value.persistedAt, "persistedAt"),
    persistedBy: requireText(value.persistedBy, "persistedBy", 300),
  };
}

function validateKey(value: BookArtworkUsePersistenceKeyV1): BookArtworkUsePersistenceKeyV1 {
  if (!value || typeof value !== "object") fail("BOOK_ARTWORK_USE_PERSISTENCE_EXPECTATION_INVALID", "Persistence key is invalid.");
  return {
    workspaceId: requireSafeId(value.workspaceId, "workspaceId"),
    projectId: requireSafeId(value.projectId, "projectId"),
    bookId: requireSafeId(value.bookId, "bookId"),
    ...(value.editionId === undefined ? {} : { editionId: requireSafeId(value.editionId, "editionId") }),
    purpose: value.purpose,
    sceneOrPlacementId: requireSafeId(value.sceneOrPlacementId, "sceneOrPlacementId"),
  };
}
function requireAdapter(value: BookArtworkUsePersistenceAdapterV1): BookArtworkUsePersistenceAdapterV1 {
  if (!value || typeof value.readMany !== "function" || typeof value.compareAndSwapBatch !== "function") fail("BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_INVALID", "Persistence adapter is missing required methods.");
  return value;
}
function cloneState(value: BookArtworkUseStateV1 | null): BookArtworkUseStateV1 | null { return value ? structuredClone(value) : null; }
function requireSafeId(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value) || ["__proto__", "constructor", "prototype"].includes(value)) fail("BOOK_ARTWORK_USE_PERSISTENCE_INVALID_INPUT", `${label} is invalid.`);
  return value;
}
function requireSha(value: unknown, label: string): string {
  const result = normaliseSha(value);
  if (!result) fail("BOOK_ARTWORK_USE_PERSISTENCE_INVALID_INPUT", `${label} must be an exact SHA-256.`);
  return result;
}
function normaliseSha(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const result = value.replace(/^sha256:/, "");
  return SHA256.test(result) ? result : undefined;
}
function requireTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !ISO_TIMESTAMP.test(value) || Number.isNaN(Date.parse(value))) fail("BOOK_ARTWORK_USE_PERSISTENCE_INVALID_INPUT", `${label} must be canonical UTC ISO-8601.`);
  return value;
}
function requireText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || value !== value.trim() || value.length < 1 || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) fail("BOOK_ARTWORK_USE_PERSISTENCE_INVALID_INPUT", `${label} is invalid.`);
  return value;
}
function duplicateValues(values: string[]): string[] {
  const seen = new Set();
  const duplicated = new Set();
  for (const value of values) seen.has(value) ? duplicated.add(value) : seen.add(value);
  return [...duplicated].sort();
}
function sameSet(first: string[], second: string[]): boolean {
  const a = new Set(first);
  const b = new Set(second);
  return a.size === b.size && [...a].every((value) => b.has(value));
}
function canonical(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonicalValue(item)]));
  }
  return value;
}
async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function fail(code: ConstructorParameters<typeof BookArtworkUsePersistenceError>[0], message: string): never {
  throw new BookArtworkUsePersistenceError(code, message);
}
