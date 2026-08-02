import type {
  BookArtPurpose,
  BookArtworkUseBindingV1,
} from "./book-studio-art-contracts";
import type { BookArtPromotionJoinResultV1 } from "./book-studio-art-promotion-join";

export interface BookArtworkUsePersistenceKeyV1 {
  workspaceId: string;
  projectId: string;
  bookId: string;
  editionId?: string;
  purpose: BookArtPurpose;
  sceneOrPlacementId: string;
}

export interface BookArtworkUsePersistenceExpectationV1 {
  key: BookArtworkUsePersistenceKeyV1;
  expectedRevision: number;
  expectedStateFingerprint?: string;
}

export interface BookArtworkUseStateV1 {
  outputKind: "evavo_book_artwork_use_state";
  schemaVersion: 1;
  authorityMode: "shadow_migration";
  key: BookArtworkUsePersistenceKeyV1;
  keyId: string;
  revision: number;
  binding: BookArtworkUseBindingV1;
  sourceJoinFingerprint: string;
  sourceBatchFingerprint: string;
  sourceRecordFingerprint: string;
  previousStateFingerprint?: string;
  recordedAt: string;
  recordedBy: string;
  stateFingerprint: string;
  canonicalBookStateMutated: false;
  websiteRuntimeStillAuthoritative: true;
  publicationPerformed: false;
}

export interface BookArtworkUseStoreCommitItemV1 {
  keyId: string;
  beforeRevision: number;
  beforeStateFingerprint?: string;
  afterRevision: number;
  afterStateFingerprint: string;
}

export interface BookArtworkUseStoreCommitReceiptV1 {
  outputKind: "evavo_book_artwork_use_store_commit_receipt";
  schemaVersion: 1;
  operationId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  committedAt: string;
  committedBy: string;
  items: BookArtworkUseStoreCommitItemV1[];
  receiptFingerprint: string;
  canonicalBookStateMutated: false;
  websiteRuntimeStillAuthoritative: true;
  publicationPerformed: false;
}

export interface BookArtworkUseStoreCompareAndSwapRequestV1 {
  outputKind: "evavo_book_artwork_use_store_compare_and_swap_request";
  schemaVersion: 1;
  authorityMode: "shadow_migration";
  idempotencyKey: string;
  requestFingerprint: string;
  expected: BookArtworkUsePersistenceExpectationV1[];
  nextStates: BookArtworkUseStateV1[];
  committedAt: string;
  committedBy: string;
}

export interface BookArtworkUseStoreCompareAndSwapResultV1 {
  outputKind: "evavo_book_artwork_use_store_compare_and_swap_result";
  schemaVersion: 1;
  status: "committed" | "idempotent_replay" | "conflict";
  requestFingerprint: string;
  currentStates: Array<BookArtworkUseStateV1 | null>;
  persistedStates: BookArtworkUseStateV1[];
  receipt?: BookArtworkUseStoreCommitReceiptV1;
  atomic: true;
  partialWritesPerformed: false;
  canonicalBookStateMutated: false;
  websiteRuntimeStillAuthoritative: true;
  publicationPerformed: false;
}

export interface BookArtworkUsePersistenceAdapterV1 {
  readMany(input: Readonly<{
    keys: BookArtworkUsePersistenceKeyV1[];
  }>): Promise<Array<BookArtworkUseStateV1 | null>>;
  compareAndSwapBatch(
    input: BookArtworkUseStoreCompareAndSwapRequestV1,
  ): Promise<BookArtworkUseStoreCompareAndSwapResultV1>;
}

export interface BookArtworkUsePersistenceInputV1 {
  outputKind: "evavo_book_artwork_use_persistence_input";
  schemaVersion: 1;
  authorityMode: "shadow_migration";
  persistenceId: string;
  idempotencyKey: string;
  promotionJoinResult: BookArtPromotionJoinResultV1;
  expectations: BookArtworkUsePersistenceExpectationV1[];
  persistedAt: string;
  persistedBy: string;
}

export interface BookArtworkUsePersistenceConflictV1 {
  keyId: string;
  reason:
    | "missing_expected_state"
    | "unexpected_existing_state"
    | "revision_mismatch"
    | "fingerprint_mismatch";
  expectedRevision: number;
  actualRevision: number;
  expectedStateFingerprint?: string;
  actualStateFingerprint?: string;
}

export interface BookArtworkUsePersistenceResultV1 {
  outputKind: "evavo_book_artwork_use_persistence_result";
  schemaVersion: 1;
  status: "persisted_to_shadow_store" | "idempotent_replay" | "conflict";
  authorityMode: "shadow_migration";
  persistenceId: string;
  idempotencyKey: string;
  sourceJoinFingerprint: string;
  sourceBatchFingerprint: string;
  requestFingerprint: string;
  expectedKeyIds: string[];
  persistedStates: BookArtworkUseStateV1[];
  conflicts: BookArtworkUsePersistenceConflictV1[];
  receipt?: BookArtworkUseStoreCommitReceiptV1;
  bindingsPersistedToShadowStore: boolean;
  shadowStoreWritesPerformed: boolean;
  atomic: true;
  partialWritesPerformed: false;
  canonicalBookStateMutated: false;
  websiteRuntimeStillAuthoritative: true;
  dualAuthoritativeWritesAllowed: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

export type BookArtworkUsePersistenceErrorCode =
  | "BOOK_ARTWORK_USE_PERSISTENCE_INVALID_INPUT"
  | "BOOK_ARTWORK_USE_PERSISTENCE_SOURCE_INVALID"
  | "BOOK_ARTWORK_USE_PERSISTENCE_EXPECTATION_INVALID"
  | "BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_INVALID"
  | "BOOK_ARTWORK_USE_PERSISTENCE_ADAPTER_RESULT_INVALID"
  | "BOOK_ARTWORK_USE_PERSISTENCE_IDEMPOTENCY_CONFLICT";

export class BookArtworkUsePersistenceError extends Error {
  public constructor(
    public readonly code: BookArtworkUsePersistenceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BookArtworkUsePersistenceError";
  }
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,299}$/;
const PURPOSES = new Set<BookArtPurpose>([
  "front_cover_art",
  "full_wrap_art",
  "interior_full_page_illustration",
  "interior_half_page_illustration",
  "interior_spot_illustration",
  "diagram",
  "map",
  "ornament",
]);

export function keyFromBinding(
  binding: BookArtworkUseBindingV1,
): BookArtworkUsePersistenceKeyV1 {
  if (!binding || typeof binding !== "object") {
    throw new BookArtworkUsePersistenceError(
      "BOOK_ARTWORK_USE_PERSISTENCE_SOURCE_INVALID",
      "Artwork-use binding is missing.",
    );
  }
  return validateBookArtworkUsePersistenceKey({
    workspaceId: binding.identity.workspaceId,
    projectId: binding.identity.projectId,
    bookId: binding.identity.bookId,
    ...(binding.identity.editionId === undefined
      ? {}
      : { editionId: binding.identity.editionId }),
    purpose: binding.purpose,
    sceneOrPlacementId: binding.sceneOrPlacementId,
  });
}

export function validateBookArtworkUsePersistenceKey(
  value: BookArtworkUsePersistenceKeyV1,
): BookArtworkUsePersistenceKeyV1 {
  if (!value || typeof value !== "object") {
    throw new BookArtworkUsePersistenceError(
      "BOOK_ARTWORK_USE_PERSISTENCE_EXPECTATION_INVALID",
      "Artwork-use persistence key must be an object.",
    );
  }
  if (!PURPOSES.has(value.purpose)) {
    throw new BookArtworkUsePersistenceError(
      "BOOK_ARTWORK_USE_PERSISTENCE_EXPECTATION_INVALID",
      "Artwork-use persistence purpose is unsupported.",
    );
  }
  return {
    workspaceId: requireToken(value.workspaceId, "workspaceId"),
    projectId: requireToken(value.projectId, "projectId"),
    bookId: requireToken(value.bookId, "bookId"),
    ...(value.editionId === undefined
      ? {}
      : { editionId: requireToken(value.editionId, "editionId") }),
    purpose: value.purpose,
    sceneOrPlacementId: requireToken(
      value.sceneOrPlacementId,
      "sceneOrPlacementId",
    ),
  };
}

export function bookArtworkUseKeyId(
  key: BookArtworkUsePersistenceKeyV1,
): string {
  const value = validateBookArtworkUsePersistenceKey(key);
  return [
    "book-art-use",
    value.workspaceId,
    value.projectId,
    value.bookId,
    value.editionId ?? "no-edition",
    value.purpose,
    value.sceneOrPlacementId,
  ].join(":");
}

export async function fingerprintBookArtworkUseState(
  value:
    | Omit<BookArtworkUseStateV1, "stateFingerprint">
    | BookArtworkUseStateV1,
): Promise<string> {
  const { stateFingerprint: _discarded, ...unsigned } =
    value as BookArtworkUseStateV1;
  return sha256(canonicalJson(unsigned));
}

export async function fingerprintBookArtworkUseCommitReceipt(
  value:
    | Omit<BookArtworkUseStoreCommitReceiptV1, "receiptFingerprint">
    | BookArtworkUseStoreCommitReceiptV1,
): Promise<string> {
  const { receiptFingerprint: _discarded, ...unsigned } =
    value as BookArtworkUseStoreCommitReceiptV1;
  return sha256(
    canonicalJson({
      ...unsigned,
      items: [...unsigned.items].sort((a, b) =>
        a.keyId.localeCompare(b.keyId),
      ),
    }),
  );
}

function requireToken(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !== "string" ||
    !SAFE_ID.test(value) ||
    ["__proto__", "constructor", "prototype"].includes(value)
  ) {
    throw new BookArtworkUsePersistenceError(
      "BOOK_ARTWORK_USE_PERSISTENCE_EXPECTATION_INVALID",
      `${label} is invalid.`,
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
