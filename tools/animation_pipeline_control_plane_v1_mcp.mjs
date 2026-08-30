#!/usr/bin/env node

import { access } from "node:fs/promises";
import { createInterface } from "node:readline";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ANIMATION_PIPELINE_CONTROL_PLANE_VERSION = "1.0.0";
export const ANIMATION_PIPELINE_MCP_PROTOCOL_VERSION = "2025-03-26";
export const ANIMATION_PIPELINE_ROLES = ["art-studio", "cel-animation-studio", "video-studio"];

const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
const ENABLED = new Set(["1", "enabled", "on", "true", "yes"]);
const DANGEROUS_FLAGS = [
  "EVAVO_ANIMATION_PROVIDER_EXECUTION_ENABLED",
  "EVAVO_ANIMATION_AUTOMATIC_CREATIVE_APPROVAL_ENABLED",
  "EVAVO_ANIMATION_ARTIFACT_PROMOTION_ENABLED",
  "EVAVO_ANIMATION_TARGET_REPOSITORY_MUTATION_ENABLED",
  "EVAVO_ANIMATION_GIT_COMMIT_ENABLED",
  "EVAVO_ANIMATION_GIT_PUSH_ENABLED",
  "EVAVO_ANIMATION_RUNTIME_ACTIVATION_ENABLED",
  "EVAVO_ANIMATION_PUBLICATION_ENABLED",
];
const CREDENTIAL_KEY = /(?:^|[_-])(api[_-]?key|access[_-]?key|authorization|bearer|credential|password|private[_-]?key|refresh[_-]?token|secret|session[_-]?token|token)(?:$|[_-])/i;
const CREDENTIAL_VALUE = /\b(?:bearer\s+[a-z0-9._~+/=-]{12,}|sk-[a-z0-9_-]{12,}|gh[opusr]_[a-z0-9]{20,})\b/i;
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

const MODULES = Object.freeze({
  profile: {
    "art-studio": ["./animation_production_profile_canonical_v1.mjs"],
    "cel-animation-studio": [
      "./animation_production_profile_review_canonical_v1.mjs",
      "./animation_production_profile_canonical_v1.mjs",
    ],
    "video-studio": [],
  },
  receipt: {
    "art-studio": ["./animation_production_review_receipt_canonical_v1.mjs"],
    "cel-animation-studio": ["./animation_production_review_receipt_canonical_v1.mjs"],
    "video-studio": [],
  },
  delivery: {
    "art-studio": ["./animation_sequence_delivery_canonical_v1.mjs"],
    "cel-animation-studio": ["./animation_sequence_delivery_canonical_v1.mjs"],
    "video-studio": ["./animation_sequence_delivery_canonical_v1.mjs"],
  },
});

const DESCRIPTIONS = Object.freeze({
  describe_animation_pipeline_v1: "Describe the active studio role, canonical stages and non-authority boundary.",
  next_animation_pipeline_action_v1: "Return the next cross-studio action without executing side effects.",
  compile_animation_production_profile_v1: "Compile the canonical camera-aware animation production profile.",
  verify_animation_production_profile_v1: "Verify a canonical animation production profile.",
  next_animation_generation_batch_v1: "Return the next dependency-safe drawing batch without rendering.",
  producer_self_review_animation_profile_v1: "Run producer-side technical review without creative approval.",
  independently_review_animation_profile_v1: "Run independent evidence-bound moving-sequence review.",
  verify_animation_profile_review_v1: "Verify a canonical profile review decision.",
  compile_accepted_animation_runtime_clip_v1: "Compile an accepted review into an exact-duration runtime clip.",
  compile_animation_review_receipt_v1: "Compile an immutable evidence-bound review receipt.",
  verify_animation_review_receipt_v1: "Verify review-receipt self-integrity.",
  verify_animation_review_receipt_against_input_v1: "Verify a review receipt against its exact input.",
  compile_animation_sequence_delivery_v1: "Compile path-free accepted sequence delivery.",
  verify_animation_sequence_delivery_v1: "Verify accepted sequence delivery.",
  create_video_studio_animation_intake_v1: "Create timing-preserving Video Studio intake.",
  verify_video_studio_animation_intake_v1: "Verify Video Studio intake and delivery binding.",
});

const COMMON = ["describe_animation_pipeline_v1", "next_animation_pipeline_action_v1"];
const ROLE_TOOLS = Object.freeze({
  "art-studio": [
    ...COMMON,
    "compile_animation_production_profile_v1",
    "verify_animation_production_profile_v1",
    "next_animation_generation_batch_v1",
    "producer_self_review_animation_profile_v1",
    "verify_animation_profile_review_v1",
    "compile_accepted_animation_runtime_clip_v1",
    "compile_animation_review_receipt_v1",
    "verify_animation_review_receipt_v1",
    "verify_animation_review_receipt_against_input_v1",
    "compile_animation_sequence_delivery_v1",
    "verify_animation_sequence_delivery_v1",
    "create_video_studio_animation_intake_v1",
    "verify_video_studio_animation_intake_v1",
  ],
  "cel-animation-studio": [
    ...COMMON,
    "verify_animation_production_profile_v1",
    "independently_review_animation_profile_v1",
    "verify_animation_profile_review_v1",
    "compile_accepted_animation_runtime_clip_v1",
    "compile_animation_review_receipt_v1",
    "verify_animation_review_receipt_v1",
    "verify_animation_review_receipt_against_input_v1",
    "compile_animation_sequence_delivery_v1",
    "verify_animation_sequence_delivery_v1",
    "create_video_studio_animation_intake_v1",
    "verify_video_studio_animation_intake_v1",
  ],
  "video-studio": [
    ...COMMON,
    "verify_animation_sequence_delivery_v1",
    "create_video_studio_animation_intake_v1",
    "verify_video_studio_animation_intake_v1",
  ],
});

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}

export function assertAnimationPipelineEnvironmentSafe(environment = process.env) {
  for (const name of DANGEROUS_FLAGS) {
    if (ENABLED.has(String(environment[name] ?? "").trim().toLowerCase())) {
      fail("ANIMATION_PIPELINE_UNSAFE_AUTHORITY_ENABLED", name);
    }
  }
}

export function resolveAnimationPipelineRole(environment = process.env) {
  const role = String(environment.EVAVO_ANIMATION_PIPELINE_ROLE ?? "").trim();
  if (!ANIMATION_PIPELINE_ROLES.includes(role)) {
    fail("ANIMATION_PIPELINE_ROLE_INVALID", role || "EVAVO_ANIMATION_PIPELINE_ROLE is required");
  }
  return role;
}

function assertCredentialFree(value, path = "input", seen = new Set()) {
  if (value == null) return;
  if (typeof value === "string") {
    if (CREDENTIAL_VALUE.test(value)) fail("ANIMATION_PIPELINE_CREDENTIAL_VALUE_FORBIDDEN", path);
    return;
  }
  if (typeof value !== "object") return;
  if (seen.has(value)) fail("ANIMATION_PIPELINE_CYCLIC_INPUT_FORBIDDEN", path);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertCredentialFree(entry, `${path}[${index}]`, seen));
  } else {
    for (const [key, entry] of Object.entries(value)) {
      if (CREDENTIAL_KEY.test(key)) fail("ANIMATION_PIPELINE_CREDENTIAL_KEY_FORBIDDEN", `${path}.${key}`);
      assertCredentialFree(entry, `${path}.${key}`, seen);
    }
  }
  seen.delete(value);
}

function enumValue(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function route(status, action, ownerRole, reason, extra = {}) {
  return { status, action, ownerRole, reason, ...extra, authority: AUTHORITY };
}

export function nextAnimationPipelineActionV1(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) fail("ANIMATION_PIPELINE_STATE_INVALID");
  assertCredentialFree(state, "state");
  const profile = enumValue(state.profileStatus, ["missing", "compiled", "verified", "blocked"], "missing");
  if (profile === "missing") return route("action-required", "compile-animation-production-profile", "art-studio", "No canonical camera-aware profile exists.");
  if (profile === "compiled") return route("action-required", "verify-animation-production-profile", "art-studio", "The profile has not passed deterministic verification.");
  if (profile === "blocked") return route("blocked", "repair-animation-production-profile", "art-studio", "Blocking profile findings prevent production.");

  const pending = Array.isArray(state.pendingDrawingIds) ? state.pendingDrawingIds.filter((v) => typeof v === "string") : [];
  if (pending.length) return route("action-required", "prepare-next-animation-generation-batch", "art-studio", "Drawings remain after dependency verification.", { pendingDrawingIds: [...new Set(pending)].sort() });

  const review = enumValue(state.reviewStatus, ["missing", "review-required", "rework-required", "accepted", "blocked"], "missing");
  if (["missing", "review-required"].includes(review)) return route("action-required", "independently-review-animation-profile", "cel-animation-studio", "The complete moving sequence requires independent review.");
  if (review === "rework-required") {
    const rejected = Array.isArray(state.rejectedDrawingIds) ? state.rejectedDrawingIds.filter((v) => typeof v === "string") : [];
    return route("action-required", "repair-rejected-animation-drawings", "art-studio", "Only independently rejected drawings may be repaired.", { rejectedDrawingIds: [...new Set(rejected)].sort() });
  }
  if (review === "blocked") return route("blocked", "resolve-animation-review-blocker", "cel-animation-studio", "Review retry, cycle or no-progress limits were reached.");

  const receipt = enumValue(state.reviewReceiptStatus, ["missing", "present", "verified"], "missing");
  if (receipt === "missing") return route("action-required", "compile-animation-review-receipt", "cel-animation-studio", "The accepted decision is not bound to immutable evidence.");
  if (receipt === "present") return route("action-required", "verify-animation-review-receipt", "cel-animation-studio", "The receipt still requires integrity and input verification.");

  const approval = enumValue(state.creativeApprovalStatus, ["missing", "present", "verified"], "missing");
  if (approval !== "verified") return route("awaiting-authority", "obtain-separated-creative-approval", "authorised-human-reviewer", "Technical evidence cannot approve itself.");

  const delivery = enumValue(state.deliveryStatus, ["missing", "present", "verified"], "missing");
  if (delivery === "missing") return route("action-required", "compile-animation-sequence-delivery", "art-studio", "Accepted art is ready for path-free delivery compilation.");
  if (delivery === "present") return route("action-required", "verify-animation-sequence-delivery", "cel-animation-studio", "Delivery lineage and timing remain unverified.");

  const targets = state.targets && typeof state.targets === "object" ? state.targets : {};
  const video = targets.video && typeof targets.video === "object" ? targets.video : {};
  if (video.required === true && video.intakeStatus !== "verified") return route("action-required", video.intakeStatus === "present" ? "verify-video-studio-animation-intake" : "create-video-studio-animation-intake", "video-studio", "Video Studio requires verified timing-preserving intake.");
  const cel = targets.cel && typeof targets.cel === "object" ? targets.cel : {};
  if (cel.required === true && cel.intakeStatus !== "verified") return route("action-required", "prepare-cel-animation-sequence-intake", "cel-animation-studio", "Cel exposure-sheet intake remains unverified.");
  const godot = targets.godot && typeof targets.godot === "object" ? targets.godot : {};
  if (godot.required === true && godot.runtimeAcceptanceStatus !== "verified") return route("action-required", "produce-godot-runtime-acceptance-evidence", "game-runtime", "Godot requires native runtime evidence before activation eligibility.");
  return route("complete", "none", "none", "All requested animation gates are verified.");
}

const moduleCache = new Map();
async function loadModule(role, kind) {
  const key = `${role}:${kind}`;
  if (!moduleCache.has(key)) {
    moduleCache.set(key, (async () => {
      for (const candidate of MODULES[kind]?.[role] ?? []) {
        const url = new URL(candidate, import.meta.url);
        try {
          await access(fileURLToPath(url));
          return import(url.href);
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      }
      fail("ANIMATION_PIPELINE_CANONICAL_MODULE_MISSING", key);
    })());
  }
  return moduleCache.get(key);
}

function callable(module, name, operation) {
  if (typeof module[name] !== "function") fail("ANIMATION_PIPELINE_CANONICAL_FUNCTION_MISSING", `${operation}:${name}`);
  return module[name];
}

function verified(kind, value = {}) {
  return { status: "verified", kind, ...value, authority: AUTHORITY };
}

export async function executeAnimationPipelineOperationV1(role, operation, args = {}) {
  if (!ANIMATION_PIPELINE_ROLES.includes(role)) fail("ANIMATION_PIPELINE_ROLE_INVALID", role);
  if (!(ROLE_TOOLS[role] ?? []).includes(operation)) fail("ANIMATION_PIPELINE_OPERATION_NOT_ALLOWED_FOR_ROLE", `${role}:${operation}`);
  assertCredentialFree(args);
  if (operation === "describe_animation_pipeline_v1") return describeAnimationPipelineV1(role);
  if (operation === "next_animation_pipeline_action_v1") return nextAnimationPipelineActionV1(args.state);

  const profileOps = new Set([
    "compile_animation_production_profile_v1",
    "verify_animation_production_profile_v1",
    "next_animation_generation_batch_v1",
    "producer_self_review_animation_profile_v1",
    "independently_review_animation_profile_v1",
    "verify_animation_profile_review_v1",
    "compile_accepted_animation_runtime_clip_v1",
  ]);
  if (profileOps.has(operation)) {
    const module = await loadModule(role, "profile");
    if (operation === "compile_animation_production_profile_v1") return callable(module, "compileAnimationProductionProfile", operation)(args);
    if (operation === "verify_animation_production_profile_v1") {
      await callable(module, "assertAnimationProductionProfileIntegrity", operation)(args.profile);
      return verified("animation-production-profile", { profileId: args.profile?.profileId, contentDigest: args.profile?.contentDigest, promotable: args.profile?.quality?.promotable });
    }
    if (operation === "next_animation_generation_batch_v1") return callable(module, "nextAnimationProductionBatch", operation)(args.profile, args.completedDrawingIds ?? []);
    if (["producer_self_review_animation_profile_v1", "independently_review_animation_profile_v1"].includes(operation)) {
      const decision = await callable(module, "reviewAnimationProductionProfile", operation)(args);
      return { ...decision, reviewAuthority: operation.startsWith("independently") ? "independent-evidence-review" : "producer-technical-self-review", automaticCreativeApproval: false };
    }
    if (operation === "verify_animation_profile_review_v1") {
      await callable(module, "assertAnimationProductionReviewIntegrity", operation)(args.input, args.decision);
      return verified("animation-production-review", { profileDigest: args.decision?.profileDigest, decisionDigest: args.decision?.decisionDigest, reviewStatus: args.decision?.status });
    }
    return callable(module, "compileAcceptedRuntimeClip", operation)(args.profile, args.decision);
  }

  const receiptOps = new Set(["compile_animation_review_receipt_v1", "verify_animation_review_receipt_v1", "verify_animation_review_receipt_against_input_v1"]);
  if (receiptOps.has(operation)) {
    const module = await loadModule(role, "receipt");
    if (operation === "compile_animation_review_receipt_v1") return callable(module, "compileAnimationProductionReviewReceipt", operation)(args);
    if (operation === "verify_animation_review_receipt_v1") {
      await callable(module, "assertAnimationProductionReviewReceiptSelfIntegrity", operation)(args.receipt);
      return verified("animation-production-review-receipt", { receiptDigest: args.receipt?.receiptDigest, reviewStatus: args.receipt?.decision?.status });
    }
    await callable(module, "assertAnimationProductionReviewReceiptAgainstInput", operation)(args.input, args.receipt);
    return verified("animation-production-review-receipt-input-binding", { receiptDigest: args.receipt?.receiptDigest, reviewInputDigest: args.receipt?.reviewInputDigest });
  }

  const module = await loadModule(role, "delivery");
  if (operation === "compile_animation_sequence_delivery_v1") return callable(module, "compileAnimationSequenceDelivery", operation)(args);
  if (operation === "verify_animation_sequence_delivery_v1") {
    await callable(module, "assertAnimationSequenceDeliveryIntegrity", operation)(args.delivery);
    return verified("animation-sequence-delivery", { contentDigest: args.delivery?.contentDigest, totalDurationSeconds: args.delivery?.timing?.totalDurationSeconds });
  }
  if (operation === "create_video_studio_animation_intake_v1") return callable(module, "compileVideoStudioAnimationIntake", operation)(args.delivery);
  if (operation === "verify_video_studio_animation_intake_v1") {
    await callable(module, "assertVideoStudioAnimationIntakeIntegrity", operation)(args.intake);
    return verified("video-studio-animation-intake", { contentDigest: args.intake?.contentDigest, sourceDeliveryDigest: args.intake?.sourceDeliveryDigest });
  }
  fail("ANIMATION_PIPELINE_OPERATION_UNKNOWN", operation);
}

export function describeAnimationPipelineV1(role) {
  if (!ANIMATION_PIPELINE_ROLES.includes(role)) fail("ANIMATION_PIPELINE_ROLE_INVALID", role);
  return {
    schema: "evavo.animation-pipeline-control-plane.v1",
    version: ANIMATION_PIPELINE_CONTROL_PLANE_VERSION,
    role,
    operations: ROLE_TOOLS[role],
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
    rules: [
      "Art Studio owns frame planning, production packets and targeted repair.",
      "Cel Animation Studio owns independent timing, continuity and moving-sequence review.",
      "Video Studio preserves approved timing and does not silently interpolate authored holds or impacts.",
      "Missing evidence is review work, not redraw authority.",
      "Creative approval is separate from technical and automated review.",
      "Godot activation requires separately verified native runtime evidence.",
    ],
    authority: AUTHORITY,
  };
}

function inputSchema(name) {
  if (name === "describe_animation_pipeline_v1") return { type: "object", additionalProperties: false };
  if (name === "next_animation_pipeline_action_v1") return { type: "object", required: ["state"], properties: { state: { type: "object" } }, additionalProperties: false };
  return { type: "object", additionalProperties: true };
}

function tools(role) {
  return ROLE_TOOLS[role].map((name) => ({ name, description: DESCRIPTIONS[name], inputSchema: inputSchema(name) }));
}

function result(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value };
}

export async function dispatchAnimationPipelineMcpMessage(message, role) {
  if (!message || typeof message !== "object" || Array.isArray(message)) fail("ANIMATION_PIPELINE_MCP_MESSAGE_INVALID");
  if (message.method === "initialize") return {
    protocolVersion: message.params?.protocolVersion ?? ANIMATION_PIPELINE_MCP_PROTOCOL_VERSION,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: `evavo-animation-pipeline-${role}`, version: ANIMATION_PIPELINE_CONTROL_PLANE_VERSION },
    instructions: "Use canonical cross-studio stages. Never infer approval, redraw accepted work because evidence is missing, execute providers, promote artifacts, mutate repositories, activate runtimes or publish media through this server.",
  };
  if (message.method === "notifications/initialized") return null;
  if (message.method === "ping") return {};
  if (message.method === "tools/list") return { tools: tools(role) };
  if (message.method === "tools/call") {
    try {
      return result(await executeAnimationPipelineOperationV1(role, message.params?.name, message.params?.arguments ?? {}));
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: JSON.stringify({ status: "error", message: error instanceof Error ? error.message : String(error), authority: AUTHORITY }) }] };
    }
  }
  fail("ANIMATION_PIPELINE_MCP_METHOD_UNKNOWN", String(message.method));
}

export async function serveAnimationPipelineMcp({ environment = process.env, input = process.stdin, output = process.stdout } = {}) {
  assertAnimationPipelineEnvironmentSafe(environment);
  const role = resolveAnimationPipelineRole(environment);
  const lines = createInterface({ input, crlfDelay: Infinity, terminal: false });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let message;
    try {
      if (Buffer.byteLength(line, "utf8") > MAX_MESSAGE_BYTES) fail("ANIMATION_PIPELINE_MCP_MESSAGE_TOO_LARGE");
      message = JSON.parse(line);
      const value = await dispatchAnimationPipelineMcpMessage(message, role);
      if (message.id !== undefined && value !== null) output.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, result: value })}\n`);
    } catch (error) {
      if (message?.id !== undefined) output.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: error instanceof Error ? error.message : String(error) } })}\n`);
    }
  }
}

if ((process.argv[1] ? pathToFileURL(process.argv[1]).href : "") === import.meta.url) {
  serveAnimationPipelineMcp().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "error", message: error instanceof Error ? error.message : String(error), authority: AUTHORITY })}\n`);
    process.exitCode = 1;
  });
}
