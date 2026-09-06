#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { admitEnhancementStudioReviewManifest } from "../packages/media/dist/index.js";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-enhancement-review-bridge";
const SERVER_VERSION = "1.1.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_EXISTING_IMAGE_POLISH_ALLOWED_ROOTS";

const assertAllowed = (filePath) => assertAllowedLocalPath(filePath, {
  envName: ALLOWED_ROOTS_ENV,
  output: false,
  label: "enhancement review bridge",
});

async function bind(filePath) {
  const resolved = await assertAllowed(filePath);
  const bytes = await readFile(resolved);
  if (!bytes.length) throw new Error(`Bound file is empty: ${resolved}`);
  return { path: resolved, sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.length };
}

async function admit(args) {
  if (typeof args.manifestPath !== "string") throw new Error("manifestPath is required.");
  const manifestPath = await assertAllowed(args.manifestPath);
  const raw = JSON.parse(await readFile(manifestPath, "utf8"));
  const admitted = admitEnhancementStudioReviewManifest(raw);

  const [source, candidate] = await Promise.all([bind(raw.source_path), bind(raw.candidate_path)]);
  if (source.sha256 !== admitted.sourceSha256) throw new Error("Enhancement review source bytes do not match the bound source SHA-256.");
  if (candidate.sha256 !== admitted.candidateSha256) throw new Error("Enhancement review candidate bytes do not match the bound candidate SHA-256.");

  return Object.freeze({
    ok: true,
    manifestPath,
    sourceBinding: Object.freeze(source),
    candidateBinding: Object.freeze(candidate),
    sourceBytesVerified: true,
    candidateBytesVerified: true,
    admitted,
    nextRequiredActions: Object.freeze([
      "Create evavo.image-review-session.v1 for the exact candidate bytes using the admitted Art Studio profile, then reverify that durable receipt before downstream review.",
      "Use the durable review-session evidence to inspect alpha-aware quality, ranked connected defect regions, ringing/posterization and suspicious resampling signals.",
      "Run source-vs-candidate edit regression review and multi-scale inspection proof.",
      ...(admitted.intendedRole === "work-header"
        ? ["Run the Work header crop reviewer and inspect desktop/laptop/mobile proofs."]
        : []),
      ...(admitted.pageContextReviewRequired
        ? ["Inspect the candidate in actual page context before any website media replacement."]
        : []),
      "Keep publication and Cloudinary overwrite blocked until final visual approval.",
    ]),
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
    automaticCreativeApproval: false,
  });
}

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_enhancement_review_bridge_capabilities",
    description: "Describe the governed handoff from Image Enhancement Studio into durable Art Studio review.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_admit_enhancement_review_candidate",
    description: "Admit an Image Enhancement Studio candidate as source-bound Art Studio review material. Verifies physical source/candidate SHA-256 and byte lengths and requires the next stage to create and reverify a durable unified image-review session before end-to-end enhancement review.",
    inputSchema: {
      type: "object",
      properties: { manifestPath: { type: "string", minLength: 1 } },
      required: ["manifestPath"],
      additionalProperties: false,
    },
  }),
]);

function capabilities() {
  return Object.freeze({
    contract: "evavo.enhancement-art-review.v1",
    serverVersion: SERVER_VERSION,
    allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
    verifies: ["manifest-contract", "source-sha256-and-length", "candidate-sha256-and-length", "authority-boundary", "review-profile", "durable-image-review-session-requirement", "page-context-requirement"],
    durableImageReviewSessionRequired: true,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
    automaticCreativeApproval: false,
  });
}

async function callTool(name, args) {
  if (name === "evavo_enhancement_review_bridge_capabilities") return capabilities();
  if (name === "evavo_admit_enhancement_review_candidate") return admit(args ?? {});
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}

function response(id, result) { return { jsonrpc: "2.0", id, result }; }
function toolResult(payload, isError = false) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError };
}

async function handle(message) {
  const { id, method, params } = message;
  if (method === "initialize") return response(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } });
  if (method === "notifications/initialized") return null;
  if (method === "tools/list") return response(id, { tools });
  if (method === "tools/call") {
    try { return response(id, toolResult(await callTool(params?.name, params?.arguments ?? {}))); }
    catch (error) { return response(id, toolResult({ ok: false, message: error instanceof Error ? error.message : String(error) }, true)); }
  }
  return response(id, toolResult({ ok: false, message: `Unsupported method ${JSON.stringify(method)}.` }, true));
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  try { const outgoing = await handle(JSON.parse(line)); if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: String(error) }, true)))}\n`); }
}
