import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { reviewTextureSet } from "../dist/index.js";

async function solid(width, height, rgba) {
  return sharp({ create: { width, height, channels: 4, background: rgba } }).png().toBuffer();
}

async function normal(width, height) {
  const raw = Buffer.alloc(width * height * 4);
  for (let i = 0; i < raw.length; i += 4) {
    raw[i] = 128;
    raw[i + 1] = 128;
    raw[i + 2] = 255;
    raw[i + 3] = 255;
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

test("reviews a coherent Godot material set with colour/data import intent", async () => {
  const result = await reviewTextureSet([
    { id: "albedo", kind: "base-color", encoded: await solid(4, 4, { r: 120, g: 80, b: 40, alpha: 1 }) },
    { id: "normal", kind: "normal-tangent", encoded: await normal(4, 4) },
    { id: "roughness", kind: "roughness", encoded: await solid(4, 4, { r: 180, g: 180, b: 180, alpha: 1 }) },
  ], { expectedKinds: ["base-color", "normal-tangent", "roughness"] });

  assert.notEqual(result.decision, "reject");
  assert.equal(result.width, 4);
  assert.equal(result.height, 4);
  assert.equal(result.godot.preferredMaterial, "StandardMaterial3D");
  assert.equal(result.godot.normalConvention, "OpenGL X+ Y+ Z+");
  assert.equal(result.maps.find((item) => item.kind === "base-color").godot.samplingIntent, "srgb-colour");
  assert.equal(result.maps.find((item) => item.kind === "normal-tangent").godot.samplingIntent, "linear-data");
});

test("rejects dimension mismatches across one material set", async () => {
  const result = await reviewTextureSet([
    { id: "albedo", kind: "base-color", encoded: await solid(4, 4, { r: 80, g: 90, b: 100, alpha: 1 }) },
    { id: "roughness", kind: "roughness", encoded: await solid(2, 2, { r: 160, g: 160, b: 160, alpha: 1 }) },
  ]);
  assert.equal(result.decision, "reject");
  assert.ok(result.blockers.some((value) => value.startsWith("dimension-mismatch:roughness:")));
});

test("rejects explicitly expected missing maps", async () => {
  const result = await reviewTextureSet([
    { id: "albedo", kind: "base-color", encoded: await solid(4, 4, { r: 80, g: 90, b: 100, alpha: 1 }) },
  ], { expectedKinds: ["base-color", "normal-tangent"] });
  assert.equal(result.decision, "reject");
  assert.deepEqual(result.missingExpectedKinds, ["normal-tangent"]);
  assert.ok(result.blockers.includes("missing-expected-map:normal-tangent"));
});

test("selects ORMMaterial3D guidance when an ORM texture is present", async () => {
  const result = await reviewTextureSet([
    { id: "orm", kind: "orm-packed", encoded: await solid(4, 4, { r: 255, g: 160, b: 0, alpha: 1 }) },
  ]);
  assert.equal(result.godot.preferredMaterial, "ORMMaterial3D");
  assert.equal(result.maps[0].godot.channelContract, "R=ambient occlusion; G=roughness; B=metallic");
});
