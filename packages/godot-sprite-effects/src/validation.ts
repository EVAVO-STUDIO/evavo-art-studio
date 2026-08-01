import path from "node:path";

import {
  isSpriteEffectId,
  resolveSpriteEffectDefinition,
} from "./catalog.js";
import {
  SPRITE_EFFECT_PACK_SCHEMA,
  SpriteEffectError,
  type SpriteEffectId,
  type SpriteEffectPackRequest,
} from "./types.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const NAMESPACE = /^[A-Za-z_][A-Za-z0-9_.]{0,255}$/u;
const CLASS_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/u;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SpriteEffectError(
      "SPRITE_EFFECT_OBJECT_REQUIRED",
      `${label} must be an object.`,
    );
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, maximum = 1024): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    value !== value.trim() ||
    /[\0\r\n]/u.test(value)
  ) {
    throw new SpriteEffectError(
      "SPRITE_EFFECT_TEXT_INVALID",
      `${label} is missing or invalid.`,
    );
  }
  return value;
}

function portableRoot(value: unknown): string {
  const candidate = text(value, "targetRoot", 512);
  if (candidate === ".") return candidate;
  if (
    candidate.includes("\\") ||
    candidate !== candidate.normalize("NFC") ||
    path.posix.isAbsolute(candidate)
  ) {
    throw new SpriteEffectError(
      "SPRITE_EFFECT_TARGET_ROOT_INVALID",
      "targetRoot must be . or a portable NFC relative directory.",
    );
  }
  const normalized = path.posix.normalize(candidate).replace(/^\.\//u, "");
  if (
    normalized !== candidate ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new SpriteEffectError(
      "SPRITE_EFFECT_TARGET_ROOT_INVALID",
      "targetRoot escapes or is not canonical.",
    );
  }
  return candidate;
}

function optionalPortablePath(
  value: unknown,
  label: string,
  fallback: string,
  extension: string,
): string {
  const candidate = value === undefined ? fallback : text(value, label, 1024);
  if (
    candidate.includes("\\") ||
    candidate !== candidate.normalize("NFC") ||
    path.posix.isAbsolute(candidate)
  ) {
    throw new SpriteEffectError(
      "SPRITE_EFFECT_PATH_INVALID",
      `${label} must be a portable NFC relative path.`,
    );
  }
  const normalized = path.posix.normalize(candidate);
  if (
    normalized !== candidate ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    !normalized.toLowerCase().endsWith(extension)
  ) {
    throw new SpriteEffectError(
      "SPRITE_EFFECT_PATH_INVALID",
      `${label} must be canonical and end with ${extension}.`,
    );
  }
  return candidate;
}

export function validateSpriteEffectPackRequest(
  value: unknown,
): SpriteEffectPackRequest {
  const input = object(value, "Sprite effect pack request");
  if (input.schema !== SPRITE_EFFECT_PACK_SCHEMA) {
    throw new SpriteEffectError(
      "SPRITE_EFFECT_SCHEMA_INVALID",
      `Request must use ${SPRITE_EFFECT_PACK_SCHEMA}.`,
    );
  }
  const packId = text(input.packId, "packId", 128);
  if (!IDENTIFIER.test(packId)) {
    throw new SpriteEffectError(
      "SPRITE_EFFECT_PACK_ID_INVALID",
      `packId must match ${IDENTIFIER.source}.`,
    );
  }
  const project = object(input.project, "project");
  if (
    project.engine !== "Godot" ||
    project.engineVersion !== "4.6.2" ||
    !["gl_compatibility", "mobile", "forward_plus"].includes(
      String(project.renderer),
    )
  ) {
    throw new SpriteEffectError(
      "SPRITE_EFFECT_PROJECT_INVALID",
      "Sprite effect packages target Godot 4.6.2 and a declared supported renderer.",
    );
  }
  if (!Array.isArray(input.effects) || input.effects.length < 1) {
    throw new SpriteEffectError(
      "SPRITE_EFFECT_EFFECTS_REQUIRED",
      "effects must contain at least one effect ID.",
    );
  }
  const effects: SpriteEffectId[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of input.effects.entries()) {
    const effect = text(raw, `effects[${index}]`, 128);
    if (!isSpriteEffectId(effect)) {
      throw new SpriteEffectError(
        "SPRITE_EFFECT_ID_UNKNOWN",
        `Unknown sprite effect ID: ${effect}.`,
      );
    }
    if (seen.has(effect)) {
      throw new SpriteEffectError(
        "SPRITE_EFFECT_ID_DUPLICATE",
        `Duplicate sprite effect ID: ${effect}.`,
      );
    }
    seen.add(effect);
    effects.push(effect);
  }
  const csharpNamespace =
    input.csharpNamespace === undefined
      ? "Evavo.Art.SpriteEffects"
      : text(input.csharpNamespace, "csharpNamespace", 256);
  const binderClassName =
    input.binderClassName === undefined
      ? "SpriteEffectShaderParameters"
      : text(input.binderClassName, "binderClassName", 128);
  if (!NAMESPACE.test(csharpNamespace) || !CLASS_NAME.test(binderClassName)) {
    throw new SpriteEffectError(
      "SPRITE_EFFECT_CSHARP_IDENTITY_INVALID",
      "csharpNamespace or binderClassName is invalid.",
    );
  }
  const binderPath = optionalPortablePath(
    input.binderPath,
    "binderPath",
    "src/UI/SpriteEffectShaderParameters.cs",
    ".cs",
  );
  return Object.freeze({
    schema: SPRITE_EFFECT_PACK_SCHEMA,
    packId,
    project: Object.freeze({
      id: text(project.id, "project.id", 128),
      title: text(project.title, "project.title", 512),
      engine: "Godot",
      engineVersion: "4.6.2",
      renderer: project.renderer as SpriteEffectPackRequest["project"]["renderer"],
    }),
    effects: Object.freeze(effects),
    targetRoot: portableRoot(input.targetRoot),
    csharpNamespace,
    binderClassName,
    binderPath,
  });
}

export interface CompiledSpriteShaderValidation {
  readonly passed: boolean;
  readonly findings: readonly string[];
  readonly textureSamples: number;
}

export function validateCompiledSpriteShader(
  effectId: SpriteEffectId,
  source: string,
): CompiledSpriteShaderValidation {
  const definition = resolveSpriteEffectDefinition(effectId);
  const findings: string[] = [];
  if (!/^shader_type canvas_item;/u.test(source)) {
    findings.push("canvas-item-shader-required");
  }
  if (!source.includes(`render_mode ${definition.blendMode}, unshaded;`)) {
    findings.push(`render-mode-mismatch:${definition.blendMode}`);
  }
  if (/\bTIME\b/u.test(source)) findings.push("global-time-forbidden");
  if (/hint_screen_texture|SCREEN_TEXTURE|SCREEN_UV/iu.test(source)) {
    findings.push("screen-texture-forbidden");
  }
  if (/\bfor\s*\(|\bwhile\s*\(|\bdo\s*\{/u.test(source)) {
    findings.push("dynamic-loop-forbidden");
  }
  if (/\bdiscard\b/u.test(source)) findings.push("discard-forbidden");
  if (/textureLod|textureGrad|texelFetch/iu.test(source)) {
    findings.push("advanced-texture-sampling-forbidden");
  }
  if (/\buniform\s+sampler2D\b/u.test(source)) {
    findings.push("external-sampler-forbidden");
  }
  if (!source.includes("instance uniform vec4 source_uv_rect")) {
    findings.push("source-uv-rect-missing");
  }
  if (
    !source.includes("clamp_source_uv") ||
    !source.includes("sample_source") ||
    !source.includes("lessThan(uv, minimum_uv)") ||
    !source.includes("greaterThan(uv, maximum_uv)")
  ) {
    findings.push("atlas-clamp-contract-missing");
  }
  if (definition.animated && !source.includes("instance uniform float effect_time")) {
    findings.push("effect-time-missing");
  }
  if (!source.includes("varying vec4 evavo_modulate") ||
      !source.includes("evavo_modulate = COLOR")) {
    findings.push("canvas-modulate-preservation-missing");
  }
  if (definition.usesVertexStage && !source.includes("void vertex()")) {
    findings.push("vertex-stage-missing");
  }
  for (const uniform of definition.uniforms) {
    const declaration = `${uniform.scope === "instance" ? "instance " : ""}uniform ${uniform.type} ${uniform.name}`;
    if (!source.includes(declaration)) {
      findings.push(`uniform-missing:${uniform.name}`);
    }
  }
  const textureSamples = Math.max(0, [...source.matchAll(/\bsample_source\s*\(/gu)].length - 1);
  const maximum = definition.id === "sprite_feedback" ? 9 :
    definition.id === "sprite_ghost" ? 2 : 1;
  if (textureSamples > maximum) {
    findings.push(`texture-sample-budget:${textureSamples}>${maximum}`);
  }
  if (definition.usesNeighbourSampling && !source.includes("TEXTURE_PIXEL_SIZE")) {
    findings.push("pixel-size-contract-missing");
  }
  return Object.freeze({
    passed: findings.length === 0,
    findings: Object.freeze(findings),
    textureSamples,
  });
}
