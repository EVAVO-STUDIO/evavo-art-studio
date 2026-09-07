#!/usr/bin/env node

import readline from "node:readline";

import {
  REFERENCE_COLOUR_RESTORATION_BRIDGE_CONTRACT,
  TRUSTED_REFERENCE_PROVENANCE,
  executeReferenceColourRestorationReviewSet,
  inspectReferenceColourRestorationReadiness,
  planReferenceColourRestorationReviewSet,
  referenceColourRestorationBridgeCapabilities,
} from "./lib/reference_colour_restoration_bridge.mjs";
import {
  assertReferenceColourRestorationExecutionResult,
  assertReferenceColourRestorationPlanResult,
} from "./lib/reference_colour_restoration_evidence_gate.mjs";

const SERVER_NAME = "evavo-reference-colour-restoration-guarded";
const SERVER_VERSION = "1.1.0";
const PROTOCOL_VERSION = "2025-03-26";

const faceBoxSchema = {
  oneOf: [
    { type: "string", pattern: "^\\s*(?:0(?:\\.\\d+)?|1(?:\\.0+)?)\\s*,\\s*(?:0(?:\\.\\d+)?|1(?:\\.0+)?)\\s*,\\s*(?:0(?:\\.\\d+)?|1(?:\\.0+)?)\\s*,\\s*(?:0(?:\\.\\d+)?|1(?:\\.0+)?)\\s*$" },
    { type: "array", minItems: 4, maxItems: 4, items: { type: "number", minimum: 0, maximum: 1 } },
  ],
};

const requestProperties = Object.freeze({
  sourcePath: { type: "string", minLength: 1 },
  referencePath: { type: "string", minLength: 1 },
  outputDir: { type: "string", minLength: 1 },
  referenceProvenance: { type: "string", enum: TRUSTED_REFERENCE_PROVENANCE },
  confirmRealReference: { type: "boolean", const: true },
  subjectMatchConfirmedByHuman: { type: "boolean", const: true },
  prefix: { type: "string", minLength: 1, maxLength: 80, pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$" },
  sourceFaceBox: faceBoxSchema,
  referenceFaceBox: faceBoxSchema,
  requireDetectedFace: { type: "boolean" },
});
const requiredRequestFields = ["sourcePath", "referencePath", "outputDir", "referenceProvenance", "confirmRealReference", "subjectMatchConfirmedByHuman"];

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_reference_colour_restoration_bridge_capabilities",
    description: "Describe the guarded preservation-first Art Studio bridge into Image Enhancement Studio reference colour restoration.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_reference_colour_restoration_readiness",
    description: "Verify the local Image Enhancement Studio checkout and governed reference-colourization runtime without writing images.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_plan_reference_colour_restoration_review_set",
    description: "Plan the exact source-bound real-reference colour-restoration review set and revalidate the provider evidence before returning it.",
    inputSchema: { type: "object", properties: requestProperties, required: requiredRequestFields, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_run_reference_colour_restoration_review_set",
    description: "Create three deterministic colour-restoration candidates, run technical QA, emit Art Studio review manifests and revalidate every SHA/path/authority boundary before returning the review set. Never selects a winner automatically.",
    inputSchema: {
      type: "object",
      properties: { ...requestProperties, confirmLocalWrite: { type: "boolean", const: true } },
      required: [...requiredRequestFields, "confirmLocalWrite"],
      additionalProperties: false,
    },
  }),
]);

async function callTool(name, args) {
  if (name === "evavo_reference_colour_restoration_bridge_capabilities") {
    return Object.freeze({ ...referenceColourRestorationBridgeCapabilities(), evidenceGate: "evavo.reference-colour-restoration-evidence-gate.v1", guardedMcpVersion: SERVER_VERSION });
  }
  if (name === "evavo_reference_colour_restoration_readiness") return inspectReferenceColourRestorationReadiness();
  if (name === "evavo_plan_reference_colour_restoration_review_set") {
    return assertReferenceColourRestorationPlanResult(await planReferenceColourRestorationReviewSet(args ?? {}));
  }
  if (name === "evavo_run_reference_colour_restoration_review_set") {
    return assertReferenceColourRestorationExecutionResult(await executeReferenceColourRestorationReviewSet(args ?? {}));
  }
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}

function response(id, result) { return { jsonrpc: "2.0", id, result }; }
function toolResult(payload, isError = false) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError };
}

async function handle(message) {
  if (message.method === "initialize") return response(message.id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } });
  if (message.method === "notifications/initialized") return null;
  if (message.method === "tools/list") return response(message.id, { tools });
  if (message.method === "tools/call") {
    try { return response(message.id, toolResult(await callTool(message.params?.name, message.params?.arguments ?? {}))); }
    catch (error) { return response(message.id, toolResult({ ok: false, contract: REFERENCE_COLOUR_RESTORATION_BRIDGE_CONTRACT, message: error instanceof Error ? error.message : String(error) }, true)); }
  }
  return response(message.id, toolResult({ ok: false, message: `Unsupported method ${JSON.stringify(message.method)}.` }, true));
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  try { const outgoing = await handle(JSON.parse(line)); if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: error instanceof Error ? error.message : String(error) }, true)))}\n`); }
}
