import type {
  LegacyWebsiteBookArtStateImportInputV1,
  LegacyWebsiteBookArtStateImportResultV1,
} from "./book-production-legacy-state-import-safe.js";
import { importLegacyWebsiteBookArtState } from "./book-production-legacy-state-import-safe.js";

export interface LegacyWebsiteBookArtBatchItemV1 {
  migrationItemId: string;
  sourceRecordFingerprint: string;
  input: LegacyWebsiteBookArtStateImportInputV1;
}

export interface LegacyWebsiteBookArtBatchInputV1 {
  outputKind: "evavo_legacy_website_book_art_batch_input";
  schemaVersion: 1;
  batchId: string;
  sourceRepository: "EVAVO-STUDIO/Website";
  sourceCommit: string;
  expectedMigrationItemIds: string[];
  items: LegacyWebsiteBookArtBatchItemV1[];
}

export interface LegacyWebsiteBookArtBatchItemResultV1 {
  migrationItemId: string;
  sourceRecordFingerprint: string;
  importResult: LegacyWebsiteBookArtStateImportResultV1;
}

export interface LegacyWebsiteBookArtBatchResultV1 {
  outputKind: "evavo_legacy_website_book_art_batch_result";
  schemaVersion: 1;
  status: "blocked" | "needs_resolution" | "ready_for_promotion_review";
  batchId: string;
  sourceRepository: "EVAVO-STUDIO/Website";
  sourceCommit: string;
  expectedMigrationItemIds: string[];
  processedMigrationItemIds: string[];
  missingMigrationItemIds: string[];
  unexpectedMigrationItemIds: string[];
  duplicateMigrationItemIds: string[];
  itemResults: LegacyWebsiteBookArtBatchItemResultV1[];
  counts: {
    expected: number;
    processed: number;
    candidateImported: number;
    selectionEvidenceImported: number;
    blocked: number;
  };
  blockers: string[];
  warnings: string[];
  batchFingerprint: string;
  authoritativeWritesPerformed: false;
  promotionRequired: true;
  artifactBytesRewritten: false;
  publicationPerformed: false;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/;
const MAXIMUM_ITEMS = 10_000;

export async function importLegacyWebsiteBookArtStateBatch(
  input: LegacyWebsiteBookArtBatchInputV1,
): Promise<LegacyWebsiteBookArtBatchResultV1> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const batchId = text(input?.batchId);
  const sourceCommit = text(input?.sourceCommit);
  const expectedIds = stringArray(input?.expectedMigrationItemIds).sort();
  const items = Array.isArray(input?.items) ? input.items : [];

  if (input?.outputKind !== "evavo_legacy_website_book_art_batch_input" || input?.schemaVersion !== 1) blockers.push("Legacy Website Book Art batch kind or version is invalid.");
  if (!isSafeId(batchId)) blockers.push("Legacy Website Book Art batchId is invalid.");
  if (input?.sourceRepository !== "EVAVO-STUDIO/Website") blockers.push("Legacy Website Book Art batch source repository is invalid.");
  if (!COMMIT_SHA.test(sourceCommit)) blockers.push("Legacy Website Book Art batch source commit must be an exact lowercase Git commit SHA.");
  if (!expectedIds.length || expectedIds.length > MAXIMUM_ITEMS) blockers.push(`Legacy Website Book Art batch requires 1-${MAXIMUM_ITEMS} expected item IDs.`);
  if (!Array.isArray(input?.expectedMigrationItemIds) || input.expectedMigrationItemIds.some((id) => !isSafeId(id))) blockers.push("Legacy Website Book Art expected item IDs are invalid.");
  if (!Array.isArray(input?.items) || items.length > MAXIMUM_ITEMS) blockers.push(`Legacy Website Book Art batch items must be an array of at most ${MAXIMUM_ITEMS} records.`);

  const duplicateExpected = duplicates(expectedIds);
  const itemIds = items.map((item) => text(item?.migrationItemId));
  const duplicateItems = duplicates(itemIds);
  const expectedSet = new Set(expectedIds);
  const itemSet = new Set(itemIds);
  const missing = [...expectedSet].filter((id) => !itemSet.has(id)).sort();
  const unexpected = [...itemSet].filter((id) => !expectedSet.has(id)).sort();
  if (duplicateExpected.length) blockers.push(`Legacy Website Book Art expected item IDs are duplicated: ${duplicateExpected.join(", ")}.`);
  if (duplicateItems.length) blockers.push(`Legacy Website Book Art migration item IDs are duplicated: ${duplicateItems.join(", ")}.`);
  if (missing.length) blockers.push(`Legacy Website Book Art batch is missing expected items: ${missing.join(", ")}.`);
  if (unexpected.length) blockers.push(`Legacy Website Book Art batch contains unexpected items: ${unexpected.join(", ")}.`);

  for (const item of items) {
    if (!isSafeId(item?.migrationItemId)) blockers.push("Legacy Website Book Art migrationItemId is invalid.");
    if (!isSha(item?.sourceRecordFingerprint)) blockers.push(`Legacy Website Book Art item ${text(item?.migrationItemId) || "unknown"} source record fingerprint is invalid.`);
    if (!item?.input || typeof item.input !== "object") blockers.push(`Legacy Website Book Art item ${text(item?.migrationItemId) || "unknown"} import input is missing.`);
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
    .map((item): LegacyWebsiteBookArtBatchItemResultV1 => ({
      migrationItemId: item.migrationItemId,
      sourceRecordFingerprint: item.sourceRecordFingerprint,
      importResult: importLegacyWebsiteBookArtState(item.input),
    }));
  for (const result of itemResults) warnings.push(...result.importResult.warnings.map((warning) => `${result.migrationItemId}: ${warning}`));
  const itemBlockers = itemResults.flatMap((result) => result.importResult.blockers.map((blocker) => `${result.migrationItemId}: ${blocker}`));
  return seal({
    status: itemBlockers.length ? "needs_resolution" : "ready_for_promotion_review",
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

async function seal(input: {
  status: LegacyWebsiteBookArtBatchResultV1["status"];
  batchId: string;
  sourceCommit: string;
  expectedIds: string[];
  processedIds: string[];
  missing: string[];
  unexpected: string[];
  duplicateIds: string[];
  itemResults: LegacyWebsiteBookArtBatchItemResultV1[];
  blockers: string[];
  warnings: string[];
}): Promise<LegacyWebsiteBookArtBatchResultV1> {
  const itemResults = [...input.itemResults].sort((a, b) => a.migrationItemId.localeCompare(b.migrationItemId));
  const withoutFingerprint: Omit<LegacyWebsiteBookArtBatchResultV1, "batchFingerprint"> = {
    outputKind: "evavo_legacy_website_book_art_batch_result",
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
      candidateImported: itemResults.filter((item) => item.importResult.status === "candidate_imported").length,
      selectionEvidenceImported: itemResults.filter((item) => item.importResult.status === "selection_evidence_imported").length,
      blocked: itemResults.filter((item) => item.importResult.status === "blocked").length,
    },
    blockers: unique(input.blockers),
    warnings: unique(input.warnings),
    authoritativeWritesPerformed: false,
    promotionRequired: true,
    artifactBytesRewritten: false,
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
