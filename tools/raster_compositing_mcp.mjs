#!/usr/bin/env node

import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import { composeRasterLayers } from "../packages/media/dist/index.js";

const SERVER_NAME = "evavo-raster-compositing";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const MAX_LAYERS = 256;

function allowedRoots() {
  return (process.env.EVAVO_RASTER_COMPOSE_ALLOWED_ROOTS ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => path.resolve(entry));
}

async function assertAllowed(filePath, { output = false } = {}) {
  const resolved = path.resolve(filePath);
  const roots = allowedRoots();
  if (roots.length === 0) throw new Error("EVAVO_RASTER_COMPOSE_ALLOWED_ROOTS is not configured.");
  const comparable = output ? path.dirname(resolved) : await realpath(resolved);
  const allowed = roots.some((root) => comparable === root || comparable.startsWith(`${root}${path.sep}`));
  if (!allowed) throw new Error(`Path is outside configured raster compositing roots: ${resolved}`);
  return resolved;
}

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

async function compose(args) {
  if (process.env.EVAVO_RASTER_COMPOSE_ALLOW_WRITES !== "true") {
    throw new Error("Raster compositing writes are disabled. Set EVAVO_RASTER_COMPOSE_ALLOW_WRITES=true.");
  }
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required for this exact call.");
  if (typeof args.outputPath !== "string" || !args.outputPath) {
    throw new Error("outputPath is required.");
  }

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

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_raster_compositing_capabilities",
    description: "Describe the local ordered-layer raster compositing contract without reading or writing image bytes.",
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
        "png",
        "webp",
        "avif",
        "jpeg",
      ],
      masks: "provider-agnostic; pass local mattes from segmentation, Cloudinary, ComfyUI or another approved source",
      writesEnabled: process.env.EVAVO_RASTER_COMPOSE_ALLOW_WRITES === "true",
      allowedRootCount: allowedRoots().length,
      bytesReturned: false,
    });
  }
  if (name === "evavo_compose_raster_layers") return compose(args ?? {});
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
        instructions: "Raster compositing is local-first. Writes require an allowed root, the write environment gate and exact per-call confirmation.",
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
