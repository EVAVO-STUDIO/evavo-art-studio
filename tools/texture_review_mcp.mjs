#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import {
  createTextureTileProofWithSampling,
  packGodotOrmTexture,
  reviewTextureMap,
  reviewTextureSet,
  reviewUvLayout,
  reviewWavefrontObjUv,
} from "../packages/media/dist/index.js";
import {
  assertAllowedLocalPath,
  configuredLocalRootCount,
} from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-texture-review";
const SERVER_VERSION = "1.3.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_TEXTURE_REVIEW_ALLOWED_ROOTS";
const WRITE_ENV = "EVAVO_TEXTURE_REVIEW_ALLOW_WRITES";
const MAX_SET_SIZE = 32;
const MAX_UV_TRIANGLES = 5000;

const MAP_KINDS = Object.freeze([
  "base-color",
  "normal-tangent",
  "roughness",
  "metallic",
  "ambient-occlusion",
  "height",
  "specular",
  "emissive",
  "opacity",
  "orm-packed",
]);
const PROOF_SAMPLING = Object.freeze(["continuous", "nearest"]);
const SCALAR_CHANNELS = Object.freeze(["r", "g", "b", "a"]);
const UV_POLICIES = Object.freeze(["ignore", "warn", "reject"]);

const assertAllowed = (filePath, { output = false } = {}) =>
  assertAllowedLocalPath(filePath, {
    envName: ALLOWED_ROOTS_ENV,
    output,
    label: "texture review",
  });

function reviewSpec(args) {
  return {
    kind: args.kind,
    ...(args.expectSeamless === true ? { expectSeamless: true } : {}),
    ...(Number.isFinite(args.maximumSeamError) ? { maximumSeamError: args.maximumSeamError } : {}),
    ...(Number.isFinite(args.maximumScalarColourDeviation) ? { maximumScalarColourDeviation: args.maximumScalarColourDeviation } : {}),
    ...(Number.isFinite(args.minimumNormalBluePositiveRatio) ? { minimumNormalBluePositiveRatio: args.minimumNormalBluePositiveRatio } : {}),
    ...(Number.isFinite(args.maximumNormalLengthError) ? { maximumNormalLengthError: args.maximumNormalLengthError } : {}),
  };
}

function uvReviewSpec(args) {
  return {
    ...(typeof args.allowTiledCoordinates === "boolean" ? { allowTiledCoordinates: args.allowTiledCoordinates } : {}),
    ...(UV_POLICIES.includes(args.overlapPolicy) ? { overlapPolicy: args.overlapPolicy } : {}),
    ...(UV_POLICIES.includes(args.mirroredPolicy) ? { mirroredPolicy: args.mirroredPolicy } : {}),
    ...(Number.isFinite(args.uvAreaEpsilon) ? { uvAreaEpsilon: args.uvAreaEpsilon } : {}),
    ...(Number.isFinite(args.uvEqualityTolerance) ? { uvEqualityTolerance: args.uvEqualityTolerance } : {}),
    ...(Number.isFinite(args.textureWidth) ? { textureWidth: args.textureWidth } : {}),
    ...(Number.isFinite(args.textureHeight) ? { textureHeight: args.textureHeight } : {}),
    ...(Number.isFinite(args.maximumTexelDensityRatio) ? { maximumTexelDensityRatio: args.maximumTexelDensityRatio } : {}),
    ...(Number.isFinite(args.minimumAtlasBoundaryPaddingTexels) ? { minimumAtlasBoundaryPaddingTexels: args.minimumAtlasBoundaryPaddingTexels } : {}),
  };
}

async function reviewTexture(args) {
  if (typeof args.inputPath !== "string") throw new Error("inputPath is required.");
  if (!MAP_KINDS.includes(args.kind)) throw new Error("A supported texture map kind is required.");
  const inputPath = await assertAllowed(args.inputPath);
  const evidence = await reviewTextureMap(await readFile(inputPath), reviewSpec(args));
  return Object.freeze({
    ok: true,
    inputPath,
    evidence,
    interpretation: "Deterministic map/data validation. Material appearance and mesh/UV fit still require runtime visual review.",
    bytesReturned: false,
    sourceModified: false,
  });
}

async function reviewMaterialSet(args) {
  if (!Array.isArray(args.maps) || args.maps.length < 1 || args.maps.length > MAX_SET_SIZE) {
    throw new Error(`maps must contain 1 through ${MAX_SET_SIZE} entries.`);
  }
  const maps = [];
  for (const item of args.maps) {
    if (!item || typeof item.id !== "string" || !item.id.trim() || typeof item.path !== "string" || !MAP_KINDS.includes(item.kind)) {
      throw new Error("Each maps entry requires a non-empty id, path and supported kind.");
    }
    const inputPath = await assertAllowed(item.path);
    maps.push({
      id: item.id,
      kind: item.kind,
      encoded: await readFile(inputPath),
      ...(typeof item.filename === "string" ? { filename: item.filename } : {}),
      ...(typeof item.expectSeamless === "boolean" ? { expectSeamless: item.expectSeamless } : {}),
    });
  }
  const evidence = await reviewTextureSet(maps, {
    ...(Array.isArray(args.expectedKinds) ? { expectedKinds: args.expectedKinds } : {}),
    ...(typeof args.requireMatchingDimensions === "boolean" ? { requireMatchingDimensions: args.requireMatchingDimensions } : {}),
    ...(typeof args.powerOfTwoPolicy === "string" ? { powerOfTwoPolicy: args.powerOfTwoPolicy } : {}),
    ...(typeof args.expectSeamless === "boolean" ? { expectSeamless: args.expectSeamless } : {}),
  });
  return Object.freeze({
    ok: true,
    evidence,
    interpretation: "Validates one coherent material set and Godot import intent; UV placement and final surface appearance remain separate review domains.",
    bytesReturned: false,
    sourcesModified: false,
  });
}

function reviewUvTriangles(args) {
  if (!Array.isArray(args.triangles) || args.triangles.length < 1 || args.triangles.length > MAX_UV_TRIANGLES) {
    throw new Error(`triangles must contain 1 through ${MAX_UV_TRIANGLES} entries.`);
  }
  const evidence = reviewUvLayout(args.triangles, uvReviewSpec(args));
  return Object.freeze({
    ok: true,
    evidence,
    interpretation: "UV topology/coverage assurance only. A passing result does not prove the texture visually aligns with semantic mesh features.",
    sourceModified: false,
  });
}

async function reviewObjUv(args) {
  if (typeof args.inputPath !== "string") throw new Error("inputPath is required.");
  const inputPath = await assertAllowed(args.inputPath);
  const source = await readFile(inputPath, "utf8");
  const result = reviewWavefrontObjUv(source, {
    ...uvReviewSpec(args),
    ...(typeof args.flipVForReview === "boolean" ? { flipVForReview: args.flipVForReview } : {}),
  });
  const { triangles: _triangles, ...extraction } = result.extraction;
  return Object.freeze({
    ok: true,
    inputPath,
    extraction,
    evidence: result.review,
    interpretation: "OBJ faces are triangulated for read-only UV assurance. Faces missing UVs are counted rather than assigned invented coordinates.",
    bytesReturned: false,
    sourceModified: false,
  });
}

function identity(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function requireWriteAdmission(args) {
  if (process.env[WRITE_ENV] !== "true") throw new Error(`Texture review writes are disabled. Set ${WRITE_ENV}=true.`);
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required for this exact write call.");
}

function assertDistinctPaths(sourcePaths, outputPaths) {
  const sources = new Set(sourcePaths.map(identity));
  const outputs = outputPaths.map(identity);
  if (outputs.some((candidate) => sources.has(candidate))) {
    throw new Error("Texture operations are non-destructive: derived outputs must differ from every source path.");
  }
  if (new Set(outputs).size !== outputs.length) throw new Error("Texture derived output and receipt paths must be distinct.");
}

async function assertCreateOnlyTargets(filePaths) {
  for (const filePath of filePaths) {
    try {
      await access(filePath);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") continue;
      throw error;
    }
    throw new Error(`Create-only texture review target already exists: ${filePath}`);
  }
}

async function createOnly(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, { flag: "wx" });
}

async function createTileProof(args) {
  requireWriteAdmission(args);
  if (typeof args.inputPath !== "string" || typeof args.outputPath !== "string") throw new Error("inputPath and outputPath are required.");
  if (!MAP_KINDS.includes(args.kind)) throw new Error("A supported texture map kind is required.");
  const inputPath = await assertAllowed(args.inputPath);
  const outputPath = await assertAllowed(args.outputPath, { output: true });
  const receiptPath = await assertAllowed(typeof args.receiptPath === "string" ? args.receiptPath : `${outputPath}.receipt.json`, { output: true });
  assertDistinctPaths([inputPath], [outputPath, receiptPath]);

  const source = await readFile(inputPath);
  const review = await reviewTextureMap(source, reviewSpec(args));
  const proof = await createTextureTileProofWithSampling(
    source,
    Number.isInteger(args.maximumTileDimension) ? args.maximumTileDimension : 512,
    typeof args.sampling === "string" ? args.sampling : "continuous",
  );
  await assertCreateOnlyTargets([outputPath, receiptPath]);
  const receipt = Object.freeze({
    schemaVersion: "1.3",
    operation: "evavo-texture-tile-proof",
    approvalState: "diagnostic-only",
    inputPath,
    outputPath,
    receiptPath,
    review,
    proof: proof.evidence,
    sourceModified: false,
  });
  await createOnly(outputPath, proof.png);
  await createOnly(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return Object.freeze({ ok: true, outputPath, receiptPath, evidence: review, proof: proof.evidence, approvalState: "diagnostic-only", bytesReturned: false, sourceModified: false });
}

async function readScalarSource(value, label) {
  if (!value) return null;
  if (typeof value.path !== "string") throw new Error(`${label}.path is required.`);
  if (value.channel !== undefined && !SCALAR_CHANNELS.includes(value.channel)) throw new Error(`${label}.channel must be r, g, b or a.`);
  const inputPath = await assertAllowed(value.path);
  return Object.freeze({
    inputPath,
    source: Object.freeze({ encoded: await readFile(inputPath), ...(typeof value.channel === "string" ? { channel: value.channel } : {}) }),
  });
}

async function packGodotOrm(args) {
  requireWriteAdmission(args);
  const ambientOcclusion = await readScalarSource(args.ambientOcclusion, "ambientOcclusion");
  const roughness = await readScalarSource(args.roughness, "roughness");
  const metallic = await readScalarSource(args.metallic, "metallic");
  if (!ambientOcclusion && !roughness && !metallic) throw new Error("At least one ambientOcclusion, roughness or metallic source is required.");
  if (typeof args.outputPath !== "string") throw new Error("outputPath is required.");
  const outputPath = await assertAllowed(args.outputPath, { output: true });
  const receiptPath = await assertAllowed(typeof args.receiptPath === "string" ? args.receiptPath : `${outputPath}.receipt.json`, { output: true });
  const sourcePaths = [ambientOcclusion?.inputPath, roughness?.inputPath, metallic?.inputPath].filter(Boolean);
  assertDistinctPaths(sourcePaths, [outputPath, receiptPath]);
  await assertCreateOnlyTargets([outputPath, receiptPath]);

  const packed = await packGodotOrmTexture({
    ...(ambientOcclusion ? { ambientOcclusion: ambientOcclusion.source } : {}),
    ...(roughness ? { roughness: roughness.source } : {}),
    ...(metallic ? { metallic: metallic.source } : {}),
    ...(Number.isInteger(args.defaultAmbientOcclusion) ? { defaultAmbientOcclusion: args.defaultAmbientOcclusion } : {}),
    ...(Number.isInteger(args.defaultRoughness) ? { defaultRoughness: args.defaultRoughness } : {}),
    ...(Number.isInteger(args.defaultMetallic) ? { defaultMetallic: args.defaultMetallic } : {}),
    strictScalarValidation: args.strictScalarValidation !== false,
  });
  const postReview = await reviewTextureMap(packed.png, { kind: "orm-packed", ...(args.expectSeamless === true ? { expectSeamless: true } : {}) });
  if (postReview.grade === "fail") throw new Error(`Packed ORM failed post-pack review: ${postReview.blockers.join(", ") || "texture-review-failed"}`);
  const receipt = Object.freeze({
    schemaVersion: "1.3",
    operation: "evavo-pack-godot-orm-texture",
    approvalState: "unapproved",
    sourcePaths,
    outputPath,
    receiptPath,
    packing: packed.evidence,
    postReview,
    sourceModified: false,
  });
  await createOnly(outputPath, packed.png);
  await createOnly(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return Object.freeze({ ok: true, outputPath, receiptPath, packing: packed.evidence, postReview, approvalState: "unapproved", bytesReturned: false, sourcesModified: false });
}

const reviewProperties = Object.freeze({
  inputPath: { type: "string", minLength: 1 },
  kind: { type: "string", enum: MAP_KINDS },
  expectSeamless: { type: "boolean" },
  maximumSeamError: { type: "number", minimum: 0, maximum: 1 },
  maximumScalarColourDeviation: { type: "number", minimum: 0, maximum: 1 },
  minimumNormalBluePositiveRatio: { type: "number", minimum: 0, maximum: 1 },
  maximumNormalLengthError: { type: "number", minimum: 0, maximum: 1 },
});
const uvProperties = Object.freeze({
  allowTiledCoordinates: { type: "boolean" },
  overlapPolicy: { type: "string", enum: UV_POLICIES },
  mirroredPolicy: { type: "string", enum: UV_POLICIES },
  uvAreaEpsilon: { type: "number", exclusiveMinimum: 0 },
  uvEqualityTolerance: { type: "number", exclusiveMinimum: 0 },
  textureWidth: { type: "number", exclusiveMinimum: 0 },
  textureHeight: { type: "number", exclusiveMinimum: 0 },
  maximumTexelDensityRatio: { type: "number", minimum: 1 },
  minimumAtlasBoundaryPaddingTexels: { type: "number", minimum: 0 },
});
const uvPointSchema = Object.freeze({
  type: "object",
  properties: { u: { type: "number" }, v: { type: "number" } },
  required: ["u", "v"],
  additionalProperties: false,
});
const positionSchema = Object.freeze({
  type: "object",
  properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } },
  required: ["x", "y", "z"],
  additionalProperties: false,
});
const scalarSourceSchema = Object.freeze({
  type: "object",
  properties: { path: { type: "string", minLength: 1 }, channel: { type: "string", enum: SCALAR_CHANNELS } },
  required: ["path"],
  additionalProperties: false,
});

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_texture_review_capabilities",
    description: "Describe map-aware texture review, coherent material-set validation, UV/OBJ assurance, diagnostic tile proofs and explicit Godot ORM packing.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_review_texture_map",
    description: "Review one local texture/map without changing it. Checks channel semantics, scalar contamination, tangent-normal plausibility and optional seamless edge continuity.",
    inputSchema: { type: "object", properties: reviewProperties, required: ["inputPath", "kind"], additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_review_texture_set",
    description: "Review a complete PBR material set as one asset, including dimensions, required roles, map defects and Godot import/material guidance.",
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
    name: "evavo_review_uv_layout",
    description: "Read-only UV layout assurance from already-extracted triangle UV/world-position data. Detects degenerates, accidental overlap, mirrored winding, out-of-range UVs, texel-density outliers and atlas boundary padding.",
    inputSchema: {
      type: "object",
      properties: {
        triangles: {
          type: "array",
          minItems: 1,
          maxItems: MAX_UV_TRIANGLES,
          items: {
            type: "object",
            properties: {
              id: { type: "string", minLength: 1 },
              uv: { type: "array", minItems: 3, maxItems: 3, items: uvPointSchema },
              position: { type: "array", minItems: 3, maxItems: 3, items: positionSchema },
              overlapGroup: { type: "string", minLength: 1 },
            },
            required: ["id", "uv"],
            additionalProperties: false,
          },
        },
        ...uvProperties,
      },
      required: ["triangles"],
      additionalProperties: false,
    },
  }),
  Object.freeze({
    name: "evavo_review_obj_uv_layout",
    description: "Read a local Wavefront OBJ, triangulate polygon faces, preserve authored UVs and review the resulting layout without modifying the mesh. Faces with missing UVs are counted, not fabricated.",
    inputSchema: {
      type: "object",
      properties: { inputPath: { type: "string", minLength: 1 }, flipVForReview: { type: "boolean" }, ...uvProperties },
      required: ["inputPath"],
      additionalProperties: false,
    },
  }),
  Object.freeze({
    name: "evavo_create_texture_tile_proof",
    description: "Create a diagnostic 3x3 tile proof plus receipt using create-only paths. Continuous textures default to Lanczos3 proof resizing; nearest is explicit for texel inspection.",
    inputSchema: {
      type: "object",
      properties: {
        ...reviewProperties,
        outputPath: { type: "string", minLength: 1 },
        receiptPath: { type: "string", minLength: 1 },
        maximumTileDimension: { type: "integer", minimum: 64, maximum: 2048 },
        sampling: { type: "string", enum: PROOF_SAMPLING },
        confirmLocalWrite: { type: "boolean", const: true },
      },
      required: ["inputPath", "kind", "outputPath", "confirmLocalWrite"],
      additionalProperties: false,
    },
  }),
  Object.freeze({
    name: "evavo_pack_godot_orm_texture",
    description: "Losslessly pack AO, roughness and metallic scalar inputs into R/G/B for Godot ORMMaterial3D. Create-only, explicitly write-gated and post-reviewed.",
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
      anyOf: [{ required: ["ambientOcclusion"] }, { required: ["roughness"] }, { required: ["metallic"] }],
      additionalProperties: false,
    },
  }),
]);

async function callTool(name, args) {
  if (name === "evavo_texture_review_capabilities") {
    return Object.freeze({
      contract: "evavo_texture_review_agent_v1_3",
      mapKinds: MAP_KINDS,
      tools: tools.map((tool) => tool.name),
      proofSampling: {
        default: "continuous",
        continuous: "Lanczos3 only when a proof tile must be downsized.",
        nearest: "Opt-in for pixel art or exact texel/block inspection.",
      },
      checks: [
        "opposite-edge-seam-error",
        "scalar-rgb-contamination",
        "tangent-normal-vector-plausibility",
        "material-set-dimension-and-role-consistency",
        "power-of-two-policy",
        "godot-colour-vs-linear-data-intent",
        "uv-degenerate-overlap-mirror-range-and-padding",
        "world-space-texel-density-consistency",
        "wavefront-obj-uv-extraction",
        "sampling-aware-bounded-3x3-tile-proof",
      ],
      godot: {
        normalConvention: "OpenGL X+ Y+ Z+",
        ormChannels: "R=ambient-occlusion,G=roughness,B=metallic",
        materials: ["StandardMaterial3D", "ORMMaterial3D"],
      },
      engineNote: "Normal channel conversion and ORM packing are explicit. UV review is separate from semantic mesh/material visual review.",
      aiOriginDetection: "not claimed",
      writesEnabled: process.env[WRITE_ENV] === "true",
      allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
      bytesReturned: false,
      sourceMutationAllowed: false,
      createOnlyDerivedOutputs: true,
    });
  }
  if (name === "evavo_review_texture_map") return reviewTexture(args ?? {});
  if (name === "evavo_review_texture_set") return reviewMaterialSet(args ?? {});
  if (name === "evavo_review_uv_layout") return reviewUvTriangles(args ?? {});
  if (name === "evavo_review_obj_uv_layout") return reviewObjUv(args ?? {});
  if (name === "evavo_create_texture_tile_proof") return createTileProof(args ?? {});
  if (name === "evavo_pack_godot_orm_texture") return packGodotOrm(args ?? {});
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
        instructions: `Texture/material/UV review is local-first. Configure ${ALLOWED_ROOTS_ENV}; derived writes additionally require ${WRITE_ENV}=true and confirmLocalWrite=true. Sources and meshes are never modified.`,
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
        result: result({ code: "TEXTURE_REVIEW_FAILED", message: error instanceof Error ? error.message : String(error) }, true),
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
