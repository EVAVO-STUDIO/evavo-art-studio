import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import {
  listDeliveryImageProfiles,
  optimizeDeliveryImage,
} from "../dist/index.js";

function rgba(width, height, painter) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const [r, g, b, a] = painter(x, y);
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = a;
    }
  }
  return data;
}


function pngStorage(bytes) {
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(bytes.toString("ascii", 12, 16), "IHDR");
  return {
    bitDepth: bytes[24],
    colourType: bytes[25],
    interlace: bytes[28],
  };
}

async function uncompressedPng(width, height, painter) {
  return sharp(rgba(width, height, painter), {
    raw: { width, height, channels: 4 },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
}

test("publishes role-aware runtime profiles", () => {
  const profiles = listDeliveryImageProfiles();
  const dialogue = profiles.find(
    (profile) => profile.id === "retro-dialogue-portrait-384",
  );
  const scene = profiles.find((profile) => profile.id === "retro-scene-720p");
  assert.equal(dialogue?.maxHeight, 384);
  assert.equal(scene?.maxWidth, 1280);
  assert.equal(scene?.maxHeight, 720);
  assert.match(scene?.intendedRuntimeScale ?? "", /do not store a redundant 1080p/i);
});

test("optimizes an opaque dialogue portrait at its actual display size", async () => {
  const input = await uncompressedPng(768, 768, (x, y) => {
    const face = x > 220 && x < 548 && y > 120 && y < 690;
    const highlight = x > 300 && x < 468 && y > 180 && y < 420;
    return highlight ? [224, 224, 224, 255] : face ? [96, 96, 96, 255] : [0, 0, 0, 255];
  });
  const result = await optimizeDeliveryImage(input, {
    profileId: "retro-dialogue-portrait-384",
    background: { mode: "preserve" },
  });
  const metadata = await sharp(result.bytes).metadata();
  assert.equal(metadata.width, 384);
  assert.equal(metadata.height, 384);
  assert.equal(metadata.hasAlpha, false);
  assert.deepEqual(pngStorage(result.bytes), { bitDepth: 8, colourType: 0, interlace: 0 });
  assert.equal(result.evidence.prepared.pngStorage.colourType, 0);
  assert.ok(result.bytes.length < input.length / 10);
  assert.equal(result.evidence.background.mode, "preserve");
  assert.equal(result.evidence.candidates.some((candidate) => candidate.passed), true);
});

test("removes only border-connected black for a standing sprite", async () => {
  const input = await uncompressedPng(512, 768, (x, y) => {
    const body = x > 150 && x < 362 && y > 70 && y < 730;
    const interiorBlack = x > 220 && x < 292 && y > 260 && y < 440;
    if (interiorBlack) return [0, 0, 0, 255];
    if (body) return [200, 200, 200, 255];
    return [0, 0, 0, 255];
  });
  const result = await optimizeDeliveryImage(input, {
    profileId: "retro-standing-character-576",
    background: {
      mode: "remove-border-matte",
      matteColour: "#000000",
      connectionDistance: 24,
      opaqueSeedDistance: 64,
      edgeSearchRadius: 12,
      bleedRadius: 2,
      minimumBorderMatteFraction: 0.65,
    },
  });
  const decoded = await sharp(result.bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(decoded.info.width, 384);
  assert.equal(decoded.info.height, 576);
  assert.deepEqual(pngStorage(result.bytes), { bitDepth: 8, colourType: 4, interlace: 0 });
  assert.equal(result.evidence.prepared.pngStorage.colourType, 4);
  let transparent = 0;
  let opaqueBlack = 0;
  for (let offset = 0; offset < decoded.data.length; offset += 4) {
    const alpha = decoded.data[offset + 3];
    if (alpha === 0) transparent += 1;
    if (
      alpha === 255 &&
      decoded.data[offset] === 0 &&
      decoded.data[offset + 1] === 0 &&
      decoded.data[offset + 2] === 0
    ) {
      opaqueBlack += 1;
    }
  }
  assert.ok(transparent > decoded.info.width * decoded.info.height * 0.4);
  assert.ok(opaqueBlack > 1000, "enclosed black subject detail should remain opaque");
  assert.equal(result.evidence.background.mode, "remove-border-matte");
});


test("uses conservative border-connected defaults for black matte removal", async () => {
  const input = await uncompressedPng(256, 384, (x, y) => {
    const body = x > 70 && x < 186 && y > 30 && y < 360;
    const coat = x > 88 && x < 168 && y > 150 && y < 330;
    if (coat) return [12, 12, 12, 255];
    if (body) return [176, 176, 176, 255];
    return [0, 0, 0, 255];
  });
  const result = await optimizeDeliveryImage(input, {
    profileId: "retro-standing-character-576",
    background: {
      mode: "remove-border-matte",
      matteColour: "#000000",
    },
  });
  const evidence = result.evidence.background.evidence;
  assert.equal(evidence.thresholds.connectionDistance, 24);
  assert.equal(evidence.thresholds.opaqueSeedDistance, 64);
  assert.ok(evidence.segmentation.preservedInteriorMatteLikePixels > 0);
});


test("reuses already compliant delivery bytes instead of growing the file", async () => {
  const source = await uncompressedPng(384, 576, (x, y) => {
    const body = x > 90 && x < 294 && y > 30 && y < 550;
    return body ? [160, 160, 160, 255] : [0, 0, 0, 0];
  });
  const first = await optimizeDeliveryImage(source, {
    profileId: "retro-standing-character-576",
    background: { mode: "preserve" },
  });
  const second = await optimizeDeliveryImage(first.bytes, {
    profileId: "retro-standing-character-576",
    background: { mode: "preserve" },
  });
  assert.equal(second.evidence.selectedCandidateId, "source-original");
  assert.equal(second.evidence.savings.bytes, 0);
  assert.deepEqual(second.bytes, first.bytes);
});

test("preserves red UI accents in canonical RGBA8 storage", async () => {
  const input = await uncompressedPng(128, 128, (x, y) => {
    const inside = x > 20 && x < 108 && y > 20 && y < 108;
    return inside ? [255, 36, 78, 255] : [0, 0, 0, 0];
  });
  const result = await optimizeDeliveryImage(input, {
    profileId: "retro-ui-icon-256",
    background: { mode: "preserve" },
  });
  assert.deepEqual(pngStorage(result.bytes), { bitDepth: 8, colourType: 6, interlace: 0 });
  const decoded = await sharp(result.bytes).ensureAlpha().raw().toBuffer();
  let redPixels = 0;
  for (let offset = 0; offset < decoded.length; offset += 4) {
    if (decoded[offset] > 240 && decoded[offset + 1] < 60 && decoded[offset + 2] < 100 && decoded[offset + 3] === 255) redPixels += 1;
  }
  assert.ok(redPixels > 1000);
});

test("Godot sprite profile preserves spatial transparent RGB in canonical RGBA8 storage", async () => {
  const input = await uncompressedPng(16, 16, (x, y) => {
    if (x >= 5 && x <= 10 && y >= 4 && y <= 11) return [210, 70, 35, 255];
    if (x === 4 && y >= 5 && y <= 10) return [210, 70, 35, 0];
    return [0, 0, 0, 0];
  });
  const result = await optimizeDeliveryImage(input, {
    profileId: "godot-sprite-lossless",
    background: { mode: "preserve" },
  });
  assert.equal(result.evidence.selectedCandidateId, "png-rgba8");
  assert.deepEqual(pngStorage(result.bytes), {
    bitDepth: 8,
    colourType: 6,
    interlace: 0,
  });
  const decoded = await sharp(result.bytes).ensureAlpha().raw().toBuffer();
  const bleed = (5 * 16 + 4) * 4;
  const far = (1 * 16 + 1) * 4;
  assert.deepEqual([...decoded.subarray(bleed, bleed + 4)], [210, 70, 35, 0]);
  assert.deepEqual([...decoded.subarray(far, far + 4)], [0, 0, 0, 0]);
});

test("derives soft tintable alpha from luminance without a hard threshold", async () => {
  const levels = [0, 64, 128, 255];
  const input = await uncompressedPng(4, 1, (x) => {
    const level = levels[x];
    return [level, level, level, 255];
  });
  const result = await optimizeDeliveryImage(input, {
    profileId: "retro-overlay-720p",
    background: {
      mode: "luminance-alpha",
      blackPoint: 0,
      whitePoint: 255,
      gamma: 1,
      outputColour: "#ffffff",
      invert: false,
    },
  });
  const decoded = await sharp(result.bytes)
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(decoded.info.width, 4);
  assert.equal(decoded.info.height, 1);
  assert.deepEqual(pngStorage(result.bytes), {
    bitDepth: 8,
    colourType: 4,
    interlace: 0,
  });
  const observedAlpha = [];
  for (let offset = 0; offset < decoded.data.length; offset += 4) {
    assert.deepEqual(
      [...decoded.data.subarray(offset, offset + 3)],
      [255, 255, 255],
    );
    observedAlpha.push(decoded.data[offset + 3]);
  }
  assert.deepEqual(observedAlpha, levels);
  assert.equal(result.evidence.background.mode, "luminance-alpha");
  assert.equal(
    result.evidence.background.evidence.method,
    "rec709-soft-luminance-to-alpha",
  );
  assert.equal(result.evidence.background.evidence.hardThresholdApplied, false);
  assert.equal(result.evidence.background.evidence.sourceAlphaMultiplied, true);
  assert.ok(
    result.evidence.transformations.includes("derive-soft-alpha-from-luminance"),
  );
});

test("lossless source profile retains decoded pixels exactly", async () => {
  const input = await uncompressedPng(96, 64, (x, y) => [
    (x * 11) % 256,
    (y * 17) % 256,
    ((x + y) * 7) % 256,
    x < 10 ? 0 : 255,
  ]);
  const result = await optimizeDeliveryImage(input, {
    profileId: "source-master-lossless",
    background: { mode: "preserve" },
  });
  const selected = result.evidence.candidates.find(
    (candidate) => candidate.id === result.evidence.selectedCandidateId,
  );
  assert.equal(selected?.metrics.meanAbsoluteError, 0);
  assert.equal(selected?.metrics.alphaMeanAbsoluteError, 0);
});
