#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { admitEnhancementStudioReviewManifest } from "../packages/media/dist/index.js";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-enhancement-review-bridge";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_EXISTING_IMAGE_POLISH_ALLOWED_ROOTS";

const assertAllowed = (filePath) => assertAllowedLocalPath(filePath, {
  envName: ALLOWED_ROOTS_ENV,
  output: false,
  label: "enhancement review bridge",
});

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function admit(args) {
  if (typeof args.manifestPath !== "string") throw new Error("manifestPath is required.");
  const manifestPath = await assertAllowed(args.manifestPath);
  const raw = JSON.parse(await readFile(manifestPath, "utf8"));
  const admitted = admitEnhancementStudioReviewManifest(raw);

  const sourcePath = await assertAllowed(raw.source_path);
  const candidatePath = await assertAllowed(raw.candidate_path);
  const [sourceSha256, candidateSha256] = await Promise.all([sha256(sourcePath), sha256(candidatePath)]);
  if (sourceSha256 !== admitted.sourceSha256) throw new Error("Enhancement review source bytes do not match the bound source SHA-256.");
  if (candidateSha256 !== admitted.candidateSha256) throw new Error("Enhancement review candidate bytes do not match the bound candidate SHA-256.");

  return Object.freeze({
    ok: true,
    manifestPath,
    sourcePath,
    candidatePath,
    sourceBytesVerified: true,
    candidateBytesVerified: true,
    admitted,
    nextRequiredActions: Object.freeze([
      "Run the Art Studio existing-image quality review using the admitted profile.",
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
    automaticCreativeApproval: false,
  });
}

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_enhancement_review_bridge_capabilities",
    description: "Describe the governed handoff from Image Enhancement Studio into Art Studio review.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_admit_enhancement_review_candidate",
    description: "Admit an Image Enhancement Studio candidate as source-bound Art Studio review material. Verifies physical source/candidate SHA-256 values and preserves publication/Cloudinary blocks until technical, visual and page-context review complete.",
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
    allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
    verifies: ["manifest-contract", "source-sha256", "candidate-sha256", "authority-boundary", "review-profile", "page-context-requirement"],
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
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
