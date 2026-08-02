import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/;
const SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const LEGACY_REFERENCE = /^(?:book-cover-artifact|book-publication-artifact):\/\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const PURPOSES = new Set([
  "front_cover_art",
  "full_wrap_art",
  "interior_full_page_illustration",
  "interior_half_page_illustration",
  "interior_spot_illustration",
  "diagram",
  "map",
  "ornament",
]);
const QUALITY_STATUSES = new Set([
  "blocked",
  "rejected",
  "needs_revision",
  "shortlisted",
  "approved_for_composition",
]);
const MAXIMUM_ITEMS = 10_000;
const MAXIMUM_INPUT_BYTES = 32 * 1024 * 1024;

export function compileBookArtStateMigrationManifest(input) {
  const blockers = [];
  const warnings = [];
  const manifestId = text(input?.manifestId);
  const sourceCommit = text(input?.sourceCommit);
  const expectedIds = stringArray(input?.expectedMigrationItemIds).sort();
  const expectedUseIds = stringArray(input?.expectedBookUseMigrationItemIds).sort();
  const records = Array.isArray(input?.records) ? input.records : [];

  if (input?.outputKind !== "evavo_website_book_art_migration_source_input" || input?.schemaVersion !== 1) blockers.push("Book Art source manifest input kind or version is invalid.");
  if (!isSafeId(manifestId)) blockers.push("Book Art source manifest identity is invalid.");
  if (input?.sourceRepository !== "EVAVO-STUDIO/Website") blockers.push("Book Art source manifest repository must be EVAVO-STUDIO/Website.");
  if (!COMMIT_SHA.test(sourceCommit)) blockers.push("Book Art source manifest commit must be an exact lowercase Git commit SHA.");
  if (!expectedIds.length || expectedIds.length > MAXIMUM_ITEMS) blockers.push(`Book Art source manifest requires 1-${MAXIMUM_ITEMS} expected item IDs.`);
  if (!Array.isArray(input?.expectedMigrationItemIds) || input.expectedMigrationItemIds.some((id) => !isSafeId(id))) blockers.push("Book Art source manifest expected item IDs are invalid.");
  if (!Array.isArray(input?.expectedBookUseMigrationItemIds) || input.expectedBookUseMigrationItemIds.length > MAXIMUM_ITEMS || input.expectedBookUseMigrationItemIds.some((id) => !isSafeId(id))) blockers.push("Book Art source manifest expected Book Design use IDs are invalid.");
  if (!Array.isArray(input?.records) || records.length > MAXIMUM_ITEMS) blockers.push(`Book Art source manifest records must be an array of at most ${MAXIMUM_ITEMS} items.`);

  const recordIds = records.map((record) => text(record?.migrationItemId));
  const duplicateExpected = duplicates(expectedIds);
  const duplicateExpectedUse = duplicates(expectedUseIds);
  const duplicateRecords = duplicates(recordIds);
  const expectedSet = new Set(expectedIds);
  const expectedUseSet = new Set(expectedUseIds);
  const recordSet = new Set(recordIds);
  const missing = [...expectedSet].filter((id) => !recordSet.has(id)).sort();
  const unexpected = [...recordSet].filter((id) => !expectedSet.has(id)).sort();
  const useIdsOutsideSource = [...expectedUseSet].filter((id) => !expectedSet.has(id)).sort();
  if (duplicateExpected.length) blockers.push(`Book Art expected item IDs are duplicated: ${duplicateExpected.join(", ")}.`);
  if (duplicateExpectedUse.length) blockers.push(`Book Art expected Book Design use IDs are duplicated: ${duplicateExpectedUse.join(", ")}.`);
  if (duplicateRecords.length) blockers.push(`Book Art source records are duplicated: ${duplicateRecords.join(", ")}.`);
  if (missing.length) blockers.push(`Book Art source manifest is missing expected records: ${missing.join(", ")}.`);
  if (unexpected.length) blockers.push(`Book Art source manifest contains unexpected records: ${unexpected.join(", ")}.`);
  if (useIdsOutsideSource.length) blockers.push(`Book Art expected Book Design use IDs are not present in the full migration set: ${useIdsOutsideSource.join(", ")}.`);

  const normalizedRecords = [];
  for (const record of [...records].sort((a, b) => text(a?.migrationItemId).localeCompare(text(b?.migrationItemId)))) {
    const recordBlockers = validateRecord(record, expectedUseSet);
    blockers.push(...recordBlockers.map((message) => `${text(record?.migrationItemId) || "unknown"}: ${message}`));
    if (!recordBlockers.length) normalizedRecords.push(normalizeRecord(record));
  }

  const uniqueBlockers = unique(blockers);
  if (uniqueBlockers.length) {
    return seal({
      status: "blocked",
      manifestId,
      sourceCommit,
      expectedIds,
      expectedUseIds,
      missing,
      unexpected,
      duplicateIds: unique([...duplicateExpected, ...duplicateExpectedUse, ...duplicateRecords]),
      records: [],
      blockers: uniqueBlockers,
      warnings,
    });
  }

  return seal({
    status: "ready_for_destination_batch_compilation",
    manifestId,
    sourceCommit,
    expectedIds,
    expectedUseIds,
    missing: [],
    unexpected: [],
    duplicateIds: [],
    records: normalizedRecords,
    blockers: [],
    warnings,
  });
}

function validateRecord(record, expectedUseIds) {
  const blockers = [];
  const migrationItemId = text(record?.migrationItemId);
  const identity = object(record?.identity);
  const quality = object(record?.qualityAuthority);
  const candidateSet = object(record?.candidateSetAuthority);
  const binding = object(record?.selectionBinding);
  const useIntent = object(record?.bookUseIntent);
  const useExpected = expectedUseIds.has(migrationItemId);

  if (!isSafeId(migrationItemId)) blockers.push("migrationItemId is invalid.");
  validateIdentity(identity, blockers);
  if (!isSha(record?.sourceBriefFingerprint)) blockers.push("sourceBriefFingerprint is invalid.");
  if (!quality) blockers.push("qualityAuthority is required.");
  if (Boolean(candidateSet) !== Boolean(binding)) blockers.push("candidateSetAuthority and selectionBinding must either both be present or both be absent.");
  if (record?.requiresBookUseBinding !== true && record?.requiresBookUseBinding !== false) blockers.push("requiresBookUseBinding must be boolean.");
  if (record?.requiresBookUseBinding !== useExpected) blockers.push("requiresBookUseBinding does not match the declared expected Book Design use set.");
  if (useExpected && !useIntent) blockers.push("bookUseIntent is required for every expected Book Design use item.");
  if (!useExpected && useIntent) blockers.push("bookUseIntent is present for an item not declared in the expected Book Design use set.");

  if (quality) {
    const candidate = object(quality.candidate);
    const governed = object(quality.governedArtifact);
    const provenance = object(candidate?.provenance);
    if (quality.outputKind !== "book_cover_artwork_quality_authority" || quality.version !== "book_cover_artwork_quality_authority_v1") blockers.push("qualityAuthority kind or version is invalid.");
    if (!QUALITY_STATUSES.has(quality.status)) blockers.push("qualityAuthority status is invalid.");
    if (quality.projectId !== identity?.projectId) blockers.push("qualityAuthority belongs to a different project.");
    if (!isSha(quality.artDirectionDigestSha256) || !isSha(quality.authorityDigestSha256)) blockers.push("qualityAuthority digests are invalid.");
    if (!candidate || !isSafeId(candidate.candidateId)) blockers.push("qualityAuthority candidate identity is invalid.");
    if (!LEGACY_REFERENCE.test(text(candidate?.artifactReference))) blockers.push("qualityAuthority candidate artifact reference is not a retained legacy identity.");
    if (!governed || !LEGACY_REFERENCE.test(text(governed.reference))) blockers.push("qualityAuthority governed artifact reference is not a retained legacy identity.");
    if (!isSha(candidate?.expectedSha256) || !isSha(governed?.checksumSha256) || normalizeSha(candidate?.expectedSha256) !== normalizeSha(governed?.checksumSha256)) blockers.push("qualityAuthority candidate and governed artifact bytes differ.");
    if (candidate?.artifactReference !== governed?.reference) blockers.push("qualityAuthority candidate and governed artifact references differ.");
    if (!strictText(governed?.kind, 100) || !strictText(governed?.mimeType, 200)) blockers.push("qualityAuthority governed artifact kind or MIME type is invalid.");
    if (!Number.isSafeInteger(governed?.byteLength) || governed.byteLength < 1) blockers.push("qualityAuthority governed artifact byte length is invalid.");
    if (!Number.isInteger(governed?.widthPx) || governed.widthPx < 1 || !Number.isInteger(governed?.heightPx) || governed.heightPx < 1) blockers.push("qualityAuthority governed artifact dimensions are invalid.");
    if (!provenance || !strictText(provenance.origin, 100) || !strictText(provenance.rightsStatus, 100)) blockers.push("qualityAuthority candidate provenance is incomplete.");
  }

  if (candidateSet && binding && quality) {
    const candidate = object(quality.candidate);
    if (candidateSet.outputKind !== "book_cover_artwork_candidate_set_authority" || candidateSet.version !== "book_cover_artwork_candidate_set_authority_v1") blockers.push("candidateSetAuthority kind or version is invalid.");
    if (binding.outputKind !== "book_cover_artwork_selection_binding" || binding.version !== "book_cover_artwork_selection_binding_v1") blockers.push("selectionBinding kind or version is invalid.");
    if (candidateSet.status !== "selected_for_composition" || binding.status !== "selected_for_composition") blockers.push("selected legacy evidence must retain selected_for_composition status.");
    if (candidateSet.projectId !== identity?.projectId || binding.projectId !== identity?.projectId) blockers.push("selected legacy evidence belongs to a different project.");
    if (!isSha(candidateSet.artDirectionDigestSha256) || !isSha(candidateSet.selectedQualityAuthorityDigestSha256) || !isSha(candidateSet.authorityDigestSha256)) blockers.push("candidateSetAuthority digests are invalid.");
    if (!isSafeId(binding.assetId) || !isSafeId(binding.conceptTerritoryId) || !isSafeId(binding.candidateId)) blockers.push("selectionBinding asset, territory or candidate identity is invalid.");
    if (!isSha(binding.sourceArtifactSha256) || !isSha(binding.artworkQualityAuthorityDigestSha256) || !isSha(binding.candidateSetAuthorityDigestSha256) || !isSha(binding.artDirectionDigestSha256) || !isSha(binding.bindingDigestSha256)) blockers.push("selectionBinding digests are invalid.");
    if (!LEGACY_REFERENCE.test(text(binding.sourceArtifactReference))) blockers.push("selectionBinding source artifact reference is not a retained legacy identity.");
    if (!strictText(binding.selectedBy, 300) || !strictText(binding.selectedByRole, 300) || !isTimestamp(binding.selectedAt)) blockers.push("selectionBinding named selection evidence is invalid.");
    if (!nonEmptyStringArray(binding.blockedClaims, 64, 2_000)) blockers.push("selectionBinding must retain its scope-limiting blockedClaims.");
    if (candidateSet.selectedCandidateId !== candidate?.candidateId || binding.candidateId !== candidate?.candidateId) blockers.push("selected legacy evidence names a different candidate.");
    if (normalizeSha(candidateSet.selectedQualityAuthorityDigestSha256) !== normalizeSha(quality.authorityDigestSha256) || normalizeSha(binding.artworkQualityAuthorityDigestSha256) !== normalizeSha(quality.authorityDigestSha256)) blockers.push("selected legacy evidence names a different quality authority.");
    if (normalizeSha(binding.candidateSetAuthorityDigestSha256) !== normalizeSha(candidateSet.authorityDigestSha256)) blockers.push("selectionBinding names a different candidate-set authority.");
    if (normalizeSha(candidateSet.artDirectionDigestSha256) !== normalizeSha(quality.artDirectionDigestSha256) || normalizeSha(binding.artDirectionDigestSha256) !== normalizeSha(quality.artDirectionDigestSha256)) blockers.push("selected legacy evidence uses different art direction.");
    if (binding.sourceArtifactReference !== candidate?.artifactReference || normalizeSha(binding.sourceArtifactSha256) !== normalizeSha(candidate?.expectedSha256)) blockers.push("selectionBinding names different artwork bytes.");
  }

  if (useIntent) {
    if (!binding) blockers.push("bookUseIntent requires a complete selectionBinding.");
    if (!PURPOSES.has(useIntent.purpose)) blockers.push("bookUseIntent purpose is unsupported.");
    if (!isSafeId(useIntent.sceneOrPlacementId)) blockers.push("bookUseIntent sceneOrPlacementId is invalid.");
    if (!isSha(useIntent.cropOrPlacementSha256) || !isSha(useIntent.useFingerprint)) blockers.push("bookUseIntent fingerprints are invalid.");
    if (!isTimestamp(useIntent.boundAt)) blockers.push("bookUseIntent boundAt is invalid.");
    if (!strictText(useIntent.boundBy, 300)) blockers.push("bookUseIntent boundBy is invalid.");
  }
  return unique(blockers);
}

function validateIdentity(identity, blockers) {
  if (!identity) {
    blockers.push("identity is required.");
    return;
  }
  for (const key of ["workspaceId", "projectId", "bookId", "requestId"]) {
    if (!isSafeId(identity[key])) blockers.push(`identity.${key} is invalid.`);
  }
  if (identity.editionId !== undefined && !isSafeId(identity.editionId)) blockers.push("identity.editionId is invalid.");
}

function normalizeRecord(record) {
  const artInput = {
    outputKind: "evavo_legacy_website_book_art_state_import_input",
    schemaVersion: 1,
    identity: structuredClone(record.identity),
    sourceBriefFingerprint: record.sourceBriefFingerprint,
    qualityAuthority: structuredClone(record.qualityAuthority),
    ...(record.candidateSetAuthority ? { candidateSetAuthority: structuredClone(record.candidateSetAuthority) } : {}),
    ...(record.selectionBinding ? { selectionBinding: structuredClone(record.selectionBinding) } : {}),
  };
  const useIntent = record.bookUseIntent ? {
    outputKind: "evavo_legacy_website_book_artwork_use_intent",
    schemaVersion: 1,
    migrationItemId: record.migrationItemId,
    identity: structuredClone(record.identity),
    purpose: record.bookUseIntent.purpose,
    sourceBriefFingerprint: record.sourceBriefFingerprint,
    legacySelectionBinding: structuredClone(record.selectionBinding),
    sceneOrPlacementId: record.bookUseIntent.sceneOrPlacementId,
    cropOrPlacementSha256: record.bookUseIntent.cropOrPlacementSha256,
    boundAt: record.bookUseIntent.boundAt,
    boundBy: record.bookUseIntent.boundBy,
    useFingerprint: record.bookUseIntent.useFingerprint,
  } : undefined;
  return {
    migrationItemId: record.migrationItemId,
    requiresBookUseBinding: record.requiresBookUseBinding,
    legacyArtifactReference: record.qualityAuthority.governedArtifact.reference,
    legacyArtifactSha256: normalizeSha(record.qualityAuthority.governedArtifact.checksumSha256),
    artInput,
    artSourceRecordFingerprint: sha256(canonicalJson(artInput)),
    ...(useIntent ? { useIntent, useIntentSourceRecordFingerprint: sha256(canonicalJson(useIntent)) } : {}),
  };
}

function seal(input) {
  const artItems = input.records.map((record) => ({
    migrationItemId: record.migrationItemId,
    sourceRecordFingerprint: record.artSourceRecordFingerprint,
    input: record.artInput,
  }));
  const useIntents = input.records.filter((record) => record.useIntent).map((record) => ({
    migrationItemId: record.migrationItemId,
    sourceRecordFingerprint: record.useIntentSourceRecordFingerprint,
    input: record.useIntent,
  }));
  const withoutFingerprint = {
    outputKind: "evavo_website_book_art_migration_source_manifest",
    schemaVersion: 1,
    status: input.status,
    manifestId: input.manifestId,
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommit: input.sourceCommit,
    expectedMigrationItemIds: [...input.expectedIds].sort(),
    expectedBookUseMigrationItemIds: [...input.expectedUseIds].sort(),
    coveredMigrationItemIds: input.records.map((record) => record.migrationItemId).sort(),
    coveredBookUseMigrationItemIds: useIntents.map((record) => record.migrationItemId).sort(),
    missingMigrationItemIds: [...input.missing].sort(),
    unexpectedMigrationItemIds: [...input.unexpected].sort(),
    duplicateMigrationItemIds: [...input.duplicateIds].sort(),
    records: input.records,
    artStudioBatchInput: {
      outputKind: "evavo_legacy_website_book_art_batch_input",
      schemaVersion: 1,
      batchId: `${input.manifestId}:art`,
      sourceRepository: "EVAVO-STUDIO/Website",
      sourceCommit: input.sourceCommit,
      expectedMigrationItemIds: [...input.expectedIds].sort(),
      items: artItems,
    },
    docsSuiteUseIntentBatch: {
      outputKind: "evavo_website_book_artwork_use_intent_batch",
      schemaVersion: 1,
      batchId: `${input.manifestId}:use`,
      sourceRepository: "EVAVO-STUDIO/Website",
      sourceCommit: input.sourceCommit,
      expectedMigrationItemIds: [...input.expectedUseIds].sort(),
      items: useIntents,
    },
    counts: {
      expected: input.expectedIds.length,
      expectedBookUses: input.expectedUseIds.length,
      covered: input.records.length,
      artStudioItems: artItems.length,
      docsSuiteUseIntents: useIntents.length,
    },
    blockers: unique(input.blockers),
    warnings: unique(input.warnings),
    authoritativeWritesPerformed: false,
    artworkBytesRead: false,
    artworkBytesRewritten: false,
    runtimeCutoverApproved: false,
    sourceDeletionApproved: false,
    publicationPerformed: false,
  };
  return { ...withoutFingerprint, manifestFingerprint: sha256(canonicalJson(withoutFingerprint)) };
}

function canonicalJson(value) { return JSON.stringify(canonical(value)); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : undefined; }
function text(value) { return typeof value === "string" ? value : ""; }
function stringArray(value) { return Array.isArray(value) ? value.filter((item) => typeof item === "string") : []; }
function isSafeId(value) { return typeof value === "string" && SAFE_ID.test(value) && !["__proto__", "constructor", "prototype"].includes(value); }
function isSha(value) { return typeof value === "string" && SHA256.test(value); }
function normalizeSha(value) { return typeof value === "string" && SHA256.test(value) ? value.replace(/^sha256:/, "") : undefined; }
function isTimestamp(value) { return typeof value === "string" && ISO_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value)); }
function strictText(value, maximum) { return typeof value === "string" && value === value.trim() && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value); }
function nonEmptyStringArray(value, maximumItems, maximumLength) { return Array.isArray(value) && value.length > 0 && value.length <= maximumItems && value.every((item) => strictText(item, maximumLength)); }
function unique(values) { return [...new Set(values.map((item) => item.trim()).filter(Boolean))]; }
function duplicates(values) { const seen = new Set(); const duplicated = new Set(); for (const value of values) seen.has(value) ? duplicated.add(value) : seen.add(value); return [...duplicated].sort(); }

function main() {
  const inputArgument = process.argv.find((value) => value.startsWith("--input="));
  const outputArgument = process.argv.find((value) => value.startsWith("--output="));
  if (!inputArgument || !outputArgument) throw new Error("Usage: node compile-book-art-state-migration-manifest.mjs --input=<source.json> --output=<manifest.json>");
  const root = path.resolve(path.dirname(fileURLToPath(new URL("../package.json", import.meta.url))), "..", "..");
  const inputPath = path.resolve(root, inputArgument.slice("--input=".length));
  const outputPath = path.resolve(root, outputArgument.slice("--output=".length));
  if (inputPath === outputPath) throw new Error("Book Art source input and output paths must differ.");
  const sourceStat = statSync(inputPath);
  if (!sourceStat.isFile() || sourceStat.size < 1 || sourceStat.size > MAXIMUM_INPUT_BYTES) throw new Error(`Book Art source input must be a regular file between 1 and ${MAXIMUM_INPUT_BYTES} bytes.`);
  const result = compileBookArtStateMigrationManifest(JSON.parse(readFileSync(inputPath, "utf8")));
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(JSON.stringify({ status: result.status, manifestFingerprint: result.manifestFingerprint, counts: result.counts, outputPath, authoritativeWritesPerformed: false, artworkBytesRead: false, publicationPerformed: false }, null, 2));
  if (result.status === "blocked") process.exitCode = 2;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
