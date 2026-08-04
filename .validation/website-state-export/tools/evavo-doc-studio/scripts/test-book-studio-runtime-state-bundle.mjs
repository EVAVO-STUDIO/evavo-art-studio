import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  canonicalJson,
  compileWebsiteBookStateMigrationBundle,
  gitBlobSha1,
  logicalFingerprint,
  sha256,
} from "./book-studio-runtime-state-bundle-core.mjs";
import { runBookStateExportCli } from "./compile-book-studio-runtime-state-bundle.mjs";

const commit = "a".repeat(40);
const digest = (character) => `sha256:${character.repeat(64)}`;
const requiredKinds = [
  "manuscript",
  "execution",
  "story",
  "authoring",
  "review_craft",
  "canonical_mutation",
  "publication",
];
const operationByKind = {
  project: "project.validate",
  manuscript: "manuscript.compile_coverage",
  execution: "execution.plan_next",
  story: "story.validate",
  authoring: "authoring.evaluate_admission",
  review_craft: "review.evaluate_admission",
  canonical_mutation: "canonical.validate_plan",
  publication: "publication.compile_programme",
};

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function requestFor(kind, index, payload) {
  return {
    outputKind: "evavo_docs_book_operation_request",
    schemaVersion: 1,
    contract: "evavo_docs_book_operation_v1",
    authorityMode: "shadow_migration",
    requestId: `state-request-${index}`,
    operation: operationByKind[kind],
    payload,
    requestedAt: "2026-08-04T00:00:00.000Z",
    requestedBy: "migration-export-test",
    evidenceIds: ["evidence-state-1"],
    authoritativeWritesAllowed: false,
    canonicalManuscriptMutationAllowed: false,
    automaticPublicationAllowed: false,
    runtimeCutoverApproved: false,
    sourceDeletionApproved: false,
    publicationPerformed: false,
  };
}

function resultFor(request) {
  const unsigned = {
    outputKind: "evavo_docs_book_operation_result",
    schemaVersion: 1,
    contract: "evavo_docs_book_operation_v1",
    status: "completed",
    requestId: request.requestId,
    operation: request.operation,
    requiredScope: "documents:read",
    requestFingerprint: logicalFingerprint(request),
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
  return { ...unsigned, resultFingerprint: logicalFingerprint(unsigned) };
}

function validArtworkUse() {
  const identity = {
    workspaceId: "workspace-1",
    projectId: "project-1",
    bookId: "volume-1",
    editionId: "paperback-1",
    requestId: "art-request-1",
  };
  const artifact = {
    outputKind: "evavo_book_art_artifact_receipt",
    schemaVersion: 1,
    contract: "evavo_book_art_handoff_v1",
    identity,
    sourceBriefFingerprint: digest("1"),
    status: "approved",
    artifactId: "artifact-1",
    artifactReference: "evavo-art://projects/project-1/artifact-1.png",
    contentSha256: digest("2"),
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
    technicalQualityReceiptSha256: digest("3"),
    selectionReceiptSha256: digest("4"),
    promotionReceiptSha256: digest("5"),
    promotedBy: "Named art director",
    promotedAt: "2026-08-04T00:01:00.000Z",
    generatedTextDetected: false,
    unresolvedRisks: [],
    artifactFingerprint: digest("6"),
    publicationPerformed: false,
  };
  const binding = {
    outputKind: "evavo_book_artwork_use_binding",
    schemaVersion: 1,
    contract: "evavo_book_art_handoff_v1",
    identity,
    purpose: "front_cover_art",
    sourceBriefFingerprint: digest("1"),
    approvedArtifactId: "artifact-1",
    approvedArtifactReference: artifact.artifactReference,
    approvedArtifactSha256: artifact.contentSha256,
    promotionReceiptSha256: artifact.promotionReceiptSha256,
    sceneOrPlacementId: "front-cover-scene",
    cropOrPlacementSha256: digest("7"),
    boundAt: "2026-08-04T00:02:00.000Z",
    boundBy: "Book designer",
    useFingerprint: digest("8"),
    canonicalRendererMustVerifyBytes: true,
    publicationPerformed: false,
  };
  return { binding, artifact };
}

async function fixture(options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "book-state-export-"));
  const stateRoot = path.join(directory, "state");
  await mkdir(stateRoot, { recursive: true });
  const expected = [
    { migrationItemId: "state-project", stateKind: "project", scope: "project", scopeId: "project-1" },
    ...requiredKinds.map((stateKind) => ({
      migrationItemId: `state-volume-1-${stateKind}`,
      stateKind,
      scope: "volume",
      scopeId: "volume-1",
    })),
    { migrationItemId: "state-volume-1-art", stateKind: "artwork_use", scope: "volume", scopeId: "volume-1" },
  ];
  const items = [];
  for (let index = 0; index < expected.length; index += 1) {
    const entry = expected[index];
    const sourcePath = `records/${entry.migrationItemId}.json`;
    let record;
    if (entry.stateKind === "artwork_use") {
      record = {
        outputKind: "evavo_website_book_state_export_record",
        schemaVersion: 1,
        ...entry,
        artworkUseValidation: validArtworkUse(),
        validationFingerprint: logicalFingerprint({ valid: true, issues: [] }),
      };
    } else {
      const payload = {
        projectId: "project-1",
        scopeId: entry.scopeId,
        stateKind: entry.stateKind,
        value: index,
      };
      if (options.forbiddenPayload && entry.stateKind === "story") {
        payload.candidateText = "This private candidate prose must not enter a migration envelope.";
      }
      const validationRequest = requestFor(entry.stateKind, index, payload);
      const validationResult = resultFor(validationRequest);
      if (options.tamperResult && entry.stateKind === "execution") {
        validationResult.resultFingerprint = digest("0");
      }
      record = {
        outputKind: "evavo_website_book_state_export_record",
        schemaVersion: 1,
        ...entry,
        validationRequest,
        validationResult,
        validationFingerprint: validationResult.resultFingerprint,
      };
    }
    await writeJson(path.join(stateRoot, sourcePath), record);
    items.push({ ...entry, sourcePath, evidenceIds: [`evidence-${index}`] });
  }
  if (options.removeKind) {
    const index = items.findIndex((entry) => entry.stateKind === options.removeKind);
    if (index >= 0) items.splice(index, 1);
  }
  if (options.reverseItems) items.reverse();
  const spec = {
    outputKind: "evavo_website_book_state_export_spec",
    schemaVersion: 1,
    contract: "evavo_website_book_state_export_v1",
    exportId: "bundle-project-1",
    sourceCommit: commit,
    projectId: "project-1",
    programmeId: "programme-1",
    volumeIds: ["volume-1"],
    artworkRequiredVolumeIds: ["volume-1"],
    items,
    compiledAt: "2026-08-04T00:03:00.000Z",
    compiledBy: "migration-export-test",
    evidenceIds: ["bundle-evidence-1"],
    authoritativeWritesAllowed: false,
    canonicalManuscriptMutationAllowed: false,
    runtimeCutoverApproved: false,
    sourceDeletionApproved: false,
    publicationPerformed: false,
  };
  const specPath = path.join(directory, "spec.json");
  await writeJson(specPath, spec);
  return { directory, stateRoot, specPath, spec };
}

test("compiles one complete exact state bundle with source byte identities", async () => {
  const value = await fixture();
  const bundle = await compileWebsiteBookStateMigrationBundle({
    specPath: value.specPath,
    stateRoot: value.stateRoot,
    expectedSourceCommit: commit,
  });
  assert.equal(bundle.items.length, 9);
  assert.equal(bundle.expectedItems.length, 9);
  assert.equal(bundle.sourceCommit, commit);
  assert.equal(bundle.authoritativeWritesAllowed, false);
  assert.equal(bundle.runtimeCutoverApproved, false);
  assert.equal(bundle.publicationPerformed, false);
  const first = bundle.items[0];
  const bytes = await readFile(path.join(value.stateRoot, first.source.sourcePath));
  assert.equal(first.source.sourceGitBlobSha1, gitBlobSha1(bytes));
  assert.equal(first.source.sourceContentSha256, sha256(bytes));
  assert.equal(first.itemFingerprint, logicalFingerprint({
    ...Object.fromEntries(Object.entries(first).filter(([key]) => key !== "itemFingerprint")),
    evidenceIds: [...first.evidenceIds].sort(),
  }));
});

test("is deterministic across specification item ordering", async () => {
  const first = await fixture();
  const second = await fixture({ reverseItems: true });
  const firstBundle = await compileWebsiteBookStateMigrationBundle({
    specPath: first.specPath,
    stateRoot: first.stateRoot,
    expectedSourceCommit: commit,
  });
  const secondBundle = await compileWebsiteBookStateMigrationBundle({
    specPath: second.specPath,
    stateRoot: second.stateRoot,
    expectedSourceCommit: commit,
  });
  const scrub = (bundle) => ({
    ...bundle,
    items: bundle.items.map((item) => ({
      ...item,
      source: {
        ...item.source,
        sourceGitBlobSha1: "scrubbed",
        sourceContentSha256: "scrubbed",
      },
      itemFingerprint: "scrubbed",
    })),
  });
  assert.equal(canonicalJson(scrub(firstBundle)), canonicalJson(scrub(secondBundle)));
});

test("rejects missing volume coverage and source/result tampering", async () => {
  const missing = await fixture({ removeKind: "review_craft" });
  await assert.rejects(
    () => compileWebsiteBookStateMigrationBundle({
      specPath: missing.specPath,
      stateRoot: missing.stateRoot,
      expectedSourceCommit: commit,
    }),
    /REQUIRED_STATE_INVALID/,
  );

  const tampered = await fixture({ tamperResult: true });
  await assert.rejects(
    () => compileWebsiteBookStateMigrationBundle({
      specPath: tampered.specPath,
      stateRoot: tampered.stateRoot,
      expectedSourceCommit: commit,
    }),
    /RESULT_FINGERPRINT_MISMATCH/,
  );
});

test("rejects raw candidate prose and symbolic-link source files", async (t) => {
  const privatePayload = await fixture({ forbiddenPayload: true });
  await assert.rejects(
    () => compileWebsiteBookStateMigrationBundle({
      specPath: privatePayload.specPath,
      stateRoot: privatePayload.stateRoot,
      expectedSourceCommit: commit,
    }),
    /PRIVATE_PAYLOAD_FORBIDDEN/,
  );

  if (process.platform === "win32") {
    t.skip("Symbolic-link creation is not reliably available on Windows CI.");
    return;
  }
  const linked = await fixture();
  const item = linked.spec.items.find((entry) => entry.stateKind === "story");
  const sourceFile = path.join(linked.stateRoot, item.sourcePath);
  const realFile = path.join(linked.stateRoot, "records", "real-story.json");
  await writeFile(realFile, await readFile(sourceFile));
  await import("node:fs/promises").then(({ unlink }) => unlink(sourceFile));
  await symlink(realFile, sourceFile);
  await assert.rejects(
    () => compileWebsiteBookStateMigrationBundle({
      specPath: linked.specPath,
      stateRoot: linked.stateRoot,
      expectedSourceCommit: commit,
    }),
    /SYMLINK_FORBIDDEN/,
  );
});

test("CLI creates one private no-clobber bundle bound to the exact Website commit", async () => {
  const value = await fixture();
  const outputPath = path.join(value.directory, "bundle.json");
  const result = await runBookStateExportCli(
    ["--spec", value.specPath, "--root", value.stateRoot, "--output", outputPath],
    { EVAVO_WEBSITE_COMMIT_SHA: commit },
  );
  assert.equal(result.status, "compiled");
  assert.equal(result.sourceCommit, commit);
  assert.equal(JSON.parse(await readFile(outputPath, "utf8")).items.length, 9);
  await assert.rejects(
    () => runBookStateExportCli(
      ["--spec", value.specPath, "--root", value.stateRoot, "--output", outputPath],
      { EVAVO_WEBSITE_COMMIT_SHA: commit },
    ),
    /EEXIST/,
  );
  await assert.rejects(
    () => runBookStateExportCli(
      ["--spec", value.specPath, "--root", value.stateRoot, "--output", path.join(value.directory, "wrong.json")],
      { EVAVO_WEBSITE_COMMIT_SHA: "b".repeat(40) },
    ),
    /SOURCE_COMMIT_MISMATCH/,
  );
});
