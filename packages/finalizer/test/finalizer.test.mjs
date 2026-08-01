import assert from "node:assert/strict";
import test from "node:test";

import {
  assessSpriteFinalization,
  finalizeDecodedSpriteFrame,
  spriteFinalizerProtocolSummary,
} from "../dist/index.js";
import { analyseDecodedSpriteFrame } from "../../quality/dist/index.js";

function frame(width, height, sourceHasAlpha = true) {
  return {
    data: new Uint8Array(width * height * 4),
    width,
    height,
    channels: 4,
    sourceFormat: "png",
    sourceHasAlpha,
    sourcePages: 1,
  };
}

function pixel(value, x, y, rgba) {
  const offset = (y * value.width + x) * 4;
  value.data.set(rgba, offset);
}

const expectations = {
  frameId: "finalizer-proof",
  transparency: "alpha-required",
  expectedWidth: 7,
  expectedHeight: 7,
  expectedFormat: "png",
  safePadding: 0,
  knownMatteColours: ["#ff00ff", "#00ff00", "#ffffff", "#000000"],
  maximumHaloFraction: 0.01,
  maximumUnexpectedTransparentRgbFraction: 0.05,
};

test("normalizes unrelated transparent RGB while retaining edge bleed", () => {
  const source = frame(7, 7);
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      pixel(source, x, y, [255, 0, 255, 0]);
    }
  }
  for (let y = 2; y <= 4; y += 1) {
    for (let x = 2; x <= 4; x += 1) {
      pixel(source, x, y, [180, 40, 30, 255]);
    }
  }
  const result = finalizeDecodedSpriteFrame(source, expectations, {
    maximumPasses: 2,
    transparentBleedRadius: 1,
  });
  assert.equal(result.ready, true);
  assert.equal(result.changed, true);
  assert.ok(result.changedPixels > 0);
  assert.equal(result.report.transparentRgb.unexpectedPixels, 0);
  const corner = 0;
  assert.deepEqual([...result.frame.data.slice(corner, corner + 4)], [0, 0, 0, 0]);
  const edge = (2 * source.width + 1) * 4;
  assert.deepEqual(
    [...result.frame.data.slice(edge, edge + 4)],
    [180, 40, 30, 0],
  );
});

test("decontaminates matte-like partial alpha without changing alpha", () => {
  const source = frame(7, 7);
  for (let y = 2; y <= 4; y += 1) {
    for (let x = 2; x <= 4; x += 1) {
      const edge = x === 2 || x === 4 || y === 2 || y === 4;
      pixel(source, x, y, edge ? [255, 0, 255, 128] : [30, 80, 210, 255]);
    }
  }
  const before = analyseDecodedSpriteFrame(source, expectations);
  assert.equal(before.passed, false);
  assert.ok(before.halo.haloPixels > 0);
  const result = finalizeDecodedSpriteFrame(source, expectations, {
    maximumPasses: 2,
    matteSearchRadius: 3,
    matteDistanceThreshold: 32,
  });
  assert.equal(result.ready, true);
  assert.equal(result.report.halo.haloPixels, 0);
  const partial = (2 * source.width + 2) * 4;
  assert.deepEqual(
    [...result.frame.data.slice(partial, partial + 4)],
    [30, 80, 210, 128],
  );
});

test("classifies painted checkerboards as provider repair and never mutates them", () => {
  const source = frame(8, 8, false);
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const light = (Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0;
      pixel(source, x, y, light ? [210, 210, 210, 255] : [155, 155, 155, 255]);
    }
  }
  const report = analyseDecodedSpriteFrame(source, {
    ...expectations,
    expectedWidth: 8,
    expectedHeight: 8,
  });
  const assessment = assessSpriteFinalization(report);
  assert.equal(assessment.disposition, "provider-repair");
  assert.ok(assessment.failedBlockingGateIds.includes("fake-transparency"));
  const result = finalizeDecodedSpriteFrame(
    source,
    { ...expectations, expectedWidth: 8, expectedHeight: 8 },
    { maximumPasses: 2 },
  );
  assert.equal(result.ready, false);
  assert.equal(result.changed, false);
  assert.equal(result.passes.length, 1);
});

test("blocks deterministic pipeline geometry drift", () => {
  const source = frame(6, 7);
  pixel(source, 3, 3, [255, 255, 255, 255]);
  const result = finalizeDecodedSpriteFrame(source, expectations);
  assert.equal(result.ready, false);
  assert.equal(result.assessment.disposition, "blocked");
  assert.ok(result.assessment.failedBlockingGateIds.includes("dimensions"));
});

test("protocol describes bounded repairs and fail-closed escalation", () => {
  const protocol = spriteFinalizerProtocolSummary();
  assert.equal(protocol.protocolVersion, "2026-08-01.1");
  assert.ok(protocol.automaticRepairs.some((entry) => entry.includes("transparent")));
  assert.ok(protocol.failClosedEscalation.some((entry) => entry.includes("threshold")));
});
