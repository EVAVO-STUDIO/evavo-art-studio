#!/usr/bin/env node

import { createInterface } from "node:readline";
import process from "node:process";
import { pathToFileURL } from "node:url";
import * as base from "./animation_pipeline_control_plane_v1_mcp.mjs";

export const ANIMATION_PIPELINE_CONTROL_PLANE_VERSION = "1.1.0";
export const ANIMATION_PIPELINE_MCP_PROTOCOL_VERSION = "2025-03-26";
export const ANIMATION_PIPELINE_ROLES = Object.freeze([
  "art-studio",
  "cel-animation-studio",
  "video-studio",
]);

const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const AUTHORITY = Object.freeze({
  providerExecution: false,
  automaticCreativeApproval: false,
  artifactPromotion: false,
  targetRepositoryMutation: false,
  gitCommit: false,
  gitPush: false,
  runtimeActivation: false,
  publication: false,
});
const COMMON = ["describe_animation_pipeline_v1", "next_animation_pipeline_action_v1"];
const ROLE_TOOLS = Object.freeze({
  "art-studio": Object.freeze([
    ...COMMON,
    "compile_animation_production_profile_v1",
    "verify_animation_production_profile_v1",
    "next_animation_generation_batch_v1",
    "producer_self_review_animation_profile_v1",
    "verify_animation_profile_review_v1",
    "compile_accepted_animation_runtime_clip_v1",
    "verify_animation_review_receipt_v1",
    "verify_animation_review_receipt_against_input_v1",
    "compile_animation_sequence_delivery_v1",
    "verify_animation_sequence_delivery_v1",
  ]),
  "cel-animation-studio": Object.freeze([
    ...COMMON,
    "verify_animation_production_profile_v1",
    "independently_review_animation_profile_v1",
    "verify_animation_profile_review_v1",
    "compile_accepted_animation_runtime_clip_v1",
    "compile_animation_review_receipt_v1",
    "verify_animation_review_receipt_v1",
    "verify_animation_review_receipt_against_input_v1",
    "verify_animation_sequence_delivery_v1",
  ]),
  "video-studio": Object.freeze([
    ...COMMON,
    "verify_animation_sequence_delivery_v1",
    "create_video_studio_animation_intake_v1",
    "verify_video_studio_animation_intake_v1",
  ]),
});
const ENUMS = Object.freeze({
  profileStatus: ["missing", "compiled", "verified", "blocked"],
  reviewStatus: ["missing", "review-required", "rework-required", "accepted", "blocked"],
  reviewReceiptStatus: ["missing", "present", "verified"],
  creativeApprovalStatus: ["missing", "present", "verified"],
  deliveryStatus: ["missing", "present", "verified"],
  intakeStatus: ["missing", "present", "verified", "blocked"],
  runtimeAcceptanceStatus: ["missing", "present", "verified", "blocked"],
});
const DESCRIPTIONS = Object.freeze({
  describe_animation_pipeline_v1: "Describe this studio's canonical animation role and authority boundary.",
  next_animation_pipeline_action_v1: "Validate current state and return the next owning studio and action.",
  compile_animation_production_profile_v1: "Compile the camera-aware production profile through Art Studio.",
  verify_animation_production_profile_v1: "Verify the production profile and content identity.",
  next_animation_generation_batch_v1: "Return the next dependency-safe drawing batch without rendering.",
  producer_self_review_animation_profile_v1: "Run producer technical review without creative approval.",
  independently_review_animation_profile_v1: "Run independent moving-sequence review through Cel Animation Studio.",
  verify_animation_profile_review_v1: "Verify a canonical review decision.",
  compile_accepted_animation_runtime_clip_v1: "Compile accepted timing into an exact-duration runtime clip.",
  compile_animation_review_receipt_v1: "Compile the immutable review receipt through Cel Animation Studio.",
  verify_animation_review_receipt_v1: "Verify review-receipt self-integrity.",
  verify_animation_review_receipt_against_input_v1: "Verify a receipt against its exact review input.",
  compile_animation_sequence_delivery_v1: "Compile path-free accepted delivery through Art Studio.",
  verify_animation_sequence_delivery_v1: "Verify delivery lineage, timing and artifact bindings.",
  create_video_studio_animation_intake_v1: "Create timing-preserving intake through Video Studio.",
  verify_video_studio_animation_intake_v1: "Verify Video Studio intake and source binding.",
});

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}
function object(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}
function enumField(value, key, values, code) {
  if (value[key] !== undefined && !values.includes(value[key])) fail(code, String(value[key]));
}
function idList(value, code) {
  if (value === undefined) return;
  if (!Array.isArray(value)) fail(code);
  const seen = new Set();
  for (const id of value) {
    if (typeof id !== "string" || !SAFE_ID.test(id)) fail(code, String(id));
    if (seen.has(id)) fail(`${code}_DUPLICATE`, id);
    seen.add(id);
  }
}
function target(value, kind) {
  if (value === undefined) return;
  const item = object(value, `ANIMATION_PIPELINE_${kind}_TARGET_INVALID`);
  if (item.required !== undefined && typeof item.required !== "boolean") {
    fail(`ANIMATION_PIPELINE_${kind}_REQUIRED_INVALID`, String(item.required));
  }
  const key = kind === "GODOT" ? "runtimeAcceptanceStatus" : "intakeStatus";
  const values = kind === "GODOT" ? ENUMS.runtimeAcceptanceStatus : ENUMS.intakeStatus;
  enumField(item, key, values, `ANIMATION_PIPELINE_${kind}_${kind === "GODOT" ? "ACCEPTANCE" : "INTAKE"}_STATUS_INVALID`);
}

export function validateAnimationPipelineStateV1(submitted) {
  const state = object(submitted, "ANIMATION_PIPELINE_STATE_INVALID");
  if (state.schema !== undefined && state.schema !== "evavo.animation-pipeline-state.v1") {
    fail("ANIMATION_PIPELINE_STATE_SCHEMA_INVALID", String(state.schema));
  }
  enumField(state, "profileStatus", ENUMS.profileStatus, "ANIMATION_PIPELINE_PROFILE_STATUS_INVALID");
  enumField(state, "reviewStatus", ENUMS.reviewStatus, "ANIMATION_PIPELINE_REVIEW_STATUS_INVALID");
  enumField(state, "reviewReceiptStatus", ENUMS.reviewReceiptStatus, "ANIMATION_PIPELINE_REVIEW_RECEIPT_STATUS_INVALID");
  enumField(state, "creativeApprovalStatus", ENUMS.creativeApprovalStatus, "ANIMATION_PIPELINE_CREATIVE_APPROVAL_STATUS_INVALID");
  enumField(state, "deliveryStatus", ENUMS.deliveryStatus, "ANIMATION_PIPELINE_DELIVERY_STATUS_INVALID");
  idList(state.pendingDrawingIds, "ANIMATION_PIPELINE_PENDING_DRAWING_ID_INVALID");
  idList(state.rejectedDrawingIds, "ANIMATION_PIPELINE_REJECTED_DRAWING_ID_INVALID");
  if (state.targets !== undefined) {
    const targets = object(state.targets, "ANIMATION_PIPELINE_TARGETS_INVALID");
    target(targets.video, "VIDEO");
    target(targets.cel, "CEL");
    target(targets.godot, "GODOT");
  }
  return state;
}

function blockedTargetAction(state) {
  const targets = state.targets ?? {};
  if (targets.video?.required === true && targets.video.intakeStatus === "blocked") {
    return {
      status: "blocked",
      action: "resolve-video-studio-animation-intake-blocker",
      ownerRole: "video-studio",
      reason: "Video Studio intake is blocked.",
      authority: AUTHORITY,
    };
  }
  if (targets.cel?.required === true && targets.cel.intakeStatus === "blocked") {
    return {
      status: "blocked",
      action: "resolve-cel-animation-intake-blocker",
      ownerRole: "cel-animation-studio",
      reason: "Cel animation intake is blocked.",
      authority: AUTHORITY,
    };
  }
  if (
    targets.godot?.required === true &&
    targets.godot.runtimeAcceptanceStatus === "blocked"
  ) {
    return {
      status: "blocked",
      action: "resolve-godot-runtime-acceptance-blocker",
      ownerRole: "game-runtime",
      reason: "Godot native runtime acceptance is blocked.",
      authority: AUTHORITY,
    };
  }
  return null;
}

export function nextAnimationPipelineActionV1(state) {
  const validated = validateAnimationPipelineStateV1(state);
  return blockedTargetAction(validated) ?? base.nextAnimationPipelineActionV1(validated);
}

export function describeAnimationPipelineV1(role) {
  if (!ANIMATION_PIPELINE_ROLES.includes(role)) fail("ANIMATION_PIPELINE_ROLE_INVALID", role);
  return {
    schema: "evavo.animation-pipeline-control-plane.v1",
    version: ANIMATION_PIPELINE_CONTROL_PLANE_VERSION,
    role,
    operations: [...ROLE_TOOLS[role]],
    stageOrder: [
      "camera-aware-production-profile",
      "dependency-safe-art-production",
      "producer-technical-review",
      "independent-moving-sequence-review",
      "immutable-review-receipt",
      "separate-authorised-creative-approval",
      "path-free-sequence-delivery",
      "target-specific-intake",
      "native-runtime-acceptance-where-required",
    ],
    ownership: {
      productionProfile: "art-studio",
      independentReview: "cel-animation-studio",
      reviewReceipt: "cel-animation-studio",
      sequenceDelivery: "art-studio",
      videoIntake: "video-studio",
      godotRuntimeAcceptance: "game-runtime",
    },
    authority: AUTHORITY,
  };
}

export async function executeAnimationPipelineOperationV1(role, operation, args = {}) {
  if (!ANIMATION_PIPELINE_ROLES.includes(role)) fail("ANIMATION_PIPELINE_ROLE_INVALID", role);
  if (!(ROLE_TOOLS[role] ?? []).includes(operation)) {
    fail("ANIMATION_PIPELINE_OPERATION_NOT_ALLOWED_FOR_ROLE", `${role}:${operation}`);
  }
  if (operation === "describe_animation_pipeline_v1") return describeAnimationPipelineV1(role);
  if (operation === "next_animation_pipeline_action_v1") return nextAnimationPipelineActionV1(args.state);
  const value = await base.executeAnimationPipelineOperationV1(role, operation, args);
  if (
    value && typeof value === "object" && !Array.isArray(value) &&
    (operation === "producer_self_review_animation_profile_v1" ||
      operation === "independently_review_animation_profile_v1")
  ) {
    const decision = { ...value };
    delete decision.reviewAuthority;
    delete decision.automaticCreativeApproval;
    return decision;
  }
  return value;
}

function inputSchema(name) {
  const required = {
    next_animation_pipeline_action_v1: ["state"],
    verify_animation_production_profile_v1: ["profile"],
    next_animation_generation_batch_v1: ["profile"],
    producer_self_review_animation_profile_v1: ["profile", "cycle", "drawingEvidence"],
    independently_review_animation_profile_v1: ["profile", "cycle", "drawingEvidence"],
    verify_animation_profile_review_v1: ["input", "decision"],
    compile_accepted_animation_runtime_clip_v1: ["profile", "decision"],
    verify_animation_review_receipt_v1: ["receipt"],
    verify_animation_review_receipt_against_input_v1: ["input", "receipt"],
    verify_animation_sequence_delivery_v1: ["delivery"],
    create_video_studio_animation_intake_v1: ["delivery"],
    verify_video_studio_animation_intake_v1: ["intake"],
  }[name] ?? [];
  if (name === "describe_animation_pipeline_v1") return { type: "object", additionalProperties: false };
  return { type: "object", ...(required.length ? { required } : {}), additionalProperties: true };
}
function tools(role) {
  return ROLE_TOOLS[role].map((name) => ({ name, description: DESCRIPTIONS[name], inputSchema: inputSchema(name) }));
}
function rpcError(id, code, message) {
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
}
async function dispatch(message, role) {
  const request = object(message, "ANIMATION_PIPELINE_MCP_MESSAGE_INVALID");
  if (request.jsonrpc !== "2.0") fail("ANIMATION_PIPELINE_MCP_JSONRPC_INVALID");
  if (typeof request.method !== "string" || !request.method) fail("ANIMATION_PIPELINE_MCP_METHOD_INVALID");
  if (request.method === "initialize") {
    return {
      protocolVersion: request.params?.protocolVersion ?? ANIMATION_PIPELINE_MCP_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: `evavo-animation-pipeline-${role}`, version: ANIMATION_PIPELINE_CONTROL_PLANE_VERSION },
      instructions: "Use the owning studio for each stage. Missing evidence is not redraw authority. Stop on blocked or awaiting-authority. This server cannot execute providers, approve creative work, promote artifacts, mutate repositories, activate runtimes or publish media.",
    };
  }
  if (request.method === "notifications/initialized") return null;
  if (request.method === "ping") return {};
  if (request.method === "tools/list") return { tools: tools(role) };
  if (request.method === "tools/call") {
    try {
      const value = await executeAnimationPipelineOperationV1(role, request.params?.name, request.params?.arguments ?? {});
      return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: JSON.stringify({ status: "error", message: error instanceof Error ? error.message : String(error), authority: AUTHORITY }) }] };
    }
  }
  fail("ANIMATION_PIPELINE_MCP_METHOD_UNKNOWN", request.method);
}

export async function serveAnimationPipelineMcp({ environment = process.env, input = process.stdin, output = process.stdout } = {}) {
  base.assertAnimationPipelineEnvironmentSafe(environment);
  const role = base.resolveAnimationPipelineRole(environment);
  const lines = createInterface({ input, crlfDelay: Infinity, terminal: false });
  for await (const line of lines) {
    if (!line.trim()) continue;
    if (Buffer.byteLength(line, "utf8") > MAX_MESSAGE_BYTES) {
      output.write(`${rpcError(null, -32600, "ANIMATION_PIPELINE_MCP_MESSAGE_TOO_LARGE")}\n`);
      continue;
    }
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      output.write(`${rpcError(null, -32700, "ANIMATION_PIPELINE_MCP_PARSE_ERROR")}\n`);
      continue;
    }
    try {
      const value = await dispatch(message, role);
      if (message.id !== undefined && value !== null) {
        output.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, result: value })}\n`);
      }
    } catch (error) {
      if (message.id !== undefined) {
        output.write(`${rpcError(message.id, -32603, error instanceof Error ? error.message : String(error))}\n`);
      }
    }
  }
}

if ((process.argv[1] ? pathToFileURL(process.argv[1]).href : "") === import.meta.url) {
  serveAnimationPipelineMcp().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "error", message: error instanceof Error ? error.message : String(error), authority: AUTHORITY })}\n`);
    process.exitCode = 1;
  });
}
