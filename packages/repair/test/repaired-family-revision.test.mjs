import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import { verifySpriteFamily } from "@evavo/art-sprite-family";
import sharp from "sharp";

import {
  TARGETED_REPAIR_PROTOCOL_VERSION,
  createRepairedFamilyRevision,
  planTargetedRepair,
} from "../dist/index.js";

async function png(data, width, height) {
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
}

function failedGate(id) {
  return {
    id,
    status: "fail",
    blocking: true,
    message: `${id} failed`,
    evidence: {},
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-repaired-family-"));
  const artifacts = new LocalArtifactStore({ root });
  const width = 16;
  const height = 16;
  const sourceRgba = Buffer.alloc(width * height * 4);
  for (let y = 3; y < 14; y += 1) {
    for (let x = 5; x < 11; x += 1) {
      const offset = (y * width + x) * 4;
      sourceRgba[offset] = 205;
      sourceRgba[offset + 1] = 48;
      sourceRgba[offset + 2] = 62;
      sourceRgba[offset + 3] = 255;
    }
  }
  const sourcePng = await png(sourceRgba, width, height);
  const sourceLayer = await artifacts.put(sourcePng, {
    mediaType: "image/png",
    storageClass: "source",
    fileName: "hero-body.png",
    labels: {
      artifactRole: "identity-core-layer",
      qualityState: "passed",
      approvalState: "approved",
    },
  });
  const sourceComposite = await artifacts.put(sourcePng, {
    mediaType: "image/png",
    storageClass: "source",
    fileName: "hero-idle-down-000.png",
    sourceArtifacts: [sourceLayer.artifactId],
    labels: {
      artifactRole: "declared-layered-composite",
      qualityState: "passed",
      approvalState: "approved",
    },
  });
  const manifest = {
    schemaVersion: "1.0",
    familyId: "hero-idle-down",
    canvas: { width, height },
    layerDefinitions: [
      {
        id: "body",
        role: "identity-core",
        sourcePolicy: "per-frame",
        required: true,
        contributesToComposite: true,
        contributesToIdentity: true,
        mustRemainSeparate: false,
        zIndex: 0,
        registrationTolerancePixels: 0,
      },
    ],
    frames: [
      {
        id: "idle-down-000",
        animation: "idle",
        direction: "down",
        frameIndex: 0,
        globalFrameIndex: 0,
        durationMs: 137,
        pivot: { x: 8, y: 13 },
        baseline: 13,
        groundContact: true,
        declaredCompositeArtifactId: sourceComposite.artifactId,
        layers: [
          {
            layerId: "body",
            artifactId: sourceLayer.artifactId,
            offset: { x: 0, y: 0 },
            opacity: 1,
            variantId: "coat-a",
          },
        ],
      },
    ],
    policy: {
      identityReferenceFrameId: "idle-down-000",
      requireDeclaredComposite: true,
      requireReferenceLineage: true,
      requireQualityPassed: true,
      pivotTolerancePixels: 0,
      baselineTolerancePixels: 0,
      groundContactTolerancePixels: 0,
      compositeChannelTolerance: 0,
      maximumCompositeMeanError: 0,
      maximumCompositeMismatchFraction: 0,
    },
    metadata: { project: "revision-test", exactTimingRequired: true },
  };
  const verified = await verifySpriteFamily(manifest, {
    artifacts,
    now: () => new Date("2026-07-30T00:00:00.000Z"),
  });
  assert.equal(verified.evidence.passed, true);

  const failedEvidence = {
    ...verified.evidence,
    passed: false,
    completedAt: "2026-07-30T00:01:00.000Z",
    frameEvidence: verified.evidence.frameEvidence.map((frame) => ({
      ...frame,
      passed: false,
      layers: frame.layers.map((layer) => ({
        ...layer,
        gates: [failedGate("identity-palette-consistency")],
      })),
    })),
  };
  const failedEvidenceArtifact = await artifacts.put(
    `${JSON.stringify(failedEvidence)}\n`,
    {
      mediaType: "application/json",
      storageClass: "evidence",
      fileName: "hero-idle-down.failed-family-evidence.json",
      sourceArtifacts: [
        verified.manifestArtifactId,
        verified.kernelEvidenceArtifactId,
        sourceLayer.artifactId,
        sourceComposite.artifactId,
      ],
      labels: {
        artifactRole: "sprite-family-consistency-evidence",
        qualityState: "rejected",
        approvalState: "evidence-only",
        evidenceEnvelope: "manifest-bound",
        familyId: manifest.familyId,
      },
    },
  );

  const maskRgba = Buffer.alloc(width * height * 4, 255);
  const editableOffset = (8 * width + 8) * 4;
  maskRgba[editableOffset + 3] = 0;
  const maskArtifact = await artifacts.put(
    await png(maskRgba, width, height),
    {
      mediaType: "image/png",
      storageClass: "source",
      fileName: "hero-body.repair-mask.png",
      sourceArtifacts: [sourceLayer.artifactId],
      labels: {
        artifactRole: "repair-mask",
        qualityState: "passed",
        approvalState: "approved",
      },
    },
  );
  const planned = await planTargetedRepair(
    {
      schemaVersion: "1.0",
      repairId: "hero-body-palette-repair",
      familyEvidenceArtifactId: failedEvidenceArtifact.artifactId,
      target: {
        frameId: "idle-down-000",
        layerId: "body",
        gateIds: ["identity-palette-consistency"],
      },
      intent: "Repair only the single failed body pixel.",
      preserve: ["all unmasked pixels", "timing", "pivot", "variant"],
      maskArtifactId: maskArtifact.artifactId,
      references: [
        {
          artifactId: sourceLayer.artifactId,
          role: "canonical-identity",
        },
      ],
      style: {
        styleName: "Approved pixel hero",
        intent: "Retain the exact authored pixel language.",
        mustHave: ["same identity", "same silhouette"],
        mustAvoid: ["smoothing", "extra detail"],
        identityLocks: ["same coat", "same proportions"],
        palette: ["approved palette"],
        lineTreatment: ["one-pixel contour"],
        cameraRules: ["fixed sprite camera"],
      },
      shot: {
        subject: "The approved hero body layer only.",
        action: "Correct one failed palette pixel.",
        direction: "Down-facing.",
        include: ["body layer"],
        exclude: ["shadow", "weapon", "background"],
        separateAssets: ["shadow", "weapon"],
        framing: ["exact source canvas"],
      },
      provider: {
        enabled: true,
        backgroundStrategy: "chroma-key",
        matteColour: "#ff00ff",
        candidateCount: 1,
      },
    },
    { artifacts, now: () => new Date("2026-07-30T00:02:00.000Z") },
  );
  assert.equal(planned.packet.disposition, "ready");
  assert.equal(
    planned.packet.sourceEvidence.manifestArtifactId,
    verified.manifestArtifactId,
  );

  const repairedRgba = Buffer.from(sourceRgba);
  repairedRgba[editableOffset] = 30;
  repairedRgba[editableOffset + 1] = 90;
  repairedRgba[editableOffset + 2] = 220;
  const restoredCandidate = await artifacts.put(
    await png(repairedRgba, width, height),
    {
      mediaType: "image/png",
      storageClass: "intermediate",
      fileName: "hero-body.restored-01.png",
      sourceArtifacts: [
        planned.packetArtifactId,
        sourceLayer.artifactId,
        maskArtifact.artifactId,
      ],
      labels: {
        artifactRole: "targeted-repair-restored-candidate",
        approvalState: "unapproved",
        qualityState: "unverified",
        finalDeliverable: "false",
        repairId: planned.packet.repairId,
        frameId: planned.packet.target.frameId,
        layerId: planned.packet.target.layerId,
      },
    },
  );
  const restorationEvidence = await artifacts.put("{}\n", {
    mediaType: "application/json",
    storageClass: "evidence",
    fileName: "hero-body.restoration.json",
    sourceArtifacts: [restoredCandidate.artifactId],
    labels: {
      artifactRole: "targeted-repair-restoration-evidence",
      approvalState: "evidence-only",
      repairId: planned.packet.repairId,
    },
  });
  const executionBody = {
    schemaVersion: "1.0",
    protocolVersion: TARGETED_REPAIR_PROTOCOL_VERSION,
    repairId: planned.packet.repairId,
    repairPacketArtifactId: planned.packetArtifactId,
    restoredCandidates: [
      {
        providerCandidateArtifactId: restoredCandidate.artifactId,
        restoredCandidateArtifactId: restoredCandidate.artifactId,
        restorationEvidenceArtifactId: restorationEvidence.artifactId,
      },
    ],
  };
  const executionEvidence = await artifacts.put(
    `${JSON.stringify(executionBody)}\n`,
    {
      mediaType: "application/json",
      storageClass: "evidence",
      fileName: "hero-body.execution.json",
      sourceArtifacts: [
        planned.packetArtifactId,
        restoredCandidate.artifactId,
        restorationEvidence.artifactId,
      ],
      labels: {
        artifactRole: "targeted-repair-execution-evidence",
        approvalState: "evidence-only",
        repairId: planned.packet.repairId,
        outcome: "candidates-restored",
      },
    },
  );
  return {
    artifacts,
    sourceLayer,
    sourceComposite,
    manifest,
    planned,
    restoredCandidate,
    executionEvidence,
    editableOffset,
  };
}

test("creates a verified immutable family revision without approving it", async () => {
  const data = await fixture();
  const result = await createRepairedFamilyRevision(
    {
      schemaVersion: "1.0",
      revisionId: "hero-body-palette-revision-01",
      repairPacketArtifactId: data.planned.packetArtifactId,
      repairExecutionEvidenceArtifactId: data.executionEvidence.artifactId,
      restoredCandidateArtifactId: data.restoredCandidate.artifactId,
      quality: { safePadding: 1 },
    },
    {
      artifacts: data.artifacts,
      now: () => new Date("2026-07-30T00:03:00.000Z"),
    },
  );
  assert.equal(result.evidence.passed, true);
  assert.equal(result.family.evidence.passed, true);
  assert.equal(result.evidence.replacements.length, 1);
  assert.equal(result.revisedManifest.frames[0].durationMs, 137);
  assert.deepEqual(result.revisedManifest.frames[0].pivot, { x: 8, y: 13 });
  assert.equal(result.revisedManifest.frames[0].baseline, 13);
  assert.equal(result.revisedManifest.frames[0].layers[0].variantId, "coat-a");
  assert.notEqual(
    result.revisedManifest.frames[0].layers[0].artifactId,
    data.sourceLayer.artifactId,
  );
  assert.notEqual(
    result.revisedManifest.frames[0].declaredCompositeArtifactId,
    data.sourceComposite.artifactId,
  );
  const candidate = await data.artifacts.get(result.qualityCandidateArtifactId);
  assert.equal(candidate.labels.qualityState, "passed");
  assert.equal(candidate.labels.approvalState, "unapproved");
  assert.equal(candidate.labels.finalDeliverable, "false");
  const revision = await data.artifacts.get(result.revisionEvidenceArtifactId);
  assert.equal(revision.labels.artifactRole, "repaired-family-revision-evidence");
  assert.equal(revision.labels.approvalState, "evidence-only");
  assert.equal(
    await data.artifacts.resolveReference("projects/revision-test", "approved-master"),
    null,
  );
});

test("rejects a restored candidate outside the declared execution", async () => {
  const data = await fixture();
  const unrelated = await data.artifacts.put(
    await data.artifacts.read(data.restoredCandidate.artifactId),
    {
      mediaType: "image/png",
      storageClass: "intermediate",
      fileName: "unrelated.png",
      sourceArtifacts: [data.planned.packetArtifactId],
      labels: {
        artifactRole: "targeted-repair-restored-candidate",
        approvalState: "unapproved",
        qualityState: "unverified",
        finalDeliverable: "false",
        repairId: data.planned.packet.repairId,
        frameId: data.planned.packet.target.frameId,
        layerId: data.planned.packet.target.layerId,
      },
    },
  );
  await assert.rejects(
    () =>
      createRepairedFamilyRevision(
        {
          schemaVersion: "1.0",
          revisionId: "unrelated-candidate-revision",
          repairPacketArtifactId: data.planned.packetArtifactId,
          repairExecutionEvidenceArtifactId: data.executionEvidence.artifactId,
          restoredCandidateArtifactId: unrelated.artifactId,
        },
        { artifacts: data.artifacts },
      ),
    (error) =>
      error?.code === "REPAIRED_FAMILY_REVISION_EXECUTION_LINEAGE_MISMATCH" ||
      error?.code === "REPAIRED_FAMILY_REVISION_CANDIDATE_NOT_IN_EXECUTION",
  );
});
