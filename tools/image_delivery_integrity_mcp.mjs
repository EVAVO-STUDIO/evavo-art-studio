#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { reviewImageDeliveryIntegrity } from "../packages/media/dist/image-delivery-integrity.js";
import {
  assertAllowedLocalPath,
  configuredLocalRootCount,
} from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-image-delivery-integrity";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_IMAGE_DELIVERY_ALLOWED_ROOTS";
const MAX_BATCH = 128;
const TARGETS = Object.freeze(["web", "game-art", "game-data-map", "print", "archive"]);
const FORMATS = Object.freeze(["png", "jpeg", "webp", "avif", "tiff"]);

const assertAllowed = (filePath) => assertAllowedLocalPath(filePath, {
  envName: ALLOWED_ROOTS_ENV,
  output: false,
  label: "image delivery integrity",
});

function specFromArgs(args) {
  return {
    target: args.target,
    ...(typeof args.intendedFormat === "string" ? { intendedFormat: args.intendedFormat } : {}),
    ...(typeof args.requireAlpha === "boolean" ? { requireAlpha: args.requireAlpha } : {}),
    ...(typeof args.forbidAlpha === "boolean" ? { forbidAlpha: args.forbidAlpha } : {}),
    ...(Number.isFinite(args.outputWidthMm) ? { outputWidthMm: args.outputWidthMm } : {}),
    ...(Number.isFinite(args.outputHeightMm) ? { outputHeightMm: args.outputHeightMm } : {}),
    ...(Number.isFinite(args.minimumPrintDpi) ? { minimumPrintDpi: args.minimumPrintDpi } : {}),
    ...(typeof args.allowEmbeddedMetadata === "boolean" ? { allowEmbeddedMetadata: args.allowEmbeddedMetadata } : {}),
    ...(typeof args.allowOrientationMetadata === "boolean" ? { allowOrientationMetadata: args.allowOrientationMetadata } : {}),
    ...(Number.isFinite(args.maximumMegapixels) ? { maximumMegapixels: args.maximumMegapixels } : {}),
  };
}

async function reviewOne(args) {
  if (typeof args.inputPath !== "string") throw new Error("inputPath is required.");
  if (!TARGETS.includes(args.target)) throw new Error("A supported target is required.");
  const inputPath = await assertAllowed(args.inputPath);
  const evidence = await reviewImageDeliveryIntegrity(await readFile(inputPath), specFromArgs(args));
  return Object.freeze({ ok: true, inputPath, evidence, sourceModified: false, bytesReturned: false });
}

async function reviewBatch(args) {
  if (!TARGETS.includes(args.target)) throw new Error("A supported target is required.");
  if (!Array.isArray(args.images) || args.images.length < 1 || args.images.length > MAX_BATCH) {
    throw new Error(`images must contain 1 through ${MAX_BATCH} entries.`);
  }
  const seen = new Set();
  const items = [];
  for (const item of args.images) {
    if (!item || typeof item.id !== "string" || !item.id.trim() || typeof item.path !== "string") {
      throw new Error("Every images entry requires a non-empty id and path.");
    }
    if (seen.has(item.id)) throw new Error(`Duplicate image id ${JSON.stringify(item.id)}.`);
    seen.add(item.id);
    const inputPath = await assertAllowed(item.path);
    const evidence = await reviewImageDeliveryIntegrity(await readFile(inputPath), {
      ...specFromArgs(args),
      ...(typeof item.intendedFormat === "string" ? { intendedFormat: item.intendedFormat } : {}),
      ...(typeof item.requireAlpha === "boolean" ? { requireAlpha: item.requireAlpha } : {}),
      ...(typeof item.forbidAlpha === "boolean" ? { forbidAlpha: item.forbidAlpha } : {}),
      ...(Number.isFinite(item.outputWidthMm) ? { outputWidthMm: item.outputWidthMm } : {}),
      ...(Number.isFinite(item.outputHeightMm) ? { outputHeightMm: item.outputHeightMm } : {}),
    });
    items.push(Object.freeze({ id: item.id, path: inputPath, evidence }));
  }
  const priority = Object.freeze([...items]
    .sort((a, b) => {
      const severity = (grade) => grade === "fail" ? 3 : grade === "warn" ? 2 : 1;
      const difference = severity(b.evidence.grade) - severity(a.evidence.grade);
      if (difference !== 0) return difference;
      return b.evidence.blockers.length - a.evidence.blockers.length || b.evidence.warnings.length - a.evidence.warnings.length;
    })
    .map((item) => item.id));
  return Object.freeze({
    ok: true,
    target: args.target,
    itemCount: items.length,
    summary: Object.freeze({
      pass: items.filter((item) => item.evidence.grade === "pass").length,
      warn: items.filter((item) => item.evidence.grade === "warn").length,
      fail: items.filter((item) => item.evidence.grade === "fail").length,
    }),
    reviewPriority: priority,
    items: Object.freeze(items.map((item) => Object.freeze({
      id: item.id,
      path: item.path,
      grade: item.evidence.grade,
      width: item.evidence.width,
      height: item.evidence.height,
      megapixels: item.evidence.megapixels,
      format: item.evidence.format,
      colourSpace: item.evidence.colourSpace,
      hasAlpha: item.evidence.hasAlpha,
      blockers: item.evidence.blockers,
      warnings: item.evidence.warnings,
      recommendations: item.evidence.recommendations,
      print: item.evidence.print,
      embeddedMetadata: item.evidence.embeddedMetadata,
    }))),
    sourcesModified: false,
    bytesReturned: false,
  });
}

const commonProperties = Object.freeze({
  target: { type: "string", enum: TARGETS },
  intendedFormat: { type: "string", enum: FORMATS },
  requireAlpha: { type: "boolean" },
  forbidAlpha: { type: "boolean" },
  outputWidthMm: { type: "number", exclusiveMinimum: 0 },
  outputHeightMm: { type: "number", exclusiveMinimum: 0 },
  minimumPrintDpi: { type: "number", exclusiveMinimum: 0 },
  allowEmbeddedMetadata: { type: "boolean" },
  allowOrientationMetadata: { type: "boolean" },
  maximumMegapixels: { type: "number", exclusiveMinimum: 0 },
});
const imageSchema = Object.freeze({
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
    path: { type: "string", minLength: 1 },
    intendedFormat: { type: "string", enum: FORMATS },
    requireAlpha: { type: "boolean" },
    forbidAlpha: { type: "boolean" },
    outputWidthMm: { type: "number", exclusiveMinimum: 0 },
    outputHeightMm: { type: "number", exclusiveMinimum: 0 },
  },
  required: ["id", "path"],
  additionalProperties: false,
});

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_image_delivery_integrity_capabilities",
    description: "Describe read-only delivery preflight for web, game art, game data maps, print and archive images.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_review_image_delivery_integrity",
    description: "Audit one finished image's format, alpha compatibility, colour-space/profile metadata, orientation, metadata privacy risk, megapixel budget and optional physical print DPI without changing the file.",
    inputSchema: {
      type: "object",
      properties: { inputPath: { type: "string", minLength: 1 }, ...commonProperties },
      required: ["inputPath", "target"],
      additionalProperties: false,
    },
  }),
  Object.freeze({
    name: "evavo_review_image_delivery_batch",
    description: "Audit 1-128 finished images for one delivery target and rank packaging failures/warnings first. Per-image alpha/format/physical-size intent may override shared defaults.",
    inputSchema: {
      type: "object",
      properties: {
        images: { type: "array", minItems: 1, maxItems: MAX_BATCH, items: imageSchema },
        ...commonProperties,
      },
      required: ["images", "target"],
      additionalProperties: false,
    },
  }),
]);

async function callTool(name, args) {
  if (name === "evavo_image_delivery_integrity_capabilities") {
    return Object.freeze({
      contract: "evavo_image_delivery_integrity_agent_v1",
      mode: "read-only-delivery-preflight",
      tools: tools.map((tool) => tool.name),
      targets: TARGETS,
      maximumBatchSize: MAX_BATCH,
      checks: [
        "encoded-format-vs-intent",
        "alpha-channel-compatibility",
        "colour-space-and-icc-presence",
        "orientation-metadata-normalization-risk",
        "EXIF/XMP-runtime-or-public-metadata-risk",
        "megapixel-budget",
        "effective-print-dpi-when-physical-size-is-known",
        "game-data-map-linear-non-colour-guidance",
      ],
      boundaries: [
        "does not automatically colour-convert masters",
        "does not prove visual colour matching across displays/printers",
        "does not replace browser/engine/print-proof inspection",
      ],
      allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
      sourceMutationAllowed: false,
      bytesReturned: false,
    });
  }
  if (name === "evavo_review_image_delivery_integrity") return reviewOne(args ?? {});
  if (name === "evavo_review_image_delivery_batch") return reviewBatch(args ?? {});
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}

function result(value, isError = false) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value, isError };
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
        instructions: `Delivery integrity review is read-only. Configure ${ALLOWED_ROOTS_ENV}; create deliberate derivatives elsewhere rather than mutating masters in this preflight.`,
      },
    };
  }
  if (request.method === "ping") return { jsonrpc: "2.0", id: request.id, result: {} };
  if (request.method === "tools/list") return { jsonrpc: "2.0", id: request.id, result: { tools } };
  if (request.method === "tools/call") {
    try {
      return { jsonrpc: "2.0", id: request.id, result: result(await callTool(request.params?.name, request.params?.arguments)) };
    } catch (error) {
      return { jsonrpc: "2.0", id: request.id, result: result({ code: "IMAGE_DELIVERY_INTEGRITY_FAILED", message: error instanceof Error ? error.message : String(error) }, true) };
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
    try { request = JSON.parse(line); } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })\n`);
      return;
    }
    const response = await dispatch(request);
    if (response !== null) process.stdout.write(`${JSON.stringify(response)}\n`);
  });
});
