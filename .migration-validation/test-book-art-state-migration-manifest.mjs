import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { compileBookArtStateMigrationManifest } from "./compile-book-art-state-migration-manifest.mjs";

const sha = (character) => character.repeat(64);
const sourceCommit = "a".repeat(40);

function identity(id) {
  return {
    workspaceId: "workspace-1",
    projectId: "project-1",
    bookId: "book-1",
    editionId: "paperback-1",
    requestId: `request-${id}`,
  };
}

function quality(id, checksumCharacter, status = "approved_for_composition") {
  return {
    outputKind: "book_cover_artwork_quality_authority",
    version: "book_cover_artwork_quality_authority_v1",
    status,
    projectId: "project-1",
    artDirectionDigestSha256: sha("a"),
    candidate: {
      candidateId: id,
      artifactReference: `book-cover-artifact://project-1/art/${id}.png`,
      expectedSha256: sha(checksumCharacter),
      provenance: {
        origin: "generative_assisted",
        rightsStatus: "approved_commercial",
      },
    },
    governedArtifact: {
      reference: `book-cover-artifact://project-1/art/${id}.png`,
      checksumSha256: sha(checksumCharacter),
      kind: "source_artwork",
      mimeType: "image/png",
      byteLength: 123456,
      widthPx: 3000,
      heightPx: 4800,
    },
    authorityDigestSha256: sha(checksumCharacter === "b" ? "e" : "f"),
  };
}

function candidateSet(id, qualityDigest) {
  return {
    outputKind: "book_cover_artwork_candidate_set_authority",
    version: "book_cover_artwork_candidate_set_authority_v1",
    status: "selected_for_composition",
    projectId: "project-1",
    artDirectionDigestSha256: sha("a"),
    selectedCandidateId: id,
    selectedQualityAuthorityDigestSha256: qualityDigest,
    authorityDigestSha256: sha("1"),
  };
}

function selectionBinding(id, checksumCharacter, qualityDigest) {
  return {
    outputKind: "book_cover_artwork_selection_binding",
    version: "book_cover_artwork_selection_binding_v1",
    status: "selected_for_composition",
    projectId: "project-1",
    assetId: `asset-${id}`,
    candidateId: id,
    conceptTerritoryId: `territory-${id}`,
    sourceArtifactReference: `book-cover-artifact://project-1/art/${id}.png`,
    sourceArtifactSha256: sha(checksumCharacter),
    artworkQualityAuthorityDigestSha256: qualityDigest,
    candidateSetAuthorityDigestSha256: sha("1"),
    artDirectionDigestSha256: sha("a"),
    selectedBy: "Named art director",
    selectedByRole: "art director",
    selectedAt: "2026-08-02T00:00:00.000Z",
    blockedClaims: ["Selection does not prove final rendering or publication approval."],
    bindingDigestSha256: sha("2"),
  };
}

function selectedRecord() {
  const qualityAuthority = quality("candidate-1", "b");
  return {
    migrationItemId: "migration-candidate-1",
    identity: identity("candidate-1"),
    sourceBriefFingerprint: sha("a"),
    qualityAuthority,
    candidateSetAuthority: candidateSet("candidate-1", qualityAuthority.authorityDigestSha256),
    selectionBinding: selectionBinding("candidate-1", "b", qualityAuthority.authorityDigestSha256),
    requiresBookUseBinding: true,
    bookUseIntent: {
      purpose: "front_cover_art",
      sceneOrPlacementId: "cover-scene-1",
      cropOrPlacementSha256: sha("3"),
      boundAt: "2026-08-02T02:00:00.000Z",
      boundBy: "Book Studio designer",
      useFingerprint: sha("4"),
    },
  };
}

function qualityOnlyRecord() {
  return {
    migrationItemId: "migration-candidate-2",
    identity: identity("candidate-2"),
    sourceBriefFingerprint: sha("a"),
    qualityAuthority: quality("candidate-2", "c", "shortlisted"),
    requiresBookUseBinding: false,
  };
}

function sourceInput(records = [selectedRecord(), qualityOnlyRecord()]) {
  return {
    outputKind: "evavo_website_book_art_migration_source_input",
    schemaVersion: 1,
    manifestId: "book-art-source-1",
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommit,
    expectedMigrationItemIds: records.map((record) => record.migrationItemId),
    expectedBookUseMigrationItemIds: ["migration-candidate-1"],
    records,
  };
}

test("compiles exact destination batches with deterministic order and fingerprints", () => {
  const first = sourceInput();
  const second = sourceInput([...first.records].reverse());
  second.expectedMigrationItemIds.reverse();
  const firstResult = compileBookArtStateMigrationManifest(first);
  const secondResult = compileBookArtStateMigrationManifest(second);
  assert.equal(firstResult.status, "ready_for_destination_batch_compilation", firstResult.blockers.join("\n"));
  assert.equal(firstResult.counts.expected, 2);
  assert.equal(firstResult.counts.expectedBookUses, 1);
  assert.equal(firstResult.artStudioBatchInput.items.length, 2);
  assert.deepEqual(firstResult.artStudioBatchInput.expectedMigrationItemIds, ["migration-candidate-1", "migration-candidate-2"]);
  assert.equal(firstResult.docsSuiteUseIntentBatch.items.length, 1);
  assert.deepEqual(firstResult.docsSuiteUseIntentBatch.expectedMigrationItemIds, ["migration-candidate-1"]);
  assert.equal(firstResult.records[0].legacyArtifactReference, "book-cover-artifact://project-1/art/candidate-1.png");
  assert.match(firstResult.records[0].artSourceRecordFingerprint, /^[a-f0-9]{64}$/);
  assert.match(firstResult.records[0].useIntentSourceRecordFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(firstResult.manifestFingerprint, secondResult.manifestFingerprint);
  assert.equal(firstResult.authoritativeWritesPerformed, false);
  assert.equal(firstResult.artworkBytesRead, false);
  assert.equal(firstResult.artworkBytesRewritten, false);
  assert.equal(firstResult.publicationPerformed, false);
});

test("blocks missing records and preserves expected destination coverage", () => {
  const value = sourceInput([selectedRecord()]);
  value.expectedMigrationItemIds = ["migration-candidate-1", "migration-candidate-2"];
  const result = compileBookArtStateMigrationManifest(value);
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.missingMigrationItemIds, ["migration-candidate-2"]);
  assert.deepEqual(result.artStudioBatchInput.expectedMigrationItemIds, ["migration-candidate-1", "migration-candidate-2"]);
  assert.equal(result.artStudioBatchInput.items.length, 0);
});

test("blocks duplicate source and Book Design use identities", () => {
  const value = sourceInput();
  value.expectedMigrationItemIds.push("migration-candidate-1");
  value.expectedBookUseMigrationItemIds.push("migration-candidate-1");
  const result = compileBookArtStateMigrationManifest(value);
  assert.equal(result.status, "blocked");
  assert.ok(result.duplicateMigrationItemIds.includes("migration-candidate-1"));
});

test("blocks undeclared or omitted Book Design use intent", () => {
  const missingIntent = sourceInput();
  delete missingIntent.records[0].bookUseIntent;
  const missingResult = compileBookArtStateMigrationManifest(missingIntent);
  assert.equal(missingResult.status, "blocked");
  assert.ok(missingResult.blockers.some((entry) => entry.includes("bookUseIntent is required")));

  const undeclared = sourceInput();
  undeclared.expectedBookUseMigrationItemIds = [];
  const undeclaredResult = compileBookArtStateMigrationManifest(undeclared);
  assert.equal(undeclaredResult.status, "blocked");
  assert.ok(undeclaredResult.blockers.some((entry) => entry.includes("does not match the declared expected Book Design use set")));
});

test("blocks stale or incomplete selected evidence", () => {
  const stale = sourceInput();
  stale.records[0].selectionBinding.artDirectionDigestSha256 = sha("9");
  const staleResult = compileBookArtStateMigrationManifest(stale);
  assert.equal(staleResult.status, "blocked");
  assert.ok(staleResult.blockers.some((entry) => entry.includes("different art direction")));

  const incomplete = sourceInput();
  delete incomplete.records[0].selectionBinding.blockedClaims;
  const incompleteResult = compileBookArtStateMigrationManifest(incomplete);
  assert.equal(incompleteResult.status, "blocked");
  assert.ok(incompleteResult.blockers.some((entry) => entry.includes("scope-limiting blockedClaims")));
});

test("rejects cross-project identity and mismatched artifact bytes", () => {
  const value = sourceInput();
  value.records[0].qualityAuthority.projectId = "different-project";
  value.records[0].qualityAuthority.governedArtifact.checksumSha256 = sha("9");
  const result = compileBookArtStateMigrationManifest(value);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((entry) => entry.includes("different project")));
  assert.ok(result.blockers.some((entry) => entry.includes("artifact bytes differ")));
});

test("CLI writes one no-clobber manifest and refuses replacement", () => {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "evavo-book-art-source-"));
  try {
    const inputPath = path.join(temporaryRoot, "source.json");
    const outputPath = path.join(temporaryRoot, "nested", "manifest.json");
    writeFileSync(inputPath, `${JSON.stringify(sourceInput(), null, 2)}\n`, "utf8");
    const scriptPath = fileURLToPath(new URL("./compile-book-art-state-migration-manifest.mjs", import.meta.url));
    const first = spawnSync(process.execPath, [scriptPath, `--input=${inputPath}`, `--output=${outputPath}`], { encoding: "utf8" });
    assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);
    const manifest = JSON.parse(readFileSync(outputPath, "utf8"));
    assert.equal(manifest.status, "ready_for_destination_batch_compilation");
    const second = spawnSync(process.execPath, [scriptPath, `--input=${inputPath}`, `--output=${outputPath}`], { encoding: "utf8" });
    assert.notEqual(second.status, 0);
    assert.match(second.stderr, /EEXIST|file already exists/i);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
