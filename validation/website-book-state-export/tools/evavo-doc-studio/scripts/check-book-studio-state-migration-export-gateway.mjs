import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(new URL("../package.json", import.meta.url))), "..", "..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const moduleSource = read("tools/evavo-doc-studio/src/evavo/bookStudio/storyBookStudioDocsSuiteStateMigrationExport.ts");
const indexSource = read("tools/evavo-doc-studio/src/evavo/bookStudio/index.ts");
const cliSource = read("tools/evavo-doc-studio/scripts/run-book-studio-state-migration-export.ts");
const attackSource = read("tools/evavo-doc-studio/scripts/check-book-studio-state-migration-export.ts");
const workflow = read(".github/workflows/book-studio-state-migration-export.yml");
const documentation = read("tools/evavo-doc-studio/docs/BOOK_STUDIO_STATE_MIGRATION_EXPORT.md");
const record = JSON.parse(read("tools/evavo-doc-studio/data/migration/WEBSITE_BOOK_STATE_EXPORT_GATEWAY.v1.json"));

for (const token of [
  "evavo_docs_book_state_migration_bundle_v1",
  "/api/v1/book-studio/operations",
  "/api/v1/book-studio/migration/state-bundle",
  "compileWebsiteBookStateMigrationBundle",
  "exportWebsiteBookStateToDocsSuite",
  "sourceRecordFingerprint",
  "itemFingerprint",
  "WEBSITE_BOOK_STATE_OPERATION_AMBIGUOUS_NO_RETRY",
  "WEBSITE_BOOK_STATE_BUNDLE_AMBIGUOUS_NO_RETRY",
  "runtimeCutoverApproved: false",
  "sourceDeletionApproved: false",
  "publicationPerformed: false",
]) assert.ok(moduleSource.includes(token), `State export module is missing ${token}.`);
for (const forbidden of [
  "authoritativeWritesAllowed: true",
  "canonicalManuscriptMutationAllowed: true",
  "runtimeCutoverApproved: true",
  "sourceDeletionApproved: true",
  "publicationPerformed: true",
  "providerCalled: true",
  "redirect: \"follow\"",
]) assert.ok(!moduleSource.includes(forbidden), `State export module contains ${forbidden}.`);

assert.ok(indexSource.includes('export * from "./storyBookStudioDocsSuiteStateMigrationExport";'));
for (const token of [
  "sourceFile",
  "gitBlobSha1",
  "lstat",
  "isSymbolicLink",
  "writeExclusive",
  "Refusing to overwrite existing output",
  "capabilities",
  "export",
]) assert.ok(cliSource.includes(token), `State export CLI is missing ${token}.`);
for (const token of [
  "exactSourceByteHashesComputed",
  "exactGitBlobSha1Computed",
  "OPERATION_AMBIGUOUS_NO_RETRY",
  "SOURCE_FILE_INVALID",
  "ARTWORK_INVALID",
  "OPERATION_AUTHORITY_INVALID",
]) assert.ok(attackSource.includes(token), `State export attacks are missing ${token}.`);
for (const token of [
  "npm run typecheck",
  "check-book-studio-state-migration-export.ts",
  "check-book-studio-state-migration-export-gateway.mjs",
  "git diff --exit-code",
]) assert.ok(workflow.includes(token), `State export workflow is missing ${token}.`);
for (const token of [
  "Website remains the authoritative writer",
  "ready_for_cutover_review",
  "no automatic retry",
  "approved Book Artwork Use",
]) assert.ok(documentation.includes(token), `State export documentation is missing ${token}.`);

assert.equal(record.schema, "evavo/website-book-state-export-gateway");
assert.equal(record.version, 1);
assert.equal(record.sourceRepository, "EVAVO-STUDIO/Website");
assert.equal(record.sourceBaseCommit, "5c3fbc63e98e269b323269742a13609bc63a0088");
assert.equal(record.docsSuiteValidationCommit, "c83def34e8b4f9aef6108ddffc664f7c8a4c523c");
assert.equal(record.contract, "evavo_docs_book_state_migration_bundle_v1");
assert.equal(record.capabilities.exactSourceBytesHashed, true);
assert.equal(record.capabilities.exactGitBlobSha1Computed, true);
assert.equal(record.capabilities.operationRetryAllowed, false);
assert.equal(record.capabilities.ambiguousBundleRetryAllowed, false);
assert.equal(record.capabilities.outputOverwriteAllowed, false);
for (const value of Object.values(record.authority)) assert.equal(value, false);
assert.equal(record.liveProductionStateImported, false);
assert.equal(record.liveBundleValidated, false);
assert.equal(record.overallBookProductCutoverApproved, false);
const { recordFingerprint, ...unsigned } = record;
assert.equal(
  recordFingerprint,
  `sha256:${createHash("sha256").update(JSON.stringify(canonical(unsigned))).digest("hex")}`,
);

console.log(JSON.stringify({
  status: "PASS",
  contract: record.contract,
  sourceBaseCommit: record.sourceBaseCommit,
  docsSuiteValidationCommit: record.docsSuiteValidationCommit,
  exactSourceBytesHashed: true,
  exactGitBlobSha1Computed: true,
  ambiguousRetryAllowed: false,
  authoritativeWritesPerformed: false,
  liveProductionStateImported: false,
  overallBookProductCutoverApproved: false,
  publicationPerformed: false,
}, null, 2));

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}
