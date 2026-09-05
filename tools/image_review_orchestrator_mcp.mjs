#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import {
  IMAGE_REVIEW_PROFILE_NAMES,
  orchestrateImageReview,
} from "../packages/media/dist/index.js";
import {
  assertAllowedLocalPath,
  configuredLocalRootCount,
} from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-image-review-orchestrator";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_EXISTING_IMAGE_POLISH_ALLOWED_ROOTS";

const assertAllowed = (filePath) =>
  assertAllowedLocalPath(filePath, {
    envName: ALLOWED_ROOTS_ENV,
    output: false,
    label: "image review orchestrator",
  });

async function review(args) {
  if (typeof args.inputPath !== "string") throw new Error("inputPath is required.");
  const inputPath = await assertAllowed(args.inputPath);
  const compareAgainst = [];
  for (const item of args.compareAgainst ?? []) {
    if (!item || typeof item.id !== "string" || typeof item.path !== "string") {
      throw new Error("Each compareAgainst entry requires id and path.");
    }
    const candidatePath = await assertAllowed(item.path);
    compareAgainst.push({ id: item.id, image: await readFile(candidatePath) });
  }
  const result = await orchestrateImageReview(await readFile(inputPath), {
    ...(typeof args.intendedRole === "string" ? { intendedRole: args.intendedRole } : {}),
    ...(typeof args.declaredProfile === "string" ? { declaredProfile: args.declaredProfile } : {}),
    filename: typeof args.filename === "string" ? args.filename : path.basename(inputPath),
    ...(compareAgainst.length ? { compareAgainst } : {}),
  });
  return Object.freeze({
    ok: true,
    inputPath,
    ...result,
    publicationAllowed: false,
    instruction: "Use this result to route work. Technical PASS only advances to visual review; it never publishes an asset automatically.",
  });
}

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_image_review_orchestrator_capabilities",
    description: "Describe the unified asset-aware image review router used before polishing, retouching, Work-header changes or asset promotion.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_review_image_for_intended_use",
    description: "Run the unified review pipeline for an existing image. Auto-selects or accepts an asset QA profile, checks technical quality, optionally performs Work-header crop QA, compares against adjacent images for duplicate/repetitive storytelling, and routes the result to reject, finishing, or mandatory visual review.",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: { type: "string", minLength: 1 },
        intendedRole: {
          type: "string",
          enum: ["work-header", "support-image", "tile", "logo", "ui", "photo", "sprite", "illustration", "texture"],
        },
        declaredProfile: { type: "string", enum: [...IMAGE_REVIEW_PROFILE_NAMES] },
        filename: { type: "string" },
        compareAgainst: {
          type: "array",
          maxItems: 24,
          items: {
            type: "object",
            required: ["id", "path"],
            properties: {
              id: { type: "string", minLength: 1 },
              path: { type: "string", minLength: 1 },
            },
            additionalProperties: false,
          },
        },
      },
      required: ["inputPath"],
      additionalProperties: false,
    },
  }),
]);

function capabilities() {
  return Object.freeze({
    contract: "evavo_image_review_orchestrator_v1",
    allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
    profiles: IMAGE_REVIEW_PROFILE_NAMES,
    routes: ["reject", "needs-finishing", "pass-to-visual-review"],
    checks: [
      "asset-aware-profile-selection",
      "sharpness-and-detail",
      "contrast-and-clipping",
      "alpha-contamination-and-halo-risk",
      "alpha-pinhole-risk",
      "compression-blockiness-risk",
      "work-header-resolution-and-crop-safety",
      "near-duplicate-and-repetition-detection",
      "mandatory-final-visual-review",
    ],
    publicationAllowed: false,
  });
}

async function callTool(name, args) {
  if (name === "evavo_image_review_orchestrator_capabilities") return capabilities();
  if (name === "evavo_review_image_for_intended_use") return review(args ?? {});
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
  try {
    const outgoing = await handle(JSON.parse(line));
    if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: String(error) }, true)))}\n`);
  }
}
