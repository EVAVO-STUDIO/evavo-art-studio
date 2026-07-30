import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import { SPRITE_FAMILY_PROTOCOL_VERSION } from "@evavo/art-sprite-family";
import sharp from "sharp";

import { planTargetedRepair } from "../dist/index.js";

const gate = (id, status = "pass") => ({
  id,
  status,
  blocking: true,
  message: `${id} ${status}`,
  evidence: {},
});

async function png() {
  return sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 220, g: 40, b: 50, alpha: 1 },
    },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

async function alphaMask() {
  const data = Buffer.alloc(8 * 8 * 4, 255);
  data[(3 * 8 + 3) * 4 + 3] = 0;
  return sharp(data, { raw: { width: 8, height: 8, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

test("blocked shared-layer packets never return a provider execution plan", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-repair-blocked-"));
  const store = new LocalArtifactStore({ root });
  const put = (bytes, fileName, role) =>
    store.put(bytes, {
      mediaType: "image/png",
      storageClass: "source",
      fileName,
      labels: {
        artifactRole: role,
        qualityState: "passed",
        approvalState: "approved",
      },
    });
  const body = await put(await png(), "body.png", "identity-core-layer");
  const canonical = await put(await png(), "canonical.png", "canonical-identity");
  const mask = await put(await alphaMask(), "mask.png", "repair-mask");
  const frame = (id, index) => ({
    frameId: id,
    animation: "idle",
    direction: "down",
    frameIndex: index,
    globalFrameIndex: index,
    pivot: { x: 4, y: 7 },
    groundContact: false,
    generatedCompositeArtifactId: body.artifactId,
    generatedCompositeSha256: body.contentSha256,
    identityCompositeSha256: body.contentSha256,
    layers: [
      {
        layerId: "body",
        role: "identity-core",
        artifactId: body.artifactId,
        descriptorSha256: body.descriptorSha256,
        contentSha256: body.contentSha256,
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
        gates: [gate("layer-registration")],
      },
    ],
    parity: {
      generatedSha256: body.contentSha256,
      exact: true,
      comparedChannels: 256,
      mismatchedChannels: 0,
      mismatchFraction: 0,
      meanAbsoluteError: 0,
      maximumAbsoluteError: 0,
    },
    comparisons: [
      {
        targetFrameId: id,
        relation: "canonical",
        referenceFrameId: "idle-000",
        offsetX: 0,
        offsetY: 0,
        visibleAreaSimilarity: 1,
        paletteSimilarity: index === 0 ? 0.2 : 1,
        centroidSimilarity: 1,
        silhouetteIou: 1,
        edgeSimilarity: 1,
        gates: [
          index === 0
            ? gate("canonical-palette-similarity", "fail")
            : gate("canonical-palette-similarity"),
        ],
      },
    ],
    gates: [gate("frame-pivot")],
    passed: index !== 0,
  });
  const evidence = {
    schemaVersion: "1.0",
    protocolVersion: SPRITE_FAMILY_PROTOCOL_VERSION,
    familyId: "shared-family",
    manifestSha256: "a".repeat(64),
    passed: false,
    completedAt: "2026-07-30T00:00:00.000Z",
    canvas: { width: 8, height: 8 },
    layerDefinitions: [
      {
        id: "body",
        role: "identity-core",
        sourcePolicy: "static-family",
        required: true,
        contributesToComposite: true,
        contributesToIdentity: true,
        mustRemainSeparate: false,
        zIndex: 0,
        blendMode: "normal",
        minimumVisibleFraction: 0.5,
        registrationTolerancePixels: 0,
        allowedOccludedBy: [],
        occludes: [],
      },
    ],
    frameEvidence: [frame("idle-000", 0), frame("idle-001", 1)],
    familyGates: [gate("family-all-frames-pass", "fail")],
    generatedCompositeArtifactIds: [body.artifactId],
    sourceArtifactIds: [body.artifactId],
  };
  const evidenceArtifact = await store.put(`${JSON.stringify(evidence)}\n`, {
    mediaType: "application/json",
    storageClass: "evidence",
    fileName: "family.evidence.json",
    sourceArtifacts: [body.artifactId],
    labels: {
      artifactRole: "sprite-family-consistency-evidence",
      qualityState: "rejected",
      approvalState: "evidence-only",
    },
  });
  const result = await planTargetedRepair(
    {
      schemaVersion: "1.0",
      repairId: "blocked-shared-repair",
      familyEvidenceArtifactId: evidenceArtifact.artifactId,
      target: { frameId: "idle-000", layerId: "body" },
      intent: "Repair identity palette drift.",
      maskArtifactId: mask.artifactId,
      references: [
        { artifactId: canonical.artifactId, role: "canonical-identity" },
      ],
      style: {
        styleName: "Locked pixel style",
        intent: "Retain approved identity and palette.",
      },
      shot: { subject: "Approved body layer only." },
      provider: {
        enabled: true,
        backgroundStrategy: "chroma-key",
        matteColour: "#ff00ff",
      },
    },
    { artifacts: store },
  );
  assert.equal(result.packet.disposition, "blocked");
  assert.equal(result.packet.providerPlan, undefined);
  assert.ok(result.packet.blockers.includes("shared-layer-repair-not-authorized"));
  const stored = await store.get(result.packetArtifactId);
  assert.equal(stored.labels.executionPlanSuppressed, "true");
});
