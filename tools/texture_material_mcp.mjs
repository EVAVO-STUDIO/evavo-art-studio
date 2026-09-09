#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import {
  createTextureTileProofWithSampling,
  packGodotOrmTexture,
  reviewTextureMap,
  reviewTextureSet,
} from "../packages/media/dist/index.js";
import {
  assertAllowedLocalPath,
  configuredLocalRootCount,
} from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-texture-material";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_TEXTURE_MATERIAL_ALLOWED_ROOTS";
const WRITE_ENV = "EVAVO_TEXTURE_MATERIAL_ALLOW_WRITES";
const MAX_SET_SIZE = 32;

const MAP_KINDS = Object.freeze([
  "base-color",
  "normal-tangent",
  "roughness",
  "metallic",
  "ambient-occlusion",
  "height",
  "emissive",
  "opacity",
  "specular",
  "orm-packed",
]);
const SCALAR_CHANNELS = Object.freeze(["r", "g", "b", "a"]);

const assertAllowed = (filePath, { output = false } = {}) =>
  assertAllowedLocalPath(filePath, {
    envName: ALLOWED_ROOTS_ENV,
    output,
    label: "texture material",
  });

function requireWriteAdmission(args) {
  if (process.env[WRITE_ENV] !== "true") {
    throw new Error(`Texture material writes are disabled. Set ${WRITE_ENV}=true.`);
  }
  if (args.confirmLocalWrite !== true) {
    throw new Error("confirmLocalWrite=true is required for this exact texture material write.");
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
    throw new Error("Texture material operations are non-destructive: output paths must differ from every source input.");
  }
  if (new Set(outputs).size !== outputs.length) {
    throw new Error("Texture material output and receipt paths must be distinct.");
  }
}

async function assertCreateOnlyTargets(filePaths) {
  for (const filePath of filePaths) {
    try {
      await access(filePath);
    } catch {
      continue;
    }
    throw new Error(`Create-only texture target already exists: ${filePath}`);
  }
}

async function createOnly(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, { flag: "wx" });
}

async function resolveOutputPair(args, suffix) {
  if (typeof args.outputPath !== "string") throw new Error("outputPath is required.");
  const outputPath = await assertAllowed(args.outputPath, { output: true });
  const receiptPath = await assertAllowed(
    typeof args.receiptPath === "string" ? args.receiptPath : `${outputPath}.${suffix}.receipt.json`,
    { output: true },
  );
  return { outputPath, receiptPath };
}

function mapSpec(args) {
  return {
    kind: args.kind,
    ...(args.expectSeamless === true ? { expectSeamless: true } : {}),
    ...(Number.isFinite(args.maximumOppositeEdgeMismatch) ? { maximumOppositeEdgeMismatch: args.maximumOppositeEdgeMismatch } : {}),
  };
}

async function reviewOne(args) {
  if (typeof args.inputPath !== "string") throw new Error("inputPath is required.");
  if (!MAP_KINDS.includes(args.kind)) throw new Error("kind is required and must be a supported texture map kind.");
  const inputPath = await assertAllowed(args.inputPath);
  const review = await reviewTextureMap(await readFile(inputPath), mapSpec(args));
  return Object.freeze({ ok: true, inputPath, review, bytesReturned: false, sourceModified: false });
}

async function reviewSet(args) {
  if (!Array.isArray(args.maps) || args.maps.length < 1 || args.maps.length > MAX_SET_SIZE) {
    throw new Error(`maps must contain 1 through ${MAX_SET_SIZE} entries.`);
  }
  const sourceMaps = [];
  for (const item of args.maps) {
    if (!item || typeof item.id !== "string" || !item.id.trim() || typeof item.path !== "string" || !MAP_KINDS.includes(item.kind)) {
      throw new Error("Each maps entry requires id, path and a supported kind.");
    }
    const resolved = await assertAllowed(item.path);
    sourceMaps.push({
      id: item.id,
      kind: item.kind,
      encoded: await readFile(resolved),
      ...(typeof item.filename === "string" ? { filename: item.filename } : {}),
      ...(typeof item.expectSeamless === "boolean" ? { expectSeamless: item.expectSeamless } : {}),
    });
  }
  const result = await reviewTextureSet(sourceMaps, {
    ...(Array.isArray(args.expectedKinds) ? { expectedKinds: args.expectedKinds } : {}),
    ...(typeof args.requireMatchingDimensions === "boolean" ? { requireMatchingDimensions: args.requireMatchingDimensions } : {}),
    ...(typeof args.powerOfTwoPolicy === "string" ? { powerOfTwoPolicy: args.powerOfTwoPolicy } : {}),
    ...(typeof args.expectSeamless === "boolean" ? { expectSeamless: args.expectSeamless } : {}),
  });
  return Object.freeze({ ok: true, review: result, bytesReturned: false, sourcesModified: false });
}

async function createTileProof(args) {
  requireWriteAdmission(args);
  if (typeof args.inputPath !== "string") throw new Error("inputPath is required.");
  const inputPath = await assertAllowed(args.inputPath);
  const outputSet = await resolveOutputPair(args, "tile-proof");
  assertDistinctPaths([inputPath], Object.values(outputSet));
  await assertCreateOnlyTargets(Object.values(outputSet));

  const source = await readFile(inputPath);
  const proof = await createTextureTileProofWithSampling(
    source,
    Number.isInteger(args.maximumTileDimension) ? args.maximumTileDimension : 512,
    args.sampling === "nearest" ? "nearest" : "continuous",
  );
  const receipt = Object.freeze({
    schemaVersion: "1.0",
    operation: "evavo-texture-tile-proof",
    sourcePath: inputPath,
    outputPath: outputSet.outputPath,
    receiptPath: outputSet.receiptPath,
    evidence: proof.evidence,
    approvalState: "diagnostic-only",
    sourceModified: false,
  });
  await createOnly(outputSet.outputPath, proof.png);
  await createOnly(outputSet.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return Object.freeze({ ok: true, ...outputSet, evidence: proof.evidence, approvalState: "diagnostic-only", bytesReturned: false, sourceModified: false });
}

async function readScalarSource(value, label) {
  if (!value) return null;
  if (typeof value.path !== "string") throw new Error(`${label}.path is required.`);
  if (value.channel !== undefined && !SCALAR_CHANNELS.includes(value.channel)) throw new Error(`${label}.channel must be r, g, b or a.`);
  const resolved = await assertAllowed(value.path);
  return Object.freeze({
    path: resolved,
    source: Object.freeze({
      encoded: await readFile(resolved),
      ...(typeof value.channel === "string" ? { channel: value.channel } : {}),
    }),
  });
}

async function packOrm(args) {
  requireWriteAdmission(args);
  const ao = await readScalarSource(args.ambientOcclusion, "ambientOcclusion");
  const roughness = await readScalarSource(args.roughness, "roughness");
  const metallic = await readScalarSource(args.metallic, "metallic");
  if (!ao && !roughness && !metallic) throw new Error("At least one ORM scalar source is required.");

  const outputSet = await resolveOutputPair(args, "orm-pack");
  const sourcePaths = [ao?.path, roughness?.path, metallic?.path].filter(Boolean);
  assertDistinctPaths(sourcePaths, Object.values(outputSet));
  await assertCreateOnlyTargets(Object.values(outputSet));

  const packed = await packGodotOrmTexture({
    ...(ao ? { ambientOcclusion: ao.source } : {}),
    ...(roughness ? { roughness: roughness.source } : {}),
    ...(metallic ? { metallic: metallic.source } : {}),
    ...(Number.isInteger(args.defaultAmbientOcclusion) ? { defaultAmbientOcclusion: args.defaultAmbientOcclusion } : {}),
    ...(Number.isInteger(args.defaultRoughness) ? { defaultRoughness: args.defaultRoughness } : {}),
    ...(Number.isInteger(args.defaultMetallic) ? { defaultMetallic: args.defaultMetallic } : {}),
    strictScalarValidation: args.strictScalarValidation !== false,
  });
  const postReview = await reviewTextureMap(packed.png, {
    kind: "orm-packed",
    ...(args.expectSeamless === true ? { expectSeamless: true } : {}),
  });
  if (postReview.grade === "fail") {
    throw new Error(`Packed ORM failed post-pack review: ${postReview.blockers.join(", ") || "texture-review-failed"}`);
  }

  const receipt = Object.freeze({
    schemaVersion: "1.0",
    operation: "evavo-pack-godot-orm-texture",
    sourcePaths,
    outputPath: outputSet.outputPath,
    receiptPath: outputSet.receiptPath,
    packing: packed.evidence,
    postReview,
    approvalState: "unapproved",
    sourceModified: false,
  });
  await createOnly(outputSet.outputPath, packed.png);
  await createOnly(outputSet.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return Object.freeze({
    ok: true,
    ...outputSet,
    packing: packed.evidence,
    postReview,
    approvalState: "unapproved",
    bytesReturned: false,
    sourcesModified: false,
  });
}

const scalarSourceSchema = Object.freeze({
  type: "object",
  properties: {
    path: { type: "string", minLength: 1 },
    channel: { type: "string", enum: SCALAR_CHANNELS },
  },
  required: ["path"],
  additionalProperties: false,
});

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_texture_material_capabilities",
    description: "Describe texture-map, material-set, tile-proof and Godot ORM packing capabilities for compatible MCP agents.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_review_texture_map",
    description: "Read-only map-aware technical review for albedo, tangent normal, roughness, metallic, AO, height, emissive, opacity, specular or packed ORM textures.",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: { type: "string", minLength: 1 },
        kind: { type: "string", enum: MAP_KINDS },
        expectSeamless: { type: "boolean" },
        maximumOppositeEdgeMismatch: { type: "number", minimum: 0, maximum: 255 },
      },
      required: ["inputPath", "kind"],
      additionalProperties: false,
    },
  }),
  Object.freeze({
    name: "evavo_review_texture_set",
    description: "Read-only validation of one coherent PBR material set, including dimensions, required map roles, per-map defects and Godot import/material guidance.",
    inputSchema: {
      type: "object",
      properties: {
        maps: {
          type: "array",
          minItems: 1,
          maxItems: MAX_SET_SIZE,
          items: {
            type: "object",
            properties: {
              id: { type: "string", minLength: 1 },
              path: { type: "string", minLength: 1 },
              kind: { type: "string", enum: MAP_KINDS },
              filename: { type: "string", minLength: 1 },
              expectSeamless: { type: "boolean" },
            },
            required: ["id", "path", "kind"],
            additionalProperties: false,
          },
        },
        expectedKinds: { type: "array", uniqueItems: true, items: { type: "string", enum: MAP_KINDS } },
        requireMatchingDimensions: { type: "boolean" },
        powerOfTwoPolicy: { type: "string", enum: ["ignore", "warn", "require"] },
        expectSeamless: { type: "boolean" },
      },
      required: ["maps"],
      additionalProperties: false,
    },
  }),
  Object.freeze({
    name: "evavo_create_texture_tile_proof",
    description: "Create a non-destructive 3x3 diagnostic tile proof for visual seam inspection. Write-gated and create-only.",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: { type: "string", minLength: 1 },
        outputPath: { type: "string", minLength: 1 },
        receiptPath: { type: "string", minLength: 1 },
        maximumTileDimension: { type: "integer", minimum: 64, maximum: 2048 },
        sampling: { type: "string", enum: ["continuous", "nearest"] },
        confirmLocalWrite: { type: "boolean", const: true },
      },
      required: ["inputPath", "outputPath", "confirmLocalWrite"],
      additionalProperties: false,
    },
  }),
  Object.freeze({
    name: "evavo_pack_godot_orm_texture",
    description: "Losslessly pack AO, roughness and metallic scalar sources into Godot ORM channels R/G/B. Write-gated, create-only and post-reviewed before output.",
    inputSchema: {
      type: "object",
      properties: {
        ambientOcclusion: scalarSourceSchema,
        roughness: scalarSourceSchema,
        metallic: scalarSourceSchema,
        defaultAmbientOcclusion: { type: "integer", minimum: 0, maximum: 255 },
        defaultRoughness: { type: "integer", minimum: 0, maximum: 255 },
        defaultMetallic: { type: "integer", minimum: 0, maximum: 255 },
        strictScalarValidation: { type: "boolean" },
        expectSeamless: { type: "boolean" },
        outputPath: { type: "string", minLength: 1 },
        receiptPath: { type: "string", minLength: 1 },
        confirmLocalWrite: { type: "boolean", const: true },
      },
      required: ["outputPath", "confirmLocalWrite"],
      anyOf: [
        { required: ["ambientOcclusion"] },
        { required: ["roughness"] },
        { required: ["metallic"] },
      ],
      additionalProperties: false,
    },
  }),
]);

async function callTool(name, args) {
  if (name === "evavo_texture_material_capabilities") {
    return Object.freeze({
      contract: "evavo_texture_material_mcp_v1",
      mode: "review-plus-write-gated-derived-assets",
      tools: tools.map((tool) => tool.name),
      mapKinds: MAP_KINDS,
      godot: Object.freeze({
        ormChannels: "R=ambient-occlusion,G=roughness,B=metallic",
        normalConvention: "OpenGL X+ Y+ Z+",
        materials: ["StandardMaterial3D", "ORMMaterial3D"],
      }),
      guarantees: Object.freeze({
        sourceMutationAllowed: false,
        createOnlyOutputs: true,
        explicitWriteConfirmation: true,
        bytesReturned: false,
      }),
      allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
    });
  }
  if (name === "evavo_review_texture_map") return reviewOne(args ?? {});
  if (name === "evavo_review_texture_set") return reviewSet(args ?? {});
  if (name === "evavo_create_texture_tile_proof") return createTileProof(args ?? {});
  if (name === "evavo_pack_godot_orm_texture") return packOrm(args ?? {});
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
        instructions: `Texture/material review plus guarded derived-asset writes. Configure ${ALLOWED_ROOTS_ENV}; writes additionally require ${WRITE_ENV}=true and confirmLocalWrite=true. Sources are never modified.`,
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
        result: result({ code: "TEXTURE_MATERIAL_TOOL_FAILED", message: error instanceof Error ? error.message : String(error) }, true),
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
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  }).catch((error) => {
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: error instanceof Error ? error.message : String(error) } })}\n`);
  });
});
