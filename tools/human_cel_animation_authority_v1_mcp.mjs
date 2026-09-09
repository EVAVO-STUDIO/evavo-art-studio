#!/usr/bin/env node

import { createInterface } from "node:readline";

import {
  assertHumanCelAnimationAuthorityIntegrity,
  compileHumanCelAnimationAuthority,
} from "./human_cel_animation_authority_v1.mjs";

const TOOL_DEFINITIONS = [
  {
    name: "compile_human_cel_animation_authority_v1",
    description: "Compile an Art Studio animation request into a strict human-cel craft authority handoff for cel-animation-studio.",
    inputSchema: {
      type: "object",
      required: ["request"],
      properties: { request: { type: "object" } },
      additionalProperties: false,
    },
  },
  {
    name: "verify_human_cel_animation_authority_v1",
    description: "Verify the digest and mandatory strict human-cel authority bindings without side effects.",
    inputSchema: {
      type: "object",
      required: ["authority"],
      properties: { authority: { type: "object" } },
      additionalProperties: false,
    },
  },
];

function textResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function callTool(name, args) {
  if (name === "compile_human_cel_animation_authority_v1") {
    return compileHumanCelAnimationAuthority(args.request);
  }
  if (name === "verify_human_cel_animation_authority_v1") {
    assertHumanCelAnimationAuthorityIntegrity(args.authority);
    return {
      status: "verified",
      authorityId: args.authority.authorityId,
      contentDigest: args.authority.contentDigest,
      mode: args.authority.authority.mode,
      targetRepository: args.authority.handoff.targetRepository,
    };
  }
  throw new Error(`HUMAN_CEL_AUTHORITY_MCP_TOOL_UNKNOWN:${name}`);
}

async function dispatch(message) {
  if (message.method === "initialize") {
    return {
      protocolVersion: message.params?.protocolVersion ?? "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "evavo-human-cel-animation-authority-v1", version: "1.0.0" },
      instructions: "Use this bridge when Art Studio animation must be handed to cel-animation-studio under strict human-authored cel craft, timing, cinematography and anti-generic review. This bridge grants no rendering, approval, repository mutation or publication authority.",
    };
  }
  if (message.method === "notifications/initialized") return null;
  if (message.method === "tools/list") return { tools: TOOL_DEFINITIONS };
  if (message.method === "tools/call") {
    try {
      return textResult(callTool(message.params?.name, message.params?.arguments ?? {}));
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "error",
              message: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
      };
    }
  }
  throw new Error(`HUMAN_CEL_AUTHORITY_MCP_METHOD_UNKNOWN:${message.method}`);
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
for await (const line of input) {
  if (!line.trim()) continue;
  let message;
  try {
    message = JSON.parse(line);
    const result = await dispatch(message);
    if (message.id !== undefined && result !== null) {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, result })}\n`);
    }
  } catch (error) {
    if (message?.id !== undefined) {
      process.stdout.write(`${JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : String(error),
        },
      })}\n`);
    }
  }
}
