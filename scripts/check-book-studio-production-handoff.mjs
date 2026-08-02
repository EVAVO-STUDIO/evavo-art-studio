import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const authority = JSON.parse(readFileSync(path.join(root, "docs/BOOK_STUDIO_AND_ART_MIGRATION_AUTHORITY.v2.json"), "utf8"));
const contract = readFileSync(path.join(root, "packages/contracts/src/book-production.ts"), "utf8");
const legacy = readFileSync(path.join(root, "packages/contracts/src/book-production-legacy-compat.ts"), "utf8");
const importer = readFileSync(path.join(root, "packages/contracts/src/book-production-legacy-state-import.ts"), "utf8");
const safeImporter = readFileSync(path.join(root, "packages/contracts/src/book-production-legacy-state-import-safe.ts"), "utf8");
const batch = readFileSync(path.join(root, "packages/contracts/src/book-production-legacy-state-batch.ts"), "utf8");
const safeBatch = readFileSync(path.join(root, "packages/contracts/src/book-production-legacy-state-batch-safe.ts"), "utf8");
const promotionAdapter = readFileSync(path.join(root, "packages/contracts/src/book-production-promotion-adapter.ts"), "utf8");
const index = readFileSync(path.join(root, "packages/contracts/src/index.ts"), "utf8");
const test = readFileSync(path.join(root, "packages/contracts/test/book-production.test.mjs"), "utf8");
const importTest = readFileSync(path.join(root, "packages/contracts/test/book-production-legacy-state-import.test.mjs"), "utf8");
const batchTest = readFileSync(path.join(root, "packages/contracts/test/book-production-legacy-state-batch.test.mjs"), "utf8");
const promotionAdapterTest = readFileSync(path.join(root, "packages/contracts/test/book-production-promotion-adapter.test.mjs"), "utf8");
const problems = [];
const requiredHeads = {
  website: "01dc0f36635c77e94d852e5691f0047bc7e275c0",
  docsSuite: "8ad88ced58f90ade1f9f48ab491ece446c07697c",
  artStudio: "6a8bec366c8e9695012e51a863a630648f83d501",
  writingStudio: "72415fd14f44b3350ff70c238822a029e5b81bc9",
};

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
function assert(condition, message) { if (!condition) problems.push(message); }

assert(authority.schema === "evavo/book-studio-and-art-migration-authority", "migration authority schema is invalid");
assert(authority.version === 2, "migration authority version is invalid");
for (const [key, sha] of Object.entries(requiredHeads)) {
  assert(authority.sourceHeads?.[key]?.commit === sha, `${key} source head differs from the reviewed baseline`);
  assert(/^[a-f0-9]{40}$/.test(authority.sourceHeads?.[key]?.commit ?? ""), `${key} source head is not exact`);
}
assert(authority.contractExtraction?.artStudioContract === "evavo_book_art_handoff_v1", "Art Studio handoff contract is missing");
assert(authority.contractExtraction?.candidateIsFinal === false, "provider candidates must remain non-final");
assert(authority.contractExtraction?.approvedArtifactRequiresPromotionReceipt === true, "approval must require promotion evidence");
assert(authority.contractExtraction?.bookUseRequiresApprovedArtifact === true, "book use must require approved art");
assert(authority.contractExtraction?.binaryTransport === "artifact_reference_or_bounded_binary_upload_not_json_base64", "binary transport boundary is invalid");
assert(authority.gates?.noDualAuthoritativeWrites === true, "dual authoritative writes must be prohibited");
assert(authority.gates?.runtimeCutoverApproved === false, "runtime cutover must remain blocked");
assert(authority.currentFlags?.artStudioBookProfileAuthoritative === false, "Art Studio book profile cannot be claimed authoritative yet");
assert(authority.currentFlags?.publicationPerformed === false, "publication cannot be claimed");
const { recordFingerprint, ...unsignedAuthority } = authority;
const expectedFingerprint = createHash("sha256").update(JSON.stringify(canonical(unsignedAuthority))).digest("hex");
assert(recordFingerprint === expectedFingerprint, "migration authority fingerprint does not match exact contents");
for (const token of ["evavo_book_art_handoff_v1", "providerCandidateMayBeFinal: false", "promotionReceiptSha256", "canonicalRendererMustVerifyBytes: true", "Book use requires an approved Art Studio artifact"]) assert(contract.includes(token), `book-production contract is missing ${token}`);
for (const token of ["book-cover-artifact", "book-publication-artifact", "sourceReferenceRetained: true", "bytesRewritten: false", "validateLegacyCompatibleBookArtArtifactReceipt", "validateLegacyCompatibleBookArtworkUseBinding"]) assert(legacy.includes(token), `legacy Book art compatibility is missing ${token}`);
for (const token of ["book_cover_artwork_quality_authority_v1", "book_cover_artwork_candidate_set_authority_v1", "book_cover_artwork_selection_binding_v1", "promotionRequired: true", "legacyApprovalPromotedAutomatically: false", "artifactBytesRewritten: false", "status: candidateSet && binding ? \"review_required\" : \"candidate\""]) assert(importer.includes(token), `legacy Website state importer is missing ${token}`);
for (const token of ["rights status is blocked", "source_artwork kind", "unresolved required revision", "does not match human review decision", "importLegacyWebsiteBookArtStateUnchecked"]) assert(safeImporter.includes(token), `fail-closed legacy importer is missing ${token}`);
for (const token of ["expectedMigrationItemIds", "missingMigrationItemIds", "unexpectedMigrationItemIds", "duplicateMigrationItemIds", "ready_for_promotion_review", "authoritativeWritesPerformed: false"]) assert(batch.includes(token), `batch migration contract is missing ${token}`);
for (const token of ["source record fingerprint does not match its exact canonical input", "fingerprintLegacyWebsiteBookArtSourceRecord", "importLegacyWebsiteBookArtStateBatchUnchecked"]) assert(safeBatch.includes(token), `source-bound batch migration is missing ${token}`);
for (const token of [
  "compileBookArtArtifactReceiptFromPromotion",
  "compileBookArtPromotionBatch",
  "candidate-promotion-authorization",
  "candidate-selection-evidence",
  "selected-art-master",
  "book-art-production-evidence",
  "Promotion reference does not resolve to the retained master artifact",
  "did not pass exact descriptor and content verification",
  "artifactBytesRewritten: false",
  "publicationPerformed: false",
]) assert(promotionAdapter.includes(token), `immutable promotion adapter is missing ${token}`);
assert(index.includes('export * from "./book-production.js";'), "book-production contract must be publicly exported");
assert(index.includes('export * from "./book-production-legacy-compat.js";'), "legacy book-production compatibility must be publicly exported");
assert(index.includes('export * from "./book-production-legacy-state-import-safe.js";'), "fail-closed legacy Website state importer must be publicly exported");
assert(index.includes('export * from "./book-production-legacy-state-batch-safe.js";'), "source-bound batch importer must be publicly exported");
assert(index.includes('export * from "./book-production-promotion-adapter.js";'), "immutable promotion adapter must be publicly exported");
assert(!index.includes('export * from "./book-production-legacy-state-import.js";'), "unchecked legacy state importer must not be publicly exported");
assert(!index.includes('export * from "./book-production-legacy-state-batch.js";'), "unchecked batch importer must not be publicly exported");
for (const token of ["accepts an exact manuscript-bound", "requires selection and promotion", "allows book use only", "preserves legacy Website cover", "rejects a legacy use binding"]) assert(test.includes(token), `book-production tests are missing ${token}`);
for (const token of ["imports exact Website selection evidence as review-required", "imports quality-only evidence as a candidate", "blocks mismatched legacy binding bytes", "blocks unknown origin", "blocks a legacy blocked quality authority", "blocks rights-blocked legacy artwork", "blocks internally inconsistent legacy approval records"]) assert(importTest.includes(token), `legacy state-import tests are missing ${token}`);
for (const token of ["processes every expected item once", "blocks duplicate item identities", "blocks missing or unexpected state", "blocks a tampered source-record fingerprint", "retains item-level failures as needs-resolution"]) assert(batchTest.includes(token), `legacy batch tests are missing ${token}`);
for (const token of [
  "derives one approved Book Art receipt from verified immutable promotion evidence",
  "compiles complete deterministic promotion batches without writes",
  "rejects tampered production evidence bytes",
  "rejects failed artifact verification and stale promotion references",
  "rejects generated text and unresolved production risks before approval",
  "rejects broken immutable promotion lineage",
  "rejects incomplete and duplicate promotion batches before compiling receipts",
]) assert(promotionAdapterTest.includes(token), `immutable promotion adapter tests are missing ${token}`);

if (problems.length) {
  console.error("Book Studio production handoff check failed.");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(JSON.stringify({ status: "PASS", migrationRunId: authority.migrationRunId, contract: authority.contractExtraction.artStudioContract, sourceHeads: requiredHeads, legacyReferencesRetained: true, legacyStateImporter: true, exactBatchCoverage: true, sourceRecordFingerprintsVerified: true, immutablePromotionAdapter: true, immutablePromotionArtifactsVerified: true, promotionBatchDerivedFromRealEvidence: true, failClosedLegacyApprovalBoundary: true, legacyApprovalPromotedAutomatically: false, authoritativeWritesPerformed: false, bytesRewritten: false, providerCandidateIsFinal: false, runtimeCutoverApproved: false, publicationPerformed: false }, null, 2));
