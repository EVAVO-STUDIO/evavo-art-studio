import assert from "node:assert/strict";
import test from "node:test";

import {
  BookArtPromotionAdapterError,
  compileBookArtArtifactReceiptFromPromotion,
  compileBookArtPromotionBatch,
  fingerprintBookArtProductionEvidence,
} from "../dist/index.js";

const sha = (character) => character.repeat(64);
const artifactId = (character) => `artifact_${character.repeat(64)}`;

async function sha256Text(value) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function artifact({ id, content, role, storageClass = "evidence", mediaType = "application/json", sourceArtifacts = [], labels = {}, sizeBytes = 1024 }) {
  return {
    artifactId: id,
    descriptorSha256: sha("f"),
    contentSha256: content,
    sizeBytes,
    mediaType,
    storageClass,
    sourceArtifacts,
    labels: { artifactRole: role, ...labels },
  };
}

function verification(snapshot) {
  return {
    artifactId: snapshot.artifactId,
    exists: true,
    descriptorValid: true,
    contentValid: true,
    expectedContentSha256: snapshot.contentSha256,
    actualContentSha256: snapshot.contentSha256,
    expectedSizeBytes: snapshot.sizeBytes,
    actualSizeBytes: snapshot.sizeBytes,
  };
}

async function fixture(seed = "1") {
  const candidateId = artifactId(seed);
  const masterId = artifactId(seed === "1" ? "2" : "7");
  const selectionId = artifactId(seed === "1" ? "3" : "8");
  const authorizationId = artifactId(seed === "1" ? "4" : "9");
  const productionEvidenceId = artifactId(seed === "1" ? "5" : "a");
  const masterContent = sha(seed === "1" ? "b" : "c");
  const promotionId = `promotion-${seed}`;
  const selectionContent = sha(seed === "1" ? "d" : "e");
  const authorizationContent = sha(seed === "1" ? "1" : "2");
  const sourceBriefFingerprint = sha("3");
  const evidenceUnsigned = {
    outputKind: "evavo_book_art_production_evidence",
    schemaVersion: 1,
    identity: {
      workspaceId: "workspace-1",
      projectId: "project-1",
      bookId: "book-1",
      editionId: "paperback-1",
      requestId: `request-${seed}`,
    },
    sourceBriefFingerprint,
    promotionId,
    selectionEvidenceArtifactId: selectionId,
    candidateArtifactId: candidateId,
    masterArtifactId: masterId,
    authorizationEvidenceArtifactId: authorizationId,
    masterContentSha256: masterContent,
    masterSizeBytes: 123456,
    technicalQualityReceiptSha256: sha("4"),
    widthPx: 3000,
    heightPx: 4800,
    mimeType: "image/png",
    provenance: {
      origin: "ai_assisted",
      provider: "reviewed-provider",
      model: "reviewed-model",
      modelVersion: "1.0",
      promptSha256: sha("5"),
      seed: `seed-${seed}`,
      sourceArtifactIds: [candidateId],
      rightsEvidenceIds: [`rights-${seed}`],
      rightsStatus: "approved_commercial",
      aiDisclosure: "ai_assisted",
    },
    generatedTextDetected: false,
    unresolvedRisks: [],
  };
  const evidence = {
    ...evidenceUnsigned,
    evidenceFingerprint: await fingerprintBookArtProductionEvidence(evidenceUnsigned),
  };
  const productionEvidenceJson = JSON.stringify(evidence);
  const productionEvidenceContent = await sha256Text(productionEvidenceJson);

  const masterArtifact = artifact({
    id: masterId,
    content: masterContent,
    role: "selected-art-master",
    storageClass: "master",
    mediaType: "image/png",
    sourceArtifacts: [candidateId, selectionId],
    sizeBytes: 123456,
    labels: {
      approvalState: "selected",
      qualityState: "passed",
      promotionId,
      selectionEvidenceArtifactId: selectionId,
      sourceCandidateArtifactId: candidateId,
      approvalMode: "human",
    },
  });
  const selectionEvidenceArtifact = artifact({
    id: selectionId,
    content: selectionContent,
    role: "candidate-selection-evidence",
    sourceArtifacts: [candidateId],
  });
  const authorizationArtifact = artifact({
    id: authorizationId,
    content: authorizationContent,
    role: "candidate-promotion-authorization",
    sourceArtifacts: [selectionId, candidateId, masterId],
    labels: { promotionId },
  });
  const productionEvidenceArtifact = artifact({
    id: productionEvidenceId,
    content: productionEvidenceContent,
    role: "book-art-production-evidence",
    sourceArtifacts: [candidateId, selectionId, authorizationId, masterId],
    sizeBytes: new TextEncoder().encode(productionEvidenceJson).byteLength,
    labels: { promotionId, masterArtifactId: masterId },
  });
  const promotion = {
    schemaVersion: "1.0",
    promotionId,
    selectionEvidenceArtifactId: selectionId,
    candidateArtifactId: candidateId,
    masterArtifactId: masterId,
    authorizationEvidenceArtifactId: authorizationId,
    reference: {
      schemaVersion: "1.0",
      namespace: "book-art",
      name: `cover-${seed}`,
      generation: 1,
      artifactId: masterId,
      contentHash: `sha256:${masterContent}`,
      updatedAt: "2026-08-02T02:00:00.000Z",
      actor: "Named Art Studio promoter",
    },
    approvalMode: "human",
  };
  return {
    promotion,
    masterArtifact,
    masterVerification: verification(masterArtifact),
    selectionEvidenceArtifact,
    selectionEvidenceVerification: verification(selectionEvidenceArtifact),
    authorizationArtifact,
    authorizationVerification: verification(authorizationArtifact),
    productionEvidenceArtifact,
    productionEvidenceVerification: verification(productionEvidenceArtifact),
    productionEvidenceJson,
  };
}

async function replaceEvidence(input, mutate) {
  const evidence = JSON.parse(input.productionEvidenceJson);
  mutate(evidence);
  const { evidenceFingerprint: _discarded, ...unsigned } = evidence;
  evidence.evidenceFingerprint = await fingerprintBookArtProductionEvidence(unsigned);
  input.productionEvidenceJson = JSON.stringify(evidence);
  input.productionEvidenceArtifact.contentSha256 = await sha256Text(input.productionEvidenceJson);
  input.productionEvidenceArtifact.sizeBytes = new TextEncoder().encode(input.productionEvidenceJson).byteLength;
  input.productionEvidenceVerification = verification(input.productionEvidenceArtifact);
}

test("derives one approved Book Art receipt from verified immutable promotion evidence", async () => {
  const input = await fixture("1");
  const receipt = await compileBookArtArtifactReceiptFromPromotion(input);
  assert.equal(receipt.status, "approved");
  assert.equal(receipt.artifactId, input.promotion.masterArtifactId);
  assert.equal(receipt.contentSha256, input.masterArtifact.contentSha256);
  assert.equal(receipt.selectionReceiptSha256, input.selectionEvidenceArtifact.contentSha256);
  assert.equal(receipt.promotionReceiptSha256, input.authorizationArtifact.contentSha256);
  assert.equal(receipt.artifactReference, `art-studio://book-art/cover-1/1/${input.promotion.masterArtifactId}`);
  assert.equal(receipt.generatedTextDetected, false);
  assert.deepEqual(receipt.unresolvedRisks, []);
  assert.equal(receipt.publicationPerformed, false);
});

test("compiles complete deterministic promotion batches without writes", async () => {
  const first = await fixture("1");
  const second = await fixture("6");
  const input = {
    batchId: "book-art-promotions-1",
    sourceArtImportBatchFingerprint: sha("6"),
    expectedMigrationItemIds: ["migration-1", "migration-2"],
    items: [
      { migrationItemId: "migration-1", input: first },
      { migrationItemId: "migration-2", input: second },
    ],
  };
  const forward = await compileBookArtPromotionBatch(input);
  const reverse = await compileBookArtPromotionBatch({
    ...input,
    expectedMigrationItemIds: [...input.expectedMigrationItemIds].reverse(),
    items: [...input.items].reverse(),
  });
  assert.equal(forward.batchFingerprint, reverse.batchFingerprint);
  assert.deepEqual(forward.expectedMigrationItemIds, ["migration-1", "migration-2"]);
  assert.deepEqual(forward.items.map((item) => item.migrationItemId), ["migration-1", "migration-2"]);
  assert.equal(forward.authoritativeWritesPerformed, false);
  assert.equal(forward.artifactBytesRewritten, false);
  assert.equal(forward.publicationPerformed, false);
});

test("rejects tampered production evidence bytes", async () => {
  const input = await fixture("1");
  input.productionEvidenceJson = `${input.productionEvidenceJson} `;
  await assert.rejects(
    compileBookArtArtifactReceiptFromPromotion(input),
    (error) => error instanceof BookArtPromotionAdapterError && error.code === "identity_mismatch",
  );
});

test("rejects failed artifact verification and stale promotion references", async () => {
  const unverified = await fixture("1");
  unverified.masterVerification.contentValid = false;
  await assert.rejects(
    compileBookArtArtifactReceiptFromPromotion(unverified),
    (error) => error instanceof BookArtPromotionAdapterError && error.code === "artifact_verification_failed",
  );

  const staleReference = await fixture("1");
  staleReference.promotion.reference.artifactId = artifactId("e");
  await assert.rejects(
    compileBookArtArtifactReceiptFromPromotion(staleReference),
    (error) => error instanceof BookArtPromotionAdapterError && error.code === "identity_mismatch",
  );
});

test("rejects generated text and unresolved production risks before approval", async () => {
  const generatedText = await fixture("1");
  await replaceEvidence(generatedText, (evidence) => { evidence.generatedTextDetected = true; });
  await assert.rejects(
    compileBookArtArtifactReceiptFromPromotion(generatedText),
    (error) => error instanceof BookArtPromotionAdapterError && error.code === "invalid_compiled_receipt",
  );

  const unresolved = await fixture("1");
  await replaceEvidence(unresolved, (evidence) => { evidence.unresolvedRisks = ["Rights review remains open."]; });
  await assert.rejects(
    compileBookArtArtifactReceiptFromPromotion(unresolved),
    (error) => error instanceof BookArtPromotionAdapterError && error.code === "invalid_compiled_receipt",
  );
});

test("rejects broken immutable promotion lineage", async () => {
  const input = await fixture("1");
  input.authorizationArtifact.sourceArtifacts = [input.selectionEvidenceArtifact.artifactId];
  await assert.rejects(
    compileBookArtArtifactReceiptFromPromotion(input),
    (error) => error instanceof BookArtPromotionAdapterError && error.code === "missing_artifact_lineage",
  );
});

test("rejects incomplete and duplicate promotion batches before compiling receipts", async () => {
  const first = await fixture("1");
  await assert.rejects(
    compileBookArtPromotionBatch({
      batchId: "book-art-promotions-1",
      sourceArtImportBatchFingerprint: sha("6"),
      expectedMigrationItemIds: ["migration-1", "migration-2"],
      items: [{ migrationItemId: "migration-1", input: first }],
    }),
    (error) => error instanceof BookArtPromotionAdapterError && error.code === "missing_batch_items",
  );

  await assert.rejects(
    compileBookArtPromotionBatch({
      batchId: "book-art-promotions-1",
      sourceArtImportBatchFingerprint: sha("6"),
      expectedMigrationItemIds: ["migration-1"],
      items: [
        { migrationItemId: "migration-1", input: first },
        { migrationItemId: "migration-1", input: first },
      ],
    }),
    (error) => error instanceof BookArtPromotionAdapterError && error.code === "duplicate_batch_items",
  );
});
