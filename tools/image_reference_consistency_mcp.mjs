#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import readline from "node:readline";

import {
  reviewImageReferenceConsistency,
  reviewImageReferenceConsistencyBatch,
} from "../packages/media/dist/index.js";
import {
  assertAllowedLocalPath,
  configuredLocalRootCount,
} from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-image-reference-consistency";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_IMAGE_CONSISTENCY_ALLOWED_ROOTS";
const MAX_REFERENCES = 32;
const MAX_CANDIDATES = 128;

const assertAllowed = (filePath) => assertAllowedLocalPath(filePath, {
  envName: ALLOWED_ROOTS_ENV,
  output: false,
  label: "image reference consistency",
});

function consistencySpec(args) {
  return {
    ...(Number.isInteger(args.sampleSize) ? { sampleSize: args.sampleSize } : {}),
    ...(Number.isFinite(args.warnDistance) ? { warnDistance: args.warnDistance } : {}),
    ...(Number.isFinite(args.failDistance) ? { failDistance: args.failDistance } : {}),
    ...(Number.isFinite(args.referenceUnstableDistance) ? { referenceUnstableDistance: args.referenceUnstableDistance } : {}),
    ...(Number.isInteger(args.alphaVisibleThreshold) ? { alphaVisibleThreshold: args.alphaVisibleThreshold } : {}),
  };
}

async function loadEntries(entries, label, maximum) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > maximum) {
    throw new Error(`${label} must contain 1 through ${maximum} entries.`);
  }
  const seen = new Set();
  const loaded = [];
  for (const entry of entries) {
    if (!entry || typeof entry.id !== "string" || !entry.id.trim() || typeof entry.path !== "string") {
      throw new Error(`Every ${label} entry requires a non-empty id and path.`);
    }
    if (seen.has(entry.id)) throw new Error(`Duplicate ${label} id ${JSON.stringify(entry.id)}.`);
    seen.add(entry.id);
    const resolved = await assertAllowed(entry.path);
    loaded.push(Object.freeze({ id: entry.id, path: resolved, encoded: await readFile(resolved) }));
  }
  return loaded;
}

function compactDescriptor(value) {
  return Object.freeze({
    width: value.width,
    height: value.height,
    aspectRatio: value.aspectRatio,
    hasTransparency: value.hasTransparency,
    visiblePixelRatio: value.visiblePixelRatio,
    visibleCentroidX: value.visibleCentroidX,
    visibleCentroidY: value.visibleCentroidY,
    visibleBoundsWidth: value.visibleBoundsWidth,
    visibleBoundsHeight: value.visibleBoundsHeight,
    lumaMean: value.lumaMean,
    lumaStdDev: value.lumaStdDev,
    saturationMean: value.saturationMean,
    edgeDensity: value.edgeDensity,
  });
}

function compactReview(review) {
  return Object.freeze({
    contract: review.contract,
    grade: review.grade,
    decision: review.decision,
    candidate: compactDescriptor(review.candidate),
    referenceCount: review.referenceCount,
    referenceCoherence: review.referenceCoherence,
    baseline: compactDescriptor(review.baseline),
    distance: review.distance,
    nearestReferences: review.nearestReferences,
    flags: review.flags,
    interpretation: review.interpretation,
    semanticReviewRequired: review.semanticReviewRequired,
    aiOriginDetection: review.aiOriginDetection,
  });
}

async function reviewOne(args) {
  if (typeof args.candidatePath !== "string") throw new Error("candidatePath is required.");
  const candidatePath = await assertAllowed(args.candidatePath);
  const references = await loadEntries(args.references, "references", MAX_REFERENCES);
  const review = await reviewImageReferenceConsistency(
    await readFile(candidatePath),
    references.map((reference) => ({ id: reference.id, encoded: reference.encoded })),
    consistencySpec(args),
  );
  return Object.freeze({
    ok: true,
    candidatePath,
    referencePaths: Object.freeze(references.map((reference) => ({ id: reference.id, path: reference.path }))),
    review: compactReview(review),
    sourceModified: false,
    bytesReturned: false,
  });
}

async function reviewBatch(args) {
  const candidates = await loadEntries(args.candidates, "candidates", MAX_CANDIDATES);
  const references = await loadEntries(args.references, "references", MAX_REFERENCES);
  const batch = await reviewImageReferenceConsistencyBatch(
    candidates.map((candidate) => ({ id: candidate.id, encoded: candidate.encoded })),
    references.map((reference) => ({ id: reference.id, encoded: reference.encoded })),
    consistencySpec(args),
  );
  return Object.freeze({
    ok: true,
    referenceCount: batch.referenceCount,
    referenceCoherence: batch.referenceCoherence,
    results: Object.freeze(batch.results.map((item) => Object.freeze({ id: item.id, review: compactReview(item.review) }))),
    reviewPriority: batch.reviewPriority,
    semanticReviewRequired: true,
    aiOriginDetection: "not-claimed",
    sourcesModified: false,
    bytesReturned: false,
  });
}

const pathEntrySchema = Object.freeze({
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
    path: { type: "string", minLength: 1 },
  },
  required: ["id", "path"],
  additionalProperties: false,
});

const specProperties = Object.freeze({
  sampleSize: { type: "integer", minimum: 32, maximum: 192 },
  warnDistance: { type: "number", minimum: 0.01, maximum: 0.9 },
  failDistance: { type: "number", minimum: 0.02, maximum: 1 },
  referenceUnstableDistance: { type: "number", minimum: 0.02, maximum: 1 },
  alphaVisibleThreshold: { type: "integer", minimum: 0, maximum: 254 },
});

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_image_reference_consistency_capabilities",
    description: "Describe read-only approved-reference visual consistency analysis for individual images and batches.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_review_image_against_references",
    description: "Compare one image with 1-32 approved references using deterministic palette/tone, edge/detail, silhouette/occupancy and framing evidence. This is not semantic identity recognition or AI-origin detection.",
    inputSchema: {
      type: "object",
      properties: {
        candidatePath: { type: "string", minLength: 1 },
        references: { type: "array", minItems: 1, maxItems: MAX_REFERENCES, items: pathEntrySchema },
        ...specProperties,
      },
      required: ["candidatePath", "references"],
      additionalProperties: false,
    },
  }),
  Object.freeze({
    name: "evavo_review_image_batch_against_references",
    description: "Review 1-128 candidate frames/images against one approved reference set and rank the strongest visual-style outliers for human inspection.",
    inputSchema: {
      type: "object",
      properties: {
        candidates: { type: "array", minItems: 1, maxItems: MAX_CANDIDATES, items: pathEntrySchema },
        references: { type: "array", minItems: 1, maxItems: MAX_REFERENCES, items: pathEntrySchema },
        ...specProperties,
      },
      required: ["candidates", "references"],
      additionalProperties: false,
    },
  }),
]);

async function callTool(name, args) {
  if (name === "evavo_image_reference_consistency_capabilities") {
    return Object.freeze({
      contract: "evavo_image_reference_consistency_agent_v1",
      mode: "read-only-reference-consistency",
      tools: tools.map((tool) => tool.name),
      maximumReferences: MAX_REFERENCES,
      maximumCandidates: MAX_CANDIDATES,
      signals: [
        "palette-distribution",
        "luminance-and-contrast",
        "saturation",
        "edge-detail-density",
        "edge-orientation-distribution",
        "alpha-silhouette-and-occupancy",
        "aspect-and-canvas-drift",
        "reference-set-coherence",
      ],
      boundaries: [
        "does not prove semantic character or object identity",
        "does not prove artistic correctness",
        "does not detect AI authorship",
        "reference-set instability prevents confident rejection",
      ],
      allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
      sourceMutationAllowed: false,
      bytesReturned: false,
    });
  }
  if (name === "evavo_review_image_against_references") return reviewOne(args ?? {});
  if (name === "evavo_review_image_batch_against_references") return reviewBatch(args ?? {});
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
  if (request?.jsonrpc !== "2.0") {
    return { jsonrpc: "2.0", id: request?.id ?? null, error: { code: -32600, message: "Invalid Request" } };
  }
  if (request.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions: `Read-only approved-reference consistency review. Configure ${ALLOWED_ROOTS_ENV}; image bytes remain local and no source is modified.`,
      },
    };
  }
  if (request.method === "ping") return { jsonrpc: "2.0", id: request.id, result: {} };
  if (request.method === "tools/list") return { jsonrpc: "2.0", id: request.id, result: { tools } };
  if (request.method === "tools/call") {
    try {
      return { jsonrpc: "2.0", id: request.id, result: result(await callTool(request.params?.name, request.params?.arguments)) };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: result({ code: "IMAGE_REFERENCE_CONSISTENCY_FAILED", message: error instanceof Error ? error.message : String(error) }, true),
      };
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
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })\n`);
      return;
    }
    const response = await dispatch(request);
    if (response !== null) process.stdout.write(`${JSON.stringify(response)}\n`);
  });
});
