#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { orchestrateImageReview } from "../packages/media/dist/index.js";
import {
  assertAllowedLocalPath,
  configuredLocalRootCount,
} from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-image-finishing-artist";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_IMAGE_REVIEW_ALLOWED_ROOTS";
const MAX_SET_SIZE = 128;

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

const assertAllowed = (filePath) =>
  assertAllowedLocalPath(filePath, {
    envName: ALLOWED_ROOTS_ENV,
    output: false,
    label: "image finishing artist review",
  });

function median(values) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function relativeRatio(value, baseline) {
  if (baseline === 0) return value === 0 ? 1 : Number.POSITIVE_INFINITY;
  return value / baseline;
}

function unique(values) {
  return [...new Set(values)];
}

function compactReview(review) {
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
    similarity: review.similarity,
    ...(review.header ? { header: review.header } : {}),
    visualReviewRequired: review.visualReviewRequired,
    visualChecklist: review.visualChecklist,
    originAssessment: Object.freeze({
      aiGenerated: "not-determined",
      reason: "Pixel heuristics cannot reliably prove whether an image was AI-generated. Artifact signals identify defects, suspicious resampling and editing risks, not authorship or origin.",
      useInstead: [
        "trusted provenance metadata or signed generation records",
        "source/reference lineage",
        "artifact and defect review",
        "human visual review for anatomy, typography, repetition, coherence and style fit",
      ],
    }),
  });
}

function contextFromArgs(args, compareAgainst = []) {
  return {
    ...(typeof args.intendedRole === "string" ? { intendedRole: args.intendedRole } : {}),
    ...(typeof args.profile === "string" ? { declaredProfile: args.profile } : {}),
    ...(typeof args.filename === "string" ? { filename: args.filename } : {}),
    ...(compareAgainst.length ? { compareAgainst } : {}),
  };
}

async function reviewOne(args) {
  if (typeof args.inputPath !== "string") throw new Error("inputPath is required.");
  const inputPath = await assertAllowed(args.inputPath);
  const compareAgainst = [];
  for (const item of args.compareAgainst ?? []) {
    if (!item || typeof item.id !== "string" || typeof item.path !== "string") {
      throw new Error("compareAgainst entries require string id and path.");
    }
    const resolved = await assertAllowed(item.path);
    compareAgainst.push({ id: item.id, image: await readFile(resolved) });
  }
  const review = await orchestrateImageReview(
    await readFile(inputPath),
    contextFromArgs({ ...args, filename: args.filename ?? inputPath }, compareAgainst),
  );
  return Object.freeze({
    ok: true,
    inputPath,
    review: compactReview(review),
    bytesReturned: false,
    sourceModified: false,
  });
}

function consistencySummary(items) {
  const widths = items.map((item) => item.review.quality.width);
  const heights = items.map((item) => item.review.quality.height);
  const aspects = items.map((item) => item.review.quality.width / item.review.quality.height);
  const scores = items.map((item) => item.review.quality.score);
  const luma = items.map((item) => item.review.quality.lumaMean);
  const contrast = items.map((item) => item.review.quality.lumaStdDev);
  const sharpness = items.map((item) => item.review.quality.sharpness);
  const visible = items.map((item) => item.review.quality.visiblePixelRatio);

  const baseline = Object.freeze({
    width: median(widths),
    height: median(heights),
    aspectRatio: median(aspects),
    qualityScore: median(scores),
    lumaMean: median(luma),
    lumaStdDev: median(contrast),
    sharpness: median(sharpness),
    visiblePixelRatio: median(visible),
  });

  const alphaStates = unique(items.map((item) => item.review.quality.hasAlpha));
  const profiles = unique(items.map((item) => item.review.profile));
  const findings = items.map((item) => {
    const q = item.review.quality;
    const aspect = q.width / q.height;
    const flags = [];
    if (Math.abs(aspect - baseline.aspectRatio) > 0.01) flags.push("aspect-ratio-outlier");
    if (Math.abs(q.width - baseline.width) > 1 || Math.abs(q.height - baseline.height) > 1) flags.push("canvas-size-outlier");
    if (Math.abs(q.score - baseline.qualityScore) > 18) flags.push("quality-score-outlier");
    if (Math.abs(q.lumaMean - baseline.lumaMean) > 30) flags.push("luminance-outlier");
    if (Math.abs(q.lumaStdDev - baseline.lumaStdDev) > 20) flags.push("contrast-outlier");
    const sharpnessRatio = relativeRatio(q.sharpness, baseline.sharpness);
    if (sharpnessRatio < 0.45 || sharpnessRatio > 2.2) flags.push("sharpness-outlier");
    if (Math.abs(q.visiblePixelRatio - baseline.visiblePixelRatio) > 0.25) flags.push("visible-mass-outlier");
    return Object.freeze({
      id: item.id,
      path: item.path,
      flags: Object.freeze(flags),
      continuityRisk: flags.length >= 2 ? "high" : flags.length ? "review" : "low",
    });
  });

  const setWarnings = [];
  if (alphaStates.length > 1) setWarnings.push("mixed-alpha-channel-state");
  if (profiles.length > 1) setWarnings.push("mixed-inferred-review-profiles");
  if (findings.some((finding) => finding.continuityRisk === "high")) setWarnings.push("technical-frame-continuity-outliers-present");

  return Object.freeze({
    baseline,
    alphaStates: Object.freeze(alphaStates),
    profiles: Object.freeze(profiles),
    findings: Object.freeze(findings),
    setWarnings: Object.freeze(setWarnings),
    interpretation: "Continuity flags are technical outlier signals, not a semantic identity/style verdict. Use them to focus visual review on suspicious frames.",
  });
}

async function reviewSet(args) {
  if (!Array.isArray(args.images) || args.images.length < 2) throw new Error("images must contain at least two entries.");
  if (args.images.length > MAX_SET_SIZE) throw new Error(`images may contain at most ${MAX_SET_SIZE} entries.`);
  const seen = new Set();
  const items = [];
  for (const item of args.images) {
    if (!item || typeof item.id !== "string" || !item.id.trim() || typeof item.path !== "string") {
      throw new Error("Each images entry requires a non-empty string id and path.");
    }
    if (seen.has(item.id)) throw new Error(`Duplicate image id ${JSON.stringify(item.id)}.`);
    seen.add(item.id);
    const resolved = await assertAllowed(item.path);
    const review = await orchestrateImageReview(
      await readFile(resolved),
      contextFromArgs({ ...args, filename: item.filename ?? resolved }),
    );
    items.push(Object.freeze({ id: item.id, path: resolved, review: compactReview(review) }));
  }
  const consistency = consistencySummary(items);
  return Object.freeze({
    ok: true,
    images: Object.freeze(items),
    consistency,
    reviewPriority: Object.freeze(
      items
        .map((item) => ({
          id: item.id,
          severity: item.review.decision === "reject" ? 3 : item.review.decision === "needs-finishing" ? 2 : 1,
          score: item.review.quality.score,
        }))
        .sort((a, b) => b.severity - a.severity || a.score - b.score)
        .map(({ id }) => id),
    ),
    bytesReturned: false,
    sourcesModified: false,
  });
}

const contextProperties = Object.freeze({
  intendedRole: { type: "string", enum: ROLE_VALUES },
  profile: { type: "string", enum: PROFILE_VALUES },
});

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_image_finishing_artist_capabilities",
    description: "Describe the read-only finishing-artist review surface for ChatGPT, Claude, Codex and compatible MCP agents.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_review_image_for_finishing",
    description: "Review one local image without modifying it. Returns role/profile-aware quality, defects, connected defect regions, artifact signals, preservation-first finishing plan, optional similarity comparisons and a human visual-review checklist.",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: { type: "string", minLength: 1 },
        filename: { type: "string", minLength: 1 },
        ...contextProperties,
        compareAgainst: {
          type: "array",
          maxItems: 32,
          items: {
            type: "object",
            properties: {
              id: { type: "string", minLength: 1 },
              path: { type: "string", minLength: 1 },
            },
            required: ["id", "path"],
            additionalProperties: false,
          },
        },
      },
      required: ["inputPath"],
      additionalProperties: false,
    },
  }),
  Object.freeze({
    name: "evavo_review_image_set_consistency",
    description: "Review a frame/reference/image set and rank technical continuity outliers. Checks canvas/aspect, alpha state, quality, luminance, contrast, sharpness and visible-mass consistency while explicitly requiring human review for semantic identity and style continuity.",
    inputSchema: {
      type: "object",
      properties: {
        images: {
          type: "array",
          minItems: 2,
          maxItems: MAX_SET_SIZE,
          items: {
            type: "object",
            properties: {
              id: { type: "string", minLength: 1 },
              path: { type: "string", minLength: 1 },
              filename: { type: "string", minLength: 1 },
            },
            required: ["id", "path"],
            additionalProperties: false,
          },
        },
        ...contextProperties,
      },
      required: ["images"],
      additionalProperties: false,
    },
  }),
]);

async function callTool(name, args) {
  if (name === "evavo_image_finishing_artist_capabilities") {
    return Object.freeze({
      contract: "evavo_image_finishing_artist_v1",
      mode: "read-only-review-and-planning",
      tools: tools.map((tool) => tool.name),
      reviewSignals: [
        "sharpness-and-detail",
        "luminance-and-contrast",
        "clipping",
        "transparent-rgb-contamination",
        "edge-halo-risk",
        "alpha-pinholes",
        "jpeg-blockiness-risk",
        "connected-defect-regions",
        "posterization-risk",
        "ringing-or-oversharpen-risk",
        "nearest-neighbour-upscale-risk",
        "near-duplicate-similarity",
        "technical-set-continuity-outliers",
      ],
      repairPlanning: "preservation-first finishing plans are returned; this server never writes pixels",
      aiOriginDetection: "not claimed; artifact signals do not prove image origin",
      visualReview: "always required for anatomy, typography, composition, semantic correctness, art direction, identity and style consistency",
      nextStepTools: [
        "evavo-raster-finishing for deterministic finishing and real-alpha recovery",
        "Project Art workspace for granular masks, transforms, compositing, effects and mastered versions",
        "provider edit/inpaint workflows for semantic pixel changes that deterministic filters cannot safely make",
      ],
      allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
      bytesReturned: false,
      sourceModified: false,
    });
  }
  if (name === "evavo_review_image_for_finishing") return reviewOne(args ?? {});
  if (name === "evavo_review_image_set_consistency") return reviewSet(args ?? {});
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
        instructions: "Read-only finishing-artist review. Configure EVAVO_IMAGE_REVIEW_ALLOWED_ROOTS; image bytes remain local and no source is modified.",
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
        result: result(
          { code: "IMAGE_FINISHING_ARTIST_REVIEW_FAILED", message: error instanceof Error ? error.message : String(error) },
          true,
        ),
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
