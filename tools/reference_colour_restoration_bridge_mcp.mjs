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

const SERVER_NAME = "evavo-reference-colour-restoration-bridge";
const SERVER_VERSION = "1.0.0";
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

const requiredRequestFields = [
  "sourcePath",
  "referencePath",
  "outputDir",
  "referenceProvenance",
  "confirmRealReference",
  "subjectMatchConfirmedByHuman",
];

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_reference_colour_restoration_bridge_capabilities",
    description: "Describe Art Studio's deterministic, non-generative bridge into Image Enhancement Studio for real-reference portrait colour restoration.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_reference_colour_restoration_readiness",
    description: "Verify the local Image Enhancement Studio checkout, Python/Pillow runtime and governed colour-restoration import path without writing images.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_plan_reference_colour_restoration_review_set",
    description: "Bind the monochrome source plus a distinct confirmed real colour photo of the same subject, run the enhancer's read-only governed plan, and return the exact create-only three-candidate review-set route. No image is written and no generative fallback is permitted.",
    inputSchema: {
      type: "object",
      properties: requestProperties,
      required: requiredRequestFields,
      additionalProperties: false,
    },
  }),
  Object.freeze({
    name: "evavo_run_reference_colour_restoration_review_set",
    description: "Run the governed Image Enhancement Studio colour-restoration pipeline locally: create conservative/balanced/rich candidates, run technical QA on each, and emit Art Studio review manifests. The source is immutable and no winner is selected automatically.",
    inputSchema: {
      type: "object",
      properties: {
        ...requestProperties,
        confirmLocalWrite: { type: "boolean", const: true },
      },
      required: [...requiredRequestFields, "confirmLocalWrite"],
      additionalProperties: false,
    },
  }),
]);

async function callTool(name, args) {
  if (name === "evavo_reference_colour_restoration_bridge_capabilities") {
    return referenceColourRestorationBridgeCapabilities();
  }
  if (name === "evavo_reference_colour_restoration_readiness") {
    return inspectReferenceColourRestorationReadiness();
  }
  if (name === "evavo_plan_reference_colour_restoration_review_set") {
    return planReferenceColourRestorationReviewSet(args ?? {});
  }
  if (name === "evavo_run_reference_colour_restoration_review_set") {
    return executeReferenceColourRestorationReviewSet(args ?? {});
  }
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}

function response(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function toolResult(payload, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    isError,
  };
}

async function handle(message) {
  if (message.method === "initialize") {
    return response(message.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    });
  }
  if (message.method === "notifications/initialized") return null;
  if (message.method === "tools/list") return response(message.id, { tools });
  if (message.method === "tools/call") {
    try {
      return response(
        message.id,
        toolResult(await callTool(message.params?.name, message.params?.arguments ?? {})),
      );
    } catch (error) {
      return response(
        message.id,
        toolResult({
          ok: false,
          contract: REFERENCE_COLOUR_RESTORATION_BRIDGE_CONTRACT,
          message: error instanceof Error ? error.message : String(error),
        }, true),
      );
    }
  }
  return response(message.id, toolResult({ ok: false, message: `Unsupported method ${JSON.stringify(message.method)}.` }, true));
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  try {
    const outgoing = await handle(JSON.parse(line));
    if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: error instanceof Error ? error.message : String(error) }, true)))}\n`);
  }
}
