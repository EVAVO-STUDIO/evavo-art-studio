import type {
  BookArtArtifactReceiptV1,
  BookArtIdentityV1,
  BookArtPurpose,
} from "./book-studio-art-contracts";
import type {
  LegacyWebsiteBookArtworkUseImportInputV1,
  LegacyWebsiteBookArtworkUseImportResultV1,
} from "./book-studio-legacy-art-use-safe";
import { importLegacyWebsiteBookArtworkUse } from "./book-studio-legacy-art-use-safe";
import type {
  LegacyWebsiteBookArtworkUseBatchInputV1,
} from "./book-studio-legacy-art-use-batch";
import { fingerprintLegacyWebsiteBookArtworkUseSourceRecord } from "./book-studio-legacy-art-use-batch";

export interface WebsiteBookArtworkUseIntentV1 {
  outputKind: "evavo_legacy_website_book_artwork_use_intent";
  schemaVersion: 1;
  migrationItemId: string;
  identity: BookArtIdentityV1;
  purpose: BookArtPurpose;
  sourceBriefFingerprint: string;
  legacySelectionBinding: unknown;
  sceneOrPlacementId: string;
  cropOrPlacementSha256: string;
  boundAt: string;
  boundBy: string;
  useFingerprint: string;
}

export interface WebsiteBookArtworkUseIntentBatchItemV1 {
  migrationItemId: string;
  sourceRecordFingerprint: string;
  input: WebsiteBookArtworkUseIntentV1;
}

export interface WebsiteBookArtworkUseIntentBatchV1 {
  outputKind: "evavo_website_book_artwork_use_intent_batch";
  schemaVersion: 1;
  batchId: string;
  sourceRepository: "EVAVO-STUDIO/Website";
  sourceCommit: string;
  expectedMigrationItemIds: string[];
  items: WebsiteBookArtworkUseIntentBatchItemV1[];
}

export interface ArtStudioBookPromotionBatchItemV1 {
  migrationItemId: string;
  artifact: BookArtArtifactReceiptV1;
}

export interface ArtStudioBookPromotionBatchV1 {
  outputKind: "evavo_art_studio_book_promotion_batch";
  schemaVersion: 1;
  batchId: string;
  sourceArtImportBatchFingerprint: string;
  expectedMigrationItemIds: string[];
  items: ArtStudioBookPromotionBatchItemV1[];
  batchFingerprint: string;
}

export interface BookArtPromotionJoinItemResultV1 {
  migrationItemId: string;
  status: "ready" | "blocked";
  blockers: string[];
  warnings: string[];
  importResult: LegacyWebsiteBookArtworkUseImportResultV1;
}

export interface BookArtPromotionJoinResultV1 {
  outputKind: "evavo_book_art_promotion_join_result";
  schemaVersion: 1;
  status: "blocked" | "needs_resolution" | "ready_for_binding_validation";
  joinId: string;
  sourceRepository: "EVAVO-STUDIO/Website";
  sourceCommit: string;
  sourceManifestFingerprint: string;
  sourceArtImportBatchFingerprint: string;
  promotionBatchFingerprint: string;
  expectedMigrationItemIds: string[];
  processedMigrationItemIds: string[];
  missingUseIntentIds: string[];
  missingPromotionIds: string[];
  unexpectedUseIntentIds: string[];
  unexpectedPromotionIds: string[];
  duplicateMigrationItemIds: string[];
  itemResults: BookArtPromotionJoinItemResultV1[];
  docsSuiteBatchInput: LegacyWebsiteBookArtworkUseBatchInputV1;
  counts: {
    expected: number;
    processed: number;
    ready: number;
    blocked: number;
  };
  blockers: string[];
  warnings: string[];
  joinFingerprint: string;
  authoritativeWritesPerformed: false;
  bindingsPersisted: false;
  canonicalRendererMustVerifyBytes: true;
  publicationPerformed: false;
}

export interface BookArtPromotionJoinInputV1 {
  outputKind: "evavo_book_art_promotion_join_input";
  schemaVersion: 1;
  joinId: string;
  sourceManifestFingerprint: string;
  sourceArtImportBatchFingerprint: string;
  useIntents: WebsiteBookArtworkUseIntentBatchV1;
  promotions: ArtStudioBookPromotionBatchV1;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/;
const MAXIMUM_ITEMS = 10_000;

export async function joinBookArtPromotionsToUseIntents(
  input: BookArtPromotionJoinInputV1,
): Promise<BookArtPromotionJoinResultV1> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const joinId = text(input?.joinId);
  const sourceManifestFingerprint = normalizeSha(input?.sourceManifestFingerprint) ?? "";
  const sourceArtImportBatchFingerprint = normalizeSha(input?.sourceArtImportBatchFingerprint) ?? "";
  const useBatch = input?.useIntents;
  const promotionBatch = input?.promotions;
  const sourceCommit = text(useBatch?.sourceCommit);
  const useExpected = stringArray(useBatch?.expectedMigrationItemIds).sort();
  const promotionExpected = stringArray(promotionBatch?.expectedMigrationItemIds).sort();
  const expected = unique(useExpected).sort();
  const useItems = Array.isArray(useBatch?.items) ? useBatch.items : [];
  const promotionItems = Array.isArray(promotionBatch?.items) ? promotionBatch.items : [];

  if (input?.outputKind !== "evavo_book_art_promotion_join_input" || input?.schemaVersion !== 1) blockers.push("Book Art promotion join kind or version is invalid.");
  if (!isSafeId(joinId)) blockers.push("Book Art promotion joinId is invalid.");
  if (!isSha(input?.sourceManifestFingerprint)) blockers.push("Book Art promotion join source-manifest fingerprint is invalid.");
  if (!isSha(input?.sourceArtImportBatchFingerprint)) blockers.push("Book Art promotion join source Art-import batch fingerprint is invalid.");
  if (useBatch?.outputKind !== "evavo_website_book_artwork_use_intent_batch" || useBatch?.schemaVersion !== 1) blockers.push("Website Book artwork-use intent batch kind or version is invalid.");
  if (useBatch?.sourceRepository !== "EVAVO-STUDIO/Website") blockers.push("Website Book artwork-use intent batch source repository is invalid.");
  if (!COMMIT_SHA.test(sourceCommit)) blockers.push("Website Book artwork-use intent batch source commit is invalid.");
  if (promotionBatch?.outputKind !== "evavo_art_studio_book_promotion_batch" || promotionBatch?.schemaVersion !== 1) blockers.push("Art Studio Book promotion batch kind or version is invalid.");
  if (!isSafeId(text(useBatch?.batchId)) || !isSafeId(text(promotionBatch?.batchId))) blockers.push("Book Art source or promotion batch identity is invalid.");
  if (!isSha(promotionBatch?.sourceArtImportBatchFingerprint)) blockers.push("Art Studio promotion batch source Art-import fingerprint is invalid.");
  if (normalizeSha(promotionBatch?.sourceArtImportBatchFingerprint) !== sourceArtImportBatchFingerprint) blockers.push("Art Studio promotion batch is derived from a different source Art-import batch.");
  if (!isSha(promotionBatch?.batchFingerprint)) blockers.push("Art Studio promotion batch fingerprint is invalid.");
  else if (normalizeSha(promotionBatch.batchFingerprint) !== await fingerprintArtStudioBookPromotionBatch(promotionBatch)) blockers.push("Art Studio promotion batch fingerprint does not match its exact canonical contents.");
  if (!useExpected.length || useExpected.length > MAXIMUM_ITEMS || !useExpected.every(isSafeId)) blockers.push(`Book Art promotion join requires 1-${MAXIMUM_ITEMS} valid expected use IDs.`);
  if (!promotionExpected.length || promotionExpected.length > MAXIMUM_ITEMS || !promotionExpected.every(isSafeId)) blockers.push(`Art Studio Book promotion batch requires 1-${MAXIMUM_ITEMS} valid expected IDs.`);
  if (!sameSet(useExpected, promotionExpected)) blockers.push("Website use-intent and Art Studio promotion batches do not declare the same exact migration item set.");
  if (!Array.isArray(useBatch?.items) || useItems.length > MAXIMUM_ITEMS) blockers.push(`Website Book artwork-use intents must be an array of at most ${MAXIMUM_ITEMS} items.`);
  if (!Array.isArray(promotionBatch?.items) || promotionItems.length > MAXIMUM_ITEMS) blockers.push(`Art Studio Book promotion items must be an array of at most ${MAXIMUM_ITEMS} items.`);

  const duplicateExpected = unique([...duplicates(useExpected), ...duplicates(promotionExpected)]);
  const useIds = useItems.map((item) => text(item?.migrationItemId));
  const promotionIds = promotionItems.map((item) => text(item?.migrationItemId));
  const duplicateUse = duplicates(useIds);
  const duplicatePromotion = duplicates(promotionIds);
  const expectedSet = new Set(expected);
  const useSet = new Set(useIds);
  const promotionSet = new Set(promotionIds);
  const missingUse = [...expectedSet].filter((id) => !useSet.has(id)).sort();
  const missingPromotion = [...expectedSet].filter((id) => !promotionSet.has(id)).sort();
  const unexpectedUse = [...useSet].filter((id) => !expectedSet.has(id)).sort();
  const unexpectedPromotion = [...promotionSet].filter((id) => !expectedSet.has(id)).sort();
  if (duplicateExpected.length) blockers.push(`Book Art promotion join expected IDs are duplicated: ${duplicateExpected.join(", ")}.`);
  if (duplicateUse.length) blockers.push(`Website Book artwork-use intent IDs are duplicated: ${duplicateUse.join(", ")}.`);
  if (duplicatePromotion.length) blockers.push(`Art Studio Book promotion IDs are duplicated: ${duplicatePromotion.join(", ")}.`);
  if (missingUse.length) blockers.push(`Book Art promotion join is missing Website use intents: ${missingUse.join(", ")}.`);
  if (missingPromotion.length) blockers.push(`Book Art promotion join is missing Art Studio promotions: ${missingPromotion.join(", ")}.`);
  if (unexpectedUse.length) blockers.push(`Book Art promotion join contains unexpected Website use intents: ${unexpectedUse.join(", ")}.`);
  if (unexpectedPromotion.length) blockers.push(`Book Art promotion join contains unexpected Art Studio promotions: ${unexpectedPromotion.join(", ")}.`);

  for (const item of useItems) {
    if (!isSafeId(item?.migrationItemId)) blockers.push("Website Book artwork-use migration item identity is invalid.");
    if (item?.input?.outputKind !== "evavo_legacy_website_book_artwork_use_intent" || item?.input?.schemaVersion !== 1) blockers.push(`Website Book artwork-use item ${text(item?.migrationItemId) || "unknown"} intent kind or version is invalid.`);
    if (item?.input?.migrationItemId !== item?.migrationItemId) blockers.push(`Website Book artwork-use wrapper and input identity differ for ${text(item?.migrationItemId) || "unknown"}.`);
    if (!isSha(item?.sourceRecordFingerprint)) blockers.push(`Website Book artwork-use item ${text(item?.migrationItemId) || "unknown"} source fingerprint is invalid.`);
    const expectedFingerprint = await fingerprintWebsiteBookArtworkUseIntent(item?.input);
    if (normalizeSha(item?.sourceRecordFingerprint) !== expectedFingerprint) blockers.push(`Website Book artwork-use item ${text(item?.migrationItemId) || "unknown"} source fingerprint does not match its exact canonical intent.`);
  }
  for (const item of promotionItems) {
    if (!isSafeId(item?.migrationItemId)) blockers.push("Art Studio Book promotion migration item identity is invalid.");
    if (!item?.artifact || typeof item.artifact !== "object") blockers.push(`Art Studio Book promotion item ${text(item?.migrationItemId) || "unknown"} artifact is missing.`);
  }

  const structuralBlockers = unique(blockers);
  if (structuralBlockers.length) {
    return seal({
      status: "blocked",
      joinId,
      sourceCommit,
      sourceManifestFingerprint,
      sourceArtImportBatchFingerprint,
      promotionBatchFingerprint: normalizeSha(promotionBatch?.batchFingerprint) ?? "",
      expected,
      processedIds: [],
      missingUse,
      missingPromotion,
      unexpectedUse,
      unexpectedPromotion,
      duplicateIds: unique([...duplicateExpected, ...duplicateUse, ...duplicatePromotion]),
      itemResults: [],
      batchItems: [],
      blockers: structuralBlockers,
      warnings,
    });
  }

  const promotionsById = new Map<string, BookArtArtifactReceiptV1>(
    promotionItems.map((item): [string, BookArtArtifactReceiptV1] => [item.migrationItemId, item.artifact]),
  );
  const itemResults: BookArtPromotionJoinItemResultV1[] = [];
  const batchItems: LegacyWebsiteBookArtworkUseBatchInputV1["items"] = [];
  for (const item of [...useItems].sort((a, b) => a.migrationItemId.localeCompare(b.migrationItemId))) {
    const artifact = promotionsById.get(item.migrationItemId);
    if (!artifact) continue;
    const fullInput: LegacyWebsiteBookArtworkUseImportInputV1 = {
      outputKind: "evavo_legacy_website_book_artwork_use_import_input",
      schemaVersion: 1,
      identity: structuredClone(item.input.identity),
      purpose: item.input.purpose,
      sourceBriefFingerprint: item.input.sourceBriefFingerprint,
      legacySelectionBinding: structuredClone(item.input.legacySelectionBinding),
      promotedArtifact: structuredClone(artifact),
      sceneOrPlacementId: item.input.sceneOrPlacementId,
      cropOrPlacementSha256: item.input.cropOrPlacementSha256,
      boundAt: item.input.boundAt,
      boundBy: item.input.boundBy,
      useFingerprint: item.input.useFingerprint,
    };
    const importResult = importLegacyWebsiteBookArtworkUse(fullInput);
    itemResults.push({
      migrationItemId: item.migrationItemId,
      status: importResult.status,
      blockers: [...importResult.blockers],
      warnings: [...importResult.warnings],
      importResult,
    });
    if (importResult.status === "ready") {
      batchItems.push({
        migrationItemId: item.migrationItemId,
        sourceRecordFingerprint: await fingerprintLegacyWebsiteBookArtworkUseSourceRecord(fullInput),
        input: fullInput,
      });
    }
  }

  const itemBlockers = itemResults.flatMap((result) => result.blockers.map((blocker) => `${result.migrationItemId}: ${blocker}`));
  const allReady = itemResults.length === expected.length && itemResults.every((result) => result.status === "ready");
  return seal({
    status: allReady ? "ready_for_binding_validation" : "needs_resolution",
    joinId,
    sourceCommit,
    sourceManifestFingerprint,
    sourceArtImportBatchFingerprint,
    promotionBatchFingerprint: normalizeSha(promotionBatch.batchFingerprint) ?? "",
    expected,
    processedIds: itemResults.map((item) => item.migrationItemId),
    missingUse: [],
    missingPromotion: [],
    unexpectedUse: [],
    unexpectedPromotion: [],
    duplicateIds: [],
    itemResults,
    batchItems: allReady ? batchItems : [],
    blockers: itemBlockers,
    warnings: itemResults.flatMap((result) => result.warnings.map((warning) => `${result.migrationItemId}: ${warning}`)),
  });
}

export async function fingerprintWebsiteBookArtworkUseIntent(value: unknown): Promise<string> {
  return sha256(canonicalJson(value));
}

export async function fingerprintArtStudioBookPromotionBatch(
  value: Omit<ArtStudioBookPromotionBatchV1, "batchFingerprint"> | ArtStudioBookPromotionBatchV1,
): Promise<string> {
  const { batchFingerprint: _discarded, ...unsigned } = value as ArtStudioBookPromotionBatchV1;
  const normalized = {
    ...unsigned,
    expectedMigrationItemIds: [...stringArray(unsigned.expectedMigrationItemIds)].sort(),
    items: [...(Array.isArray(unsigned.items) ? unsigned.items : [])]
      .map((item) => ({ migrationItemId: item.migrationItemId, artifact: item.artifact }))
      .sort((a, b) => a.migrationItemId.localeCompare(b.migrationItemId)),
  };
  return sha256(canonicalJson(normalized));
}

async function seal(input: {
  status: BookArtPromotionJoinResultV1["status"];
  joinId: string;
  sourceCommit: string;
  sourceManifestFingerprint: string;
  sourceArtImportBatchFingerprint: string;
  promotionBatchFingerprint: string;
  expected: string[];
  processedIds: string[];
  missingUse: string[];
  missingPromotion: string[];
  unexpectedUse: string[];
  unexpectedPromotion: string[];
  duplicateIds: string[];
  itemResults: BookArtPromotionJoinItemResultV1[];
  batchItems: LegacyWebsiteBookArtworkUseBatchInputV1["items"];
  blockers: string[];
  warnings: string[];
}): Promise<BookArtPromotionJoinResultV1> {
  const itemResults = [...input.itemResults].sort((a, b) => a.migrationItemId.localeCompare(b.migrationItemId));
  const docsSuiteBatchInput: LegacyWebsiteBookArtworkUseBatchInputV1 = {
    outputKind: "evavo_legacy_website_book_artwork_use_batch_input",
    schemaVersion: 1,
    batchId: `${input.joinId}:bindings`,
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommit: input.sourceCommit,
    expectedMigrationItemIds: [...input.expected].sort(),
    items: [...input.batchItems].sort((a, b) => a.migrationItemId.localeCompare(b.migrationItemId)),
  };
  const withoutFingerprint: Omit<BookArtPromotionJoinResultV1, "joinFingerprint"> = {
    outputKind: "evavo_book_art_promotion_join_result",
    schemaVersion: 1,
    status: input.status,
    joinId: input.joinId,
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommit: input.sourceCommit,
    sourceManifestFingerprint: input.sourceManifestFingerprint,
    sourceArtImportBatchFingerprint: input.sourceArtImportBatchFingerprint,
    promotionBatchFingerprint: input.promotionBatchFingerprint,
    expectedMigrationItemIds: [...input.expected].sort(),
    processedMigrationItemIds: [...input.processedIds].sort(),
    missingUseIntentIds: [...input.missingUse].sort(),
    missingPromotionIds: [...input.missingPromotion].sort(),
    unexpectedUseIntentIds: [...input.unexpectedUse].sort(),
    unexpectedPromotionIds: [...input.unexpectedPromotion].sort(),
    duplicateMigrationItemIds: [...input.duplicateIds].sort(),
    itemResults,
    docsSuiteBatchInput,
    counts: {
      expected: input.expected.length,
      processed: itemResults.length,
      ready: itemResults.filter((item) => item.status === "ready").length,
      blocked: itemResults.filter((item) => item.status === "blocked").length,
    },
    blockers: unique(input.blockers),
    warnings: unique(input.warnings),
    authoritativeWritesPerformed: false,
    bindingsPersisted: false,
    canonicalRendererMustVerifyBytes: true,
    publicationPerformed: false,
  };
  return { ...withoutFingerprint, joinFingerprint: await sha256(canonicalJson(withoutFingerprint)) };
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
function sameSet(first: string[], second: string[]): boolean {
  const firstSet = new Set(first);
  const secondSet = new Set(second);
  return firstSet.size === secondSet.size && [...firstSet].every((item) => secondSet.has(item));
}
function isSafeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value) && !["__proto__", "constructor", "prototype"].includes(value);
}
function isSha(value: unknown): value is string { return typeof value === "string" && SHA256.test(value); }
