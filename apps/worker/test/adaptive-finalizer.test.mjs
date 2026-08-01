import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import { decodeSpriteFrame } from "@evavo/art-quality";
import sharp from "sharp";

import { createAdaptiveFinalizerHandlers } from "../dist/adaptive-finalizer-handlers.js";

async function fixture(bytes) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-adaptive-finalizer-"));
  const artifacts = new LocalArtifactStore({ root });
  const candidate = await artifacts.put(bytes, {
    mediaType: "image/png",
    storageClass: "intermediate",
    fileName: "mastered-candidate.png",
    labels: {
      artifactRole: "provider-candidate-alpha-master",
      approvalState: "unapproved",
      qualityState: "rejected",
      finalizationReady: "false",
      candidateFamilyId: "adaptive-fixture",
      frameId: "frame-000",
    },
  });
  return { root, artifacts, candidate };
}

async function execute(fx, payload = {}) {
  const handler = createAdaptiveFinalizerHandlers()[
    "art.candidate.finalize-adaptive"
  ];
  return handler({
    job: {
      id: "job_adaptive_finalizer_fixture",
      spec: {
        payload: {
          candidateArtifactId: fx.candidate.artifactId,
          frameId: "frame-000",
          deliveryProfileId: "godot-sprite-lossless",
          proofBackgrounds: [
            "#000000",
            "#ffffff",
            "#808080",
            "#00ff00",
            "#ff00ff",
          ],
          quality: {
            transparency: "alpha-required",
            expectedWidth: 16,
            expectedHeight: 16,
            expectedFormat: "png",
            safePadding: 0,
            knownMatteColours: ["#00ff00", "#ff00ff", "#ffffff", "#000000"],
            maximumHaloFraction: 0.01,
            maximumUnexpectedTransparentRgbFraction: 0.01,
          },
          maximumRepairPasses: 2,
          transparentBleedRadius: 1,
          matteSearchRadius: 4,
          matteDistanceThreshold: 48,
          resampling: "nearest",
          ...payload,
        },
        inputArtifacts: [fx.candidate.artifactId],
        requiredCapabilities: [
          "media.adaptive-finalize",
          "media.raster",
          "quality.sprite-frame",
          "evidence.bundle",
        ],
      },
    },
    artifacts: fx.artifacts,
    putArtifact: (value, descriptor) => fx.artifacts.put(value, descriptor),
    signal: new AbortController().signal,
  });
}

async function hiddenRgbFixture() {
  const width = 16;
  const height = 16;
  const data = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = 255;
    data[offset + 1] = 0;
    data[offset + 2] = 255;
    data[offset + 3] = 0;
  }
  for (let y = 5; y <= 10; y += 1) {
    for (let x = 5; x <= 10; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = 35;
      data[offset + 1] = 95;
      data[offset + 2] = 210;
      data[offset + 3] = 255;
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

async function checkerboardFixture() {
  const width = 16;
  const height = 16;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value =
        (Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0 ? 210 : 150;
      const offset = (y * width + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = x === 0 && y === 0 ? 0 : 255;
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

test("adaptive finalization repairs hidden transparent RGB and emits proof", async () => {
  const fx = await fixture(await hiddenRgbFixture());
  try {
    const result = await execute(fx);
    assert.equal(result.result.releaseReady, true);
    assert.equal(result.result.changed, true);
    assert.ok(result.result.changedPixels > 0);
    const finalized = await fx.artifacts.get(result.outputArtifacts[0]);
    const proof = await fx.artifacts.get(result.outputArtifacts[1]);
    const evidence = await fx.artifacts.get(result.outputArtifacts[2]);
    assert.equal(finalized.labels.adaptiveFinalized, "true");
    assert.equal(finalized.labels.finalizationReady, "true");
    assert.equal(finalized.labels.proofArtifactId, proof.artifactId);
    assert.equal(proof.labels.artifactRole, "candidate-hostile-background-proof");
    assert.equal(proof.labels.qualityState, "passed");
    assert.equal(
      evidence.labels.artifactRole,
      "candidate-adaptive-finalization-evidence",
    );
    const decoded = await decodeSpriteFrame(
      await fx.artifacts.read(finalized.artifactId),
    );
    const corner = 0;
    assert.deepEqual([...decoded.data.slice(corner, corner + 4)], [0, 0, 0, 0]);
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});

test("fake transparency emits a repair plan and fails closed", async () => {
  const fx = await fixture(await checkerboardFixture());
  try {
    let failure;
    try {
      await execute(fx);
    } catch (error) {
      failure = error;
    }
    assert.equal(failure.code, "ADAPTIVE_FINALIZER_REPAIR_REQUIRED");
    assert.match(failure.details.repairPlanArtifactId, /^artifact_[a-f0-9]{64}$/);
    const repairPlan = await fx.artifacts.get(
      failure.details.repairPlanArtifactId,
    );
    assert.equal(
      repairPlan.labels.artifactRole,
      "candidate-finalization-repair-plan",
    );
    const body = JSON.parse(
      (await fx.artifacts.read(repairPlan.artifactId)).toString("utf8"),
    );
    assert.equal(body.assessment.disposition, "provider-repair");
    assert.ok(
      body.assessment.failedBlockingGateIds.includes("fake-transparency"),
    );
    assert.equal(body.qualityThresholdsRelaxed, false);
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});
