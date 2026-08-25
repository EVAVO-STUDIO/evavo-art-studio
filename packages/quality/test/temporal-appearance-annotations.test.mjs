import assert from "node:assert/strict";
import test from "node:test";

import {
  analyseTemporalAppearance,
  applyTemporalAppearanceAnnotations,
} from "../dist/index.js";

function frame(id, rgb) {
  const data = new Uint8Array(4 * 4 * 4);
  for (let index = 0; index < 16; index += 1) {
    const offset = index * 4;
    data[offset] = rgb[0];
    data[offset + 1] = rgb[1];
    data[offset + 2] = rgb[2];
    data[offset + 3] = 255;
  }
  return {
    frameId: id,
    frame: {
      data,
      width: 4,
      height: 4,
      channels: 4,
      sourceFormat: "png",
      sourceHasAlpha: true,
      sourcePages: 1,
    },
  };
}

test("exempts only the declared metric on the declared adjacent pair", () => {
  const report = analyseTemporalAppearance(
    [frame("f1", [20, 20, 20]), frame("f2", [245, 40, 35])],
    { blocking: true },
  );
  assert.equal(report.passed, false);

  const annotated = applyTemporalAppearanceAnnotations(report, [
    {
      fromFrameId: "f1",
      toFrameId: "f2",
      metrics: ["luma"],
      reason: "authored muzzle flash exposure spike",
    },
  ]);

  assert.equal(annotated.gates.find((gate) => gate.id === "temporal-luma").status, "pass");
  assert.notEqual(annotated.gates.find((gate) => gate.id === "temporal-palette").status, "pass");
  assert.equal(annotated.passed, false);
});

test("can exempt multiple explicitly expected appearance discontinuities", () => {
  const report = analyseTemporalAppearance(
    [frame("f1", [20, 20, 20]), frame("f2", [245, 40, 35])],
    { blocking: true },
  );
  const annotated = applyTemporalAppearanceAnnotations(report, [
    {
      fromFrameId: "f1",
      toFrameId: "f2",
      metrics: ["luma", "chroma", "palette"],
      reason: "deliberate full-frame impact flash with authored palette shift",
    },
  ]);
  assert.equal(annotated.gates.find((gate) => gate.id === "temporal-luma").status, "pass");
  assert.equal(annotated.gates.find((gate) => gate.id === "temporal-chroma").status, "pass");
  assert.equal(annotated.gates.find((gate) => gate.id === "temporal-palette").status, "pass");
});

test("rejects non-adjacent, duplicate-metric and empty-reason annotations", () => {
  const report = analyseTemporalAppearance([
    frame("f1", [20, 20, 20]),
    frame("f2", [30, 30, 30]),
    frame("f3", [40, 40, 40]),
  ]);
  assert.throws(
    () => applyTemporalAppearanceAnnotations(report, [
      { fromFrameId: "f1", toFrameId: "f3", metrics: ["luma"], reason: "skip" },
    ]),
    /does not identify an adjacent analysed frame pair/,
  );
  assert.throws(
    () => applyTemporalAppearanceAnnotations(report, [
      { fromFrameId: "f1", toFrameId: "f2", metrics: ["luma", "luma"], reason: "skip" },
    ]),
    /duplicates or unsupported metrics/,
  );
  assert.throws(
    () => applyTemporalAppearanceAnnotations(report, [
      { fromFrameId: "f1", toFrameId: "f2", metrics: ["luma"], reason: "" },
    ]),
    /reason must be a non-empty safe string/,
  );
});
