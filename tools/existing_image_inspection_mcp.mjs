#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import { createExistingImageEditInspectionProof } from "../packages/media/dist/index.js";
import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-existing-image-inspection";
const SERVER_VERSION = "1.1.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_EXISTING_IMAGE_POLISH_ALLOWED_ROOTS";
const ALLOW_WRITES_ENV = "EVAVO_EXISTING_IMAGE_POLISH_ALLOW_WRITES";

const assertAllowed = (filePath, { output = false } = {}) => assertAllowedLocalPath(filePath, {
  envName: ALLOWED_ROOTS_ENV,
  output,
  label: "existing image inspection",
});

function identity(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

async function inspect(args) {
  if (process.env[ALLOW_WRITES_ENV] !== "true" || args.confirmLocalWrite !== true) throw new Error("Inspection proof output requires enabled local writes and confirmLocalWrite=true.");
  for (const key of ["sourcePath", "editedPath", "proofPath"]) if (typeof args[key] !== "string") throw new Error(`${key} is required.`);
  const sourcePath = await assertAllowed(args.sourcePath);
  const editedPath = await assertAllowed(args.editedPath);
  const proofPath = await assertAllowed(args.proofPath, { output: true });
  if (new Set([sourcePath, editedPath, proofPath].map(identity)).size !== 3) throw new Error("Source, edited and proof paths must be distinct.");

  const result = await createExistingImageEditInspectionProof(await readFile(sourcePath), await readFile(editedPath));
  await writeCreateOnlyBundle([{ path: proofPath, data: result.png }]);
  return Object.freeze({
    ok: true,
    sourcePath,
    editedPath,
    proofPath,
    evidence: result.evidence,
    visualReviewRequired: true,
    reviewInstructions: [
      "Compare source and edited at runtime composition scale on white and black backgrounds.",
      "Inspect each ranked connected change region separately, beginning with region-01, rather than relying on one large union crop.",
      "At every region zoom, check for blur, smearing, ringing, stair-stepping, edge contamination, invented detail and texture discontinuity.",
      "Inspect source and edited alpha channels for holes, jagged edges, halos and lost silhouette detail.",
      "Reject the edit if it looks worse even when every changed pixel is technically contained.",
    ],
    bytesReturned: false,
  });
}

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_existing_image_inspection_capabilities",
    description: "Describe multi-scale, connected-region proof generation for visual inspection of existing-image edits.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_create_existing_image_inspection_proof",
    description: "Create a dynamic source-vs-edit QA sheet containing white and black runtime comparisons, source/edited alpha channels and pixel-preserving zoom pairs for the top connected edit regions. Intended for vision-agent or human retouch review before promotion.",
    inputSchema: {
      type: "object",
      properties: {
        sourcePath: { type: "string", minLength: 1 },
        editedPath: { type: "string", minLength: 1 },
        proofPath: { type: "string", minLength: 1 },
        confirmLocalWrite: { type: "boolean", const: true },
      },
      required: ["sourcePath", "editedPath", "proofPath", "confirmLocalWrite"],
      additionalProperties: false,
    },
  }),
]);

function capabilities() {
  return Object.freeze({
    contract: "evavo_existing_image_inspection_v1_1",
    serverVersion: SERVER_VERSION,
    allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
    sourceMutation: false,
    rollbackSafeCreateOnlyProofWrite: true,
    connectedChangeRegionSegmentation: true,
    maximumRankedRegionPairs: 3,
    basePanels: [
      "source-white-runtime",
      "edited-white-runtime",
      "source-black-hostile",
      "edited-black-hostile",
      "source-alpha-channel",
      "edited-alpha-channel",
    ],
    dynamicPanels: ["source-region-N-pixel-zoom", "edited-region-N-pixel-zoom"],
  });
}

async function callTool(name, args) {
  if (name === "evavo_existing_image_inspection_capabilities") return capabilities();
  if (name === "evavo_create_existing_image_inspection_proof") return inspect(args ?? {});
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}
function response(id, result) { return { jsonrpc: "2.0", id, result }; }
function toolResult(payload) { return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError: false }; }
function toolError(error) {
  const payload = { ok: false, message: error instanceof Error ? error.message : String(error) };
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError: true };
}
async function handle(message) {
  const { id, method, params } = message;
  if (method === "initialize") return response(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } });
  if (method === "notifications/initialized") return null;
  if (method === "tools/list") return response(id, { tools });
  if (method === "tools/call") {
    try { return response(id, toolResult(await callTool(params?.name, params?.arguments ?? {}))); }
    catch (error) { return response(id, toolError(error)); }
  }
  return response(id, toolError(new Error(`Unsupported method ${JSON.stringify(method)}.`)));
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  try {
    const outgoing = await handle(JSON.parse(line));
    if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(response(null, toolError(error)))}\n`);
  }
}
