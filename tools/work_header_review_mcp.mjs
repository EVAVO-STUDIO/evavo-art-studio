#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import { reviewWorkHeaderImage } from "../packages/media/dist/index.js";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-header-review";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const ALLOW_WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";

const assertAllowed = (filePath, { output = false } = {}) =>
  assertAllowedLocalPath(filePath, { envName: ALLOWED_ROOTS_ENV, output, label: "work header review" });

function assertWrite(args) {
  if (process.env[ALLOW_WRITES_ENV] !== "true") throw new Error(`Work-header review writes are disabled. Set ${ALLOW_WRITES_ENV}=true.`);
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required for this exact call.");
}

async function review(args) {
  assertWrite(args);
  if (typeof args.inputPath !== "string" || typeof args.proofPath !== "string" || typeof args.receiptPath !== "string") {
    throw new Error("inputPath, proofPath and receiptPath are required.");
  }
  const inputPath = await assertAllowed(args.inputPath);
  const proofPath = await assertAllowed(args.proofPath, { output: true });
  const receiptPath = await assertAllowed(args.receiptPath, { output: true });
  if (new Set([path.resolve(inputPath), path.resolve(proofPath), path.resolve(receiptPath)]).size !== 3) {
    throw new Error("input, proof and receipt paths must be distinct.");
  }

  const result = await reviewWorkHeaderImage(await readFile(inputPath), {
    ...(Array.isArray(args.viewports) ? { viewports: args.viewports } : {}),
    ...(typeof args.minimumScore === "number" ? { minimumScore: args.minimumScore } : {}),
    ...(typeof args.minimumSharpness === "number" ? { minimumSharpness: args.minimumSharpness } : {}),
    ...(typeof args.maximumUpscaleRatio === "number" ? { maximumUpscaleRatio: args.maximumUpscaleRatio } : {}),
    ...(typeof args.minimumCropRetainedRatio === "number" ? { minimumCropRetainedRatio: args.minimumCropRetainedRatio } : {}),
  });

  const semanticReview = {
    required: true,
    status: "pending",
    questions: [
      "Does this image clearly relate to this exact work item rather than merely looking attractive?",
      "Does the desktop crop have a strong focal point and enough negative space for the page layout?",
      "Does the mobile crop still communicate the subject instead of cutting it apart?",
      "Does it look intentionally art-directed and premium, not generic stock, AI filler, random UI or an irrelevant screenshot?",
      "Is it visually coherent with the EVAVO work grid and adjacent project imagery without becoming repetitive?",
      "Are visible logos, UI, typography, people, products and architectural details clean and credible at full size?",
      "Would a senior designer actually choose this as the lead image for the project?",
    ],
    rejectIf: [
      "technically blurry or visibly soft at intended size",
      "obvious compression artifacts, bad upscaling, broken edges or unfinished transparency",
      "main subject is lost by desktop or mobile cover crop",
      "image is semantically weak, generic, repetitive, misleading or unrelated to the case study",
      "image reads as low-quality AI generation or placeholder art",
      "a stronger approved tile/project image already exists and should be reused instead",
    ],
  };

  const receipt = {
    schemaVersion: "1.0",
    operation: "evavo-work-header-image-review",
    pageSlug: typeof args.pageSlug === "string" ? args.pageSlug : null,
    role: typeof args.role === "string" ? args.role : "header",
    inputPath,
    proofPath,
    technical: result.evidence,
    semanticReview,
    decision: result.evidence.grade === "fail" ? "reject" : "requires-visual-review",
    publicationAllowed: false,
    rule: "Never publish a changed work-page header solely because it passes technical metrics. A visual/semantic review of the generated viewport proof is mandatory.",
  };

  for (const p of [proofPath, receiptPath]) await mkdir(path.dirname(p), { recursive: true });
  await writeFile(proofPath, result.proofPng, { flag: "wx" });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  return { ok: true, inputPath, proofPath, receiptPath, technical: result.evidence, decision: receipt.decision, publicationAllowed: false, bytesReturned: false };
}

async function rank(args) {
  if (!Array.isArray(args.candidates) || args.candidates.length < 1 || args.candidates.length > 50) {
    throw new Error("candidates must contain 1 through 50 local image paths.");
  }
  const reviews = [];
  for (const candidate of args.candidates) {
    const inputPath = await assertAllowed(candidate);
    const result = await reviewWorkHeaderImage(await readFile(inputPath), {
      ...(Array.isArray(args.viewports) ? { viewports: args.viewports } : {}),
      ...(typeof args.minimumScore === "number" ? { minimumScore: args.minimumScore } : {}),
    });
    reviews.push({ inputPath, evidence: result.evidence });
  }
  reviews.sort((a, b) => b.evidence.score - a.evidence.score);
  return {
    ok: true,
    candidates: reviews,
    recommendedTechnicalCandidate: reviews.find((item) => item.evidence.grade !== "fail")?.inputPath ?? null,
    visualReviewStillRequired: true,
    instruction: "Technical ranking is only a shortlist. Inspect candidate viewport proofs and project relevance before changing a work page.",
  };
}

const tools = [
  {
    name: "evavo_work_header_review_capabilities",
    description: "Describe work-page header image QA: blur/detail/exposure/resolution/crop checks plus mandatory desktop/mobile visual review.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "evavo_review_work_header_image",
    description: "Preflight an EXISTING proposed work-page header image. Detects technical blur, undersizing, destructive crops, exposure/contrast problems and emits viewport proofs. It deliberately does not auto-approve publication: an agent must visually inspect the proof for relevance, composition and quality.",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: { type: "string", minLength: 1 },
        proofPath: { type: "string", minLength: 1 },
        receiptPath: { type: "string", minLength: 1 },
        pageSlug: { type: "string" },
        role: { type: "string", enum: ["header", "support-image", "tile"] },
        minimumScore: { type: "number", minimum: 0, maximum: 100 },
        minimumSharpness: { type: "number", minimum: 0, maximum: 255 },
        maximumUpscaleRatio: { type: "number", minimum: 1, maximum: 8 },
        minimumCropRetainedRatio: { type: "number", minimum: 0.1, maximum: 1 },
        viewports: {
          type: "array", minItems: 1, maxItems: 8,
          items: { type: "object", required: ["name", "width", "height"], properties: { name: { type: "string" }, width: { type: "integer" }, height: { type: "integer" }, devicePixelRatio: { type: "number" } }, additionalProperties: false },
        },
        confirmLocalWrite: { type: "boolean", const: true },
      },
      required: ["inputPath", "proofPath", "receiptPath", "confirmLocalWrite"],
      additionalProperties: false,
    },
  },
  {
    name: "evavo_rank_work_header_candidates",
    description: "Technically rank existing local header-image candidates by sharpness, resolution, crop safety and tonal quality. This only creates a shortlist; visual/semantic review remains mandatory.",
    inputSchema: {
      type: "object",
      properties: {
        candidates: { type: "array", minItems: 1, maxItems: 50, uniqueItems: true, items: { type: "string", minLength: 1 } },
        minimumScore: { type: "number", minimum: 0, maximum: 100 },
        viewports: { type: "array", minItems: 1, maxItems: 8, items: { type: "object" } },
      },
      required: ["candidates"],
      additionalProperties: false,
    },
  },
];

function capabilities() {
  return {
    contract: "evavo_work_header_review_v1",
    allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
    checks: ["sharpness", "detail-energy", "source-resolution", "cover-crop-retention", "upscale-risk", "luminance", "contrast", "shadow-clipping", "highlight-clipping"],
    proofs: ["desktop-cover", "laptop-cover", "mobile-cover"],
    publicationPolicy: "technical-pass + mandatory visual-semantic review; never auto-approve from metrics alone",
  };
}

async function callTool(name, args) {
  if (name === "evavo_work_header_review_capabilities") return capabilities();
  if (name === "evavo_review_work_header_image") return review(args ?? {});
  if (name === "evavo_rank_work_header_candidates") return rank(args ?? {});
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}

function toolResult(payload, isError = false) { return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError }; }
function response(id, result) { return { jsonrpc: "2.0", id, result }; }

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
