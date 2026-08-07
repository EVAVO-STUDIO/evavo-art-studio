import {
  normalizeJson,
  sha256,
  stableStringify,
} from "@evavo/art-artifacts";
import {
  assessLegacyBookArtDryRunReadiness,
  type LegacyBookArtDryRunReadinessReceiptV1,
} from "./legacy-registration-readiness.js";

export const LEGACY_BOOK_ART_DRY_RUN_READINESS_BATCH_SCHEMA_VERSION = 1 as const;
export const LEGACY_BOOK_ART_DRY_RUN_READINESS_BATCH_CONTRACT =
  "evavo_book_art_legacy_dry_run_readiness_batch_v1" as const;

export interface LegacyBookArtDryRunReadinessBatchItemInputV1 {
  itemId: string;
  registrationInput: unknown;
  sourceBytes: Uint8Array;
}

export interface LegacyBookArtDryRunReadinessBatchInputV1 {
  outputKind: "evavo_legacy_book_art_dry_run_readiness_batch_input";
  schemaVersion: typeof LEGACY_BOOK_ART_DRY_RUN_READINESS_BATCH_SCHEMA_VERSION;
  contract: typeof LEGACY_BOOK_ART_DRY_RUN_READINESS_BATCH_CONTRACT;
  batchId: string;
  sourceRepository: "EVAVO-STUDIO/Website";
  sourceCommitSha: string;
  compiledAt: string;
  compiledBy: string;
  items: LegacyBookArtDryRunReadinessBatchItemInputV1[];
  sourceArtifactWritesAllowed: false;
  evidenceArtifactWritesAllowed: false;
  providerCallsAllowed: false;
  selectionAllowed: false;
  promotionAllowed: false;
  bookUseBindingAllowed: false;
  canonicalWriterChangeAllowed: false;
  runtimeCutoverApprovalAllowed: false;
  publicationAllowed: false;
}

export interface LegacyBookArtDryRunReadinessBatchItemResultV1 {
  itemId: string;
  registrationId?: string;
  sourcePath?: string;
  submittedSourceContentSha256: string;
  submittedSourceByteLength: number;
  registrationInputFingerprintSha256: string;
  receipt: LegacyBookArtDryRunReadinessReceiptV1;
  itemFingerprintSha256: string;
}

export interface LegacyBookArtDryRunReadinessBatchResultV1 {
  outputKind: "evavo_legacy_book_art_dry_run_readiness_batch_result";
  schemaVersion: typeof LEGACY_BOOK_ART_DRY_RUN_READINESS_BATCH_SCHEMA_VERSION;
  contract: typeof LEGACY_BOOK_ART_DRY_RUN_READINESS_BATCH_CONTRACT;
  status: "blocked" | "ready";
  batchId: string;
  sourceRepository: "EVAVO-STUDIO/Website";
  sourceCommitSha: string;
  compiledAt: string;
  compiledBy: string;
  itemCount: number;
  readyCount: number;
  blockedCount: number;
  totalSourceByteLength: number;
  allItemsReady: boolean;
  items: LegacyBookArtDryRunReadinessBatchItemResultV1[];
  blockers: string[];
  warnings: string[];
  receiptSetFingerprintSha256: string;
  dryRunOnly: true;
  sourceArtifactWriteAttempted: false;
  evidenceArtifactWriteAttempted: false;
  providerCallPerformed: false;
  selectionPerformed: false;
  promotionPerformed: false;
  bookUseBindingCreated: false;
  canonicalWriterChanged: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
  batchFingerprintSha256: string;
}

interface SnapshotBatch {
  batchId: string;
  sourceRepository: "EVAVO-STUDIO/Website";
  sourceCommitSha: string;
  compiledAt: string;
  compiledBy: string;
  items: SnapshotItem[];
}

interface SnapshotItem {
  itemId: string;
  registrationInput: unknown;
  sourceBytes: Uint8Array;
  sourceContentSha256: string;
  registrationInputFingerprintSha256: string;
  registrationId?: string;
  sourcePath?: string;
  sourceRepository?: string;
  sourceCommitSha?: string;
  registeredAt?: string;
  sortKey: string;
}

interface CloneBudget {
  nodes: number;
  seen: WeakSet<object>;
}

const MAXIMUM_ITEMS = 10_000;
const MAXIMUM_ITEM_BYTES = 512 * 1024 * 1024;
const MAXIMUM_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
const MAXIMUM_JSON_DEPTH = 80;
const MAXIMUM_JSON_NODES = 250_000;
const MAXIMUM_OBJECT_PROPERTIES = 10_000;
const MAXIMUM_STRING_LENGTH = 500_000;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._@:/-]{0,299}$/u;
const COMMIT_SHA = /^[a-f0-9]{40}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const INPUT_FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "batchId",
  "sourceRepository",
  "sourceCommitSha",
  "compiledAt",
  "compiledBy",
  "items",
  "sourceArtifactWritesAllowed",
  "evidenceArtifactWritesAllowed",
  "providerCallsAllowed",
  "selectionAllowed",
  "promotionAllowed",
  "bookUseBindingAllowed",
  "canonicalWriterChangeAllowed",
  "runtimeCutoverApprovalAllowed",
  "publicationAllowed",
]);
const ITEM_FIELDS = new Set([
  "itemId",
  "registrationInput",
  "sourceBytes",
]);
const AUTHORITY_FIELDS = [
  "sourceArtifactWritesAllowed",
  "evidenceArtifactWritesAllowed",
  "providerCallsAllowed",
  "selectionAllowed",
  "promotionAllowed",
  "bookUseBindingAllowed",
  "canonicalWriterChangeAllowed",
  "runtimeCutoverApprovalAllowed",
  "publicationAllowed",
] as const;

/**
 * Compile an ordered, fingerprinted set of legacy Website Book Art readiness
 * receipts without writing source or evidence artifacts.
 *
 * All caller-owned objects and bytes are synchronously snapshotted before the
 * first await. The batch cannot call providers, select or promote artwork,
 * create Book-use bindings, change the canonical writer, approve cutover or
 * publish.
 */
export async function assessLegacyBookArtDryRunReadinessBatch(
  value: unknown,
): Promise<LegacyBookArtDryRunReadinessBatchResultV1> {
  try {
    const blockers: string[] = [];
    const warnings: string[] = [];
    const snapshot = snapshotBatch(value, blockers);
    if (!snapshot) {
      return blockedBatch(blockers);
    }

    validateItemSet(snapshot, blockers);

    const itemResults: LegacyBookArtDryRunReadinessBatchItemResultV1[] = [];
    for (const item of [...snapshot.items].sort(compareSnapshotItems)) {
      const receipt = await assessLegacyBookArtDryRunReadiness(
        item.registrationInput,
        item.sourceBytes,
      );
      blockers.push(
        ...receipt.blockers.map((blocker) => `${item.itemId}: ${blocker}`),
      );
      warnings.push(
        ...receipt.warnings.map((warning) => `${item.itemId}: ${warning}`),
      );
      const itemWithoutFingerprint = {
        itemId: item.itemId,
        ...(item.registrationId === undefined
          ? {}
          : { registrationId: item.registrationId }),
        ...(item.sourcePath === undefined ? {} : { sourcePath: item.sourcePath }),
        submittedSourceContentSha256: item.sourceContentSha256,
        submittedSourceByteLength: item.sourceBytes.byteLength,
        registrationInputFingerprintSha256:
          item.registrationInputFingerprintSha256,
        receipt,
      };
      itemResults.push({
        ...itemWithoutFingerprint,
        itemFingerprintSha256: fingerprint(itemWithoutFingerprint),
      });
    }

    rejectReplayedRegistrationPlans(itemResults, blockers);
    return completeBatch(snapshot, itemResults, blockers, warnings);
  } catch {
    return blockedBatch([
      "Legacy Book Art dry-run readiness batch input could not be inspected safely.",
    ]);
  }
}

function snapshotBatch(
  value: unknown,
  blockers: string[],
): SnapshotBatch | undefined {
  const source = dataRecord(value, "batch input", blockers, INPUT_FIELDS);
  if (!source) return undefined;

  const rawItems = dataArray(source.items, "batch items", blockers, MAXIMUM_ITEMS);
  const items: SnapshotItem[] = [];
  let totalBytes = 0;

  for (let index = 0; index < rawItems.length; index += 1) {
    const itemSource = dataRecord(
      rawItems[index],
      `batch items[${index}]`,
      blockers,
      ITEM_FIELDS,
    );
    if (!itemSource) continue;

    const itemId = stringValue(itemSource.itemId);
    if (!SAFE_ID.test(itemId)) {
      blockers.push(`batch items[${index}].itemId is invalid.`);
    }

    const registrationInput = cloneJson(
      itemSource.registrationInput,
      `batch items[${index}].registrationInput`,
      blockers,
      { nodes: 0, seen: new WeakSet<object>() },
      0,
    );
    const sourceBytes = copyBytes(
      itemSource.sourceBytes,
      `batch items[${index}].sourceBytes`,
      blockers,
    );
    totalBytes += sourceBytes.byteLength;
    if (totalBytes > MAXIMUM_TOTAL_BYTES) {
      blockers.push(
        `Legacy Book Art readiness batch source bytes exceed ${MAXIMUM_TOTAL_BYTES} bytes.`,
      );
    }

    const registrationRecord = plainRecord(registrationInput);
    const sourceContentSha256 = sha256(sourceBytes);
    const registrationInputFingerprintSha256 = fingerprint(registrationInput);
    items.push({
      itemId,
      registrationInput,
      sourceBytes,
      sourceContentSha256,
      registrationInputFingerprintSha256,
      ...optionalString(registrationRecord?.registrationId, "registrationId"),
      ...optionalString(registrationRecord?.sourcePath, "sourcePath"),
      ...optionalString(registrationRecord?.sourceRepository, "sourceRepository"),
      ...optionalString(registrationRecord?.sourceCommitSha, "sourceCommitSha"),
      ...optionalString(registrationRecord?.registeredAt, "registeredAt"),
      sortKey: fingerprint({
        itemId,
        registrationInputFingerprintSha256,
        sourceContentSha256,
      }),
    });
  }

  const snapshot: SnapshotBatch = {
    batchId: stringValue(source.batchId),
    sourceRepository: source.sourceRepository === "EVAVO-STUDIO/Website"
      ? source.sourceRepository
      : "EVAVO-STUDIO/Website",
    sourceCommitSha: stringValue(source.sourceCommitSha),
    compiledAt: stringValue(source.compiledAt),
    compiledBy: stringValue(source.compiledBy),
    items,
  };
  validateBatchIdentity(source, snapshot, blockers);
  return snapshot;
}

function validateBatchIdentity(
  source: Record<string, unknown>,
  snapshot: SnapshotBatch,
  blockers: string[],
): void {
  if (
    source.outputKind !==
      "evavo_legacy_book_art_dry_run_readiness_batch_input" ||
    source.schemaVersion !==
      LEGACY_BOOK_ART_DRY_RUN_READINESS_BATCH_SCHEMA_VERSION ||
    source.contract !== LEGACY_BOOK_ART_DRY_RUN_READINESS_BATCH_CONTRACT
  ) {
    blockers.push("Legacy Book Art readiness batch kind, version or contract is invalid.");
  }
  if (!SAFE_ID.test(snapshot.batchId)) {
    blockers.push("Legacy Book Art readiness batch batchId is invalid.");
  }
  if (source.sourceRepository !== "EVAVO-STUDIO/Website") {
    blockers.push(
      "Legacy Book Art readiness batch sourceRepository must be EVAVO-STUDIO/Website.",
    );
  }
  if (!COMMIT_SHA.test(snapshot.sourceCommitSha)) {
    blockers.push(
      "Legacy Book Art readiness batch sourceCommitSha must be one exact lowercase 40-character commit SHA.",
    );
  }
  if (!isTimestamp(snapshot.compiledAt)) {
    blockers.push(
      "Legacy Book Art readiness batch compiledAt must be canonical UTC ISO-8601.",
    );
  }
  if (
    !snapshot.compiledBy ||
    snapshot.compiledBy.length > 300 ||
    snapshot.compiledBy.trim() !== snapshot.compiledBy ||
    /[\u0000-\u001f\u007f]/u.test(snapshot.compiledBy)
  ) {
    blockers.push("Legacy Book Art readiness batch compiledBy is invalid.");
  }
  for (const field of AUTHORITY_FIELDS) {
    if (source[field] !== false) {
      blockers.push(`Legacy Book Art readiness batch ${field} must remain false.`);
    }
  }
  if (snapshot.items.length === 0) {
    blockers.push("Legacy Book Art readiness batch requires at least one item.");
  }
}

function validateItemSet(snapshot: SnapshotBatch, blockers: string[]): void {
  const itemIds = new Set<string>();
  const registrationIds = new Set<string>();
  for (const item of snapshot.items) {
    if (itemIds.has(item.itemId)) {
      blockers.push(`Legacy Book Art readiness batch itemId ${item.itemId} is duplicated.`);
    }
    itemIds.add(item.itemId);

    if (item.registrationId === undefined || !SAFE_ID.test(item.registrationId)) {
      blockers.push(`${item.itemId}: registrationInput.registrationId is invalid.`);
    } else if (registrationIds.has(item.registrationId)) {
      blockers.push(
        `${item.itemId}: registrationInput.registrationId ${item.registrationId} is duplicated.`,
      );
    } else {
      registrationIds.add(item.registrationId);
    }

    if (item.sourceRepository !== snapshot.sourceRepository) {
      blockers.push(
        `${item.itemId}: registrationInput.sourceRepository differs from the batch source repository.`,
      );
    }
    if (item.sourceCommitSha !== snapshot.sourceCommitSha) {
      blockers.push(
        `${item.itemId}: registrationInput.sourceCommitSha differs from the batch source commit.`,
      );
    }
    if (
      item.registeredAt !== undefined &&
      isTimestamp(item.registeredAt) &&
      isTimestamp(snapshot.compiledAt) &&
      Date.parse(item.registeredAt) > Date.parse(snapshot.compiledAt)
    ) {
      blockers.push(
        `${item.itemId}: registrationInput.registeredAt occurs after batch compiledAt.`,
      );
    }
  }
}

function rejectReplayedRegistrationPlans(
  items: LegacyBookArtDryRunReadinessBatchItemResultV1[],
  blockers: string[],
): void {
  const owners = new Map<string, string>();
  for (const item of items) {
    const fingerprintValue = item.receipt.registrationPlanFingerprintSha256;
    if (fingerprintValue === undefined) continue;
    const owner = owners.get(fingerprintValue);
    if (owner !== undefined) {
      blockers.push(
        `Legacy Book Art readiness registration plan is replayed by ${owner} and ${item.itemId}.`,
      );
    } else {
      owners.set(fingerprintValue, item.itemId);
    }
  }
}

function completeBatch(
  snapshot: SnapshotBatch,
  items: LegacyBookArtDryRunReadinessBatchItemResultV1[],
  blockers: string[],
  warnings: string[],
): LegacyBookArtDryRunReadinessBatchResultV1 {
  const readyCount = items.filter((item) => item.receipt.status === "ready").length;
  const blockedCount = items.length - readyCount;
  const normalizedBlockers = unique(blockers);
  const normalizedWarnings = unique(warnings);
  const allItemsReady = items.length > 0 && blockedCount === 0;
  const status: "blocked" | "ready" =
    normalizedBlockers.length === 0 && allItemsReady
      ? "ready"
      : "blocked";
  const receiptSetFingerprintSha256 = fingerprint(
    items.map((item) => ({
      itemId: item.itemId,
      itemFingerprintSha256: item.itemFingerprintSha256,
      readinessFingerprintSha256: item.receipt.readinessFingerprintSha256,
    })),
  );
  const unsigned = {
    outputKind: "evavo_legacy_book_art_dry_run_readiness_batch_result" as const,
    schemaVersion: LEGACY_BOOK_ART_DRY_RUN_READINESS_BATCH_SCHEMA_VERSION,
    contract: LEGACY_BOOK_ART_DRY_RUN_READINESS_BATCH_CONTRACT,
    status,
    batchId: snapshot.batchId,
    sourceRepository: snapshot.sourceRepository,
    sourceCommitSha: snapshot.sourceCommitSha,
    compiledAt: snapshot.compiledAt,
    compiledBy: snapshot.compiledBy,
    itemCount: items.length,
    readyCount,
    blockedCount,
    totalSourceByteLength: items.reduce(
      (total, item) => total + item.submittedSourceByteLength,
      0,
    ),
    allItemsReady,
    items,
    blockers: normalizedBlockers,
    warnings: normalizedWarnings,
    receiptSetFingerprintSha256,
    dryRunOnly: true as const,
    sourceArtifactWriteAttempted: false as const,
    evidenceArtifactWriteAttempted: false as const,
    providerCallPerformed: false as const,
    selectionPerformed: false as const,
    promotionPerformed: false as const,
    bookUseBindingCreated: false as const,
    canonicalWriterChanged: false as const,
    runtimeCutoverApproved: false as const,
    publicationPerformed: false as const,
  };
  return {
    ...unsigned,
    batchFingerprintSha256: fingerprint(unsigned),
  };
}

function blockedBatch(
  blockers: string[],
): LegacyBookArtDryRunReadinessBatchResultV1 {
  return completeBatch(
    {
      batchId: "",
      sourceRepository: "EVAVO-STUDIO/Website",
      sourceCommitSha: "",
      compiledAt: "",
      compiledBy: "",
      items: [],
    },
    [],
    blockers,
    [],
  );
}

function dataRecord(
  value: unknown,
  label: string,
  blockers: string[],
  allowedFields: ReadonlySet<string>,
): Record<string, unknown> | undefined {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      blockers.push(`${label} must be one plain object.`);
      return undefined;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      blockers.push(`${label} must use a plain-object prototype.`);
      return undefined;
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      blockers.push(`${label} must not contain symbol properties.`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(descriptors);
    if (keys.length > MAXIMUM_OBJECT_PROPERTIES) {
      blockers.push(`${label} exceeds the property budget.`);
      return undefined;
    }
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      if (!allowedFields.has(key)) {
        blockers.push(`${label} contains unsupported field ${key}.`);
      }
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        blockers.push(`${label}.${key} must be an enumerable data property.`);
        continue;
      }
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    blockers.push(`${label} could not be inspected safely.`);
    return undefined;
  }
}

function dataArray(
  value: unknown,
  label: string,
  blockers: string[],
  maximumItems: number,
): unknown[] {
  try {
    if (!Array.isArray(value)) {
      blockers.push(`${label} must be one array.`);
      return [];
    }
    if (value.length > maximumItems) {
      blockers.push(`${label} exceeds ${maximumItems} items.`);
      return [];
    }
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      blockers.push(`${label} must use the standard array prototype.`);
      return [];
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      blockers.push(`${label} must not contain symbol properties.`);
      return [];
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (key === "length" || /^\d+$/u.test(key)) continue;
      if (descriptor.enumerable) {
        blockers.push(`${label} contains unsupported array property ${key}.`);
        return [];
      }
    }
    const result: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        blockers.push(`${label} must not contain sparse slots or accessors.`);
        return [];
      }
      result.push(descriptor.value);
    }
    return result;
  } catch {
    blockers.push(`${label} could not be inspected safely.`);
    return [];
  }
}

function cloneJson(
  value: unknown,
  label: string,
  blockers: string[],
  budget: CloneBudget,
  depth: number,
): unknown {
  if (depth > MAXIMUM_JSON_DEPTH || budget.nodes > MAXIMUM_JSON_NODES) {
    blockers.push(`${label} exceeds the JSON snapshot budget.`);
    return null;
  }
  budget.nodes += 1;
  if (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (typeof value === "string") {
    if (value.length > MAXIMUM_STRING_LENGTH) {
      blockers.push(`${label} exceeds the string-length budget.`);
      return "";
    }
    return value;
  }
  if (!value || typeof value !== "object") {
    blockers.push(`${label} must contain only JSON-compatible data.`);
    return null;
  }
  if (budget.seen.has(value)) {
    blockers.push(`${label} must not contain cycles or shared object aliases.`);
    return null;
  }
  budget.seen.add(value);

  try {
    if (Array.isArray(value)) {
      const entries = dataArray(value, label, blockers, MAXIMUM_JSON_NODES);
      return entries.map((entry, index) =>
        cloneJson(
          entry,
          `${label}[${index}]`,
          blockers,
          budget,
          depth + 1,
        ),
      );
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      blockers.push(`${label} must contain only plain JSON objects.`);
      return null;
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      blockers.push(`${label} must not contain symbol properties.`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(descriptors).sort();
    if (keys.length > MAXIMUM_OBJECT_PROPERTIES) {
      blockers.push(`${label} exceeds the property budget.`);
      return null;
    }
    const output: Record<string, unknown> = {};
    for (const key of keys) {
      if (
        !key ||
        key.includes("\0") ||
        ["__proto__", "prototype", "constructor"].includes(key)
      ) {
        blockers.push(`${label} contains an unsafe object key.`);
        continue;
      }
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        blockers.push(`${label}.${key} must be an enumerable data property.`);
        continue;
      }
      output[key] = cloneJson(
        descriptor.value,
        `${label}.${key}`,
        blockers,
        budget,
        depth + 1,
      );
    }
    return output;
  } catch {
    blockers.push(`${label} could not be inspected safely.`);
    return null;
  }
}

function copyBytes(
  value: unknown,
  label: string,
  blockers: string[],
): Uint8Array {
  try {
    if (!(value instanceof Uint8Array)) {
      blockers.push(`${label} must be one Uint8Array.`);
      return new Uint8Array();
    }
    const byteLength = value.byteLength;
    if (byteLength <= 0 || byteLength > MAXIMUM_ITEM_BYTES) {
      blockers.push(`${label} must contain 1 to ${MAXIMUM_ITEM_BYTES} bytes.`);
      return new Uint8Array();
    }
    const output = new Uint8Array(byteLength);
    output.set(value);
    return output;
  } catch {
    blockers.push(`${label} could not be copied safely.`);
    return new Uint8Array();
  }
}

function plainRecord(value: unknown): Record<string, unknown> | undefined {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null
      ? value as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function optionalString<K extends string>(
  value: unknown,
  key: K,
): Partial<Record<K, string>> {
  return typeof value === "string"
    ? { [key]: value } as Record<K, string>
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isTimestamp(value: string): boolean {
  if (!ISO_TIMESTAMP.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function compareSnapshotItems(left: SnapshotItem, right: SnapshotItem): number {
  return left.itemId.localeCompare(right.itemId) ||
    left.sortKey.localeCompare(right.sortKey);
}

function fingerprint(value: unknown): string {
  return sha256(stableStringify(normalizeJson(value)));
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))].sort();
}
