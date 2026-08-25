import assert from "node:assert/strict";
import test from "node:test";

import { analyseTemporalAppearance } from "../dist/index.js";

function rgbaFrame(width, height, pixel) {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const [r, g, b, a] = pixel(index % width, Math.floor(index / width));
    const offset = index * 4;
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = a;
  }
  return {
    data,
    width,
    height,
    channels: 4,
    sourceFormat: "png",
    sourceHasAlpha: true,
    sourcePages: 1,
  };
}

function solid(id, rgb) {
  return {
    frameId: id,
    frame: rgbaFrame(8, 8, () => [...rgb, 255]),
  };
}

test("passes stable neighbouring appearance evidence", () => {
  const report = analyseTemporalAppearance([
    solid("f1", [92, 82, 72]),
    solid("f2", [96, 84, 74]),
    solid("f3", [94, 83, 73]),
  ]);
  assert.equal(report.passed, true);
  assert.ok(report.gates.every((gate) => gate.status === "pass"));
  assert.equal(report.authority.creativeApproval, false);
});

test("warns on abrupt lighting and palette flicker without claiming creative failure", () => {
  const report = analyseTemporalAppearance([
    solid("f1", [40, 42, 45]),
    solid("f2", [235, 40, 35]),
    solid("f3", [42, 44, 46]),
  ]);
  assert.equal(report.passed, true);
  assert.ok(report.gates.some((gate) => gate.status === "warning"));
  assert.equal(report.gates.find((gate) => gate.id === "temporal-luma").status, "warning");
  assert.equal(report.gates.find((gate) => gate.id === "temporal-palette").status, "warning");
});

test("can promote temporal appearance drift to a blocking production gate", () => {
  const report = analyseTemporalAppearance(
    [solid("f1", [30, 30, 30]), solid("f2", [240, 240, 240])],
    { blocking: true },
  );
  assert.equal(report.passed, false);
  assert.ok(report.gates.some((gate) => gate.blocking && gate.status === "fail"));
});

test("detects line or detail-density jumps through edge-density evidence", () => {
  const flat = solid("flat", [128, 128, 128]);
  const checker = {
    frameId: "checker",
    frame: rgbaFrame(8, 8, (x, y) => ((x + y) % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255])),
  };
  const report = analyseTemporalAppearance([flat, checker], {
    maximumAdjacentEdgeDensityDelta: 0.1,
  });
  assert.equal(report.gates.find((gate) => gate.id === "temporal-edge-density").status, "warning");
});

test("ignores transparent RGB garbage when measuring visible appearance", () => {
  const first = {
    frameId: "f1",
    frame: rgbaFrame(8, 8, (x, y) =>
      x >= 2 && x <= 5 && y >= 2 && y <= 5 ? [120, 100, 80, 255] : [255, 0, 255, 0],
    ),
  };
  const second = {
    frameId: "f2",
    frame: rgbaFrame(8, 8, (x, y) =>
      x >= 2 && x <= 5 && y >= 2 && y <= 5 ? [120, 100, 80, 255] : [0, 255, 0, 0],
    ),
  };
  const report = analyseTemporalAppearance([first, second]);
  assert.ok(report.gates.every((gate) => gate.status === "pass"));
});

test("fails closed on empty or malformed evidence", () => {
  assert.throws(() => analyseTemporalAppearance([]), /At least two ordered frames/);
  assert.throws(
    () => analyseTemporalAppearance([solid("same", [1, 2, 3]), solid("same", [1, 2, 3])]),
    /frameIds must be unique/,
  );
  const transparent = {
    frameId: "transparent",
    frame: rgbaFrame(4, 4, () => [255, 255, 255, 0]),
  };
  assert.throws(
    () => analyseTemporalAppearance([transparent, solid("visible", [1, 2, 3])]),
    /contains no visible pixels/,
  );
});
