import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import {
  executeCandidateSelection,
  validateCandidateSelectionRequest,
} from "@evavo/art-selection";
import sharp from "sharp";

import {
  REPAIRED_FAMILY_RANKING_PROTOCOL_VERSION,
  promoteRepairedFamilyCandidate,
} from "../dist/index.js";

async function png(width, height, colour) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 2; y < height - 2; y += 1) {
    for (let x = 3; x < width - 3; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = colour[0];
      data[offset + 1] = colour[1];
      data[offset + 2] = colour[2];
      data[offset + 3] = 255;
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
}

async function json(store, body, descriptor) {
  return store.put(`${JSON.stringify(body, null, 2)}\n`, {
    mediaType: "application/json",
    ...descriptor,
  });
}

async function fixture(allowAutomaticSelection) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-bound-promote-"));
  const artifacts = new LocalArtifactStore({ root });
  const reference = await artifacts.put(await png(16, 16, [205, 48, 62]), {
    mediaType: "image/png",
    storageClass: "source",
    fileName: "hero-body.approved.png",
    labels: {
      artifactRole: "identity-core-layer",
      approvalState: "approved",
      qualityState: "passed",
      finalDeliverable: "false",
    },
  });
  const candidates = await Promise.all(
    [
      [205, 48, 62],
      [190, 60, 75],
    ].map(async (colour, index) =>
      artifacts.put(await png(16, 16, colour), {
        mediaType: "image/png",
        storageClass: "intermediate",
        fileName: `repair-candidate-${index + 1}.png`,
        sourceArtifacts: [reference.artifactId],
        labels: {
          artifactRole: "repaired-family-quality-candidate",
          approvalState: "unapproved",
          qualityState: "passed",
          finalDeliverable: "false",
          revisionId: `revision-${index + 1}`,
          repairId: "hero-body-repair",
          familyId: "hero-idle-down",
        },
      }),
    ),
  );
  const selectionRequest = validateCandidateSelectionRequest({
    schemaVersion: "1.0",
    selectionId: allowAutomaticSelection
      ? "automatic-revision-selection"
      : "human-revision-selection",
    candidateArtifactIds: candidates.map((entry) => entry.artifactId),
    referenceArtifactId: reference.artifactId,
    referenceRole: "repaired-layer-source",
    policy: {
      profile: "custom",
      allowAutomaticSelection,
      requireReferenceLineage: true,
      requireQualityPassed: true,
      allowedCandidateRoles: ["repaired-family-quality-candidate"],
      minimumOverallScore: 0,
      minimumWinnerMargin: 0,
      metrics: [
        {
          id: "overlap-colour-similarity",
          weight: 1,
          minimum: 0,
          blocking: true,
        },
      ],
      externalEvidence: [],
    },
  });
  const selection = await executeCandidateSelection(selectionRequest, {
    artifacts,
    now: () => new Date("2026-07-30T00:00:00.000Z"),
  });
  assert.equal(
    selection.evidence.decision,
    allowAutomaticSelection ? "selected" : "review-required",
  );
  const bridge = await json(
    artifacts,
    { schemaVersion: "1.0", bridgeId: "hero-revision-bridge" },
    {
      storageClass: "evidence",
      fileName: "hero-revision-bridge.json",
      sourceArtifacts: [reference.artifactId, ...candidates.map((entry) => entry.artifactId)],
      labels: {
        artifactRole: "repaired-family-selection-bridge-evidence",
        approvalState: "evidence-only",
        qualityState: "passed",
        finalDeliverable: "false",
        bridgeId: "hero-revision-bridge",
        repairId: "hero-body-repair",
        familyId: "hero-idle-down",
      },
    },
  );
  const revisions = await Promise.all(
    candidates.map((candidate, index) =>
      json(
        artifacts,
        { schemaVersion: "1.0", revisionId: `revision-${index + 1}` },
        {
          storageClass: "evidence",
          fileName: `revision-${index + 1}.json`,
          sourceArtifacts: [candidate.artifactId, reference.artifactId],
          labels: {
            artifactRole: "repaired-family-revision-evidence",
            approvalState: "evidence-only",
            qualityState: "passed",
            finalDeliverable: "false",
          },
        },
      ),
    ),
  );
  const rankingBody = {
    schemaVersion: "1.0",
    protocolVersion: REPAIRED_FAMILY_RANKING_PROTOCOL_VERSION,
    rankingId: allowAutomaticSelection ? "automatic-ranking" : "human-ranking",
    requestSha256: "a".repeat(64),
    bridgeEvidenceArtifactId: bridge.artifactId,
    bridgeId: "hero-revision-bridge",
    repairId: "hero-body-repair",
    familyId: "hero-idle-down",
    sourceManifestArtifactId: bridge.artifactId,
    sourceManifestSha256: "b".repeat(64),
    referenceArtifactId: reference.artifactId,
    revisionEvidenceArtifactIds: revisions.map((entry) => entry.artifactId),
    candidateArtifactIds: candidates.map((entry) => entry.artifactId),
    selectionEvidenceArtifactId: selection.evidenceArtifactId,
    selectionId: selection.evidence.selectionId,
    selectionRequestSha256: selection.evidence.requestSha256,
    decision: selection.evidence.decision,
    ...(selection.evidence.recommendedCandidateArtifactId
      ? {
          recommendedCandidateArtifactId:
            selection.evidence.recommendedCandidateArtifactId,
        }
      : {}),
    ...(selection.evidence.selectedCandidateArtifactId
      ? {
          selectedCandidateArtifactId:
            selection.evidence.selectedCandidateArtifactId,
        }
      : {}),
    promotionEligible: selection.evidence.promotionEligible,
    winnerMargin: selection.evidence.winnerMargin,
    ranking: selection.evidence.ranking,
    selectionEvidence: selection.evidence,
    passed: true,
    completedAt: "2026-07-30T00:01:00.000Z",
  };
  const ranking = await json(artifacts, rankingBody, {
    storageClass: "evidence",
    fileName: `${rankingBody.rankingId}.json`,
    sourceArtifacts: [
      bridge.artifactId,
      selection.evidenceArtifactId,
      reference.artifactId,
      ...revisions.map((entry) => entry.artifactId),
      ...candidates.map((entry) => entry.artifactId),
    ],
    labels: {
      artifactRole: "revision-bound-candidate-selection-evidence",
      approvalState: "evidence-only",
      qualityState: "passed",
      finalDeliverable: "false",
      rankingId: rankingBody.rankingId,
      bridgeId: rankingBody.bridgeId,
      repairId: rankingBody.repairId,
      familyId: rankingBody.familyId,
      decision: rankingBody.decision,
      promotionEligible: String(rankingBody.promotionEligible),
    },
  });
  const seededReference = await artifacts.updateReference(
    "projects/hero",
    "approved-body",
    reference.artifactId,
    {
      expectedGeneration: 0,
      actor: "fixture",
      now: new Date("2026-07-30T00:02:00.000Z"),
    },
  );
  assert.equal(seededReference.generation, 1);
  return { artifacts, reference, candidates, ranking, rankingBody };
}

test("automatic revision-bound promotion preserves ranking lineage before CAS", async () => {
  const data = await fixture(true);
  const result = await promoteRepairedFamilyCandidate(
    {
      schemaVersion: "1.0",
      promotionId: "automatic-revision-promotion",
      rankingEvidenceArtifactId: data.ranking.artifactId,
      target: {
        namespace: "projects/hero",
        name: "approved-body",
        expectedGeneration: 1,
        expectedArtifactId: data.reference.artifactId,
      },
      approval: { mode: "automatic" },
      actor: "revision-promotion-worker",
    },
    {
      artifacts: data.artifacts,
      now: () => new Date("2026-07-30T00:03:00.000Z"),
    },
  );
  assert.equal(result.reference.generation, 2);
  assert.equal(result.reference.previousArtifactId, data.reference.artifactId);
  assert.equal(result.reference.artifactId, result.masterArtifactId);
  assert.equal(result.evidence.approvalMode, "automatic");
  const master = await data.artifacts.get(result.masterArtifactId);
  assert.ok(
    master.sourceArtifacts.includes(result.boundSelectionEvidenceArtifactId),
  );
  const boundSelection = await data.artifacts.get(
    result.boundSelectionEvidenceArtifactId,
  );
  assert.equal(boundSelection.labels.evidenceEnvelope, "revision-bound");
  assert.ok(boundSelection.sourceArtifacts.includes(data.ranking.artifactId));
  const evidence = await data.artifacts.get(result.evidenceArtifactId);
  assert.equal(
    evidence.labels.artifactRole,
    "revision-bound-promotion-evidence",
  );

  await assert.rejects(
    () =>
      promoteRepairedFamilyCandidate(
        {
          schemaVersion: "1.0",
          promotionId: "stale-revision-promotion",
          rankingEvidenceArtifactId: data.ranking.artifactId,
          target: {
            namespace: "projects/hero",
            name: "approved-body",
            expectedGeneration: 1,
            expectedArtifactId: data.reference.artifactId,
          },
          approval: { mode: "automatic" },
          actor: "stale-worker",
        },
        { artifacts: data.artifacts },
      ),
    (error) => error?.code === "CANDIDATE_PROMOTION_REFERENCE_CONFLICT",
  );
});

test("named human approval promotes only the recommended eligible revision", async () => {
  const data = await fixture(false);
  const result = await promoteRepairedFamilyCandidate(
    {
      schemaVersion: "1.0",
      promotionId: "human-revision-promotion",
      rankingEvidenceArtifactId: data.ranking.artifactId,
      target: {
        namespace: "projects/hero",
        name: "approved-body",
        expectedGeneration: 1,
        expectedArtifactId: data.reference.artifactId,
      },
      approval: {
        mode: "human",
        approver: "Greg Parker",
        reason: "Approved the best evidence-backed repaired body candidate.",
      },
      actor: "greg",
    },
    {
      artifacts: data.artifacts,
      now: () => new Date("2026-07-30T00:04:00.000Z"),
    },
  );
  assert.equal(result.evidence.approvalMode, "human");
  assert.equal(
    result.evidence.candidateArtifactId,
    data.rankingBody.recommendedCandidateArtifactId,
  );
  assert.equal(result.reference.generation, 2);
});
