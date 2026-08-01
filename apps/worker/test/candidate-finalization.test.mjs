import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import { decodeSpriteFrame } from "@evavo/art-quality";
import sharp from "sharp";

import { createCandidateMasteringHandlers } from "../dist/mastering-handlers.js";

async function image(background, foreground, alphaCorner = false) {
  const base = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 4,
      background,
    },
  })
    .composite([
      {
        input: {
          create: {
            width: 10,
            height: 10,
            channels: 4,
            background: foreground,
          },
        },
        left: 11,
        top: 11,
      },
    ])
    .png()
    .toBuffer();
  if (!alphaCorner) return base;
  const { data, info } = await sharp(base).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  data[3] = 0;
  return sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
}

async function checkerboard() {
  const width = 32;
  const height = 32;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 210 : 150;
      const offset = (y * width + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = x === 0 && y === 0 ? 0 : 255;
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function fixture(bytes) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-finalization-"));
  const artifacts = new LocalArtifactStore({ root });
  const candidate = await artifacts.put(bytes, {
    mediaType: "image/png",
    storageClass: "intermediate",
    fileName: "candidate.png",
    labels: {
      artifactRole: "provider-candidate",
      approvalState: "unapproved",
      candidateFamilyId: "finalization-fixture",
      frameId: "frame-000",
    },
  });
  return { root, artifacts, candidate };
}

async function execute(fx, payload) {
  const handler = createCandidateMasteringHandlers()["art.candidate.master-alpha"];
  return handler({
    job: {
      id: "job_finalization_fixture",
      spec: {
        payload: {
          candidateArtifactId: fx.candidate.artifactId,
          targetWidth: 32,
          targetHeight: 32,
          resampling: "nearest",
          deliveryProfileId: "godot-sprite-lossless",
          proofBackgrounds: [
            "#000000",
            "#ffffff",
            "#808080",
            "#00ff00",
            "#ff00ff",
          ],
          requireFakeTransparencyRejection: true,
          ...payload,
        },
        inputArtifacts: [fx.candidate.artifactId],
        requiredCapabilities: [
          "media.chroma-extract",
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

test("green matte becomes real alpha and remains finalization-ready", async () => {
  const fx = await fixture(
    await image(
      { r: 0, g: 255, b: 0, alpha: 1 },
      { r: 220, g: 30, b: 20, alpha: 1 },
    ),
  );
  try {
    const result = await execute(fx, {
      backgroundMode: "chroma-key",
      matteColour: "#00ff00",
      requireMeaningfulAlpha: true,
      quality: { safePadding: 1 },
    });
    assert.equal(result.result.qualityPassed, true);
    const mastered = await fx.artifacts.get(result.outputArtifacts[0]);
    assert.equal(mastered.labels.finalizationReady, "true");
    assert.equal(mastered.labels.backgroundMode, "chroma-key");
    const decoded = await decodeSpriteFrame(
      await fx.artifacts.read(mastered.artifactId),
    );
    assert.equal(decoded.sourceHasAlpha, true);
    assert.ok(decoded.data.some((value, index) => index % 4 === 3 && value === 0));
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});

test("painted checkerboard transparency is rejected", async () => {
  const fx = await fixture(await checkerboard());
  try {
    const result = await execute(fx, {
      backgroundMode: "native-alpha",
      requireMeaningfulAlpha: true,
      quality: { safePadding: 0 },
    });
    assert.equal(result.result.qualityPassed, false);
    const mastered = await fx.artifacts.get(result.outputArtifacts[0]);
    assert.equal(mastered.labels.qualityState, "rejected");
    const evidence = JSON.parse(
      (await fx.artifacts.read(result.outputArtifacts[1])).toString("utf8"),
    );
    assert.equal(evidence.quality.fakeTransparency.checkerboardDetected, true);
    assert.equal(evidence.blockingProof.fakeTransparencyPassed, false);
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});

test("black additive preserves the black stage and proves visible effect content", async () => {
  const fx = await fixture(
    await image(
      { r: 0, g: 0, b: 0, alpha: 1 },
      { r: 255, g: 90, b: 20, alpha: 1 },
    ),
  );
  try {
    const result = await execute(fx, {
      backgroundMode: "black-additive",
      requireMeaningfulAlpha: false,
      quality: { safePadding: 0 },
    });
    assert.equal(result.result.qualityPassed, true);
    const evidence = JSON.parse(
      (await fx.artifacts.read(result.outputArtifacts[1])).toString("utf8"),
    );
    assert.ok(evidence.background.blackEvidence.blackBorderFraction >= 0.85);
    assert.ok(evidence.background.blackEvidence.nonBlackPixels > 0);
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});
