import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import {
  analyseDecodedSpriteFrame,
  analyseSpriteSequence,
  analyseSpriteSequenceManifestFile,
  decodeSpriteFrame,
} from "../dist/index.js";

function frame(width, height, painter, sourceHasAlpha = true) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const colour = painter(x, y);
      const offset = (y * width + x) * 4;
      data[offset] = colour[0];
      data[offset + 1] = colour[1];
      data[offset + 2] = colour[2];
      data[offset + 3] = colour[3];
    }
  }
  return {
    data,
    width,
    height,
    channels: 4,
    sourceFormat: "png",
    sourceHasAlpha,
    sourcePages: 1,
  };
}

const transparentSubject = (width = 16, height = 16) =>
  frame(width, height, (x, y) => {
    const inside = x >= 4 && x <= width - 5 && y >= 3 && y <= height - 4;
    return inside ? [190, 80, 40, 255] : [0, 0, 0, 0];
  });

const expectations = {
  frameId: "frame-001",
  transparency: "alpha-required",
  expectedWidth: 16,
  expectedHeight: 16,
  safePadding: 2,
};

test("accepts a real transparent sprite with safe bounds", () => {
  const report = analyseDecodedSpriteFrame(transparentSubject(), expectations);
  assert.equal(report.passed, true);
  assert.equal(report.source.hasAlpha, true);
  assert.equal(report.visibleBounds.clearance.left, 4);
  assert.equal(report.gates.find((entry) => entry.id === "fake-transparency")?.status, "pass");
});

test("rejects an opaque green matte masquerading as transparency", () => {
  const decoded = frame(16, 16, (x, y) => {
    const inside = x >= 4 && x <= 11 && y >= 3 && y <= 12;
    return inside ? [190, 80, 40, 255] : [0, 255, 0, 255];
  }, false);
  const report = analyseDecodedSpriteFrame(decoded, expectations);
  assert.equal(report.passed, false);
  assert.equal(report.fakeTransparency.flatMatteDetected, true);
});

test("rejects a baked checkerboard transparency background", () => {
  const decoded = frame(32, 32, (x, y) => {
    const inside = x >= 10 && x <= 21 && y >= 8 && y <= 25;
    if (inside) return [200, 80, 50, 255];
    const parity = (Math.floor(x / 4) + Math.floor(y / 4)) % 2;
    return parity ? [192, 192, 192, 255] : [240, 240, 240, 255];
  }, false);
  const report = analyseDecodedSpriteFrame(decoded, {
    ...expectations,
    frameId: "checkerboard",
    expectedWidth: 32,
    expectedHeight: 32,
  });
  assert.equal(report.passed, false);
  assert.equal(report.fakeTransparency.checkerboardDetected, true);
  assert.ok(report.fakeTransparency.checkerboardConfidence >= 0.86);
});

test("rejects a large painted checkerboard even when a small patch has real alpha", () => {
  const decoded = frame(384, 384, (x, y) => {
    if (x < 12 && y < 12) return [0, 0, 0, 0];
    if (x >= 130 && x <= 253 && y >= 80 && y <= 330) {
      return [200, 80, 50, 255];
    }
    const value = (Math.floor(x / 48) + Math.floor(y / 48)) % 2 ? 184 : 232;
    return [value, value, value, 255];
  });
  const report = analyseDecodedSpriteFrame(decoded, {
    ...expectations,
    frameId: "checkerboard-with-alpha-bypass",
    expectedWidth: 384,
    expectedHeight: 384,
    safePadding: 0,
  });
  assert.equal(report.passed, false);
  assert.equal(report.fakeTransparency.checkerboardDetected, true);
  assert.equal(report.fakeTransparency.checkerboardTileSize, 48);
});

test("rejects a subtle resampled checkerboard behind a dominant foreground", () => {
  const width = 230;
  const height = 253;
  const decoded = frame(width, height, (x, y) => {
    if (x >= 40 && x <= 190 && y >= 28 && y <= 238) {
      return [72, 31, 18, 255];
    }
    const parity =
      (Math.floor(x / 23.5) + Math.floor(y / 23.5)) % 2;
    const noise = (x * 3 + y * 5) % 3;
    const value = (parity ? 243 : 252) + noise;
    return [value, value, value, 255];
  }, false);
  const report = analyseDecodedSpriteFrame(decoded, {
    ...expectations,
    frameId: "subtle-resampled-checkerboard",
    expectedWidth: width,
    expectedHeight: height,
    safePadding: 0,
  });
  assert.equal(report.passed, false);
  assert.equal(report.fakeTransparency.checkerboardDetected, true);
  assert.ok([22, 23, 24].includes(report.fakeTransparency.checkerboardTileSize));
  assert.ok(report.fakeTransparency.checkerboardCoverageFraction >= 0.5);
  assert.ok(report.fakeTransparency.checkerboardFitFraction >= 0.82);
});

test("rejects a partial-alpha checkerboard hidden inside a transparent rim", () => {
  const width = 128;
  const height = 128;
  const decoded = frame(width, height, (x, y) => {
    if (x >= 42 && x <= 85 && y >= 35 && y <= 92) {
      return [208, 72, 48, 255];
    }
    const value =
      (Math.floor(x / 16) + Math.floor(y / 16)) % 2 ? 176 : 224;
    const alpha =
      x === 0 || y === 0 || x === width - 1 || y === height - 1
        ? 0
        : 128;
    return [value, value, value, alpha];
  });
  const report = analyseDecodedSpriteFrame(decoded, {
    ...expectations,
    frameId: "partial-alpha-grid-bypass",
    expectedWidth: width,
    expectedHeight: height,
    safePadding: 0,
  });
  assert.equal(report.fakeTransparency.checkerboardDetected, true);
  assert.equal(report.passed, false);
});

test("does not label low-contrast neutral stripes as a checkerboard", () => {
  const width = 230;
  const height = 253;
  const decoded = frame(width, height, (x) => {
    const value = Math.floor(x / 23.5) % 2 ? 243 : 252;
    return [value, value, value, 255];
  }, false);
  const report = analyseDecodedSpriteFrame(decoded, {
    ...expectations,
    frameId: "neutral-stripes",
    expectedWidth: width,
    expectedHeight: height,
    safePadding: 0,
  });
  assert.equal(report.fakeTransparency.checkerboardDetected, false);
});

test("accepts intentional transparent edge bleed that agrees with the subject", () => {
  const decoded = frame(16, 16, (x, y) => {
    const subject = x >= 5 && x <= 10 && y >= 4 && y <= 11;
    const bleed = x >= 3 && x <= 12 && y >= 2 && y <= 13;
    if (subject) return [170, 70, 35, 255];
    if (bleed) return [170, 70, 35, 0];
    return [0, 0, 0, 0];
  });
  const report = analyseDecodedSpriteFrame(decoded, expectations);
  assert.equal(report.passed, true);
  assert.ok(report.transparentRgb.intentionalBleedPixels > 0);
  assert.equal(report.transparentRgb.unexpectedPixels, 0);
});

test("rejects unrelated hidden magenta below transparent pixels", () => {
  const decoded = frame(16, 16, (x, y) => {
    const subject = x >= 5 && x <= 10 && y >= 4 && y <= 11;
    if (subject) return [170, 70, 35, 255];
    return [255, 0, 255, 0];
  });
  const report = analyseDecodedSpriteFrame(decoded, expectations);
  assert.equal(report.passed, false);
  assert.ok(report.transparentRgb.unexpectedFraction > 0.02);
});

test("rejects a white partially transparent fringe", () => {
  const decoded = frame(16, 16, (x, y) => {
    const subject = x >= 5 && x <= 10 && y >= 4 && y <= 11;
    const fringe = x >= 4 && x <= 11 && y >= 3 && y <= 12;
    if (subject) return [40, 40, 40, 255];
    if (fringe) return [255, 255, 255, 128];
    return [0, 0, 0, 0];
  });
  const report = analyseDecodedSpriteFrame(decoded, expectations);
  assert.equal(report.passed, false);
  assert.ok(report.halo.haloFraction > 0.015);
});

test("rejects visible pixels entering the safety margin", () => {
  const decoded = frame(16, 16, (x, y) =>
    x <= 4 && y >= 3 && y <= 12 ? [200, 70, 40, 255] : [0, 0, 0, 0],
  );
  const report = analyseDecodedSpriteFrame(decoded, expectations);
  assert.equal(report.passed, false);
  assert.equal(report.gates.find((entry) => entry.id === "frame-crop")?.status, "fail");
});

test("decodes a real PNG through Sharp and retains source-alpha evidence", async () => {
  const png = await sharp({
    create: { width: 8, height: 8, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: { create: { width: 4, height: 4, channels: 4, background: { r: 200, g: 60, b: 40, alpha: 1 } } }, left: 2, top: 2 }])
    .png()
    .toBuffer();
  const decoded = await decodeSpriteFrame(png);
  assert.equal(decoded.sourceFormat, "png");
  assert.equal(decoded.sourceHasAlpha, true);
  assert.equal(decoded.channels, 4);
});

function sequenceManifest(overrides = {}) {
  return {
    schemaVersion: "1.0",
    sequenceId: "hero-idle",
    transparency: "alpha-required",
    expectedWidth: 16,
    expectedHeight: 16,
    safePadding: 2,
    expectedPivot: { x: 8, y: 13 },
    expectedBaseline: 12,
    groundContactTolerance: 0,
    frames: [
      { id: "f1", path: "f1.png", direction: "down", frameIndex: 0, globalFrameIndex: 0, durationMs: 125, pivot: { x: 8, y: 13 }, baseline: 12, groundContact: true },
      { id: "f2", path: "f2.png", direction: "down", frameIndex: 1, globalFrameIndex: 1, durationMs: 250, pivot: { x: 8, y: 13 }, baseline: 12, groundContact: true },
    ],
    ...overrides,
  };
}

const groundedFrame = (shift = 0) => frame(16, 16, (x, y) => {
  const inside = x >= 5 + shift && x <= 10 + shift && y >= 4 && y <= 12;
  return inside ? [170, 70, 35, 255] : [0, 0, 0, 0];
});

test("accepts an aligned sequence with exact timing", async () => {
  const frames = new Map([["f1", groundedFrame()], ["f2", groundedFrame(1)]]);
  const report = await analyseSpriteSequence(sequenceManifest(), frames);
  assert.equal(report.passed, true);
  assert.equal(report.summary.totalDurationMs, 375);
});

test("rejects undeclared duplicate frames but accepts declared linked-cel holds", async () => {
  const duplicate = groundedFrame();
  const frames = new Map([["f1", duplicate], ["f2", duplicate]]);
  const failed = await analyseSpriteSequence(sequenceManifest(), frames);
  assert.equal(failed.passed, false);
  assert.equal(failed.gates.find((entry) => entry.id === "frame-duplicates")?.status, "fail");

  const declared = sequenceManifest({
    frames: [
      sequenceManifest().frames[0],
      { ...sequenceManifest().frames[1], intentionalDuplicateOf: "f1" },
    ],
  });
  const passed = await analyseSpriteSequence(declared, frames);
  assert.equal(passed.passed, true);
});

test("rejects pivot and baseline drift", async () => {
  const manifest = sequenceManifest({
    frames: [
      sequenceManifest().frames[0],
      { ...sequenceManifest().frames[1], pivot: { x: 9, y: 13 }, baseline: 11 },
    ],
  });
  const report = await analyseSpriteSequence(
    manifest,
    new Map([["f1", groundedFrame()], ["f2", groundedFrame(1)]]),
  );
  assert.equal(report.passed, false);
  assert.equal(report.gates.find((entry) => entry.id === "frame-anchor")?.status, "fail");
  assert.equal(report.gates.find((entry) => entry.id === "frame-baseline")?.status, "fail");
});

test("loads and verifies a guarded file manifest", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-art-quality-"));
  await mkdir(path.join(root, "frames"));
  const first = await sharp(groundedFrame().data, { raw: { width: 16, height: 16, channels: 4 } }).png().toBuffer();
  const second = await sharp(groundedFrame(1).data, { raw: { width: 16, height: 16, channels: 4 } }).png().toBuffer();
  await writeFile(path.join(root, "frames", "f1.png"), first);
  await writeFile(path.join(root, "frames", "f2.png"), second);
  const manifest = sequenceManifest({
    frames: sequenceManifest().frames.map((entry) => ({ ...entry, path: `frames/${entry.id}.png` })),
  });
  const manifestPath = path.join(root, "sequence.json");
  await writeFile(manifestPath, JSON.stringify(manifest));
  const report = await analyseSpriteSequenceManifestFile(manifestPath, { allowedRoots: [root] });
  assert.equal(report.passed, true);
});
