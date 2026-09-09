#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import {
  createImageReferenceConsistencyProof,
  reviewImageReferenceConsistency,
  reviewImageReferenceConsistencyBatch,
} from "../packages/media/dist/index.js";
import {
  assertAllowedLocalPath,
  configuredLocalRootCount,
} from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-image-reference-consistency";
const SERVER_VERSION = "1.1.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_IMAGE_CONSISTENCY_ALLOWED_ROOTS";
const WRITE_ENV = "EVAVO_IMAGE_CONSISTENCY_ALLOW_WRITES";
const MAX_REFERENCES = 32;
const MAX_CANDIDATES = 128;

const assertAllowed = (filePath, { output = false } = {}) => assertAllowedLocalPath(filePath, {
  envName: ALLOWED_ROOTS_ENV,
  output,
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

function proofSpec(args) {
  return {
    ...consistencySpec(args),
    ...(Number.isInteger(args.tileSize) ? { tileSize: args.tileSize } : {}),
    ...(Number.isInteger(args.columns) ? { columns: args.columns } : {}),
    ...(Number.isInteger(args.maximumReferenceCards) ? { maximumReferenceCards: args.maximumReferenceCards } : {}),
    ...(Number.isInteger(args.maximumCandidateCards) ? { maximumCandidateCards: args.maximumCandidateCards } : {}),
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

function requireWriteAdmission(args) {
  if (process.env[WRITE_ENV] !== "true") {
    throw new Error(`Image reference consistency writes are disabled. Set ${WRITE_ENV}=true.`);
  }
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required for this exact proof write.");
}

function identity(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

async function assertCreateOnly(filePaths) {
  for (const filePath of filePaths) {
    try {
      await access(filePath);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") continue;
      throw error;
    }
    throw new Error(`Create-only consistency proof target already exists: ${filePath}`);
  }
}

async function createOnly(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, { flag: "wx" });
}

async function createProof(args) {
  requireWriteAdmission(args);
  if (typeof args.outputPath !== "string") throw new Error("outputPath is required.");
  if (path.extname(args.outputPath).toLowerCase() !== ".png") throw new Error("outputPath must end in .png.");
  const candidates = await loadEntries(args.candidates, "candidates", MAX_CANDIDATES);
  const references = await loadEntries(args.references, "references", MAX_REFERENCES);
  const outputPath = await assertAllowed(args.outputPath, { output: true });
  const receiptPath = await assertAllowed(
    typeof args.receiptPath === "string" ? args.receiptPath : `${outputPath}.receipt.json`,
    { output: true },
  );
  const sourcePaths = [...candidates.map((item) => item.path), ...references.map((item) => item.path)];
  const sourceIds = new Set(sourcePaths.map(identity));
  if (sourceIds.has(identity(outputPath)) || sourceIds.has(identity(receiptPath))) {
    throw new Error("Consistency proof outputs must differ from every candidate/reference source path.");
  }
  if (identity(outputPath) === identity(receiptPath)) throw new Error("Consistency proof output and receipt paths must be distinct.");
  await assertCreateOnly([outputPath, receiptPath]);

  const proof = await createImageReferenceConsistencyProof(
    candidates.map((candidate) => ({ id: candidate.id, encoded: candidate.encoded })),
    references.map((reference) => ({ id: reference.id, encoded: reference.encoded })),
    proofSpec(args),
  );
  const receipt = Object.freeze({
    schemaVersion: "1.1",
    operation: "evavo-image-reference-consistency-proof",
    approvalState: "diagnostic-only",
    outputPath,
    receiptPath,
    candidatePaths: candidates.map((item) => ({ id: item.id, path: item.path })),
    referencePaths: references.map((item) => ({ id: item.id, path: item.path })),
    evidence: proof.evidence,
    semanticReviewRequired: true,
    aiOriginDetection: "not-claimed",
    sourceModified: false,
  });
  await createOnly(outputPath, proof.png);
  await createOnly(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return Object.freeze({
    ok: true,
    outputPath,
    receiptPath,
    evidence: proof.evidence,
    approvalState: "diagnostic-only",
    sourceModified: false,
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
    description: "Describe approved-reference visual consistency review and optional guarded diagnostic proof generation.",
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
  Object.freeze({
    name: "evavo_create_image_reference_consistency_proof",
    description: "Create a bounded PNG diagnostic proof containing approved references and the strongest candidate visual-drift outliers, plus a JSON receipt. Write-gated, create-only and diagnostic-only.",
    inputSchema: {
      type: "object",
      properties: {
        candidates: { type: "array", minItems: 1, maxItems: MAX_CANDIDATES, items: pathEntrySchema },
        references: { type: "array", minItems: 1, maxItems: MAX_REFERENCES, items: pathEntrySchema },
        ...specProperties,
        tileSize: { type: "integer", minimum: 96, maximum: 384 },
        columns: { type: "integer", minimum: 1, maximum: 8 },
        maximumReferenceCards: { type: "integer", minimum: 1, maximum: 16 },
        maximumCandidateCards: { type: "integer", minimum: 1, maximum: 48 },
        outputPath: { type: "string", minLength: 1 },
        receiptPath: { type: "string", minLength: 1 },
        confirmLocalWrite: { type: "boolean", const: true },
      },
      required: ["candidates", "references", "outputPath", "confirmLocalWrite"],
      additionalProperties: false,
    },
  }),
]);

async function callTool(name, args) {
  if (name === "evavo_image_reference_consistency_capabilities") {
    return Object.freeze({
      contract: "evavo_image_reference_consistency_agent_v1_1",
      mode: "read-only-review-plus-write-gated-diagnostic-proof",
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
      proof: Object.freeze({
        format: "png",
        createsReceipt: true,
        strongestOutliersFirst: true,
        diagnosticOnly: true,
        createOnly: true,
      }),
      boundaries: [
        "does not prove semantic character or object identity",
        "does not prove artistic correctness",
        "does not detect AI authorship",
        "reference-set instability prevents confident rejection",
      ],
      writesEnabled: process.env[WRITE_ENV] === "true",
      allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
      sourceMutationAllowed: false,
      bytesReturned: false,
    });
  }
  if (name === "evavo_review_image_against_references") return reviewOne(args ?? {});
  if (name === "evavo_review_image_batch_against_references") return reviewBatch(args ?? {});
  if (name === "evavo_create_image_reference_consistency_proof") return createProof(args ?? {});
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
        instructions: `Approved-reference reviews are read-only. Configure ${ALLOWED_ROOTS_ENV}; optional diagnostic proof writes additionally require ${WRITE_ENV}=true and confirmLocalWrite=true.`,
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
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
      return;
    }
    const response = await dispatch(request);
    if (response !== null) process.stdout.write(`${JSON.stringify(response)}\n`);
  });
});
