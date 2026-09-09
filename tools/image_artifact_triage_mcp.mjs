#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { orchestrateImageReview } from "../packages/media/dist/index.js";
import {
  assertAllowedLocalPath,
  configuredLocalRootCount,
} from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-image-artifact-triage";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_IMAGE_ARTIFACT_ALLOWED_ROOTS";

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

const assertAllowed = (filePath) => assertAllowedLocalPath(filePath, {
  envName: ALLOWED_ROOTS_ENV,
  output: false,
  label: "image artifact triage",
});

async function reviewArtifactRisk(args) {
  if (typeof args.inputPath !== "string") throw new Error("inputPath is required.");
  const inputPath = await assertAllowed(args.inputPath);
  const review = await orchestrateImageReview(await readFile(inputPath), {
    ...(typeof args.intendedRole === "string" ? { intendedRole: args.intendedRole } : {}),
    ...(typeof args.profile === "string" ? { declaredProfile: args.profile } : {}),
    filename: typeof args.filename === "string" ? args.filename : inputPath,
  });
  return Object.freeze({
    ok: true,
    inputPath,
    profile: review.profile,
    decision: review.decision,
    blockers: review.blockers,
    warnings: review.warnings,
    technicalQuality: Object.freeze({
      grade: review.quality.grade,
      score: review.quality.score,
      width: review.quality.width,
      height: review.quality.height,
      hasAlpha: review.quality.hasAlpha,
      sharpness: review.quality.sharpness,
      lumaMean: review.quality.lumaMean,
      lumaStdDev: review.quality.lumaStdDev,
    }),
    artifactSignals: review.artifactSignals,
    generatedDetailRisk: review.generatedDetailRisk,
    defectSummary: Object.freeze({
      defectPixels: review.defectReview.evidence.defectPixels,
      maskCoverageRatio: review.defectReview.evidence.maskCoverageRatio,
      retainedRegions: review.defectReview.regions.retainedComponentCount,
    }),
    originAssessment: Object.freeze({
      aiGenerated: "not-determined",
      reason: "Artifact, repetition, detail-density and resampling signals cannot reliably prove authorship or generation origin.",
      recommendedEvidence: [
        "trusted provenance or signed generation records",
        "source/reference lineage",
        "approved-reference consistency review when visual anchors exist",
        "human semantic review for anatomy, text, object logic, reflections, perspective and scene coherence",
      ],
    }),
    visualReviewRequired: true,
    visualChecklist: review.visualChecklist,
    sourceModified: false,
    bytesReturned: false,
  });
}

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_image_artifact_triage_capabilities",
    description: "Describe read-only artifact and generated-detail triage without claiming AI-origin detection.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_review_image_artifact_risk",
    description: "Review one image for deterministic technical artifacts, suspicious resampling, repeated nontrivial local patterns and abnormal local-detail distribution. Advisory evidence only; never identifies AI authorship.",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: { type: "string", minLength: 1 },
        filename: { type: "string", minLength: 1 },
        intendedRole: { type: "string", enum: ROLE_VALUES },
        profile: { type: "string", enum: PROFILE_VALUES },
      },
      required: ["inputPath"],
      additionalProperties: false,
    },
  }),
]);

async function callTool(name, args) {
  if (name === "evavo_image_artifact_triage_capabilities") {
    return Object.freeze({
      contract: "evavo_image_artifact_triage_agent_v1",
      mode: "read-only-artifact-triage",
      tools: tools.map((tool) => tool.name),
      signals: [
        "ringing-or-oversharpen",
        "posterization",
        "nearest-neighbour-upscale-fingerprint",
        "repeated-nontrivial-local-patterns",
        "local-detail-density-imbalance",
        "quality-and-defect-context",
      ],
      semanticOnlyChecks: [
        "anatomy and hands",
        "malformed text/glyphs",
        "identity and costume consistency",
        "impossible reflections/occlusion/perspective",
        "wrong content or object logic",
      ],
      aiOriginDetection: "not claimed",
      allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
      sourceMutationAllowed: false,
      bytesReturned: false,
    });
  }
  if (name === "evavo_review_image_artifact_risk") return reviewArtifactRisk(args ?? {});
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
        instructions: `Read-only artifact triage. Configure ${ALLOWED_ROOTS_ENV}; pixel evidence is advisory and never establishes image origin.`,
      },
    };
  }
  if (request.method === "ping") return { jsonrpc: "2.0", id: request.id, result: {} };
  if (request.method === "tools/list") return { jsonrpc: "2.0", id: request.id, result: { tools } };
  if (request.method === "tools/call") {
    try {
      return { jsonrpc: "2.0", id: request.id, result: result(await callTool(request.params?.name, request.params?.arguments)) };
    } catch (error) {
      return { jsonrpc: "2.0", id: request.id, result: result({ code: "IMAGE_ARTIFACT_TRIAGE_FAILED", message: error instanceof Error ? error.message : String(error) }, true) };
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
