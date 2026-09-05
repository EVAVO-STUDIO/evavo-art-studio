#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import {
  applyAlphaGuidance,
  createTransparencyProofSheet,
  finishRasterAsset,
  recoverBackgroundAlpha,
} from "../packages/media/dist/index.js";
import {
  assertAllowedLocalPath,
  configuredLocalRootCount,
} from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-raster-finishing";
const SERVER_VERSION = "1.1.0";
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

function requireWriteAdmission(args) {
  if (process.env.EVAVO_RASTER_FINISH_ALLOW_WRITES !== "true") {
    throw new Error("Raster finishing writes are disabled. Set EVAVO_RASTER_FINISH_ALLOW_WRITES=true.");
  }
  if (args.confirmLocalWrite !== true) {
    throw new Error("confirmLocalWrite=true is required for this exact call.");
  }
  if (typeof args.inputPath !== "string" || typeof args.outputPath !== "string") {
    throw new Error("inputPath and outputPath are required.");
  }
}

function pathIdentity(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function assertDistinctPaths(sourcePaths, outputPaths) {
  const sources = new Set(sourcePaths.map(pathIdentity));
  const outputs = outputPaths.map(pathIdentity);
  if (outputs.some((candidate) => sources.has(candidate))) {
    throw new Error("Transparent mastering is non-destructive: outputs must differ from the source and masks.");
  }
  if (new Set(outputs).size !== outputs.length) {
    throw new Error("Transparent mastering output, proof and receipt paths must be distinct.");
  }
}

async function createOnly(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, { flag: "wx" });
}

async function assertCreateOnlyTargets(filePaths) {
  for (const filePath of filePaths) {
    try {
      await access(filePath);
    } catch {
      continue;
    }
    throw new Error(`Create-only output already exists: ${filePath}`);
  }
}

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
  requireWriteAdmission(args);
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

async function transparencyProof(args) {
  requireWriteAdmission(args);
  const inputPath = await assertAllowed(args.inputPath);
  const outputPath = await assertAllowed(args.outputPath, { output: true });
  const result = await createTransparencyProofSheet(await readFile(inputPath), {
    ...(Array.isArray(args.backgrounds) ? { backgrounds: args.backgrounds } : {}),
    ...(args.nearest === true ? { nearest: true } : {}),
    ...(Number.isInteger(args.maximumPreviewDimension)
      ? { maximumPreviewDimension: args.maximumPreviewDimension }
      : {}),
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.png);
  return Object.freeze({
    ok: true,
    inputPath,
    outputPath,
    evidence: result.evidence,
    bytesReturned: false,
  });
}

async function masterTransparent(args) {
  if (process.env.EVAVO_RASTER_FINISH_ALLOW_WRITES !== "true") {
    throw new Error("Raster finishing writes are disabled. Set EVAVO_RASTER_FINISH_ALLOW_WRITES=true.");
  }
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required for this exact call.");
  if (typeof args.inputPath !== "string" || typeof args.outputPath !== "string") {
    throw new Error("inputPath and outputPath are required.");
  }
  const inputPath = await assertAllowed(args.inputPath);
  const outputPath = await assertAllowed(args.outputPath, { output: true });
  const proofPath = await assertAllowed(
    typeof args.proofPath === "string" ? args.proofPath : `${outputPath}.proof.png`,
    { output: true },
  );
  const receiptPath = await assertAllowed(
    typeof args.receiptPath === "string" ? args.receiptPath : `${outputPath}.receipt.json`,
    { output: true },
  );
  const protectMaskPath = typeof args.protectMaskPath === "string"
    ? await assertAllowed(args.protectMaskPath)
    : undefined;
  const removeMaskPath = typeof args.removeMaskPath === "string"
    ? await assertAllowed(args.removeMaskPath)
    : undefined;
  assertDistinctPaths(
    [inputPath, ...(protectMaskPath ? [protectMaskPath] : []), ...(removeMaskPath ? [removeMaskPath] : [])],
    [outputPath, proofPath, receiptPath],
  );
  await assertCreateOnlyTargets([outputPath, proofPath, receiptPath]);

  const source = await readFile(inputPath);
  const recovered = await recoverBackgroundAlpha(source, {
    ...(typeof args.matteColour === "string" ? { matteColour: args.matteColour } : {}),
    allowCheckerboardRecovery: true,
    allowHighChromaInference: args.allowHighChromaInference !== false,
  });
  const guided = protectMaskPath || removeMaskPath
    ? await applyAlphaGuidance(recovered.png, source, {
        ...(protectMaskPath ? { protectMask: await readFile(protectMaskPath) } : {}),
        ...(removeMaskPath ? { removeMask: await readFile(removeMaskPath) } : {}),
      })
    : null;
  const transparentInput = guided?.png ?? recovered.png;
  const presetName = typeof args.preset === "string" ? args.preset : "transparent-object";
  const preset = PRESETS[presetName];
  if (!preset || preset.format !== "png") {
    throw new Error("Transparent mastering requires a PNG finishing preset.");
  }
  const overrides = args.spec && typeof args.spec === "object" && !Array.isArray(args.spec) ? args.spec : {};
  const finished = await finishRasterAsset(transparentInput, mergeSpec(preset, overrides));
  if (!finished.evidence.outputHasAlpha || finished.evidence.format !== "png") {
    throw new Error("Transparent mastering must produce an alpha-bearing PNG.");
  }
  const finalAdmission = await recoverBackgroundAlpha(finished.buffer, {
    allowCheckerboardRecovery: false,
    allowHighChromaInference: false,
  });
  if (finalAdmission.evidence.strategy !== "native-alpha-preserved") {
    throw new Error("Transparent mastering output did not pass meaningful native-alpha admission.");
  }
  const proof = await createTransparencyProofSheet(finished.buffer, {
    nearest: args.pixelArt === true,
  });
  const receipt = Object.freeze({
    schemaVersion: "1.0",
    operation: "evavo-master-transparent-asset",
    approvalState: "unapproved",
    inputPath,
    outputPath,
    proofPath,
    receiptPath,
    recovery: recovered.evidence,
    guidance: guided?.evidence ?? null,
    finishing: finished.evidence,
    finalAdmission: finalAdmission.evidence,
    transparencyProof: proof.evidence,
    reviewRequired: [
      "Inspect the full-resolution silhouette, holes, thin parts and semi-transparent effects.",
      "Inspect the proof over black, white, grey, green and magenta plus its alpha mask.",
      "Approve at intended runtime scale before sprite slicing or atlas packing.",
    ],
  });
  await createOnly(outputPath, finished.buffer);
  try {
    await createOnly(proofPath, proof.png);
    await createOnly(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  } catch (error) {
    throw new Error(`Transparent pixels were mastered, but the evidence set could not be completed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return Object.freeze({
    ok: true,
    outputPath,
    proofPath,
    receiptPath,
    recoveryStrategy: recovered.evidence.strategy,
    artistGuidanceApplied: guided !== null,
    approvalState: "unapproved",
    bytesReturned: false,
  });
}

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_raster_finishing_capabilities",
    description: "Describe local raster finishing, transparency-proof presets and supported operations without reading or writing image bytes.",
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
  Object.freeze({
    name: "evavo_create_transparency_proof",
    description: "Create a local PNG transparency proof sheet showing the source over black, white, grey, bright green, magenta and an explicit alpha-mask tile. The tool is diagnostic only and does not modify the source image.",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: { type: "string", minLength: 1 },
        outputPath: { type: "string", minLength: 1 },
        backgrounds: {
          type: "array",
          minItems: 1,
          maxItems: 16,
          uniqueItems: true,
          items: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
        },
        nearest: { type: "boolean" },
        maximumPreviewDimension: { type: "integer", minimum: 32, maximum: 2048 },
        confirmLocalWrite: { type: "boolean", const: true },
      },
      required: ["inputPath", "outputPath", "confirmLocalWrite"],
      additionalProperties: false,
    },
  }),
  Object.freeze({
    name: "evavo_master_transparent_asset",
    description: "Safely turn a local image with native alpha, a painted checkerboard or a proven flat matte into a real transparent sprite PNG. Uses border-connected recovery, optional separate protect/remove masks, edge cleanup, create-only outputs, hostile-background proof plates and a receipt. Ambiguous natural backgrounds fail closed.",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: { type: "string", minLength: 1 },
        outputPath: { type: "string", minLength: 1 },
        proofPath: { type: "string", minLength: 1 },
        receiptPath: { type: "string", minLength: 1 },
        matteColour: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
        protectMaskPath: { type: "string", minLength: 1 },
        removeMaskPath: { type: "string", minLength: 1 },
        allowHighChromaInference: { type: "boolean" },
        pixelArt: { type: "boolean" },
        preset: { type: "string", enum: ["transparent-object", "motion-layer"] },
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
      operations: [
        "native-alpha-preservation",
        "painted-checkerboard-recovery",
        "border-connected-matte-recovery",
        "edge-decontamination",
        "protect-mask",
        "remove-mask",
        "hostile-background-proof",
        "alpha-mask",
        "ensure-alpha",
        "trim",
        "transparent-padding",
        "modulate",
        "normalize",
        "gamma",
        "blur",
        "sharpen",
        "resize",
        "flatten",
        "transparency-proof-black-white-grey-green-magenta-alpha-mask",
        "png",
        "webp",
        "avif",
        "jpeg",
      ],
      segmentation: "provider-agnostic; pass a same-size alpha mask from Cloudinary AI, local segmentation, ComfyUI or another approved provider",
      transparencyProof: "diagnostic proof writes a separate PNG sheet over multiple solid backgrounds plus an explicit alpha mask and SHA evidence; source pixels are not modified",
      motionBridge: "use motion-layer to prepare transparent PNG layers for the existing animation and compositing pipelines",
      pathPolicy: "input and prospective output paths are canonicalized through existing ancestors so symlink escapes fail closed",
      writesEnabled: process.env.EVAVO_RASTER_FINISH_ALLOW_WRITES === "true",
      allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
      bytesReturned: false,
    });
  }
  if (name === "evavo_finish_raster_asset") return finish(args ?? {});
  if (name === "evavo_create_transparency_proof") return transparencyProof(args ?? {});
  if (name === "evavo_master_transparent_asset") return masterTransparent(args ?? {});
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
        instructions: "Raster finishing and transparency proofs are local-first. Writes require a canonical allowed root, the write environment gate and exact per-call confirmation.",
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
          { code: "RASTER_FINISH_FAILED", message: error instanceof Error ? error.message : String(error) },
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
