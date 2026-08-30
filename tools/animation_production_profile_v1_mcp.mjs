#!/usr/bin/env node

import { createInterface } from "node:readline";

import {
  assertAnimationProductionProfileIntegrity,
  compileAcceptedRuntimeClip,
  compileAnimationProductionProfile,
  nextAnimationProductionBatch,
  reviewAnimationProductionProfile,
} from "./animation_production_profile_v1.mjs";

const TOOL_DEFINITIONS = [
  {
    name: "compile_animation_production_profile_v1",
    description: "Compile a camera-aware animation request into deterministic key-pose, breakdown, in-between, exposure, target and review plans.",
    inputSchema: { type: "object", additionalProperties: true },
  },
  {
    name: "verify_animation_production_profile_v1",
    description: "Verify a compiled animation production profile and its content digest without side effects.",
    inputSchema: { type: "object", required: ["profile"], properties: { profile: { type: "object" } }, additionalProperties: false },
  },
  {
    name: "review_animation_production_profile_v1",
    description: "Evaluate drawing and sequence evidence, preserving accepted work and returning only targeted review or repair tasks.",
    inputSchema: { type: "object", required: ["profile", "cycle", "drawingEvidence"], additionalProperties: true },
  },
  {
    name: "next_animation_production_batch_v1",
    description: "Return the next dependency-safe generation batch for a compiled profile.",
    inputSchema: { type: "object", required: ["profile"], properties: { profile: { type: "object" }, completedDrawingIds: { type: "array", items: { type: "string" } } }, additionalProperties: false },
  },
  {
    name: "compile_accepted_animation_runtime_clip_v1",
    description: "Convert an approved profile plus accepted review decision into the existing EVAVO animation runtime clip contract.",
    inputSchema: { type: "object", required: ["profile", "decision"], properties: { profile: { type: "object" }, decision: { type: "object" } }, additionalProperties: false },
  },
];

function textResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value };
}

function callTool(name, args) {
  if (name === "compile_animation_production_profile_v1") return compileAnimationProductionProfile(args);
  if (name === "verify_animation_production_profile_v1") {
    assertAnimationProductionProfileIntegrity(args.profile);
    return { status: "verified", profileId: args.profile.profileId, contentDigest: args.profile.contentDigest, promotable: args.profile.quality.promotable };
  }
  if (name === "review_animation_production_profile_v1") return reviewAnimationProductionProfile(args);
  if (name === "next_animation_production_batch_v1") return nextAnimationProductionBatch(args.profile, args.completedDrawingIds ?? []);
  if (name === "compile_accepted_animation_runtime_clip_v1") return compileAcceptedRuntimeClip(args.profile, args.decision);
  throw new Error(`ANIMATION_PROFILE_MCP_TOOL_UNKNOWN:${name}`);
}

async function dispatch(message) {
  if (message.method === "initialize") {
    return {
      protocolVersion: message.params?.protocolVersion ?? "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "evavo-animation-production-profile-v1", version: "1.0.0" },
      instructions: "Compile and review animation deterministically. Missing evidence is review work, rejected evidence is targeted repair work, and no tool grants creative approval, provider execution, repository mutation or publication authority.",
    };
  }
  if (message.method === "notifications/initialized") return null;
  if (message.method === "tools/list") return { tools: TOOL_DEFINITIONS };
  if (message.method === "tools/call") {
    const name = message.params?.name;
    const args = message.params?.arguments ?? {};
    try {
      return textResult(callTool(name, args));
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ status: "error", message: error instanceof Error ? error.message : String(error) }) }],
      };
    }
  }
  throw new Error(`ANIMATION_PROFILE_MCP_METHOD_UNKNOWN:${message.method}`);
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
for await (const line of input) {
  if (!line.trim()) continue;
  let message;
  try {
    message = JSON.parse(line);
    const result = await dispatch(message);
    if (message.id !== undefined && result !== null) process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, result })}\n`);
  } catch (error) {
    if (message?.id !== undefined) {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: error instanceof Error ? error.message : String(error) } })}\n`);
    }
  }
}
