#!/usr/bin/env node

import { createInterface } from "node:readline";
import process from "node:process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  ANIMATION_PIPELINE_DOCTOR_VERSION,
  inspectAnimationPipelineV1,
  planAnimationPipelineRepairsV1,
  verifyAnimationPipelineV1,
} from "./animation_pipeline_doctor_v1.mjs";

const MAX_MESSAGE_BYTES = 2 * 1024 * 1024;
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
const CREDENTIAL_KEY = /(?:^|[_-])(api[_-]?key|authorization|bearer|credential|password|private[_-]?key|refresh[_-]?token|secret|session[_-]?token|token)(?:$|[_-])/i;
const CREDENTIAL_VALUE = /\b(?:bearer\s+[a-z0-9._~+/=-]{12,}|sk-[a-z0-9_-]{12,}|gh[opusr]_[a-z0-9]{20,})\b/i;
const AUTHORITY = Object.freeze({
  fileRead: true,
  fileWrite: false,
  providerExecution: false,
  automaticCreativeApproval: false,
  artifactPromotion: false,
  targetRepositoryMutation: false,
  gitCommit: false,
  gitPush: false,
  runtimeActivation: false,
  publication: false,
});
const TOOLS = Object.freeze([
  {
    name: "inspect_animation_pipeline_v1",
    description: "Inspect local Art, Cel, Video and Game Runtime animation surfaces, contract locks, MCP registrations and shared-file parity without side effects.",
    inputSchema: { type: "object", additionalProperties: true },
  },
  {
    name: "verify_animation_pipeline_v1",
    description: "Fail closed when the local cross-studio animation pipeline has a blocking integration finding.",
    inputSchema: { type: "object", additionalProperties: true },
  },
  {
    name: "plan_animation_pipeline_repairs_v1",
    description: "Compile a deterministic non-mutating repair plan from a doctor report or a fresh inspection.",
    inputSchema: {
      type: "object",
      properties: { report: { type: "object" }, inspection: { type: "object" } },
      additionalProperties: false,
    },
  },
]);

function fail(code, detail) { throw new Error(detail ? `${code}:${detail}` : code); }
function assertSafeEnvironment(environment = process.env) {
  for (const name of DANGEROUS_FLAGS) if (ENABLED.has(String(environment[name] ?? "").trim().toLowerCase())) fail("ANIMATION_PIPELINE_DOCTOR_UNSAFE_AUTHORITY_ENABLED", name);
}
function assertCredentialFree(value, path = "input", seen = new Set()) {
  if (value == null) return;
  if (typeof value === "string") { if (CREDENTIAL_VALUE.test(value)) fail("ANIMATION_PIPELINE_DOCTOR_CREDENTIAL_VALUE_FORBIDDEN", path); return; }
  if (typeof value !== "object") return;
  if (seen.has(value)) fail("ANIMATION_PIPELINE_DOCTOR_CYCLIC_INPUT_FORBIDDEN", path);
  seen.add(value);
  if (Array.isArray(value)) value.forEach((entry, index) => assertCredentialFree(entry, `${path}[${index}]`, seen));
  else for (const [key, entry] of Object.entries(value)) {
    if (CREDENTIAL_KEY.test(key)) fail("ANIMATION_PIPELINE_DOCTOR_CREDENTIAL_KEY_FORBIDDEN", `${path}.${key}`);
    assertCredentialFree(entry, `${path}.${key}`, seen);
  }
  seen.delete(value);
}
function result(value) { return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value }; }
async function callTool(name, args) {
  assertCredentialFree(args);
  if (name === "inspect_animation_pipeline_v1") return inspectAnimationPipelineV1(args);
  if (name === "verify_animation_pipeline_v1") return verifyAnimationPipelineV1(args);
  if (name === "plan_animation_pipeline_repairs_v1") return planAnimationPipelineRepairsV1(args.report ?? await inspectAnimationPipelineV1(args.inspection ?? {}));
  fail("ANIMATION_PIPELINE_DOCTOR_TOOL_UNKNOWN", String(name));
}
async function dispatch(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) fail("ANIMATION_PIPELINE_DOCTOR_MCP_MESSAGE_INVALID");
  if (message.jsonrpc !== "2.0") fail("ANIMATION_PIPELINE_DOCTOR_MCP_JSONRPC_INVALID");
  if (message.method === "initialize") return {
    protocolVersion: message.params?.protocolVersion ?? "2025-03-26",
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: "evavo-animation-pipeline-doctor", version: ANIMATION_PIPELINE_DOCTOR_VERSION },
    instructions: "Read-only cross-studio preflight. Diagnose drift before production. Never repair files, execute providers, approve creative work, promote artifacts, mutate repositories, activate runtimes or publish media through this server.",
  };
  if (message.method === "notifications/initialized") return null;
  if (message.method === "ping") return {};
  if (message.method === "tools/list") return { tools: TOOLS };
  if (message.method === "tools/call") {
    try { return result(await callTool(message.params?.name, message.params?.arguments ?? {})); }
    catch (error) { return { isError: true, content: [{ type: "text", text: JSON.stringify({ status: "error", message: error instanceof Error ? error.message : String(error), authority: AUTHORITY }) }] }; }
  }
  fail("ANIMATION_PIPELINE_DOCTOR_MCP_METHOD_UNKNOWN", String(message.method));
}
function rpcError(id, code, message) { return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }); }
export async function serveAnimationPipelineDoctorMcp({ environment = process.env, input = process.stdin, output = process.stdout } = {}) {
  assertSafeEnvironment(environment);
  const lines = createInterface({ input, crlfDelay: Infinity, terminal: false });
  for await (const line of lines) {
    if (!line.trim()) continue;
    if (Buffer.byteLength(line, "utf8") > MAX_MESSAGE_BYTES) { output.write(`${rpcError(null, -32600, "ANIMATION_PIPELINE_DOCTOR_MCP_MESSAGE_TOO_LARGE")}\n`); continue; }
    let message;
    try { message = JSON.parse(line); }
    catch { output.write(`${rpcError(null, -32700, "ANIMATION_PIPELINE_DOCTOR_MCP_PARSE_ERROR")}\n`); continue; }
    try {
      const value = await dispatch(message);
      if (message.id !== undefined && value !== null) output.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, result: value })}\n`);
    } catch (error) {
      if (message.id !== undefined) output.write(`${rpcError(message.id, -32603, error instanceof Error ? error.message : String(error))}\n`);
    }
  }
}
if ((process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "") === import.meta.url) serveAnimationPipelineDoctorMcp().catch((error) => { process.stderr.write(`${JSON.stringify({ status: "error", message: error instanceof Error ? error.message : String(error), authority: AUTHORITY })}\n`); process.exitCode = 1; });
