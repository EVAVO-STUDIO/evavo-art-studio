import assert from "node:assert/strict";
import test from "node:test";

import { planGodotMaterialDelivery } from "../dist/index.js";

test("plans StandardMaterial3D bindings for separate PBR textures", () => {
  const result = planGodotMaterialDelivery({
    materialId: "brick-wall",
    textures: [
      { id: "albedo", kind: "base-color", resourcePath: "res://materials/brick/albedo.png" },
      { id: "normal", kind: "normal-tangent", resourcePath: "res://materials/brick/normal.png" },
      { id: "roughness", kind: "roughness", resourcePath: "res://materials/brick/roughness.png" },
      { id: "metallic", kind: "metallic", resourcePath: "res://materials/brick/metallic.png" },
      { id: "ao", kind: "ambient-occlusion", resourcePath: "res://materials/brick/ao.png" },
    ],
  });

  assert.equal(result.decision, "ready");
  assert.equal(result.materialClass, "StandardMaterial3D");
  assert.ok(result.bindings.some((item) => item.property === "normal_enabled" && item.value === true));
  assert.ok(result.bindings.some((item) => item.property === "metallic" && item.value === 1));
  assert.ok(result.bindings.some((item) => item.property === "ao_texture_channel" && item.value === "TEXTURE_CHANNEL_RED"));
});

test("selects ORMMaterial3D and binds the canonical ORM channel texture", () => {
  const result = planGodotMaterialDelivery({
    materialId: "painted-metal",
    textures: [
      { id: "albedo", kind: "base-color", resourcePath: "res://materials/metal/albedo.png" },
      { id: "orm", kind: "orm-packed", resourcePath: "res://materials/metal/orm.png" },
    ],
  });

  assert.equal(result.decision, "ready");
  assert.equal(result.materialClass, "ORMMaterial3D");
  assert.ok(result.bindings.some((item) => item.property === "orm_texture"));
  assert.ok(result.bindings.some((item) => item.property === "ao_enabled" && item.value === true));
  assert.ok(result.bindings.some((item) => item.property === "metallic" && item.value === 1));
});

test("requires preprocessing instead of silently binding a DirectX normal map", () => {
  const result = planGodotMaterialDelivery({
    materialId: "door",
    normalConvention: "directx",
    textures: [
      { id: "albedo", kind: "base-color", resourcePath: "res://door/albedo.png" },
      { id: "normal", kind: "normal-tangent", resourcePath: "res://door/normal_dx.png" },
    ],
  });

  assert.equal(result.decision, "needs-preprocess");
  assert.ok(result.preprocessing.includes("convert-normal-map-y-from-directx-to-opengl-before-binding"));
  assert.equal(result.unboundMaps[0].kind, "normal-tangent");
  assert.equal(result.bindings.some((item) => item.property === "normal_texture"), false);
});

test("does not pretend standalone opacity or specular maps have direct BaseMaterial3D texture slots", () => {
  const result = planGodotMaterialDelivery({
    materialId: "foliage",
    transparencyMode: "alpha-scissor",
    textures: [
      { id: "albedo", kind: "base-color", resourcePath: "res://foliage/albedo.png" },
      { id: "opacity", kind: "opacity", resourcePath: "res://foliage/opacity.png" },
      { id: "specular", kind: "specular", resourcePath: "res://foliage/specular.png" },
    ],
  });

  assert.equal(result.decision, "needs-preprocess");
  assert.deepEqual(result.unboundMaps.map((item) => item.kind).sort(), ["opacity", "specular"]);
  assert.ok(result.bindings.some((item) => item.property === "transparency" && item.value === "TRANSPARENCY_ALPHA_SCISSOR"));
  assert.ok(result.bindings.some((item) => item.property === "alpha_scissor_threshold" && item.value === 0.5));
});

test("rejects ambiguous packed and separate ORM authority", () => {
  const result = planGodotMaterialDelivery({
    materialId: "ambiguous",
    textures: [
      { id: "orm", kind: "orm-packed", resourcePath: "res://m/orm.png" },
      { id: "roughness", kind: "roughness", resourcePath: "res://m/rough.png" },
    ],
  });
  assert.equal(result.decision, "reject");
  assert.ok(result.blockers.includes("packed-orm-and-separate-orm-maps-are-both-authoritative"));
});

test("requires albedo alpha context when transparency is enabled", () => {
  const result = planGodotMaterialDelivery({
    materialId: "glass-like",
    transparencyMode: "alpha",
    textures: [{ id: "normal", kind: "normal-tangent", resourcePath: "res://glass/normal.png" }],
  });
  assert.equal(result.decision, "reject");
  assert.ok(result.blockers.includes("transparency-requires-albedo-alpha-or-an-explicit-custom-material-path"));
});
