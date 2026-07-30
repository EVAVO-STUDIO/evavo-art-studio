import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import {
  selectionRequestSha256,
  validateCandidateSelectionRequest,
} from "@evavo/art-selection";
import sharp from "sharp";

import {
  REPAIRED_FAMILY_SELECTION_PROTOCOL_VERSION,
  executeRepairedFamilyRanking,
} from "../dist/index.js";

async function png(width, height, changedX) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 2; y < height - 2; y += 1) {
    for (let x = 3; x < width - 3; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = 205;
      data[offset + 1] = 48;
      data[offset + 2] = 62;
      data[offset + 3] = 255;
    }
  }
  if (changedX !== undefined) {
    const offset = (7 * width + changedX) * 4;
    data[offset] = 30 + changedX;
    data[offset + 1] = 90;
    data[offset + 2] = 220;
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

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-bound-ranking-"));
  const artifacts = new LocalArtifactStore({ root });
  const reference = await artifacts.put(await png(16, 16), {
    mediaType: "image/png",
    storageClass: "source",
    fileName: "hero-body.png",
    labels: {
      artifactRole: "identity-core-layer",
      approvalState: "approved",
      qualityState: "passed",
      finalDeliverable: "false",
    },
  });
  const candidates = await Promise.all(
    [7, 8].map(async (x, index) =>
      artifacts.put(await png(16, 16, x), {
        mediaType: "image/png",
        storageClass: "intermediate",
        fileName: `candidate-${index + 1}.png`,
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
            revisionId: `revision-${index + 1}`,
            repairId: "hero-body-repair",
            familyId: "hero-idle-down",
          },
        },
      ),
    ),
  );
  const familyEvidence = await Promise.all(
    candidates.map((candidate, index) =>
      json(
        artifacts,
        { schemaVersion: "1.0", passed: true },
        {
          storageClass: "evidence",
          fileName: `family-${index + 1}.json`,
          sourceArtifacts: [candidate.artifactId],
          labels: {
            artifactRole: "sprite-family-consistency-evidence",
            approvalState: "evidence-only",
            qualityState: "passed",
            familyId: "hero-idle-down",
          },
        },
      ),
    ),
  );
  const manifests = await Promise.all(
    candidates.map((candidate, index) =>
      json(
        artifacts,
        { schemaVersion: "1.0", revisionId: `revision-${index + 1}` },
        {
          storageClass: "manifest",
          fileName: `manifest-${index + 1}.json`,
          sourceArtifacts: [candidate.artifactId],
          labels: {
            artifactRole: "sprite-family-normalized-manifest",
            approvalState: "evidence-only",
            familyId: "hero-idle-down",
            manifestSha256: String(index + 1).repeat(64),
          },
        },
      ),
    ),
  );
  const selectionRequest = validateCandidateSelectionRequest({
    schemaVersion: "1.0",
    selectionId: "hero-revision-ranking-selection",
    candidateArtifactIds: candidates.map((entry) => entry.artifactId),
    referenceArtifactId: reference.artifactId,
    referenceRole: "repaired-layer-source",
    policy: {
      profile: "sprite-identity",
      allowAutomaticSelection: false,
      requireReferenceLineage: true,
      requireQualityPassed: true,
      allowedCandidateRoles: ["repaired-family-quality-candidate"],
    },
    metadata: { bridgeId: "hero-revision-bridge" },
  });
  const requestHash = selectionRequestSha256(selectionRequest);
  const bridgeBody = {
    schemaVersion: "1.0",
    protocolVersion: REPAIRED_FAMILY_SELECTION_PROTOCOL_VERSION,
    bridgeId: "hero-revision-bridge",
    requestSha256: "a".repeat(64),
    repairId: "hero-body-repair",
    familyId: "hero-idle-down",
    sourceManifestArtifactId: manifests[0].artifactId,
    sourceManifestSha256: "b".repeat(64),
    referenceArtifactId: reference.artifactId,
    revisionEvidenceArtifactIds: revisions.map((entry) => entry.artifactId),
    revisionIds: ["revision-1", "revision-2"],
    candidateArtifactIds: candidates.map((entry) => entry.artifactId).sort(),
    familyEvidenceArtifactIds: familyEvidence.map((entry) => entry.artifactId),
    revisedManifestArtifactIds: manifests.map((entry) => entry.artifactId),
    externalEvidenceArtifactIds: [],
    selectionRequest,
    selectionRequestSha256: requestHash,
    selectionJob: {
      queue: "selection",
      kind: "art.candidate.select",
      idempotencyKey: `revision-selection:${requestHash}`,
      payload: selectionRequest,
      inputArtifacts: [
        reference.artifactId,
        ...candidates.map((entry) => entry.artifactId),
        ...revisions.map((entry) => entry.artifactId),
        ...familyEvidence.map((entry) => entry.artifactId),
        ...manifests.map((entry) => entry.artifactId),
      ],
      requiredCapabilities: ["selection.compare", "evidence.bundle"],
      maximumAttempts: 1,
      leaseDurationMs: 120000,
      timeoutMs: 900000,
    },
    passed: true,
    completedAt: "2026-07-30T00:00:00.000Z",
  };
  const bridge = await json(artifacts, bridgeBody, {
    storageClass: "evidence",
    fileName: "hero-revision-bridge.json",
    sourceArtifacts: [
      reference.artifactId,
      ...candidates.map((entry) => entry.artifactId),
      ...revisions.map((entry) => entry.artifactId),
      ...familyEvidence.map((entry) => entry.artifactId),
      ...manifests.map((entry) => entry.artifactId),
    ],
    labels: {
      artifactRole: "repaired-family-selection-bridge-evidence",
      approvalState: "evidence-only",
      qualityState: "passed",
      finalDeliverable: "false",
      bridgeId: bridgeBody.bridgeId,
      repairId: bridgeBody.repairId,
      familyId: bridgeBody.familyId,
    },
  });
  return { artifacts, bridge, bridgeBody, candidates, reference };
}

test("executes selection and binds ranking evidence to the revision bridge", async () => {
  const data = await fixture();
  const result = await executeRepairedFamilyRanking(
    {
      schemaVersion: "1.0",
      rankingId: "hero-revision-bound-ranking",
      bridgeEvidenceArtifactId: data.bridge.artifactId,
    },
    {
      artifacts: data.artifacts,
      now: () => new Date("2026-07-30T00:01:00.000Z"),
    },
  );
  assert.equal(result.evidence.passed, true);
  assert.equal(result.evidence.decision, "review-required");
  assert.equal(result.evidence.promotionEligible, false);
  assert.equal(result.evidence.bridgeEvidenceArtifactId, data.bridge.artifactId);
  assert.equal(result.evidence.referenceArtifactId, data.reference.artifactId);
  assert.deepEqual(
    result.evidence.candidateArtifactIds,
    data.candidates.map((entry) => entry.artifactId).sort(),
  );
  const wrapper = await data.artifacts.get(result.evidenceArtifactId);
  assert.equal(
    wrapper.labels.artifactRole,
    "revision-bound-candidate-selection-evidence",
  );
  assert.equal(wrapper.labels.approvalState, "evidence-only");
  assert.equal(wrapper.labels.finalDeliverable, "false");
  assert.ok(wrapper.sourceArtifacts.includes(data.bridge.artifactId));
  assert.ok(wrapper.sourceArtifacts.includes(result.selectionEvidenceArtifactId));
  assert.equal(
    await data.artifacts.resolveReference("projects/ranking", "approved-master"),
    null,
  );
});

test("rejects bridge evidence whose embedded selection hash was changed", async () => {
  const data = await fixture();
  const tamperedBody = {
    ...data.bridgeBody,
    selectionRequestSha256: "f".repeat(64),
  };
  const tampered = await json(data.artifacts, tamperedBody, {
    storageClass: "evidence",
    fileName: "tampered-bridge.json",
    sourceArtifacts: data.bridge.sourceArtifacts,
    labels: data.bridge.labels,
  });
  await assert.rejects(
    () =>
      executeRepairedFamilyRanking(
        {
          schemaVersion: "1.0",
          rankingId: "tampered-ranking",
          bridgeEvidenceArtifactId: tampered.artifactId,
        },
        { artifacts: data.artifacts },
      ),
    (error) =>
      error?.code === "REPAIRED_FAMILY_RANKING_SELECTION_REQUEST_INVALID" ||
      error?.code === "REPAIRED_FAMILY_RANKING_SELECTION_JOB_HASH_MISMATCH",
  );
});
