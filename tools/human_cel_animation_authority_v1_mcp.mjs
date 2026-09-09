#!/usr/bin/env node

import { createInterface } from "node:readline";

import {
  assertHumanCelAnimationAuthorityIntegrity,
  compileHumanCelAnimationAuthority,
} from "./human_cel_animation_authority_v1.mjs";

const TOOL_DEFINITIONS = [
  {
    name: "compile_human_cel_animation_authority_v1",
    description: "Compile an Art Studio animation request into a strict human-cel handoff requiring authored cleanup/ink, colour/paint, acting/performance, optical compositing, candidate-envelope provenance, quality receipts and integrity-aware Store promotion enforcement.",
    inputSchema: {
      type: "object",
      required: ["request"],
      properties: { request: { type: "object" } },
      additionalProperties: false,
    },
  },
  {
    name: "verify_human_cel_animation_authority_v1",
    description: "Verify protocol .8, Core 0.38 authored departments, Store 0.27 promotion/integrity gates and mandatory strict human-cel bindings without side effects.",
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
      protocolVersion: args.authority.protocolVersion,
      authorityId: args.authority.authorityId,
      contentDigest: args.authority.contentDigest,
      mode: args.authority.authority.mode,
      cleanupInk: args.authority.authority.cleanupInk,
      colourPaint: args.authority.authority.colourPaint,
      performanceActing: args.authority.authority.performanceActing,
      opticalCompositing: args.authority.authority.opticalCompositing,
      candidateEnvelopeProvenanceRequired:
        args.authority.authority.requiresCandidateEnvelopeProvenance,
      persistencePromotionGateRequired:
        args.authority.authority.requiresPersistencePromotionGate,
      persistedStateIntegrityRequired:
        args.authority.authority.requiresPersistedStateIntegrity,
      targetRepository: args.authority.handoff.targetRepository,
      coreMinimumVersion: args.authority.handoff.minimumPackageVersion,
      storeMinimumVersion: args.authority.handoff.minimumStorePackageVersion,
      requiredStoreBehavior: args.authority.handoff.requiredStoreBehavior,
      requiredStoreIntegrity: args.authority.handoff.requiredStoreIntegrity,
    };
  }
  throw new Error(`HUMAN_CEL_AUTHORITY_MCP_TOOL_UNKNOWN:${name}`);
}

async function dispatch(message) {
  if (message.method === "initialize") {
    return {
      protocolVersion: message.params?.protocolVersion ?? "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "evavo-human-cel-animation-authority-v1", version: "1.3.0" },
      instructions: "Use this bridge when Art Studio animation must be handed to cel-animation-studio under strict human-authored cel production. A valid handoff requires Cel Core 0.38+ with strict cleanup/ink, colour/paint, acting/performance and optical/compositing grammar, Cel Store 0.27+ with canonical persisted-state integrity, candidate provenance containing the persisted strict-envelope digest, an immutable candidate-byte-bound zero-blocker quality receipt and the Store strict-human-cel-promotion-receipt-gate before approved state is authoritative. Auto-trace wobble, generic blue/night or LUT grading, blanket bloom, optical-flow smoothing and fake analogue degradation are not valid substitutes. This bridge grants no provider execution, creative approval, repository mutation or publication authority.",
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
