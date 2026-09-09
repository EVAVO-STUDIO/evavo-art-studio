import assert from "node:assert/strict";
import test from "node:test";

import { extractWavefrontObjUv, reviewWavefrontObjUv } from "../dist/index.js";

const CLEAN_QUAD = `
o wall
usemtl brick
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
vt 0.1 0.1
vt 0.9 0.1
vt 0.9 0.9
vt 0.1 0.9
g front
f 1/1 2/2 3/3 4/4
`;

test("extracts and triangulates an OBJ quad while preserving scope and topology metadata", () => {
  const result = extractWavefrontObjUv(CLEAN_QUAD);
  assert.equal(result.vertexCount, 4);
  assert.equal(result.textureCoordinateCount, 4);
  assert.equal(result.faceCount, 1);
  assert.equal(result.polygonFaceCount, 1);
  assert.equal(result.triangleCount, 2);
  assert.equal(result.skippedFacesWithoutUv, 0);
  assert.deepEqual(result.objectNames, ["wall"]);
  assert.deepEqual(result.groupNames, ["front"]);
  assert.deepEqual(result.materialNames, ["brick"]);
  assert.match(result.triangles[0].id, /^wall\/front\/brick\/face-1\/tri-1$/);
  assert.deepEqual(result.triangles[0].vertexKeys, ["v:1", "v:2", "v:3"]);
});

test("feeds OBJ UV and world-space triangles directly into topology-aware UV assurance", () => {
  const result = reviewWavefrontObjUv(CLEAN_QUAD, {
    textureWidth: 1024,
    textureHeight: 1024,
    minimumAtlasBoundaryPaddingTexels: 32,
  });
  assert.equal(result.sourceModified, false);
  assert.equal(result.review.grade, "pass");
  assert.equal(result.review.islandCount, 1);
  assert.equal(result.review.triangleCount, 2);
  assert.equal(result.review.connectivity.mode, "mesh-aware");
  assert.ok(result.review.texelDensity);
});

test("does not merge unrelated mesh parts merely because their UVs are identical", () => {
  const source = `
v 0 0 0
v 1 0 0
v 0 1 0
v 2 0 0
v 3 0 0
v 2 1 0
vt 0.1 0.1
vt 0.4 0.1
vt 0.1 0.4
f 1/1 2/2 3/3
f 4/1 5/2 6/3
`;
  const result = reviewWavefrontObjUv(source, { textureWidth: 1024, textureHeight: 1024 });
  assert.equal(result.review.islandCount, 2);
  assert.equal(result.review.grade, "fail");
  assert.ok(result.review.blockers.includes("unapproved-uv-overlaps:1"));
});

test("supports negative OBJ vertex and texture-coordinate indices", () => {
  const source = `
v 0 0 0
v 1 0 0
v 0 1 0
vt 0 0
vt 1 0
vt 0 1
f -3/-3 -2/-2 -1/-1
`;
  const result = extractWavefrontObjUv(source);
  assert.equal(result.triangleCount, 1);
  assert.deepEqual(result.triangles[0].uv, [
    { u: 0, v: 0 },
    { u: 1, v: 0 },
    { u: 0, v: 1 },
  ]);
  assert.deepEqual(result.triangles[0].vertexKeys, ["v:1", "v:2", "v:3"]);
});

test("counts faces that cannot be UV-reviewed instead of inventing coordinates", () => {
  const source = `
v 0 0 0
v 1 0 0
v 0 1 0
v 2 0 0
v 3 0 0
v 2 1 0
vt 0 0
vt 1 0
vt 0 1
f 1/1 2/2 3/3
f 4 5 6
`;
  const result = extractWavefrontObjUv(source);
  assert.equal(result.faceCount, 2);
  assert.equal(result.skippedFacesWithoutUv, 1);
  assert.equal(result.triangleCount, 1);
});

test("majority orientation accepts a globally V-flipped OBJ review domain", () => {
  const source = `
v 0 0 0
v 1 0 0
v 0 1 0
vt 0 0
vt 1 0
vt 0 1
f 1/1 2/2 3/3
`;
  const normal = reviewWavefrontObjUv(source, { mirroredPolicy: "reject" });
  const flipped = reviewWavefrontObjUv(source, { mirroredPolicy: "reject", flipVForReview: true });
  assert.equal(normal.review.grade, "pass");
  assert.equal(flipped.review.grade, "pass");
  assert.equal(normal.review.orientation.referenceSign, "positive");
  assert.equal(flipped.review.orientation.referenceSign, "negative");
  assert.deepEqual(flipped.extraction.triangles[0].uv, normal.extraction.triangles[0].uv);
});

test("an explicit positive convention can still detect a V-flipped review as mirrored", () => {
  const source = `
v 0 0 0
v 1 0 0
v 0 1 0
vt 0 0
vt 1 0
vt 0 1
f 1/1 2/2 3/3
`;
  const result = reviewWavefrontObjUv(source, {
    flipVForReview: true,
    orientationConvention: "positive",
    mirroredPolicy: "reject",
  });
  assert.equal(result.review.grade, "fail");
  assert.equal(result.review.mirroredTriangleIds.length, 1);
});

test("forwards inter-island padding review options", () => {
  const source = `
v 0 0 0
v 1 0 0
v 0 1 0
v 2 0 0
v 3 0 0
v 2 1 0
vt 0.1 0.1
vt 0.4 0.1
vt 0.1 0.4
vt 0.405 0.1
vt 0.7 0.1
vt 0.7 0.4
f 1/1 2/2 3/3
f 4/4 5/5 6/6
`;
  const result = reviewWavefrontObjUv(source, {
    textureWidth: 1000,
    textureHeight: 1000,
    minimumIslandPaddingTexels: 8,
  });
  assert.equal(result.review.grade, "fail");
  assert.ok(result.review.blockers.some((item) => item.startsWith("inter-island-padding-below-8px:")));
});

test("fails closed when an OBJ has no UV-reviewable faces", () => {
  const source = `
v 0 0 0
v 1 0 0
v 0 1 0
f 1 2 3
`;
  assert.throws(() => extractWavefrontObjUv(source), /produced no UV triangles/);
});
