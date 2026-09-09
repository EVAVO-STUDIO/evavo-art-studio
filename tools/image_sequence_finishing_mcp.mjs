#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { createImageSequenceFinishingReview } from "../packages/media/dist/image-sequence-finishing-review.js";
import {
  assertAllowedLocalPath,
  configuredLocalRootCount,
} from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-image-sequence-finishing";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_IMAGE_SEQUENCE_ALLOWED_ROOTS";
const MAX_FRAMES = 128;
const MAX_REFERENCES = 32;

const ROLE_VALUES = Object.freeze([
  "work-header",
  "support-image",
  "tile",
  "logo",
  "ui",
  "photo",
  "sprite",
  "illustration",
  "texture",
]);
const PROFILE_VALUES = Object.freeze([
  "web-hero",
  "logo-transparent",
  "product-cutout",
  "ui-screenshot",
  "photo",
  "pixel-art",
  "cel-animation-frame",
  "illustration",
  "texture",
]);
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
  label: "image sequence finishing",
});

async function loadReferences(entries) {
  if (entries === undefined) return [];
  if (!Array.isArray(entries) || entries.length > MAX_REFERENCES) throw new Error(`approvedReferences may contain at most ${MAX_REFERENCES} entries.`);
  const seen = new Set();
  const loaded = [];
  for (const entry of entries) {
    if (!entry || typeof entry.id !== "string" || !entry.id.trim() || typeof entry.path !== "string") throw new Error("Every approved reference requires id and path.");
    if (seen.has(entry.id)) throw new Error(`Duplicate approved reference id ${JSON.stringify(entry.id)}.`);
    seen.add(entry.id);
    const resolved = await assertAllowed(entry.path);
    loaded.push(Object.freeze({ id: entry.id, path: resolved, encoded: await readFile(resolved) }));
  }
  return loaded;
}

async function loadFrames(entries, args) {
  if (!Array.isArray(entries) || entries.length < 2 || entries.length > MAX_FRAMES) throw new Error(`frames must contain 2 through ${MAX_FRAMES} entries.`);
  const seen = new Set();
  const loaded = [];
  for (const entry of entries) {
    if (!entry || typeof entry.id !== "string" || !entry.id.trim() || typeof entry.path !== "string") throw new Error("Every frame requires id and path.");
    if (seen.has(entry.id)) throw new Error(`Duplicate frame id ${JSON.stringify(entry.id)}.`);
    seen.add(entry.id);
    const resolved = await assertAllowed(entry.path);
    loaded.push(Object.freeze({
      id: entry.id,
      path: resolved,
      encoded: await readFile(resolved),
      ...(Number.isFinite(entry.durationMs) ? { durationMs: entry.durationMs } : {}),
      reviewContext: Object.freeze({
        ...(typeof args.intendedRole === "string" ? { intendedRole: args.intendedRole } : {}),
        ...(typeof args.profile === "string" ? { declaredProfile: args.profile } : {}),
        filename: typeof entry.filename === "string" ? entry.filename : resolved,
      }),
      ...(Array.isArray(entry.visualFindings) && entry.visualFindings.length ? { visualFindings: entry.visualFindings } : {}),
    }));
  }
  return loaded;
}

function compactPacket(packet) {
  return Object.freeze({
    disposition: packet.disposition,
    priority: packet.priority,
    technicalDecision: packet.technicalReview.decision,
    quality: Object.freeze({
      grade: packet.technicalReview.quality.grade,
      score: packet.technicalReview.quality.score,
      width: packet.technicalReview.quality.width,
      height: packet.technicalReview.quality.height,
      hasAlpha: packet.technicalReview.quality.hasAlpha,
    }),
    artifactRisk: Object.freeze({
      posterizationRisk: packet.technicalReview.artifactSignals.posterizationRisk,
      nearestNeighbourUpscaleRisk: packet.technicalReview.artifactSignals.nearestNeighbourUpscaleRisk,
      ringingRiskRatio: packet.technicalReview.artifactSignals.ringingRiskRatio,
      repeatedDetailRisk: packet.technicalReview.generatedDetailRisk.repeatedDetailRisk,
      detailImbalanceRisk: packet.technicalReview.generatedDetailRisk.detailImbalanceRisk,
    }),
    repairDecision: packet.repairDecision,
    referenceConsistency: packet.referenceConsistency ? Object.freeze({
      grade: packet.referenceConsistency.grade,
      decision: packet.referenceConsistency.decision,
      distance: packet.referenceConsistency.distance,
      flags: packet.referenceConsistency.flags,
    }) : null,
    reasonCodes: packet.reasonCodes,
    recommendedNextTools: packet.recommendedNextTools,
  });
}

async function reviewSequence(args) {
  const frames = await loadFrames(args.frames, args);
  const references = await loadReferences(args.approvedReferences);
  const result = await createImageSequenceFinishingReview(
    frames.map((frame) => ({
      id: frame.id,
      encoded: frame.encoded,
      ...(frame.durationMs !== undefined ? { durationMs: frame.durationMs } : {}),
      reviewContext: frame.reviewContext,
      ...(frame.visualFindings ? { visualFindings: frame.visualFindings } : {}),
    })),
    {
      ...(references.length ? { approvedReferences: references.map((reference) => ({ id: reference.id, encoded: reference.encoded })) } : {}),
      ...(Number.isFinite(args.maximumLumaDelta) ? { maximumLumaDelta: args.maximumLumaDelta } : {}),
      ...(Number.isFinite(args.maximumContrastDelta) ? { maximumContrastDelta: args.maximumContrastDelta } : {}),
      ...(Number.isFinite(args.maximumSharpnessRatio) ? { maximumSharpnessRatio: args.maximumSharpnessRatio } : {}),
      ...(Number.isFinite(args.maximumVisibleMassDelta) ? { maximumVisibleMassDelta: args.maximumVisibleMassDelta } : {}),
      ...(Number.isFinite(args.maximumQualityScoreDelta) ? { maximumQualityScoreDelta: args.maximumQualityScoreDelta } : {}),
      ...(typeof args.duplicateNeighborPolicy === "string" ? { duplicateNeighborPolicy: args.duplicateNeighborPolicy } : {}),
    },
  );
  const packetById = new Map(result.batch.items.map((item) => [item.id, item.packet]));
  const pathById = new Map(frames.map((frame) => [frame.id, frame.path]));
  return Object.freeze({
    ok: true,
    contract: result.contract,
    frameCount: result.frameCount,
    sequenceDecision: result.sequenceDecision,
    baseline: result.baseline,
    setWarnings: result.setWarnings,
    reviewPriority: result.reviewPriority,
    referenceCount: result.batch.referenceCount,
    referenceCoherence: result.batch.referenceCoherence,
    summary: result.batch.summary,
    frames: Object.freeze(result.frames.map((frame) => Object.freeze({
      ...frame,
      path: pathById.get(frame.id),
      packet: compactPacket(packetById.get(frame.id)),
    }))),
    neighbors: result.neighbors,
    approvedReferencePaths: Object.freeze(references.map((reference) => ({ id: reference.id, path: reference.path }))),
    visualReviewRequired: true,
    automaticPromotionAllowed: false,
    sourcesModified: false,
    bytesReturned: false,
  });
}

const referenceSchema = Object.freeze({
  type: "object",
  properties: { id: { type: "string", minLength: 1 }, path: { type: "string", minLength: 1 } },
  required: ["id", "path"],
  additionalProperties: false,
});
const visualFindingsSchema = Object.freeze({
  type: "array",
  maxItems: 32,
  uniqueItems: true,
  items: { type: "string", enum: VISUAL_FINDINGS },
});
const frameSchema = Object.freeze({
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
    path: { type: "string", minLength: 1 },
    filename: { type: "string", minLength: 1 },
    durationMs: { type: "number", exclusiveMinimum: 0, maximum: 60000 },
    visualFindings: visualFindingsSchema,
  },
  required: ["id", "path"],
  additionalProperties: false,
});

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_image_sequence_finishing_capabilities",
    description: "Describe read-only sequence finishing review combining per-frame finishing decisions, technical continuity and neighbor similarity evidence.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_review_image_sequence_finishing",
    description: "Review 2-128 ordered frames with per-frame repair priority, optional approved-reference consistency, technical continuity and adjacent-frame duplicate/near-duplicate evidence. Does not decide pose acting or semantic motion quality.",
    inputSchema: {
      type: "object",
      properties: {
        frames: { type: "array", minItems: 2, maxItems: MAX_FRAMES, items: frameSchema },
        approvedReferences: { type: "array", maxItems: MAX_REFERENCES, items: referenceSchema },
        intendedRole: { type: "string", enum: ROLE_VALUES },
        profile: { type: "string", enum: PROFILE_VALUES },
        maximumLumaDelta: { type: "number", minimum: 0 },
        maximumContrastDelta: { type: "number", minimum: 0 },
        maximumSharpnessRatio: { type: "number", minimum: 1 },
        maximumVisibleMassDelta: { type: "number", minimum: 0 },
        maximumQualityScoreDelta: { type: "number", minimum: 0 },
        duplicateNeighborPolicy: { type: "string", enum: ["ignore", "warn"] },
      },
      required: ["frames"],
      additionalProperties: false,
    },
  }),
]);

async function callTool(name, args) {
  if (name === "evavo_image_sequence_finishing_capabilities") {
    return Object.freeze({
      contract: "evavo_image_sequence_finishing_agent_v1",
      mode: "read-only-sequence-finishing-review",
      tools: tools.map((tool) => tool.name),
      maximumFrames: MAX_FRAMES,
      maximumApprovedReferences: MAX_REFERENCES,
      combines: [
        "per-frame finishing disposition and repair routing",
        "approved-reference consistency when supplied",
        "canvas/aspect/alpha/quality/luma/contrast/sharpness/visible-mass continuity",
        "adjacent-frame perceptual similarity",
        "duplicate-or-held-frame review evidence",
      ],
      boundaries: [
        "duplicate frames can be intentional holds",
        "technical continuity does not establish pose arc, acting, identity or semantic motion quality",
        "image-origin detection is not claimed",
        "automatic promotion is never allowed",
      ],
      allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
      sourceMutationAllowed: false,
      bytesReturned: false,
    });
  }
  if (name === "evavo_review_image_sequence_finishing") return reviewSequence(args ?? {});
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
        instructions: `Sequence finishing review is read-only. Configure ${ALLOWED_ROOTS_ENV}; the result ranks frames for review but never edits or approves them.`,
      },
    };
  }
  if (request.method === "ping") return { jsonrpc: "2.0", id: request.id, result: {} };
  if (request.method === "tools/list") return { jsonrpc: "2.0", id: request.id, result: { tools } };
  if (request.method === "tools/call") {
    try {
      return { jsonrpc: "2.0", id: request.id, result: result(await callTool(request.params?.name, request.params?.arguments)) };
    } catch (error) {
      return { jsonrpc: "2.0", id: request.id, result: result({ code: "IMAGE_SEQUENCE_FINISHING_FAILED", message: error instanceof Error ? error.message : String(error) }, true) };
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
