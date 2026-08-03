import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";

const cwd = new URL("..", import.meta.url);
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFklEQVR4nGPkEpHTYGBgYGBigAI4AwAJzABqHri4XAAAAABJRU5ErkJggg==",
  "base64",
);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const sha = (character) => character.repeat(64);

function cleanEnvironment() {
  const environment = { ...process.env };
  delete environment.EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS;
  delete environment.EVAVO_BOOK_ART_PROVIDER_PREFERRED_ADAPTER;
  delete environment.EVAVO_BOOK_ART_PROVIDER_MODEL;
  return environment;
}

function run(args) {
  return spawnSync(process.execPath, ["dist/index.js", ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    env: cleanEnvironment(),
  });
}

function identity() {
  return {
    workspaceId: "workspace-1",
    projectId: "project-1",
    bookId: "book-1",
    editionId: "paperback-1",
    requestId: "request-legacy-cli-1",
  };
}

function stateImportInput(contentSha256 = hash(PNG)) {
  return {
    outputKind: "evavo_legacy_website_book_art_state_import_input",
    schemaVersion: 1,
    identity: identity(),
    sourceBriefFingerprint: sha("a"),
    qualityAuthority: {
      outputKind: "book_cover_artwork_quality_authority",
      version: "book_cover_artwork_quality_authority_v1",
      status: "shortlisted",
      projectId: identity().projectId,
      artDirectionDigestSha256: sha("a"),
      candidate: {
        candidateId: "legacy-cli-candidate-1",
        artifactReference:
          "book-cover-artifact://project-1/candidates/legacy-cli-candidate.png",
        expectedSha256: contentSha256,
        provenance: {
          origin: "human_digital_art",
          creatorName: "Named illustrator",
          creatorRole: "illustrator",
          rightsStatus: "review_required",
          rightsReference: "rights-record-1",
          sourceReference: "legacy-human-source",
          c2pa: { status: "not_checked" },
          ingredientSha256s: [],
        },
      },
      governedArtifact: {
        reference:
          "book-cover-artifact://project-1/candidates/legacy-cli-candidate.png",
        checksumSha256: contentSha256,
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
        reviewedAt: "2026-08-01T09:00:00.000Z",
        answers: { generated_text_contamination: "pass" },
      },
      hardErrors: [],
      warnings: [],
      requiredRevisions: [],
      authorityDigestSha256: sha("d"),
    },
  };
}

function registration(contentSha256 = hash(PNG)) {
  return {
    outputKind: "evavo_legacy_book_art_byte_registration_input",
    schemaVersion: 1,
    registrationId: "legacy-cli-registration-1",
    registeredAt: "2026-08-03T01:15:00.000Z",
    purpose: "front_cover_art",
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommitSha: "a".repeat(40),
    sourcePath: "storage/book-art/legacy-cli-candidate.png",
    stateImportInput: stateImportInput(contentSha256),
  };
}

function envelope(contentSha256 = hash(PNG)) {
  return {
    registration: registration(contentSha256),
    sourceFile: "legacy.png",
  };
}

test("CLI registers exact legacy Book Art bytes without provider policy or approval", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-book-art-cli-legacy-"));
  try {
    const inputPath = path.join(root, "registration.json");
    const sourcePath = path.join(root, "legacy.png");
    const artifactRoot = path.join(root, "artifacts");
    await writeFile(inputPath, JSON.stringify(envelope()), "utf8");
    await writeFile(sourcePath, PNG);

    const arguments_ = [
      "book-art-legacy-register",
      "--input",
      inputPath,
      "--artifact-root",
      artifactRoot,
      "--actor",
      "cli-legacy-import-test",
    ];
    const first = run(arguments_);
    assert.equal(first.status, 0, first.stderr);
    const firstBody = JSON.parse(first.stdout);
    assert.equal(firstBody.status, "registered");
    assert.equal(firstBody.exactSourceBytesPreserved, true);
    assert.equal(firstBody.artifactBytesRewritten, false);
    assert.equal(firstBody.legacyApprovalPromotedAutomatically, false);
    assert.equal(firstBody.sourceArtifact.labels.approvalState, "unapproved");

    const store = new LocalArtifactStore({ root: artifactRoot });
    assert.deepEqual(await store.read(firstBody.sourceArtifact.artifactId), PNG);
    assert.deepEqual(await store.listReferences("book-art"), []);

    const second = run(arguments_);
    assert.equal(second.status, 0, second.stderr);
    const secondBody = JSON.parse(second.stdout);
    assert.equal(
      secondBody.sourceArtifact.artifactId,
      firstBody.sourceArtifact.artifactId,
    );
    assert.equal(
      secondBody.evidenceArtifact.artifactId,
      firstBody.evidenceArtifact.artifactId,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI blocks checksum drift before writing any registration artifact", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-book-art-cli-legacy-block-"));
  try {
    const inputPath = path.join(root, "registration.json");
    const sourcePath = path.join(root, "legacy.png");
    await writeFile(inputPath, JSON.stringify(envelope(sha("9"))), "utf8");
    await writeFile(sourcePath, PNG);
    const result = run([
      "book-art-legacy-register",
      "--input",
      inputPath,
      "--artifact-root",
      path.join(root, "artifacts"),
    ]);
    assert.equal(result.status, 2, result.stderr);
    const body = JSON.parse(result.stdout);
    assert.equal(body.status, "blocked");
    assert.equal(body.sourceArtifactWritten, false);
    assert.equal(body.evidenceArtifactWritten, false);
    assert.ok(body.blockers.some((item) => item.includes("contentSha256")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
