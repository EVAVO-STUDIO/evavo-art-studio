#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import { detectExistingImageDefects, segmentDefectMaskRegions } from "../packages/media/dist/index.js";
import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-existing-image-defect-detection";
const SERVER_VERSION = "1.3.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_EXISTING_IMAGE_POLISH_ALLOWED_ROOTS";
const ALLOW_WRITES_ENV = "EVAVO_EXISTING_IMAGE_POLISH_ALLOW_WRITES";
const REVIEW_PROFILES = new Set(["logo-transparent", "web-hero", "ui-screenshot", "product-cutout", "photo", "cel-animation-frame", "pixel-art", "texture", "illustration"]);
const TRANSPARENT_RGB_MODES = new Set(["auto", "off", "edge-only", "all"]);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const assertAllowed = (filePath, { output = false } = {}) => assertAllowedLocalPath(filePath, { envName: ALLOWED_ROOTS_ENV, output, label: "existing image defect detection" });
function assertWrite(args) {
  if (process.env[ALLOW_WRITES_ENV] !== "true") throw new Error(`Defect-detection writes are disabled. Set ${ALLOW_WRITES_ENV}=true.`);
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required.");
}
function identity(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

async function detect(args) {
  assertWrite(args);
  for (const key of ["inputPath", "maskPath", "overlayPath", "receiptPath"]) if (typeof args[key] !== "string") throw new Error(`${key} is required.`);
  if (args.profile !== undefined && !REVIEW_PROFILES.has(args.profile)) throw new Error(`Unsupported review profile ${JSON.stringify(args.profile)}.`);
  if (args.transparentRgbMode !== undefined && !TRANSPARENT_RGB_MODES.has(args.transparentRgbMode)) throw new Error(`Unsupported transparentRgbMode ${JSON.stringify(args.transparentRgbMode)}.`);

  const inputPath = await assertAllowed(args.inputPath);
  const maskPath = await assertAllowed(args.maskPath, { output: true });
  const overlayPath = await assertAllowed(args.overlayPath, { output: true });
  const receiptPath = await assertAllowed(args.receiptPath, { output: true });
  if (new Set([inputPath, maskPath, overlayPath, receiptPath].map(identity)).size !== 4) throw new Error("Input, mask, overlay and receipt paths must be distinct.");

  const sourceBytes = await readFile(inputPath);
  const result = await detectExistingImageDefects(sourceBytes, {
    ...(args.profile ? { profile: args.profile } : {}),
    ...(args.transparentRgbMode ? { transparentRgbMode: args.transparentRgbMode } : {}),
    ...(Number.isInteger(args.haloLumaThreshold) ? { haloLumaThreshold: args.haloLumaThreshold } : {}),
    ...(typeof args.haloColorDistanceThreshold === "number" ? { haloColorDistanceThreshold: args.haloColorDistanceThreshold } : {}),
    ...(Number.isInteger(args.pinholeAlphaMaximum) ? { pinholeAlphaMaximum: args.pinholeAlphaMaximum } : {}),
    ...(Number.isInteger(args.speckAlphaMinimum) ? { speckAlphaMinimum: args.speckAlphaMinimum } : {}),
    ...(Number.isInteger(args.stairStepMinimumTransitions) ? { stairStepMinimumTransitions: args.stairStepMinimumTransitions } : {}),
    ...(Number.isInteger(args.maskPadding) ? { maskPadding: args.maskPadding } : {}),
    ...(typeof args.maximumMaskCoverageRatio === "number" ? { maximumMaskCoverageRatio: args.maximumMaskCoverageRatio } : {}),
  });
  const regions = await segmentDefectMaskRegions(result.maskPng, {
    ...(Number.isInteger(args.minimumRegionPixelCount) ? { minimumPixelCount: args.minimumRegionPixelCount } : {}),
    ...(Number.isInteger(args.maximumRegions) ? { maximumRegions: args.maximumRegions } : {}),
    ...(Number.isInteger(args.regionMergeGap) ? { mergeGap: args.regionMergeGap } : {}),
  });
  const sourceBinding = Object.freeze({ path: inputPath, sha256: sha256(sourceBytes), byteLength: sourceBytes.length });
  const maskBinding = Object.freeze({ path: maskPath, sha256: sha256(result.maskPng), byteLength: result.maskPng.length });
  const overlayBinding = Object.freeze({ path: overlayPath, sha256: sha256(result.overlayPng), byteLength: result.overlayPng.length });

  const receipt = Object.freeze({
    schemaVersion: "1.3",
    operation: "evavo-detect-existing-image-defects",
    sourceMutation: false,
    approvalState: "proposal-only",
    sourceBinding,
    maskBinding,
    overlayBinding,
    receiptPath,
    profile: args.profile ?? null,
    evidence: result.evidence,
    regions,
    rule: "This tool proposes defect regions only. It never authorizes automatic destructive repair. Review the overlay, ranked regions and mask before applying polish or localized repair.",
    reviewRequired: [
      "Reverify source, mask and overlay SHA-256/length bindings before downstream finishing planning.",
      "Inspect the red overlay and ranked regions; confirm highlights are genuine defects rather than intended antialiasing, texture or pixel-art structure.",
      "Review the highest-ranked connected regions first instead of relying on one union bounding box across unrelated defects.",
      "Transparent RGB is edge-aware by default; logo-transparent and product-cutout profiles deliberately use strict whole-canvas hidden-RGB review.",
      "Reject any mask that includes important typography, logos, face details, UI text or intentional pixel-art edges without explicit review.",
    ],
  });
  const receiptPayload = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeCreateOnlyBundle([
    { path: maskPath, data: result.maskPng },
    { path: overlayPath, data: result.overlayPng },
    { path: receiptPath, data: receiptPayload, encoding: "utf8" },
  ]);

  return Object.freeze({ ok: true, sourceBinding, maskBinding, overlayBinding, receiptPath, evidence: result.evidence, regions, approvalState: "proposal-only", bytesReturned: false });
}

const tools = Object.freeze([
  Object.freeze({ name: "evavo_existing_image_defect_detection_capabilities", description: "Describe source-bound profile-aware defect proposals with ranked connected regions.", inputSchema: { type: "object", properties: {}, additionalProperties: false } }),
  Object.freeze({
    name: "evavo_detect_existing_image_defects",
    description: "Detect suspicious defects and emit a rollback-safe, exact-byte-bound mask, overlay and proposal receipt with ranked connected regions.",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: { type: "string", minLength: 1 }, maskPath: { type: "string", minLength: 1 }, overlayPath: { type: "string", minLength: 1 }, receiptPath: { type: "string", minLength: 1 },
        profile: { type: "string", enum: [...REVIEW_PROFILES] }, transparentRgbMode: { type: "string", enum: [...TRANSPARENT_RGB_MODES] }, haloLumaThreshold: { type: "integer", minimum: 0, maximum: 255 }, haloColorDistanceThreshold: { type: "number", minimum: 1, maximum: 442 }, pinholeAlphaMaximum: { type: "integer", minimum: 0, maximum: 255 }, speckAlphaMinimum: { type: "integer", minimum: 0, maximum: 255 }, stairStepMinimumTransitions: { type: "integer", minimum: 2, maximum: 4 }, maskPadding: { type: "integer", minimum: 0, maximum: 24 }, maximumMaskCoverageRatio: { type: "number", minimum: 0, maximum: 1 }, minimumRegionPixelCount: { type: "integer", minimum: 1, maximum: 1000000 }, maximumRegions: { type: "integer", minimum: 1, maximum: 128 }, regionMergeGap: { type: "integer", minimum: 0, maximum: 64 }, confirmLocalWrite: { type: "boolean", const: true },
      },
      required: ["inputPath", "maskPath", "overlayPath", "receiptPath", "confirmLocalWrite"],
      additionalProperties: false,
    },
  }),
]);
function capabilities() {
  return Object.freeze({
    contract: "evavo_existing_image_defect_detection_v1_3",
    serverVersion: SERVER_VERSION,
    sourceMutation: false,
    sourceSha256AndLengthBound: true,
    maskSha256AndLengthBound: true,
    overlaySha256AndLengthBound: true,
    allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
    profileAwareTransparentRgbDetection: true,
    rankedConnectedDefectRegions: true,
    rollbackSafeCreateOnlyOutputBundle: true,
    automaticRepairAllowed: false,
  });
}
async function callTool(name, args) {
  if (name === "evavo_existing_image_defect_detection_capabilities") return capabilities();
  if (name === "evavo_detect_existing_image_defects") return detect(args ?? {});
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}
function response(id, result) { return { jsonrpc: "2.0", id, result }; }
function toolResult(payload, isError = false) { return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError }; }
async function handle(message) {
  const { id, method, params } = message;
  if (method === "initialize") return response(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } });
  if (method === "notifications/initialized") return null;
  if (method === "tools/list") return response(id, { tools });
  if (method === "tools/call") { try { return response(id, toolResult(await callTool(params?.name, params?.arguments ?? {}))); } catch (error) { return response(id, toolResult({ ok: false, message: error instanceof Error ? error.message : String(error) }, true)); } }
  return response(id, toolResult({ ok: false, message: `Unsupported method ${JSON.stringify(method)}.` }, true));
}
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  try { const outgoing = await handle(JSON.parse(line)); if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: String(error) }, true)))}\n`); }
}
