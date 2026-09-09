#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import readline from "node:readline";

import {
  createImageFinishingReviewBatch,
  createImageFinishingReviewPacket,
} from "../packages/media/dist/index.js";
import {
  assertAllowedLocalPath,
  configuredLocalRootCount,
} from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-image-finishing-packet";
const SERVER_VERSION = "1.1.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_IMAGE_FINISHING_PACKET_ALLOWED_ROOTS";
const MAX_REFERENCES = 32;
const MAX_BATCH = 128;

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
  label: "image finishing packet",
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

async function loadCandidates(entries) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > MAX_BATCH) {
    throw new Error(`candidates must contain 1 through ${MAX_BATCH} entries.`);
  }
  const seen = new Set();
  const loaded = [];
  for (const entry of entries) {
    if (!entry || typeof entry.id !== "string" || !entry.id.trim() || typeof entry.path !== "string") {
      throw new Error("Every candidates entry requires a non-empty id and path.");
    }
    if (seen.has(entry.id)) throw new Error(`Duplicate candidate id ${JSON.stringify(entry.id)}.`);
    seen.add(entry.id);
    const resolved = await assertAllowed(entry.path);
    loaded.push(Object.freeze({
      id: entry.id,
      path: resolved,
      encoded: await readFile(resolved),
      ...(typeof entry.filename === "string" ? { filename: entry.filename } : {}),
      ...(Array.isArray(entry.visualFindings) && entry.visualFindings.length ? { visualFindings: entry.visualFindings } : {}),
    }));
  }
  return loaded;
}

function reviewContext(args, filename) {
  return {
    ...(typeof args.intendedRole === "string" ? { intendedRole: args.intendedRole } : {}),
    ...(typeof args.profile === "string" ? { declaredProfile: args.profile } : {}),
    filename,
  };
}

function compactTechnical(review) {
  return Object.freeze({
    profile: review.profile,
    profileReason: review.profileReason,
    decision: review.decision,
    blockers: review.blockers,
    warnings: review.warnings,
    quality: review.quality,
    defectReview: review.defectReview,
    finishingPlan: review.finishingPlan,
    artifactSignals: review.artifactSignals,
    generatedDetailRisk: review.generatedDetailRisk,
    similarity: review.similarity,
    ...(review.header ? { header: review.header } : {}),
    visualReviewRequired: review.visualReviewRequired,
    visualChecklist: review.visualChecklist,
  });
}

function compactReference(review) {
  if (!review) return null;
  return Object.freeze({
    contract: review.contract,
    grade: review.grade,
    decision: review.decision,
    referenceCount: review.referenceCount,
    referenceCoherence: review.referenceCoherence,
    distance: review.distance,
    nearestReferences: review.nearestReferences,
    flags: review.flags,
    interpretation: review.interpretation,
    semanticReviewRequired: review.semanticReviewRequired,
    aiOriginDetection: review.aiOriginDetection,
  });
}

function compactPacket(packet, { detailed = false } = {}) {
  return Object.freeze({
    contract: packet.contract,
    disposition: packet.disposition,
    priority: packet.priority,
    technicalReview: detailed ? compactTechnical(packet.technicalReview) : Object.freeze({
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
    repairDecision: packet.repairDecision,
    referenceConsistency: compactReference(packet.referenceConsistency),
    reasonCodes: packet.reasonCodes,
    recommendedNextTools: packet.recommendedNextTools,
    requiresHumanVisualReview: packet.requiresHumanVisualReview,
    automaticPromotionAllowed: packet.automaticPromotionAllowed,
    sourceMutationAllowed: packet.sourceMutationAllowed,
    originAssessment: packet.originAssessment,
  });
}

async function reviewPacket(args) {
  if (typeof args.inputPath !== "string") throw new Error("inputPath is required.");
  const inputPath = await assertAllowed(args.inputPath);
  const references = await loadReferences(args.approvedReferences);
  const packet = await createImageFinishingReviewPacket(await readFile(inputPath), {
    reviewContext: reviewContext(args, typeof args.filename === "string" ? args.filename : inputPath),
    ...(references.length ? { approvedReferences: references.map((reference) => ({ id: reference.id, encoded: reference.encoded })) } : {}),
    ...(Array.isArray(args.visualFindings) && args.visualFindings.length ? { visualFindings: args.visualFindings } : {}),
  });

  return Object.freeze({
    ok: true,
    inputPath,
    approvedReferencePaths: Object.freeze(references.map((reference) => ({ id: reference.id, path: reference.path }))),
    packet: compactPacket(packet, { detailed: true }),
    bytesReturned: false,
    sourceModified: false,
  });
}

async function reviewBatch(args) {
  const candidates = await loadCandidates(args.candidates);
  const references = await loadReferences(args.approvedReferences);
  const batch = await createImageFinishingReviewBatch(
    candidates.map((candidate) => ({
      id: candidate.id,
      encoded: candidate.encoded,
      reviewContext: reviewContext(args, candidate.filename ?? candidate.path),
      ...(candidate.visualFindings ? { visualFindings: candidate.visualFindings } : {}),
    })),
    {
      ...(references.length ? { approvedReferences: references.map((reference) => ({ id: reference.id, encoded: reference.encoded })) } : {}),
    },
  );

  const pathById = new Map(candidates.map((candidate) => [candidate.id, candidate.path]));
  return Object.freeze({
    ok: true,
    contract: batch.contract,
    itemCount: batch.itemCount,
    referenceCount: batch.referenceCount,
    referenceCoherence: batch.referenceCoherence,
    reviewPriority: batch.reviewPriority,
    summary: batch.summary,
    items: Object.freeze(batch.items.map((item) => Object.freeze({
      id: item.id,
      path: pathById.get(item.id),
      packet: compactPacket(item.packet),
    }))),
    approvedReferencePaths: Object.freeze(references.map((reference) => ({ id: reference.id, path: reference.path }))),
    requiresHumanVisualReview: batch.requiresHumanVisualReview,
    automaticPromotionAllowed: batch.automaticPromotionAllowed,
    sourcesModified: false,
    bytesReturned: false,
  });
}

const referenceSchema = Object.freeze({
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
    path: { type: "string", minLength: 1 },
  },
  required: ["id", "path"],
  additionalProperties: false,
});
const visualFindingsSchema = Object.freeze({
  type: "array",
  maxItems: 32,
  uniqueItems: true,
  items: { type: "string", enum: VISUAL_FINDINGS },
});
const commonContextProperties = Object.freeze({
  intendedRole: { type: "string", enum: ROLE_VALUES },
  profile: { type: "string", enum: PROFILE_VALUES },
  approvedReferences: { type: "array", maxItems: MAX_REFERENCES, items: referenceSchema },
});

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_image_finishing_packet_capabilities",
    description: "Describe unified read-only finishing decision packets for single images and batches.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_review_image_finishing_packet",
    description: "Produce one read-only finishing decision packet for an image, with optional approved references and explicit semantic visual findings. Recommends governed next tools but never edits pixels or approves publication.",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: { type: "string", minLength: 1 },
        filename: { type: "string", minLength: 1 },
        ...commonContextProperties,
        visualFindings: visualFindingsSchema,
      },
      required: ["inputPath"],
      additionalProperties: false,
    },
  }),
  Object.freeze({
    name: "evavo_review_image_finishing_batch",
    description: "Review 1-128 images in one read-only finishing batch. Shares the approved-reference model, preserves per-image semantic findings, ranks review priority and returns compact per-item decisions for agent workflows.",
    inputSchema: {
      type: "object",
      properties: {
        candidates: {
          type: "array",
          minItems: 1,
          maxItems: MAX_BATCH,
          items: {
            type: "object",
            properties: {
              id: { type: "string", minLength: 1 },
              path: { type: "string", minLength: 1 },
              filename: { type: "string", minLength: 1 },
              visualFindings: visualFindingsSchema,
            },
            required: ["id", "path"],
            additionalProperties: false,
          },
        },
        ...commonContextProperties,
      },
      required: ["candidates"],
      additionalProperties: false,
    },
  }),
]);

async function callTool(name, args) {
  if (name === "evavo_image_finishing_packet_capabilities") {
    return Object.freeze({
      contract: "evavo_image_finishing_packet_agent_v1_1",
      mode: "read-only-combined-finishing-decision",
      tools: tools.map((tool) => tool.name),
      maximumBatchSize: MAX_BATCH,
      maximumApprovedReferences: MAX_REFERENCES,
      batchReferenceModelShared: true,
      batchResponsesCompactByDefault: true,
      combines: [
        "role/profile-aware technical quality review",
        "connected defect and finishing-plan evidence",
        "ringing/posterization/resampling artifact signals",
        "generated-detail repetition and detail-density triage",
        "safe repair routing",
        "optional approved-reference consistency",
        "explicit semantic visual findings",
      ],
      dispositions: [
        "ready-for-visual-review",
        "safe-local-repair",
        "localized-repair",
        "semantic-repair",
        "reacquire-or-regenerate",
        "human-review",
      ],
      guarantees: Object.freeze({
        sourceMutationAllowed: false,
        writesFiles: false,
        automaticPromotionAllowed: false,
        humanVisualReviewRequired: true,
        claimsAiOriginDetection: false,
      }),
      allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
      bytesReturned: false,
    });
  }
  if (name === "evavo_review_image_finishing_packet") return reviewPacket(args ?? {});
  if (name === "evavo_review_image_finishing_batch") return reviewBatch(args ?? {});
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
  if (request?.jsonrpc !== "2.0") return { jsonrpc: "2.0", id: request?.id ?? null, error: { code: -32600, message: "Invalid Request" } };
  if (request.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions: `Unified single/batch finishing review is read-only. Configure ${ALLOWED_ROOTS_ENV}; packets may recommend governed writes but never perform them or grant approval.`,
      },
    };
  }
  if (request.method === "ping") return { jsonrpc: "2.0", id: request.id, result: {} };
  if (request.method === "tools/list") return { jsonrpc: "2.0", id: request.id, result: { tools } };
  if (request.method === "tools/call") {
    try {
      return { jsonrpc: "2.0", id: request.id, result: result(await callTool(request.params?.name, request.params?.arguments)) };
    } catch (error) {
      return { jsonrpc: "2.0", id: request.id, result: result({ code: "IMAGE_FINISHING_PACKET_FAILED", message: error instanceof Error ? error.message : String(error) }, true) };
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
