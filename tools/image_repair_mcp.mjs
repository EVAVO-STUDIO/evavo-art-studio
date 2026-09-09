#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import {
  applyLocalizedRasterEdit,
  orchestrateImageReview,
  planImageRepairDecision,
  polishExistingRasterPreservingArtwork,
  reviewExistingImageEdit,
} from "../packages/media/dist/index.js";
import {
  assertAllowedLocalPath,
  configuredLocalRootCount,
} from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-image-repair";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_IMAGE_REPAIR_ALLOWED_ROOTS";
const WRITE_ENV = "EVAVO_IMAGE_REPAIR_ALLOW_WRITES";

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

const assertAllowed = (filePath, { output = false } = {}) =>
  assertAllowedLocalPath(filePath, {
    envName: ALLOWED_ROOTS_ENV,
    output,
    label: "image repair",
  });

function requireWriteAdmission(args) {
  if (process.env[WRITE_ENV] !== "true") {
    throw new Error(`Image repair writes are disabled. Set ${WRITE_ENV}=true.`);
  }
  if (args.confirmLocalWrite !== true) {
    throw new Error("confirmLocalWrite=true is required for this exact repair call.");
  }
}

function contextFromArgs(args) {
  return {
    ...(typeof args.intendedRole === "string" ? { intendedRole: args.intendedRole } : {}),
    ...(typeof args.profile === "string" ? { declaredProfile: args.profile } : {}),
    ...(typeof args.filename === "string" ? { filename: args.filename } : {}),
  };
}

function pathIdentity(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function assertDistinctPaths(sourcePaths, outputPaths) {
  const sources = new Set(sourcePaths.map(pathIdentity));
  const outputs = outputPaths.map(pathIdentity);
  if (outputs.some((candidate) => sources.has(candidate))) {
    throw new Error("Image repair is non-destructive: output, proof and receipt paths must differ from all source inputs.");
  }
  if (new Set(outputs).size !== outputs.length) {
    throw new Error("Image repair output, proof, difference proof and receipt paths must be distinct.");
  }
}

async function assertCreateOnlyTargets(filePaths) {
  for (const filePath of filePaths) {
    try {
      await access(filePath);
    } catch {
      continue;
    }
    throw new Error(`Create-only repair target already exists: ${filePath}`);
  }
}

async function createOnly(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, { flag: "wx" });
}

function visualFindings(args) {
  return Array.isArray(args.visualFindings) ? args.visualFindings : [];
}

function compactReview(review) {
  return Object.freeze({
    profile: review.profile,
    decision: review.decision,
    blockers: review.blockers,
    warnings: review.warnings,
    quality: review.quality,
    defectReview: review.defectReview,
    finishingPlan: review.finishingPlan,
    artifactSignals: review.artifactSignals,
    visualReviewRequired: review.visualReviewRequired,
    visualChecklist: review.visualChecklist,
  });
}

async function buildRepairPlan(args) {
  if (typeof args.inputPath !== "string") throw new Error("inputPath is required.");
  const inputPath = await assertAllowed(args.inputPath);
  const source = await readFile(inputPath);
  const review = await orchestrateImageReview(
    source,
    contextFromArgs({ ...args, filename: args.filename ?? inputPath }),
  );
  const repairDecision = planImageRepairDecision(review, {
    visualFindings: visualFindings(args),
  });
  return Object.freeze({ inputPath, source, review, repairDecision });
}

async function planRepair(args) {
  const plan = await buildRepairPlan(args);
  return Object.freeze({
    ok: true,
    inputPath: plan.inputPath,
    review: compactReview(plan.review),
    repairDecision: plan.repairDecision,
    originAssessment: Object.freeze({
      aiGenerated: "not-determined",
      reason: "Technical artifact heuristics do not prove authorship. Use trusted provenance/lineage plus visual review.",
    }),
    bytesReturned: false,
    sourceModified: false,
  });
}

async function resolveOutputSet(args) {
  if (typeof args.outputPath !== "string") throw new Error("outputPath is required.");
  const outputPath = await assertAllowed(args.outputPath, { output: true });
  const proofPath = await assertAllowed(
    typeof args.proofPath === "string" ? args.proofPath : `${outputPath}.review.png`,
    { output: true },
  );
  const differenceProofPath = await assertAllowed(
    typeof args.differenceProofPath === "string" ? args.differenceProofPath : `${outputPath}.difference.png`,
    { output: true },
  );
  const receiptPath = await assertAllowed(
    typeof args.receiptPath === "string" ? args.receiptPath : `${outputPath}.receipt.json`,
    { output: true },
  );
  return { outputPath, proofPath, differenceProofPath, receiptPath };
}

async function writeEvidenceSet(outputSet, imageBuffer, editReview, receipt) {
  await assertCreateOnlyTargets([
    outputSet.outputPath,
    outputSet.proofPath,
    outputSet.differenceProofPath,
    outputSet.receiptPath,
  ]);
  await createOnly(outputSet.outputPath, imageBuffer);
  await createOnly(outputSet.proofPath, editReview.proofPng);
  await createOnly(outputSet.differenceProofPath, editReview.differenceProofPng);
  await createOnly(outputSet.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
}

async function applyPreservationRepair(args) {
  requireWriteAdmission(args);
  const plan = await buildRepairPlan(args);
  if (
    plan.repairDecision.disposition !== "safe-local-repair"
    || plan.repairDecision.recipe !== "preservation-polish"
    || plan.repairDecision.agentExecutable !== true
  ) {
    throw new Error(
      `Source is not admitted for preservation polish: ${plan.repairDecision.disposition} (${plan.repairDecision.reasonCodes.join(", ")})`,
    );
  }

  const outputSet = await resolveOutputSet(args);
  assertDistinctPaths([plan.inputPath], Object.values(outputSet));
  await assertCreateOnlyTargets(Object.values(outputSet));

  const polished = await polishExistingRasterPreservingArtwork(plan.source, {
    ...(Number.isInteger(args.transparentAlphaCutoff) ? { transparentAlphaCutoff: args.transparentAlphaCutoff } : {}),
    ...(Number.isInteger(args.opaqueAlphaCutoff) ? { opaqueAlphaCutoff: args.opaqueAlphaCutoff } : {}),
    ...(Number.isInteger(args.fringeRadius) ? { fringeRadius: args.fringeRadius } : {}),
    ...(Number.isInteger(args.donorAlphaThreshold) ? { donorAlphaThreshold: args.donorAlphaThreshold } : {}),
    clearTransparentRgb: args.clearTransparentRgb !== false,
    decontaminateFringe: args.decontaminateFringe !== false,
    preserveOpaqueRgb: true,
  });

  const editReview = await reviewExistingImageEdit(plan.source, polished.buffer, {
    maximumChangedPixelRatio: 0.2,
    maximumSharpnessRegressionRatio: 0.03,
    maximumHaloRegression: 0,
    maximumPinholeRegression: 0,
    preserveOpaqueRgb: true,
  });
  if (editReview.evidence.regressions.length > 0 || editReview.evidence.verdict === "fail") {
    throw new Error(`Preservation repair failed post-edit admission: ${editReview.evidence.regressions.join(", ") || editReview.evidence.verdict}`);
  }

  const postReview = await orchestrateImageReview(
    polished.buffer,
    contextFromArgs({ ...args, filename: args.filename ?? outputSet.outputPath }),
  );
  const postDecision = planImageRepairDecision(postReview, { visualFindings: visualFindings(args) });
  const receipt = Object.freeze({
    schemaVersion: "1.0",
    operation: "evavo-preservation-image-repair",
    approvalState: "unapproved",
    sourcePath: plan.inputPath,
    outputPath: outputSet.outputPath,
    proofPath: outputSet.proofPath,
    differenceProofPath: outputSet.differenceProofPath,
    receiptPath: outputSet.receiptPath,
    sourceDecision: plan.repairDecision,
    preservation: polished.evidence,
    editReview: editReview.evidence,
    postReview: compactReview(postReview),
    postDecision,
    promotionReady: editReview.evidence.approvedForPromotion && postReview.decision !== "reject",
    sourceModified: false,
  });

  await writeEvidenceSet(outputSet, polished.buffer, editReview, receipt);
  return Object.freeze({
    ok: true,
    ...outputSet,
    approvalState: "unapproved",
    promotionReady: receipt.promotionReady,
    repairDecision: postDecision,
    bytesReturned: false,
    sourceModified: false,
  });
}

function finiteRatio(value, fallback, label) {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0 || value > 0.35) {
    throw new Error(`${label} must be greater than 0 and no more than 0.35.`);
  }
  return value;
}

async function applyLocalizedRepair(args) {
  requireWriteAdmission(args);
  if (typeof args.candidatePath !== "string" || typeof args.maskPath !== "string") {
    throw new Error("candidatePath and maskPath are required for localized repair.");
  }

  const plan = await buildRepairPlan(args);
  if (plan.repairDecision.disposition !== "localized-repair" && plan.repairDecision.disposition !== "semantic-edit") {
    throw new Error(
      `Source is not admitted for a masked candidate repair: ${plan.repairDecision.disposition} (${plan.repairDecision.reasonCodes.join(", ")})`,
    );
  }

  const candidatePath = await assertAllowed(args.candidatePath);
  const maskPath = await assertAllowed(args.maskPath);
  const referencePath = typeof args.referencePath === "string" ? await assertAllowed(args.referencePath) : null;
  if (plan.repairDecision.requiresReference && referencePath === null) {
    throw new Error("This semantic repair requires referencePath because the visual finding concerns identity, style or content.");
  }

  const outputSet = await resolveOutputSet(args);
  assertDistinctPaths(
    [plan.inputPath, candidatePath, maskPath, ...(referencePath ? [referencePath] : [])],
    Object.values(outputSet),
  );
  await assertCreateOnlyTargets(Object.values(outputSet));

  const candidate = await readFile(candidatePath);
  const mask = await readFile(maskPath);
  const maximumMaskCoverageRatio = finiteRatio(args.maximumMaskCoverageRatio, 0.12, "maximumMaskCoverageRatio");
  const localized = await applyLocalizedRasterEdit(plan.source, candidate, mask, {
    ...(Number.isInteger(args.featherRadius) ? { featherRadius: args.featherRadius } : {}),
    ...(Number.isInteger(args.maskThreshold) ? { maskThreshold: args.maskThreshold } : {}),
    preserveOutsideMask: true,
    preserveOpaqueOutsideMask: true,
  });
  if (localized.evidence.maskCoverageRatio > maximumMaskCoverageRatio) {
    throw new Error(
      `Localized repair mask covers ${(localized.evidence.maskCoverageRatio * 100).toFixed(2)}%, above the ${(maximumMaskCoverageRatio * 100).toFixed(2)}% budget.`,
    );
  }
  if (!localized.evidence.preservationPassed) {
    throw new Error("Localized repair failed outside-mask preservation.");
  }

  const editReview = await reviewExistingImageEdit(plan.source, localized.buffer, {
    maximumChangedPixelRatio: Math.min(0.5, maximumMaskCoverageRatio + 0.05),
    maximumSharpnessRegressionRatio: 0.08,
    maximumHaloRegression: 0.002,
    maximumPinholeRegression: 0.001,
    preserveOpaqueRgb: false,
  });
  if (editReview.evidence.regressions.length > 0 || editReview.evidence.verdict === "fail") {
    throw new Error(`Localized repair failed post-edit admission: ${editReview.evidence.regressions.join(", ") || editReview.evidence.verdict}`);
  }

  const postReview = await orchestrateImageReview(
    localized.buffer,
    contextFromArgs({ ...args, filename: args.filename ?? outputSet.outputPath }),
  );
  const postDecision = planImageRepairDecision(postReview, { visualFindings: [] });
  const receipt = Object.freeze({
    schemaVersion: "1.0",
    operation: "evavo-masked-candidate-image-repair",
    approvalState: "unapproved",
    sourcePath: plan.inputPath,
    candidatePath,
    maskPath,
    referencePath,
    outputPath: outputSet.outputPath,
    proofPath: outputSet.proofPath,
    differenceProofPath: outputSet.differenceProofPath,
    receiptPath: outputSet.receiptPath,
    sourceDecision: plan.repairDecision,
    localizedEdit: localized.evidence,
    editReview: editReview.evidence,
    postReview: compactReview(postReview),
    postDecision,
    promotionReady: editReview.evidence.approvedForPromotion && postReview.decision !== "reject",
    sourceModified: false,
  });

  await writeEvidenceSet(outputSet, localized.buffer, editReview, receipt);
  return Object.freeze({
    ok: true,
    ...outputSet,
    approvalState: "unapproved",
    promotionReady: receipt.promotionReady,
    maskCoverageRatio: localized.evidence.maskCoverageRatio,
    repairDecision: postDecision,
    bytesReturned: false,
    sourceModified: false,
  });
}

const contextProperties = Object.freeze({
  intendedRole: { type: "string", enum: ROLE_VALUES },
  profile: { type: "string", enum: PROFILE_VALUES },
  visualFindings: {
    type: "array",
    maxItems: 32,
    uniqueItems: true,
    items: { type: "string", enum: VISUAL_FINDINGS },
  },
});

const commonOutputProperties = Object.freeze({
  outputPath: { type: "string", minLength: 1 },
  proofPath: { type: "string", minLength: 1 },
  differenceProofPath: { type: "string", minLength: 1 },
  receiptPath: { type: "string", minLength: 1 },
  confirmLocalWrite: { type: "boolean", const: true },
});

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_image_repair_capabilities",
    description: "Describe governed image repair routing and write-gated execution for deterministic polish and explicit masked candidate edits.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_plan_image_repair",
    description: "Review one image and choose the smallest safe route: no repair, preservation polish, masked localized repair, semantic edit, reacquire/regenerate, or human review. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: { type: "string", minLength: 1 },
        filename: { type: "string", minLength: 1 },
        ...contextProperties,
      },
      required: ["inputPath"],
      additionalProperties: false,
    },
  }),
  Object.freeze({
    name: "evavo_apply_preservation_image_repair",
    description: "Apply only an admitted preservation-polish repair to an existing alpha image, re-review it before writing, preserve opaque artwork, and emit create-only output plus review/difference proofs and an unapproved receipt.",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: { type: "string", minLength: 1 },
        filename: { type: "string", minLength: 1 },
        ...contextProperties,
        ...commonOutputProperties,
        transparentAlphaCutoff: { type: "integer", minimum: 0, maximum: 255 },
        opaqueAlphaCutoff: { type: "integer", minimum: 0, maximum: 255 },
        fringeRadius: { type: "integer", minimum: 1, maximum: 8 },
        donorAlphaThreshold: { type: "integer", minimum: 0, maximum: 255 },
        clearTransparentRgb: { type: "boolean" },
        decontaminateFringe: { type: "boolean" },
      },
      required: ["inputPath", "outputPath", "confirmLocalWrite"],
      additionalProperties: false,
    },
  }),
  Object.freeze({
    name: "evavo_apply_masked_candidate_image_repair",
    description: "Composite an explicit candidate only inside an explicit same-size mask, enforce a bounded mask-coverage budget, preserve every pixel outside the mask, re-review before writing, and emit proofs plus an unapproved receipt.",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: { type: "string", minLength: 1 },
        candidatePath: { type: "string", minLength: 1 },
        maskPath: { type: "string", minLength: 1 },
        referencePath: { type: "string", minLength: 1 },
        filename: { type: "string", minLength: 1 },
        ...contextProperties,
        ...commonOutputProperties,
        maximumMaskCoverageRatio: { type: "number", exclusiveMinimum: 0, maximum: 0.35 },
        featherRadius: { type: "integer", minimum: 0, maximum: 32 },
        maskThreshold: { type: "integer", minimum: 0, maximum: 255 },
      },
      required: ["inputPath", "candidatePath", "maskPath", "outputPath", "confirmLocalWrite"],
      additionalProperties: false,
    },
  }),
]);

async function callTool(name, args) {
  if (name === "evavo_image_repair_capabilities") {
    return Object.freeze({
      contract: "evavo_image_repair_agent_v1",
      mode: "review-first-create-only-repair",
      tools: tools.map((tool) => tool.name),
      dispositions: [
        "no-repair",
        "safe-local-repair",
        "localized-repair",
        "semantic-edit",
        "reacquire-or-regenerate",
        "human-review",
      ],
      safeLocalRepair: "Only preservation polish is directly admitted from deterministic review evidence. It preserves fully opaque RGB and is re-reviewed before any file is written.",
      localizedRepair: "Requires an explicit same-size candidate and mask. Pixels outside the mask are source-preserved and the mask coverage is bounded before output is written.",
      semanticRepair: "Never invented by this server. A capable visual reviewer supplies explicit visualFindings; identity/style/content findings also require a reference path.",
      publication: "Every repair output remains unapproved. Promotion continues through existing review and approval gates.",
      aiOriginDetection: "not claimed",
      writesEnabled: process.env[WRITE_ENV] === "true",
      allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
      bytesReturned: false,
      sourceMutationAllowed: false,
    });
  }
  if (name === "evavo_plan_image_repair") return planRepair(args ?? {});
  if (name === "evavo_apply_preservation_image_repair") return applyPreservationRepair(args ?? {});
  if (name === "evavo_apply_masked_candidate_image_repair") return applyLocalizedRepair(args ?? {});
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
        instructions: `Review-first image repair. Configure ${ALLOWED_ROOTS_ENV}; writes also require ${WRITE_ENV}=true and confirmLocalWrite=true. Sources are never overwritten.`,
      },
    };
  }
  if (request.method === "ping") return { jsonrpc: "2.0", id: request.id, result: {} };
  if (request.method === "tools/list") return { jsonrpc: "2.0", id: request.id, result: { tools } };
  if (request.method === "tools/call") {
    try {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: result(await callTool(request.params?.name, request.params?.arguments)),
      };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: result(
          { code: "IMAGE_REPAIR_FAILED", message: error instanceof Error ? error.message : String(error) },
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
