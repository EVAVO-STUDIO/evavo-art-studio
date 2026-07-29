import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import sharp from "sharp";

import {
  CandidateSelectionError,
  SELECTION_PROTOCOL_VERSION,
  executeCandidateSelection,
  promoteSelectedCandidate,
  selectionProtocolSummary,
  validateCandidatePromotionRequest,
  validateCandidateSelectionRequest,
} from "../dist/index.js";

async function image({
  width = 32,
  height = 32,
  x = 9,
  y = 6,
  shapeWidth = 14,
  shapeHeight = 20,
  colour = [210, 48, 58],
} = {}) {
  const data = Buffer.alloc(width * height * 4);
  for (let row = y; row < y + shapeHeight; row += 1) {
    for (let column = x; column < x + shapeWidth; column += 1) {
      const offset = (row * width + column) * 4;
      data[offset] = colour[0];
      data[offset + 1] = colour[1];
      data[offset + 2] = colour[2];
      data[offset + 3] = 255;
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-selection-"));
  const store = new LocalArtifactStore({ root });
  const reference = await store.put(await image(), {
    mediaType: "image/png",
    storageClass: "source",
    fileName: "hero-canonical.png",
    labels: {
      artifactRole: "canonical-identity",
      approvalState: "approved",
    },
  });
  const candidate = async (fileName, bytes, sourceArtifacts = [reference.artifactId]) =>
    store.put(bytes, {
      mediaType: "image/png",
      storageClass: "intermediate",
      fileName,
      sourceArtifacts,
      labels: {
        artifactRole: "provider-candidate-alpha-master",
        approvalState: "unapproved",
        qualityState: "passed",
        finalDeliverable: "false",
      },
    });
  return { root, store, reference, candidate };
}

function customRequest(reference, candidates, overrides = {}) {
  return {
    schemaVersion: "1.0",
    candidateArtifactIds: candidates.map((entry) => entry.artifactId),
    referenceArtifactId: reference.artifactId,
    referenceRole: "canonical-identity",
    policy: {
      profile: "custom",
      allowAutomaticSelection: true,
      requireReferenceLineage: true,
      requireQualityPassed: true,
      allowedCandidateRoles: ["provider-candidate-alpha-master"],
      maximumTranslationPixels: 4,
      maximumEdgeDistancePixels: 8,
      minimumOverallScore: 0.45,
      minimumWinnerMargin: 0.04,
      metrics: [
        { id: "silhouette-iou", weight: 0.35, minimum: 0.2, blocking: true },
        { id: "edge-similarity", weight: 0.15, minimum: 0.2, blocking: false },
        { id: "visible-area-similarity", weight: 0.1, minimum: 0.5, blocking: true },
        { id: "centroid-similarity", weight: 0.1, minimum: 0.4, blocking: true },
        { id: "palette-similarity", weight: 0.2, minimum: 0.2, blocking: true },
        { id: "overlap-colour-similarity", weight: 0.1, minimum: 0.2, blocking: false },
      ],
      externalEvidence: [],
    },
    ...overrides,
  };
}

async function modelEvidence(store, candidate, reference, kind, score) {
  const body = {
    schemaVersion: "1.0",
    protocolVersion: SELECTION_PROTOCOL_VERSION,
    evidenceKind: kind,
    candidateArtifactId: candidate.artifactId,
    referenceArtifactId: reference.artifactId,
    score,
    generatedAt: "2026-07-30T00:00:00.000Z",
    model: {
      name: "fixture-vision",
      version: "1.0.0",
      sha256: "a".repeat(64),
      preprocessingSha256: "b".repeat(64),
      runtime: "fixture",
    },
  };
  return store.put(`${JSON.stringify(body)}\n`, {
    mediaType: "application/json",
    storageClass: "evidence",
    fileName: `${candidate.artifactId}.${kind}.json`,
    sourceArtifacts: [candidate.artifactId, reference.artifactId],
    labels: {
      artifactRole: "selection-model-evidence",
      evidenceKind: kind,
      candidateArtifactId: candidate.artifactId,
      referenceArtifactId: reference.artifactId,
    },
  });
}

test("selection protocol declares separate ranking and promotion governance", () => {
  const protocol = selectionProtocolSummary();
  assert.equal(protocol.protocolVersion, SELECTION_PROTOCOL_VERSION);
  assert.ok(protocol.deterministicMetrics.includes("silhouette-iou"));
  assert.ok(protocol.externalEvidenceKinds.includes("identity-similarity"));
  assert.ok(protocol.rules.some((entry) => entry.includes("compare-and-swap")));
});

test("validation rejects single-candidate selection and blind reference replacement", () => {
  const artifact = `artifact_${"1".repeat(64)}`;
  assert.throws(
    () =>
      validateCandidateSelectionRequest({
        schemaVersion: "1.0",
        candidateArtifactIds: [artifact],
        referenceArtifactId: `artifact_${"2".repeat(64)}`,
        policy: {
          profile: "custom",
          metrics: [{ id: "silhouette-iou" }],
        },
      }),
    (error) =>
      error instanceof CandidateSelectionError &&
      error.code === "CANDIDATE_SELECTION_REQUEST_INVALID",
  );
  assert.throws(
    () =>
      validateCandidatePromotionRequest({
        schemaVersion: "1.0",
        selectionEvidenceArtifactId: artifact,
        candidateArtifactId: `artifact_${"3".repeat(64)}`,
        target: {
          namespace: "projects/demo",
          name: "approved-master",
          expectedGeneration: 1,
        },
        approval: { mode: "automatic" },
        actor: "test",
      }),
    /expectedArtifactId/,
  );
});

test("translation-tolerant ranking selects the structurally faithful candidate", async () => {
  const { store, reference, candidate } = await fixture();
  const good = await candidate(
    "good.png",
    await image({ x: 10, y: 7 }),
  );
  const weak = await candidate(
    "weak.png",
    await image({
      x: 4,
      y: 12,
      shapeWidth: 8,
      shapeHeight: 10,
      colour: [32, 92, 220],
    }),
  );
  const result = await executeCandidateSelection(
    customRequest(reference, [weak, good]),
    {
      artifacts: store,
      now: () => new Date("2026-07-30T01:00:00.000Z"),
    },
  );
  assert.equal(result.evidence.decision, "selected");
  assert.equal(result.evidence.selectedCandidateArtifactId, good.artifactId);
  assert.equal(result.evidence.ranking[0].candidateArtifactId, good.artifactId);
  assert.equal(result.evidence.ranking[0].alignment.offsetX, -1);
  assert.equal(result.evidence.ranking[0].alignment.offsetY, -1);
  assert.ok(result.evidence.ranking[0].score > result.evidence.ranking[1].score);
  const stored = await store.get(result.evidenceArtifactId);
  assert.equal(stored.labels.artifactRole, "candidate-selection-evidence");
  assert.deepEqual(
    stored.sourceArtifacts,
    [good.artifactId, weak.artifactId, reference.artifactId].sort(),
  );
});

test("missing lineage is a blocking failure rather than a score penalty", async () => {
  const { store, reference, candidate } = await fixture();
  const first = await candidate("first.png", await image(), []);
  const second = await candidate("second.png", await image({ x: 10 }), []);
  const result = await executeCandidateSelection(
    customRequest(reference, [first, second]),
    { artifacts: store },
  );
  assert.equal(result.evidence.decision, "rejected");
  assert.ok(
    result.evidence.ranking.every((entry) =>
      entry.violations.some((violation) => violation.includes("absent from candidate lineage")),
    ),
  );
});

test("automatic selection waits for bound model evidence when policy requires it", async () => {
  const { store, reference, candidate } = await fixture();
  const good = await candidate("good.png", await image({ x: 10 }));
  const weak = await candidate(
    "weak.png",
    await image({ shapeWidth: 9, shapeHeight: 13, colour: [110, 50, 180] }),
  );
  const policy = customRequest(reference, [good, weak]).policy;
  policy.externalEvidence = [
    {
      kind: "identity-similarity",
      weight: 0.35,
      minimum: 0.75,
      blocking: true,
      required: false,
      requiredForAutomatic: true,
    },
  ];
  const withoutEvidence = await executeCandidateSelection(
    {
      ...customRequest(reference, [good, weak]),
      policy,
      selectionId: "selection-without-model-evidence",
    },
    { artifacts: store },
  );
  assert.equal(withoutEvidence.evidence.decision, "review-required");
  assert.equal(
    withoutEvidence.evidence.ranking[0].automaticEvidenceComplete,
    false,
  );

  const goodEvidence = await modelEvidence(
    store,
    good,
    reference,
    "identity-similarity",
    0.94,
  );
  const weakEvidence = await modelEvidence(
    store,
    weak,
    reference,
    "identity-similarity",
    0.4,
  );
  const withEvidence = await executeCandidateSelection(
    {
      ...customRequest(reference, [good, weak]),
      selectionId: "selection-with-model-evidence",
      externalEvidenceArtifactIds: [weakEvidence.artifactId, goodEvidence.artifactId],
      policy,
    },
    { artifacts: store },
  );
  assert.equal(withEvidence.evidence.decision, "selected");
  assert.equal(withEvidence.evidence.selectedCandidateArtifactId, good.artifactId);
});

test("low-margin ties remain review-required and use stable artifact-id ordering", async () => {
  const { store, reference, candidate } = await fixture();
  const bytes = await image({ x: 10 });
  const first = await candidate("first.png", bytes);
  const second = await candidate("second.png", bytes);
  const result = await executeCandidateSelection(
    customRequest(reference, [second, first], {
      selectionId: "selection-tie",
    }),
    { artifacts: store },
  );
  assert.equal(result.evidence.decision, "review-required");
  assert.equal(result.evidence.winnerMargin, 0);
  assert.equal(
    result.evidence.recommendedCandidateArtifactId,
    [first.artifactId, second.artifactId].sort()[0],
  );
});

test("automatic promotion creates a traceable master and compare-and-swap reference", async () => {
  const { store, reference, candidate } = await fixture();
  const good = await candidate("good.png", await image({ x: 10 }));
  const weak = await candidate(
    "weak.png",
    await image({ shapeWidth: 8, shapeHeight: 11, colour: [20, 80, 220] }),
  );
  const selection = await executeCandidateSelection(
    customRequest(reference, [good, weak], { selectionId: "selection-promote" }),
    { artifacts: store, now: () => new Date("2026-07-30T02:00:00.000Z") },
  );
  assert.equal(selection.evidence.decision, "selected");
  const promotion = await promoteSelectedCandidate(
    {
      schemaVersion: "1.0",
      promotionId: "promotion-auto",
      selectionEvidenceArtifactId: selection.evidenceArtifactId,
      candidateArtifactId: good.artifactId,
      target: {
        namespace: "projects/demo/characters/hero",
        name: "approved-master",
        expectedGeneration: 0,
      },
      approval: { mode: "automatic" },
      actor: "selection-worker",
    },
    { artifacts: store, now: () => new Date("2026-07-30T02:10:00.000Z") },
  );
  assert.equal(promotion.reference.generation, 1);
  assert.equal(promotion.reference.artifactId, promotion.masterArtifactId);
  assert.equal(promotion.reference.actor, "selection-worker");
  const master = await store.get(promotion.masterArtifactId);
  assert.equal(master.storageClass, "master");
  assert.equal(master.labels.artifactRole, "selected-art-master");
  assert.equal(master.labels.approvalState, "selected");
  assert.ok(master.sourceArtifacts.includes(good.artifactId));
  assert.ok(master.sourceArtifacts.includes(selection.evidenceArtifactId));
  const authorization = await store.get(
    promotion.authorizationEvidenceArtifactId,
  );
  assert.equal(
    authorization.labels.artifactRole,
    "candidate-promotion-authorization",
  );

  await assert.rejects(
    () =>
      promoteSelectedCandidate(
        {
          schemaVersion: "1.0",
          promotionId: "promotion-stale",
          selectionEvidenceArtifactId: selection.evidenceArtifactId,
          candidateArtifactId: good.artifactId,
          target: {
            namespace: "projects/demo/characters/hero",
            name: "approved-master",
            expectedGeneration: 0,
          },
          approval: { mode: "automatic" },
          actor: "selection-worker",
        },
        { artifacts: store },
      ),
    (error) =>
      error instanceof CandidateSelectionError &&
      error.code === "CANDIDATE_PROMOTION_REFERENCE_CONFLICT",
  );
});

test("human review can resolve an eligible tie but cannot select the runner-up", async () => {
  const { store, reference, candidate } = await fixture();
  const bytes = await image({ x: 10 });
  const first = await candidate("first.png", bytes);
  const second = await candidate("second.png", bytes);
  const selection = await executeCandidateSelection(
    customRequest(reference, [first, second], { selectionId: "selection-human" }),
    { artifacts: store },
  );
  assert.equal(selection.evidence.decision, "review-required");
  const recommended = selection.evidence.recommendedCandidateArtifactId;
  const runnerUp = [first.artifactId, second.artifactId].find(
    (artifactId) => artifactId !== recommended,
  );
  await assert.rejects(
    () =>
      promoteSelectedCandidate(
        {
          schemaVersion: "1.0",
          selectionEvidenceArtifactId: selection.evidenceArtifactId,
          candidateArtifactId: runnerUp,
          target: {
            namespace: "projects/demo/review",
            name: "approved-master",
            expectedGeneration: 0,
          },
          approval: {
            mode: "human",
            approver: "Greg Parker",
            reason: "Reviewed the tie manually.",
          },
          actor: "greg",
        },
        { artifacts: store },
      ),
    (error) =>
      error instanceof CandidateSelectionError &&
      error.code === "CANDIDATE_PROMOTION_NOT_RECOMMENDED",
  );
  const promotion = await promoteSelectedCandidate(
    {
      schemaVersion: "1.0",
      promotionId: "promotion-human",
      selectionEvidenceArtifactId: selection.evidenceArtifactId,
      candidateArtifactId: recommended,
      target: {
        namespace: "projects/demo/review",
        name: "approved-master",
        expectedGeneration: 0,
      },
      approval: {
        mode: "human",
        approver: "Greg Parker",
        reason: "Reviewed the tied candidates against the locked art direction.",
      },
      actor: "greg",
    },
    { artifacts: store },
  );
  assert.equal(promotion.approvalMode, "human");
  assert.equal(promotion.reference.generation, 1);
});
