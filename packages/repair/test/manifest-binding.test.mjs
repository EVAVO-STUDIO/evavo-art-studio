import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import {
  SPRITE_FAMILY_PROTOCOL_VERSION,
  spriteFamilyManifestSha256,
  validateSpriteFamilyManifest,
} from "@evavo/art-sprite-family";
import sharp from "sharp";

import { planTargetedRepair } from "../dist/index.js";

const gate = (id, status) => ({
  id,
  status,
  blocking: true,
  message: `${id} ${status}`,
  evidence: {},
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-repair-manifest-"));
  const artifacts = new LocalArtifactStore({ root });
  const png = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 210, g: 45, b: 60, alpha: 1 },
    },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
  const source = await artifacts.put(png, {
    mediaType: "image/png",
    storageClass: "source",
    fileName: "hero.png",
    labels: {
      artifactRole: "identity-core-layer",
      qualityState: "passed",
      approvalState: "approved",
    },
  });
  const manifest = validateSpriteFamilyManifest({
    schemaVersion: "1.0",
    familyId: "hero-idle",
    canvas: { width: 8, height: 8 },
    layerDefinitions: [
      {
        id: "body",
        role: "identity-core",
        sourcePolicy: "per-frame",
        required: true,
        contributesToComposite: true,
        contributesToIdentity: true,
        zIndex: 0,
      },
    ],
    frames: [
      {
        id: "idle-000",
        animation: "idle",
        direction: "down",
        frameIndex: 0,
        globalFrameIndex: 0,
        durationMs: 125,
        pivot: { x: 4, y: 7 },
        baseline: 7,
        groundContact: true,
        declaredCompositeArtifactId: source.artifactId,
        layers: [{ layerId: "body", artifactId: source.artifactId }],
      },
    ],
    policy: { identityReferenceFrameId: "idle-000" },
  });
  const manifestSha256 = spriteFamilyManifestSha256(manifest);
  const manifestArtifact = await artifacts.put(
    `${JSON.stringify(manifest, null, 2)}\n`,
    {
      mediaType: "application/json",
      storageClass: "manifest",
      fileName: "hero-idle.sprite-family.manifest.json",
      sourceArtifacts: [source.artifactId],
      labels: {
        artifactRole: "sprite-family-normalized-manifest",
        approvalState: "evidence-only",
        familyId: manifest.familyId,
        manifestSha256,
      },
    },
  );
  const evidence = {
    schemaVersion: "1.0",
    protocolVersion: SPRITE_FAMILY_PROTOCOL_VERSION,
    familyId: manifest.familyId,
    manifestSha256,
    manifestArtifactId: manifestArtifact.artifactId,
    passed: false,
    completedAt: "2026-07-30T00:00:00.000Z",
    canvas: manifest.canvas,
    layerDefinitions: manifest.layerDefinitions,
    frameEvidence: [
      {
        frameId: "idle-000",
        animation: "idle",
        direction: "down",
        frameIndex: 0,
        globalFrameIndex: 0,
        pivot: { x: 4, y: 7 },
        baseline: 7,
        groundContact: true,
        generatedCompositeArtifactId: source.artifactId,
        generatedCompositeSha256: source.contentSha256,
        identityCompositeSha256: source.contentSha256,
        layers: [
          {
            layerId: "body",
            role: "identity-core",
            artifactId: source.artifactId,
            descriptorSha256: source.descriptorSha256,
            contentSha256: source.contentSha256,
            width: 8,
            height: 8,
            offset: { x: 0, y: 0 },
            opacity: 1,
            visiblePixels: 64,
            visibleFraction: 1,
            compositeContributionPixels: 64,
            compositeContributionFraction: 1,
            occludedPixels: 0,
            occludedFraction: 0,
            centroid: { x: 3.5, y: 3.5 },
            centroidRelativeToPivot: { x: -0.5, y: -3.5 },
            gates: [],
          },
        ],
        parity: {
          declaredCompositeArtifactId: source.artifactId,
          generatedSha256: source.contentSha256,
          declaredSha256: source.contentSha256,
          exact: true,
          comparedChannels: 256,
          mismatchedChannels: 0,
          mismatchFraction: 0,
          meanAbsoluteError: 0,
          maximumAbsoluteError: 0,
        },
        comparisons: [],
        gates: [gate("frame-pivot", "fail")],
        passed: false,
      },
    ],
    familyGates: [],
    generatedCompositeArtifactIds: [source.artifactId],
    sourceArtifactIds: [source.artifactId],
  };
  const evidenceArtifact = await artifacts.put(
    `${JSON.stringify(evidence, null, 2)}\n`,
    {
      mediaType: "application/json",
      storageClass: "evidence",
      fileName: "hero-idle.sprite-family.evidence.json",
      sourceArtifacts: [manifestArtifact.artifactId, source.artifactId],
      labels: {
        artifactRole: "sprite-family-consistency-evidence",
        familyId: manifest.familyId,
        qualityState: "rejected",
        approvalState: "evidence-only",
        evidenceEnvelope: "manifest-bound",
      },
    },
  );
  return { artifacts, source, manifestArtifact, evidenceArtifact };
}

test("repair planning keeps the normalized family manifest immutable and protected", async () => {
  const data = await fixture();
  const result = await planTargetedRepair(
    {
      schemaVersion: "1.0",
      repairId: "hero-pivot-fix",
      familyEvidenceArtifactId: data.evidenceArtifact.artifactId,
      target: { frameId: "idle-000", gateIds: ["frame-pivot"] },
      intent: "Correct pivot metadata without changing source pixels.",
      provider: { enabled: false },
    },
    { artifacts: data.artifacts },
  );
  assert.equal(result.packet.disposition, "ready");
  assert.equal(result.packet.providerPlan, undefined);
  assert.ok(
    result.packet.protectedArtifactIds.includes(data.manifestArtifact.artifactId),
  );
  assert.ok(!result.packet.mutableArtifactIds.includes(data.manifestArtifact.artifactId));

  const packetArtifact = await data.artifacts.get(result.packetArtifactId);
  assert.equal(packetArtifact.labels.manifestBound, "true");
  assert.ok(
    packetArtifact.sourceArtifacts.includes(data.manifestArtifact.artifactId),
  );
  assert.ok(packetArtifact.sourceArtifacts.includes(data.evidenceArtifact.artifactId));
  const manifestVerification = await data.artifacts.verify(
    data.manifestArtifact.artifactId,
  );
  assert.equal(manifestVerification.descriptorValid, true);
  assert.equal(manifestVerification.contentValid, true);
});
