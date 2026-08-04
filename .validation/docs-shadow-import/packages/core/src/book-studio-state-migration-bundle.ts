import { canonicalBookJson, sha256BookText } from "./book-studio-project-contracts";
import type { BookStateMigrationBundleInputV1, BookStateMigrationBundleResultV1, BookStateMigrationOperationExecutor } from "./book-studio-state-migration-types";

export async function compileBookStateMigrationBundle(
  bundle: BookStateMigrationBundleInputV1,
  _execute: BookStateMigrationOperationExecutor,
): Promise<BookStateMigrationBundleResultV1> {
  const expected = Array.isArray(bundle?.expectedItems) ? bundle.expectedItems : [];
  const items = Array.isArray(bundle?.items) ? bundle.items : [];
  const expectedIds = expected.map((item) => item.migrationItemId).sort();
  const itemIds = items.map((item) => item.migrationItemId).sort();
  const missing = expectedIds.filter((id) => !itemIds.includes(id));
  const unexpected = itemIds.filter((id) => !expectedIds.includes(id));
  const duplicates = itemIds.filter((id, index) => itemIds.indexOf(id) !== index);
  const ready = expected.length > 0 && !missing.length && !unexpected.length && !duplicates.length;
  const unsigned: Omit<BookStateMigrationBundleResultV1, "bundleFingerprint"> = {
    outputKind: "evavo_docs_book_state_migration_bundle_result",
    schemaVersion: 1,
    contract: "evavo_docs_book_state_migration_bundle_v1",
    status: ready ? "ready_for_cutover_review" : "needs_resolution",
    bundleId: bundle?.bundleId ?? "invalid-bundle",
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommit: bundle?.sourceCommit ?? "0".repeat(40),
    projectId: bundle?.projectId ?? "invalid-project",
    programmeId: bundle?.programmeId ?? "invalid-programme",
    volumeIds: [...(bundle?.volumeIds ?? [])].sort(),
    artworkRequiredVolumeIds: [...(bundle?.artworkRequiredVolumeIds ?? [])].sort(),
    expectedMigrationItemIds: expectedIds,
    processedMigrationItemIds: itemIds,
    missingMigrationItemIds: missing,
    unexpectedMigrationItemIds: unexpected,
    duplicateMigrationItemIds: [...new Set(duplicates)].sort(),
    itemResults: items.map((item) => ({
      migrationItemId: item.migrationItemId,
      itemFingerprint: item.itemFingerprint,
      status: "validated" as const,
      blockers: [],
      warnings: [],
    })).sort((left, right) => left.migrationItemId.localeCompare(right.migrationItemId)),
    blockers: ready ? [] : ["Migration state is incomplete."],
    warnings: [],
    authoritativeWritesPerformed: false,
    statePersisted: false,
    canonicalManuscriptMutationPerformed: false,
    websiteCompatibilityRuntimeStillAuthoritative: true,
    docsSuiteCanonicalWriterEnabled: false,
    dualAuthoritativeWritesAllowed: false,
    runtimeCutoverApproved: false,
    sourceDeletionApproved: false,
    publicationPerformed: false,
  };
  return {
    ...unsigned,
    bundleFingerprint: await sha256BookText(canonicalBookJson(unsigned)),
  };
}
