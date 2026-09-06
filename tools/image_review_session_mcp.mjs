#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import { IMAGE_REVIEW_PROFILE_NAMES, orchestrateImageReview } from "../packages/media/dist/index.js";
import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-image-review-session";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_EXISTING_IMAGE_POLISH_ALLOWED_ROOTS";
const ALLOW_WRITES_ENV = "EVAVO_EXISTING_IMAGE_POLISH_ALLOW_WRITES";
const ROLES = new Set(["work-header", "support-image", "tile", "logo", "ui", "photo", "sprite", "illustration", "texture"]);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const allowed = (filePath, output = false) => assertAllowedLocalPath(filePath, {
  envName: ALLOWED_ROOTS_ENV,
  output,
  label: "image review session",
});
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[ALLOW_WRITES_ENV] ?? "").toLowerCase());

async function bindInput(filePath, label) {
  const resolved = await allowed(filePath, false);
  const bytes = await readFile(resolved);
  if (!bytes.length) throw new Error(`${label} is empty.`);
  return { path: resolved, bytes, sha256: sha256(bytes), byteLength: bytes.length };
}

async function runSession(args) {
  if (typeof args.inputPath !== "string" || typeof args.receiptPath !== "string") throw new Error("inputPath and receiptPath are required.");
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required.");
  if (!writesEnabled()) throw new Error(`${ALLOW_WRITES_ENV}=true is required.`);
  if (args.intendedRole !== undefined && !ROLES.has(args.intendedRole)) throw new Error(`Unsupported intendedRole ${JSON.stringify(args.intendedRole)}.`);
  if (args.declaredProfile !== undefined && !IMAGE_REVIEW_PROFILE_NAMES.includes(args.declaredProfile)) throw new Error(`Unsupported declaredProfile ${JSON.stringify(args.declaredProfile)}.`);

  const source = await bindInput(args.inputPath, "inputPath");
  const receiptPath = await allowed(args.receiptPath, true);
  if (path.resolve(source.path) === path.resolve(receiptPath)) throw new Error("receiptPath must differ from inputPath.");

  const comparisons = [];
  const compareBindings = [];
  const ids = new Set();
  for (const item of args.compareAgainst ?? []) {
    if (!item || typeof item.id !== "string" || !item.id.trim() || typeof item.path !== "string") throw new Error("Each compareAgainst entry requires non-empty id and path.");
    if (ids.has(item.id)) throw new Error(`Duplicate compareAgainst id ${JSON.stringify(item.id)}.`);
    ids.add(item.id);
    const bound = await bindInput(item.path, `compareAgainst:${item.id}`);
    comparisons.push({ id: item.id, image: bound.bytes });
    compareBindings.push({ id: item.id, path: bound.path, sha256: bound.sha256, byteLength: bound.byteLength });
  }

  const result = await orchestrateImageReview(source.bytes, {
    ...(args.intendedRole ? { intendedRole: args.intendedRole } : {}),
    ...(args.declaredProfile ? { declaredProfile: args.declaredProfile } : {}),
    filename: typeof args.filename === "string" ? args.filename : path.basename(source.path),
    ...(comparisons.length ? { compareAgainst: comparisons } : {}),
  });

  const receipt = Object.freeze({
    contract: "evavo.image-review-session.v1",
    reviewEngineContract: "evavo_image_review_orchestrator_v1_2",
    sourceBinding: Object.freeze({ path: source.path, sha256: source.sha256, byteLength: source.byteLength }),
    comparisonBindings: Object.freeze(compareBindings),
    intendedRole: args.intendedRole ?? null,
    declaredProfile: args.declaredProfile ?? null,
    resolvedProfile: result.profile,
    profileReason: result.profileReason,
    quality: result.quality,
    defectReview: result.defectReview,
    artifactSignals: result.artifactSignals,
    ...(result.header ? { header: result.header } : {}),
    similarity: result.similarity,
    decision: result.decision,
    blockers: result.blockers,
    warnings: result.warnings,
    visualReviewRequired: true,
    visualChecklist: result.visualChecklist,
    approvalState: "unapproved",
    sourceMutationPerformed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
    publicationAllowed: false,
    nextRequiredAction: result.decision === "reject"
      ? "Retain the current/source asset and resolve blockers before creating any replacement or finishing candidate."
      : result.decision === "needs-finishing"
        ? "Inspect ranked defects and artifact signals, then use the smallest preservation-first finishing operation and run source-vs-edit review."
        : "Perform the mandatory visual/semantic review at intended runtime size before any promotion decision.",
  });
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeCreateOnlyBundle([{ path: receiptPath, data: payload, encoding: "utf8" }]);

  return Object.freeze({
    ok: true,
    receiptPath,
    receiptSha256: sha256(Buffer.from(payload, "utf8")),
    sourceBinding: receipt.sourceBinding,
    decision: result.decision,
    blockers: result.blockers,
    warnings: result.warnings,
    visualReviewRequired: true,
    publicationAllowed: false,
  });
}

async function verifySession(args) {
  if (typeof args.receiptPath !== "string") throw new Error("receiptPath is required.");
  const receiptFile = await bindInput(args.receiptPath, "receiptPath");
  const value = JSON.parse(receiptFile.bytes.toString("utf8"));
  if (value.contract !== "evavo.image-review-session.v1") throw new Error("Unsupported image-review session receipt contract.");
  if (value.approvalState !== "unapproved" || value.publicationAllowed !== false || value.cloudOverwriteAllowed !== false || value.websiteMutationAllowed !== false) throw new Error("Image-review receipt carries forbidden promotion authority.");
  const source = await bindInput(value.sourceBinding?.path, "sourceBinding");
  if (source.sha256 !== value.sourceBinding?.sha256 || source.byteLength !== value.sourceBinding?.byteLength) throw new Error("Image-review source bytes changed after review.");
  for (const item of value.comparisonBindings ?? []) {
    const current = await bindInput(item.path, `comparisonBinding:${item.id}`);
    if (current.sha256 !== item.sha256 || current.byteLength !== item.byteLength) throw new Error(`Comparison source ${JSON.stringify(item.id)} changed after review.`);
  }
  return Object.freeze({
    ok: true,
    receiptPath: receiptFile.path,
    receiptSha256: receiptFile.sha256,
    sourceBindingVerified: true,
    comparisonBindingsVerified: true,
    decision: value.decision,
    approvalState: value.approvalState,
    publicationAllowed: false,
  });
}

const tools = Object.freeze([
  Object.freeze({ name: "evavo_image_review_session_capabilities", description: "Describe durable source-bound unified image-review receipts and stale-evidence verification.", inputSchema: { type: "object", properties: {}, additionalProperties: false } }),
  Object.freeze({
    name: "evavo_create_image_review_session",
    description: "Run the unified image QA orchestrator and persist an immutable create-only receipt bound to exact source and comparison bytes. The receipt carries technical, defect, artifact, similarity and optional Work-header evidence but never promotion authority.",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: { type: "string", minLength: 1 },
        receiptPath: { type: "string", minLength: 1 },
        intendedRole: { type: "string", enum: [...ROLES] },
        declaredProfile: { type: "string", enum: [...IMAGE_REVIEW_PROFILE_NAMES] },
        filename: { type: "string" },
        compareAgainst: { type: "array", maxItems: 24, items: { type: "object", required: ["id", "path"], properties: { id: { type: "string", minLength: 1 }, path: { type: "string", minLength: 1 } }, additionalProperties: false } },
        confirmLocalWrite: { type: "boolean", const: true },
      },
      required: ["inputPath", "receiptPath", "confirmLocalWrite"],
      additionalProperties: false,
    },
  }),
  Object.freeze({ name: "evavo_verify_image_review_session", description: "Re-read an image-review receipt and reverify exact source/comparison SHA-256 and byte-length bindings before downstream use.", inputSchema: { type: "object", properties: { receiptPath: { type: "string", minLength: 1 } }, required: ["receiptPath"], additionalProperties: false } }),
]);

function capabilities() {
  return Object.freeze({
    contract: "evavo.image-review-session.v1",
    serverVersion: SERVER_VERSION,
    sourceSha256AndLengthBound: true,
    comparisonSha256AndLengthBound: true,
    staleEvidenceVerification: true,
    createOnlyReceiptWrite: true,
    sourceMutationPerformed: false,
    visualReviewRequired: true,
    publicationAllowed: false,
    allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
    writesEnabled: writesEnabled(),
  });
}

async function callTool(name, args) {
  if (name === "evavo_image_review_session_capabilities") return capabilities();
  if (name === "evavo_create_image_review_session") return runSession(args ?? {});
  if (name === "evavo_verify_image_review_session") return verifySession(args ?? {});
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}

const response = (id, result) => ({ jsonrpc: "2.0", id, result });
const toolResult = (payload, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError });
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  try {
    const message = JSON.parse(line);
    let outgoing;
    if (message.method === "initialize") outgoing = response(message.id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } });
    else if (message.method === "notifications/initialized") outgoing = null;
    else if (message.method === "tools/list") outgoing = response(message.id, { tools });
    else if (message.method === "tools/call") {
      try { outgoing = response(message.id, toolResult(await callTool(message.params?.name, message.params?.arguments ?? {}))); }
      catch (error) { outgoing = response(message.id, toolResult({ ok: false, message: error instanceof Error ? error.message : String(error) }, true)); }
    } else outgoing = response(message.id, toolResult({ ok: false, message: `Unsupported method ${JSON.stringify(message.method)}.` }, true));
    if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: String(error) }, true)))}\n`);
  }
}
