#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import {
  applyLocalizedRasterEdit,
  createExistingImageDifferenceProof,
  createTransparencyProofSheet,
  polishExistingRasterPreservingArtwork,
} from "../packages/media/dist/index.js";
import {
  assertAllowedLocalPath,
  configuredLocalRootCount,
} from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-existing-image-polish";
const SERVER_VERSION = "1.2.0";
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

async function resolveDistinctOutputs(args, outputPath) {
  const proofPath = await assertAllowed(
    typeof args.proofPath === "string" ? args.proofPath : `${outputPath}.proof.png`,
    { output: true },
  );
  const diffPath = await assertAllowed(
    typeof args.diffPath === "string" ? args.diffPath : `${outputPath}.diff.png`,
    { output: true },
  );
  const receiptPath = await assertAllowed(
    typeof args.receiptPath === "string" ? args.receiptPath : `${outputPath}.receipt.json`,
    { output: true },
  );
  if (new Set([outputPath, proofPath, diffPath, receiptPath].map(identity)).size !== 4) {
    throw new Error("outputPath, proofPath, diffPath and receiptPath must be distinct.");
  }
  return { proofPath, diffPath, receiptPath };
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
  const { proofPath, diffPath, receiptPath } = await resolveDistinctOutputs(args, outputPath);

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

  const maximumChangedPixelRatio = typeof args.maximumChangedPixelRatio === "number"
    ? args.maximumChangedPixelRatio
    : 0.35;
  const diff = await createExistingImageDifferenceProof(source, result.buffer, {
    maximumChangedPixelRatio,
  });
  if (!diff.evidence.withinMaximumChangedPixelRatio) {
    throw new Error(
      `Preservation polish changed ${(diff.evidence.changedPixelRatio * 100).toFixed(2)}% of pixels; maximum allowed is ${(maximumChangedPixelRatio * 100).toFixed(2)}%.`,
    );
  }
  if (diff.evidence.opaqueRgbChangedPixels !== 0) {
    throw new Error(`Preservation diff found ${diff.evidence.opaqueRgbChangedPixels} changed opaque RGB pixels; refusing output.`);
  }

  const proof = await createTransparencyProofSheet(result.buffer, {
    backgrounds: Array.isArray(args.backgrounds)
      ? args.backgrounds
      : ["#000000", "#ffffff", "#808080", "#00ff00", "#ff00ff", "#ff244e"],
    maximumPreviewDimension: Number.isInteger(args.maximumPreviewDimension)
      ? args.maximumPreviewDimension
      : 1024,
  });
  const receipt = Object.freeze({
    schemaVersion: "1.1",
    operation: "evavo-polish-existing-image-preserving-artwork",
    approvalState: "unapproved",
    sourceImmutable: true,
    inputPath,
    outputPath,
    proofPath,
    diffPath,
    receiptPath,
    evidence: result.evidence,
    differenceProof: diff.evidence,
    transparencyProof: proof.evidence,
    reviewRequired: [
      "Compare the finished asset against the source at 100% and 400% zoom.",
      "Inspect the exact difference map: red is RGB change, blue is alpha change, magenta is both.",
      "Inspect the full silhouette over black, white, grey, green, magenta and EVAVO cherry red.",
      "Confirm logos, typography, internal artwork and fully opaque pixels are unchanged.",
      "Only promote or overwrite a delivery/cloud asset after human or governed-agent approval.",
    ],
  });

  for (const filePath of [outputPath, proofPath, diffPath, receiptPath]) {
    await mkdir(path.dirname(filePath), { recursive: true });
  }
  await writeFile(outputPath, result.buffer, { flag: "wx" });
  await writeFile(proofPath, proof.png, { flag: "wx" });
  await writeFile(diffPath, diff.proofPng, { flag: "wx" });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });

  return Object.freeze({
    ok: true,
    inputPath,
    outputPath,
    proofPath,
    diffPath,
    receiptPath,
    approvalState: "unapproved",
    evidence: result.evidence,
    differenceProof: diff.evidence,
    bytesReturned: false,
  });
}

async function localizedEdit(args) {
  assertWriteAdmission(args);
  for (const key of ["sourcePath", "candidatePath", "maskPath", "outputPath"]) {
    if (typeof args[key] !== "string") throw new Error(`${key} is required.`);
  }
  const sourcePath = await assertAllowed(args.sourcePath);
  const candidatePath = await assertAllowed(args.candidatePath);
  const maskPath = await assertAllowed(args.maskPath);
  const outputPath = await assertAllowed(args.outputPath, { output: true });
  if (new Set([sourcePath, candidatePath, maskPath, outputPath].map(identity)).size !== 4) {
    throw new Error("Localized editing is non-destructive: source, candidate, mask and output paths must be distinct.");
  }
  const { proofPath, diffPath, receiptPath } = await resolveDistinctOutputs(args, outputPath);
  const source = await readFile(sourcePath);
  const result = await applyLocalizedRasterEdit(
    source,
    await readFile(candidatePath),
    await readFile(maskPath),
    {
      ...(Number.isInteger(args.featherRadius) ? { featherRadius: args.featherRadius } : {}),
      ...(Number.isInteger(args.maskThreshold) ? { maskThreshold: args.maskThreshold } : {}),
      preserveOutsideMask: true,
      preserveOpaqueOutsideMask: true,
    },
  );
  const maximumMaskCoverageRatio = typeof args.maximumMaskCoverageRatio === "number"
    ? args.maximumMaskCoverageRatio
    : 0.25;
  if (result.evidence.maskCoverageRatio > maximumMaskCoverageRatio) {
    throw new Error(
      `Localized edit mask covers ${(result.evidence.maskCoverageRatio * 100).toFixed(2)}% of the image; maximum allowed is ${(maximumMaskCoverageRatio * 100).toFixed(2)}%.`,
    );
  }
  const diff = await createExistingImageDifferenceProof(source, result.buffer, {
    maximumChangedPixelRatio: maximumMaskCoverageRatio,
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
    operation: "evavo-apply-localized-existing-image-edit",
    approvalState: "unapproved",
    sourceImmutable: true,
    sourcePath,
    candidatePath,
    maskPath,
    outputPath,
    proofPath,
    diffPath,
    receiptPath,
    maximumMaskCoverageRatio,
    localizedEdit: result.evidence,
    differenceProof: diff.evidence,
    transparencyProof: proof.evidence,
    reviewRequired: [
      "Confirm the mask covers only the intended defect or repair area.",
      "Inspect the source-vs-output difference map and ensure all changes stay inside the authorized region.",
      "Inspect feathered boundaries at 100%, 400% and intended runtime scale.",
      "Confirm logos, typography and unrelated image regions remain unchanged.",
      "Only promote the result after approval.",
    ],
  });
  for (const filePath of [outputPath, proofPath, diffPath, receiptPath]) {
    await mkdir(path.dirname(filePath), { recursive: true });
  }
  await writeFile(outputPath, result.buffer, { flag: "wx" });
  await writeFile(proofPath, proof.png, { flag: "wx" });
  await writeFile(diffPath, diff.proofPng, { flag: "wx" });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  return Object.freeze({
    ok: true,
    sourcePath,
    candidatePath,
    maskPath,
    outputPath,
    proofPath,
    diffPath,
    receiptPath,
    approvalState: "unapproved",
    localizedEdit: result.evidence,
    differenceProof: diff.evidence,
    bytesReturned: false,
  });
}

async function compare(args) {
  assertWriteAdmission(args);
  if (typeof args.sourcePath !== "string" || typeof args.editedPath !== "string" || typeof args.diffPath !== "string") {
    throw new Error("sourcePath, editedPath and diffPath are required.");
  }
  const sourcePath = await assertAllowed(args.sourcePath);
  const editedPath = await assertAllowed(args.editedPath);
  const diffPath = await assertAllowed(args.diffPath, { output: true });
  if (new Set([sourcePath, editedPath, diffPath].map(identity)).size !== 3) {
    throw new Error("Difference proof is non-destructive and diffPath must be distinct from both inputs.");
  }
  const diff = await createExistingImageDifferenceProof(
    await readFile(sourcePath),
    await readFile(editedPath),
    {
      ...(Number.isInteger(args.channelThreshold) ? { channelThreshold: args.channelThreshold } : {}),
      ...(Number.isInteger(args.alphaThreshold) ? { alphaThreshold: args.alphaThreshold } : {}),
      ...(typeof args.maximumChangedPixelRatio === "number" ? { maximumChangedPixelRatio: args.maximumChangedPixelRatio } : {}),
    },
  );
  await mkdir(path.dirname(diffPath), { recursive: true });
  await writeFile(diffPath, diff.proofPng, { flag: "wx" });
  return Object.freeze({ ok: true, sourcePath, editedPath, diffPath, evidence: diff.evidence, bytesReturned: false });
}

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_existing_image_polish_capabilities",
    description: "Describe preservation-first tools for editing and polishing an existing image without regenerating or redesigning it.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_polish_existing_image",
    description: "Conservatively polish an EXISTING raster asset. Keeps fully opaque artwork immutable, clears dirty RGB in transparent pixels, removes semi-transparent matte/halo contamination using nearby trusted source colour, performs bounded alpha cleanup, and emits hostile-background + exact pixel-difference proofs and an unapproved receipt. Never overwrites the source.",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: { type: "string", minLength: 1 },
        outputPath: { type: "string", minLength: 1 },
        proofPath: { type: "string", minLength: 1 },
        diffPath: { type: "string", minLength: 1 },
        receiptPath: { type: "string", minLength: 1 },
        transparentAlphaCutoff: { type: "integer", minimum: 0, maximum: 32 },
        opaqueAlphaCutoff: { type: "integer", minimum: 223, maximum: 255 },
        clearTransparentRgb: { type: "boolean" },
        decontaminateFringe: { type: "boolean" },
        fringeRadius: { type: "integer", minimum: 1, maximum: 8 },
        donorAlphaThreshold: { type: "integer", minimum: 128, maximum: 255 },
        maximumChangedPixelRatio: { type: "number", minimum: 0, maximum: 1 },
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
  Object.freeze({
    name: "evavo_apply_localized_existing_image_edit",
    description: "Apply a candidate repair ONLY inside an explicit same-size mask. Pixels outside the authorized mask are copied from the source, not trusted from the candidate. Supports feathered boundaries, maximum mask coverage, exact source-vs-output difference proof and hostile-background QA. Designed for healing, retouching, inpainting, logo cleanup and defect repair without collateral changes.",
    inputSchema: {
      type: "object",
      properties: {
        sourcePath: { type: "string", minLength: 1 },
        candidatePath: { type: "string", minLength: 1 },
        maskPath: { type: "string", minLength: 1 },
        outputPath: { type: "string", minLength: 1 },
        proofPath: { type: "string", minLength: 1 },
        diffPath: { type: "string", minLength: 1 },
        receiptPath: { type: "string", minLength: 1 },
        featherRadius: { type: "integer", minimum: 0, maximum: 32 },
        maskThreshold: { type: "integer", minimum: 0, maximum: 255 },
        maximumMaskCoverageRatio: { type: "number", minimum: 0.000001, maximum: 1 },
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
      required: ["sourcePath", "candidatePath", "maskPath", "outputPath", "confirmLocalWrite"],
      additionalProperties: false,
    },
  }),
  Object.freeze({
    name: "evavo_compare_existing_image_edit",
    description: "Create an exact preservation difference map between a source image and an edited candidate. Red marks RGB changes, blue marks alpha changes and magenta marks both. Useful before accepting any retouch, cleanup, inpaint, upscale or cloud replacement.",
    inputSchema: {
      type: "object",
      properties: {
        sourcePath: { type: "string", minLength: 1 },
        editedPath: { type: "string", minLength: 1 },
        diffPath: { type: "string", minLength: 1 },
        channelThreshold: { type: "integer", minimum: 0, maximum: 255 },
        alphaThreshold: { type: "integer", minimum: 0, maximum: 255 },
        maximumChangedPixelRatio: { type: "number", minimum: 0, maximum: 1 },
        confirmLocalWrite: { type: "boolean", const: true },
      },
      required: ["sourcePath", "editedPath", "diffPath", "confirmLocalWrite"],
      additionalProperties: false,
    },
  }),
]);

function capabilities() {
  return Object.freeze({
    contract: "evavo_existing_image_polish_v1_2",
    mode: "existing-image-preservation-first",
    regeneration: false,
    sourceOverwrite: false,
    allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
    operations: [
      "bounded-alpha-snap",
      "transparent-rgb-cleanup",
      "semi-transparent-fringe-decontamination",
      "fully-opaque-rgb-preservation-gate",
      "maximum-change-surface-gate",
      "mask-locked-localized-edit",
      "outside-mask-byte-preservation",
      "candidate-dimension-lock",
      "mask-dimension-lock",
      "feathered-local-repair",
      "maximum-mask-coverage-gate",
      "exact-rgb-alpha-difference-map",
      "change-bounding-box",
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
      "healing and spot repair",
      "mask-controlled retouching",
      "provider-generated inpaint containment",
      "retouch candidate verification",
      "upscale candidate verification",
      "pre-Cloudinary replacement QA",
    ],
  });
}

async function callTool(name, args) {
  if (name === "evavo_existing_image_polish_capabilities") return capabilities();
  if (name === "evavo_polish_existing_image") return polish(args ?? {});
  if (name === "evavo_apply_localized_existing_image_edit") return localizedEdit(args ?? {});
  if (name === "evavo_compare_existing_image_edit") return compare(args ?? {});
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
