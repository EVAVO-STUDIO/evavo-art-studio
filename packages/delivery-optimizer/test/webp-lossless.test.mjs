import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import {
  DeliveryOptimizerError,
  optimizeDeliveryImage,
} from "../dist/index.js";

function rgba(width, height, painter) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const pixel = painter(x, y);
      data[offset] = pixel[0];
      data[offset + 1] = pixel[1];
      data[offset + 2] = pixel[2];
      data[offset + 3] = pixel[3];
    }
  }
  return data;
}

async function png(width, height, painter) {
  return sharp(rgba(width, height, painter), {
    raw: { width, height, channels: 4 },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
}

async function decoded(bytes) {
  return sharp(bytes).toColourspace("srgb").ensureAlpha().raw().toBuffer();
}

test("Godot opaque profile emits true lossless WebP", async () => {
  const sourceRaw = rgba(32, 24, (x, y) => [
    (x * 17 + y * 3) % 256,
    (x * 5 + y * 29) % 256,
    (x * 11 + y * 7) % 256,
    255,
  ]);
  const input = await sharp(sourceRaw, {
    raw: { width: 32, height: 24, channels: 4 },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
  const result = await optimizeDeliveryImage(input, {
    profileId: "godot-background-1080p",
    background: { mode: "preserve" },
  });
  assert.equal(result.evidence.selectedCandidateId, "webp-lossless");
  const selected = result.evidence.candidates.find(
    (candidate) => candidate.id === "webp-lossless",
  );
  assert.equal(selected?.lossless, true);
  assert.equal(selected?.metrics.meanAbsoluteError, 0);
  assert.equal(selected?.metrics.alphaMeanAbsoluteError, 0);
  assert.deepEqual(await decoded(result.bytes), sourceRaw);
});

test("Godot cutout WebP preserves exact visible colour and alpha", async () => {
  const sourceRaw = rgba(32, 32, (x, y) => {
    if (x >= 8 && x <= 23 && y >= 6 && y <= 27) {
      return [210, 70, 35, x === 8 || x === 23 ? 128 : 255];
    }
    return [0, 0, 0, 0];
  });
  const input = await sharp(sourceRaw, {
    raw: { width: 32, height: 32, channels: 4 },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
  const result = await optimizeDeliveryImage(input, {
    profileId: "godot-cutout-webp-1080p",
    background: { mode: "preserve" },
  });
  assert.equal(result.evidence.selectedCandidateId, "webp-lossless");
  assert.deepEqual(await decoded(result.bytes), sourceRaw);
});

test("Godot cutout WebP fails closed when transparent RGB is not retained", async () => {
  const sourceRaw = rgba(16, 16, (x, y) => {
    if (x >= 5 && x <= 10 && y >= 4 && y <= 11) return [210, 70, 35, 255];
    if (x === 4 && y >= 5 && y <= 10) return [210, 70, 35, 0];
    return [0, 0, 0, 0];
  });
  const input = await sharp(sourceRaw, {
    raw: { width: 16, height: 16, channels: 4 },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
  try {
    const result = await optimizeDeliveryImage(input, {
      profileId: "godot-cutout-webp-1080p",
      background: { mode: "preserve" },
    });
    assert.deepEqual(await decoded(result.bytes), sourceRaw);
  } catch (error) {
    assert.ok(error instanceof DeliveryOptimizerError);
    assert.equal(error.code, "DELIVERY_NO_ENCODING_CANDIDATE_PASSED");
    const failures = error.details?.candidates?.flatMap(
      (candidate) => candidate.failures,
    );
    assert.ok(failures?.includes("transparent-rgb-not-preserved"));
  }
});
