#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import {
  createRasterEffectLayer,
  getRasterEffectPreset,
  RASTER_EFFECT_PRESETS,
} from "../packages/media/dist/index.js";
import {
  SPRITE_EFFECT_PACK_SCHEMA,
  compileSpriteEffectPack,
  describeSpriteEffectAgentCatalog,
  listSpriteEffectAgentIntents,
  planSpriteEffectForAgent,
  writeSpriteEffectPack,
} from "../packages/godot-sprite-effects/dist/index.js";
import {
  assertAllowedLocalPath,
  configuredLocalRootCount,
} from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-image-effects";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_IMAGE_EFFECTS_ALLOWED_ROOTS";
const WRITE_ENV = "EVAVO_IMAGE_EFFECTS_ALLOW_WRITES";

const INTENTS = Object.freeze([
  "selection-outline",
  "hover-emphasis",
  "damage-flash",
  "fade-or-dissolve",
  "memory-apparition",
  "ambient-sway",
  "engraved-treatment",
  "spark-or-glint",
]);
const STRENGTHS = Object.freeze(["subtle", "standard", "strong"]);
const BUDGETS = Object.freeze(["cheap-only", "allow-moderate"]);
const EFFECT_IDS = Object.freeze([
  "sprite_feedback",
  "sprite_dissolve",
  "sprite_ghost",
  "sprite_sway",
  "sprite_engraved_ink",
  "sprite_additive_pulse",
]);
const RENDERERS = Object.freeze(["gl_compatibility", "mobile", "forward_plus"]);
const RASTER_PRESETS = Object.freeze(Object.keys(RASTER_EFFECT_PRESETS));

const assertAllowed = (filePath, { output = false } = {}) =>
  assertAllowedLocalPath(filePath, {
    envName: ALLOWED_ROOTS_ENV,
    output,
    label: "image effects",
  });

function requireWriteAdmission(args) {
  if (process.env[WRITE_ENV] !== "true") {
    throw new Error(`Image effects writes are disabled. Set ${WRITE_ENV}=true.`);
  }
  if (args.confirmLocalWrite !== true) {
    throw new Error("confirmLocalWrite=true is required for this exact effects call.");
  }
}

function identity(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

async function createOnly(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, { flag: "wx" });
}

async function assertMissing(filePath) {
  try {
    await access(filePath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Create-only image effects target already exists: ${filePath}`);
}

function packRequest(args) {
  const effects = Array.isArray(args.effects) && args.effects.length ? args.effects : EFFECT_IDS;
  return {
    schema: SPRITE_EFFECT_PACK_SCHEMA,
    packId: args.packId,
    project: {
      id: args.projectId,
      title: args.projectTitle,
      engine: "Godot",
      engineVersion: "4.6.2",
      renderer: args.renderer,
    },
    effects,
    targetRoot: typeof args.targetRoot === "string" ? args.targetRoot : ".",
    ...(typeof args.csharpNamespace === "string" ? { csharpNamespace: args.csharpNamespace } : {}),
    ...(typeof args.binderClassName === "string" ? { binderClassName: args.binderClassName } : {}),
    ...(typeof args.binderPath === "string" ? { binderPath: args.binderPath } : {}),
  };
}

async function planEffect(args) {
  return Object.freeze({
    ok: true,
    plan: planSpriteEffectForAgent({
      intent: args.intent,
      role: args.role,
      ...(typeof args.strength === "string" ? { strength: args.strength } : {}),
      ...(typeof args.performanceBudget === "string" ? { performanceBudget: args.performanceBudget } : {}),
    }),
    sourceModified: false,
  });
}

async function compilePack(args) {
  const compiled = compileSpriteEffectPack(packRequest(args), false);
  return Object.freeze({
    ok: true,
    receipt: compiled.receipt,
    fileCount: compiled.files.size,
    mutationPerformed: false,
    bytesReturned: false,
  });
}

async function writePack(args) {
  requireWriteAdmission(args);
  if (typeof args.outputRoot !== "string") throw new Error("outputRoot is required.");
  const outputRoot = await assertAllowed(args.outputRoot, { output: true });
  await assertMissing(outputRoot);
  const receipt = writeSpriteEffectPack(packRequest(args), outputRoot);
  return Object.freeze({
    ok: true,
    outputRoot,
    receipt,
    approvalState: "unapproved-native-renderer-validation-required",
    sourceModified: false,
  });
}

function rasterSpec(args) {
  const overrides = args.spec && typeof args.spec === "object" && !Array.isArray(args.spec)
    ? args.spec
    : {};
  if (typeof args.preset === "string") return getRasterEffectPreset(args.preset, overrides);
  return overrides;
}

async function createRasterEffect(args) {
  requireWriteAdmission(args);
  if (typeof args.inputPath !== "string" || typeof args.outputPath !== "string") {
    throw new Error("inputPath and outputPath are required.");
  }
  if (typeof args.preset !== "string" && (!args.spec || typeof args.spec.kind !== "string")) {
    throw new Error("Provide a governed preset or an explicit raster effect spec with kind.");
  }
  const inputPath = await assertAllowed(args.inputPath);
  const outputPath = await assertAllowed(args.outputPath, { output: true });
  const receiptPath = await assertAllowed(
    typeof args.receiptPath === "string" ? args.receiptPath : `${outputPath}.receipt.json`,
    { output: true },
  );
  if (identity(inputPath) === identity(outputPath) || identity(inputPath) === identity(receiptPath)) {
    throw new Error("Raster effects are non-destructive: output and receipt paths must differ from the source.");
  }
  if (identity(outputPath) === identity(receiptPath)) throw new Error("Effect output and receipt paths must be distinct.");
  await assertMissing(outputPath);
  await assertMissing(receiptPath);

  const result = await createRasterEffectLayer(await readFile(inputPath), rasterSpec(args));
  const receipt = Object.freeze({
    schemaVersion: "1.0",
    operation: "evavo-raster-effect-layer",
    approvalState: "unapproved",
    inputPath,
    outputPath,
    receiptPath,
    preset: typeof args.preset === "string" ? args.preset : null,
    evidence: result.evidence,
    compositing: {
      subjectAnchorLeft: result.evidence.subjectAnchorLeft,
      subjectAnchorTop: result.evidence.subjectAnchorTop,
      instruction: "Keep this layer separate and composite it behind/around the source using the reported subject anchor unless a reviewed delivery explicitly bakes it.",
    },
    sourceModified: false,
  });
  await createOnly(outputPath, result.buffer);
  await createOnly(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return Object.freeze({
    ok: true,
    outputPath,
    receiptPath,
    evidence: result.evidence,
    approvalState: "unapproved",
    bytesReturned: false,
    sourceModified: false,
  });
}

const packProperties = Object.freeze({
  packId: { type: "string", minLength: 1, maxLength: 128 },
  projectId: { type: "string", minLength: 1, maxLength: 128 },
  projectTitle: { type: "string", minLength: 1, maxLength: 512 },
  renderer: { type: "string", enum: RENDERERS },
  effects: {
    type: "array",
    minItems: 1,
    uniqueItems: true,
    items: { type: "string", enum: EFFECT_IDS },
  },
  targetRoot: { type: "string", minLength: 1 },
  csharpNamespace: { type: "string", minLength: 1 },
  binderClassName: { type: "string", minLength: 1 },
  binderPath: { type: "string", minLength: 1 },
});

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_image_effects_capabilities",
    description: "Describe governed offline raster effects and Godot 4.6.2 runtime sprite shaders, including agent intents and granular per-instance controls.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_plan_godot_sprite_effect",
    description: "Map an interaction/animation intent to a reviewed Godot sprite shader with concrete per-instance binder values, compatibility warnings and renderer-approval requirements.",
    inputSchema: {
      type: "object",
      properties: {
        intent: { type: "string", enum: INTENTS },
        role: { type: "string", minLength: 1, maxLength: 128 },
        strength: { type: "string", enum: STRENGTHS },
        performanceBudget: { type: "string", enum: BUDGETS },
      },
      required: ["intent", "role"],
      additionalProperties: false,
    },
  }),
  Object.freeze({
    name: "evavo_compile_godot_sprite_effect_pack",
    description: "Compile and statically validate a deterministic Godot 4.6.2 sprite shader pack entirely in memory. Returns receipt/output paths but writes no files.",
    inputSchema: {
      type: "object",
      properties: packProperties,
      required: ["packId", "projectId", "projectTitle", "renderer"],
      additionalProperties: false,
    },
  }),
  Object.freeze({
    name: "evavo_write_godot_sprite_effect_pack",
    description: "Write one create-only validated Godot sprite shader/material/binder/catalog pack beneath an allowed local root. Native Godot renderer validation remains required.",
    inputSchema: {
      type: "object",
      properties: {
        ...packProperties,
        outputRoot: { type: "string", minLength: 1 },
        confirmLocalWrite: { type: "boolean", const: true },
      },
      required: ["packId", "projectId", "projectTitle", "renderer", "outputRoot", "confirmLocalWrite"],
      additionalProperties: false,
    },
  }),
  Object.freeze({
    name: "evavo_create_raster_effect_layer",
    description: "Create a separate transparent drop-shadow or outer-glow layer from a local image, using a governed preset or bounded explicit spec. The source image is not modified.",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: { type: "string", minLength: 1 },
        outputPath: { type: "string", minLength: 1 },
        receiptPath: { type: "string", minLength: 1 },
        preset: { type: "string", enum: RASTER_PRESETS },
        spec: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["drop-shadow", "outer-glow"] },
            color: { type: "string", minLength: 1 },
            opacity: { type: "number", minimum: 0, maximum: 1 },
            blurSigma: { type: "number", minimum: 0, maximum: 100 },
            spread: { type: "integer", minimum: 0, maximum: 256 },
            offsetX: { type: "integer", minimum: -4096, maximum: 4096 },
            offsetY: { type: "integer", minimum: -4096, maximum: 4096 },
            padding: { type: "integer", minimum: 0, maximum: 8192 },
          },
          additionalProperties: false,
        },
        confirmLocalWrite: { type: "boolean", const: true },
      },
      required: ["inputPath", "outputPath", "confirmLocalWrite"],
      additionalProperties: false,
    },
  }),
]);

async function callTool(name, args) {
  if (name === "evavo_image_effects_capabilities") {
    return Object.freeze({
      contract: "evavo_image_effects_agent_v1",
      runtime: {
        engine: "Godot",
        engineVersion: "4.6.2",
        renderers: RENDERERS,
        intents: listSpriteEffectAgentIntents(),
        catalog: describeSpriteEffectAgentCatalog(),
        materialState: "per-instance controls through generated C# binder",
        animationClock: "game-owned pause-aware effect_time",
        atlasSafety: "source_uv_rect plus static shader validation",
        nativeRendererApprovalRequired: true,
      },
      raster: {
        kinds: ["drop-shadow", "outer-glow"],
        presets: RASTER_PRESETS,
        output: "separate transparent effect layer with explicit subject anchor",
      },
      writesEnabled: process.env[WRITE_ENV] === "true",
      allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
      sourceMutationAllowed: false,
      bytesReturned: false,
    });
  }
  if (name === "evavo_plan_godot_sprite_effect") return planEffect(args ?? {});
  if (name === "evavo_compile_godot_sprite_effect_pack") return compilePack(args ?? {});
  if (name === "evavo_write_godot_sprite_effect_pack") return writePack(args ?? {});
  if (name === "evavo_create_raster_effect_layer") return createRasterEffect(args ?? {});
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}

function result(value, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError,
  };
}

async function dispatch(request) {
  if (request?.jsonrpc !== "2.0") {
    return { jsonrpc: "2.0", id: request?.id ?? null, error: { code: -32600, message: "Invalid Request" } };
  }
  if (request.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions: `Image effects are non-destructive. Configure ${ALLOWED_ROOTS_ENV}; writes additionally require ${WRITE_ENV}=true and confirmLocalWrite=true. Runtime shaders require native Godot 4.6.2 renderer approval.`,
      },
    };
  }
  if (request.method === "ping") return { jsonrpc: "2.0", id: request.id, result: {} };
  if (request.method === "tools/list") return { jsonrpc: "2.0", id: request.id, result: { tools } };
  if (request.method === "tools/call") {
    try {
      return { jsonrpc: "2.0", id: request.id, result: result(await callTool(request.params?.name, request.params?.arguments)) };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: result(
          { code: "IMAGE_EFFECTS_FAILED", message: error instanceof Error ? error.message : String(error) },
          true,
        ),
      };
    }
  }
  if (request.method?.startsWith("notifications/")) return null;
  return { jsonrpc: "2.0", id: request.id ?? null, error: { code: -32601, message: "Method not found" } };
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
let chain = Promise.resolve();
input.on("line", (line) => {
  if (!line.trim()) return;
  chain = chain.then(async () => {
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
      return;
    }
    const response = await dispatch(request);
    if (response !== null) process.stdout.write(`${JSON.stringify(response)}\n`);
  });
});
