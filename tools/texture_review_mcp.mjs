#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import { createTextureTileProof, reviewTextureMap } from "../packages/media/dist/index.js";
import {
  assertAllowedLocalPath,
  configuredLocalRootCount,
} from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-texture-review";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_TEXTURE_REVIEW_ALLOWED_ROOTS";
const WRITE_ENV = "EVAVO_TEXTURE_REVIEW_ALLOW_WRITES";

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

async function reviewTexture(args) {
  if (typeof args.inputPath !== "string") throw new Error("inputPath is required.");
  if (!MAP_KINDS.includes(args.kind)) throw new Error("A supported texture map kind is required.");
  const inputPath = await assertAllowed(args.inputPath);
  const evidence = await reviewTextureMap(await readFile(inputPath), reviewSpec(args));
  return Object.freeze({
    ok: true,
    inputPath,
    evidence,
    interpretation: "This is deterministic map/data validation. Material appearance, texel density, UV correctness and shader intent still require runtime visual review.",
    bytesReturned: false,
    sourceModified: false,
  });
}

function identity(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
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
  if (process.env[WRITE_ENV] !== "true") {
    throw new Error(`Texture review writes are disabled. Set ${WRITE_ENV}=true.`);
  }
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required for this exact proof call.");
  if (typeof args.inputPath !== "string" || typeof args.outputPath !== "string") {
    throw new Error("inputPath and outputPath are required.");
  }
  if (!MAP_KINDS.includes(args.kind)) throw new Error("A supported texture map kind is required.");

  const inputPath = await assertAllowed(args.inputPath);
  const outputPath = await assertAllowed(args.outputPath, { output: true });
  const receiptPath = await assertAllowed(
    typeof args.receiptPath === "string" ? args.receiptPath : `${outputPath}.receipt.json`,
    { output: true },
  );
  if (identity(inputPath) === identity(outputPath) || identity(inputPath) === identity(receiptPath)) {
    throw new Error("Texture proofs are non-destructive: output and receipt must differ from the source.");
  }
  if (identity(outputPath) === identity(receiptPath)) {
    throw new Error("Texture proof output and receipt paths must be distinct.");
  }

  const source = await readFile(inputPath);
  const review = await reviewTextureMap(source, reviewSpec(args));
  const proof = await createTextureTileProof(
    source,
    Number.isInteger(args.maximumTileDimension) ? args.maximumTileDimension : 512,
  );
  await assertCreateOnlyTargets([outputPath, receiptPath]);

  const receipt = Object.freeze({
    schemaVersion: "1.0",
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
  return Object.freeze({
    ok: true,
    outputPath,
    receiptPath,
    evidence: review,
    proof: proof.evidence,
    approvalState: "diagnostic-only",
    bytesReturned: false,
    sourceModified: false,
  });
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

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_texture_review_capabilities",
    description: "Describe texture/data-map review for base colour, tangent normals, scalar PBR maps, emissive, opacity and packed ORM assets.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_review_texture_map",
    description: "Review one local texture/map without changing it. Checks channel semantics, scalar contamination, tangent-normal plausibility and optional seamless edge continuity.",
    inputSchema: {
      type: "object",
      properties: reviewProperties,
      required: ["inputPath", "kind"],
      additionalProperties: false,
    },
  }),
  Object.freeze({
    name: "evavo_create_texture_tile_proof",
    description: "Create a diagnostic 3x3 repeated tile proof plus JSON receipt using create-only paths. Useful for visually confirming seamlessness and repeated motifs.",
    inputSchema: {
      type: "object",
      properties: {
        ...reviewProperties,
        outputPath: { type: "string", minLength: 1 },
        receiptPath: { type: "string", minLength: 1 },
        maximumTileDimension: { type: "integer", minimum: 64, maximum: 2048 },
        confirmLocalWrite: { type: "boolean", const: true },
      },
      required: ["inputPath", "kind", "outputPath", "confirmLocalWrite"],
      additionalProperties: false,
    },
  }),
]);

async function callTool(name, args) {
  if (name === "evavo_texture_review_capabilities") {
    return Object.freeze({
      contract: "evavo_texture_review_agent_v1",
      mapKinds: MAP_KINDS,
      checks: [
        "opposite-edge-seam-error",
        "scalar-rgb-contamination",
        "per-channel-range-and-clipping",
        "tangent-normal-blue-positive-ratio",
        "normal-vector-length-error",
        "packed-map-alpha-warning",
        "map-specific-visual-checklist",
        "bounded-3x3-tile-proof",
      ],
      engineNote: "Normal green-channel convention and packed-channel assignment must be verified against the target Godot/material shader; the reviewer will not silently flip or repack channels.",
      aiOriginDetection: "not claimed",
      writesEnabled: process.env[WRITE_ENV] === "true",
      allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
      bytesReturned: false,
      sourceMutationAllowed: false,
    });
  }
  if (name === "evavo_review_texture_map") return reviewTexture(args ?? {});
  if (name === "evavo_create_texture_tile_proof") return createTileProof(args ?? {});
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
  if (request?.jsonrpc !== "2.0") {
    return { jsonrpc: "2.0", id: request?.id ?? null, error: { code: -32600, message: "Invalid Request" } };
  }
  if (request.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions: `Texture review is local-first. Configure ${ALLOWED_ROOTS_ENV}; diagnostic proof writes additionally require ${WRITE_ENV}=true and confirmLocalWrite=true.`,
      },
    };
  }
  if (request.method === "ping") return { jsonrpc: "2.0", id: request.id, result: {} };
  if (request.method === "tools/list") return { jsonrpc: "2.0", id: request.id, result: { tools } };
  if (request.method === "tools/call") {
    try {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: result(await callTool(request.params?.name, request.params?.arguments)),
      };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: result(
          { code: "TEXTURE_REVIEW_FAILED", message: error instanceof Error ? error.message : String(error) },
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
