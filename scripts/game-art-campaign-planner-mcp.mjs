#!/usr/bin/env node
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import {
  campaignSummary,
  compileCampaignFile,
  getCampaignBatch,
  serializePlan,
} from "./game-art-campaign/compiler.mjs";
import { pathInside, writeTextFilesCreateOnly } from "./game-art-campaign/common.mjs";
import { campaignMarkdown } from "./game-art-campaign/markdown.mjs";

export const SERVER_NAME = "evavo-game-art-campaign-planner";
export const SERVER_VERSION = "1.0.0";
export const SUMMARY_TOOL = "evavo_game_art_campaign_summary";
export const BATCH_TOOL = "evavo_game_art_campaign_batch";
export const WRITE_TOOL = "evavo_game_art_campaign_write_plan";

function flag(value, name, fallback = false) {
  if (value === undefined || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`${name} must be true or false.`);
}

function roots(value) {
  return String(value ?? "")
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => path.resolve(item));
}

export function policy(environment = process.env) {
  const mode = String(environment.EVAVO_GAME_ART_CAMPAIGN_MODE ?? "read-only").trim().toLowerCase();
  if (!["read-only", "read-write"].includes(mode)) throw new Error("EVAVO_GAME_ART_CAMPAIGN_MODE must be read-only or read-write.");
  const writesEnabled = mode === "read-write" && flag(environment.EVAVO_GAME_ART_CAMPAIGN_ALLOW_WRITES, "EVAVO_GAME_ART_CAMPAIGN_ALLOW_WRITES");
  if (mode === "read-write" && !writesEnabled) throw new Error("read-write mode also requires EVAVO_GAME_ART_CAMPAIGN_ALLOW_WRITES=true.");
  return Object.freeze({ mode, writesEnabled, roots: Object.freeze(roots(environment.EVAVO_GAME_ART_CAMPAIGN_ALLOWED_ROOTS)) });
}

async function allowed(value, current, label, { future = false } = {}) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  const requested = path.resolve(value);
  let observed = requested;
  try {
    const state = await lstat(requested);
    if (state.isSymbolicLink()) throw new Error(`${label} must not be a symlink.`);
    observed = await realpath(requested);
  } catch (error) {
    if (!future || error?.code !== "ENOENT") throw error;
    observed = path.join(await realpath(path.dirname(requested)), path.basename(requested));
  }
  if (!current.roots.length || !current.roots.some((root) => pathInside(observed, root))) {
    throw new Error(`${label} is outside EVAVO_GAME_ART_CAMPAIGN_ALLOWED_ROOTS.`);
  }
  return requested;
}

const objectSchema = (properties, required = []) => ({ type: "object", additionalProperties: false, properties, ...(required.length ? { required } : {}) });
const filePath = { type: "string", minLength: 1, maxLength: 4096 };

export function toolDefinitions(current = policy()) {
  const tools = [
    {
      name: SUMMARY_TOOL,
      description: "Compile and summarize an exact four-game art campaign without calling an image provider or writing outputs.",
      inputSchema: objectSchema({ requestPath: filePath }, ["requestPath"]),
    },
    {
      name: BATCH_TOOL,
      description: "Return one exact family-locked image-generation batch with ordered per-frame prompts, dimensions, alpha and target paths.",
      inputSchema: objectSchema({
        requestPath: filePath,
        gameId: { type: "string", minLength: 1, maxLength: 100 },
        batchNumber: { type: "integer", minimum: 1 },
      }, ["requestPath", "gameId", "batchNumber"]),
    },
  ];
  if (current.writesEnabled) {
    tools.push({
      name: WRITE_TOOL,
      description: "Write a deterministic campaign JSON plan and optional Markdown summary inside an allowed root. Requires confirmWrite=true.",
      inputSchema: objectSchema({
        requestPath: filePath,
        outputPath: filePath,
        markdownPath: filePath,
        confirmWrite: { type: "boolean", const: true },
      }, ["requestPath", "outputPath", "confirmWrite"]),
    });
  }
  return Object.freeze(tools);
}

export async function callTool(name, input = {}, context = {}) {
  const current = context.policy ?? policy();
  if (!toolDefinitions(current).some((tool) => tool.name === name)) throw new Error(`Unknown or prohibited campaign tool ${name}.`);
  const requestPath = await allowed(input.requestPath, current, "requestPath");
  const plan = await compileCampaignFile(requestPath);
  if (name === SUMMARY_TOOL) return campaignSummary(plan);
  if (name === BATCH_TOOL) return getCampaignBatch(plan, input.gameId, input.batchNumber);
  if (name === WRITE_TOOL) {
    if (!current.writesEnabled || input.confirmWrite !== true) throw new Error("Plan writing requires the write environment gate and confirmWrite=true.");
    const outputPath = await allowed(input.outputPath, current, "outputPath", { future: true });
    const markdownPath = input.markdownPath
      ? await allowed(input.markdownPath, current, "markdownPath", { future: true })
      : undefined;
    await writeTextFilesCreateOnly([
      { filePath: outputPath, text: serializePlan(plan) },
      ...(markdownPath ? [{ filePath: markdownPath, text: campaignMarkdown(plan) }] : []),
    ]);
    return Object.freeze({
      status: "passed",
      campaignId: plan.campaignId,
      planSha256: plan.planSha256,
      outputPath,
      markdownPath: markdownPath ?? null,
      providerExecution: false,
      targetRepositoryMutation: false,
      gitPush: false,
    });
  }
  throw new Error(`Unknown campaign tool ${name}.`);
}

const response = (id, result) => ({ jsonrpc: "2.0", id: id ?? null, result });
const content = (value) => [{ type: "text", text: JSON.stringify(value, null, 2) }];

export async function handleRequest(request, context = {}) {
  if (!request || request.jsonrpc !== "2.0" || typeof request.method !== "string") throw new Error("Invalid JSON-RPC request.");
  const current = context.policy ?? policy();
  if (request.method === "initialize") {
    return response(request.id, {
      protocolVersion: request.params?.protocolVersion ?? "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      instructions: "Campaign summary and batch retrieval are read-only. Plan writes require an allowed root, read-write environment gate and confirmWrite=true. The server never calls an image provider, edits art, promotes candidates, mutates a game repository, commits, pushes, publishes or force-pushes.",
    });
  }
  if (request.method === "ping") return response(request.id, {});
  if (request.method === "notifications/initialized") return null;
  if (request.method === "tools/list") return response(request.id, { tools: toolDefinitions(current) });
  if (request.method === "tools/call") {
    try {
      return response(request.id, { content: content(await callTool(request.params?.name, request.params?.arguments ?? {}, { policy: current })), isError: false });
    } catch (error) {
      return response(request.id, { content: content({ error: error instanceof Error ? error.message : String(error) }), isError: true });
    }
  }
  throw new Error(`Unsupported MCP method ${request.method}.`);
}

export async function startServer(options = {}) {
  const current = options.policy ?? policy(options.environment);
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
  for await (const line of input) {
    if (!line.trim()) continue;
    let request;
    try {
      request = JSON.parse(line);
      const result = await handleRequest(request, { policy: current });
      if (result) process.stdout.write(`${JSON.stringify(result)}\n`);
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request?.id ?? null, error: { code: -32000, message: error instanceof Error ? error.message : String(error) } })}\n`);
    }
  }
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  startServer().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
