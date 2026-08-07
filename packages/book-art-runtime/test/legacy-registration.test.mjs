import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";

import {
  compileLegacyBookArtByteRegistration,
  registerLegacyBookArtBytes,
} from "../dist/legacy-registration.js";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFklEQVR4nGPkEpHTYGBgYGBigAI4AwAJzABqHri4XAAAAABJRU5ErkJggg==",
  "base64",
);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const sha = (character) => character.repeat(64);

function identity() {
  return {
    workspaceId: "workspace-1",
    projectId: "project-1",
    bookId: "book-1",
    editionId: "paperback-1",
    requestId: "request-legacy-1",
  };
}

function qualityAuthority() {
  const contentSha256 = hash(PNG);
  return {
    outputKind: "book_cover_artwork_quality_authority",
    version: "book_cover_artwork_quality_authority_v1",
    status: "approved_for_composition",
    projectId: identity().projectId,
    artDirectionDigestSha256: sha("a"),
    candidate: {
      candidateId: "legacy-candidate-1",
      artifactReference:
        "book-cover-artifact://project-1/candidates/legacy-candidate-1.png",
      expectedSha256: contentSha256,
      provenance: {
        origin: "generative_assisted",
        creatorName: "Named art director",
        creatorRole: "art director",
        rightsStatus: "approved_commercial",
        rightsReference: "rights-record-1",
        sourceReference: "legacy-source-1",
        generation: {
          provider: "legacy-provider",
          model: "legacy-model",
          modelVersion: "1.0",
          runId: "run-1",
          promptRecordId: "prompt-1",
          promptSha256: sha("c"),
          referenceAssetSha256s: [sha("d")],
          humanEditSummary: ["Removed pseudo-text and corrected anatomy."],
        },
        c2pa: { status: "not_checked" },
        ingredientSha256s: [sha("d")],
      },
    },
    governedArtifact: {
      reference:
        "book-cover-artifact://project-1/candidates/legacy-candidate-1.png",
      checksumSha256: contentSha256,
      kind: "source_artwork",
      mimeType: "image/png",
      byteLength: PNG.byteLength,
      widthPx: 2,
      heightPx: 3,
    },
    humanReview: {
      decision: "approve_for_composition",
      reviewerName: "Named art director",
      reviewerRole: "art director",
      reviewedAt: "2026-08-01T09:00:00.000Z",
      answers: { generated_text_contamination: "pass" },
    },
    hardErrors: [],
    warnings: [],
    requiredRevisions: [],
    authorityDigestSha256: sha("e"),
  };
}

function candidateSetAuthority() {
  return {
    outputKind: "book_cover_artwork_candidate_set_authority",
    version: "book_cover_artwork_candidate_set_authority_v1",
    status: "selected_for_composition",
    projectId: identity().projectId,
    artDirectionDigestSha256: sha("a"),
    selectedCandidateId: "legacy-candidate-1",
    selectedQualityAuthorityDigestSha256: sha("e"),
    hardErrors: [],
    warnings: [],
    authorityDigestSha256: sha("f"),
  };
}

function selectionBinding() {
  return {
    outputKind: "book_cover_artwork_selection_binding",
    version: "book_cover_artwork_selection_binding_v1",
    status: "selected_for_composition",
    projectId: identity().projectId,
    candidateId: "legacy-candidate-1",
    sourceArtifactReference:
      "book-cover-artifact://project-1/candidates/legacy-candidate-1.png",
    sourceArtifactSha256: hash(PNG),
    artworkQualityAuthorityDigestSha256: sha("e"),
    candidateSetAuthorityDigestSha256: sha("f"),
    artDirectionDigestSha256: sha("a"),
    selectedBy: "Named art director",
    selectedByRole: "art director",
    selectedAt: "2026-08-01T09:00:00.000Z",
    bindingDigestSha256: sha("1"),
  };
}

function stateImportInput() {
  return {
    outputKind: "evavo_legacy_website_book_art_state_import_input",
    schemaVersion: 1,
    identity: identity(),
    sourceBriefFingerprint: sha("a"),
    qualityAuthority: qualityAuthority(),
    candidateSetAuthority: candidateSetAuthority(),
    selectionBinding: selectionBinding(),
  };
}

function input(importInput = stateImportInput()) {
  return {
    outputKind: "evavo_legacy_book_art_byte_registration_input",
    schemaVersion: 1,
    registrationId: "legacy-registration-1",
    registeredAt: "2026-08-03T01:00:00.000Z",
    purpose: "front_cover_art",
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommitSha: "a".repeat(40),
    sourcePath: "storage/book-art/legacy-candidate-1.png",
    stateImportInput: importInput,
  };
}

async function filesUnder(root) {
  try {
    return await readdir(root, { recursive: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

test("registers exact legacy artwork bytes once without re-encoding or approval", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-legacy-book-art-"));
  try {
    const artifacts = new LocalArtifactStore({ root });
    const compiled = await compileLegacyBookArtByteRegistration(input(), PNG);
    assert.equal(compiled.status, "ready", compiled.blockers.join("\n"));
    assert.ok(compiled.plan);
    assert.equal(compiled.plan.contentSha256, hash(PNG));
    assert.equal(compiled.plan.byteLength, PNG.byteLength);
    assert.equal(compiled.plan.mimeType, "image/png");
    assert.equal(compiled.plan.widthPx, 2);
    assert.equal(compiled.plan.heightPx, 3);
    assert.equal(compiled.plan.legacyReceipt.status, "review_required");
    assert.match(compiled.plan.stateImportFingerprintSha256, /^[a-f0-9]{64}$/);
    assert.equal(compiled.sourceArtifactWritten, false);

    const first = await registerLegacyBookArtBytes(input(), PNG, {
      artifacts,
      actor: "legacy-import-test",
    });
    assert.equal(first.status, "registered", first.blockers.join("\n"));
    assert.ok(first.sourceArtifact);
    assert.ok(first.evidenceArtifact);
    assert.equal(first.sourceArtifact.storageClass, "source");
    assert.equal(first.sourceArtifact.mediaType, "image/png");
    assert.equal(first.sourceArtifact.contentSha256, hash(PNG));
    assert.equal(first.sourceArtifact.labels.artifactRole, "book-art-legacy-source");
    assert.equal(first.sourceArtifact.labels.approvalState, "unapproved");
    assert.equal(first.sourceArtifact.labels.exactBytesPreserved, "true");
    assert.equal(first.evidenceArtifact.storageClass, "evidence");
    assert.equal(
      first.evidenceArtifact.labels.artifactRole,
      "book-art-legacy-byte-registration-evidence",
    );
    assert.deepEqual(await artifacts.read(first.sourceArtifact.artifactId), PNG);
    assert.deepEqual(await artifacts.listReferences("book-art"), []);
    assert.equal(first.exactSourceBytesPreserved, true);
    assert.equal(first.artifactBytesRewritten, false);
    assert.equal(first.legacyApprovalPromotedAutomatically, false);
    assert.equal(first.promotionRequired, true);
    assert.equal(first.runtimeCutoverApproved, false);

    const evidence = JSON.parse(
      (await artifacts.read(first.evidenceArtifact.artifactId)).toString("utf8"),
    );
    assert.equal(evidence.registeredArtifactId, first.sourceArtifact.artifactId);
    assert.equal(evidence.sourceContentSha256, hash(PNG));
    assert.equal(
      evidence.stateImportFingerprintSha256,
      first.plan.stateImportFingerprintSha256,
    );
    assert.equal(evidence.exactSourceBytesPreserved, true);
    assert.equal(evidence.selectionPerformed, false);
    assert.equal(evidence.promotionPerformed, false);
    assert.match(evidence.registrationFingerprintSha256, /^[a-f0-9]{64}$/);

    const second = await registerLegacyBookArtBytes(input(), PNG, {
      artifacts,
      actor: "legacy-import-test",
    });
    assert.equal(second.status, "registered");
    assert.equal(second.sourceArtifact?.artifactId, first.sourceArtifact.artifactId);
    assert.equal(second.evidenceArtifact?.artifactId, first.evidenceArtifact.artifactId);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("blocks checksum and dimension drift before any artifact write", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-legacy-book-art-block-"));
  try {
    const artifacts = new LocalArtifactStore({ root });
    await artifacts.root();

    const badImport = stateImportInput();
    badImport.qualityAuthority.candidate.expectedSha256 = sha("9");
    badImport.qualityAuthority.governedArtifact.checksumSha256 = sha("9");
    badImport.qualityAuthority.governedArtifact.widthPx = 99;
    badImport.selectionBinding.sourceArtifactSha256 = sha("9");
    const result = await registerLegacyBookArtBytes(input(badImport), PNG, {
      artifacts,
      actor: "legacy-import-test",
    });
    assert.equal(result.status, "blocked");
    assert.equal(result.sourceArtifactWritten, false);
    assert.equal(result.evidenceArtifactWritten, false);
    assert.ok(
      result.blockers.some(
        (item) =>
          item.includes("do not match the imported receipt") ||
          item.includes("decoded dimensions"),
      ),
    );
    const files = await filesUnder(root);
    assert.equal(files.some((item) => String(item).endsWith(".json")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects unsafe legacy evidence, unsupported purpose and unsafe source paths", async () => {
  const rightsBlocked = stateImportInput();
  rightsBlocked.qualityAuthority.candidate.provenance.rightsStatus = "blocked";
  const rights = await compileLegacyBookArtByteRegistration(
    input(rightsBlocked),
    PNG,
  );
  assert.equal(rights.status, "blocked");
  assert.ok(rights.blockers.some((item) => item.includes("rights status is blocked")));

  const unresolved = stateImportInput();
  unresolved.qualityAuthority.requiredRevisions = ["Repair the remaining anatomy."];
  const revisions = await compileLegacyBookArtByteRegistration(
    input(unresolved),
    PNG,
  );
  assert.equal(revisions.status, "blocked");
  assert.ok(
    revisions.blockers.some((item) => item.includes("unresolved required revision")),
  );

  const unsupported = input();
  unsupported.purpose = "interior_full_page_illustration";
  const purpose = await compileLegacyBookArtByteRegistration(unsupported, PNG);
  assert.equal(purpose.status, "blocked");
  assert.ok(purpose.blockers.some((item) => item.includes("purpose")));

  const unsafe = input();
  unsafe.sourcePath = "../outside.png";
  const pathResult = await compileLegacyBookArtByteRegistration(unsafe, PNG);
  assert.equal(pathResult.status, "blocked");
  assert.ok(pathResult.blockers.some((item) => item.includes("sourcePath")));
});
