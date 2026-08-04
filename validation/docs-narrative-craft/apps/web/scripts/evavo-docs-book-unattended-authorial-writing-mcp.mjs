#!/usr/bin/env node

import process from "node:process";
import { createInterface } from "node:readline";

import { DocsSuiteApiError, docsSuiteApiRequest } from "./docs-suite-api-client.mjs";

const MODERN_PROTOCOL = "2026-07-28";
const LEGACY_PROTOCOL = "2025-11-25";
const LEGACY_PROTOCOLS = new Set([LEGACY_PROTOCOL, "2025-06-18", "2025-03-26"]);
const SUPPORTED_PROTOCOLS = Object.freeze([MODERN_PROTOCOL, ...LEGACY_PROTOCOLS]);
const ENDPOINT = "/api/v1/book-studio/unattended-production/authorial-writing";
const MAXIMUM_MESSAGE_BYTES = 4_500_000;
const MAXIMUM_SEEN_IDS = 10_000;
const MODERN_PROTOCOL_META_KEY = "io.modelcontextprotocol/protocolVersion";
const MODERN_CLIENT_INFO_META_KEY = "io.modelcontextprotocol/clientInfo";
const MODERN_CLIENT_CAPABILITIES_META_KEY = "io.modelcontextprotocol/clientCapabilities";
const MODERN_SERVER_INFO_META_KEY = "io.modelcontextprotocol/serverInfo";
const SERVER_INFO = Object.freeze({
  name: "evavo-docs-book-unattended-authorial-writing",
  title: "EVAVO Docs Suite Unattended Authorial Writing",
  version: "0.2.0",
});
const SERVER_META = Object.freeze({ [MODERN_SERVER_INFO_META_KEY]: SERVER_INFO });
const seenIds = new Set();
let connectionEra = null;
let legacyInitialized = false;
let legacyReady = false;

const tool = Object.freeze({
  name: "coordinate_book_unattended_authorial_writing",
  title: "Coordinate unattended authorial Writing",
  description:
    "Recompile an exact unattended Book plan, select one authorised writing_candidate stage, bind project-owned authorial synthesis and exact dependency receipts, then permit one no-fallback Writing Studio attempt. Canonical mutation, Art Studio calls, Amazon submission and publication remain prohibited.",
  inputSchema: Object.freeze({
    type: "object",
    properties: Object.freeze({ input: Object.freeze({ type: "object" }) }),
    required: Object.freeze(["input"]),
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
function result(id, value, modern = false) {
  write({
    jsonrpc: "2.0",
    id,
    result: modern
      ? { resultType: "complete", ...value, _meta: { ...(isRecord(value?._meta) ? value._meta : {}), ...SERVER_META } }
      : value,
  });
}
function failure(id, code, message, data, modern = false) {
  write({
    jsonrpc: "2.0",
    id: validId(id) ? id : null,
    error: {
      code,
      message,
      ...(data === undefined && !modern
        ? {}
        : { data: { ...(isRecord(data) ? data : data === undefined ? {} : { detail: data }), ...(modern ? { _meta: SERVER_META } : {}) } }),
    },
  });
}
function toolResult(value, isError = false, modern = false) {
  const structuredContent = isRecord(value) ? value : { value };
  return {
    ...(modern ? { resultType: "complete" } : {}),
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent,
    isError,
    ...(modern ? { _meta: SERVER_META } : {}),
  };
}
function requestMeta(message) {
  return isRecord(message.params) && isRecord(message.params._meta) ? message.params._meta : {};
}
function modernEnvelope(message) {
  const meta = requestMeta(message);
  return meta[MODERN_PROTOCOL_META_KEY] === MODERN_PROTOCOL;
}
function validateModernEnvelope(message) {
  const meta = requestMeta(message);
  if (meta[MODERN_PROTOCOL_META_KEY] !== MODERN_PROTOCOL) {
    return { code: -32022, message: "Unsupported MCP protocol version.", data: { supported: SUPPORTED_PROTOCOLS } };
  }
  const clientInfo = meta[MODERN_CLIENT_INFO_META_KEY];
  if (clientInfo !== undefined && (
    !isRecord(clientInfo)
    || typeof clientInfo.name !== "string"
    || typeof clientInfo.version !== "string"
    || clientInfo.name.length < 1
    || clientInfo.name.length > 200
    || clientInfo.version.length < 1
    || clientInfo.version.length > 100
  )) {
    return { code: -32602, message: "The modern MCP clientInfo envelope is malformed." };
  }
  const clientCapabilities = meta[MODERN_CLIENT_CAPABILITIES_META_KEY];
  if (clientCapabilities !== undefined && !isRecord(clientCapabilities)) {
    return { code: -32602, message: "The modern MCP clientCapabilities envelope is malformed." };
  }
  return null;
}
function pinEra(era) {
  if (connectionEra === null) {
    connectionEra = era;
    return true;
  }
  return connectionEra === era;
}

async function callTool(name, args, modern) {
  if (name !== tool.name) {
    return toolResult({ ok: false, error: `Unknown tool: ${name}` }, true, modern);
  }
  if (!isRecord(args) || Object.keys(args).some((key) => key !== "input") || !isRecord(args.input)) {
    return toolResult({ ok: false, error: "Tool arguments require exactly one input object." }, true, modern);
  }
  try {
    return toolResult(await docsSuiteApiRequest(ENDPOINT, { method: "POST", body: args.input }), false, modern);
  } catch (error) {
    if (error instanceof DocsSuiteApiError) {
      return toolResult({
        ok: false,
        error: error.message,
        ...(error.status === null ? {} : { status: error.status }),
        ...(error.code === null ? {} : { code: error.code }),
      }, true, modern);
    }
    return toolResult({
      ok: false,
      error: error instanceof Error ? error.message : "Unattended authorial Writing failed.",
    }, true, modern);
  }
}

async function handleModern(message) {
  const envelopeProblem = validateModernEnvelope(message);
  if (envelopeProblem) {
    return failure(message.id, envelopeProblem.code, envelopeProblem.message, envelopeProblem.data, true);
  }
  if (!pinEra("modern")) {
    return failure(message.id, -32022, "This stdio connection is already pinned to the legacy MCP era.", { supported: SUPPORTED_PROTOCOLS }, true);
  }
  if (message.method === "server/discover") {
    return result(message.id, {
      supportedVersions: SUPPORTED_PROTOCOLS,
      capabilities: { tools: { listChanged: false } },
      instructions:
        "Use a short-lived EVAVO_DOCS_TOKEN. Each call binds one exact unattended writing stage to project-owned authorial synthesis and permits at most one no-fallback Writing Studio attempt.",
      ttlMs: 300_000,
      cacheScope: "private",
    }, true);
  }
  if (message.method === "tools/list") {
    const params = isRecord(message.params) ? message.params : {};
    if (Object.keys(params).some((key) => key !== "_meta")) {
      return failure(message.id, -32602, "tools/list accepts only the modern _meta envelope.", undefined, true);
    }
    return result(message.id, { tools: [tool], ttlMs: 300_000, cacheScope: "private" }, true);
  }
  if (message.method === "tools/call") {
    if (!isRecord(message.params)
      || Object.keys(message.params).some((key) => !["name", "arguments", "_meta"].includes(key))
      || typeof message.params.name !== "string") {
      return failure(message.id, -32602, "tools/call requires name, arguments and the modern _meta envelope.", undefined, true);
    }
    return result(message.id, await callTool(message.params.name, message.params.arguments, true), true);
  }
  return failure(message.id, -32601, `Method not found: ${String(message.method)}`, undefined, true);
}

async function handleLegacy(message) {
  if (!pinEra("legacy")) {
    return failure(message.id, -32022, "This stdio connection is already pinned to MCP 2026-07-28.", { supported: SUPPORTED_PROTOCOLS });
  }
  if (message.method === "notifications/initialized") {
    if (legacyInitialized) legacyReady = true;
    return;
  }
  if (!validId(message.id)) return failure(message.id, -32600, "MCP requests require a string or integer id.");
  if (!rememberId(message.id)) return failure(message.id, -32600, "The request id has already been used on this connection.");
  if (message.method === "initialize") {
    if (legacyInitialized) return failure(message.id, -32600, "MCP is already initialized.");
    const requested = isRecord(message.params) && typeof message.params.protocolVersion === "string"
      ? message.params.protocolVersion
      : LEGACY_PROTOCOL;
    legacyInitialized = true;
    return result(message.id, {
      protocolVersion: LEGACY_PROTOCOLS.has(requested) ? requested : LEGACY_PROTOCOL,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions:
        "Use a short-lived EVAVO_DOCS_TOKEN. This legacy connection must initialize before tools are used.",
    });
  }
  if (message.method === "ping") return result(message.id, {});
  if (!legacyInitialized || !legacyReady) {
    return failure(message.id, -32002, "MCP initialization must complete before tools are used.");
  }
  if (message.method === "tools/list") return result(message.id, { tools: [tool] });
  if (message.method === "tools/call") {
    if (!isRecord(message.params) || typeof message.params.name !== "string") {
      return failure(message.id, -32602, "tools/call requires a tool name.");
    }
    return result(message.id, await callTool(message.params.name, message.params.arguments, false));
  }
  return failure(message.id, -32601, `Method not found: ${String(message.method)}`);
}

async function handle(message) {
  if (!isRecord(message) || message.jsonrpc !== "2.0") {
    return failure(message?.id, -32600, "Invalid JSON-RPC request.");
  }
  if (message.method === "notifications/initialized") return handleLegacy(message);
  if (!validId(message.id)) return failure(message.id, -32600, "MCP requests require a string or integer id.");
  if (!rememberId(message.id)) return failure(message.id, -32600, "The request id has already been used on this connection.");
  if (modernEnvelope(message) || message.method === "server/discover") return handleModern(message);
  return handleLegacyAfterRemember(message);
}

async function handleLegacyAfterRemember(message) {
  if (!pinEra("legacy")) {
    return failure(message.id, -32022, "This stdio connection is already pinned to MCP 2026-07-28.", { supported: SUPPORTED_PROTOCOLS });
  }
  if (message.method === "initialize") {
    if (legacyInitialized) return failure(message.id, -32600, "MCP is already initialized.");
    const requested = isRecord(message.params) && typeof message.params.protocolVersion === "string"
      ? message.params.protocolVersion
      : LEGACY_PROTOCOL;
    legacyInitialized = true;
    return result(message.id, {
      protocolVersion: LEGACY_PROTOCOLS.has(requested) ? requested : LEGACY_PROTOCOL,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions:
        "Use a short-lived EVAVO_DOCS_TOKEN. This legacy connection must initialize before tools are used.",
    });
  }
  if (message.method === "ping") return result(message.id, {});
  if (!legacyInitialized || !legacyReady) return failure(message.id, -32002, "MCP initialization must complete before tools are used.");
  if (message.method === "tools/list") return result(message.id, { tools: [tool] });
  if (message.method === "tools/call") {
    if (!isRecord(message.params) || typeof message.params.name !== "string") {
      return failure(message.id, -32602, "tools/call requires a tool name.");
    }
    return result(message.id, await callTool(message.params.name, message.params.arguments, false));
  }
  return failure(message.id, -32601, `Method not found: ${String(message.method)}`);
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  if (Buffer.byteLength(line, "utf8") > MAXIMUM_MESSAGE_BYTES) {
    return failure(null, -32600, "MCP request exceeded the supported message size.");
  }
  try { void handle(JSON.parse(line)); }
  catch { failure(null, -32700, "Invalid JSON."); }
});
input.on("close", () => { process.exitCode = 0; });

process.stdin.on("data", () => {});
process.on("uncaughtException", (error) => failure(null, -32603, error.message));
process.on("unhandledRejection", (error) => failure(null, -32603, error instanceof Error ? error.message : "Unhandled rejection."));
