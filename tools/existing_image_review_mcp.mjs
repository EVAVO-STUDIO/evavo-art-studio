#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import {
  getImageReviewProfile,
  listImageReviewProfiles,
  reviewExistingImageEdit,
  reviewExistingImageQuality,
} from "../packages/media/dist/index.js";
import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import {
  assertAllowedLocalPath,
  configuredLocalRootCount,
} from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-existing-image-review";
const SERVER_VERSION = "1.2.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_EXISTING_IMAGE_POLISH_ALLOWED_ROOTS";
const ALLOW_WRITES_ENV = "EVAVO_EXISTING_IMAGE_POLISH_ALLOW_WRITES";

const assertAllowed = (filePath, { output = false } = {}) => assertAllowedLocalPath(filePath, {
  envName: ALLOWED_ROOTS_ENV,
  output,
  label: "existing image review",
});

function assertWriteAdmission(args) {
  if (process.env[ALLOW_WRITES_ENV] !== "true") throw new Error(`Existing-image review writes are disabled. Set ${ALLOW_WRITES_ENV}=true.`);
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required for proof/receipt output.");
}

function identity(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function resolveProfile(args) {
  return typeof args.profile === "string" ? getImageReviewProfile(args.profile) : null;
}

function profileTransparentRgbMode(profile) {
  if (!profile) return undefined;
  return profile.name === "logo-transparent" || profile.name === "product-cutout" ? "all" : "edge-only";
}

function qualitySpec(args, profile) {
  return {
    minimumSharpness: typeof args.minimumSharpness === "number" ? args.minimumSharpness : profile?.minimumSharpness,
    minimumLumaStdDev: typeof args.minimumLumaStdDev === "number" ? args.minimumLumaStdDev : profile?.minimumLumaStdDev,
    transparentRgbDetectionMode: typeof args.transparentRgbDetectionMode === "string" ? args.transparentRgbDetectionMode : profileTransparentRgbMode(profile),
    maximumTransparentRgbContaminationRatio: typeof args.maximumTransparentRgbContaminationRatio === "number" ? args.maximumTransparentRgbContaminationRatio : profile?.maximumTransparentRgbContaminationRatio,
    maximumEdgeHaloRiskRatio: typeof args.maximumEdgeHaloRiskRatio === "number" ? args.maximumEdgeHaloRiskRatio : profile?.maximumEdgeHaloRiskRatio,
    maximumPinholeRatio: typeof args.maximumPinholeRatio === "number" ? args.maximumPinholeRatio : profile?.maximumPinholeRatio,
    maximumBlockinessRatio: typeof args.maximumBlockinessRatio === "number" ? args.maximumBlockinessRatio : profile?.maximumBlockinessRatio,
  };
}

function compactUndefined(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

async function reviewQuality(args) {
  if (typeof args.inputPath !== "string") throw new Error("inputPath is required.");
  const inputPath = await assertAllowed(args.inputPath);
  const profile = resolveProfile(args);
  const evidence = await reviewExistingImageQuality(await readFile(inputPath), compactUndefined(qualitySpec(args, profile)));
  return Object.freeze({
    ok: true,
    inputPath,
    profile: profile?.name ?? null,
    evidence,
    visualReviewRequired: true,
    reviewChecklist: Object.freeze([
      ...(profile?.visualChecks ?? []),
      "Inspect at intended runtime size and at 100% pixel scale.",
      "For transparent non-cutout imagery, hidden RGB is reviewed near visible edges by default rather than across irrelevant fully transparent matte interiors.",
      "Logo and product-cutout profiles deliberately use strict whole-canvas hidden-RGB review.",
      "Check whether the image looks genuinely polished rather than merely passing technical thresholds.",
      "Reject soft, blurry, haloed, blocky, overprocessed or semantically poor imagery even when the numeric score passes.",
    ]),
  });
}

async function reviewEdit(args) {
  assertWriteAdmission(args);
  for (const key of ["sourcePath", "editedPath", "proofPath", "diffPath", "receiptPath"]) if (typeof args[key] !== "string") throw new Error(`${key} is required.`);
  const sourcePath = await assertAllowed(args.sourcePath);
  const editedPath = await assertAllowed(args.editedPath);
  const proofPath = await assertAllowed(args.proofPath, { output: true });
  const diffPath = await assertAllowed(args.diffPath, { output: true });
  const receiptPath = await assertAllowed(args.receiptPath, { output: true });
  if (new Set([sourcePath, editedPath, proofPath, diffPath, receiptPath].map(identity)).size !== 5) throw new Error("Source, edited image and all review outputs must use distinct paths.");

  const profile = resolveProfile(args);
  const review = await reviewExistingImageEdit(
    await readFile(sourcePath),
    await readFile(editedPath),
    compactUndefined({
      ...qualitySpec(args, profile),
      maximumChangedPixelRatio: typeof args.maximumChangedPixelRatio === "number" ? args.maximumChangedPixelRatio : profile?.maximumChangedPixelRatio,
      maximumSharpnessRegressionRatio: typeof args.maximumSharpnessRegressionRatio === "number" ? args.maximumSharpnessRegressionRatio : profile?.maximumSharpnessRegressionRatio,
      maximumHaloRegression: typeof args.maximumHaloRegression === "number" ? args.maximumHaloRegression : profile?.maximumHaloRegression,
      maximumPinholeRegression: typeof args.maximumPinholeRegression === "number" ? args.maximumPinholeRegression : profile?.maximumPinholeRegression,
      preserveOpaqueRgb: typeof args.preserveOpaqueRgb === "boolean" ? args.preserveOpaqueRgb : profile?.preserveOpaqueRgb ?? true,
    }),
  );

  const receipt = Object.freeze({
    schemaVersion: "1.2",
    operation: "evavo-review-existing-image-edit",
    profile: profile?.name ?? null,
    approvalState: review.evidence.approvedForPromotion ? "technical-pass-visual-review-required" : "rejected-or-needs-review",
    sourceImmutable: true,
    sourcePath,
    editedPath,
    proofPath,
    diffPath,
    receiptPath,
    evidence: review.evidence,
    visualReviewRequired: true,
    reviewChecklist: Object.freeze([
      ...(profile?.visualChecks ?? []),
      "Compare source and edited proof panels on both white and black hostile backgrounds.",
      "Inspect the exact difference map and confirm every changed region is intended.",
      "Inspect at 100%, 200% and 400% for halos, stair-stepping, oversharpening, blur, smearing, blockiness and local texture discontinuity.",
      "Check typography, logos, UI, faces, hands and other identity-critical forms for accidental alteration where relevant.",
      "Check intended runtime scale separately: a technically clean edit can still look weak, cheap, blurry or obviously generated.",
      "Promotion requires semantic/visual approval even when approvedForPromotion is true; numeric QA is a gate, not final art direction.",
    ]),
  });

  await writeCreateOnlyBundle([
    { path: proofPath, data: review.proofPng },
    { path: diffPath, data: review.differenceProofPng },
    { path: receiptPath, data: `${JSON.stringify(receipt, null, 2)}\n`, encoding: "utf8" },
  ]);

  return Object.freeze({
    ok: true,
    sourcePath,
    editedPath,
    proofPath,
    diffPath,
    receiptPath,
    profile: profile?.name ?? null,
    evidence: review.evidence,
    approvalState: receipt.approvalState,
    visualReviewChecklist: receipt.reviewChecklist,
    bytesReturned: false,
  });
}

const qualityProperties = Object.freeze({
  profile: { type: "string", enum: ["logo-transparent", "web-hero", "ui-screenshot", "product-cutout", "photo", "cel-animation-frame", "pixel-art", "texture", "illustration"] },
  minimumSharpness: { type: "number", minimum: 0, maximum: 255 },
  minimumLumaStdDev: { type: "number", minimum: 0, maximum: 128 },
  transparentRgbDetectionMode: { type: "string", enum: ["off", "edge-only", "all"] },
  maximumTransparentRgbContaminationRatio: { type: "number", minimum: 0, maximum: 1 },
  maximumEdgeHaloRiskRatio: { type: "number", minimum: 0, maximum: 1 },
  maximumPinholeRatio: { type: "number", minimum: 0, maximum: 1 },
  maximumBlockinessRatio: { type: "number", minimum: 1, maximum: 8 },
});

const tools = Object.freeze([
  Object.freeze({ name: "evavo_existing_image_review_capabilities", description: "Describe technical and visual QA for existing-image retouching, polishing, transparency cleanup, upscales and replacement candidates.", inputSchema: { type: "object", properties: {}, additionalProperties: false } }),
  Object.freeze({ name: "evavo_list_image_review_profiles", description: "List asset-type-aware image review profiles and their visual-review requirements so agents do not judge logos, web heroes, screenshots, photography, cel art and pixel art by the same rules.", inputSchema: { type: "object", properties: {}, additionalProperties: false } }),
  Object.freeze({
    name: "evavo_review_existing_image_quality",
    description: "Read-only technical quality audit using alpha-weighted visible-pixel metrics and profile-aware hidden-RGB policy. Measures blur/softness, contrast, clipping, transparent edge contamination, halo risk, alpha pinholes and blockiness. Numeric QA never substitutes for visual review.",
    inputSchema: { type: "object", properties: { inputPath: { type: "string", minLength: 1 }, ...qualityProperties }, required: ["inputPath"], additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_review_existing_image_edit",
    description: "Compare source vs edited artwork with asset-type-aware regression detection, hostile-background proof sheet and exact pixel difference proof. All proof/diff/receipt outputs publish as one rollback-safe create-only bundle. Final visual approval is mandatory.",
    inputSchema: {
      type: "object",
      properties: {
        sourcePath: { type: "string", minLength: 1 }, editedPath: { type: "string", minLength: 1 }, proofPath: { type: "string", minLength: 1 }, diffPath: { type: "string", minLength: 1 }, receiptPath: { type: "string", minLength: 1 },
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
    contract: "evavo_existing_image_review_v1_2",
    serverVersion: SERVER_VERSION,
    mode: "existing-image-quality-and-retouch-review",
    sourceMutation: false,
    allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
    reviewProfiles: listImageReviewProfiles().map((profile) => profile.name),
    alphaWeightedVisiblePixelMetrics: true,
    edgeAwareTransparentRgbDefault: true,
    strictWholeCanvasTransparentRgbProfiles: ["logo-transparent", "product-cutout"],
    rollbackSafeReviewOutputBundle: true,
    checks: [
      "asset-type-aware-thresholds",
      "asset-type-aware-visual-checklists",
      "softness-and-sharpness",
      "detail-energy",
      "exposure-and-contrast",
      "shadow-highlight-clipping",
      "profile-aware-transparent-rgb-contamination",
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
  if (name === "evavo_list_image_review_profiles") return Object.freeze({ ok: true, profiles: listImageReviewProfiles(), visualReviewRequired: true });
  if (name === "evavo_review_existing_image_quality") return reviewQuality(args ?? {});
  if (name === "evavo_review_existing_image_edit") return reviewEdit(args ?? {});
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}

function response(id, result) { return { jsonrpc: "2.0", id, result }; }
function toolResult(payload) { return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError: false }; }
function toolError(error) {
  const payload = { ok: false, message: error instanceof Error ? error.message : String(error) };
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError: true };
}

async function handle(message) {
  const { id, method, params } = message;
  if (method === "initialize") return response(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } });
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
    const outgoing = await handle(JSON.parse(line));
    if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(response(null, toolError(error)))}\n`);
  }
}
