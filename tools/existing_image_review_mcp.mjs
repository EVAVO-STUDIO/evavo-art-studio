#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import {
  reviewExistingImageEdit,
  reviewExistingImageQuality,
} from "../packages/media/dist/index.js";
import {
  assertAllowedLocalPath,
  configuredLocalRootCount,
} from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-existing-image-review";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_EXISTING_IMAGE_POLISH_ALLOWED_ROOTS";
const ALLOW_WRITES_ENV = "EVAVO_EXISTING_IMAGE_POLISH_ALLOW_WRITES";

const assertAllowed = (filePath, { output = false } = {}) =>
  assertAllowedLocalPath(filePath, {
    envName: ALLOWED_ROOTS_ENV,
    output,
    label: "existing image review",
  });

function assertWriteAdmission(args) {
  if (process.env[ALLOW_WRITES_ENV] !== "true") {
    throw new Error(`Existing-image review writes are disabled. Set ${ALLOW_WRITES_ENV}=true.`);
  }
  if (args.confirmLocalWrite !== true) {
    throw new Error("confirmLocalWrite=true is required for proof/receipt output.");
  }
}

function identity(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function qualitySpec(args) {
  return {
    ...(typeof args.minimumSharpness === "number" ? { minimumSharpness: args.minimumSharpness } : {}),
    ...(typeof args.minimumLumaStdDev === "number" ? { minimumLumaStdDev: args.minimumLumaStdDev } : {}),
    ...(typeof args.maximumTransparentRgbContaminationRatio === "number" ? { maximumTransparentRgbContaminationRatio: args.maximumTransparentRgbContaminationRatio } : {}),
    ...(typeof args.maximumEdgeHaloRiskRatio === "number" ? { maximumEdgeHaloRiskRatio: args.maximumEdgeHaloRiskRatio } : {}),
    ...(typeof args.maximumPinholeRatio === "number" ? { maximumPinholeRatio: args.maximumPinholeRatio } : {}),
    ...(typeof args.maximumBlockinessRatio === "number" ? { maximumBlockinessRatio: args.maximumBlockinessRatio } : {}),
  };
}

async function reviewQuality(args) {
  if (typeof args.inputPath !== "string") throw new Error("inputPath is required.");
  const inputPath = await assertAllowed(args.inputPath);
  const evidence = await reviewExistingImageQuality(await readFile(inputPath), qualitySpec(args));
  return Object.freeze({
    ok: true,
    inputPath,
    evidence,
    visualReviewRequired: true,
    reviewChecklist: [
      "Inspect at intended runtime size and at 100% pixel scale.",
      "Check whether the image looks genuinely polished rather than merely passing technical thresholds.",
      "Inspect edges, transparency, text, logos, faces, hands, repeated texture and generated-looking defects where relevant.",
      "Reject soft, blurry, haloed, blocky, overprocessed or semantically poor imagery even when the numeric score passes.",
    ],
  });
}

async function reviewEdit(args) {
  assertWriteAdmission(args);
  for (const key of ["sourcePath", "editedPath", "proofPath", "diffPath", "receiptPath"]) {
    if (typeof args[key] !== "string") throw new Error(`${key} is required.`);
  }
  const sourcePath = await assertAllowed(args.sourcePath);
  const editedPath = await assertAllowed(args.editedPath);
  const proofPath = await assertAllowed(args.proofPath, { output: true });
  const diffPath = await assertAllowed(args.diffPath, { output: true });
  const receiptPath = await assertAllowed(args.receiptPath, { output: true });
  if (new Set([sourcePath, editedPath, proofPath, diffPath, receiptPath].map(identity)).size !== 5) {
    throw new Error("Source, edited image and all review outputs must use distinct paths.");
  }

  const review = await reviewExistingImageEdit(
    await readFile(sourcePath),
    await readFile(editedPath),
    {
      ...qualitySpec(args),
      ...(typeof args.maximumChangedPixelRatio === "number" ? { maximumChangedPixelRatio: args.maximumChangedPixelRatio } : {}),
      ...(typeof args.maximumSharpnessRegressionRatio === "number" ? { maximumSharpnessRegressionRatio: args.maximumSharpnessRegressionRatio } : {}),
      ...(typeof args.maximumHaloRegression === "number" ? { maximumHaloRegression: args.maximumHaloRegression } : {}),
      ...(typeof args.maximumPinholeRegression === "number" ? { maximumPinholeRegression: args.maximumPinholeRegression } : {}),
      preserveOpaqueRgb: args.preserveOpaqueRgb !== false,
    },
  );

  const receipt = Object.freeze({
    schemaVersion: "1.0",
    operation: "evavo-review-existing-image-edit",
    approvalState: review.evidence.approvedForPromotion ? "technical-pass-visual-review-required" : "rejected-or-needs-review",
    sourceImmutable: true,
    sourcePath,
    editedPath,
    proofPath,
    diffPath,
    receiptPath,
    evidence: review.evidence,
    visualReviewRequired: true,
    reviewChecklist: [
      "Compare source and edited proof panels on both white and black hostile backgrounds.",
      "Inspect the exact difference map and confirm every changed region is intended.",
      "Inspect at 100%, 200% and 400% for halos, stair-stepping, oversharpening, blur, smearing, blockiness and local texture discontinuity.",
      "Check typography, logos, UI, faces, hands and other identity-critical forms for accidental alteration.",
      "Check intended runtime scale separately: a technically clean edit can still look weak, cheap, blurry or obviously generated.",
      "Promotion requires semantic/visual approval even when approvedForPromotion is true; numeric QA is a gate, not final art direction.",
    ],
  });

  for (const filePath of [proofPath, diffPath, receiptPath]) await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(proofPath, review.proofPng, { flag: "wx" });
  await writeFile(diffPath, review.differenceProofPng, { flag: "wx" });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });

  return Object.freeze({
    ok: true,
    sourcePath,
    editedPath,
    proofPath,
    diffPath,
    receiptPath,
    evidence: review.evidence,
    approvalState: receipt.approvalState,
    bytesReturned: false,
  });
}

const qualityProperties = Object.freeze({
  minimumSharpness: { type: "number", minimum: 0, maximum: 255 },
  minimumLumaStdDev: { type: "number", minimum: 0, maximum: 128 },
  maximumTransparentRgbContaminationRatio: { type: "number", minimum: 0, maximum: 1 },
  maximumEdgeHaloRiskRatio: { type: "number", minimum: 0, maximum: 1 },
  maximumPinholeRatio: { type: "number", minimum: 0, maximum: 1 },
  maximumBlockinessRatio: { type: "number", minimum: 1, maximum: 8 },
});

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_existing_image_review_capabilities",
    description: "Describe technical and visual QA for existing-image retouching, polishing, transparency cleanup, upscales and replacement candidates.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_review_existing_image_quality",
    description: "Read-only technical quality audit for an existing raster. Measures blur/softness, contrast, clipping, dirty transparent RGB, edge halo risk, alpha pinholes and JPEG-style blockiness. This never substitutes for visual art-direction review.",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: { type: "string", minLength: 1 },
        ...qualityProperties,
      },
      required: ["inputPath"],
      additionalProperties: false,
    },
  }),
  Object.freeze({
    name: "evavo_review_existing_image_edit",
    description: "Compare source vs edited artwork with regression detection, source/edited hostile-background proof sheet and exact pixel difference proof. Detects sharpness loss, new halos, pinholes, transparent-RGB contamination, blockiness, collateral opaque changes and excessive edit surface. Final visual approval is still required.",
    inputSchema: {
      type: "object",
      properties: {
        sourcePath: { type: "string", minLength: 1 },
        editedPath: { type: "string", minLength: 1 },
        proofPath: { type: "string", minLength: 1 },
        diffPath: { type: "string", minLength: 1 },
        receiptPath: { type: "string", minLength: 1 },
        ...qualityProperties,
        maximumChangedPixelRatio: { type: "number", minimum: 0, maximum: 1 },
        maximumSharpnessRegressionRatio: { type: "number", minimum: 0, maximum: 1 },
        maximumHaloRegression: { type: "number", minimum: 0, maximum: 1 },
        maximumPinholeRegression: { type: "number", minimum: 0, maximum: 1 },
        preserveOpaqueRgb: { type: "boolean" },
        confirmLocalWrite: { type: "boolean", const: true },
      },
      required: ["sourcePath", "editedPath", "proofPath", "diffPath", "receiptPath", "confirmLocalWrite"],
      additionalProperties: false,
    },
  }),
]);

function capabilities() {
  return Object.freeze({
    contract: "evavo_existing_image_review_v1",
    mode: "existing-image-quality-and-retouch-review",
    sourceMutation: false,
    allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
    checks: [
      "softness-and-sharpness",
      "detail-energy",
      "exposure-and-contrast",
      "shadow-highlight-clipping",
      "transparent-rgb-contamination",
      "semi-transparent-edge-halo-risk",
      "alpha-pinholes",
      "jpeg-blockiness-risk",
      "source-vs-edit-quality-regression",
      "opaque-pixel-collateral-change",
      "maximum-edit-surface",
      "white-and-black-hostile-background-proof",
      "exact-rgb-alpha-difference-proof",
      "mandatory-semantic-visual-review",
    ],
  });
}

async function callTool(name, args) {
  if (name === "evavo_existing_image_review_capabilities") return capabilities();
  if (name === "evavo_review_existing_image_quality") return reviewQuality(args ?? {});
  if (name === "evavo_review_existing_image_edit") return reviewEdit(args ?? {});
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}

function response(id, result) { return { jsonrpc: "2.0", id, result }; }
function toolResult(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError: false };
}
function toolError(error) {
  const payload = { ok: false, message: error instanceof Error ? error.message : String(error) };
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError: true };
}

async function handle(message) {
  const { id, method, params } = message;
  if (method === "initialize") {
    return response(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } });
  }
  if (method === "notifications/initialized") return null;
  if (method === "tools/list") return response(id, { tools });
  if (method === "tools/call") {
    try { return response(id, toolResult(await callTool(params?.name, params?.arguments ?? {}))); }
    catch (error) { return response(id, toolError(error)); }
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
