import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const readJson = (name) => JSON.parse(readFileSync(path.join(root, name), "utf8"));
const evidence = readJson("book-studio-destination-surface-evidence.v1.json");
const retirement = readJson("WEBSITE_BOOK_ART_SOURCE_RETIREMENT.v1.json");

const WEBSITE_MAIN = "47ee7ec75fa546f28db109ebe4fe2c6d170b499d";
const WRITING_MAIN = "83a5d1b183335e2d86565b10f3f8c822399e3697";
const DOCS_MAIN = "ecf6bc25f33b81a2b306dabf17a8683d9db0d3b0";
const ART_MAIN = "bc25cdd0fad5d562a8ed60be46ac2d99d62a23c9";
const VALIDATION_COMMIT = "291cede3dc7a877dde224b9a1f5208cf30f887af";
const VALIDATION_RUN = 30829894815;
const VALIDATION_JOB = 91740925115;

assert.equal(evidence.recordFingerprint, fingerprint(unsigned(evidence)));
assert.equal(retirement.recordFingerprint, fingerprint(unsigned(retirement)));
assert.deepEqual(evidence.observedRepositoryHeads, {
  website: WEBSITE_MAIN,
  writingStudio: WRITING_MAIN,
  docsSuite: DOCS_MAIN,
  artStudio: ART_MAIN,
});
assert.deepEqual(evidence.counts, {
  reviewedSourcePathsBound: 8,
  destinationSurfacesReady: 8,
  integrationAdaptersComplete: 8,
  originalUnresolvedBoundaryCount: 20,
  remainingUnresolvedBoundaryCount: 12,
});
assert.deepEqual(evidence.gates, {
  allReviewedAdaptersComplete: true,
  allSymbolSplitsComplete: false,
  semanticParityVerified: false,
  sourceReplayApproved: false,
  canonicalWriterChanged: false,
  runtimeCutoverApproved: false,
  sourceDeletionApproved: false,
  publicationPerformed: false,
});
assert.equal(retirement.authoritativeArtCommit, ART_MAIN);
assert.equal(retirement.docsSuiteCommit, DOCS_MAIN);
assert.equal(retirement.legacyPlanTranslationAdaptersComplete, true);
assert.equal(retirement.remainingBookStudioMigrationBoundaryCount, 12);
assert.equal(retirement.bookArtRuntimeCutoverApproved, true);
assert.equal(retirement.bookArtSourceDeletionApproved, true);
assert.equal(retirement.overallBookProductCutoverApproved, false);
assert.equal(retirement.publicationPerformed, false);

const paths = new Set();
for (const surface of evidence.legacyPlanDestinationSurfaces) {
  assert.equal(surface.artStudioCurrentCommit, ART_MAIN);
  assert.equal(surface.docsSuiteAdapterCommit, DOCS_MAIN);
  assert.equal(surface.docsSuiteRestSurface, "/api/v1/book-studio/art-plan-translation");
  assert.equal(surface.docsSuiteCliCapabilities, "art-plan-capabilities");
  assert.equal(surface.docsSuiteCliTranslation, "art-plan-translate");
  assert.equal(surface.docsSuiteMcpTool, "translate_legacy_book_art_plan");
  assert.equal(surface.independentWorkOrderRecompilation, true);
  assert.equal(surface.artStudioCallMaximum, 1);
  assert.equal(surface.ambiguousRetryAllowed, false);
  assert.equal(surface.crossRepositoryParityValidated, true);
  assert.equal(surface.validationRepository, "EVAVO-STUDIO/evavo-art-studio");
  assert.equal(surface.validationCommit, VALIDATION_COMMIT);
  assert.equal(surface.validationWorkflowRunId, VALIDATION_RUN);
  assert.equal(surface.validationJobId, VALIDATION_JOB);
  assert.equal(surface.destinationSurfaceReady, true);
  assert.equal(surface.docsSuiteIntegrationAdapterComplete, true);
  assert.equal(surface.providerCallPerformed, false);
  assert.equal(surface.runtimeJobSubmitted, false);
  assert.equal(surface.artifactBytesWritten, false);
  assert.equal(surface.runtimeCutoverApproved, false);
  assert.equal(surface.publicationPerformed, false);
  for (const source of surface.sourcePaths) {
    assert.equal(source.disposition, "REPLACE_WITH_VERSIONED_ADAPTER");
    assert.match(source.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(source.byteLength) && source.byteLength > 0);
    assert.equal(paths.has(source.path), false, `duplicate source path ${source.path}`);
    paths.add(source.path);
  }
}
for (const source of evidence.programmeAndAmazonAutopilot.sourcePaths) {
  assert.equal(source.disposition, "REPLACE_WITH_VERSIONED_ADAPTER");
  assert.match(source.sha256, /^[a-f0-9]{64}$/);
  assert.ok(Number.isSafeInteger(source.byteLength) && source.byteLength > 0);
  assert.equal(paths.has(source.path), false, `duplicate source path ${source.path}`);
  paths.add(source.path);
}
assert.equal(paths.size, 8);
assert.ok(evidence.notes.some((note) => note.includes("Twelve mixed-authority symbol-level splits remain")));

console.log(JSON.stringify({
  status: "PASS",
  evidenceFingerprint: evidence.recordFingerprint,
  retirementFingerprint: retirement.recordFingerprint,
  adapterPaths: paths.size,
  remainingSymbolSplits: 12,
  docsSuiteCommit: DOCS_MAIN,
  artStudioCommit: ART_MAIN,
  validationRun: VALIDATION_RUN,
  runtimeCutoverApproved: false,
  publicationPerformed: false,
}, null, 2));

function unsigned(value) {
  const { recordFingerprint: _discarded, ...rest } = value;
  return rest;
}

function fingerprint(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
}

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
