#!/usr/bin/env node

import process from "node:process";
import { createInterface } from "node:readline";

import { DocsSuiteApiError, docsSuiteApiRequest } from "./docs-suite-api-client.mjs";

const PROTOCOL_VERSION = "2025-11-25";
const SUPPORTED_PROTOCOLS = new Set([PROTOCOL_VERSION, "2025-06-18", "2025-03-26"]);
const MAX_MESSAGE_BYTES = 4_400_000;
const seenIds = new Set();
let initialized = false;
let ready = false;

const requestOnlySchema = Object.freeze({
  type: "object",
  properties: Object.freeze({ request: Object.freeze({ type: "object" }) }),
  required: Object.freeze(["request"]),
  additionalProperties: false,
});

const operationTool = Object.freeze({
  name: "run_book_studio_operation",
  title: "Run a bounded Book Studio operation",
  description: "Execute one evavo_docs_book_operation_v1 request through the protected Docs Suite API. The operation cannot call a provider, mutate canonical manuscript state, delete Website source or publish a book.",
  inputSchema: requestOnlySchema,
  outputSchema: Object.freeze({ type: "object" }),
});

const candidateTool = Object.freeze({
  name: "run_book_writing_candidate",
  title: "Run one protected Book writing candidate",
  description: "Compile, submit and revalidate one exact Docs Suite Book authoring handoff through Writing Studio. The tool may make one provider call but cannot retry ambiguously, mutate canonical manuscript state, call Art Studio or publish.",
  inputSchema: requestOnlySchema,
  outputSchema: Object.freeze({ type: "object" }),
});

const artPlanTool = Object.freeze({
  name: "translate_legacy_book_art_plan",
  title: "Translate one retained Website Book Art plan",
  description: "Send one exact cover or illustration translation request to Art Studio, independently recompile the expected provider-neutral work order in Docs Suite, and return only shadow-comparison evidence. The tool performs no provider call, artifact write, selection, promotion, Book-use binding or publication.",
  inputSchema: requestOnlySchema,
  outputSchema: Object.freeze({ type: "object" }),
});

const tools = Object.freeze([operationTool, candidateTool, artPlanTool]);

function write(value) {
  const source = JSON.stringify(value);
  if (Buffer.byteLength(source, "utf8") > MAX_MESSAGE_BYTES) {
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: value?.id ?? null, error: { code: -32603, message: "The MCP response exceeded the supported message size." } })}\n`);
    return;
  }
  process.stdout.write(`${source}\n`);
}

function result(id, value) { write({ jsonrpc: "2.0", id, result: value }); }
function failure(id, code, message, data) { write({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } }); }
function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function validId(value) { return typeof value === "string" || (typeof value === "number" && Number.isSafeInteger(value)); }
function toolResult(value, isError = false) {
  const structuredContent = isRecord(value) ? value : { value };
  return { content: [{ type: "text", text: JSON.stringify(structuredContent) }], structuredContent, isError };
}

async function callTool(name, args) {
  if (!isRecord(args) || Object.keys(args).some((key) => key !== "request") || !isRecord(args.request)) {
    return toolResult({ ok: false, error: "Tool arguments require exactly one request object." }, true);
  }
  let endpoint;
  let options;
  if (name === operationTool.name) {
    endpoint = "/api/v1/book-studio/operations";
    options = { method: "POST", body: args.request };
  } else if (name === candidateTool.name) {
    endpoint = "/api/v1/book-studio/writing-candidate";
    options = { method: "POST", body: args.request, timeoutMs: 300_000, maximumResponseBytes: 4_000_000 };
  } else if (name === artPlanTool.name) {
    endpoint = "/api/v1/book-studio/art-plan-translation";
    options = { method: "POST", body: args.request, timeoutMs: 300_000, maximumResponseBytes: 4_000_000 };
  } else {
    return toolResult({ ok: false, error: `Unknown tool: ${name}` }, true);
  }
  try {
    return toolResult(await docsSuiteApiRequest(endpoint, options));
  } catch (error) {
    if (error instanceof DocsSuiteApiError) {
      return toolResult({ ok: false, error: error.message, ...(error.status === null ? {} : { status: error.status }), ...(error.code === null ? {} : { code: error.code }) }, true);
    }
    return toolResult({ ok: false, error: error instanceof Error ? error.message : "Book Studio MCP operation failed." }, true);
  }
}

async function handle(message) {
  if (!isRecord(message) || message.jsonrpc !== "2.0") return failure(message?.id, -32600, "Invalid JSON-RPC request.");
  if (message.method === "notifications/initialized") {
    if (initialized) ready = true;
    return;
  }
  if (!validId(message.id)) return failure(message.id, -32600, "MCP requests require a string or integer id.");
  const key = `${typeof message.id}:${String(message.id)}`;
  if (seenIds.has(key)) return failure(message.id, -32600, "The request id has already been used on this connection.");
  seenIds.add(key);

  if (message.method === "initialize") {
    if (initialized) return failure(message.id, -32600, "MCP is already initialized.");
    const requested = isRecord(message.params) && typeof message.params.protocolVersion === "string" ? message.params.protocolVersion : PROTOCOL_VERSION;
    initialized = true;
    result(message.id, {
      protocolVersion: SUPPORTED_PROTOCOLS.has(requested) ? requested : PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "evavo-docs-book-studio", title: "EVAVO Docs Suite Book Studio", version: "0.1.0" },
      instructions: "Use a short-lived EVAVO_DOCS_TOKEN. Writing candidate execution may call Writing Studio once. Art plan translation may call Art Studio once but remains read-only and cannot execute a provider, select, promote, bind or publish artwork.",
    });
    return;
  }
  if (message.method === "ping") return result(message.id, {});
  if (!initialized || !ready) return failure(message.id, -32002, "MCP initialization must complete before tools are used.");
  if (message.method === "tools/list") return result(message.id, { tools });
  if (message.method === "tools/call") {
    if (!isRecord(message.params) || typeof message.params.name !== "string") return failure(message.id, -32602, "tools/call requires a tool name.");
    return result(message.id, await callTool(message.params.name, message.params.arguments));
  }
  return failure(message.id, -32601, `Method not found: ${String(message.method)}`);
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  if (Buffer.byteLength(line, "utf8") > MAX_MESSAGE_BYTES) return failure(null, -32600, "MCP request exceeded the supported message size.");
  try { void handle(JSON.parse(line)); } catch { failure(null, -32700, "Invalid JSON."); }
});
input.on("close", () => { process.exitCode = 0; });

process.stdin.on("data", () => {});
process.on("uncaughtException", (error) => failure(null, -32603, error.message));
process.on("unhandledRejection", (error) => failure(null, -32603, error instanceof Error ? error.message : "Unhandled rejection."));
