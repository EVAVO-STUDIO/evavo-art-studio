import assert from "node:assert/strict";
import test from "node:test";

import { reviewUvLayout } from "../dist/index.js";

const p = (u, v) => ({ u, v });
const v = (x, y, z = 0) => ({ x, y, z });

test("accepts a clean connected quad without false overlap", () => {
  const result = reviewUvLayout([
    { id: "a", uv: [p(0, 0), p(1, 0), p(1, 1)] },
    { id: "b", uv: [p(0, 0), p(1, 1), p(0, 1)] },
  ]);
  assert.equal(result.grade, "pass");
  assert.equal(result.islandCount, 1);
  assert.deepEqual(result.overlapPairs, []);
});

test("rejects accidental stacked UVs but permits an explicit shared overlap group", () => {
  const triangles = [
    { id: "a", uv: [p(0.1, 0.1), p(0.4, 0.1), p(0.1, 0.4)] },
    { id: "b", uv: [p(0.1, 0.1), p(0.4, 0.1), p(0.1, 0.4)] },
  ];
  const rejected = reviewUvLayout(triangles);
  assert.equal(rejected.grade, "fail");
  assert.equal(rejected.overlapPairs.length, 1);
  assert.ok(rejected.blockers.includes("unapproved-uv-overlaps:1"));

  const allowed = reviewUvLayout(triangles.map((triangle) => ({ ...triangle, overlapGroup: "intentional-stack" })));
  assert.equal(allowed.grade, "pass");
  assert.equal(allowed.overlapPairs[0].allowedByGroup, true);
});

test("rejects out-of-range UV coordinates unless tiled coordinates are explicitly allowed", () => {
  const triangles = [{ id: "tile", uv: [p(-0.1, 0), p(1.2, 0), p(0.5, 1.1)] }];
  assert.equal(reviewUvLayout(triangles).grade, "fail");
  assert.equal(reviewUvLayout(triangles, { allowTiledCoordinates: true }).grade, "pass");
});

test("mirrored UV winding is visible and policy-controlled", () => {
  const triangles = [{ id: "mirrored", uv: [p(0, 0), p(0, 1), p(1, 0)] }];
  const warned = reviewUvLayout(triangles);
  assert.equal(warned.grade, "warn");
  assert.deepEqual(warned.mirroredTriangleIds, ["mirrored"]);
  const rejected = reviewUvLayout(triangles, { mirroredPolicy: "reject" });
  assert.equal(rejected.grade, "fail");
});

test("detects texel-density outliers when world-space geometry and texture size are supplied", () => {
  const world = [v(0, 0), v(1, 0), v(0, 1)];
  const result = reviewUvLayout([
    { id: "large-uv", uv: [p(0.05, 0.05), p(0.45, 0.05), p(0.05, 0.45)], position: world },
    { id: "small-uv", uv: [p(0.7, 0.7), p(0.75, 0.7), p(0.7, 0.75)], position: world },
  ], {
    textureWidth: 1024,
    textureHeight: 1024,
    maximumTexelDensityRatio: 2,
  });
  assert.equal(result.grade, "warn");
  assert.ok(result.texelDensity);
  assert.deepEqual(result.texelDensity.outlierTriangleIds, ["small-uv"]);
});

test("can enforce atlas boundary padding in texels", () => {
  const result = reviewUvLayout([
    { id: "edge", uv: [p(0.001, 0.001), p(0.2, 0.001), p(0.001, 0.2)] },
  ], {
    textureWidth: 1024,
    textureHeight: 1024,
    minimumAtlasBoundaryPaddingTexels: 4,
  });
  assert.equal(result.grade, "fail");
  assert.ok(result.blockers.some((item) => item.startsWith("atlas-boundary-padding-below-4px:")));
});
