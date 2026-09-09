import assert from "node:assert/strict";
import test from "node:test";

import { planGodotMaterialDelivery, renderGodotMaterialTres } from "../dist/index.js";

test("renders a current format=3 StandardMaterial3D TRES from a ready plan", () => {
  const plan = planGodotMaterialDelivery({
    materialId: "brick-wall",
    transparencyMode: "alpha-scissor",
    albedoAlphaCarriesOpacity: true,
    textures: [
      { id: "albedo", kind: "base-color", resourcePath: "res://materials/brick/albedo.png" },
      { id: "normal", kind: "normal-tangent", resourcePath: "res://materials/brick/normal.png" },
      { id: "roughness", kind: "roughness", resourcePath: "res://materials/brick/roughness.png" },
      { id: "metallic", kind: "metallic", resourcePath: "res://materials/brick/metallic.png" },
    ],
  });
  assert.equal(plan.decision, "ready");

  const rendered = renderGodotMaterialTres(plan);
  assert.match(rendered.text, /^\[gd_resource type="StandardMaterial3D" format=3\]/);
  assert.doesNotMatch(rendered.text, /load_steps=/);
  assert.match(rendered.text, /\[ext_resource type="Texture2D" path="res:\/\/materials\/brick\/albedo\.png" id="1_albedo"\]/);
  assert.match(rendered.text, /albedo_texture = ExtResource\("1_albedo"\)/);
  assert.match(rendered.text, /metallic = 1/);
  assert.match(rendered.text, /transparency = 2/);
  assert.match(rendered.text, /alpha_scissor_threshold = 0\.5/);
  assert.equal(rendered.evidence.format, 3);
  assert.equal(rendered.evidence.externalResourceCount, 4);
});

test("renders an ORMMaterial3D resource with one packed PBR texture", () => {
  const plan = planGodotMaterialDelivery({
    materialId: "metal-panel",
    textures: [
      { id: "albedo", kind: "base-color", resourcePath: "res://metal/albedo.png" },
      { id: "orm", kind: "orm-packed", resourcePath: "res://metal/orm.png" },
    ],
  });
  const rendered = renderGodotMaterialTres(plan);
  assert.match(rendered.text, /^\[gd_resource type="ORMMaterial3D" format=3\]/);
  assert.match(rendered.text, /orm_texture = ExtResource\("2_orm"\)/);
  assert.match(rendered.text, /ao_enabled = true/);
  assert.match(rendered.text, /roughness = 1/);
  assert.match(rendered.text, /metallic = 1/);
});

test("refuses to materialize a plan that still requires preprocessing", () => {
  const plan = planGodotMaterialDelivery({
    materialId: "leaf",
    textures: [
      { id: "albedo", kind: "base-color", resourcePath: "res://leaf/albedo.png" },
      { id: "opacity", kind: "opacity", resourcePath: "res://leaf/opacity.png" },
    ],
  });
  assert.equal(plan.decision, "needs-preprocess");
  assert.throws(() => renderGodotMaterialTres(plan), /must be ready/);
});

test("requires res paths for texture references in a TRES", () => {
  const plan = planGodotMaterialDelivery({
    materialId: "external",
    textures: [{ id: "albedo", kind: "base-color", resourcePath: "C:/outside/albedo.png" }],
  });
  assert.equal(plan.decision, "ready");
  assert.throws(() => renderGodotMaterialTres(plan), /requires a res:\/\/ Texture2D path/);
});
