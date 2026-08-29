import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT_V2,
  BOOK_COVER_COMMERCIAL_RELEASE_LOCAL_COMMAND_V2,
  BOOK_COVER_COMMERCIAL_RELEASE_SCHEMA_VERSION_V2,
  listBookCoverCommercialReleaseCapabilitiesV2,
} from "../dist/book-cover-commercial-release-v2.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(packageRoot, "../..");

async function readPackageFile(relativePath) {
  return readFile(path.join(packageRoot, relativePath), "utf8");
}

async function readRepositoryFile(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

test("keeps commercial release V2 local-first, non-publishing and human-governed", () => {
  assert.equal(BOOK_COVER_COMMERCIAL_RELEASE_SCHEMA_VERSION_V2, 2);
  assert.equal(
    BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT_V2,
    "evavo_art_book_cover_commercial_release_v2",
  );
  assert.equal(
    BOOK_COVER_COMMERCIAL_RELEASE_LOCAL_COMMAND_V2,
    "node scripts/run-book-cover-commercial-release-v2-local.mjs",
  );

  const capabilities = listBookCoverCommercialReleaseCapabilitiesV2();
  assert.equal(Object.isFrozen(capabilities), true);
  assert.equal(capabilities.localValidationAuthoritative, true);
  assert.equal(capabilities.githubHostedActionsRequired, false);
  assert.equal(capabilities.paidCiRequired, false);
  assert.equal(capabilities.paidCrawlerRequired, false);
  assert.equal(capabilities.paidImageApiRequiredForValidation, false);
  assert.equal(capabilities.vercelBackgroundWorkerRequired, false);
  assert.equal(capabilities.networkRequiredForValidation, false);
  assert.equal(capabilities.workflowFilesAuthoritative, false);
  assert.equal(capabilities.automaticSelectionAllowed, false);
  assert.equal(capabilities.automaticPromotionAllowed, false);
  assert.equal(capabilities.publicationAllowed, false);
  assert.deepEqual([...capabilities.capabilities], [
    "book.cover.art_stage_release.compile",
    "book.cover.art_stage_release.validate",
    "book.cover.docs_suite_composition.authorize",
    "book.cover.post_composition_proofs.defer",
  ]);
});

test("keeps Art-stage proofs separate from Docs Suite post-composition proofs", async () => {
  const source = await readPackageFile("src/book-cover-commercial-release-v2.ts");

  for (const token of [
    "DOCS_SUITE_POST_COMPOSITION_PROOF_IDS",
    "requiredArtStageProofIds",
    "deferredToDocsSuiteProofIds",
    "postCompositionProofsDeferred: true",
    "cannot be accepted before Docs Suite has composed exact typography and edition geometry",
    "At least two Art-stage visual proofs are required before Docs Suite composition",
    "Commercial-release V2 Art-stage proof partition is invalid",
    "Commercial-release V2 Docs Suite proof partition is invalid",
    "Commercial-release V2 includes premature post-composition proof evidence",
  ]) {
    assert.ok(source.includes(token), `V2 source must retain ${JSON.stringify(token)}.`);
  }

  assert.match(
    source,
    /requiredArtStageProofIds\s*=\s*requiredProofIds\.filter\([\s\S]*?!DOCS_SUITE_POST_COMPOSITION_PROOF_IDS\.has/,
  );
  assert.match(
    source,
    /deferredToDocsSuiteProofIds\s*=\s*requiredProofIds\.filter\([\s\S]*?DOCS_SUITE_POST_COMPOSITION_PROOF_IDS\.has/,
  );
});

test("keeps the public export, local runner and automatic package enforcement installed", async () => {
  const [indexSource, runnerSource, packageJsonSource] = await Promise.all([
    readPackageFile("src/index.ts"),
    readRepositoryFile("scripts/run-book-cover-commercial-release-v2-local.mjs"),
    readPackageFile("package.json"),
  ]);

  assert.ok(
    indexSource.includes('export * from "./book-cover-commercial-release-v2.js";'),
    "The public contracts entrypoint must export commercial release V2.",
  );
  assert.ok(
    packageJsonSource.includes('node --test \\"test/**/*.test.mjs\\"'),
    "The contracts package test command must automatically include governance tests.",
  );

  for (const token of [
    "validateBookCoverCommercialReleaseAuthorityV2",
    "compileBookCoverCommercialReleaseAuthorityV2",
    "localValidationAuthoritative: true",
    "networkUsed: false",
    "githubHostedActionsUsed: false",
    "vercelBackgroundWorkerUsed: false",
    "paidServiceUsed: false",
    'result.status !== "ready_for_docs_composition"',
  ]) {
    assert.ok(runnerSource.includes(token), `The local V2 runner must retain ${JSON.stringify(token)}.`);
  }

  for (const prohibited of [
    /\bfetch\s*\(/,
    /\baxios\b/i,
    /\bplaywright\b/i,
    /\bpuppeteer\b/i,
    /process\.env\.(?:VERCEL|GITHUB|OPENAI|ANTHROPIC|GEMINI|GOOGLE|AWS|CLOUDINARY)/,
  ]) {
    assert.doesNotMatch(runnerSource, prohibited);
  }
});

test("keeps canonical tamper detection and authority escalation blockers in the validator", async () => {
  const source = await readPackageFile("src/book-cover-commercial-release-v2.ts");

  for (const token of [
    "Commercial-release V2 authority digest differs from its canonical contents",
    "Commercial-release V2 automatic or publication flags are invalid",
    "Docs Suite composition authorization differs from V2 authority status",
    "Ready V2 authority retains blockers or required actions",
    "Ready V2 authority retains failed Art-stage proofs",
    "Ready V2 authority retains missing Art-stage proofs",
  ]) {
    assert.ok(source.includes(token), `V2 validation must retain ${JSON.stringify(token)}.`);
  }

  assert.match(source, /authority\.automaticSelectionAllowed\s*!==\s*false/);
  assert.match(source, /authority\.automaticPromotionAllowed\s*!==\s*false/);
  assert.match(source, /authority\.publicationAllowed\s*!==\s*false/);
  assert.match(source, /sha256\(unsigned\)\s*!==\s*authority\.authorityDigestSha256/);
});
