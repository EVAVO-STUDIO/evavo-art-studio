#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { reviewWorkMediaDiversity } from "../packages/media/dist/index.js";
import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-media-diversity";
const SERVER_VERSION = "1.1.0";
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

async function review(args) {
  if (!Array.isArray(args.items) || args.items.length < 2) throw new Error("items must contain at least two Work media inputs.");
  const loaded = [];
  for (const item of args.items) {
    if (!item || typeof item.id !== "string" || typeof item.path !== "string") throw new Error("Every item requires id and path.");
    const file = await readBound(item.path);
    loaded.push({ item, file });
  }
  const result = await reviewWorkMediaDiversity({
    images: loaded.map(({ item, file }) => ({ id: item.id, route: item.route, role: item.role, image: file.bytes })),
    nearDuplicateThreshold: args.nearDuplicateThreshold,
    reviewSimilarityThreshold: args.reviewSimilarityThreshold,
    maximumImages: args.maximumImages,
  });
  const receipt = {
    contract: "evavo.work-media-diversity-receipt.v1_1",
    reviewContract: result.contract,
    similarityModel: result.evidence.similarityModel,
    sourceBindings: loaded.map(({ item, file }) => ({ id: item.id, route: item.route ?? null, role: item.role ?? "other", path: file.path, sha256: file.sha256, byteLength: file.byteLength })),
    evidence: result.evidence,
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
    await writeCreateOnlyBundle([{ path: receiptPath, data: `${JSON.stringify(receipt, null, 2)}\n`, encoding: "utf8" }]);
    return { ok: true, receiptPath, ...receipt };
  }
  return { ok: true, ...receipt };
}

async function verify(args) {
  if (typeof args.receiptPath !== "string") throw new Error("receiptPath is required.");
  const receiptFile = await readBound(args.receiptPath);
  const receipt = JSON.parse(receiptFile.bytes.toString("utf8"));
  if (receipt.contract !== "evavo.work-media-diversity-receipt.v1_1" || receipt.reviewContract !== "evavo.work-media-diversity.v1_1" || receipt.similarityModel !== "dhash-ahash-rgb-grid-v1") throw new Error("Unsupported or stale Work media diversity receipt.");
  if (receipt.publicationAllowed !== false || receipt.cloudOverwriteAllowed !== false || receipt.websiteMutationAllowed !== false || receipt.automaticReplacementAllowed !== false) throw new Error("Work media diversity receipt carries forbidden mutation authority.");
  const items = [];
  for (const binding of receipt.sourceBindings ?? []) {
    const file = await readBound(binding.path);
    if (file.sha256 !== binding.sha256 || file.byteLength !== binding.byteLength) throw new Error(`Work media diversity source bytes changed: ${binding.id}.`);
    items.push({ id: binding.id, route: binding.route ?? undefined, role: binding.role ?? "other", image: file.bytes });
  }
  const recomputed = await reviewWorkMediaDiversity({ images: items, nearDuplicateThreshold: receipt.evidence.nearDuplicateThreshold, reviewSimilarityThreshold: receipt.evidence.reviewSimilarityThreshold, maximumImages: Math.max(2, items.length) });
  if (recomputed.contract !== receipt.reviewContract || recomputed.evidence.similarityModel !== receipt.similarityModel) throw new Error("Work media diversity similarity model drifted.");
  if (JSON.stringify(recomputed.evidence) !== JSON.stringify(receipt.evidence)) throw new Error("Work media diversity evidence changed on recomputation.");
  return { ok: true, receiptPath: receiptFile.path, receiptSha256: receiptFile.sha256, receiptByteLength: receiptFile.byteLength, evidenceRecomputedAndMatched: true, colorAwareSimilarityReverified: true, evidence: recomputed.evidence, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false };
}

const tools = [
  { name: "evavo_work_media_diversity_capabilities", description: "Describe read-only color-aware cross-route Work media duplicate and visual-repetition QA.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_review_work_media_diversity", description: "Compare exact bytes plus independent shape, tone and spatial RGB similarity across Work headers, tiles and support images. Optionally write a create-only review receipt; never selects or publishes imagery.", inputSchema: { type: "object", properties: { items: { type: "array", minItems: 2, maxItems: 96, items: { type: "object", properties: { id: { type: "string" }, path: { type: "string" }, route: { type: "string" }, role: { type: "string", enum: ["header", "tile", "support", "other"] } }, required: ["id", "path"], additionalProperties: false } }, nearDuplicateThreshold: { type: "number", minimum: 0, maximum: 1 }, reviewSimilarityThreshold: { type: "number", minimum: 0, maximum: 1 }, maximumImages: { type: "integer", minimum: 2, maximum: 96 }, receiptPath: { type: "string" }, confirmLocalWrite: { type: "boolean" } }, required: ["items"], additionalProperties: false } },
  { name: "evavo_verify_work_media_diversity", description: "Re-read every source binding and recompute the color-aware durable Work media diversity receipt. Read-only.", inputSchema: { type: "object", properties: { receiptPath: { type: "string" } }, required: ["receiptPath"], additionalProperties: false } },
];

function capabilities() {
  return { contract: "evavo.work-media-diversity.v1_1", serverVersion: SERVER_VERSION, similarityModel: "dhash-ahash-rgb-grid-v1", exactBinaryDuplicateDetection: true, perceptualNearDuplicateDetection: true, colorAwarePerceptualSimilarity: true, spatialColorGridEvidence: true, grayscaleRecolorCollisionResistance: true, componentSimilarityEvidence: true, crossRouteRepetitionDetection: true, duplicateClusterEvidence: true, durableReceiptAvailable: true, staleSourceReverification: true, colorAwareSimilarityReverification: true, visualReviewRequired: true, automaticReplacementAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false, allowedRootCount: configuredLocalRootCount(ROOTS_ENV), writesEnabled: writesEnabled() };
}
async function callTool(name, args) {
  if (name === "evavo_work_media_diversity_capabilities") return capabilities();
  if (name === "evavo_review_work_media_diversity") return review(args ?? {});
  if (name === "evavo_verify_work_media_diversity") return verify(args ?? {});
  throw new Error(`Unknown tool ${name}`);
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
    else outgoing = response(message.id, toolResult({ ok: false, message: `Unsupported method ${message.method}` }, true));
    if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`);
  } catch (error) { process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: String(error) }, true)))}\n`); }
}
