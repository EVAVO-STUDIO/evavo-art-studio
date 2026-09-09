#!/usr/bin/env node

import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import { reviewEnhancementStudioCandidate } from "../packages/media/dist/index.js";
import {
  assertAllowedLocalPath,
  configuredLocalRootCount,
} from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-enhancement-review";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_ENHANCEMENT_REVIEW_ALLOWED_ROOTS";
const WRITE_ENV = "EVAVO_ENHANCEMENT_REVIEW_ALLOW_WRITES";
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;

const assertAllowed = (filePath, { output = false } = {}) =>
  assertAllowedLocalPath(filePath, {
    envName: ALLOWED_ROOTS_ENV,
    output,
    label: "enhancement review",
  });

async function optionalImage(value) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error("Optional image paths must be non-empty strings.");
  const resolved = await assertAllowed(value);
  return readFile(resolved);
}

async function loadInputs(args) {
  for (const key of ["manifestPath", "sourcePath", "candidatePath"]) {
    if (typeof args[key] !== "string" || !args[key].trim()) throw new Error(`${key} is required.`);
  }
  const manifestPath = await assertAllowed(args.manifestPath);
  const sourcePath = await assertAllowed(args.sourcePath);
  const candidatePath = await assertAllowed(args.candidatePath);
  const manifestBytes = await readFile(manifestPath);
  if (manifestBytes.length > MAX_MANIFEST_BYTES) {
    throw new Error(`Enhancement review manifest exceeds ${MAX_MANIFEST_BYTES} bytes.`);
  }
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new Error("Enhancement review manifest is not valid UTF-8 JSON.");
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Enhancement review manifest must contain one JSON object.");
  }

  const [source, candidate, header, support, tile, desktopScreenshot, mobileScreenshot] = await Promise.all([
    readFile(sourcePath),
    readFile(candidatePath),
    optionalImage(args.headerPath),
    optionalImage(args.supportPath),
    optionalImage(args.tilePath),
    optionalImage(args.desktopScreenshotPath),
    optionalImage(args.mobileScreenshotPath),
  ]);

  return Object.freeze({
    paths: Object.freeze({
      manifestPath,
      sourcePath,
      candidatePath,
      ...(typeof args.headerPath === "string" ? { headerPath: await assertAllowed(args.headerPath) } : {}),
      ...(typeof args.supportPath === "string" ? { supportPath: await assertAllowed(args.supportPath) } : {}),
      ...(typeof args.tilePath === "string" ? { tilePath: await assertAllowed(args.tilePath) } : {}),
      ...(typeof args.desktopScreenshotPath === "string" ? { desktopScreenshotPath: await assertAllowed(args.desktopScreenshotPath) } : {}),
      ...(typeof args.mobileScreenshotPath === "string" ? { mobileScreenshotPath: await assertAllowed(args.mobileScreenshotPath) } : {}),
    }),
    spec: Object.freeze({
      manifest,
      source,
      candidate,
      ...(header ? { header } : {}),
      ...(support ? { support } : {}),
      ...(tile ? { tile } : {}),
      ...(desktopScreenshot ? { desktopScreenshot } : {}),
      ...(mobileScreenshot ? { mobileScreenshot } : {}),
    }),
  });
}

function compactResult(review, paths) {
  return Object.freeze({
    ok: true,
    paths,
    evidence: review.evidence,
    proofs: Object.freeze({
      qualityProofAvailable: review.qualityProofPng.length > 0,
      differenceProofAvailable: review.differenceProofPng.length > 0,
      pageProofAvailable: Boolean(review.pageProofPng?.length),
    }),
    authority: Object.freeze({
      approvalState: "review-only",
      publicationAllowed: false,
      cloudOverwriteAllowed: false,
      automaticCreativeApproval: false,
      finalVisualApprovalRequired: true,
    }),
    bytesReturned: false,
    sourceModified: false,
  });
}

async function reviewCandidate(args) {
  const loaded = await loadInputs(args);
  const review = await reviewEnhancementStudioCandidate(loaded.spec);
  return compactResult(review, loaded.paths);
}

async function assertMissing(filePath) {
  try {
    await access(filePath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Create-only enhancement review target already exists: ${filePath}`);
}

async function writeBundle(args) {
  if (process.env[WRITE_ENV] !== "true") {
    throw new Error(`Enhancement review bundle writes are disabled. Set ${WRITE_ENV}=true.`);
  }
  if (args.confirmLocalWrite !== true) {
    throw new Error("confirmLocalWrite=true is required for this exact review-bundle call.");
  }
  if (typeof args.outputRoot !== "string" || !args.outputRoot.trim()) throw new Error("outputRoot is required.");

  const loaded = await loadInputs(args);
  const outputRoot = await assertAllowed(args.outputRoot, { output: true });
  await assertMissing(outputRoot);
  const review = await reviewEnhancementStudioCandidate(loaded.spec);
  const parent = path.dirname(outputRoot);
  await mkdir(parent, { recursive: true });
  const temporaryRoot = await mkdtemp(path.join(parent, `.${path.basename(outputRoot)}.tmp-`));
  try {
    await writeFile(path.join(temporaryRoot, "quality-proof.png"), review.qualityProofPng, { flag: "wx" });
    await writeFile(path.join(temporaryRoot, "difference-proof.png"), review.differenceProofPng, { flag: "wx" });
    const proofFiles = ["quality-proof.png", "difference-proof.png"];
    if (review.pageProofPng) {
      await writeFile(path.join(temporaryRoot, "page-context-proof.png"), review.pageProofPng, { flag: "wx" });
      proofFiles.push("page-context-proof.png");
    }
    const receipt = Object.freeze({
      schemaVersion: "1.0",
      operation: "evavo-enhancement-candidate-review-bundle",
      approvalState: "review-only",
      inputPaths: loaded.paths,
      outputRoot,
      proofFiles: Object.freeze(proofFiles),
      evidence: review.evidence,
      publicationAllowed: false,
      cloudOverwriteAllowed: false,
      automaticCreativeApproval: false,
      finalVisualApprovalRequired: true,
      sourceModified: false,
    });
    await writeFile(path.join(temporaryRoot, "review-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
    await rename(temporaryRoot, outputRoot);
    return Object.freeze({
      ok: true,
      outputRoot,
      proofFiles: Object.freeze(proofFiles),
      receiptPath: path.join(outputRoot, "review-receipt.json"),
      decision: review.evidence.decision,
      blockers: review.evidence.blockers,
      warnings: review.evidence.warnings,
      approvalState: "review-only",
      bytesReturned: false,
      sourceModified: false,
    });
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

const inputProperties = Object.freeze({
  manifestPath: { type: "string", minLength: 1 },
  sourcePath: { type: "string", minLength: 1 },
  candidatePath: { type: "string", minLength: 1 },
  headerPath: { type: "string", minLength: 1 },
  supportPath: { type: "string", minLength: 1 },
  tilePath: { type: "string", minLength: 1 },
  desktopScreenshotPath: { type: "string", minLength: 1 },
  mobileScreenshotPath: { type: "string", minLength: 1 },
});

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_enhancement_review_capabilities",
    description: "Describe source-bound Enhancement Studio candidate review, including learned-detail, macro-structure, alpha, technical-benefit and page-context checks.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_review_enhancement_candidate",
    description: "Verify one Enhancement Studio manifest against exact source/candidate bytes and run the full Art Studio candidate review in memory. No image bytes are returned and no files are written.",
    inputSchema: {
      type: "object",
      properties: inputProperties,
      required: ["manifestPath", "sourcePath", "candidatePath"],
      additionalProperties: false,
    },
  }),
  Object.freeze({
    name: "evavo_write_enhancement_review_bundle",
    description: "Run the exact source-bound enhancement review, then atomically create a new review-only directory containing quality/difference/page proofs and a JSON receipt. Never publishes or overwrites source art.",
    inputSchema: {
      type: "object",
      properties: {
        ...inputProperties,
        outputRoot: { type: "string", minLength: 1 },
        confirmLocalWrite: { type: "boolean", const: true },
      },
      required: ["manifestPath", "sourcePath", "candidatePath", "outputRoot", "confirmLocalWrite"],
      additionalProperties: false,
    },
  }),
]);

async function callTool(name, args) {
  if (name === "evavo_enhancement_review_capabilities") {
    return Object.freeze({
      contract: "evavo_enhancement_review_agent_v1",
      checks: [
        "manifest-schema-and-sha-binding",
        "source-and-candidate-byte-hash-verification",
        "source-and-candidate-dimension-verification",
        "native-profile-aware-image-review",
        "source-space-edit-review",
        "learned-local-detail-hallucination-and-oversmoothing-risk",
        "macro-structure-redraw-risk",
        "alpha-and-silhouette-drift",
        "material-technical-benefit-over-source",
        "page-context-review-when-required",
      ],
      reviewBundle: "quality/difference proofs, optional page proof and receipt in one atomic create-only directory",
      publicationAllowed: false,
      automaticCreativeApproval: false,
      writesEnabled: process.env[WRITE_ENV] === "true",
      allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
      bytesReturned: false,
      sourceMutationAllowed: false,
    });
  }
  if (name === "evavo_review_enhancement_candidate") return reviewCandidate(args ?? {});
  if (name === "evavo_write_enhancement_review_bundle") return writeBundle(args ?? {});
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
        instructions: `Enhancement review is source-bound and non-publishing. Configure ${ALLOWED_ROOTS_ENV}; proof-bundle writes additionally require ${WRITE_ENV}=true and confirmLocalWrite=true.`,
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
        result: result({ code: "ENHANCEMENT_REVIEW_FAILED", message: error instanceof Error ? error.message : String(error) }, true),
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
