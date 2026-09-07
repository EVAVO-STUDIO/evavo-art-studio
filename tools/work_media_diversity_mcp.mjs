#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { reviewWorkMediaDiversity } from "../packages/media/dist/index.js";
import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-media-diversity";
const SERVER_VERSION = "1.2.0";
const PROTOCOL_VERSION = "2025-03-26";
const ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";
const allowed = (p, output = false) => assertAllowedLocalPath(p, { envName: ROOTS_ENV, output, label: "work media diversity" });
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function readBound(path) {
  const resolved = await allowed(path, false);
  const bytes = await readFile(resolved);
  if (!bytes.length) throw new Error(`Work media diversity input is empty: ${resolved}`);
  return { path: resolved, bytes, sha256: sha256(bytes), byteLength: bytes.length };
}

function storyFromItem(item) {
  if (item.story === undefined) return undefined;
  return {
    subject: item.story.subject,
    setting: item.story.setting,
    activity: item.story.activity,
    composition: item.story.composition,
    specificity: item.story.specificity,
    motifTokens: item.story.motifTokens ?? [],
    genericStockOrAiFiller: item.story.genericStockOrAiFiller,
  };
}

function recomputeInput(loaded, args) {
  return {
    images: loaded.map(({ item, file }) => ({ id: item.id, route: item.route, role: item.role, story: storyFromItem(item), image: file.bytes })),
    nearDuplicateThreshold: args.nearDuplicateThreshold,
    reviewSimilarityThreshold: args.reviewSimilarityThreshold,
    storyCollisionThreshold: args.storyCollisionThreshold,
    storyReviewThreshold: args.storyReviewThreshold,
    requireStoryReview: args.requireStoryReview === true,
    maximumImages: args.maximumImages,
  };
}

async function review(args) {
  if (!Array.isArray(args.items) || args.items.length < 2) throw new Error("items must contain at least two Work media inputs.");
  const loaded = [];
  for (const item of args.items) {
    if (!item || typeof item.id !== "string" || typeof item.path !== "string") throw new Error("Every item requires id and path.");
    const file = await readBound(item.path);
    loaded.push({ item, file });
  }
  const result = await reviewWorkMediaDiversity(recomputeInput(loaded, args));
  const receipt = {
    contract: "evavo.work-media-diversity-receipt.v1_2",
    reviewContract: result.contract,
    similarityModel: result.evidence.similarityModel,
    storySimilarityModel: result.evidence.storySimilarityModel,
    sourceBindings: loaded.map(({ item, file }) => ({ id: item.id, route: item.route ?? null, role: item.role ?? "other", story: storyFromItem(item) ?? null, path: file.path, sha256: file.sha256, byteLength: file.byteLength })),
    evidence: result.evidence,
    storyReviewComplete: result.evidence.storyReviewComplete,
    semanticStoryReviewPassed: result.evidence.semanticStoryReviewPassed,
    visualReviewRequired: true,
    automaticReplacementAllowed: false,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
  };
  if (args.receiptPath !== undefined) {
    if (typeof args.receiptPath !== "string" || args.confirmLocalWrite !== true) throw new Error("receiptPath requires confirmLocalWrite=true.");
    if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required to write a diversity receipt.`);
    const receiptPath = await allowed(args.receiptPath, true);
    const payload = `${JSON.stringify(receipt, null, 2)}\n`;
    await writeCreateOnlyBundle([{ path: receiptPath, data: payload, encoding: "utf8" }]);
    return { ok: true, receiptPath, receiptSha256: sha256(Buffer.from(payload, "utf8")), ...receipt };
  }
  return { ok: true, ...receipt };
}

async function verify(args) {
  if (typeof args.receiptPath !== "string") throw new Error("receiptPath is required.");
  const receiptFile = await readBound(args.receiptPath);
  const receipt = JSON.parse(receiptFile.bytes.toString("utf8"));
  if (receipt.contract !== "evavo.work-media-diversity-receipt.v1_2" || receipt.reviewContract !== "evavo.work-media-diversity.v1_2" || receipt.similarityModel !== "dhash-ahash-rgb-grid-v1" || receipt.storySimilarityModel !== "work-story-archetype-v1") throw new Error("Unsupported or stale Work media diversity receipt.");
  if (receipt.publicationAllowed !== false || receipt.cloudOverwriteAllowed !== false || receipt.websiteMutationAllowed !== false || receipt.automaticReplacementAllowed !== false) throw new Error("Work media diversity receipt carries forbidden mutation authority.");
  const items = [];
  for (const binding of receipt.sourceBindings ?? []) {
    const file = await readBound(binding.path);
    if (file.sha256 !== binding.sha256 || file.byteLength !== binding.byteLength) throw new Error(`Work media diversity source bytes changed: ${binding.id}.`);
    items.push({ id: binding.id, route: binding.route ?? undefined, role: binding.role ?? "other", story: binding.story ?? undefined, image: file.bytes });
  }
  const recomputed = await reviewWorkMediaDiversity({
    images: items,
    nearDuplicateThreshold: receipt.evidence.nearDuplicateThreshold,
    reviewSimilarityThreshold: receipt.evidence.reviewSimilarityThreshold,
    storyCollisionThreshold: receipt.evidence.storyCollisionThreshold,
    storyReviewThreshold: receipt.evidence.storyReviewThreshold,
    requireStoryReview: receipt.evidence.storyReviewRequired,
    maximumImages: Math.max(2, items.length),
  });
  if (recomputed.contract !== receipt.reviewContract || recomputed.evidence.similarityModel !== receipt.similarityModel || recomputed.evidence.storySimilarityModel !== receipt.storySimilarityModel) throw new Error("Work media diversity review model drifted.");
  if (JSON.stringify(recomputed.evidence) !== JSON.stringify(receipt.evidence)) throw new Error("Work media diversity evidence changed on recomputation.");
  if (receipt.storyReviewComplete !== recomputed.evidence.storyReviewComplete || receipt.semanticStoryReviewPassed !== recomputed.evidence.semanticStoryReviewPassed) throw new Error("Work media story-diversity summary drifted from recomputed evidence.");
  return { ok: true, receiptPath: receiptFile.path, receiptSha256: receiptFile.sha256, receiptByteLength: receiptFile.byteLength, evidenceRecomputedAndMatched: true, colorAwareSimilarityReverified: true, storySimilarityReverified: true, storyReviewComplete: recomputed.evidence.storyReviewComplete, semanticStoryReviewPassed: recomputed.evidence.semanticStoryReviewPassed, evidence: recomputed.evidence, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false };
}

const STORY_SCHEMA = {
  type: "object",
  properties: {
    subject: { enum: ["product-ui", "person-at-device", "abstract-technology", "physical-workplace", "retail-shopfront", "data-visualization", "device-mockup", "team-collaboration", "infrastructure", "document-workflow", "other"] },
    setting: { enum: ["browser-ui", "desktop-device", "mobile-device", "office", "retail", "studio", "outdoors", "abstract", "industrial", "mixed", "other"] },
    activity: { enum: ["browsing", "analysing", "designing", "collaborating", "operating", "purchasing", "communicating", "presenting", "monitoring", "none", "other"] },
    composition: { enum: ["centered-device", "angled-device", "split-screen", "full-bleed-ui", "person-with-screen", "close-up-object", "environment-wide", "diagrammatic", "collage", "abstract-field", "other"] },
    specificity: { enum: ["specific", "mixed", "generic"] },
    motifTokens: { type: "array", maxItems: 12, uniqueItems: true, items: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,63}$" } },
    genericStockOrAiFiller: { type: "boolean" },
  },
  required: ["subject", "setting", "activity", "composition", "specificity", "genericStockOrAiFiller"],
  additionalProperties: false,
};

const tools = [
  { name: "evavo_work_media_diversity_capabilities", description: "Describe read-only cross-route Work media duplicate and semantic storytelling-repetition QA.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_review_work_media_diversity", description: "Compare exact bytes, perceptual image similarity and structured visual-story archetypes across Work headers, tiles and support images. Catches different images that repeat the same generic story as well as pixel duplicates. Optionally writes a create-only receipt; never selects or publishes imagery.", inputSchema: { type: "object", properties: { items: { type: "array", minItems: 2, maxItems: 96, items: { type: "object", properties: { id: { type: "string" }, path: { type: "string" }, route: { type: "string" }, role: { type: "string", enum: ["header", "tile", "support", "other"] }, story: STORY_SCHEMA }, required: ["id", "path"], additionalProperties: false } }, nearDuplicateThreshold: { type: "number", minimum: 0, maximum: 1 }, reviewSimilarityThreshold: { type: "number", minimum: 0, maximum: 1 }, storyCollisionThreshold: { type: "number", minimum: 0, maximum: 1 }, storyReviewThreshold: { type: "number", minimum: 0, maximum: 1 }, requireStoryReview: { type: "boolean" }, maximumImages: { type: "integer", minimum: 2, maximum: 96 }, receiptPath: { type: "string" }, confirmLocalWrite: { type: "boolean" } }, required: ["items"], additionalProperties: false } },
  { name: "evavo_verify_work_media_diversity", description: "Re-read every source binding and recompute both perceptual and structured visual-story diversity evidence. Read-only.", inputSchema: { type: "object", properties: { receiptPath: { type: "string" } }, required: ["receiptPath"], additionalProperties: false } },
];

function capabilities() {
  return { contract: "evavo.work-media-diversity.v1_2", serverVersion: SERVER_VERSION, similarityModel: "dhash-ahash-rgb-grid-v1", storySimilarityModel: "work-story-archetype-v1", exactBinaryDuplicateDetection: true, perceptualNearDuplicateDetection: true, colorAwarePerceptualSimilarity: true, structuredStoryArchetypeReview: true, crossRouteStoryCollisionDetection: true, genericStockOrAiFillerFlagging: true, sameRouteReuseDoesNotCreateCrossRouteStoryCollision: true, durableReceiptAvailable: true, staleSourceReverification: true, colorAwareSimilarityReverification: true, storySimilarityReverification: true, visualReviewRequired: true, automaticReplacementAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false, allowedRootCount: configuredLocalRootCount(ROOTS_ENV), writesEnabled: writesEnabled() };
}
async function callTool(name, args) {
  if (name === "evavo_work_media_diversity_capabilities") return capabilities();
  if (name === "evavo_review_work_media_diversity") return review(args ?? {});
  if (name === "evavo_verify_work_media_diversity") return verify(args ?? {});
  throw new Error(`Unknown tool ${name}.`);
}
const response = (id, result) => ({ jsonrpc: "2.0", id, result });
const toolResult = (payload, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError });
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  try {
    const message = JSON.parse(line); let outgoing;
    if (message.method === "initialize") outgoing = response(message.id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } });
    else if (message.method === "notifications/initialized") outgoing = null;
    else if (message.method === "tools/list") outgoing = response(message.id, { tools });
    else if (message.method === "tools/call") { try { outgoing = response(message.id, toolResult(await callTool(message.params?.name, message.params?.arguments ?? {}))); } catch (error) { outgoing = response(message.id, toolResult({ ok: false, message: error instanceof Error ? error.message : String(error) }, true)); } }
    else outgoing = response(message.id, toolResult({ ok: false, message: `Unsupported method ${message.method}.` }, true));
    if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`);
  } catch (error) { process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: String(error) }, true)))}\n`); }
}
