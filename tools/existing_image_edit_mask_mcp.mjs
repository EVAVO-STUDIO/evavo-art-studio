#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import sharp from "../packages/media/node_modules/sharp/lib/index.js";

import { createEditMask } from "../packages/media/dist/index.js";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-existing-image-edit-mask";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_EXISTING_IMAGE_POLISH_ALLOWED_ROOTS";
const ALLOW_WRITES_ENV = "EVAVO_EXISTING_IMAGE_POLISH_ALLOW_WRITES";

const assertAllowed = (filePath, { output = false } = {}) =>
  assertAllowedLocalPath(filePath, {
    envName: ALLOWED_ROOTS_ENV,
    output,
    label: "existing image edit mask",
  });

function admit(args) {
  if (process.env[ALLOW_WRITES_ENV] !== "true") throw new Error("Existing-image edit mask writes are disabled.");
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required for this exact call.");
}

async function createMask(args) {
  admit(args);
  if (typeof args.sourcePath !== "string" || typeof args.outputPath !== "string") {
    throw new Error("sourcePath and outputPath are required.");
  }
  if (!Array.isArray(args.regions)) throw new Error("regions is required.");
  const sourcePath = await assertAllowed(args.sourcePath);
  const outputPath = await assertAllowed(args.outputPath, { output: true });
  if (path.resolve(sourcePath) === path.resolve(outputPath)) throw new Error("Mask output must differ from the source image.");
  const meta = await sharp(await readFile(sourcePath)).metadata();
  if (!meta.width || !meta.height) throw new Error("Source image has no dimensions.");
  const result = await createEditMask(meta.width, meta.height, args.regions);
  const maximumCoverageRatio = typeof args.maximumCoverageRatio === "number" ? args.maximumCoverageRatio : 0.25;
  if (result.evidence.coverageRatio > maximumCoverageRatio) {
    throw new Error(
      `Edit mask covers ${(result.evidence.coverageRatio * 100).toFixed(2)}% of the image; maximum allowed is ${(maximumCoverageRatio * 100).toFixed(2)}%.`,
    );
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.png, { flag: "wx" });
  return Object.freeze({
    ok: true,
    sourcePath,
    outputPath,
    maximumCoverageRatio,
    evidence: result.evidence,
    bytesReturned: false,
  });
}

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_existing_image_edit_mask_capabilities",
    description: "Describe deterministic region-mask authoring for localized repair of existing images.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_create_existing_image_edit_mask",
    description: "Create a same-size monochrome repair mask from bounded rectangle/ellipse regions on an existing image. Supports per-region padding and a maximum total coverage gate so agents can authorize only the defect area before retouching or inpainting.",
    inputSchema: {
      type: "object",
      properties: {
        sourcePath: { type: "string", minLength: 1 },
        outputPath: { type: "string", minLength: 1 },
        maximumCoverageRatio: { type: "number", minimum: 0.000001, maximum: 1 },
        regions: {
          type: "array",
          minItems: 1,
          maxItems: 128,
          items: {
            type: "object",
            properties: {
              x: { type: "integer", minimum: 0 },
              y: { type: "integer", minimum: 0 },
              width: { type: "integer", minimum: 1 },
              height: { type: "integer", minimum: 1 },
              shape: { type: "string", enum: ["rectangle", "ellipse"] },
              padding: { type: "integer", minimum: 0, maximum: 4096 }
            },
            required: ["x", "y", "width", "height"],
            additionalProperties: false
          }
        },
        confirmLocalWrite: { type: "boolean", const: true }
      },
      required: ["sourcePath", "outputPath", "regions", "confirmLocalWrite"],
      additionalProperties: false
    }
  })
]);

function capabilities() {
  return Object.freeze({
    contract: "evavo_existing_image_edit_mask_v1",
    sourceOverwrite: false,
    allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
    shapes: ["rectangle", "ellipse"],
    operations: ["same-size-mask", "bounded-region-validation", "padding", "mask-union", "maximum-coverage-gate"]
  });
}

async function callTool(name, args) {
  if (name === "evavo_existing_image_edit_mask_capabilities") return capabilities();
  if (name === "evavo_create_existing_image_edit_mask") return createMask(args ?? {});
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}

function wrap(id, payload, isError = false) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
      isError
    }
  };
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  let message;
  try { message = JSON.parse(line); } catch (error) {
    process.stdout.write(`${JSON.stringify(wrap(null, { ok: false, message: String(error) }, true))}\n`);
    continue;
  }
  const { id, method, params } = message;
  if (method === "initialize") {
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result: { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } } })}\n`);
    continue;
  }
  if (method === "notifications/initialized") continue;
  if (method === "tools/list") {
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result: { tools } })}\n`);
    continue;
  }
  if (method === "tools/call") {
    try {
      process.stdout.write(`${JSON.stringify(wrap(id, await callTool(params?.name, params?.arguments ?? {})))}\n`);
    } catch (error) {
      process.stdout.write(`${JSON.stringify(wrap(id, { ok: false, message: error instanceof Error ? error.message : String(error) }, true))}\n`);
    }
  }
}
