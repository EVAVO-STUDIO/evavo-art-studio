#!/usr/bin/env node

import { createInterface } from "node:readline";

import {
  assertAnimationSequenceDeliveryIntegrity,
  assertVideoStudioAnimationIntakeIntegrity,
  compileAnimationSequenceDelivery,
  compileVideoStudioAnimationIntake,
} from "./animation_sequence_delivery_canonical_v1.mjs";

const TOOLS = [
  {
    name: "compile_animation_sequence_delivery",
    description: "Compile an approved profile, accepted review, exact PNG bindings and named creative approval into path-free Godot, Cel and Video delivery plans.",
    inputSchema: { type: "object", required: ["profile", "decision", "artifacts", "creativeApproval"], additionalProperties: false },
  },
  {
    name: "verify_animation_sequence_delivery",
    description: "Verify delivery digest, artifact lineage, integer timing weights, target parity and path-free semantics.",
    inputSchema: { type: "object", required: ["delivery"], properties: { delivery: { type: "object" } }, additionalProperties: false },
  },
  {
    name: "compile_video_studio_animation_intake",
    description: "Compile a verified animation delivery into a path-free Video Studio intake with exact exposure timing and disabled interpolation by default.",
    inputSchema: { type: "object", required: ["delivery"], properties: { delivery: { type: "object" } }, additionalProperties: false },
  },
  {
    name: "verify_video_studio_animation_intake",
    description: "Verify Video Studio intake lineage, duration, terminal-frame retention and governed artifact-resolution policy.",
    inputSchema: { type: "object", required: ["intake"], properties: { intake: { type: "object" } }, additionalProperties: false },
  },
];

function result(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value };
}

function call(name, args) {
  if (name === "compile_animation_sequence_delivery") return compileAnimationSequenceDelivery(args);
  if (name === "verify_animation_sequence_delivery") {
    assertAnimationSequenceDeliveryIntegrity(args.delivery);
    return { status: "verified", contentDigest: args.delivery.contentDigest, totalDurationSeconds: args.delivery.timing.totalDurationSeconds };
  }
  if (name === "compile_video_studio_animation_intake") return compileVideoStudioAnimationIntake(args.delivery);
  if (name === "verify_video_studio_animation_intake") {
    assertVideoStudioAnimationIntakeIntegrity(args.intake);
    return { status: "verified", contentDigest: args.intake.contentDigest, sourceDeliveryDigest: args.intake.sourceDeliveryDigest };
  }
  throw new Error(`ANIMATION_DELIVERY_MCP_TOOL_UNKNOWN:${name}`);
}

async function dispatch(message) {
  if (message.method === "initialize") {
    return {
      protocolVersion: message.params?.protocolVersion ?? "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "evavo-animation-sequence-delivery", version: "1.0.0" },
      instructions: "Delivery is allowed only from an approved profile, canonical accepted review, exact artifact hashes and a separate named creative-approval record. Inputs and outputs are path-free. No tool resolves media, transcodes, activates runtime, mutates repositories or publishes.",
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
  throw new Error(`ANIMATION_DELIVERY_MCP_METHOD_UNKNOWN:${message.method}`);
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
