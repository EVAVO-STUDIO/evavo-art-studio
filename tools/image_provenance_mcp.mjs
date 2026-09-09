#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { createImageProvenancePacket } from "../packages/media/dist/index.js";
import {
  assertAllowedLocalPath,
  configuredLocalRootCount,
} from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-image-provenance";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_IMAGE_PROVENANCE_ALLOWED_ROOTS";

const assertAllowed = (filePath) => assertAllowedLocalPath(filePath, {
  envName: ALLOWED_ROOTS_ENV,
  output: false,
  label: "image provenance",
});

const originValues = ["human-authored", "ai-generated", "machine-assisted", "mixed", "unknown"];
const verificationValues = ["verified", "unverified", "invalid"];

const evidenceItemSchema = {
  oneOf: [
    {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1 },
        kind: { const: "source-binding" },
        assetSha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
        relation: { type: "string", enum: ["immutable-source", "candidate-review", "derivative", "approved-reference", "other"] },
        recordId: { type: "string", minLength: 1 },
        note: { type: "string", minLength: 1 },
      },
      required: ["id", "kind", "assetSha256"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1 },
        kind: { type: "string", enum: ["generation-receipt", "content-credential"] },
        assetSha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
        verificationStatus: { type: "string", enum: verificationValues },
        verifier: { type: "string", minLength: 1 },
        recordId: { type: "string", minLength: 1 },
        issuer: { type: "string", minLength: 1 },
        reportedOrigin: { type: "string", enum: originValues },
        note: { type: "string", minLength: 1 },
      },
      required: ["id", "kind", "assetSha256", "verificationStatus"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1 },
        kind: { const: "evavo-record" },
        record: { type: "object" },
        verificationStatus: { type: "string", enum: verificationValues },
        verifier: { type: "string", minLength: 1 },
        verificationRecordId: { type: "string", minLength: 1 },
        note: { type: "string", minLength: 1 },
      },
      required: ["id", "kind", "record"],
      additionalProperties: false,
    },
  ],
};

async function reviewProvenance(args) {
  if (typeof args.inputPath !== "string" || !args.inputPath.trim()) throw new Error("inputPath is required.");
  const inputPath = await assertAllowed(args.inputPath);
  const image = await readFile(inputPath);
  const packet = createImageProvenancePacket(image, {
    ...(Array.isArray(args.evidence) ? { evidence: args.evidence } : {}),
  });
  return Object.freeze({
    ok: true,
    inputPath,
    ...packet,
    trustBoundary: Object.freeze({
      localSha256BindingPerformedByArtStudio: true,
      externalCryptographicVerificationPerformedByThisTool: false,
      externalVerifiedStatusMeans: "A separate verifier result was supplied with verifier identity and verification record id; this MCP only checks that the evidence is bound to the exact local image SHA-256.",
      pixelOriginDetectionClaimed: false,
    }),
    bytesReturned: false,
  });
}

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_image_provenance_capabilities",
    description: "Describe read-only byte-bound provenance review, EVAVO lineage reuse and the external-verifier trust boundary.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_review_image_provenance",
    description: "Review exact image bytes against source bindings, provider/generation receipts, content-credential verifier results and existing EVAVO lineage records. Never infers AI/human authorship from pixels.",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: { type: "string", minLength: 1 },
        evidence: {
          type: "array",
          maxItems: 64,
          items: evidenceItemSchema,
        },
      },
      required: ["inputPath"],
      additionalProperties: false,
    },
  }),
]);

async function callTool(name, args) {
  if (name === "evavo_image_provenance_capabilities") {
    return Object.freeze({
      contract: "evavo_image_provenance_agent_v1",
      mode: "read-only-byte-bound-provenance",
      tools: tools.map((tool) => tool.name),
      evidenceKinds: ["source-binding", "generation-receipt", "content-credential", "evavo-record"],
      packetStatuses: ["verified", "unverified", "absent", "invalid"],
      recognizedEvavoLineage: ["evavo.image-provenance-record.v1", "evavo.enhancement-art-review.v1", "evavo-master-transparent-asset receipts"],
      trustBoundary: {
        localSha256BindingPerformedByArtStudio: true,
        externalCryptographicVerificationPerformedByThisTool: false,
        verifiedExternalClaimsRequireVerifierAndRecordId: true,
        pixelOriginDetectionClaimed: false,
      },
      allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
      sourceMutationAllowed: false,
      writesFiles: false,
      bytesReturned: false,
      automaticCreativeApproval: false,
      publicationAllowed: false,
    });
  }
  if (name === "evavo_review_image_provenance") return reviewProvenance(args ?? {});
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
  if (request?.jsonrpc !== "2.0") return { jsonrpc: "2.0", id: request?.id ?? null, error: { code: -32600, message: "Invalid Request" } };
  if (request.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions: `Read-only provenance review. Configure ${ALLOWED_ROOTS_ENV}. This tool verifies local SHA-256 binding but does not itself perform C2PA/provider signature verification or pixel-based authorship detection.`,
      },
    };
  }
  if (request.method === "ping") return { jsonrpc: "2.0", id: request.id, result: {} };
  if (request.method === "tools/list") return { jsonrpc: "2.0", id: request.id, result: { tools } };
  if (request.method === "tools/call") {
    try {
      return { jsonrpc: "2.0", id: request.id, result: result(await callTool(request.params?.name, request.params?.arguments)) };
    } catch (error) {
      return { jsonrpc: "2.0", id: request.id, result: result({ code: "IMAGE_PROVENANCE_REVIEW_FAILED", message: error instanceof Error ? error.message : String(error) }, true) };
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
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
      return;
    }
    const response = await dispatch(request);
    if (response !== null) process.stdout.write(`${JSON.stringify(response)}\n`);
  });
});
