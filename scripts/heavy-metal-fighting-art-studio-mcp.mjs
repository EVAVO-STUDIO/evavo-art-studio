#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import {
  heavyMetalFightingBatch,
  heavyMetalFightingFramePlan,
  heavyMetalFightingHandoffTemplate,
  heavyMetalFightingMechanicalContract,
  heavyMetalFightingRuntimeSlot,
  heavyMetalFightingSourceCel,
  heavyMetalFightingStyleProof,
  heavyMetalFightingSummary,
  verifyHeavyMetalFightingStudio,
} from "./heavy-metal-fighting/studio-runtime.mjs";

export const SERVER_NAME = "evavo-heavy-metal-fighting-art-studio";
export const SERVER_VERSION = "1.1.0";
export const SUMMARY_TOOL = "evavo_heavy_metal_fighting_summary";
export const CONTRACT_TOOL = "evavo_heavy_metal_fighting_mechanical_contract";
export const FRAME_TOOL = "evavo_heavy_metal_fighting_frame_plan";
export const SOURCE_CEL_TOOL = "evavo_heavy_metal_fighting_source_cel";
export const RUNTIME_SLOT_TOOL = "evavo_heavy_metal_fighting_runtime_slot";
export const BATCH_TOOL = "evavo_heavy_metal_fighting_batch";
export const STYLE_PROOF_TOOL = "evavo_heavy_metal_fighting_style_proof";
export const VERIFY_TOOL = "evavo_heavy_metal_fighting_verify";
export const HANDOFF_TOOL = "evavo_heavy_metal_fighting_handoff_template";

const FRAME_IDS = Object.freeze(["bastion", "viper", "citadel", "mirage"]);
const objectSchema = (properties = {}, required = []) => ({
  type: "object",
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {}),
});

export function toolDefinitions() {
  return Object.freeze([
    {
      name: SUMMARY_TOOL,
      description: "Return the exact HEAVY METAL FIGHTING launch-four Art Studio inventory, hashes, Frames, atlas status, style-proof blockers and authority boundary.",
      inputSchema: objectSchema(),
    },
    {
      name: CONTRACT_TOOL,
      description: "Return the normalized mechanical identity contract for Bastion, Viper, Citadel and Mirage, including landmarks, hardpoints, asymmetry, mirroring and body/effect ownership.",
      inputSchema: objectSchema(),
    },
    {
      name: FRAME_TOOL,
      description: "Return one complete Frame production plan with 120 authored source cels, clip topology, startup/active/recovery classification, neighbour conditioning, and separate current/planned runtime-slot mappings.",
      inputSchema: objectSchema({
        frameId: { type: "string", enum: FRAME_IDS },
      }, ["frameId"]),
    },
    {
      name: SOURCE_CEL_TOOL,
      description: "Return one exact authored Frame source cel with mechanical identity, previous/next conditioning, current and planned runtime bindings, mirror rules and review gates.",
      inputSchema: objectSchema({
        frameId: { type: "string", enum: FRAME_IDS },
        sourceIndex: { type: "integer", minimum: 0, maximum: 119 },
      }, ["frameId", "sourceIndex"]),
    },
    {
      name: RUNTIME_SLOT_TOOL,
      description: "Inspect one current or planned-v2 runtime atlas slot, including mapped source cels, collision or reserved status, and planned utility semantics.",
      inputSchema: objectSchema({
        frameId: { type: "string", enum: FRAME_IDS },
        mapName: { type: "string", enum: ["current", "planned-v2"] },
        slot: { type: "integer", minimum: 0, maximum: 119 },
      }, ["frameId", "mapName", "slot"]),
    },
    {
      name: BATCH_TOOL,
      description: "Return one exact family-locked HEAVY METAL FIGHTING production batch with up to ten separate image work units, prompts, dimensions, alpha, pivots and target paths.",
      inputSchema: objectSchema({
        batchNumber: { type: "integer", minimum: 1, maximum: 119 },
      }, ["batchNumber"]),
    },
    {
      name: STYLE_PROOF_TOOL,
      description: "Return the locked Branka + Bastion + Danube Works service cradle + Foundry Nine + title style-proof plan, including the current slot-24 collision and planned atlas-v2 resolution.",
      inputSchema: objectSchema(),
    },
    {
      name: VERIFY_TOOL,
      description: "Run deterministic HEAVY METAL FIGHTING campaign, cell, pivot, mechanical, authority and style-proof integrity checks without calling a provider or writing files.",
      inputSchema: objectSchema(),
    },
    {
      name: HANDOFF_TOOL,
      description: "Compile a read-only handoff template bound to one exact game commit and live slot-manifest hash. This does not write or promote assets.",
      inputSchema: objectSchema({
        gameRevisionSha: { type: "string", pattern: "^[0-9a-f]{40}$" },
        liveSlotManifestSha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
      }, ["gameRevisionSha", "liveSlotManifestSha256"]),
    },
  ]);
}

export async function callTool(name, input = {}) {
  if (!toolDefinitions().some((tool) => tool.name === name)) throw new Error(`Unknown or prohibited HEAVY METAL FIGHTING Art Studio tool ${name}.`);
  if (name === SUMMARY_TOOL) return heavyMetalFightingSummary();
  if (name === CONTRACT_TOOL) return heavyMetalFightingMechanicalContract();
  if (name === FRAME_TOOL) return heavyMetalFightingFramePlan(input.frameId);
  if (name === SOURCE_CEL_TOOL) return heavyMetalFightingSourceCel(input.frameId, input.sourceIndex);
  if (name === RUNTIME_SLOT_TOOL) return heavyMetalFightingRuntimeSlot(input.frameId, input.mapName, input.slot);
  if (name === BATCH_TOOL) return heavyMetalFightingBatch(input.batchNumber);
  if (name === STYLE_PROOF_TOOL) return heavyMetalFightingStyleProof();
  if (name === VERIFY_TOOL) return verifyHeavyMetalFightingStudio();
  if (name === HANDOFF_TOOL) return heavyMetalFightingHandoffTemplate({
    gameRevisionSha: input.gameRevisionSha,
    liveSlotManifestSha256: input.liveSlotManifestSha256,
  });
  throw new Error(`Unhandled HEAVY METAL FIGHTING Art Studio tool ${name}.`);
}

const response = (id, result) => ({ jsonrpc: "2.0", id: id ?? null, result });
const content = (value) => [{ type: "text", text: JSON.stringify(value, null, 2) }];

export async function handleRequest(request) {
  if (!request || request.jsonrpc !== "2.0" || typeof request.method !== "string") throw new Error("Invalid JSON-RPC request.");
  if (request.method === "initialize") {
    return response(request.id, {
      protocolVersion: request.params?.protocolVersion ?? "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      instructions: "This server is a read-only HEAVY METAL FIGHTING production and review adapter. It exposes the governed campaign, mechanical Frame identities, authored source-cel plans, current and planned runtime-slot inspection, family-locked batches, the locked first style proof, deterministic verification and hash-bound handoff templates. It never calls an image provider, approves art, edits source images, assembles or promotes a final runtime atlas, mutates the game repository, commits, pushes, deploys, publishes or force-pushes.",
    });
  }
  if (request.method === "ping") return response(request.id, {});
  if (request.method === "notifications/initialized") return null;
  if (request.method === "tools/list") return response(request.id, { tools: toolDefinitions() });
  if (request.method === "tools/call") {
    try {
      return response(request.id, {
        content: content(await callTool(request.params?.name, request.params?.arguments ?? {})),
        isError: false,
      });
    } catch (error) {
      return response(request.id, {
        content: content({ error: error instanceof Error ? error.message : String(error) }),
        isError: true,
      });
    }
  }
  throw new Error(`Unsupported MCP method ${request.method}.`);
}

export async function startServer() {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
  for await (const line of input) {
    if (!line.trim()) continue;
    let request;
    try {
      request = JSON.parse(line);
      const result = await handleRequest(request);
      if (result) process.stdout.write(`${JSON.stringify(result)}\n`);
    } catch (error) {
      process.stdout.write(`${JSON.stringify({
        jsonrpc: "2.0",
        id: request?.id ?? null,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : String(error),
        },
      })}\n`);
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
