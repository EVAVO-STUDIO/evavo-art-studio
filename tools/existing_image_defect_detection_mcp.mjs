#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import { detectExistingImageDefects } from "../packages/media/dist/index.js";
import {
  assertAllowedLocalPath,
  configuredLocalRootCount,
} from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-existing-image-defect-detection";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_EXISTING_IMAGE_POLISH_ALLOWED_ROOTS";
const ALLOW_WRITES_ENV = "EVAVO_EXISTING_IMAGE_POLISH_ALLOW_WRITES";

const assertAllowed = (filePath, { output = false } = {}) =>
  assertAllowedLocalPath(filePath, {
    envName: ALLOWED_ROOTS_ENV,
    output,
    label: "existing image defect detection",
  });

function assertWrite(args) {
  if (process.env[ALLOW_WRITES_ENV] !== "true") {
    throw new Error(`Defect-detection writes are disabled. Set ${ALLOW_WRITES_ENV}=true.`);
  }
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required.");
}

function identity(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

async function detect(args) {
  assertWrite(args);
  for (const key of ["inputPath", "maskPath", "overlayPath", "receiptPath"]) {
    if (typeof args[key] !== "string") throw new Error(`${key} is required.`);
  }
  const inputPath = await assertAllowed(args.inputPath);
  const maskPath = await assertAllowed(args.maskPath, { output: true });
  const overlayPath = await assertAllowed(args.overlayPath, { output: true });
  const receiptPath = await assertAllowed(args.receiptPath, { output: true });
  if (new Set([inputPath, maskPath, overlayPath, receiptPath].map(identity)).size !== 4) {
    throw new Error("Input, mask, overlay and receipt paths must be distinct.");
  }

  const result = await detectExistingImageDefects(await readFile(inputPath), {
    ...(Number.isInteger(args.haloLumaThreshold) ? { haloLumaThreshold: args.haloLumaThreshold } : {}),
    ...(Number.isInteger(args.pinholeAlphaMaximum) ? { pinholeAlphaMaximum: args.pinholeAlphaMaximum } : {}),
    ...(Number.isInteger(args.speckAlphaMinimum) ? { speckAlphaMinimum: args.speckAlphaMinimum } : {}),
    ...(Number.isInteger(args.stairStepMinimumTransitions) ? { stairStepMinimumTransitions: args.stairStepMinimumTransitions } : {}),
    ...(Number.isInteger(args.maskPadding) ? { maskPadding: args.maskPadding } : {}),
    ...(typeof args.maximumMaskCoverageRatio === "number" ? { maximumMaskCoverageRatio: args.maximumMaskCoverageRatio } : {}),
  });

  const receipt = Object.freeze({
    schemaVersion: "1.0",
    operation: "evavo-detect-existing-image-defects",
    sourceMutation: false,
    approvalState: "proposal-only",
    inputPath,
    maskPath,
    overlayPath,
    receiptPath,
    evidence: result.evidence,
    rule: "This tool proposes defect regions. It never authorizes automatic destructive repair. Review the overlay and mask before applying polish or localized repair.",
    reviewRequired: [
      "Inspect the red overlay and confirm highlighted regions are genuine defects rather than intended antialiasing or texture.",
      "Reject any mask that includes important typography, logos, face details, UI text or intentional pixel-art edges without explicit review.",
      "Use preservation polish for transparent RGB/halo-only cases; use localized repair for pinholes/specks/stair-step defects.",
      "Escalate to manual review when the proposed mask exceeds the configured coverage ceiling.",
    ],
  });

  for (const p of [maskPath, overlayPath, receiptPath]) await mkdir(path.dirname(p), { recursive: true });
  await writeFile(maskPath, result.maskPng, { flag: "wx" });
  await writeFile(overlayPath, result.overlayPng, { flag: "wx" });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });

  return Object.freeze({
    ok: true,
    inputPath,
    maskPath,
    overlayPath,
    receiptPath,
    evidence: result.evidence,
    approvalState: "proposal-only",
    bytesReturned: false,
  });
}

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_existing_image_defect_detection_capabilities",
    description: "Describe automatic defect-region proposal for existing raster artwork without changing the source.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_detect_existing_image_defects",
    description: "Detect suspicious existing-image defects and emit a conservative repair-mask proposal plus a red visual overlay. Finds hidden RGB in transparent pixels, halo-risk edge pixels, alpha pinholes, isolated alpha specks and hard alpha stair-step anomalies. Proposal only; visual review is mandatory before repair.",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: { type: "string", minLength: 1 },
        maskPath: { type: "string", minLength: 1 },
        overlayPath: { type: "string", minLength: 1 },
        receiptPath: { type: "string", minLength: 1 },
        haloLumaThreshold: { type: "integer", minimum: 0, maximum: 255 },
        pinholeAlphaMaximum: { type: "integer", minimum: 0, maximum: 255 },
        speckAlphaMinimum: { type: "integer", minimum: 0, maximum: 255 },
        stairStepMinimumTransitions: { type: "integer", minimum: 2, maximum: 8 },
        maskPadding: { type: "integer", minimum: 0, maximum: 24 },
        maximumMaskCoverageRatio: { type: "number", minimum: 0, maximum: 1 },
        confirmLocalWrite: { type: "boolean", const: true },
      },
      required: ["inputPath", "maskPath", "overlayPath", "receiptPath", "confirmLocalWrite"],
      additionalProperties: false,
    },
  }),
]);

function capabilities() {
  return Object.freeze({
    contract: "evavo_existing_image_defect_detection_v1",
    sourceMutation: false,
    allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
    detects: [
      "transparent-rgb-contamination",
      "edge-halo-risk",
      "alpha-pinhole",
      "isolated-alpha-speck",
      "hard-alpha-stair-step",
    ],
    outputs: ["repair-mask-proposal", "red-defect-overlay", "proposal-only-receipt"],
    automaticRepairAllowed: false,
  });
}

async function callTool(name, args) {
  if (name === "evavo_existing_image_defect_detection_capabilities") return capabilities();
  if (name === "evavo_detect_existing_image_defects") return detect(args ?? {});
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}

function response(id, result) { return { jsonrpc: "2.0", id, result }; }
function toolResult(payload, isError = false) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError };
}

async function handle(message) {
  const { id, method, params } = message;
  if (method === "initialize") return response(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } });
  if (method === "notifications/initialized") return null;
  if (method === "tools/list") return response(id, { tools });
  if (method === "tools/call") {
    try { return response(id, toolResult(await callTool(params?.name, params?.arguments ?? {}))); }
    catch (error) { return response(id, toolResult({ ok: false, message: error instanceof Error ? error.message : String(error) }, true)); }
  }
  return response(id, toolResult({ ok: false, message: `Unsupported method ${JSON.stringify(method)}.` }, true));
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  try {
    const outgoing = await handle(JSON.parse(line));
    if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: String(error) }, true)))}\n`);
  }
}
