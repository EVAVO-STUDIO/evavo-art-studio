import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  canonicalJson,
  compileWebsiteBookStateMigrationBundle,
  exportWebsiteBookStateToDocsSuite,
  sha256Value,
} from "../src/evavo/bookStudio/storyBookStudioDocsSuiteStateMigrationExport";
import { loadWebsiteBookStateMigrationExportInput } from "./run-book-studio-state-migration-export";

const sha = (character: string): string => `sha256:${character.repeat(64)}`;
const git = (character: string): string => character.repeat(40);
const VOLUME_KINDS = [
  "manuscript",
  "execution",
  "story",
  "authoring",
  "review_craft",
  "canonical_mutation",
  "publication",
] as const;

async function operationResult(request: Record<string, unknown>): Promise<Record<string, unknown>> {
  const unsigned = {
    outputKind: "evavo_docs_book_operation_result",
    schemaVersion: 1,
    contract: "evavo_docs_book_operation_v1",
    status: "completed",
    requestId: request.requestId,
    operation: request.operation,
    requiredScope: "documents:read",
    requestFingerprint: await sha256Value(request),
    result: { status: "needs_work", normalized: request.payload },
    blockers: [],
    warnings: [],
    authoritativeWritesPerformed: false,
    canonicalManuscriptMutationPerformed: false,
    providerCalled: false,
    publicationPerformed: false,
    websiteCompatibilityRuntimeStillAuthoritative: true,
    docsSuiteCanonicalWriterEnabled: false,
    dualAuthoritativeWritesAllowed: false,
    runtimeCutoverApproved: false,
    sourceDeletionApproved: false,
  };
  return { ...unsigned, resultFingerprint: await sha256Value(unsigned) };
}

function artworkUse(): Record<string, unknown> {
  const identity = {
    workspaceId: "workspace-1",
    projectId: "project-1",
    bookId: "volume-1",
    editionId: "paperback-1",
    requestId: "art-request-1",
  };
  return {
    artifact: {
      outputKind: "evavo_book_art_artifact_receipt",
      schemaVersion: 1,
      contract: "evavo_book_art_handoff_v1",
      identity,
      sourceBriefFingerprint: sha("1"),
      status: "approved",
      artifactId: "artifact-1",
      artifactReference: "evavo-art://projects/project-1/artifact-1.png",
      contentSha256: sha("2"),
      byteLength: 1234,
      mimeType: "image/png",
      widthPx: 3000,
      heightPx: 4800,
      provenance: {
        origin: "human_authored",
        sourceArtifactIds: ["source-1"],
        rightsEvidenceIds: ["rights-1"],
        rightsStatus: "approved_commercial",
        aiDisclosure: "not_applicable",
      },
      technicalQualityReceiptSha256: sha("3"),
      selectionReceiptSha256: sha("4"),
      promotionReceiptSha256: sha("5"),
      promotedBy: "Named art director",
      promotedAt: "2026-08-03T00:01:00.000Z",
      generatedTextDetected: false,
      unresolvedRisks: [],
      artifactFingerprint: sha("6"),
      publicationPerformed: false,
    },
    binding: {
      outputKind: "evavo_book_artwork_use_binding",
      schemaVersion: 1,
      contract: "evavo_book_art_handoff_v1",
      identity,
      purpose: "front_cover_art",
      sourceBriefFingerprint: sha("1"),
      approvedArtifactId: "artifact-1",
      approvedArtifactReference: "evavo-art://projects/project-1/artifact-1.png",
      approvedArtifactSha256: sha("2"),
      promotionReceiptSha256: sha("5"),
      sceneOrPlacementId: "front-cover-scene",
      cropOrPlacementSha256: sha("7"),
      boundAt: "2026-08-03T00:02:00.000Z",
      boundBy: "Book designer",
      useFingerprint: sha("8"),
      canonicalRendererMustVerifyBytes: true,
      publicationPerformed: false,
    },
  };
}

async function createFixture(root: string): Promise<string> {
  const stateDirectory = path.join(root, "state");
  await mkdir(stateDirectory, { recursive: true });
  const records: Array<Record<string, unknown>> = [];
  async function stateRecord(
    migrationItemId: string,
    stateKind: string,
    scope: string,
    scopeId: string,
    value: unknown,
  ): Promise<void> {
    const sourceFile = `state/${migrationItemId}.json`;
    await writeFile(path.join(root, sourceFile), `${JSON.stringify(value)}\n`, "utf8");
    records.push({
      migrationItemId,
      stateKind,
      scope,
      scopeId,
      sourceFile,
      evidenceIds: [`evidence-${migrationItemId}`],
    });
  }
  await stateRecord("state-project", "project", "project", "project-1", { projectId: "project-1" });
  for (let index = 0; index < VOLUME_KINDS.length; index += 1) {
    const stateKind = VOLUME_KINDS[index];
    if (!stateKind) throw new Error("fixture volume kind missing");
    await stateRecord(
      `state-volume-1-${stateKind}`,
      stateKind,
      "volume",
      "volume-1",
      { projectId: "project-1", volumeId: "volume-1", stateKind, index },
    );
  }
  await stateRecord("state-volume-1-art", "artwork_use", "volume", "volume-1", artworkUse());
  const manifest = {
    outputKind: "evavo_website_book_state_migration_export_manifest",
    schemaVersion: 1,
    authorityMode: "shadow_migration",
    bundleId: "bundle-1",
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommit: git("c"),
    projectId: "project-1",
    programmeId: "programme-1",
    volumeIds: ["volume-1"],
    artworkRequiredVolumeIds: ["volume-1"],
    records,
    compiledAt: "2026-08-03T00:00:00.000Z",
    compiledBy: "Migration operator",
    evidenceIds: ["bundle-evidence"],
    authoritativeWritesAllowed: false,
    canonicalManuscriptMutationAllowed: false,
    runtimeCutoverApproved: false,
    sourceDeletionApproved: false,
    publicationPerformed: false,
  };
  const manifestPath = path.join(root, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifestPath;
}

const root = await mkdtemp(path.join(os.tmpdir(), "website-book-state-export-"));
try {
  const manifestPath = await createFixture(root);
  const input = await loadWebsiteBookStateMigrationExportInput(manifestPath);
  assert.equal(input.records.length, 9);
  const projectBytes = await readFile(path.join(root, "state/state-project.json"));
  const project = input.records.find((entry) => entry.stateKind === "project");
  assert.equal(project?.source.sourceByteLength, projectBytes.byteLength);
  assert.equal(
    project?.source.sourceContentSha256,
    `sha256:${createHash("sha256").update(projectBytes).digest("hex")}`,
  );
  assert.equal(
    project?.source.sourceGitBlobSha1,
    createHash("sha1")
      .update(Buffer.from(`blob ${projectBytes.byteLength}\0`))
      .update(projectBytes)
      .digest("hex"),
  );

  const bundle = await compileWebsiteBookStateMigrationBundle(input, operationResult);
  assert.equal(bundle.outputKind, "evavo_docs_book_state_migration_bundle_input");
  assert.equal((bundle.items as unknown[]).length, 9);
  assert.equal(bundle.authoritativeWritesAllowed, false);
  assert.equal(canonicalJson(bundle).includes("undefined"), false);

  let callCount = 0;
  const receipt = await exportWebsiteBookStateToDocsSuite({
    exportInput: input,
    configuration: {
      origin: "https://docs.example.test",
      token: "abcdefghijklmnop",
      timeoutMs: 20_000,
    },
    fetchImpl: async (url, init) => {
      callCount += 1;
      const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (String(url).endsWith("/operations")) {
        return new Response(JSON.stringify(await operationResult(request)), { status: 200 });
      }
      const expectedItems = request.expectedItems as Array<Record<string, unknown>>;
      const items = request.items as Array<Record<string, unknown>>;
      const unsigned = {
        outputKind: "evavo_docs_book_state_migration_bundle_result",
        schemaVersion: 1,
        contract: "evavo_docs_book_state_migration_bundle_v1",
        status: "ready_for_cutover_review",
        bundleId: request.bundleId,
        sourceRepository: "EVAVO-STUDIO/Website",
        sourceCommit: request.sourceCommit,
        projectId: request.projectId,
        programmeId: request.programmeId,
        volumeIds: request.volumeIds,
        artworkRequiredVolumeIds: request.artworkRequiredVolumeIds,
        expectedMigrationItemIds: expectedItems.map((item) => item.migrationItemId),
        processedMigrationItemIds: items.map((item) => item.migrationItemId),
        missingMigrationItemIds: [],
        unexpectedMigrationItemIds: [],
        duplicateMigrationItemIds: [],
        itemResults: [],
        blockers: [],
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
      return new Response(
        JSON.stringify({ ...unsigned, bundleFingerprint: await sha256Value(unsigned) }),
        { status: 200 },
      );
    },
  });
  assert.equal(callCount, 9);
  assert.equal(receipt.operationCallCount, 8);
  assert.equal(receipt.bundleCallCount, 1);
  assert.equal(receipt.runtimeCutoverApproved, false);
  assert.equal(receipt.publicationPerformed, false);

  const missing = structuredClone(input);
  missing.records.splice(1, 1);
  await assert.rejects(
    () => compileWebsiteBookStateMigrationBundle(missing, operationResult),
    /VOLUME_COVERAGE_INVALID/,
  );
  await assert.rejects(
    () =>
      compileWebsiteBookStateMigrationBundle(input, async (request) => ({
        ...(await operationResult(request)),
        providerCalled: true,
      })),
    /OPERATION_AUTHORITY_INVALID/,
  );
  const invalidArt = structuredClone(input);
  const art = invalidArt.records.find((entry) => entry.stateKind === "artwork_use");
  if (!art?.artworkUseValidation) throw new Error("fixture artwork use missing");
  art.artworkUseValidation.artifact.status = "review_required";
  await assert.rejects(
    () => compileWebsiteBookStateMigrationBundle(invalidArt, operationResult),
    /ARTWORK_INVALID/,
  );

  const symlinkRoot = await mkdtemp(path.join(os.tmpdir(), "website-book-state-export-symlink-"));
  try {
    const symlinkManifest = await createFixture(symlinkRoot);
    await rm(path.join(symlinkRoot, "state/state-project.json"));
    await symlink(
      path.join(root, "state/state-project.json"),
      path.join(symlinkRoot, "state/state-project.json"),
    );
    await assert.rejects(
      () => loadWebsiteBookStateMigrationExportInput(symlinkManifest),
      /SOURCE_FILE_INVALID/,
    );
  } finally {
    await rm(symlinkRoot, { recursive: true, force: true });
  }

  await assert.rejects(
    () =>
      exportWebsiteBookStateToDocsSuite({
        exportInput: input,
        configuration: {
          origin: "https://docs.example.test",
          token: "abcdefghijklmnop",
          timeoutMs: 20_000,
        },
        fetchImpl: async () => {
          throw new TypeError("fetch failed");
        },
      }),
    /OPERATION_AMBIGUOUS_NO_RETRY/,
  );

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        contract: "evavo_docs_book_state_migration_bundle_v1",
        exactSourceByteHashesComputed: true,
        exactGitBlobSha1Computed: true,
        expectedItems: 9,
        operationCalls: 8,
        bundleCalls: 1,
        ambiguousRetryAllowed: false,
        authoritativeWritesPerformed: false,
        runtimeCutoverApproved: false,
        sourceDeletionApproved: false,
        publicationPerformed: false,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
