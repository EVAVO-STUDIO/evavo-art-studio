#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import {
  composeRasterLayers,
  createRasterEffectLayer,
} from "../packages/media/dist/index.js";
import {
  assertAllowedLocalPath,
  configuredLocalRootCount,
} from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-raster-compositing";
const SERVER_VERSION = "1.1.0";
const PROTOCOL_VERSION = "2025-03-26";
const MAX_LAYERS = 256;
const ALLOWED_ROOTS_ENV = "EVAVO_RASTER_COMPOSE_ALLOWED_ROOTS";

const assertAllowed = (filePath, { output = false } = {}) =>
  assertAllowedLocalPath(filePath, {
    envName: ALLOWED_ROOTS_ENV,
    output,
    label: "raster compositing",
  });

async function materializeSpec(spec) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec) || !Array.isArray(spec.layers)) {
    throw new Error("spec.layers is required.");
  }
  if (spec.layers.length > MAX_LAYERS) {
    throw new Error(`Raster compositing supports at most ${MAX_LAYERS} layers per job.`);
  }
  if (spec.canvas !== undefined) {
    if (!spec.canvas || typeof spec.canvas !== "object" || Array.isArray(spec.canvas)) {
      throw new Error("spec.canvas must be an object when provided.");
    }
    if (!Number.isInteger(spec.canvas.width) || !Number.isInteger(spec.canvas.height)) {
      throw new Error("spec.canvas requires integer width and height.");
    }
  }

  const layers = [];
  for (let index = 0; index < spec.layers.length; index += 1) {
    const layer = spec.layers[index];
    if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
      throw new Error(`layers[${index}] must be an object.`);
    }
    if (typeof layer.inputPath !== "string" || !layer.inputPath) {
      throw new Error(`layers[${index}].inputPath is required.`);
    }
    const inputPath = await assertAllowed(layer.inputPath);
    const prepared = {
      ...layer,
      input: await readFile(inputPath),
    };
    delete prepared.inputPath;

    if (layer.maskPath !== undefined) {
      if (typeof layer.maskPath !== "string" || !layer.maskPath) {
        throw new Error(`layers[${index}].maskPath must be a non-empty string.`);
      }
      prepared.mask = await readFile(await assertAllowed(layer.maskPath));
      delete prepared.maskPath;
    }
    layers.push(prepared);
  }

  return { ...spec, layers };
}

function requireWriteAdmission(args) {
  if (process.env.EVAVO_RASTER_COMPOSE_ALLOW_WRITES !== "true") {
    throw new Error("Raster compositing writes are disabled. Set EVAVO_RASTER_COMPOSE_ALLOW_WRITES=true.");
  }
  if (args.confirmLocalWrite !== true) {
    throw new Error("confirmLocalWrite=true is required for this exact call.");
  }
  if (typeof args.outputPath !== "string" || !args.outputPath) {
    throw new Error("outputPath is required.");
  }
}

async function compose(args) {
  requireWriteAdmission(args);

  const outputPath = await assertAllowed(args.outputPath, { output: true });
  const base =
    typeof args.basePath === "string" && args.basePath
      ? await readFile(await assertAllowed(args.basePath))
      : null;
  const spec = await materializeSpec(args.spec);
  const result = await composeRasterLayers(base, spec);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.buffer);

  return Object.freeze({
    ok: true,
    outputPath,
    basePath: typeof args.basePath === "string" ? path.resolve(args.basePath) : null,
    layerCount: spec.layers.length,
    evidence: result.evidence,
    bytesReturned: false,
  });
}

async function createEffect(args) {
  requireWriteAdmission(args);
  if (typeof args.inputPath !== "string" || !args.inputPath) {
    throw new Error("inputPath is required.");
  }
  if (!args.spec || typeof args.spec !== "object" || Array.isArray(args.spec)) {
    throw new Error("spec is required.");
  }

  const inputPath = await assertAllowed(args.inputPath);
  const outputPath = await assertAllowed(args.outputPath, { output: true });
  const result = await createRasterEffectLayer(await readFile(inputPath), args.spec);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.buffer);

  return Object.freeze({
    ok: true,
    inputPath,
    outputPath,
    evidence: result.evidence,
    bytesReturned: false,
  });
}

const effectSchema = Object.freeze({
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
  required: ["kind"],
  additionalProperties: false,
});

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_raster_compositing_capabilities",
    description: "Describe the local ordered-layer raster compositing and effect-layer contract without reading or writing image bytes.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_compose_raster_layers",
    description: "Compose local raster layers with resize, rotation, external masks, opacity, blend modes, exact coordinates or gravity, and PNG/WebP/AVIF/JPEG output. Writes are local-only and return an evidence receipt rather than image bytes.",
    inputSchema: {
      type: "object",
      properties: {
        basePath: { type: "string", minLength: 1 },
        outputPath: { type: "string", minLength: 1 },
        spec: {
          type: "object",
          properties: {
            canvas: {
              type: "object",
              properties: {
                width: { type: "integer", minimum: 1, maximum: 32768 },
                height: { type: "integer", minimum: 1, maximum: 32768 },
                background: { type: "string", minLength: 1 },
              },
              required: ["width", "height"],
              additionalProperties: false,
            },
            baseFit: { type: "string" },
            basePosition: { type: "string" },
            layers: {
              type: "array",
              maxItems: MAX_LAYERS,
              items: {
                type: "object",
                properties: {
                  inputPath: { type: "string", minLength: 1 },
                  maskPath: { type: "string", minLength: 1 },
                  name: { type: "string" },
                  opacity: { type: "number", minimum: 0, maximum: 1 },
                  blend: { type: "string" },
                  left: { type: "integer", minimum: 0, maximum: 32768 },
                  top: { type: "integer", minimum: 0, maximum: 32768 },
                  gravity: { type: "string" },
                  rotate: { type: "number", minimum: -3600, maximum: 3600 },
                  resize: {
                    type: "object",
                    properties: {
                      width: { type: "integer", minimum: 1, maximum: 32768 },
                      height: { type: "integer", minimum: 1, maximum: 32768 },
                      fit: { type: "string" },
                      position: { type: "string" },
                      withoutEnlargement: { type: "boolean" },
                    },
                    additionalProperties: false,
                  },
                },
                required: ["inputPath"],
                additionalProperties: false,
              },
            },
            format: { type: "string", enum: ["png", "webp", "avif", "jpeg"] },
            quality: { type: "number", minimum: 1, maximum: 100 },
          },
          required: ["layers"],
          additionalProperties: false,
        },
        confirmLocalWrite: { type: "boolean", const: true },
      },
      required: ["outputPath", "spec", "confirmLocalWrite"],
      additionalProperties: false,
    },
  }),
  Object.freeze({
    name: "evavo_create_raster_effect_layer",
    description: "Create a separate transparent drop-shadow or outer-glow PNG layer from an existing raster alpha channel. The receipt includes subject anchor coordinates so the effect can be aligned behind the subject during composition.",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: { type: "string", minLength: 1 },
        outputPath: { type: "string", minLength: 1 },
        spec: effectSchema,
        confirmLocalWrite: { type: "boolean", const: true },
      },
      required: ["inputPath", "outputPath", "spec", "confirmLocalWrite"],
      additionalProperties: false,
    },
  }),
]);

async function callTool(name, args) {
  if (name === "evavo_raster_compositing_capabilities") {
    return Object.freeze({
      contract: "evavo_raster_compositing_v1",
      maxLayers: MAX_LAYERS,
      operations: [
        "ordered-layers",
        "resize",
        "rotate",
        "alpha-mask",
        "opacity",
        "blend-mode",
        "left-top-placement",
        "gravity-placement",
        "canvas-bounds-validation",
        "transparent-canvas",
        "fit-base-to-canvas",
        "drop-shadow-effect-layer",
        "outer-glow-effect-layer",
        "png",
        "webp",
        "avif",
        "jpeg",
      ],
      masks: "provider-agnostic; pass local mattes from segmentation, Cloudinary, ComfyUI or another approved source",
      effects: "shadow and glow are separate transparent layers with subject-anchor evidence; compose them behind the source rather than mutating source pixels",
      pathPolicy: "input and prospective output paths are canonicalized through existing ancestors so symlink escapes fail closed",
      writesEnabled: process.env.EVAVO_RASTER_COMPOSE_ALLOW_WRITES === "true",
      allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
      bytesReturned: false,
    });
  }
  if (name === "evavo_compose_raster_layers") return compose(args ?? {});
  if (name === "evavo_create_raster_effect_layer") return createEffect(args ?? {});
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
  if (request?.jsonrpc !== "2.0") return { jsonrpc: "2.0", id: request?.id ?? null, error: { code: -32600, message: "Invalid Request" } };
  if (request.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions: "Raster compositing and effect layers are local-first. Writes require a canonical allowed root, the write environment gate and exact per-call confirmation.",
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
          {
            code: "RASTER_COMPOSE_FAILED",
            message: error instanceof Error ? error.message : String(error),
          },
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
