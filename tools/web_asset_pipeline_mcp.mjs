#!/usr/bin/env node

import readline from "node:readline";

import {
  allowedRootsFromEnv,
  pipelineCapabilities,
  prepareWebAssets,
  publishWebAssets,
  searchCloudinaryAssets,
  stageWebAssetSource,
  validateManifestFile,
  WebAssetPipelineError,
} from "./web_asset_pipeline.mjs";

const SERVER_NAME = "evavo-web-asset-pipeline";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";

const STRING = Object.freeze({ type: "string", minLength: 1 });

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_web_asset_capabilities",
    description:
      "Describe the governed raster intake, Art Studio mastering, optimization and Cloudinary publication contract. Returns no image bytes or credentials.",
    inputSchema: Object.freeze({
      type: "object",
      properties: Object.freeze({}),
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: "evavo_cloudinary_search_assets",
    description:
      "Search existing Cloudinary image inventory before generating or uploading another raster. This call is read-only, uses server-side credentials, and returns bounded metadata rather than image bytes.",
    inputSchema: Object.freeze({
      type: "object",
      properties: Object.freeze({
        expression: Object.freeze({ type: "string", minLength: 1, maxLength: 500 }),
        maxResults: Object.freeze({ type: "integer", minimum: 1, maximum: 100 }),
        nextCursor: Object.freeze({ type: "string", minLength: 1, maxLength: 1024 }),
        includeTier2Fields: Object.freeze({ type: "boolean" }),
      }),
      required: Object.freeze(["expression"]),
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: "evavo_web_asset_stage_source",
    description:
      "Copy exact raster bytes from an allowed connector or workspace staging root into an allowed governed intake workspace and return the manifest source block. Requires the local write gate and per-call confirmation; returns no image bytes.",
    inputSchema: Object.freeze({
      type: "object",
      properties: Object.freeze({
        sourceRoot: STRING,
        sourcePath: STRING,
        workspaceRoot: STRING,
        destinationPath: STRING,
        surface: Object.freeze({
          type: "string",
          enum: Object.freeze([
            "attachment",
            "chatgpt-conversation",
            "chatgpt-library",
            "cloudinary",
            "evavo-storage",
            "local-file",
            "workspace",
          ]),
        }),
        originalName: STRING,
        originRef: STRING,
        mediaType: STRING,
        confirmLocalWrite: Object.freeze({ type: "boolean", const: true }),
      }),
      required: Object.freeze([
        "sourceRoot",
        "sourcePath",
        "workspaceRoot",
        "destinationPath",
        "surface",
        "originalName",
        "confirmLocalWrite",
      ]),
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: "evavo_web_asset_validate_manifest",
    description:
      "Validate one manifest and its provenance contract. This is read-only and does not decode or return source bytes.",
    inputSchema: Object.freeze({
      type: "object",
      properties: Object.freeze({
        workspaceRoot: STRING,
        manifestPath: STRING,
      }),
      required: Object.freeze(["workspaceRoot", "manifestPath"]),
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: "evavo_web_asset_prepare",
    description:
      "Verify exact staged raster bytes, finish or recover alpha through Art Studio, and create a lossless PNG master plus optimized WebP derivative. Requires the local write gate; does not publish.",
    inputSchema: Object.freeze({
      type: "object",
      properties: Object.freeze({
        workspaceRoot: STRING,
        manifestPath: STRING,
        outputRoot: STRING,
        confirmLocalWrite: Object.freeze({ type: "boolean", const: true }),
      }),
      required: Object.freeze([
        "workspaceRoot",
        "manifestPath",
        "outputRoot",
        "confirmLocalWrite",
      ]),
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: "evavo_web_asset_publish",
    description:
      "Reverify an exact prepared plan and create Cloudinary image assets with deterministic public IDs, metadata and code references. Requires independent local and Cloudinary write gates plus confirmation for this call.",
    inputSchema: Object.freeze({
      type: "object",
      properties: Object.freeze({
        workspaceRoot: STRING,
        planPath: STRING,
        confirmCloudinaryWrite: Object.freeze({ type: "boolean", const: true }),
      }),
      required: Object.freeze([
        "workspaceRoot",
        "planPath",
        "confirmCloudinaryWrite",
      ]),
      additionalProperties: false,
    }),
  }),
]);

function exactArguments(value, allowed, required) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new WebAssetPipelineError(
      "WEB_ASSET_MCP_ARGUMENTS_INVALID",
      "Tool arguments must be an object.",
    );
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new WebAssetPipelineError(
        "WEB_ASSET_MCP_ARGUMENTS_INVALID",
        `Unsupported tool argument ${JSON.stringify(key)}.`,
      );
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      throw new WebAssetPipelineError(
        "WEB_ASSET_MCP_ARGUMENTS_INVALID",
        `Missing required tool argument ${key}.`,
      );
    }
  }
  return value;
}

function exactString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new WebAssetPipelineError(
      "WEB_ASSET_MCP_ARGUMENTS_INVALID",
      `${label} must be a non-empty string.`,
    );
  }
  return value;
}

function environmentBoolean(name) {
  return process.env[name] === "true";
}

function allowedRoots() {
  return allowedRootsFromEnv(process.env);
}

async function callTool(name, rawArguments) {
  if (name === "evavo_web_asset_capabilities") {
    exactArguments(rawArguments ?? {}, new Set(), []);
    return pipelineCapabilities();
  }
  if (name === "evavo_cloudinary_search_assets") {
    const args = exactArguments(
      rawArguments,
      new Set([
        "expression",
        "includeTier2Fields",
        "maxResults",
        "nextCursor",
      ]),
      ["expression"],
    );
    return searchCloudinaryAssets({
      cloudinaryUrl: process.env.CLOUDINARY_URL,
      expression: exactString(args.expression, "expression"),
      ...(args.maxResults === undefined ? {} : { maxResults: args.maxResults }),
      ...(args.nextCursor === undefined
        ? {}
        : { nextCursor: exactString(args.nextCursor, "nextCursor") }),
      ...(args.includeTier2Fields === undefined
        ? {}
        : { includeTier2Fields: args.includeTier2Fields }),
    });
  }
  if (name === "evavo_web_asset_stage_source") {
    const args = exactArguments(
      rawArguments,
      new Set([
        "confirmLocalWrite",
        "destinationPath",
        "mediaType",
        "originRef",
        "originalName",
        "sourcePath",
        "sourceRoot",
        "surface",
        "workspaceRoot",
      ]),
      [
        "sourceRoot",
        "sourcePath",
        "workspaceRoot",
        "destinationPath",
        "surface",
        "originalName",
        "confirmLocalWrite",
      ],
    );
    return stageWebAssetSource({
      sourceRoot: exactString(args.sourceRoot, "sourceRoot"),
      sourcePath: exactString(args.sourcePath, "sourcePath"),
      workspaceRoot: exactString(args.workspaceRoot, "workspaceRoot"),
      destinationPath: exactString(args.destinationPath, "destinationPath"),
      surface: exactString(args.surface, "surface"),
      originalName: exactString(args.originalName, "originalName"),
      ...(args.originRef === undefined
        ? {}
        : { originRef: exactString(args.originRef, "originRef") }),
      ...(args.mediaType === undefined
        ? {}
        : { mediaType: exactString(args.mediaType, "mediaType") }),
      allowedRoots: allowedRoots(),
      allowWrites: environmentBoolean("EVAVO_WEB_ASSET_ALLOW_WRITES"),
      confirmLocalWrite: args.confirmLocalWrite === true,
    });
  }
  if (name === "evavo_web_asset_validate_manifest") {
    const args = exactArguments(
      rawArguments,
      new Set(["workspaceRoot", "manifestPath"]),
      ["workspaceRoot", "manifestPath"],
    );
    const result = await validateManifestFile({
      workspaceRoot: exactString(args.workspaceRoot, "workspaceRoot"),
      manifestPath: exactString(args.manifestPath, "manifestPath"),
      allowedRoots: allowedRoots(),
    });
    return Object.freeze({
      valid: true,
      batchId: result.manifest.batchId,
      assets: result.manifest.assets.length,
      manifestPath: result.manifestPath,
      sourceBytesReturned: false,
    });
  }
  if (name === "evavo_web_asset_prepare") {
    const args = exactArguments(
      rawArguments,
      new Set(["workspaceRoot", "manifestPath", "outputRoot", "confirmLocalWrite"]),
      ["workspaceRoot", "manifestPath", "outputRoot", "confirmLocalWrite"],
    );
    if (args.confirmLocalWrite !== true) {
      throw new WebAssetPipelineError(
        "WEB_ASSET_LOCAL_CONFIRMATION_REQUIRED",
        "Preparation requires confirmLocalWrite=true for this exact call.",
      );
    }
    return prepareWebAssets({
      workspaceRoot: exactString(args.workspaceRoot, "workspaceRoot"),
      manifestPath: exactString(args.manifestPath, "manifestPath"),
      outputRoot: exactString(args.outputRoot, "outputRoot"),
      allowedRoots: allowedRoots(),
      allowWrites: environmentBoolean("EVAVO_WEB_ASSET_ALLOW_WRITES"),
    });
  }
  if (name === "evavo_web_asset_publish") {
    const args = exactArguments(
      rawArguments,
      new Set(["workspaceRoot", "planPath", "confirmCloudinaryWrite"]),
      ["workspaceRoot", "planPath", "confirmCloudinaryWrite"],
    );
    return publishWebAssets({
      workspaceRoot: exactString(args.workspaceRoot, "workspaceRoot"),
      planPath: exactString(args.planPath, "planPath"),
      allowedRoots: allowedRoots(),
      allowWrites: environmentBoolean("EVAVO_WEB_ASSET_ALLOW_WRITES"),
      allowCloudinaryWrites: environmentBoolean(
        "EVAVO_WEB_ASSET_ALLOW_CLOUDINARY_WRITES",
      ),
      confirmCloudinaryWrite: args.confirmCloudinaryWrite === true,
      cloudinaryUrl: process.env.CLOUDINARY_URL,
    });
  }
  throw new WebAssetPipelineError(
    "WEB_ASSET_MCP_TOOL_NOT_FOUND",
    `Unknown tool ${JSON.stringify(name)}.`,
  );
}

function sanitizedError(error) {
  return Object.freeze({
    code:
      error instanceof WebAssetPipelineError
        ? error.code
        : "WEB_ASSET_MCP_TOOL_FAILED",
    message:
      error instanceof Error ? error.message.slice(0, 1000) : "Tool call failed.",
  });
}

function toolResult(value) {
  return Object.freeze({
    content: Object.freeze([
      Object.freeze({ type: "text", text: JSON.stringify(value, null, 2) }),
    ]),
    structuredContent: value,
    isError: false,
  });
}

function toolError(error) {
  const value = sanitizedError(error);
  return Object.freeze({
    content: Object.freeze([
      Object.freeze({ type: "text", text: `${value.code}: ${value.message}` }),
    ]),
    structuredContent: value,
    isError: true,
  });
}

async function dispatch(request) {
  if (
    request === null ||
    typeof request !== "object" ||
    Array.isArray(request) ||
    request.jsonrpc !== "2.0"
  ) {
    return {
      jsonrpc: "2.0",
      id: request?.id ?? null,
      error: { code: -32600, message: "Invalid Request" },
    };
  }
  if (request.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions:
          "Raster bytes stay in allowed local workspaces. Validate and prepare before publication. Cloudinary writes require two environment gates and exact per-call confirmation. SVG is not accepted by this pipeline.",
      },
    };
  }
  if (request.method === "ping") {
    return { jsonrpc: "2.0", id: request.id, result: {} };
  }
  if (request.method === "tools/list") {
    return { jsonrpc: "2.0", id: request.id, result: { tools } };
  }
  if (request.method === "tools/call") {
    const name = request.params?.name;
    if (typeof name !== "string") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32602, message: "Tool name is required." },
      };
    }
    try {
      const value = await callTool(name, request.params?.arguments ?? {});
      return { jsonrpc: "2.0", id: request.id, result: toolResult(value) };
    } catch (error) {
      return { jsonrpc: "2.0", id: request.id, result: toolError(error) };
    }
  }
  if (request.method?.startsWith("notifications/")) return null;
  return {
    jsonrpc: "2.0",
    id: request.id ?? null,
    error: { code: -32601, message: "Method not found" },
  };
}

const input = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
  terminal: false,
});

let chain = Promise.resolve();
input.on("line", (line) => {
  if (!line.trim()) return;
  chain = chain.then(async () => {
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      process.stdout.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" },
        })}\n`,
      );
      return;
    }
    const response = await dispatch(request);
    if (response !== null) process.stdout.write(`${JSON.stringify(response)}\n`);
  }).catch((error) => {
    process.stderr.write(`${JSON.stringify(sanitizedError(error))}\n`);
  });
});
