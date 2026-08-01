import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { resolveSpriteEffectDefinition } from "./catalog.js";
import { renderSpriteEffectBinder } from "./binder.js";
import { renderSpriteEffectShader } from "./shaders.js";
import {
  validateCompiledSpriteShader,
  validateSpriteEffectPackRequest,
} from "./validation.js";
import {
  SPRITE_EFFECT_CATALOG_VERSION,
  SPRITE_EFFECT_COMPILER_VERSION,
  SPRITE_EFFECT_PACK_RECEIPT_SCHEMA,
  SpriteEffectError,
  type CompiledSpriteEffectPack,
  type SpriteEffectFileEvidence,
  type SpriteEffectPackReceipt,
} from "./types.js";

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

function join(root: string, suffix: string): string {
  return path.posix.join(root, suffix);
}

function materialSource(shaderPath: string): string {
  return `[gd_resource type="ShaderMaterial" load_steps=2 format=3]\n\n` +
    `[ext_resource type="Shader" path="res://${shaderPath}" id="1_shader"]\n\n` +
    `[resource]\nshader = ExtResource("1_shader")\n`;
}

export function compileSpriteEffectPack(
  input: unknown,
  mutationPerformed = false,
): CompiledSpriteEffectPack {
  const request = validateSpriteEffectPackRequest(input);
  const requestSha256 = sha256(Buffer.from(canonical(request)));
  const files = new Map<string, Buffer>();
  const effects: SpriteEffectPackReceipt["effects"] extends readonly (infer Effect)[]
    ? Effect[]
    : never = [];

  const definitions = [...request.effects]
    .sort()
    .map((effectId) => resolveSpriteEffectDefinition(effectId));

  for (const definition of definitions) {
    const effectId = definition.id;
    const shaderPath = join(
      request.targetRoot,
      `assets/shaders/sprites/${effectId}.gdshader`,
    );
    const materialPath = join(
      request.targetRoot,
      `assets/materials/sprites/${effectId}.tres`,
    );
    const shader = Buffer.from(renderSpriteEffectShader(effectId), "utf8");
    const report = validateCompiledSpriteShader(effectId, shader.toString("utf8"));
    if (!report.passed) {
      throw new SpriteEffectError(
        "SPRITE_EFFECT_SHADER_CONTRACT_FAILED",
        `${effectId} failed the static shader contract.`,
        { findings: report.findings },
      );
    }
    const material = Buffer.from(materialSource(shaderPath), "utf8");
    files.set(shaderPath, shader);
    files.set(materialPath, material);
    effects.push(
      Object.freeze({
        id: effectId,
        shaderPath,
        materialPath,
        shaderSha256: sha256(shader),
        materialSha256: sha256(material),
        uniforms: definition.uniforms,
        validation: Object.freeze({
          passed: true as const,
          textureSamples: report.textureSamples,
          findings: report.findings,
        }),
      }),
    );
  }

  const binderPath = join(request.targetRoot, request.binderPath);
  const binder = Buffer.from(
    renderSpriteEffectBinder(request, definitions),
    "utf8",
  );
  files.set(binderPath, binder);

  const catalogPath = join(
    request.targetRoot,
    "data/effects/sprite_effect_catalog.json",
  );
  const receiptPath = join(
    request.targetRoot,
    `docs/asset-imports/${request.packId}.sprite-effects.json`,
  );
  const catalog = Buffer.from(
    `${JSON.stringify(
      {
        schema: "evavo.godot-sprite-effect-catalog.v1",
        catalogVersion: SPRITE_EFFECT_CATALOG_VERSION,
        project: request.project,
        effects: effects.map((effect) => ({
          ...effect,
          definition: resolveSpriteEffectDefinition(effect.id),
        })),
        runtime: {
          timeOwner: "game-owned effect_time instance uniform",
          atlasOwner: "source_uv_rect instance uniform",
          coreScreenTextureEffects: false,
          materialSharing: true,
          perInstanceState: true,
          binderPath,
          csharpNamespace: request.csharpNamespace,
          binderClassName: request.binderClassName,
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  files.set(catalogPath, catalog);

  const evidenceWithoutReceipt = [...files.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([filePath, bytes]): SpriteEffectFileEvidence =>
      Object.freeze({
        path: filePath,
        bytes: bytes.byteLength,
        sha256: sha256(bytes),
        kind: filePath.endsWith(".gdshader")
          ? "shader"
          : filePath.endsWith(".tres")
            ? "material"
            : filePath.endsWith(".cs")
              ? "binder"
              : "catalog",
      }),
    );
  const receiptBase = {
    schema: SPRITE_EFFECT_PACK_RECEIPT_SCHEMA,
    compilerVersion: SPRITE_EFFECT_COMPILER_VERSION,
    catalogVersion: SPRITE_EFFECT_CATALOG_VERSION,
    packId: request.packId,
    requestSha256,
    project: request.project,
    effects: Object.freeze(effects),
    files: Object.freeze(evidenceWithoutReceipt),
    exactOutputPaths: Object.freeze(
      [...files.keys(), receiptPath].sort(),
    ),
    mutationPerformed,
    validationBoundary:
      "Static deterministic contract passed. Native Godot 4.6.2 shader compilation and renderer capture remain required before production approval.",
  } as const;
  const receiptBytes = Buffer.from(`${JSON.stringify(receiptBase, null, 2)}\n`, "utf8");
  files.set(receiptPath, receiptBytes);
  const receipt: SpriteEffectPackReceipt = Object.freeze({
    ...receiptBase,
    files: Object.freeze([
      ...evidenceWithoutReceipt,
      Object.freeze({
        path: receiptPath,
        bytes: receiptBytes.byteLength,
        sha256: sha256(receiptBytes),
        kind: "receipt" as const,
      }),
    ]),
  });
  return Object.freeze({ files, receipt });
}

export function writeSpriteEffectPack(
  input: unknown,
  outputRoot: string,
): SpriteEffectPackReceipt {
  const target = path.resolve(outputRoot);
  if (fs.lstatSync(target, { throwIfNoEntry: false })) {
    throw new SpriteEffectError(
      "SPRITE_EFFECT_OUTPUT_EXISTS",
      `Output root already exists: ${target}.`,
    );
  }
  const parent = path.dirname(target);
  fs.mkdirSync(parent, { recursive: true });
  const staging = fs.mkdtempSync(
    path.join(parent, `.evavo-sprite-effects-${randomUUID()}-`),
  );
  try {
    const compiled = compileSpriteEffectPack(input, true);
    for (const [relative, bytes] of compiled.files) {
      const destination = path.join(staging, ...relative.split("/"));
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, bytes, { flag: "wx" });
    }
    fs.renameSync(staging, target);
    return compiled.receipt;
  } catch (error: unknown) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}
