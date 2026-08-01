import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  SPRITE_EFFECT_PACK_SCHEMA,
  compileSpriteEffectPack,
  listSpriteEffectDefinitions,
  renderSpriteEffectShader,
  validateCompiledSpriteShader,
  writeSpriteEffectPack,
} from "../dist/index.js";

const request = () => ({
  schema: SPRITE_EFFECT_PACK_SCHEMA,
  packId: "brass-brine-sprite-effects",
  project: {
    id: "brass-brine",
    title: "Brass & Brine",
    engine: "Godot",
    engineVersion: "4.6.2",
    renderer: "gl_compatibility",
  },
  effects: listSpriteEffectDefinitions().map((effect) => effect.id),
  targetRoot: ".",
});

test("all generated shaders pass the deterministic safety contract", () => {
  for (const definition of listSpriteEffectDefinitions()) {
    const source = renderSpriteEffectShader(definition.id);
    const report = validateCompiledSpriteShader(definition.id, source);
    assert.equal(report.passed, true, `${definition.id}: ${report.findings.join(", ")}`);
    assert.match(source, /^shader_type canvas_item;/u);
    assert.doesNotMatch(source, /\bTIME\b/u);
    assert.doesNotMatch(source, /hint_screen_texture|SCREEN_UV/iu);
    assert.match(source, /instance uniform vec4 source_uv_rect/u);
    if (definition.animated) assert.match(source, /instance uniform float effect_time/u);
    assert.match(source, /evavo_modulate = COLOR/u);
  }
});

test("compiler emits deterministic shader, material, catalog and receipt paths", () => {
  const first = compileSpriteEffectPack(request(), false);
  const second = compileSpriteEffectPack(request(), false);
  assert.equal(first.receipt.requestSha256, second.receipt.requestSha256);
  assert.deepEqual(first.receipt.exactOutputPaths, second.receipt.exactOutputPaths);
  assert.equal(first.receipt.effects.length, 6);
  assert.ok(first.receipt.effects.every((effect) => effect.validation.passed));
  assert.ok(first.receipt.exactOutputPaths.includes("assets/shaders/sprites/sprite_feedback.gdshader"));
  assert.ok(first.receipt.exactOutputPaths.includes("assets/materials/sprites/sprite_feedback.tres"));
  assert.ok(first.receipt.exactOutputPaths.includes("src/UI/SpriteEffectShaderParameters.cs"));
  const binder = first.files.get("src/UI/SpriteEffectShaderParameters.cs").toString("utf8");
  assert.match(binder, /SetInstanceShaderParameter/u);
  assert.match(binder, /SourceUvRectFromPixels/u);
  assert.doesNotMatch(binder, /gameplay state/i);
  const material = first.files.get("assets/materials/sprites/sprite_feedback.tres").toString("utf8");
  assert.match(material, /res:\/\/assets\/shaders\/sprites\/sprite_feedback\.gdshader/u);
});

test("writer publishes one atomic create-only pack", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evavo-sprite-effect-pack-"));
  const output = path.join(root, "prepared");
  try {
    const receipt = writeSpriteEffectPack(request(), output);
    assert.equal(receipt.mutationPerformed, true);
    assert.equal(fs.existsSync(path.join(output, "assets/shaders/sprites/sprite_dissolve.gdshader")), true);
    assert.throws(() => writeSpriteEffectPack(request(), output), /already exists/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validator rejects global TIME and screen texture shortcuts", () => {
  const unsafe = `shader_type canvas_item;\nrender_mode blend_mix, unshaded;\ninstance uniform vec4 source_uv_rect = vec4(0.0);\nvoid fragment(){ COLOR = texture(TEXTURE, UV + vec2(TIME)); }\n`;
  const report = validateCompiledSpriteShader("sprite_feedback", unsafe);
  assert.equal(report.passed, false);
  assert.ok(report.findings.includes("global-time-forbidden"));
  assert.ok(report.findings.some((finding) => finding.startsWith("uniform-missing:")));
});

test("request validation rejects unsupported Godot versions", () => {
  const invalid = request();
  invalid.project.engineVersion = "4.5";
  assert.throws(() => compileSpriteEffectPack(invalid), /Godot 4\.6\.2/i);
});


test("dissolve uses ordered source-pixel dithering instead of hash noise", () => {
  const source = renderSpriteEffectShader("sprite_dissolve");
  assert.match(source, /float bayer4\(/u);
  assert.match(source, /instance uniform float dither_phase/u);
  assert.doesNotMatch(source, /hash_pixel|noise_seed/u);
});

test("generated C# binder rejects non-finite clocks and scalar parameters", () => {
  const compiled = compileSpriteEffectPack(request(), false);
  const binder = compiled.files.get("src/UI/SpriteEffectShaderParameters.cs").toString("utf8");
  assert.match(binder, /double\.IsFinite\(pauseAwareSeconds\)/u);
  assert.match(binder, /float\.IsFinite\(value\)/u);
  assert.match(binder, /SetInstanceShaderParameter/u);
});
