import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const cwd = new URL("..", import.meta.url);
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFklEQVR4nGPkEpHTYGBgYGBigAI4AwAJzABqHri4XAAAAABJRU5ErkJggg==",
  "base64",
);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const sha = (character) => character.repeat(64);
const SOURCE_COMMIT = "a".repeat(40);

function cleanEnvironment() {
  const environment = { ...process.env };
  delete environment.EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS;
  delete environment.EVAVO_BOOK_ART_PROVIDER_PREFERRED_ADAPTER;
  delete environment.EVAVO_BOOK_ART_PROVIDER_MODEL;
  return environment;
}

function run(args) {
  return spawnSync(
    process.execPath,
    ["dist/legacy-readiness-cli.js", ...args],
    {
      cwd,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      env: cleanEnvironment(),
    },
  );
}

function registrationInput(index, expectedSha256 = hash(PNG)) {
  const identity = {
    workspaceId: "workspace-1",
    projectId: "project-1",
    bookId: `book-${index}`,
    editionId: `paperback-${index}`,
    requestId: `request-legacy-file-${index}`,
  };
  const candidateId = `legacy-file-candidate-${index}`;
  const artifactReference =
    `book-cover-artifact://project-1/candidates/${candidateId}.png`;
  return {
    outputKind: "evavo_legacy_book_art_byte_registration_input",
    schemaVersion: 1,
    registrationId: `legacy-file-registration-${index}`,
    registeredAt: "2026-08-07T04:10:00.000Z",
    purpose: "front_cover_art",
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommitSha: SOURCE_COMMIT,
    sourcePath: `storage/book-art/${candidateId}.png`,
    stateImportInput: {
      outputKind: "evavo_legacy_website_book_art_state_import_input",
      schemaVersion: 1,
      identity,
      sourceBriefFingerprint: sha("a"),
      qualityAuthority: {
        outputKind: "book_cover_artwork_quality_authority",
        version: "book_cover_artwork_quality_authority_v1",
        status: "shortlisted",
        projectId: identity.projectId,
        artDirectionDigestSha256: sha("a"),
        candidate: {
          candidateId,
          artifactReference,
          expectedSha256,
          provenance: {
            origin: "human_digital_art",
            creatorName: "Named art director",
            creatorRole: "art director",
            rightsStatus: "approved_commercial",
            rightsReference: `rights-record-${index}`,
            sourceReference: `legacy-source-${index}`,
            c2pa: { status: "not_checked" },
            ingredientSha256s: [],
          },
        },
        governedArtifact: {
          reference: artifactReference,
          checksumSha256: expectedSha256,
          kind: "source_artwork",
          mimeType: "image/png",
          byteLength: PNG.byteLength,
          widthPx: 2,
          heightPx: 3,
        },
        humanReview: {
          decision: "shortlist",
          reviewerName: "Named art director",
          reviewerRole: "art director",
          reviewedAt: "2026-08-07T04:00:00.000Z",
          answers: { generated_text_contamination: "pass" },
        },
        hardErrors: [],
        warnings: [],
        requiredRevisions: [],
        authorityDigestSha256: sha("e"),
      },
    },
  };
}

function manifest(items, overrides = {}) {
  return {
    outputKind:
      "evavo_legacy_book_art_dry_run_readiness_batch_file_input",
    schemaVersion: 1,
    contract: "evavo_book_art_legacy_dry_run_readiness_batch_file_v1",
    batchId: "legacy-file-batch-1",
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommitSha: SOURCE_COMMIT,
    compiledAt: "2026-08-07T05:00:00.000Z",
    compiledBy: "named-migration-operator",
    items,
    sourceArtifactWritesAllowed: false,
    evidenceArtifactWritesAllowed: false,
    providerCallsAllowed: false,
    selectionAllowed: false,
    promotionAllowed: false,
    bookUseBindingAllowed: false,
    canonicalWriterChangeAllowed: false,
    runtimeCutoverApprovalAllowed: false,
    publicationAllowed: false,
    ...overrides,
  };
}

function manifestItem(index, sourceFile, expectedSha256 = hash(PNG)) {
  return {
    itemId: `legacy-file-item-${index}`,
    registrationInput: registrationInput(index, expectedSha256),
    sourceFile,
  };
}

function commandArguments(input, sourceRoot, receipt) {
  return [
    "--input",
    input,
    "--source-root",
    sourceRoot,
    "--receipt",
    receipt,
  ];
}

function assertNoAuthority(value) {
  assert.equal(value.networkCallPerformed, false);
  assert.equal(value.sourceArtifactWriteAttempted, false);
  assert.equal(value.evidenceArtifactWriteAttempted, false);
  assert.equal(value.providerCallPerformed, false);
  assert.equal(value.selectionPerformed, false);
  assert.equal(value.promotionPerformed, false);
  assert.equal(value.bookUseBindingCreated, false);
  assert.equal(value.canonicalWriterChanged, false);
  assert.equal(value.runtimeCutoverApproved, false);
  assert.equal(value.retailerUploadPerformed, false);
  assert.equal(value.publicationPerformed, false);
}

async function missing(filePath) {
  try {
    await access(filePath);
    return false;
  } catch {
    return true;
  }
}

test("CLI writes one no-clobber deterministic receipt from explicit private files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-legacy-readiness-file-"));
  try {
    const sourceRoot = path.join(root, "sources");
    const nested = path.join(sourceRoot, "nested");
    const outputRoot = path.join(root, "receipts");
    await mkdir(nested, { recursive: true });
    await mkdir(outputRoot, { recursive: true });
    await writeFile(path.join(sourceRoot, "first.png"), PNG);
    await writeFile(path.join(nested, "second.png"), PNG);

    const firstInput = path.join(root, "first-manifest.json");
    const secondInput = path.join(root, "second-manifest.json");
    const firstReceipt = path.join(outputRoot, "first-receipt.json");
    const secondReceipt = path.join(outputRoot, "second-receipt.json");
    const items = [
      manifestItem(1, "first.png"),
      manifestItem(2, "nested/second.png"),
    ];
    await writeFile(firstInput, JSON.stringify(manifest(items)), "utf8");
    await writeFile(
      secondInput,
      JSON.stringify(manifest([...items].reverse())),
      "utf8",
    );

    const first = run(commandArguments(firstInput, sourceRoot, firstReceipt));
    assert.equal(first.status, 0, first.stderr);
    const firstSummary = JSON.parse(first.stdout);
    const firstBody = JSON.parse(await readFile(firstReceipt, "utf8"));
    assert.equal(firstSummary.status, "ready");
    assert.equal(firstBody.status, "ready");
    assert.equal(firstBody.batchResult.itemCount, 2);
    assert.equal(firstBody.batchResult.readyCount, 2);
    assert.deepEqual(firstBody.sourceFiles.map((item) => item.itemId), [
      "legacy-file-item-1",
      "legacy-file-item-2",
    ]);
    assert.ok(firstBody.sourceFiles.every((item) =>
      item.sourceContentSha256 === hash(PNG)
    ));
    assert.equal(JSON.stringify(firstBody).includes(PNG.toString("base64")), false);
    assertNoAuthority(firstSummary);
    assertNoAuthority(firstBody);

    const second = run(commandArguments(secondInput, sourceRoot, secondReceipt));
    assert.equal(second.status, 0, second.stderr);
    const secondBody = JSON.parse(await readFile(secondReceipt, "utf8"));
    assert.equal(
      secondBody.batchResult.batchFingerprintSha256,
      firstBody.batchResult.batchFingerprintSha256,
    );
    assert.equal(
      secondBody.batchResult.receiptSetFingerprintSha256,
      firstBody.batchResult.receiptSetFingerprintSha256,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI preserves a blocked batch receipt when one exact source mismatches", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-legacy-readiness-blocked-"));
  try {
    const sourceRoot = path.join(root, "sources");
    const outputRoot = path.join(root, "receipts");
    await mkdir(sourceRoot, { recursive: true });
    await mkdir(outputRoot, { recursive: true });
    await writeFile(path.join(sourceRoot, "first.png"), PNG);
    await writeFile(path.join(sourceRoot, "second.png"), PNG);
    const input = path.join(root, "manifest.json");
    const receipt = path.join(outputRoot, "receipt.json");
    await writeFile(
      input,
      JSON.stringify(manifest([
        manifestItem(1, "first.png"),
        manifestItem(2, "second.png", sha("9")),
      ])),
      "utf8",
    );

    const result = run(commandArguments(input, sourceRoot, receipt));
    assert.equal(result.status, 2, result.stderr);
    const summary = JSON.parse(result.stdout);
    const body = JSON.parse(await readFile(receipt, "utf8"));
    assert.equal(summary.status, "blocked");
    assert.equal(body.status, "blocked");
    assert.equal(body.batchResult.readyCount, 1);
    assert.equal(body.batchResult.blockedCount, 1);
    assert.ok(body.batchResult.blockers.some((item) =>
      item.startsWith("legacy-file-item-2:")
    ));
    assertNoAuthority(summary);
    assertNoAuthority(body);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI reserves the receipt before reading any manifest or source", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-legacy-readiness-clobber-"));
  try {
    const receipt = path.join(root, "receipt.json");
    await writeFile(receipt, "do-not-replace", "utf8");
    const result = run(commandArguments(
      path.join(root, "missing-manifest.json"),
      path.join(root, "missing-sources"),
      receipt,
    ));
    assert.equal(result.status, 1);
    const error = JSON.parse(result.stderr);
    assert.equal(error.errorCode, "RECEIPT_ALREADY_EXISTS");
    assert.equal(await readFile(receipt, "utf8"), "do-not-replace");
    assertNoAuthority(error);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI rejects traversal and removes the reserved receipt", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-legacy-readiness-traversal-"));
  try {
    const sourceRoot = path.join(root, "sources");
    const outputRoot = path.join(root, "receipts");
    await mkdir(sourceRoot, { recursive: true });
    await mkdir(outputRoot, { recursive: true });
    await writeFile(path.join(root, "outside.png"), PNG);
    const input = path.join(root, "manifest.json");
    const receipt = path.join(outputRoot, "receipt.json");
    await writeFile(
      input,
      JSON.stringify(manifest([manifestItem(1, "../outside.png")])),
      "utf8",
    );

    const result = run(commandArguments(input, sourceRoot, receipt));
    assert.equal(result.status, 1);
    const error = JSON.parse(result.stderr);
    assert.equal(
      error.errorCode,
      "MANIFEST_ITEM_0_SOURCE_FILE_INVALID",
    );
    assert.equal(await missing(receipt), true);
    assertNoAuthority(error);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI rejects symbolic-link source files without leaking their target", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-legacy-readiness-symlink-"));
  try {
    const sourceRoot = path.join(root, "sources");
    const outputRoot = path.join(root, "receipts");
    await mkdir(sourceRoot, { recursive: true });
    await mkdir(outputRoot, { recursive: true });
    const outside = path.join(root, "private-outside.png");
    await writeFile(outside, PNG);
    try {
      await symlink(outside, path.join(sourceRoot, "linked.png"));
    } catch (error) {
      if (error?.code === "EPERM" || error?.code === "EACCES") {
        context.skip("symbolic links are unavailable in this environment");
        return;
      }
      throw error;
    }
    const input = path.join(root, "manifest.json");
    const receipt = path.join(outputRoot, "receipt.json");
    await writeFile(
      input,
      JSON.stringify(manifest([manifestItem(1, "linked.png")])),
      "utf8",
    );

    const result = run(commandArguments(input, sourceRoot, receipt));
    assert.equal(result.status, 1);
    const error = JSON.parse(result.stderr);
    assert.equal(error.errorCode, "SOURCE_FILE_SYMLINK:legacy-file-item-1");
    assert.equal(result.stderr.includes(outside), false);
    assert.equal(await missing(receipt), true);
    assertNoAuthority(error);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
