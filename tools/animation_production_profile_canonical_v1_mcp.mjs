#!/usr/bin/env node

import { createInterface } from "node:readline";

import {
  assertAnimationProductionProfileIntegrity,
  assertAnimationProductionReviewIntegrity,
  compileAcceptedRuntimeClip,
  compileAnimationProductionProfile,
  nextAnimationProductionBatch,
  reviewAnimationProductionProfile,
} from "./animation_production_profile_canonical_v1.mjs";

const TOOLS = [
  {
    name: "compile_animation_production_profile",
    description: "Compile an approved camera, identity, style and performance request into deterministic key-pose, breakdown, in-between, exposure and target plans.",
    inputSchema: { type: "object", additionalProperties: true },
  },
  {
    name: "verify_animation_production_profile",
    description: "Verify a compiled profile and its deterministic content identity.",
    inputSchema: { type: "object", required: ["profile"], properties: { profile: { type: "object" } }, additionalProperties: false },
  },
  {
    name: "review_animation_production_profile",
    description: "Review drawing and whole-sequence evidence, distinguishing missing review evidence from targeted repair authority.",
    inputSchema: { type: "object", required: ["profile", "cycle", "drawingEvidence"], additionalProperties: true },
  },
  {
    name: "verify_animation_production_review",
    description: "Recreate and verify a canonical profile review decision from its exact input.",
    inputSchema: { type: "object", required: ["input", "decision"], properties: { input: { type: "object" }, decision: { type: "object" } }, additionalProperties: false },
  },
  {
    name: "next_animation_production_batch",
    description: "Return the next dependency-safe generation batch without dispatching a provider.",
    inputSchema: { type: "object", required: ["profile"], properties: { profile: { type: "object" }, completedDrawingIds: { type: "array", items: { type: "string" } } }, additionalProperties: false },
  },
  {
    name: "compile_accepted_animation_runtime_clip",
    description: "Compile an accepted review into an exact-duration EVAVO runtime clip using integer exposure weights.",
    inputSchema: { type: "object", required: ["profile", "decision"], properties: { profile: { type: "object" }, decision: { type: "object" } }, additionalProperties: false },
  },
];

function result(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value };
}

function call(name, args) {
  if (name === "compile_animation_production_profile") return compileAnimationProductionProfile(args);
  if (name === "verify_animation_production_profile") {
    assertAnimationProductionProfileIntegrity(args.profile);
    return { status: "verified", profileId: args.profile.profileId, contentDigest: args.profile.contentDigest, promotable: args.profile.quality.promotable };
  }
  if (name === "review_animation_production_profile") return reviewAnimationProductionProfile(args);
  if (name === "verify_animation_production_review") {
    assertAnimationProductionReviewIntegrity(args.input, args.decision);
    return { status: "verified", profileDigest: args.decision.profileDigest, decisionDigest: args.decision.decisionDigest, reviewStatus: args.decision.status };
  }
  if (name === "next_animation_production_batch") return nextAnimationProductionBatch(args.profile, args.completedDrawingIds ?? []);
  if (name === "compile_accepted_animation_runtime_clip") return compileAcceptedRuntimeClip(args.profile, args.decision);
  throw new Error(`ANIMATION_PROFILE_MCP_TOOL_UNKNOWN:${name}`);
}

async function dispatch(message) {
  if (message.method === "initialize") {
    return {
      protocolVersion: message.params?.protocolVersion ?? "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "evavo-animation-production-profile", version: "1.0.0" },
      instructions: "Plan and review animation with immutable camera, identity, style and timing evidence. Missing evidence is review work. Only explicitly rejected drawings may be regenerated. No tool grants provider execution, automatic creative approval, artifact promotion, runtime activation, repository mutation or publication authority.",
    };
  }
  if (message.method === "notifications/initialized") return null;
  if (message.method === "tools/list") return { tools: TOOLS };
  if (message.method === "tools/call") {
    try {
      return result(call(message.params?.name, message.params?.arguments ?? {}));
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: JSON.stringify({ status: "error", message: error instanceof Error ? error.message : String(error) }) }] };
    }
  }
  throw new Error(`ANIMATION_PROFILE_MCP_METHOD_UNKNOWN:${message.method}`);
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
for await (const line of lines) {
  if (!line.trim()) continue;
  let message;
  try {
    message = JSON.parse(line);
    const value = await dispatch(message);
    if (message.id !== undefined && value !== null) process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, result: value })}\n`);
  } catch (error) {
    if (message?.id !== undefined) process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: error instanceof Error ? error.message : String(error) } })}\n`);
  }
}
