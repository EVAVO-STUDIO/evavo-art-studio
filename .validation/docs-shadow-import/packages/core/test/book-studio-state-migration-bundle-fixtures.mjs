export const sha = (character) => `sha256:${character.repeat(64)}`;
export async function executor(request) { return { request }; }

export async function fixture() {
  const expectedItems = [
    { migrationItemId: "state-project", stateKind: "project", scope: "project", scopeId: "project-1" },
    { migrationItemId: "state-volume-1-manuscript", stateKind: "manuscript", scope: "volume", scopeId: "volume-1" },
    { migrationItemId: "state-volume-1-execution", stateKind: "execution", scope: "volume", scopeId: "volume-1" },
    { migrationItemId: "state-volume-1-story", stateKind: "story", scope: "volume", scopeId: "volume-1" },
    { migrationItemId: "state-volume-1-authoring", stateKind: "authoring", scope: "volume", scopeId: "volume-1" },
    { migrationItemId: "state-volume-1-review", stateKind: "review_craft", scope: "volume", scopeId: "volume-1" },
    { migrationItemId: "state-volume-1-canonical", stateKind: "canonical_mutation", scope: "volume", scopeId: "volume-1" },
    { migrationItemId: "state-volume-1-publication", stateKind: "publication", scope: "volume", scopeId: "volume-1" },
    { migrationItemId: "state-volume-1-art", stateKind: "artwork_use", scope: "volume", scopeId: "volume-1" },
  ];
  const items = expectedItems.map((item, index) => ({
    ...item,
    itemFingerprint: sha(String((index % 9) + 1)),
  }));
  return {
    outputKind: "evavo_docs_book_state_migration_bundle_input",
    schemaVersion: 1,
    contract: "evavo_docs_book_state_migration_bundle_v1",
    authorityMode: "shadow_migration",
    bundleId: "bundle-1",
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommit: "a".repeat(40),
    projectId: "project-1",
    programmeId: "programme-1",
    volumeIds: ["volume-1"],
    artworkRequiredVolumeIds: ["volume-1"],
    expectedItems,
    items,
    compiledAt: "2026-08-04T02:00:00.000Z",
    compiledBy: "validation-operator",
    evidenceIds: ["evidence-1"],
    authoritativeWritesAllowed: false,
    canonicalManuscriptMutationAllowed: false,
    runtimeCutoverApproved: false,
    sourceDeletionApproved: false,
    publicationPerformed: false,
  };
}
