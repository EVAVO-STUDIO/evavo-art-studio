#!/usr/bin/env node

import readline from "node:readline";
import {
  listImageAgentGoals,
  routeImageAgentTask,
} from "../packages/media/dist/index.js";

const SERVER_NAME = "evavo-image-agent-router";
const SERVER_VERSION = "1.1.0";
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
  "finalize-image",
]);

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_image_agent_router_capabilities",
    description: "List image/art task goals and return the authoritative EVAVO image workflow surface for each goal. This router never reads or writes image bytes.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_route_image_task",
    description: "Route an image/art task to the safest existing Art Studio MCP/library workflow, including prerequisites, stop conditions, evidence and write class.",
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string", enum: GOALS },
      },
      required: ["goal"],
      additionalProperties: false,
    },
  }),
]);

async function callTool(name, args) {
  if (name === "evavo_image_agent_router_capabilities") {
    return Object.freeze({
      contract: "evavo_image_agent_router_v1_1",
      goals: listImageAgentGoals(),
      routes: Object.freeze(listImageAgentGoals().map((goal) => routeImageAgentTask(goal))),
      readsImageBytes: false,
      writesFiles: false,
      purpose: "Give ChatGPT, Claude, Codex and trusted agents one discovery surface instead of requiring them to memorize lower-level Art Studio tools.",
    });
  }
  if (name === "evavo_route_image_task") return routeImageAgentTask(args?.goal);
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}

function result(value, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError,
  };
}

async function dispatch(request) {
  if (request?.jsonrpc !== "2.0") {
    return { jsonrpc: "2.0", id: request?.id ?? null, error: { code: -32600, message: "Invalid Request" } };
  }
  if (request.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions: "Route image work first when the correct Art Studio surface is unclear. The router is read-only and never carries approval authority.",
      },
    };
  }
  if (request.method === "ping") return { jsonrpc: "2.0", id: request.id, result: {} };
  if (request.method === "tools/list") return { jsonrpc: "2.0", id: request.id, result: { tools } };
  if (request.method === "tools/call") {
    try {
      return { jsonrpc: "2.0", id: request.id, result: result(await callTool(request.params?.name, request.params?.arguments)) };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: result({ code: "IMAGE_ROUTE_FAILED", message: error instanceof Error ? error.message : String(error) }, true),
      };
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
    try {
      request = JSON.parse(line);
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })\n`);
      return;
    }
    const response = await dispatch(request);
    if (response !== null) process.stdout.write(`${JSON.stringify(response)}\n`);
  });
});
