import type {
  LegacyWebsiteBookArtworkUseImportInputV1,
  LegacyWebsiteBookArtworkUseImportResultV1,
} from "./book-studio-legacy-art-use-safe";
import { importLegacyWebsiteBookArtworkUse } from "./book-studio-legacy-art-use-safe";

export interface LegacyWebsiteBookArtworkUseBatchItemV1 {
  migrationItemId: string;
  sourceRecordFingerprint: string;
  input: LegacyWebsiteBookArtworkUseImportInputV1;
}

export interface LegacyWebsiteBookArtworkUseBatchInputV1 {
  outputKind: "evavo_legacy_website_book_artwork_use_batch_input";
  schemaVersion: 1;
  batchId: string;
  sourceRepository: "EVAVO-STUDIO/Website";
  sourceCommit: string;
  expectedMigrationItemIds: string[];
  items: LegacyWebsiteBookArtworkUseBatchItemV1[];
}

export interface LegacyWebsiteBookArtworkUseBatchItemResultV1 {
  migrationItemId: string;
  sourceRecordFingerprint: string;
  importResult: LegacyWebsiteBookArtworkUseImportResultV1;
}

export interface LegacyWebsiteBookArtworkUseBatchResultV1 {
  outputKind: "evavo_legacy_website_book_artwork_use_batch_result";
  schemaVersion: 1;
  status: "blocked" | "needs_resolution" | "ready_for_persistence";
  batchId: string;
  sourceRepository: "EVAVO-STUDIO/Website";
  sourceCommit: string;
  expectedMigrationItemIds: string[];
  processedMigrationItemIds: string[];
  missingMigrationItemIds: string[];
  unexpectedMigrationItemIds: string[];
  duplicateMigrationItemIds: string[];
  itemResults: LegacyWebsiteBookArtworkUseBatchItemResultV1[];
  counts: {
    expected: number;
    processed: number;
    ready: number;
    blocked: number;
  };
  blockers: string[];
  warnings: string[];
  batchFingerprint: string;
  authoritativeWritesPerformed: false;
  bindingsPersisted: false;
  canonicalRendererMustVerifyBytes: true;
  publicationPerformed: false;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/;
const MAXIMUM_ITEMS = 10_000;

export async function importLegacyWebsiteBookArtworkUseBatch(
  input: LegacyWebsiteBookArtworkUseBatchInputV1,
): Promise<LegacyWebsiteBookArtworkUseBatchResultV1> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const batchId = text(input?.batchId);
  const sourceCommit = text(input?.sourceCommit);
  const expectedIds = stringArray(input?.expectedMigrationItemIds).sort();
  const items = Array.isArray(input?.items) ? input.items : [];

  if (input?.outputKind !== "evavo_legacy_website_book_artwork_use_batch_input" || input?.schemaVersion !== 1) blockers.push("Legacy Website Book artwork-use batch kind or version is invalid.");
  if (!isSafeId(batchId)) blockers.push("Legacy Website Book artwork-use batchId is invalid.");
  if (input?.sourceRepository !== "EVAVO-STUDIO/Website") blockers.push("Legacy Website Book artwork-use batch source repository is invalid.");
  if (!COMMIT_SHA.test(sourceCommit)) blockers.push("Legacy Website Book artwork-use batch source commit must be an exact lowercase Git commit SHA.");
  if (!expectedIds.length || expectedIds.length > MAXIMUM_ITEMS) blockers.push(`Legacy Website Book artwork-use batch requires 1-${MAXIMUM_ITEMS} expected item IDs.`);
  if (!Array.isArray(input?.expectedMigrationItemIds) || input.expectedMigrationItemIds.some((id) => !isSafeId(id))) blockers.push("Legacy Website Book artwork-use expected item IDs are invalid.");
  if (!Array.isArray(input?.items) || items.length > MAXIMUM_ITEMS) blockers.push(`Legacy Website Book artwork-use batch items must be an array of at most ${MAXIMUM_ITEMS} records.`);

  const duplicateExpected = duplicates(expectedIds);
  const itemIds = items.map((item) => text(item?.migrationItemId));
  const duplicateItems = duplicates(itemIds);
  const expectedSet = new Set(expectedIds);
  const itemSet = new Set(itemIds);
  const missing = [...expectedSet].filter((id) => !itemSet.has(id)).sort();
  const unexpected = [...itemSet].filter((id) => !expectedSet.has(id)).sort();
  if (duplicateExpected.length) blockers.push(`Legacy Website Book artwork-use expected item IDs are duplicated: ${duplicateExpected.join(", ")}.`);
  if (duplicateItems.length) blockers.push(`Legacy Website Book artwork-use migration item IDs are duplicated: ${duplicateItems.join(", ")}.`);
  if (missing.length) blockers.push(`Legacy Website Book artwork-use batch is missing expected items: ${missing.join(", ")}.`);
  if (unexpected.length) blockers.push(`Legacy Website Book artwork-use batch contains unexpected items: ${unexpected.join(", ")}.`);

  for (const item of items) {
    if (!isSafeId(item?.migrationItemId)) blockers.push("Legacy Website Book artwork-use migrationItemId is invalid.");
    if (!isSha(item?.sourceRecordFingerprint)) blockers.push(`Legacy Website Book artwork-use item ${text(item?.migrationItemId) || "unknown"} source record fingerprint is invalid.`);
    if (!item?.input || typeof item.input !== "object") {
      blockers.push(`Legacy Website Book artwork-use item ${text(item?.migrationItemId) || "unknown"} import input is missing.`);
      continue;
    }
    const expectedFingerprint = await fingerprintLegacyWebsiteBookArtworkUseSourceRecord(item.input);
    if (normalizeSha(item.sourceRecordFingerprint) !== expectedFingerprint) blockers.push(`Legacy Website Book artwork-use item ${item.migrationItemId} source record fingerprint does not match its exact canonical input.`);
  }

  const uniqueBlockers = unique(blockers);
  if (uniqueBlockers.length) {
    return seal({
      status: "blocked",
      batchId,
      sourceCommit,
      expectedIds,
      processedIds: [],
      missing,
      unexpected,
      duplicateIds: unique([...duplicateExpected, ...duplicateItems]),
      itemResults: [],
      blockers: uniqueBlockers,
      warnings,
    });
  }

  const itemResults = [...items]
    .sort((first, second) => first.migrationItemId.localeCompare(second.migrationItemId))
    .map((item): LegacyWebsiteBookArtworkUseBatchItemResultV1 => ({
      migrationItemId: item.migrationItemId,
      sourceRecordFingerprint: item.sourceRecordFingerprint,
      importResult: importLegacyWebsiteBookArtworkUse(item.input),
    }));
  for (const result of itemResults) warnings.push(...result.importResult.warnings.map((warning) => `${result.migrationItemId}: ${warning}`));
  const itemBlockers = itemResults.flatMap((result) => result.importResult.blockers.map((blocker) => `${result.migrationItemId}: ${blocker}`));
  return seal({
    status: itemBlockers.length ? "needs_resolution" : "ready_for_persistence",
    batchId,
    sourceCommit,
    expectedIds,
    processedIds: itemResults.map((item) => item.migrationItemId),
    missing: [],
    unexpected: [],
    duplicateIds: [],
    itemResults,
    blockers: itemBlockers,
    warnings,
  });
}

export async function fingerprintLegacyWebsiteBookArtworkUseSourceRecord(value: unknown): Promise<string> {
  return sha256(canonicalJson(value));
}

async function seal(input: {
  status: LegacyWebsiteBookArtworkUseBatchResultV1["status"];
  batchId: string;
  sourceCommit: string;
  expectedIds: string[];
  processedIds: string[];
  missing: string[];
  unexpected: string[];
  duplicateIds: string[];
  itemResults: LegacyWebsiteBookArtworkUseBatchItemResultV1[];
  blockers: string[];
  warnings: string[];
}): Promise<LegacyWebsiteBookArtworkUseBatchResultV1> {
  const itemResults = [...input.itemResults].sort((a, b) => a.migrationItemId.localeCompare(b.migrationItemId));
  const withoutFingerprint: Omit<LegacyWebsiteBookArtworkUseBatchResultV1, "batchFingerprint"> = {
    outputKind: "evavo_legacy_website_book_artwork_use_batch_result",
    schemaVersion: 1,
    status: input.status,
    batchId: input.batchId,
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommit: input.sourceCommit,
    expectedMigrationItemIds: [...input.expectedIds].sort(),
    processedMigrationItemIds: [...input.processedIds].sort(),
    missingMigrationItemIds: [...input.missing].sort(),
    unexpectedMigrationItemIds: [...input.unexpected].sort(),
    duplicateMigrationItemIds: [...input.duplicateIds].sort(),
    itemResults,
    counts: {
      expected: input.expectedIds.length,
      processed: itemResults.length,
      ready: itemResults.filter((item) => item.importResult.status === "ready").length,
      blocked: itemResults.filter((item) => item.importResult.status === "blocked").length,
    },
    blockers: unique(input.blockers),
    warnings: unique(input.warnings),
    authoritativeWritesPerformed: false,
    bindingsPersisted: false,
    canonicalRendererMustVerifyBytes: true,
    publicationPerformed: false,
  };
  return { ...withoutFingerprint, batchFingerprint: await sha256(canonicalJson(withoutFingerprint)) };
}

function canonicalJson(value: unknown): string { return JSON.stringify(canonical(value)); }
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}
async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function normalizeSha(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/^sha256:/, "");
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : undefined;
}
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function unique(values: string[]): string[] { return [...new Set(values.map((item) => item.trim()).filter(Boolean))]; }
function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const value of values) seen.has(value) ? duplicated.add(value) : seen.add(value);
  return [...duplicated].sort();
}
function isSafeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value) && !["__proto__", "constructor", "prototype"].includes(value);
}
function isSha(value: unknown): value is string { return typeof value === "string" && SHA256.test(value); }
