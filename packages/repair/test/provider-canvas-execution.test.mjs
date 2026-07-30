import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import {
  PROVIDER_PROTOCOL_VERSION,
  ProviderRegistry,
} from "@evavo/art-providers";
import { SPRITE_FAMILY_PROTOCOL_VERSION } from "@evavo/art-sprite-family";
import sharp from "sharp";

import {
  executeTargetedRepairProviderCanvas,
  planTargetedRepair,
} from "../dist/index.js";

const gate = (id, status = "pass") => ({
  id,
  status,
  blocking: true,
  message: `${id} ${status}`,
  evidence: {},
});

async function png(data, width, height) {
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
}

async function raw(input) {
  return sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

class PixelRepairFixtureAdapter {
  descriptor = Object.freeze({
    protocolVersion: PROVIDER_PROTOCOL_VERSION,
    id: "pixel-repair-test",
    label: "Pixel repair fixture",
    version: "1.0.0",
    priority: 10_000,
    capabilities: Object.freeze([
      "inpaint",
      "reference-images",
      "multiple-reference-images",
      "mask",
      "custom-size",
      "candidate-count",
      "cancellation",
    ]),
    models: Object.freeze(["pixel-repair-v1"]),
    maximumCandidates: 8,
    maximumReferenceImages: 16,
    maximumSourceBytes: 64 * 1024 * 1024,
    dataPolicy: Object.freeze({
      remote: false,
      retainedByProvider: false,
      usedForTraining: false,
    }),
  });

  async execute(resolved, context) {
    if (context.signal.aborted) throw new Error("cancelled");
    const base = resolved.references.find((entry) => entry.role === "base-image");
    const mask = resolved.references.find((entry) => entry.role === "mask");
    assert.ok(base && mask);
    const [baseRaw, maskRaw] = await Promise.all([raw(base.bytes), raw(mask.bytes)]);
    assert.equal(baseRaw.info.width, maskRaw.info.width);
    assert.equal(baseRaw.info.height, maskRaw.info.height);
    const outputs = [];
    for (let index = 0; index < resolved.request.candidateCount; index += 1) {
      const candidate = Buffer.from(baseRaw.data);
      for (let pixel = 0; pixel < candidate.length / 4; pixel += 1) {
        const offset = pixel * 4;
        if (maskRaw.data[offset + 3] !== 0) continue;
        candidate[offset] = 30 + index;
        candidate[offset + 1] = 90;
        candidate[offset + 2] = 220;
        candidate[offset + 3] = 255;
      }
      outputs.push({
        bytes: await png(candidate, baseRaw.info.width, baseRaw.info.height),
        mediaType: "image/png",
        fileName: `pixel-repair-${index + 1}.png`,
        metadata: { fixture: true, candidateIndex: index + 1 },
      });
    }
    return {
      adapterId: this.descriptor.id,
      model: this.descriptor.models[0],
      externalId: `fixture:${resolved.request.requestId}`,
      outputs,
      metadata: { deterministic: true },
    };
  }
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-repair-execute-"));
  const artifacts = new LocalArtifactStore({ root });
  const width = 8;
  const height = 8;
  const base = Buffer.alloc(width * height * 4);
  const mask = Buffer.alloc(width * height * 4, 255);
  for (let y = 1; y < 7; y += 1) {
    for (let x = 1; x < 7; x += 1) {
      const offset = (y * width + x) * 4;
      base[offset] = 210;
      base[offset + 1] = 45;
      base[offset + 2] = 60;
      base[offset + 3] = 255;
    }
  }
  const editableOffset = (3 * width + 3) * 4;
  base[editableOffset + 3] = 96;
  mask[editableOffset + 3] = 0;
  const [basePng, maskPng] = await Promise.all([
    png(base, width, height),
    png(mask, width, height),
  ]);
  const baseArtifact = await artifacts.put(basePng, {
    mediaType: "image/png",
    storageClass: "source",
    fileName: "hero-body.png",
    labels: {
      artifactRole: "identity-core-layer",
      qualityState: "passed",
      approvalState: "approved",
    },
  });
  const maskArtifact = await artifacts.put(maskPng, {
    mediaType: "image/png",
    storageClass: "source",
    fileName: "hero-body.repair-mask.png",
    sourceArtifacts: [baseArtifact.artifactId],
    labels: {
      artifactRole: "repair-mask",
      qualityState: "passed",
      approvalState: "approved",
    },
  });
  const layer = {
    layerId: "body",
    role: "identity-core",
    artifactId: baseArtifact.artifactId,
    descriptorSha256: baseArtifact.descriptorSha256,
    contentSha256: baseArtifact.contentSha256,
    width,
    height,
    offset: { x: 0, y: 0 },
    opacity: 1,
    visiblePixels: 36,
    visibleFraction: 36 / 64,
    compositeContributionPixels: 36,
    compositeContributionFraction: 1,
    occludedPixels: 0,
    occludedFraction: 0,
    centroid: { x: 3.5, y: 3.5 },
    centroidRelativeToPivot: { x: -0.5, y: -3.5 },
    gates: [gate("identity-silhouette", "fail")],
  };
  const evidence = {
    schemaVersion: "1.0",
    protocolVersion: SPRITE_FAMILY_PROTOCOL_VERSION,
    familyId: "hero-idle-down",
    manifestSha256: "a".repeat(64),
    passed: false,
    completedAt: "2026-07-30T00:00:00.000Z",
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
        blendMode: "normal",
        minimumVisibleFraction: 0.5,
        registrationTolerancePixels: 1,
        allowedOccludedBy: [],
        occludes: [],
      },
    ],
    frameEvidence: [
      {
        frameId: "idle-down-000",
        animation: "idle",
        direction: "down",
        frameIndex: 0,
        globalFrameIndex: 0,
        pivot: { x: 4, y: 7 },
        baseline: 7,
        groundContact: true,
        generatedCompositeArtifactId: baseArtifact.artifactId,
        generatedCompositeSha256: baseArtifact.contentSha256,
        identityCompositeSha256: baseArtifact.contentSha256,
        layers: [layer],
        parity: {
          generatedSha256: baseArtifact.contentSha256,
          exact: true,
          comparedChannels: width * height * 4,
          mismatchedChannels: 0,
          mismatchFraction: 0,
          meanAbsoluteError: 0,
          maximumAbsoluteError: 0,
        },
        comparisons: [],
        gates: [],
        passed: false,
      },
    ],
    familyGates: [],
    generatedCompositeArtifactIds: [baseArtifact.artifactId],
    sourceArtifactIds: [baseArtifact.artifactId],
  };
  const familyEvidence = await artifacts.put(`${JSON.stringify(evidence)}\n`, {
    mediaType: "application/json",
    storageClass: "evidence",
    fileName: "hero-idle-down.sprite-family.evidence.json",
    sourceArtifacts: [baseArtifact.artifactId],
    labels: {
      artifactRole: "sprite-family-consistency-evidence",
      qualityState: "rejected",
      approvalState: "evidence-only",
    },
  });
  const planned = await planTargetedRepair(
    {
      schemaVersion: "1.0",
      repairId: "hero-body-identity-repair",
      familyEvidenceArtifactId: familyEvidence.artifactId,
      target: {
        frameId: "idle-down-000",
        layerId: "body",
        gateIds: ["identity-silhouette"],
      },
      intent: "Repair only the failed identity pixels while retaining the pose.",
      preserve: ["all pixels outside the mask", "pivot", "canvas"],
      maskArtifactId: maskArtifact.artifactId,
      references: [
        {
          artifactId: baseArtifact.artifactId,
          role: "canonical-identity",
        },
      ],
      style: {
        styleName: "Authentic 1990s adventure sprite",
        intent: "Preserve the approved hand-authored pixel language.",
        mustHave: ["same identity", "same proportions"],
        mustAvoid: ["generic AI rendering", "modern gloss"],
        identityLocks: ["same face", "same coat"],
        palette: ["locked project palette"],
        lineTreatment: ["one-pixel contour hierarchy"],
        cameraRules: ["fixed side-stage projection"],
      },
      shot: {
        subject: "The approved hero body layer only.",
        action: "Repair the failed identity pixel cluster.",
        direction: "Down-facing three-quarter view.",
        include: ["complete body layer"],
        exclude: ["shadow", "weapon", "effects", "background"],
        separateAssets: ["shadow", "weapon", "effects"],
        framing: ["retain the exact source canvas"],
      },
      provider: {
        enabled: true,
        backgroundStrategy: "chroma-key",
        matteColour: "#ff00ff",
        candidateCount: 2,
        preferredAdapterId: "pixel-repair-test",
        preferredModel: "pixel-repair-v1",
        allowedAdapterIds: ["pixel-repair-test"],
        allowFallback: false,
      },
    },
    { artifacts, now: () => new Date("2026-07-30T00:00:00.000Z") },
  );
  assert.equal(planned.packet.disposition, "ready");
  assert.ok(planned.packet.providerPlan);
  return {
    artifacts,
    base,
    editableOffset,
    planned,
  };
}

test("pixel-safe repair execution restores source-sized unapproved candidates", async () => {
  const data = await fixture();
  const registry = new ProviderRegistry([new PixelRepairFixtureAdapter()]);
  const result = await executeTargetedRepairProviderCanvas(
    {
      schemaVersion: "1.0",
      repairPacketArtifactId: data.planned.packetArtifactId,
      providerCanvas: {
        providerWidth: 1024,
        providerHeight: 1024,
        paletteMode: "none",
        alphaMode: "source",
        restorationSampling: "nearest-center",
      },
    },
    {
      artifacts: data.artifacts,
      registry,
      signal: new AbortController().signal,
      now: () => new Date("2026-07-30T00:01:00.000Z"),
    },
  );
  assert.equal(result.restoredCandidates.length, 2);
  assert.equal(result.providerCanvasManifest.restoration.alphaMode, "source");
  for (const candidate of result.restoredCandidates) {
    const stored = await data.artifacts.get(candidate.restoredCandidateArtifactId);
    assert.equal(stored.labels.artifactRole, "targeted-repair-restored-candidate");
    assert.equal(stored.labels.approvalState, "unapproved");
    assert.equal(stored.labels.finalDeliverable, "false");
    const output = await raw(
      await data.artifacts.read(candidate.restoredCandidateArtifactId),
    );
    assert.equal(output.info.width, 8);
    assert.equal(output.info.height, 8);
    assert.equal(output.data[data.editableOffset + 1], 90);
    assert.equal(output.data[data.editableOffset + 2], 220);
    assert.equal(output.data[data.editableOffset + 3], 96);
    for (let offset = 0; offset < data.base.length; offset += 4) {
      if (offset === data.editableOffset) continue;
      assert.deepEqual(
        [...output.data.subarray(offset, offset + 4)],
        [...data.base.subarray(offset, offset + 4)],
      );
    }
    assert.equal(candidate.restoration.protectedExact, true);
    assert.equal(candidate.restoration.protectedChannelMismatches, 0);
    assert.equal(candidate.restoration.editableAlphaChangesFromSource, 0);
  }
  const executionEvidence = await data.artifacts.get(
    result.executionEvidenceArtifactId,
  );
  assert.equal(
    executionEvidence.labels.artifactRole,
    "targeted-repair-execution-evidence",
  );
  assert.equal(
    await data.artifacts.resolveReference("projects/test", "approved-master"),
    null,
  );
});

test("blocked repair packets cannot enter provider-canvas execution", async () => {
  const data = await fixture();
  const blockedPacket = {
    ...data.planned.packet,
    disposition: "blocked",
    blockers: ["manual-review-required"],
    providerPlan: undefined,
  };
  const blockedArtifact = await data.artifacts.put(
    `${JSON.stringify(blockedPacket)}\n`,
    {
      mediaType: "application/json",
      storageClass: "evidence",
      fileName: "blocked.targeted-repair.json",
      sourceArtifacts: [data.planned.packetArtifactId],
      labels: {
        artifactRole: "targeted-repair-packet",
        approvalState: "evidence-only",
        repairDisposition: "blocked",
      },
    },
  );
  await assert.rejects(
    () =>
      executeTargetedRepairProviderCanvas(
        {
          schemaVersion: "1.0",
          repairPacketArtifactId: blockedArtifact.artifactId,
        },
        {
          artifacts: data.artifacts,
          registry: new ProviderRegistry([new PixelRepairFixtureAdapter()]),
          signal: new AbortController().signal,
        },
      ),
    (error) =>
      error?.code === "TARGETED_REPAIR_EXECUTION_PACKET_NOT_READY",
  );
});
