#!/usr/bin/env node

import process from "node:process";
import { createInterface } from "node:readline";

import { DocsSuiteApiError, docsSuiteApiRequest } from "./docs-suite-api-client.mjs";

const PROTOCOL_VERSION = "2025-11-25";
const SUPPORTED_PROTOCOLS = new Set([PROTOCOL_VERSION, "2025-06-18", "2025-03-26"]);
const ENDPOINT = "/api/v1/book-studio/universal-readiness";
const MAXIMUM_MESSAGE_BYTES = 4_500_000;
const MAXIMUM_SEEN_IDS = 10_000;
const seenIds = new Set();
let initialized = false;
let ready = false;

const tool = Object.freeze({
  name: "compile_book_universal_readiness",
  title: "Compile universal Book production readiness",
  description:
    "Compile one versioned Book project into a deterministic Writing Studio, Art Studio, cover, illustration, edition, accessibility and release pipeline. The result is planning-only and performs no provider call, manuscript mutation, art promotion or publication.",
  inputSchema: Object.freeze({
    type: "object",
    properties: Object.freeze({
      project: Object.freeze({ type: "object" }),
    }),
    required: Object.freeze(["project"]),
    additionalProperties: false,
  }),
  outputSchema: Object.freeze({ type: "object" }),
});

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function validId(value) {
  return typeof value === "string" || (typeof value === "number" && Number.isSafeInteger(value));
}
function write(value) {
  let source = JSON.stringify(value);
  if (Buffer.byteLength(source, "utf8") > MAXIMUM_MESSAGE_BYTES) {
    source = JSON.stringify({
      jsonrpc: "2.0",
      id: validId(value?.id) ? value.id : null,
      error: { code: -32603, message: "The MCP response exceeded the supported message size." },
    });
  }
  process.stdout.write(`${source}\n`);
}
function result(id, value) { write({ jsonrpc: "2.0", id, result: value }); }
function failure(id, code, message, data) {
  write({ jsonrpc: "2.0", id: validId(id) ? id : null, error: { code, message, ...(data === undefined ? {} : { data }) } });
}
function toolResult(value, isError = false) {
  const structuredContent = isRecord(value) ? value : { value };
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent,
    isError,
  };
}
function rememberId(id) {
  const key = `${typeof id}:${String(id)}`;
  if (seenIds.has(key)) return false;
  seenIds.add(key);
  if (seenIds.size > MAXIMUM_SEEN_IDS) {
    const oldest = seenIds.values().next().value;
    if (oldest !== undefined) seenIds.delete(oldest);
  }
  return true;
}

async function callTool(name, args) {
  if (name !== tool.name) return toolResult({ ok: false, error: `Unknown tool: ${name}` }, true);
  if (!isRecord(args) || Object.keys(args).some((key) => key !== "project") || !isRecord(args.project)) {
    return toolResult({ ok: false, error: "Tool arguments require exactly one project object." }, true);
  }
  try {
    return toolResult(await docsSuiteApiRequest(ENDPOINT, { method: "POST", body: args.project }));
  } catch (error) {
    if (error instanceof DocsSuiteApiError) {
      return toolResult({
        ok: false,
        error: error.message,
        ...(error.status === null ? {} : { status: error.status }),
        ...(error.code === null ? {} : { code: error.code }),
      }, true);
    }
    return toolResult({ ok: false, error: error instanceof Error ? error.message : "Universal Book readiness failed." }, true);
  }
}

async function handle(message) {
  if (!isRecord(message) || message.jsonrpc !== "2.0") return failure(message?.id, -32600, "Invalid JSON-RPC request.");
  if (message.method === "notifications/initialized") {
    if (initialized) ready = true;
    return;
  }
  if (!validId(message.id)) return failure(message.id, -32600, "MCP requests require a string or integer id.");
  if (!rememberId(message.id)) return failure(message.id, -32600, "The request id has already been used on this connection.");

  if (message.method === "initialize") {
    if (initialized) return failure(message.id, -32600, "MCP is already initialized.");
    const requested = isRecord(message.params) && typeof message.params.protocolVersion === "string"
      ? message.params.protocolVersion
      : PROTOCOL_VERSION;
    initialized = true;
    result(message.id, {
      protocolVersion: SUPPORTED_PROTOCOLS.has(requested) ? requested : PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: {
        name: "evavo-docs-book-readiness",
        title: "EVAVO Docs Suite Book Readiness",
        version: "0.1.0",
      },
      instructions:
        "Use a short-lived EVAVO_DOCS_TOKEN with documents:read. The compiler is planning-only and cannot mutate a manuscript, submit an Art job or publish.",
    });
    return;
  }
  if (message.method === "ping") return result(message.id, {});
  if (!initialized || !ready) return failure(message.id, -32002, "MCP initialization must complete before tools are used.");
  if (message.method === "tools/list") return result(message.id, { tools: [tool] });
  if (message.method === "tools/call") {
    if (!isRecord(message.params) || typeof message.params.name !== "string") {
      return failure(message.id, -32602, "tools/call requires a tool name.");
    }
    return result(message.id, await callTool(message.params.name, message.params.arguments));
  }
  return failure(message.id, -32601, `Method not found: ${String(message.method)}`);
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  if (Buffer.byteLength(line, "utf8") > MAXIMUM_MESSAGE_BYTES) {
    failure(null, -32600, "MCP request exceeded the supported message size.");
    return;
  }
  try { void handle(JSON.parse(line)); } catch { failure(null, -32700, "Invalid JSON."); }
});
input.on("close", () => { process.exitCode = 0; });
process.stdin.on("data", () => {});
process.on("uncaughtException", (error) => failure(null, -32603, error.message));
process.on("unhandledRejection", (error) => failure(null, -32603, error instanceof Error ? error.message : "Unhandled rejection."));
