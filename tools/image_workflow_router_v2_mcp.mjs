#!/usr/bin/env node

import readline from "node:readline";
import {
  listImageAgentGoalsV2,
  routeImageAgentTaskV2,
} from "../packages/media/dist/index.js";

const SERVER_NAME = "evavo-image-workflow-router-v2";
const SERVER_VERSION = "2.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const GOALS = Object.freeze([
  "quality-review",
  "frame-consistency",
  "reference-consistency",
  "fake-transparency",
  "natural-background-cutout",
  "local-technical-repair",
  "semantic-repair",
  "resize-or-export",
  "learned-enhancement-review",
  "texture-review",
  "runtime-effect",
  "raster-effect",
  "ai-artifact-assessment",
  "delivery-preflight",
  "finalize-image",
]);

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_image_workflow_router_v2_capabilities",
    description: "List the authoritative EVAVO image workflow goals and ordered governed surfaces for ChatGPT, Claude, Codex and compatible agents. The router itself never reads or writes image bytes.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_route_image_workflow_v2",
    description: "Route one image/art task goal to ordered review/write/provider/execution steps with prerequisites, stop conditions, expected evidence and non-destructive invariants.",
    inputSchema: {
      type: "object",
      properties: { goal: { type: "string", enum: GOALS } },
      required: ["goal"],
      additionalProperties: false,
    },
  }),
]);

async function callTool(name, args) {
  if (name === "evavo_image_workflow_router_v2_capabilities") {
    const goals = listImageAgentGoalsV2();
    return Object.freeze({
      contract: "evavo_image_workflow_router_agent_v2",
      mode: "read-only-discovery-and-routing",
      tools: tools.map((tool) => tool.name),
      goalCount: goals.length,
      goals,
      routes: Object.freeze(goals.map((goal) => routeImageAgentTaskV2(goal))),
      privilegeClasses: [
        "read-only",
        "write-gated-create-only",
        "candidate-and-mask-required",
        "provider-or-human-candidate-required",
        "execution-gated",
      ],
      integrates: [
        "existing executable-image-pipeline.v1 deterministic processing contract",
        "existing local-image-quality-routes-v1 generation/model routing",
        "finishing packet and repair surfaces",
        "ordered sequence finishing",
        "approved-reference consistency",
        "artifact/generated-detail triage",
        "delivery integrity preflight",
        "finalization admission",
        "texture/UV/Godot material workflow",
        "runtime/raster effects",
      ],
      guarantees: Object.freeze({
        readsImageBytes: false,
        writesFiles: false,
        executesProcesses: false,
        carriesApprovalAuthority: false,
        preservesV1RouterCompatibility: true,
        distinguishesReviewWriteProviderAndExecutionPrivileges: true,
        claimsAiOriginDetection: false,
      }),
    });
  }
  if (name === "evavo_route_image_workflow_v2") return routeImageAgentTaskV2(args?.goal);
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}

function result(value, isError = false) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value, isError };
}

async function dispatch(request) {
  if (request?.jsonrpc !== "2.0") return { jsonrpc: "2.0", id: request?.id ?? null, error: { code: -32600, message: "Invalid Request" } };
  if (request.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions: "Use v2 routing first when choosing an Art Studio image workflow. The router is read-only and separates review, write, provider/mask and native-execution privilege classes; it never grants approval authority.",
      },
    };
  }
  if (request.method === "ping") return { jsonrpc: "2.0", id: request.id, result: {} };
  if (request.method === "tools/list") return { jsonrpc: "2.0", id: request.id, result: { tools } };
  if (request.method === "tools/call") {
    try {
      return { jsonrpc: "2.0", id: request.id, result: result(await callTool(request.params?.name, request.params?.arguments)) };
    } catch (error) {
      return { jsonrpc: "2.0", id: request.id, result: result({ code: "IMAGE_WORKFLOW_ROUTE_V2_FAILED", message: error instanceof Error ? error.message : String(error) }, true) };
    }
  }
  if (request.method?.startsWith("notifications/")) return null;
  return { jsonrpc: "2.0", id: request.id ?? null, error: { code: -32601, message: "Method not found" } };
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
let chain = Promise.resolve();
input.on("line", (line) => {
  if (!line.trim()) return;
  chain = chain.then(async () => {
    let request;
    try { request = JSON.parse(line); } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
      return;
    }
    const response = await dispatch(request);
    if (response !== null) process.stdout.write(`${JSON.stringify(response)}\n`);
  });
});
