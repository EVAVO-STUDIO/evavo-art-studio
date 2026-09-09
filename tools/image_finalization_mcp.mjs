#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { reviewImageFinalization } from "../packages/media/dist/index.js";
import {
  assertAllowedLocalPath,
  configuredLocalRootCount,
} from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-image-finalization";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_IMAGE_FINALIZATION_ALLOWED_ROOTS";
const MAX_REFERENCES = 32;

const TARGETS = Object.freeze(["web", "game-art", "game-data-map", "print", "archive"]);
const FORMATS = Object.freeze(["png", "jpeg", "webp", "avif", "tiff"]);
const ROLES = Object.freeze(["work-header", "support-image", "tile", "logo", "ui", "photo", "sprite", "illustration", "texture"]);
const PROFILES = Object.freeze(["web-hero", "logo-transparent", "product-cutout", "ui-screenshot", "photo", "pixel-art", "cel-animation-frame", "illustration", "texture"]);
const VISUAL_FINDINGS = Object.freeze([
  "broken-anatomy",
  "malformed-text",
  "identity-drift",
  "style-mismatch",
  "wrong-composition",
  "wrong-content",
  "perspective-error",
  "repeated-structure",
  "nonsensical-detail",
  "unknown-semantic-defect",
]);

const assertAllowed = (filePath) => assertAllowedLocalPath(filePath, {
  envName: ALLOWED_ROOTS_ENV,
  output: false,
  label: "image finalization",
});

async function loadReferences(entries) {
  if (entries === undefined) return [];
  if (!Array.isArray(entries) || entries.length > MAX_REFERENCES) throw new Error(`approvedReferences may contain at most ${MAX_REFERENCES} entries.`);
  const seen = new Set();
  const loaded = [];
  for (const entry of entries) {
    if (!entry || typeof entry.id !== "string" || !entry.id.trim() || typeof entry.path !== "string") {
      throw new Error("Every approvedReferences entry requires a non-empty id and path.");
    }
    if (seen.has(entry.id)) throw new Error(`Duplicate approved reference id ${JSON.stringify(entry.id)}.`);
    seen.add(entry.id);
    const resolved = await assertAllowed(entry.path);
    loaded.push(Object.freeze({ id: entry.id, path: resolved, encoded: await readFile(resolved) }));
  }
  return loaded;
}

function compactReference(review) {
  if (!review) return null;
  return Object.freeze({
    grade: review.grade,
    decision: review.decision,
    referenceCount: review.referenceCount,
    referenceCoherence: review.referenceCoherence,
    distance: review.distance,
    nearestReferences: review.nearestReferences,
    flags: review.flags,
    semanticReviewRequired: review.semanticReviewRequired,
    aiOriginDetection: review.aiOriginDetection,
  });
}

function compactFinishing(packet) {
  return Object.freeze({
    disposition: packet.disposition,
    priority: packet.priority,
    repairDecision: packet.repairDecision,
    technicalReview: Object.freeze({
      profile: packet.technicalReview.profile,
      decision: packet.technicalReview.decision,
      blockers: packet.technicalReview.blockers,
      warnings: packet.technicalReview.warnings,
      quality: Object.freeze({
        grade: packet.technicalReview.quality.grade,
        score: packet.technicalReview.quality.score,
        width: packet.technicalReview.quality.width,
        height: packet.technicalReview.quality.height,
        hasAlpha: packet.technicalReview.quality.hasAlpha,
      }),
      artifactSignals: Object.freeze({
        ringingRiskRatio: packet.technicalReview.artifactSignals.ringingRiskRatio,
        posterizationRisk: packet.technicalReview.artifactSignals.posterizationRisk,
        nearestNeighbourUpscaleRisk: packet.technicalReview.artifactSignals.nearestNeighbourUpscaleRisk,
      }),
      generatedDetailRisk: Object.freeze({
        repeatedDetailRisk: packet.technicalReview.generatedDetailRisk.repeatedDetailRisk,
        detailImbalanceRisk: packet.technicalReview.generatedDetailRisk.detailImbalanceRisk,
        warnings: packet.technicalReview.generatedDetailRisk.warnings,
      }),
    }),
    referenceConsistency: compactReference(packet.referenceConsistency),
    reasonCodes: packet.reasonCodes,
    requiresHumanVisualReview: packet.requiresHumanVisualReview,
    automaticPromotionAllowed: packet.automaticPromotionAllowed,
    originAssessment: packet.originAssessment,
  });
}

function deliverySpec(args) {
  return {
    target: args.target,
    ...(typeof args.intendedFormat === "string" ? { intendedFormat: args.intendedFormat } : {}),
    ...(typeof args.requireAlpha === "boolean" ? { requireAlpha: args.requireAlpha } : {}),
    ...(typeof args.forbidAlpha === "boolean" ? { forbidAlpha: args.forbidAlpha } : {}),
    ...(Number.isFinite(args.outputWidthMm) ? { outputWidthMm: args.outputWidthMm } : {}),
    ...(Number.isFinite(args.outputHeightMm) ? { outputHeightMm: args.outputHeightMm } : {}),
    ...(Number.isFinite(args.minimumPrintDpi) ? { minimumPrintDpi: args.minimumPrintDpi } : {}),
    ...(typeof args.allowEmbeddedMetadata === "boolean" ? { allowEmbeddedMetadata: args.allowEmbeddedMetadata } : {}),
    ...(typeof args.allowOrientationMetadata === "boolean" ? { allowOrientationMetadata: args.allowOrientationMetadata } : {}),
    ...(Number.isFinite(args.maximumMegapixels) ? { maximumMegapixels: args.maximumMegapixels } : {}),
    ...(Number.isSafeInteger(args.maximumBytes) ? { maximumBytes: args.maximumBytes } : {}),
  };
}

async function reviewFinalization(args) {
  if (typeof args.inputPath !== "string") throw new Error("inputPath is required.");
  if (!TARGETS.includes(args.target)) throw new Error("A supported target is required.");
  const inputPath = await assertAllowed(args.inputPath);
  const references = await loadReferences(args.approvedReferences);
  const result = await reviewImageFinalization(await readFile(inputPath), {
    finishing: {
      reviewContext: {
        ...(typeof args.intendedRole === "string" ? { intendedRole: args.intendedRole } : {}),
        ...(typeof args.profile === "string" ? { declaredProfile: args.profile } : {}),
        filename: typeof args.filename === "string" ? args.filename : inputPath,
      },
      ...(references.length ? { approvedReferences: references.map((reference) => ({ id: reference.id, encoded: reference.encoded })) } : {}),
      ...(Array.isArray(args.visualFindings) && args.visualFindings.length ? { visualFindings: args.visualFindings } : {}),
    },
    delivery: deliverySpec(args),
  });

  return Object.freeze({
    ok: true,
    inputPath,
    decision: result.decision,
    finishing: compactFinishing(result.finishing),
    delivery: result.delivery,
    blockers: result.blockers,
    warnings: result.warnings,
    reasonCodes: result.reasonCodes,
    recommendedNextTools: result.recommendedNextTools,
    approvedReferencePaths: Object.freeze(references.map((reference) => ({ id: reference.id, path: reference.path }))),
    requiresHumanVisualReview: result.requiresHumanVisualReview,
    automaticPromotionAllowed: result.automaticPromotionAllowed,
    sourceMutationAllowed: result.sourceMutationAllowed,
    bytesReturned: false,
    sourceModified: false,
  });
}

const referenceSchema = Object.freeze({
  type: "object",
  properties: { id: { type: "string", minLength: 1 }, path: { type: "string", minLength: 1 } },
  required: ["id", "path"],
  additionalProperties: false,
});

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_image_finalization_capabilities",
    description: "Describe the read-only finalization admission surface combining finishing review with destination/container integrity.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_review_image_finalization",
    description: "Perform final read-only admission for one raster candidate. Returns blocked, needs-image-finishing, needs-delivery-review or ready-for-approval-review; never edits or promotes the image.",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: { type: "string", minLength: 1 },
        filename: { type: "string", minLength: 1 },
        intendedRole: { type: "string", enum: ROLES },
        profile: { type: "string", enum: PROFILES },
        visualFindings: { type: "array", maxItems: 32, uniqueItems: true, items: { type: "string", enum: VISUAL_FINDINGS } },
        approvedReferences: { type: "array", maxItems: MAX_REFERENCES, items: referenceSchema },
        target: { type: "string", enum: TARGETS },
        intendedFormat: { type: "string", enum: FORMATS },
        requireAlpha: { type: "boolean" },
        forbidAlpha: { type: "boolean" },
        outputWidthMm: { type: "number", exclusiveMinimum: 0 },
        outputHeightMm: { type: "number", exclusiveMinimum: 0 },
        minimumPrintDpi: { type: "number", exclusiveMinimum: 0 },
        allowEmbeddedMetadata: { type: "boolean" },
        allowOrientationMetadata: { type: "boolean" },
        maximumMegapixels: { type: "number", exclusiveMinimum: 0 },
        maximumBytes: { type: "integer", minimum: 1 },
      },
      required: ["inputPath", "target"],
      additionalProperties: false,
    },
  }),
]);

async function callTool(name, args) {
  if (name === "evavo_image_finalization_capabilities") {
    return Object.freeze({
      contract: "evavo_image_finalization_agent_v1",
      mode: "read-only-final-admission",
      tools: tools.map((tool) => tool.name),
      decisions: ["blocked", "needs-image-finishing", "needs-delivery-review", "ready-for-approval-review"],
      targets: TARGETS,
      combines: [
        "unified finishing packet",
        "artifact/generated-detail triage",
        "repair routing",
        "optional approved-reference consistency",
        "format/alpha/colour/orientation/metadata/size delivery integrity",
        "optional print physical-DPI proof",
      ],
      guarantees: Object.freeze({
        writesFiles: false,
        sourceMutationAllowed: false,
        automaticPromotionAllowed: false,
        humanVisualReviewRequired: true,
        readyMeansReadyForApprovalReviewNotApproved: true,
      }),
      maximumApprovedReferences: MAX_REFERENCES,
      allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
      bytesReturned: false,
    });
  }
  if (name === "evavo_review_image_finalization") return reviewFinalization(args ?? {});
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}

function result(value, isError = false) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value, isError };
}

async function dispatch(request) {
  if (request?.jsonrpc !== "2.0") return { jsonrpc: "2.0", id: request?.id ?? null, error: { code: -32600, message: "Invalid Request" } };
  if (request.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions: `Finalization admission is read-only. Configure ${ALLOWED_ROOTS_ENV}; a ready result means ready for explicit approval review, never auto-approved.`,
      },
    };
  }
  if (request.method === "ping") return { jsonrpc: "2.0", id: request.id, result: {} };
  if (request.method === "tools/list") return { jsonrpc: "2.0", id: request.id, result: { tools } };
  if (request.method === "tools/call") {
    try {
      return { jsonrpc: "2.0", id: request.id, result: result(await callTool(request.params?.name, request.params?.arguments)) };
    } catch (error) {
      return { jsonrpc: "2.0", id: request.id, result: result({ code: "IMAGE_FINALIZATION_FAILED", message: error instanceof Error ? error.message : String(error) }, true) };
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
    try { request = JSON.parse(line); } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
      return;
    }
    const response = await dispatch(request);
    if (response !== null) process.stdout.write(`${JSON.stringify(response)}\n`);
  });
});
