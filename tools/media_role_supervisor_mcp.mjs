#!/usr/bin/env node

import readline from "node:readline";

import { rankMediaCandidates } from "../packages/media/dist/index.js";

const SERVER_NAME = "evavo-media-role-supervisor";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const ROLES = Object.freeze([
  "detail-hero",
  "detail-support",
  "catalogue-tile",
  "social-seo",
  "motion-layer",
]);

const candidateSchema = Object.freeze({
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
    width: { type: "number", minimum: 0 },
    height: { type: "number", minimum: 0 },
    bytes: { type: "number", minimum: 0 },
    format: { type: "string" },
    hasAlpha: { type: "boolean" },
    tags: { type: "array", maxItems: 200, items: { type: "string" } },
    status: { type: "string" },
    assetRole: { type: "string" },
    usage: { type: "string" },
    predominantWhiteRatio: { type: "number", minimum: 0, maximum: 1 },
    sharedWithCatalogue: { type: "boolean" },
    lockedCatalogueSource: { type: "boolean" },
  },
  required: ["id"],
  additionalProperties: false,
});

const requestSchema = Object.freeze({
  type: "object",
  properties: {
    role: { type: "string", enum: ROLES },
    targetAspectRatio: { type: "number", exclusiveMinimum: 0 },
    transparentPreferred: { type: "boolean" },
    minimumWidth: { type: "number", minimum: 0 },
    minimumHeight: { type: "number", minimum: 0 },
    allowSharedCatalogueSource: { type: "boolean" },
  },
  required: ["role"],
  additionalProperties: false,
});

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_media_role_supervisor_capabilities",
    description: "Describe deterministic provider-neutral asset-role ranking rules. This tool is read-only and performs no provider or filesystem mutations.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_rank_media_candidates",
    description: "Rank already-discovered Cloudinary/local media metadata for a requested page or production slot. Returns keep/finish/derive/reject decisions with reasons and warnings; does not fetch, mutate or publish assets.",
    inputSchema: {
      type: "object",
      properties: {
        candidates: {
          type: "array",
          minItems: 1,
          maxItems: 500,
          items: candidateSchema,
        },
        request: requestSchema,
      },
      required: ["candidates", "request"],
      additionalProperties: false,
    },
  }),
]);

async function callTool(name, args) {
  if (name === "evavo_media_role_supervisor_capabilities") {
    return Object.freeze({
      contract: "evavo_media_role_supervisor_v1",
      roles: ROLES,
      decisions: ["keep", "finish", "derive", "reject"],
      evidenceInputs: [
        "dimensions",
        "format",
        "alpha-state",
        "tags",
        "production-status",
        "asset-role",
        "usage",
        "predominant-white-ratio",
        "catalogue-sharing",
        "catalogue-lock",
      ],
      rules: [
        "live detail heroes reject SVG",
        "archived/replaced/superseded media rejects for active slots",
        "catalogue-only art cannot leak into detail slots",
        "support-only art offered as hero requires a dedicated derivative",
        "canonical hero/social art offered as support requires a separate derivative",
        "shared or locked catalogue sources are not overwritten for detail finishing",
        "production metadata outranks candidate-like public naming",
        "white-field dark-slot support art is sent to finishing review",
        "motion layers prefer proven alpha and non-JPEG delivery",
      ],
      providerMutationPerformed: false,
      filesystemMutationPerformed: false,
    });
  }
  if (name === "evavo_rank_media_candidates") {
    if (!args || !Array.isArray(args.candidates) || !args.request) {
      throw new Error("candidates and request are required.");
    }
    return Object.freeze({
      ok: true,
      candidateCount: args.candidates.length,
      request: args.request,
      rankings: rankMediaCandidates(args.candidates, args.request),
      providerMutationPerformed: false,
      filesystemMutationPerformed: false,
    });
  }
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
        instructions: "Media role supervision is deterministic and read-only. Supply already-discovered asset metadata; the server ranks candidates but does not fetch, edit, overwrite or publish media.",
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
          {
            code: "MEDIA_ROLE_SUPERVISION_FAILED",
            message: error instanceof Error ? error.message : String(error),
          },
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
