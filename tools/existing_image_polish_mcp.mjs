#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import {
  createTransparencyProofSheet,
  polishExistingRasterPreservingArtwork,
} from "../packages/media/dist/index.js";
import {
  assertAllowedLocalPath,
  configuredLocalRootCount,
} from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-existing-image-polish";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_EXISTING_IMAGE_POLISH_ALLOWED_ROOTS";
const ALLOW_WRITES_ENV = "EVAVO_EXISTING_IMAGE_POLISH_ALLOW_WRITES";

const assertAllowed = (filePath, { output = false } = {}) =>
  assertAllowedLocalPath(filePath, {
    envName: ALLOWED_ROOTS_ENV,
    output,
    label: "existing image polish",
  });

function assertWriteAdmission(args) {
  if (process.env[ALLOW_WRITES_ENV] !== "true") {
    throw new Error(`Existing-image polish writes are disabled. Set ${ALLOW_WRITES_ENV}=true.`);
  }
  if (args.confirmLocalWrite !== true) {
    throw new Error("confirmLocalWrite=true is required for this exact call.");
  }
}

function identity(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

async function polish(args) {
  assertWriteAdmission(args);
  if (typeof args.inputPath !== "string" || typeof args.outputPath !== "string") {
    throw new Error("inputPath and outputPath are required.");
  }
  const inputPath = await assertAllowed(args.inputPath);
  const outputPath = await assertAllowed(args.outputPath, { output: true });
  if (identity(inputPath) === identity(outputPath)) {
    throw new Error("Preservation polish is non-destructive: outputPath must differ from inputPath.");
  }
  const proofPath = await assertAllowed(
    typeof args.proofPath === "string" ? args.proofPath : `${outputPath}.proof.png`,
    { output: true },
  );
  const receiptPath = await assertAllowed(
    typeof args.receiptPath === "string" ? args.receiptPath : `${outputPath}.receipt.json`,
    { output: true },
  );
  if (new Set([outputPath, proofPath, receiptPath].map(identity)).size !== 3) {
    throw new Error("outputPath, proofPath and receiptPath must be distinct.");
  }

  const source = await readFile(inputPath);
  const result = await polishExistingRasterPreservingArtwork(source, {
    ...(Number.isInteger(args.transparentAlphaCutoff) ? { transparentAlphaCutoff: args.transparentAlphaCutoff } : {}),
    ...(Number.isInteger(args.opaqueAlphaCutoff) ? { opaqueAlphaCutoff: args.opaqueAlphaCutoff } : {}),
    ...(typeof args.clearTransparentRgb === "boolean" ? { clearTransparentRgb: args.clearTransparentRgb } : {}),
    ...(typeof args.decontaminateFringe === "boolean" ? { decontaminateFringe: args.decontaminateFringe } : {}),
    ...(Number.isInteger(args.fringeRadius) ? { fringeRadius: args.fringeRadius } : {}),
    ...(Number.isInteger(args.donorAlphaThreshold) ? { donorAlphaThreshold: args.donorAlphaThreshold } : {}),
    preserveOpaqueRgb: true,
  });
  const proof = await createTransparencyProofSheet(result.buffer, {
    backgrounds: Array.isArray(args.backgrounds)
      ? args.backgrounds
      : ["#000000", "#ffffff", "#808080", "#00ff00", "#ff00ff", "#ff244e"],
    maximumPreviewDimension: Number.isInteger(args.maximumPreviewDimension)
      ? args.maximumPreviewDimension
      : 1024,
  });
  const receipt = Object.freeze({
    schemaVersion: "1.0",
    operation: "evavo-polish-existing-image-preserving-artwork",
    approvalState: "unapproved",
    sourceImmutable: true,
    inputPath,
    outputPath,
    proofPath,
    receiptPath,
    evidence: result.evidence,
    transparencyProof: proof.evidence,
    reviewRequired: [
      "Compare the finished asset against the source at 100% and 400% zoom.",
      "Inspect the full silhouette over black, white, grey, green, magenta and EVAVO cherry red.",
      "Confirm logos, typography, internal artwork and fully opaque pixels are unchanged.",
      "Only promote or overwrite a delivery/cloud asset after human or governed-agent approval.",
    ],
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await mkdir(path.dirname(proofPath), { recursive: true });
  await mkdir(path.dirname(receiptPath), { recursive: true });
  await writeFile(outputPath, result.buffer, { flag: "wx" });
  await writeFile(proofPath, proof.png, { flag: "wx" });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });

  return Object.freeze({
    ok: true,
    inputPath,
    outputPath,
    proofPath,
    receiptPath,
    approvalState: "unapproved",
    evidence: result.evidence,
    bytesReturned: false,
  });
}

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_existing_image_polish_capabilities",
    description: "Describe preservation-first tools for editing and polishing an existing image without regenerating or redesigning it.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_polish_existing_image",
    description: "Conservatively polish an EXISTING raster asset. Keeps fully opaque artwork immutable, clears dirty RGB in transparent pixels, removes semi-transparent matte/halo contamination using nearby trusted source colour, performs bounded alpha cleanup, and emits a hostile-background proof plus an unapproved receipt. Never overwrites the source.",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: { type: "string", minLength: 1 },
        outputPath: { type: "string", minLength: 1 },
        proofPath: { type: "string", minLength: 1 },
        receiptPath: { type: "string", minLength: 1 },
        transparentAlphaCutoff: { type: "integer", minimum: 0, maximum: 32 },
        opaqueAlphaCutoff: { type: "integer", minimum: 223, maximum: 255 },
        clearTransparentRgb: { type: "boolean" },
        decontaminateFringe: { type: "boolean" },
        fringeRadius: { type: "integer", minimum: 1, maximum: 8 },
        donorAlphaThreshold: { type: "integer", minimum: 128, maximum: 255 },
        backgrounds: {
          type: "array",
          minItems: 1,
          maxItems: 16,
          uniqueItems: true,
          items: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
        },
        maximumPreviewDimension: { type: "integer", minimum: 32, maximum: 2048 },
        confirmLocalWrite: { type: "boolean", const: true },
      },
      required: ["inputPath", "outputPath", "confirmLocalWrite"],
      additionalProperties: false,
    },
  }),
]);

function capabilities() {
  return Object.freeze({
    contract: "evavo_existing_image_polish_v1",
    mode: "existing-image-preservation-first",
    regeneration: false,
    sourceOverwrite: false,
    allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
    operations: [
      "bounded-alpha-snap",
      "transparent-rgb-cleanup",
      "semi-transparent-fringe-decontamination",
      "fully-opaque-rgb-preservation-gate",
      "black-white-grey-green-magenta-cherry-red-proof",
      "alpha-mask-proof",
      "unapproved-receipt",
    ],
    intendedUses: [
      "logo edge cleanup",
      "transparent PNG halo removal",
      "sprite and UI silhouette cleanup",
      "existing web image finishing",
      "matte contamination cleanup",
      "pre-Cloudinary replacement QA",
    ],
  });
}

async function callTool(name, args) {
  if (name === "evavo_existing_image_polish_capabilities") return capabilities();
  if (name === "evavo_polish_existing_image") return polish(args ?? {});
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}

function response(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function toolResult(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    isError: false,
  };
}

function toolError(error) {
  const payload = { ok: false, message: error instanceof Error ? error.message : String(error) };
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    isError: true,
  };
}

async function handle(message) {
  const { id, method, params } = message;
  if (method === "initialize") {
    return response(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    });
  }
  if (method === "notifications/initialized") return null;
  if (method === "tools/list") return response(id, { tools });
  if (method === "tools/call") {
    try {
      return response(id, toolResult(await callTool(params?.name, params?.arguments ?? {})));
    } catch (error) {
      return response(id, toolError(error));
    }
  }
  return response(id, toolError(new Error(`Unsupported method ${JSON.stringify(method)}.`)));
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  try {
    const message = JSON.parse(line);
    const outgoing = await handle(message);
    if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(response(null, toolError(error)))}\n`);
  }
}
