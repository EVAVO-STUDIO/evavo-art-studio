#!/usr/bin/env node

import { createInterface } from "node:readline";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  ANIMATION_FRAME_LEDGER_PROTOCOL_VERSION,
  applyAnimationFrameCandidateBatch,
  assertAnimationFrameWorkLedgerIntegrity,
  compileAnimationFrameCandidateReceipt,
  compileNextAnimationFrameWorkBatch,
  createAnimationFrameWorkLedger,
  reviewAnimationFrameWorkLedger,
  summarizeAnimationFrameWorkLedger,
} from "./animation_frame_work_ledger_v1.mjs";

export const ANIMATION_FRAME_LEDGER_MCP_VERSION = "1.0.0";
export const ANIMATION_FRAME_LEDGER_ROLES = Object.freeze([
  "art-studio",
  "cel-animation-studio",
]);

const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;
const ENABLED = new Set(["1", "enabled", "on", "true", "yes"]);
const DANGEROUS_FLAGS = Object.freeze([
  "EVAVO_ANIMATION_PROVIDER_EXECUTION_ENABLED",
  "EVAVO_ANIMATION_AUTOMATIC_CREATIVE_APPROVAL_ENABLED",
  "EVAVO_ANIMATION_ARTIFACT_PROMOTION_ENABLED",
  "EVAVO_ANIMATION_TARGET_REPOSITORY_MUTATION_ENABLED",
  "EVAVO_ANIMATION_GIT_COMMIT_ENABLED",
  "EVAVO_ANIMATION_GIT_PUSH_ENABLED",
  "EVAVO_ANIMATION_RUNTIME_ACTIVATION_ENABLED",
  "EVAVO_ANIMATION_PUBLICATION_ENABLED",
]);
const COMMON = Object.freeze([
  "describe_animation_frame_ledger_v1",
  "verify_animation_frame_ledger_v1",
  "summarize_animation_frame_ledger_v1",
]);
const ROLE_TOOLS = Object.freeze({
  "art-studio": Object.freeze([
    ...COMMON,
    "create_animation_frame_ledger_v1",
    "compile_next_animation_frame_work_batch_v1",
    "compile_animation_frame_candidate_receipt_v1",
    "apply_animation_frame_candidate_batch_v1",
  ]),
  "cel-animation-studio": Object.freeze([
    ...COMMON,
    "review_animation_frame_ledger_v1",
  ]),
});
const DESCRIPTIONS = Object.freeze({
  describe_animation_frame_ledger_v1:
    "Describe the event-sourced frame-production ledger and this studio's exact authority.",
  create_animation_frame_ledger_v1:
    "Create a deterministic ledger from one approved canonical animation profile.",
  verify_animation_frame_ledger_v1:
    "Replay and verify a ledger against the exact canonical profile and retained events.",
  summarize_animation_frame_ledger_v1:
    "Return compact pending, review, repair and accepted progress without changing state.",
  compile_next_animation_frame_work_batch_v1:
    "Compile dependency-safe, reference-bound frame generation or targeted repair work orders.",
  compile_animation_frame_candidate_receipt_v1:
    "Bind one candidate artifact and inspection evidence to its exact work order without accepting it.",
  apply_animation_frame_candidate_batch_v1:
    "Apply a complete same-revision candidate receipt batch to the append-only ledger.",
  review_animation_frame_ledger_v1:
    "Run Cel Animation Studio's independent evidence-bound review and append the canonical decision.",
});
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

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}

export function assertAnimationFrameLedgerEnvironmentSafe(
  environment = process.env,
) {
  for (const name of DANGEROUS_FLAGS) {
    if (ENABLED.has(String(environment[name] ?? "").trim().toLowerCase())) {
      fail("ANIMATION_FRAME_LEDGER_UNSAFE_AUTHORITY_ENABLED", name);
    }
  }
}

export function resolveAnimationFrameLedgerRole(environment = process.env) {
  const role = String(environment.EVAVO_ANIMATION_FRAME_LEDGER_ROLE ?? "").trim();
  if (!ANIMATION_FRAME_LEDGER_ROLES.includes(role)) {
    fail(
      "ANIMATION_FRAME_LEDGER_ROLE_INVALID",
      role || "EVAVO_ANIMATION_FRAME_LEDGER_ROLE is required",
    );
  }
  return role;
}

export function describeAnimationFrameLedgerV1(role) {
  if (!ANIMATION_FRAME_LEDGER_ROLES.includes(role)) {
    fail("ANIMATION_FRAME_LEDGER_ROLE_INVALID", role);
  }
  return {
    schema: "evavo.animation-frame-work-ledger-description.v1",
    protocolVersion: ANIMATION_FRAME_LEDGER_PROTOCOL_VERSION,
    mcpVersion: ANIMATION_FRAME_LEDGER_MCP_VERSION,
    role,
    operations: [...ROLE_TOOLS[role]],
    workflow: [
      "create-ledger-from-approved-profile",
      "compile-dependency-safe-work-batch",
      "execute-provider-outside-this-server",
      "bind-candidate-receipts",
      "apply-complete-candidate-batch",
      "independent-cel-sequence-review",
      "targeted-repair-only-when-authorised",
      "accept-or-stop-on-bounded-blocker",
    ],
    rules: [
      "All work orders are bound to one exact ledger revision and profile digest.",
      "A same-revision batch is applied atomically; partial receipt batches are rejected.",
      "Identity, direction-master and dependency references require content digests.",
      "A generated PNG remains a candidate until independent review accepts it.",
      "Missing evidence is review work and never permission to redraw accepted frames.",
      "Only Cel Animation Studio records independent review decisions.",
    ],
    authority: AUTHORITY,
  };
}

function requiredSchema(name) {
  const required = {
    create_animation_frame_ledger_v1: ["profile", "sessionId"],
    verify_animation_frame_ledger_v1: ["profile", "ledger"],
    summarize_animation_frame_ledger_v1: ["ledger"],
    compile_next_animation_frame_work_batch_v1: ["profile", "ledger"],
    compile_animation_frame_candidate_receipt_v1: [
      "ledgerDigest",
      "workOrder",
      "candidate",
    ],
    apply_animation_frame_candidate_batch_v1: [
      "profile",
      "ledger",
      "batch",
      "receipts",
    ],
    review_animation_frame_ledger_v1: ["profile", "ledger", "reviewInput"],
  }[name];
  if (!required) return { type: "object", additionalProperties: false };
  return {
    type: "object",
    required,
    additionalProperties: true,
  };
}

function tools(role) {
  return ROLE_TOOLS[role].map((name) => ({
    name,
    description: DESCRIPTIONS[name],
    inputSchema: requiredSchema(name),
  }));
}

export async function executeAnimationFrameLedgerOperationV1(
  role,
  operation,
  args = {},
) {
  if (!ANIMATION_FRAME_LEDGER_ROLES.includes(role)) {
    fail("ANIMATION_FRAME_LEDGER_ROLE_INVALID", role);
  }
  if (!(ROLE_TOOLS[role] ?? []).includes(operation)) {
    fail(
      "ANIMATION_FRAME_LEDGER_OPERATION_NOT_ALLOWED_FOR_ROLE",
      `${role}:${operation}`,
    );
  }
  if (operation === "describe_animation_frame_ledger_v1") {
    return describeAnimationFrameLedgerV1(role);
  }
  if (operation === "verify_animation_frame_ledger_v1") {
    await assertAnimationFrameWorkLedgerIntegrity(args.profile, args.ledger);
    return {
      status: "verified",
      ledgerId: args.ledger?.ledgerId,
      ledgerDigest: args.ledger?.contentDigest,
      revision: args.ledger?.revision,
      authority: AUTHORITY,
    };
  }
  if (operation === "summarize_animation_frame_ledger_v1") {
    return summarizeAnimationFrameWorkLedger(args.ledger);
  }
  if (operation === "create_animation_frame_ledger_v1") {
    return createAnimationFrameWorkLedger(args);
  }
  if (operation === "compile_next_animation_frame_work_batch_v1") {
    return compileNextAnimationFrameWorkBatch(args);
  }
  if (operation === "compile_animation_frame_candidate_receipt_v1") {
    return compileAnimationFrameCandidateReceipt(args);
  }
  if (operation === "apply_animation_frame_candidate_batch_v1") {
    return applyAnimationFrameCandidateBatch(args);
  }
  if (operation === "review_animation_frame_ledger_v1") {
    return reviewAnimationFrameWorkLedger(args);
  }
  fail("ANIMATION_FRAME_LEDGER_OPERATION_UNKNOWN", operation);
}

function result(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function rpcError(id, code, message) {
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
}

async function dispatch(message, role) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    fail("ANIMATION_FRAME_LEDGER_MCP_MESSAGE_INVALID");
  }
  if (message.jsonrpc !== "2.0") {
    fail("ANIMATION_FRAME_LEDGER_MCP_JSONRPC_INVALID");
  }
  if (typeof message.method !== "string" || !message.method) {
    fail("ANIMATION_FRAME_LEDGER_MCP_METHOD_INVALID");
  }
  if (message.method === "initialize") {
    return {
      protocolVersion:
        message.params?.protocolVersion ?? "2025-03-26",
      capabilities: { tools: { listChanged: false } },
      serverInfo: {
        name: `evavo-animation-frame-ledger-${role}`,
        version: ANIMATION_FRAME_LEDGER_MCP_VERSION,
      },
      instructions:
        "Use the exact approved profile and latest ledger revision. Art Studio owns work orders and candidate admission. Cel Animation Studio owns independent sequence review. This server cannot execute providers, approve creative work, promote artifacts, mutate repositories, activate runtimes or publish media.",
    };
  }
  if (message.method === "notifications/initialized") return null;
  if (message.method === "ping") return {};
  if (message.method === "tools/list") return { tools: tools(role) };
  if (message.method === "tools/call") {
    try {
      return result(
        await executeAnimationFrameLedgerOperationV1(
          role,
          message.params?.name,
          message.params?.arguments ?? {},
        ),
      );
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "error",
              message:
                error instanceof Error ? error.message : String(error),
              authority: AUTHORITY,
            }),
          },
        ],
      };
    }
  }
  fail("ANIMATION_FRAME_LEDGER_MCP_METHOD_UNKNOWN", message.method);
}

export async function serveAnimationFrameLedgerMcp({
  environment = process.env,
  input = process.stdin,
  output = process.stdout,
} = {}) {
  assertAnimationFrameLedgerEnvironmentSafe(environment);
  const role = resolveAnimationFrameLedgerRole(environment);
  const lines = createInterface({ input, crlfDelay: Infinity, terminal: false });
  for await (const line of lines) {
    if (!line.trim()) continue;
    if (Buffer.byteLength(line, "utf8") > MAX_MESSAGE_BYTES) {
      output.write(
        `${rpcError(null, -32600, "ANIMATION_FRAME_LEDGER_MCP_MESSAGE_TOO_LARGE")}\n`,
      );
      continue;
    }
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      output.write(
        `${rpcError(null, -32700, "ANIMATION_FRAME_LEDGER_MCP_PARSE_ERROR")}\n`,
      );
      continue;
    }
    try {
      const value = await dispatch(message, role);
      if (message.id !== undefined && value !== null) {
        output.write(
          `${JSON.stringify({ jsonrpc: "2.0", id: message.id, result: value })}\n`,
        );
      }
    } catch (error) {
      if (message.id !== undefined) {
        output.write(
          `${rpcError(
            message.id,
            -32603,
            error instanceof Error ? error.message : String(error),
          )}\n`,
        );
      }
    }
  }
}

if ((process.argv[1] ? pathToFileURL(process.argv[1]).href : "") === import.meta.url) {
  serveAnimationFrameLedgerMcp().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        authority: AUTHORITY,
      })}\n`,
    );
    process.exitCode = 1;
  });
}
