#!/usr/bin/env node

import { createInterface } from "node:readline";
import { isAbsolute, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  ANIMATION_EXECUTION_SUPERVISOR_PROTOCOL_VERSION,
  animationExecutionSupervisorAuthority,
  compileAnimationExecutionReviewPacket,
  describeAnimationExecutionSupervisor,
  getAnimationExecutionStatus,
  initializeAnimationExecutionWorkspace,
  installAnimationSequenceCreativeApproval,
  planAnimationExecutionCycle,
  runAnimationExecutionCycle,
  verifyAnimationExecutionWorkspace,
} from "./animation_execution_supervisor_v1.mjs";

export const ANIMATION_EXECUTION_SUPERVISOR_MCP_VERSION = "1.0.0";
export const ANIMATION_EXECUTION_SUPERVISOR_MCP_PROTOCOL_VERSION = "2025-03-26";

const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u;
const READ_TOOLS = Object.freeze([
  "describe_animation_execution_supervisor_v1",
  "get_animation_execution_status_v1",
  "plan_animation_execution_cycle_v1",
  "compile_animation_execution_review_packet_v1",
  "verify_animation_execution_workspace_v1",
]);
const MUTATING_TOOLS = Object.freeze([
  "initialize_animation_execution_workspace_v1",
  "run_animation_execution_cycle_v1",
]);
const APPROVAL_TOOL = "install_animation_sequence_creative_approval_v1";
const DESCRIPTIONS = Object.freeze({
  describe_animation_execution_supervisor_v1:
    "Describe the bounded local animation execution supervisor and its authority limits.",
  get_animation_execution_status_v1:
    "Read the exact restart-safe status of one governed animation execution workspace.",
  plan_animation_execution_cycle_v1:
    "Plan the next bounded animation execution cycle without executing providers or changing workspace state.",
  compile_animation_execution_review_packet_v1:
    "Compile an exact path-relative drawing or moving-sequence review packet without fabricating visual evidence.",
  verify_animation_execution_workspace_v1:
    "Verify the request, catalogue, ledger, state, event chain, cycles and local candidate artifacts.",
  initialize_animation_execution_workspace_v1:
    "Create one governed animation execution workspace from an approved profile and reviewed adapter catalogue.",
  run_animation_execution_cycle_v1:
    "Execute exactly one bounded provider, inspection, independent review or accepted-delivery cycle.",
  install_animation_sequence_creative_approval_v1:
    "Install an exact owner or director approval after independent sequence acceptance.",
});

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function object(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function absoluteRoot(environment, name, code) {
  const value = environment[name];
  if (typeof value !== "string" || !isAbsolute(value) || value.includes("\0")) {
    fail(code, name);
  }
  return resolve(value);
}

function safeWorkspaceId(value) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    fail("ANIMATION_EXECUTION_MCP_WORKSPACE_ID_INVALID", String(value));
  }
  return value;
}

function runtime(environment) {
  return {
    workspaceBaseRoot: absoluteRoot(
      environment,
      "EVAVO_ANIMATION_EXECUTION_WORKSPACE_ROOT",
      "ANIMATION_EXECUTION_MCP_WORKSPACE_ROOT_INVALID",
    ),
    repositoryRoots: {
      "art-studio": absoluteRoot(
        environment,
        "EVAVO_ART_STUDIO_ROOT",
        "ANIMATION_EXECUTION_MCP_ART_ROOT_INVALID",
      ),
      "cel-animation-studio": absoluteRoot(
        environment,
        "EVAVO_CEL_ANIMATION_STUDIO_ROOT",
        "ANIMATION_EXECUTION_MCP_CEL_ROOT_INVALID",
      ),
    },
    environment,
  };
}

function workspaceRoot(runtimeValue, workspaceId) {
  return resolve(runtimeValue.workspaceBaseRoot, safeWorkspaceId(workspaceId));
}

function availableTools(environment) {
  const names = [...READ_TOOLS];
  if (environment.EVAVO_ANIMATION_EXECUTION_ENABLED === "enabled") {
    names.push(...MUTATING_TOOLS);
  }
  if (
    environment.EVAVO_ANIMATION_CREATIVE_APPROVAL_WRITE_ENABLED === "enabled"
  ) {
    names.push(APPROVAL_TOOL);
  }
  return names;
}

function inputSchema(name) {
  if (name === "describe_animation_execution_supervisor_v1") {
    return { type: "object", additionalProperties: false };
  }
  if (name === "initialize_animation_execution_workspace_v1") {
    return {
      type: "object",
      required: ["workspaceId", "request", "adapterCatalogue"],
      properties: {
        workspaceId: { type: "string", minLength: 1, maxLength: 192 },
        request: { type: "object" },
        adapterCatalogue: { type: "object" },
      },
      additionalProperties: false,
    };
  }
  if (name === APPROVAL_TOOL) {
    return {
      type: "object",
      required: ["workspaceId", "approval"],
      properties: {
        workspaceId: { type: "string", minLength: 1, maxLength: 192 },
        approval: { type: "object" },
      },
      additionalProperties: false,
    };
  }
  return {
    type: "object",
    required: ["workspaceId"],
    properties: {
      workspaceId: { type: "string", minLength: 1, maxLength: 192 },
    },
    additionalProperties: false,
  };
}

function toolDefinitions(environment) {
  return availableTools(environment).map((name) => ({
    name,
    description: DESCRIPTIONS[name],
    inputSchema: inputSchema(name),
  }));
}

export async function executeAnimationExecutionSupervisorMcpOperation(
  name,
  args = {},
  environment = process.env,
) {
  if (!availableTools(environment).includes(name)) {
    fail("ANIMATION_EXECUTION_MCP_TOOL_DISABLED_OR_UNKNOWN", name);
  }
  if (name === "describe_animation_execution_supervisor_v1") {
    return describeAnimationExecutionSupervisor();
  }
  const value = object(args, "ANIMATION_EXECUTION_MCP_ARGUMENTS_INVALID");
  const runtimeValue = runtime(environment);
  const root = workspaceRoot(runtimeValue, value.workspaceId);
  const options = {
    repositoryRoots: runtimeValue.repositoryRoots,
    environment,
  };
  if (name === "get_animation_execution_status_v1") {
    return getAnimationExecutionStatus({ workspaceRoot: root }, options);
  }
  if (name === "plan_animation_execution_cycle_v1") {
    return planAnimationExecutionCycle({ workspaceRoot: root }, options);
  }
  if (name === "compile_animation_execution_review_packet_v1") {
    return compileAnimationExecutionReviewPacket(
      { workspaceRoot: root },
      options,
    );
  }
  if (name === "verify_animation_execution_workspace_v1") {
    return verifyAnimationExecutionWorkspace({ workspaceRoot: root }, options);
  }
  if (name === "initialize_animation_execution_workspace_v1") {
    return initializeAnimationExecutionWorkspace(
      {
        workspaceRoot: root,
        request: value.request,
        adapterCatalogue: value.adapterCatalogue,
      },
      options,
    );
  }
  if (name === "run_animation_execution_cycle_v1") {
    return runAnimationExecutionCycle({ workspaceRoot: root }, options);
  }
  if (name === APPROVAL_TOOL) {
    return installAnimationSequenceCreativeApproval(
      { workspaceRoot: root, approval: value.approval },
      options,
    );
  }
  fail("ANIMATION_EXECUTION_MCP_TOOL_UNKNOWN", name);
}

function rpcError(id, code, message) {
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
}

async function dispatch(message, environment) {
  const request = object(message, "ANIMATION_EXECUTION_MCP_MESSAGE_INVALID");
  if (request.jsonrpc !== "2.0") fail("ANIMATION_EXECUTION_MCP_JSONRPC_INVALID");
  if (typeof request.method !== "string" || !request.method) {
    fail("ANIMATION_EXECUTION_MCP_METHOD_INVALID");
  }
  if (request.method === "initialize") {
    return {
      protocolVersion:
        request.params?.protocolVersion ??
        ANIMATION_EXECUTION_SUPERVISOR_MCP_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: {
        name: "evavo-animation-execution-supervisor-v1",
        version: ANIMATION_EXECUTION_SUPERVISOR_MCP_VERSION,
      },
      instructions:
        "Run one bounded cycle at a time. Adapter commands come only from the reviewed digest-bound catalogue. Missing capability is never success. Independent Cel review and separate owner/director creative approval are mandatory before accepted delivery. This server cannot commit, push, publish, promote artifacts or activate runtimes.",
    };
  }
  if (request.method === "notifications/initialized") return null;
  if (request.method === "ping") return {};
  if (request.method === "tools/list") {
    return { tools: toolDefinitions(environment) };
  }
  if (request.method === "tools/call") {
    try {
      const value = await executeAnimationExecutionSupervisorMcpOperation(
        request.params?.name,
        request.params?.arguments ?? {},
        environment,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
        structuredContent: value,
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "error",
              message: error instanceof Error ? error.message : String(error),
              authority: animationExecutionSupervisorAuthority,
            }),
          },
        ],
      };
    }
  }
  fail("ANIMATION_EXECUTION_MCP_METHOD_UNKNOWN", request.method);
}

export async function serveAnimationExecutionSupervisorMcp({
  environment = process.env,
  input = process.stdin,
  output = process.stdout,
} = {}) {
  const lines = createInterface({ input, crlfDelay: Infinity, terminal: false });
  for await (const line of lines) {
    if (!line.trim()) continue;
    if (Buffer.byteLength(line, "utf8") > MAX_MESSAGE_BYTES) {
      output.write(
        `${rpcError(null, -32600, "ANIMATION_EXECUTION_MCP_MESSAGE_TOO_LARGE")}\n`,
      );
      continue;
    }
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      output.write(
        `${rpcError(null, -32700, "ANIMATION_EXECUTION_MCP_PARSE_ERROR")}\n`,
      );
      continue;
    }
    try {
      const value = await dispatch(message, environment);
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

if ((process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "") === import.meta.url) {
  serveAnimationExecutionSupervisorMcp().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        authority: animationExecutionSupervisorAuthority,
      })}\n`,
    );
    process.exitCode = 1;
  });
}
