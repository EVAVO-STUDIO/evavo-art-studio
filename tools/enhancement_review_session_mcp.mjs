#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import readline from "node:readline";

import { reviewEnhancementStudioCandidate } from "../packages/media/dist/index.js";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-enhancement-review-session";
const SERVER_VERSION = "1.1.0";
const PROTOCOL_VERSION = "2025-03-26";
const ROOTS_ENV = "EVAVO_EXISTING_IMAGE_POLISH_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_EXISTING_IMAGE_POLISH_ALLOW_WRITES";

const allowed = (path, output = false) => assertAllowedLocalPath(path, {
  envName: ROOTS_ENV,
  output,
  label: "enhancement review session",
});
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());

async function optionalBuffer(path) {
  if (!path) return undefined;
  return readFile(await allowed(path, false));
}

async function runReview(args) {
  if (typeof args.manifestPath !== "string") throw new Error("manifestPath is required.");
  if (typeof args.outputPrefix !== "string") throw new Error("outputPrefix is required.");
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);

  const manifestPath = await allowed(args.manifestPath, false);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const sourcePath = await allowed(manifest.source_path, false);
  const candidatePath = await allowed(manifest.candidate_path, false);
  const prefix = await allowed(args.outputPrefix, true);

  const result = await reviewEnhancementStudioCandidate({
    manifest,
    source: await readFile(sourcePath),
    candidate: await readFile(candidatePath),
    header: await optionalBuffer(args.headerPath),
    support: await optionalBuffer(args.supportPath),
    tile: await optionalBuffer(args.tilePath),
    desktopScreenshot: await optionalBuffer(args.desktopScreenshotPath),
    mobileScreenshot: await optionalBuffer(args.mobileScreenshotPath),
  });

  const qualityProofPath = `${prefix}.quality-proof.png`;
  const differenceProofPath = `${prefix}.difference-proof.png`;
  const pageProofPath = result.pageProofPng ? `${prefix}.page-proof.png` : null;
  const receiptPath = `${prefix}.receipt.json`;

  await writeFile(qualityProofPath, result.qualityProofPng, { flag: "wx" });
  await writeFile(differenceProofPath, result.differenceProofPng, { flag: "wx" });
  if (result.pageProofPng && pageProofPath) await writeFile(pageProofPath, result.pageProofPng, { flag: "wx" });
  await writeFile(receiptPath, `${JSON.stringify({
    contract: "evavo.enhancement-art-review-session.v1",
    manifestPath,
    sourcePath,
    candidatePath,
    qualityProofPath,
    differenceProofPath,
    pageProofPath,
    evidence: result.evidence,
    approvalState: "unapproved",
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    finalVisualApprovalRequired: true,
  }, null, 2)}\n`, { flag: "wx" });

  return {
    ok: true,
    receiptPath,
    qualityProofPath,
    differenceProofPath,
    pageProofPath,
    evidence: result.evidence,
  };
}

const tools = [
  {
    name: "evavo_enhancement_review_session_capabilities",
    description: "Describe the end-to-end Art Studio receiving review for Enhancement Studio candidates.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "evavo_review_enhancement_candidate_end_to_end",
    description: "Verify a source-bound Enhancement Studio manifest, review the candidate at native size and source space, optionally review actual Work-page context, and create proof/receipt artifacts. Never grants publication or Cloudinary overwrite authority.",
    inputSchema: {
      type: "object",
      properties: {
        manifestPath: { type: "string", minLength: 1 },
        outputPrefix: { type: "string", minLength: 1 },
        headerPath: { type: "string" },
        supportPath: { type: "string" },
        tilePath: { type: "string" },
        desktopScreenshotPath: { type: "string" },
        mobileScreenshotPath: { type: "string" },
        confirmLocalWrite: { type: "boolean" },
      },
      required: ["manifestPath", "outputPrefix", "confirmLocalWrite"],
      additionalProperties: false,
    },
  },
];

function capabilities() {
  return {
    contract: "evavo.enhancement-art-review-session.v1",
    allowedRootCount: configuredLocalRootCount(ROOTS_ENV),
    writesEnabled: writesEnabled(),
    verifiesPhysicalBytes: true,
    verifiesDimensions: true,
    nativeCandidateReview: true,
    sourceSpaceRegressionReview: true,
    workHeaderContextReview: true,
    supportImageContextReview: true,
    tileContextReview: true,
    createOnlyProofs: true,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    automaticCreativeApproval: false,
  };
}

async function callTool(name, args) {
  if (name === "evavo_enhancement_review_session_capabilities") return capabilities();
  if (name === "evavo_review_enhancement_candidate_end_to_end") return runReview(args ?? {});
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}

const toolResult = (payload, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError });
const response = (id, result) => ({ jsonrpc: "2.0", id, result });

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
  try {
    const outgoing = await handle(JSON.parse(line));
    if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: String(error) }, true)))}\n`);
  }
}
