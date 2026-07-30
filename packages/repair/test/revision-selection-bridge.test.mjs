import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import { executeCandidateSelection } from "@evavo/art-selection";
import sharp from "sharp";

import {
  REPAIRED_FAMILY_REVISION_PROTOCOL_VERSION,
  prepareRepairedFamilySelection,
} from "../dist/index.js";

async function png(width, height, pixel) {
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
  if (pixel) {
    const offset = (pixel.y * width + pixel.x) * 4;
    data[offset] = pixel.r;
    data[offset + 1] = pixel.g;
    data[offset + 2] = pixel.b;
    data[offset + 3] = 255;
  }
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
}

async function jsonArtifact(artifacts, body, descriptor) {
  return artifacts.put(`${JSON.stringify(body, null, 2)}\n`, {
    mediaType: "application/json",
    ...descriptor,
  });
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-revision-select-"));
  const artifacts = new LocalArtifactStore({ root });
  const width = 16;
  const height = 16;
  const reference = await artifacts.put(await png(width, height), {
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
  const sourceManifestSha256 = "a".repeat(64);
  const sourceManifest = await jsonArtifact(
    artifacts,
    { schemaVersion: "1.0", familyId: "hero-idle-down" },
    {
      storageClass: "manifest",
      fileName: "hero.source-manifest.json",
      sourceArtifacts: [reference.artifactId],
      labels: {
        artifactRole: "sprite-family-normalized-manifest",
        approvalState: "evidence-only",
        familyId: "hero-idle-down",
        manifestSha256: sourceManifestSha256,
      },
    },
  );

  async function revision(index, changedPixel, overrides = {}) {
    const revisionId = overrides.revisionId ?? `hero-revision-${index}`;
    const repairId = overrides.repairId ?? "hero-body-palette-repair";
    const candidate = await artifacts.put(
      await png(width, height, changedPixel),
      {
        mediaType: "image/png",
        storageClass: "intermediate",
        fileName: `${revisionId}.candidate.png`,
        sourceArtifacts: [reference.artifactId],
        labels: {
          artifactRole: "repaired-family-quality-candidate",
          approvalState: "unapproved",
          qualityState: "passed",
          finalDeliverable: "false",
          revisionId,
          repairId,
          familyId: "hero-idle-down",
        },
      },
    );
    const repairPacket = await jsonArtifact(
      artifacts,
      { schemaVersion: "1.0", repairId },
      {
        storageClass: "evidence",
        fileName: `${revisionId}.repair-packet.json`,
        sourceArtifacts: [reference.artifactId],
        labels: {
          artifactRole: "targeted-repair-packet",
          approvalState: "evidence-only",
          repairDisposition: "ready",
          repairId,
        },
      },
    );
    const execution = await jsonArtifact(
      artifacts,
      { schemaVersion: "1.0", repairId },
      {
        storageClass: "evidence",
        fileName: `${revisionId}.execution.json`,
        sourceArtifacts: [repairPacket.artifactId, candidate.artifactId],
        labels: {
          artifactRole: "targeted-repair-execution-evidence",
          approvalState: "evidence-only",
          repairId,
        },
      },
    );
    const restored = await artifacts.put(await artifacts.read(candidate.artifactId), {
      mediaType: "image/png",
      storageClass: "intermediate",
      fileName: `${revisionId}.restored.png`,
      sourceArtifacts: [repairPacket.artifactId, reference.artifactId],
      labels: {
        artifactRole: "targeted-repair-restored-candidate",
        approvalState: "unapproved",
        qualityState: "unverified",
        finalDeliverable: "false",
        repairId,
        frameId: "idle-down-000",
        layerId: "body",
      },
    });
    const qualityEvidence = await jsonArtifact(
      artifacts,
      { schemaVersion: "1.0", passed: true },
      {
        storageClass: "evidence",
        fileName: `${revisionId}.quality.json`,
        sourceArtifacts: [restored.artifactId, candidate.artifactId],
        labels: {
          artifactRole: "sprite-frame-quality-evidence",
          approvalState: "evidence-only",
          qualityState: "passed",
        },
      },
    );
    const revisedManifestSha256 = String(index + 1).repeat(64).slice(0, 64);
    const revisedManifest = await jsonArtifact(
      artifacts,
      { schemaVersion: "1.0", familyId: "hero-idle-down", revisionId },
      {
        storageClass: "manifest",
        fileName: `${revisionId}.manifest.json`,
        sourceArtifacts: [candidate.artifactId, reference.artifactId],
        labels: {
          artifactRole: "sprite-family-normalized-manifest",
          approvalState: "evidence-only",
          familyId: "hero-idle-down",
          manifestSha256: revisedManifestSha256,
        },
      },
    );
    const kernelEvidence = await jsonArtifact(
      artifacts,
      { schemaVersion: "1.0", passed: true },
      {
        storageClass: "evidence",
        fileName: `${revisionId}.kernel-family.json`,
        sourceArtifacts: [revisedManifest.artifactId, candidate.artifactId],
        labels: {
          artifactRole: "sprite-family-consistency-evidence",
          approvalState: "evidence-only",
          qualityState: "passed",
          familyId: "hero-idle-down",
        },
      },
    );
    const generatedComposite = await artifacts.put(
      await artifacts.read(candidate.artifactId),
      {
        mediaType: "image/png",
        storageClass: "intermediate",
        fileName: `${revisionId}.composite.png`,
        sourceArtifacts: [candidate.artifactId],
        labels: {
          artifactRole: "layered-frame-composite",
          approvalState: "unapproved",
          qualityState: "passed",
          finalDeliverable: "false",
          familyId: "hero-idle-down",
          frameId: "idle-down-000",
        },
      },
    );
    const familyBody = {
      schemaVersion: "1.0",
      protocolVersion: "2026-07-30.1",
      familyId: "hero-idle-down",
      manifestSha256: revisedManifestSha256,
      manifestArtifactId: revisedManifest.artifactId,
      kernelEvidenceArtifactId: kernelEvidence.artifactId,
      passed: true,
      completedAt: "2026-07-30T00:00:00.000Z",
      canvas: { width, height },
      layerDefinitions: [],
      frameEvidence: [],
      familyGates: [],
      generatedCompositeArtifactIds: [generatedComposite.artifactId],
      sourceArtifactIds: [candidate.artifactId],
    };
    const familyEvidence = await jsonArtifact(artifacts, familyBody, {
      storageClass: "evidence",
      fileName: `${revisionId}.family.json`,
      sourceArtifacts: [
        revisedManifest.artifactId,
        kernelEvidence.artifactId,
        generatedComposite.artifactId,
        candidate.artifactId,
      ],
      labels: {
        artifactRole: "sprite-family-consistency-evidence",
        approvalState: "evidence-only",
        qualityState: "passed",
        evidenceEnvelope: "manifest-bound",
        familyId: "hero-idle-down",
      },
    });
    const evidenceBody = {
      schemaVersion: "1.0",
      protocolVersion: REPAIRED_FAMILY_REVISION_PROTOCOL_VERSION,
      revisionId,
      repairId,
      familyId: "hero-idle-down",
      requestSha256: "f".repeat(64),
      sourceManifestArtifactId: sourceManifest.artifactId,
      sourceManifestSha256,
      repairPacketArtifactId: repairPacket.artifactId,
      repairExecutionEvidenceArtifactId: execution.artifactId,
      restoredCandidateArtifactId: restored.artifactId,
      qualityEvidenceArtifactId: qualityEvidence.artifactId,
      qualityCandidateArtifactId: candidate.artifactId,
      quality: {
        schemaVersion: "1.0",
        frameId: `${revisionId}.body`,
        passed: true,
        rawRgbaSha256: candidate.contentSha256,
        source: {
          format: "png",
          hasAlpha: true,
          pages: 1,
          width,
          height,
          channels: 4,
        },
        alpha: {},
        visibleBounds: {},
        fakeTransparency: {},
        halo: {},
        transparentRgb: {},
        gates: [],
      },
      impactedFrameIds: ["idle-down-000"],
      replacements: [
        {
          frameId: "idle-down-000",
          layerId: "body",
          layerRole: "identity-core",
          sourcePolicy: "per-frame",
          originalArtifactId: reference.artifactId,
          replacementArtifactId: candidate.artifactId,
          revisedDeclaredCompositeArtifactId: generatedComposite.artifactId,
          revisedDeclaredCompositeQualityEvidenceArtifactId:
            qualityEvidence.artifactId,
        },
      ],
      revisedManifestArtifactId: revisedManifest.artifactId,
      revisedManifestSha256,
      familyEvidenceArtifactId: familyEvidence.artifactId,
      kernelFamilyEvidenceArtifactId: kernelEvidence.artifactId,
      generatedCompositeArtifactIds: [generatedComposite.artifactId],
      passed: true,
      completedAt: "2026-07-30T00:01:00.000Z",
    };
    const revisionEvidence = await jsonArtifact(artifacts, evidenceBody, {
      storageClass: "evidence",
      fileName: `${revisionId}.revision.json`,
      sourceArtifacts: [
        sourceManifest.artifactId,
        repairPacket.artifactId,
        execution.artifactId,
        restored.artifactId,
        qualityEvidence.artifactId,
        candidate.artifactId,
        revisedManifest.artifactId,
        familyEvidence.artifactId,
        kernelEvidence.artifactId,
        generatedComposite.artifactId,
      ],
      labels: {
        artifactRole: "repaired-family-revision-evidence",
        approvalState: "evidence-only",
        qualityState: "passed",
        finalDeliverable: "false",
        revisionId,
        repairId,
        familyId: "hero-idle-down",
      },
    });
    return { revisionEvidence, candidate, familyEvidence, revisedManifest };
  }

  return { artifacts, reference, sourceManifest, revision };
}

test("prepares candidate selection only from passed matching family revisions", async () => {
  const data = await fixture();
  const first = await data.revision(1, { x: 7, y: 7, r: 30, g: 90, b: 220 });
  const second = await data.revision(2, { x: 8, y: 7, r: 40, g: 110, b: 210 });
  const result = await prepareRepairedFamilySelection(
    {
      schemaVersion: "1.0",
      bridgeId: "hero-body-revision-selection",
      revisionEvidenceArtifactIds: [
        second.revisionEvidence.artifactId,
        first.revisionEvidence.artifactId,
      ],
    },
    {
      artifacts: data.artifacts,
      now: () => new Date("2026-07-30T00:02:00.000Z"),
    },
  );
  assert.equal(result.evidence.passed, true);
  assert.equal(result.evidence.referenceArtifactId, data.reference.artifactId);
  assert.deepEqual(result.selectionRequest.policy.allowedCandidateRoles, [
    "repaired-family-quality-candidate",
  ]);
  assert.equal(result.selectionRequest.policy.requireReferenceLineage, true);
  assert.equal(result.selectionRequest.policy.requireQualityPassed, true);
  assert.equal(result.selectionRequest.policy.allowAutomaticSelection, false);
  assert.deepEqual(
    result.selectionRequest.candidateArtifactIds,
    [first.candidate.artifactId, second.candidate.artifactId].sort(),
  );
  assert.equal(result.selectionJob.kind, "art.candidate.select");
  assert.ok(
    result.selectionJob.inputArtifacts.includes(first.revisionEvidence.artifactId),
  );
  assert.ok(
    result.selectionJob.inputArtifacts.includes(second.revisionEvidence.artifactId),
  );
  const stored = await data.artifacts.get(result.evidenceArtifactId);
  assert.equal(
    stored.labels.artifactRole,
    "repaired-family-selection-bridge-evidence",
  );
  assert.equal(stored.labels.approvalState, "evidence-only");
  assert.equal(stored.labels.finalDeliverable, "false");

  const selection = await executeCandidateSelection(result.selectionRequest, {
    artifacts: data.artifacts,
    now: () => new Date("2026-07-30T00:03:00.000Z"),
  });
  assert.equal(selection.evidence.decision, "review-required");
  assert.equal(selection.evidence.promotionEligible, false);
  assert.equal(
    await data.artifacts.resolveReference("projects/revision-selection", "approved-master"),
    null,
  );
});

test("rejects revision candidates that do not describe the same repair", async () => {
  const data = await fixture();
  const first = await data.revision(1, { x: 7, y: 7, r: 30, g: 90, b: 220 });
  const conflicting = await data.revision(
    2,
    { x: 8, y: 7, r: 40, g: 110, b: 210 },
    { repairId: "different-repair" },
  );
  await assert.rejects(
    () =>
      prepareRepairedFamilySelection(
        {
          schemaVersion: "1.0",
          bridgeId: "mixed-revision-selection",
          revisionEvidenceArtifactIds: [
            first.revisionEvidence.artifactId,
            conflicting.revisionEvidence.artifactId,
          ],
        },
        { artifacts: data.artifacts },
      ),
    (error) => error?.code === "REPAIRED_FAMILY_SELECTION_REVISION_SET_MISMATCH",
  );
});
