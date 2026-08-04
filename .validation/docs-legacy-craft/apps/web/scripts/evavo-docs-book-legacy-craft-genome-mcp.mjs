#!/usr/bin/env node

import process from "node:process";
import { createInterface } from "node:readline";

import { DocsSuiteApiError, docsSuiteApiRequest } from "./docs-suite-api-client.mjs";
import {
  BOOK_LEGACY_CRAFT_GENOME_ENDPOINT,
  buildLegacyCraftRequest,
  isLegacyCraftRecord,
  validateLegacyCraftPayload,
} from "./evavo-docs-book-legacy-craft-genome-common.mjs";

const PROTOCOL_VERSION = "2025-11-25";
const SUPPORTED_PROTOCOLS = new Set([PROTOCOL_VERSION, "2025-06-18", "2025-03-26"]);
const MAXIMUM_MESSAGE_BYTES = 10 * 1024 * 1024;
const MAXIMUM_SEEN_IDS = 10_000;
const seenIds = new Set();
let initialized = false;
let ready = false;

function tool(name, title, description) {
  return Object.freeze({
    name,
    title,
    description,
    inputSchema: Object.freeze({
      type: "object",
      properties: Object.freeze({ payload: Object.freeze({ type: "object" }) }),
      required: Object.freeze(["payload"]),
      additionalProperties: false,
    }),
    outputSchema: Object.freeze({ type: "object" }),
  });
}

const TOOL_SPECS = Object.freeze([
  ["compile_legacy_book_craft_profile", "Compile legacy Book craft profile", "Preserve the exact Website craft-genome profile calculation inside Docs Suite compatibility authority.", "compile_profile"],
  ["create_legacy_book_craft_provider_packet", "Create legacy Book craft provider packet", "Build the exact strict ChatGPT, Claude or compatible-model packet without calling a provider.", "create_provider_packet"],
  ["validate_legacy_book_craft_provider_response", "Validate legacy Book craft provider response", "Recompile the exact packet and validate one provider response before phrase-overlap review.", "validate_provider_response"],
  ["scan_legacy_book_craft_phrase_overlap", "Scan legacy Book craft phrase overlap", "Run the exact rights-tracked contiguous phrase-overlap gate without admitting manuscript canon.", "scan_phrase_overlap"],
]);

const tools = Object.freeze(TOOL_SPECS.map(([name, title, description]) => tool(name, title, description)));
const toolMap = new Map(TOOL_SPECS.map(([name, _title, _description, operation]) => [name, operation]));

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

function result(id, value) {
  write({ jsonrpc: "2.0", id, result: value });
}

function failure(id, code, message, data) {
  write({
    jsonrpc: "2.0",
    id: validId(id) ? id : null,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  });
}

function toolResult(value, isError = false) {
  const structuredContent = isLegacyCraftRecord(value) ? value : { value };
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

async function invokeTool(name, args) {
  const operation = toolMap.get(name);
  if (!operation) return toolResult({ ok: false, error: `Unknown tool: ${name}` }, true);
  if (!isLegacyCraftRecord(args) || Object.keys(args).length !== 1 || !isLegacyCraftRecord(args.payload)) {
    return toolResult({ ok: false, error: "Tool arguments require exactly one payload object." }, true);
  }
  try {
    const payload = validateLegacyCraftPayload(args.payload, operation);
    const body = buildLegacyCraftRequest(
      payload,
      "EVAVO Docs Suite legacy craft-genome MCP",
      { expectedOperation: operation },
    );
    return toolResult(await docsSuiteApiRequest(BOOK_LEGACY_CRAFT_GENOME_ENDPOINT, { method: "POST", body }));
  } catch (error) {
    if (error instanceof DocsSuiteApiError) {
      return toolResult({
        ok: false,
        error: error.message,
        ...(error.status === null ? {} : { status: error.status }),
        ...(error.code === null ? {} : { code: error.code }),
      }, true);
    }
    return toolResult({ ok: false, error: error instanceof Error ? error.message : "Legacy craft compatibility failed." }, true);
  }
}

async function handle(message) {
  if (!isLegacyCraftRecord(message) || message.jsonrpc !== "2.0") return failure(message?.id, -32600, "Invalid JSON-RPC request.");
  if (message.method === "notifications/initialized") {
    if (initialized) ready = true;
    return;
  }
  if (!validId(message.id)) return failure(message.id, -32600, "MCP requests require a string or integer id.");
  if (!rememberId(message.id)) return failure(message.id, -32600, "The request id has already been used on this connection.");
  if (message.method === "initialize") {
    if (initialized) return failure(message.id, -32600, "MCP is already initialized.");
    const requested = isLegacyCraftRecord(message.params) && typeof message.params.protocolVersion === "string"
      ? message.params.protocolVersion
      : PROTOCOL_VERSION;
    initialized = true;
    return result(message.id, {
      protocolVersion: SUPPORTED_PROTOCOLS.has(requested) ? requested : PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "evavo-docs-book-legacy-craft-genome", title: "EVAVO Book Legacy Craft Genome", version: "1.0.0" },
      instructions: "These tools preserve Website compatibility inside Docs Suite. They do not call models, mutate canonical manuscripts, admit candidates or publish.",
    });
  }
  if (message.method === "ping") return result(message.id, {});
  if (!initialized || !ready) return failure(message.id, -32002, "MCP initialization must complete before tools are used.");
  if (message.method === "tools/list") return result(message.id, { tools });
  if (message.method === "tools/call") {
    if (!isLegacyCraftRecord(message.params) || typeof message.params.name !== "string") return failure(message.id, -32602, "tools/call requires a tool name.");
    return result(message.id, await invokeTool(message.params.name, message.params.arguments));
  }
  return failure(message.id, -32601, `Method not found: ${String(message.method)}`);
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  if (Buffer.byteLength(line, "utf8") > MAXIMUM_MESSAGE_BYTES) return failure(null, -32600, "MCP request exceeded the supported message size.");
  try {
    void handle(JSON.parse(line));
  } catch {
    failure(null, -32700, "Invalid JSON.");
  }
});
input.on("close", () => { process.exitCode = 0; });
process.stdin.on("data", () => {});
process.on("uncaughtException", (error) => failure(null, -32603, error.message));
process.on("unhandledRejection", (error) => failure(null, -32603, error instanceof Error ? error.message : "Unhandled rejection."));
