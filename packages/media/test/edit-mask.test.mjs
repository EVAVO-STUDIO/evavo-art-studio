import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { createEditMask } from "../dist/index.js";

test("creates union mask for bounded rectangle and ellipse regions", async () => {
  const result = await createEditMask(20, 10, [
    { x: 2, y: 2, width: 4, height: 3, shape: "rectangle" },
    { x: 12, y: 2, width: 5, height: 5, shape: "ellipse" },
  ]);
  assert.equal(result.evidence.width, 20);
  assert.equal(result.evidence.height, 10);
  assert.equal(result.evidence.regions, 2);
  assert.ok(result.evidence.coveredPixels > 12);
  assert.ok(result.evidence.coverageRatio < 0.5);
  const meta = await sharp(result.png).metadata();
  assert.equal(meta.width, 20);
  assert.equal(meta.height, 10);
});

test("rejects out of bounds region origins", async () => {
  await assert.rejects(
    () => createEditMask(10, 10, [{ x: 10, y: 0, width: 1, height: 1 }]),
    /regions\[0\]\.x/,
  );
});
