#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import { finishRasterAsset } from "../packages/media/dist/index.js";
import {
  assertAllowedLocalPath,
  configuredLocalRootCount,
} from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-raster-finishing";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_RASTER_FINISH_ALLOWED_ROOTS";

const PRESETS = Object.freeze({
  "transparent-object": Object.freeze({ ensureAlpha: true, trim: { threshold: 8, padding: 24 }, normalize: true, sharpen: { sigma: 1 }, format: "png" }),
  "web-support": Object.freeze({ ensureAlpha: true, trim: { threshold: 8, padding: 32 }, normalize: true, sharpen: { sigma: 1 }, resize: { width: 1400, fit: "inside", withoutEnlargement: true }, format: "webp", quality: 92 }),
  "web-hero": Object.freeze({ ensureAlpha: true, normalize: true, sharpen: { sigma: 0.8 }, resize: { width: 2400, fit: "inside", withoutEnlargement: true }, format: "webp", quality: 92 }),
  "motion-layer": Object.freeze({ ensureAlpha: true, trim: { threshold: 4, padding: 16 }, sharpen: { sigma: 0.7 }, format: "png" }),
});

const assertAllowed = (filePath, { output = false } = {}) =>
  assertAllowedLocalPath(filePath, {
    envName: ALLOWED_ROOTS_ENV,
    output,
    label: "raster finishing",
  });

function mergeSpec(base, overrides) {
  return {
    ...base,
    ...overrides,
    ...(base.trim || overrides.trim ? { trim: { ...(base.trim ?? {}), ...(overrides.trim ?? {}) } } : {}),
    ...(base.modulate || overrides.modulate ? { modulate: { ...(base.modulate ?? {}), ...(overrides.modulate ?? {}) } } : {}),
    ...(base.sharpen || overrides.sharpen ? { sharpen: { ...(base.sharpen ?? {}), ...(overrides.sharpen ?? {}) } } : {}),
    ...(base.resize || overrides.resize ? { resize: { ...(base.resize ?? {}), ...(overrides.resize ?? {}) } } : {}),
    ...(base.padding || overrides.padding ? { padding: { ...(base.padding ?? {}), ...(overrides.padding ?? {}) } } : {}),
  };
}

async function finish(args) {
  if (process.env.EVAVO_RASTER_FINISH_ALLOW_WRITES !== "true") {
    throw new Error("Raster finishing writes are disabled. Set EVAVO_RASTER_FINISH_ALLOW_WRITES=true.");
  }
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required for this exact call.");
  if (typeof args.inputPath !== "string" || typeof args.outputPath !== "string") {
    throw new Error("inputPath and outputPath are required.");
  }
  const presetName = typeof args.preset === "string" ? args.preset : "web-support";
  const preset = PRESETS[presetName];
  if (!preset) throw new Error(`Unknown raster finishing preset ${JSON.stringify(presetName)}.`);
  const inputPath = await assertAllowed(args.inputPath);
  const outputPath = await assertAllowed(args.outputPath, { output: true });
  const overrides = args.spec && typeof args.spec === "object" && !Array.isArray(args.spec) ? args.spec : {};
  const spec = mergeSpec(preset, overrides);
  if (args.maskPath !== undefined) {
    if (typeof args.maskPath !== "string") throw new Error("maskPath must be a string.");
    spec.mask = await readFile(await assertAllowed(args.maskPath));
  }
  const result = await finishRasterAsset(await readFile(inputPath), spec);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.buffer);
  return Object.freeze({
    ok: true,
    preset: presetName,
    inputPath,
    outputPath,
    evidence: result.evidence,
    bytesReturned: false,
  });
}

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_raster_finishing_capabilities",
    description: "Describe local raster finishing presets and supported operations without reading or writing image bytes.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_finish_raster_asset",
    description: "Finish an existing raster image locally: optional external alpha mask, trim, edge-safe transparent padding, tone correction, normalization, gamma, blur, sharpening, resize, flatten and production PNG/WebP/AVIF/JPEG export.",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: { type: "string", minLength: 1 },
        outputPath: { type: "string", minLength: 1 },
        maskPath: { type: "string", minLength: 1 },
        preset: { type: "string", enum: Object.keys(PRESETS) },
        spec: { type: "object" },
        confirmLocalWrite: { type: "boolean", const: true },
      },
      required: ["inputPath", "outputPath", "confirmLocalWrite"],
      additionalProperties: false,
    },
  }),
]);

async function callTool(name, args) {
  if (name === "evavo_raster_finishing_capabilities") {
    return Object.freeze({
      contract: "evavo_raster_finishing_v1",
      presets: Object.keys(PRESETS),
      operations: ["alpha-mask", "ensure-alpha", "trim", "transparent-padding", "modulate", "normalize", "gamma", "blur", "sharpen", "resize", "flatten", "png", "webp", "avif", "jpeg"],
      segmentation: "provider-agnostic; pass a same-size alpha mask from Cloudinary AI, local segmentation, ComfyUI or another approved provider",
      motionBridge: "use motion-layer to prepare transparent PNG layers for the existing animation and compositing pipelines",
      pathPolicy: "input and prospective output paths are canonicalized through existing ancestors so symlink escapes fail closed",
      writesEnabled: process.env.EVAVO_RASTER_FINISH_ALLOW_WRITES === "true",
      allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
    });
  }
  if (name === "evavo_finish_raster_asset") return finish(args ?? {});
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
    return { jsonrpc: "2.0", id: request.id, result: { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }, instructions: "Raster finishing is local-first. Writes require a canonical allowed root, the write environment gate and exact per-call confirmation." } };
  }
  if (request.method === "ping") return { jsonrpc: "2.0", id: request.id, result: {} };
  if (request.method === "tools/list") return { jsonrpc: "2.0", id: request.id, result: { tools } };
  if (request.method === "tools/call") {
    try {
      return { jsonrpc: "2.0", id: request.id, result: result(await callTool(request.params?.name, request.params?.arguments)) };
    } catch (error) {
      return { jsonrpc: "2.0", id: request.id, result: result({ code: "RASTER_FINISH_FAILED", message: error instanceof Error ? error.message : String(error) }, true) };
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
