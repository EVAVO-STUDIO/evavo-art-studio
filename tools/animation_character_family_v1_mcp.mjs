#!/usr/bin/env node

import readline from "node:readline";
import process from "node:process";

import {
  animationCharacterFamilyAuthority,
  assertAnimationCharacterFamilyClipEvidenceIntegrity,
  assertAnimationCharacterFamilyPlanIntegrity,
  assertAnimationCharacterFamilyReviewReceiptIntegrity,
  assertAnimationCharacterFamilyRuntimePlanIntegrity,
  compileAnimationCharacterFamilyPlan,
  compileAnimationCharacterFamilyReviewInput,
  compileAnimationCharacterFamilyReviewReceipt,
  compileAnimationCharacterFamilyRuntimePlan,
  compileAnimationCharacterFamilyStatus,
  describeAnimationCharacterFamilyV1,
} from "./animation_character_family_v1.mjs";

const SERVER_NAME = "evavo-animation-character-family-v1";
const SERVER_VERSION = "1.1.0";
const MAX_LINE_BYTES = 4 * 1024 * 1024;
const ROLE = process.env.EVAVO_ANIMATION_CHARACTER_FAMILY_ROLE ?? "art-studio";
const VALID_ROLES = new Set(["art-studio", "cel-animation-studio"]);
const CREDENTIAL_KEY = /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|authorization|cookie|private[_-]?key)/iu;
const CREDENTIAL_VALUE = /(?:bearer\s+[A-Za-z0-9._~+\/-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/iu;

if (!VALID_ROLES.has(ROLE)) {
  process.stderr.write(
    `${JSON.stringify({
      status: "error",
      message: "ANIMATION_CHARACTER_FAMILY_MCP_ROLE_INVALID",
      role: ROLE,
    })}\n`,
  );
  process.exit(1);
}

function fail(code, detail = "") {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function scanCredentials(value, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((child, index) => scanCredentials(child, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (CREDENTIAL_KEY.test(key)) {
        fail("ANIMATION_CHARACTER_FAMILY_MCP_CREDENTIAL_KEY_FORBIDDEN", `${path}.${key}`);
      }
      scanCredentials(child, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === "string" && CREDENTIAL_VALUE.test(value)) {
    fail("ANIMATION_CHARACTER_FAMILY_MCP_CREDENTIAL_VALUE_FORBIDDEN", path);
  }
}

const commonTools = [
  {
    name: "describe_animation_character_family_v1",
    description:
      "Describe the perspective-aware character animation family contract and its non-mutating authority boundary.",
    inputSchema: { type: "object", additionalProperties: false },
  },
  {
    name: "verify_animation_character_family_plan_v1",
    description: "Verify a content-addressed character animation family plan.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["plan"],
      properties: { plan: { type: "object" } },
    },
  },
  {
    name: "verify_animation_character_family_clip_v1",
    description:
      "Verify accepted clip evidence without granting approval or admitting media.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["clip"],
      properties: { clip: { type: "object" } },
    },
  },
  {
    name: "compile_animation_character_family_status_v1",
    description:
      "Calculate missing coverage, drift, transition faults, targeted next work, and family readiness.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["plan", "clips"],
      properties: {
        plan: { type: "object" },
        clips: { type: "array", items: { type: "object" } },
        reviewReceipt: { type: ["object", "null"] },
      },
    },
  },
  {
    name: "compile_animation_character_family_review_input_v1",
    description:
      "Compile the exact cross-clip normal-speed, frame-by-frame, transition, direction, identity, style, and timing review packet.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["plan", "clips"],
      properties: {
        plan: { type: "object" },
        clips: { type: "array", items: { type: "object" } },
      },
    },
  },
  {
    name: "verify_animation_character_family_review_receipt_v1",
    description: "Verify a Cel-owned family review receipt against an optional exact review input.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["receipt"],
      properties: {
        receipt: { type: "object" },
        reviewInput: { type: "object" },
      },
    },
  },
  {
    name: "compile_animation_character_family_runtime_plan_v1",
    description:
      "Compile a destination-neutral state, direction, transition, timing, and safe-mirroring plan after accepted family review.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["plan", "clips", "reviewReceipt"],
      properties: {
        plan: { type: "object" },
        clips: { type: "array", items: { type: "object" } },
        reviewReceipt: { type: "object" },
      },
    },
  },
  {
    name: "verify_animation_character_family_runtime_plan_v1",
    description: "Verify a content-addressed family runtime plan without activating a runtime.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["runtimePlan"],
      properties: { runtimePlan: { type: "object" } },
    },
  },
];

const artTools = [
  {
    name: "compile_animation_character_family_plan_v1",
    description:
      "Compile the Art Studio-owned perspective-aware family coverage and transition plan.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["request"],
      properties: { request: { type: "object" } },
    },
  },
];

const celTools = [
  {
    name: "compile_animation_character_family_review_receipt_v1",
    description:
      "Compile the independent Cel Animation Studio family review receipt. This does not grant creative approval, promotion, activation, or publication.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["receiptId", "reviewInput", "assessment"],
      properties: {
        receiptId: { type: "string" },
        reviewInput: { type: "object" },
        assessment: { type: "object" },
      },
    },
  },
];

function toolList() {
  return ROLE === "art-studio"
    ? [...artTools, ...commonTools]
    : [...celTools, ...commonTools];
}

function invokeTool(name, args) {
  scanCredentials(args);
  switch (name) {
    case "describe_animation_character_family_v1":
      return { ...describeAnimationCharacterFamilyV1(), activeRole: ROLE };
    case "compile_animation_character_family_plan_v1":
      if (ROLE !== "art-studio") fail("ANIMATION_CHARACTER_FAMILY_MCP_ART_AUTHORITY_REQUIRED");
      return compileAnimationCharacterFamilyPlan(args.request);
    case "verify_animation_character_family_plan_v1":
      return assertAnimationCharacterFamilyPlanIntegrity(args.plan);
    case "verify_animation_character_family_clip_v1":
      return assertAnimationCharacterFamilyClipEvidenceIntegrity(args.clip);
    case "compile_animation_character_family_status_v1":
      return compileAnimationCharacterFamilyStatus(args);
    case "compile_animation_character_family_review_input_v1":
      return compileAnimationCharacterFamilyReviewInput(args);
    case "compile_animation_character_family_review_receipt_v1":
      if (ROLE !== "cel-animation-studio") {
        fail("ANIMATION_CHARACTER_FAMILY_MCP_CEL_REVIEW_AUTHORITY_REQUIRED");
      }
      return compileAnimationCharacterFamilyReviewReceipt(args);
    case "verify_animation_character_family_review_receipt_v1":
      return assertAnimationCharacterFamilyReviewReceiptIntegrity(
        args.receipt,
        args.reviewInput,
      );
    case "compile_animation_character_family_runtime_plan_v1":
      return compileAnimationCharacterFamilyRuntimePlan(args);
    case "verify_animation_character_family_runtime_plan_v1":
      return assertAnimationCharacterFamilyRuntimePlanIntegrity(args.runtimePlan);
    default:
      fail("ANIMATION_CHARACTER_FAMILY_MCP_TOOL_UNKNOWN", name);
  }
}

function success(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function error(id, exception) {
  process.stdout.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: id ?? null,
      error: {
        code: -32000,
        message: exception instanceof Error ? exception.message : String(exception),
        data: {
          role: ROLE,
          authority: animationCharacterFamilyAuthority,
        },
      },
    })}\n`,
  );
}

function handle(message) {
  const id = message?.id;
  try {
    if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      fail("ANIMATION_CHARACTER_FAMILY_MCP_MESSAGE_INVALID");
    }
    if (message.method === "notifications/initialized") return;
    if (message.method === "initialize") {
      success(id, {
        protocolVersion: message.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions:
          "Use this server to govern character-wide animation coverage and cross-clip evidence. It cannot execute providers, approve artwork, mutate repositories, activate runtimes, or publish media.",
      });
      return;
    }
    if (message.method === "ping") {
      success(id, {});
      return;
    }
    if (message.method === "tools/list") {
      success(id, { tools: toolList() });
      return;
    }
    if (message.method === "tools/call") {
      const name = message.params?.name;
      const args = message.params?.arguments ?? {};
      const value = invokeTool(name, args);
      success(id, {
        content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
        structuredContent: value,
        isError: false,
      });
      return;
    }
    fail("ANIMATION_CHARACTER_FAMILY_MCP_METHOD_UNKNOWN", message.method);
  } catch (exception) {
    error(id, exception);
  }
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  if (Buffer.byteLength(line, "utf8") > MAX_LINE_BYTES) {
    error(null, new Error("ANIMATION_CHARACTER_FAMILY_MCP_MESSAGE_TOO_LARGE"));
    return;
  }
  try {
    handle(JSON.parse(line));
  } catch (exception) {
    error(null, exception);
  }
});
