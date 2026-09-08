#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import { IMAGE_REVIEW_PROFILE_NAMES, orchestrateImageReview } from "../packages/media/dist/index.js";
import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-image-review-session";
const SERVER_VERSION = "1.2.0";
const PROTOCOL_VERSION = "2025-03-26";
const RECEIPT_CONTRACT = "evavo.image-review-session.v1_2";
const REVIEW_ENGINE_CONTRACT = "evavo_image_review_orchestrator_v1_3";
const REVIEW_EVIDENCE_INTEGRITY_CONTRACT = "evavo.image-review-evidence-integrity.v1";
const ALLOWED_ROOTS_ENV = "EVAVO_EXISTING_IMAGE_POLISH_ALLOWED_ROOTS";
const ALLOW_WRITES_ENV = "EVAVO_EXISTING_IMAGE_POLISH_ALLOW_WRITES";
const ROLES = new Set(["work-header", "support-image", "tile", "logo", "ui", "photo", "sprite", "illustration", "texture"]);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const allowed = (filePath, output = false) => assertAllowedLocalPath(filePath, { envName: ALLOWED_ROOTS_ENV, output, label: "image review session" });
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[ALLOW_WRITES_ENV] ?? "").toLowerCase());

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}
function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}
function digestReviewEvidence(value) {
  return sha256(Buffer.from(canonicalJson(value), "utf8"));
}

async function bindInput(filePath, label) {
  const resolved = await allowed(filePath, false);
  const bytes = await readFile(resolved);
  if (!bytes.length) throw new Error(`${label} is empty.`);
  return { path: resolved, bytes, sha256: sha256(bytes), byteLength: bytes.length };
}

function reviewEvidenceFromResult({ result, intendedRole, declaredProfile, filename }) {
  return Object.freeze({
    integrityContract: REVIEW_EVIDENCE_INTEGRITY_CONTRACT,
    reviewEngineContract: REVIEW_ENGINE_CONTRACT,
    intendedRole: intendedRole ?? null,
    declaredProfile: declaredProfile ?? null,
    filename,
    resolvedProfile: result.profile,
    profileReason: result.profileReason,
    quality: result.quality,
    defectReview: result.defectReview,
    finishingPlan: result.finishingPlan,
    artifactSignals: result.artifactSignals,
    header: result.header ?? null,
    similarity: result.similarity,
    decision: result.decision,
    blockers: result.blockers,
    warnings: result.warnings,
    visualReviewRequired: true,
    visualChecklist: result.visualChecklist,
  });
}

function reviewEvidenceFromReceipt(value) {
  return Object.freeze({
    integrityContract: value.reviewEvidenceIntegrityContract,
    reviewEngineContract: value.reviewEngineContract,
    intendedRole: value.intendedRole ?? null,
    declaredProfile: value.declaredProfile ?? null,
    filename: value.filename,
    resolvedProfile: value.resolvedProfile,
    profileReason: value.profileReason,
    quality: value.quality,
    defectReview: value.defectReview,
    finishingPlan: value.finishingPlan,
    artifactSignals: value.artifactSignals,
    header: value.header ?? null,
    similarity: value.similarity,
    decision: value.decision,
    blockers: value.blockers,
    warnings: value.warnings,
    visualReviewRequired: value.visualReviewRequired,
    visualChecklist: value.visualChecklist,
  });
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

  const filename = typeof args.filename === "string" && args.filename.trim() ? args.filename : path.basename(source.path);
  const result = await orchestrateImageReview(source.bytes, {
    ...(args.intendedRole ? { intendedRole: args.intendedRole } : {}),
    ...(args.declaredProfile ? { declaredProfile: args.declaredProfile } : {}),
    filename,
    ...(comparisons.length ? { compareAgainst: comparisons } : {}),
  });
  const reviewEvidence = reviewEvidenceFromResult({ result, intendedRole: args.intendedRole, declaredProfile: args.declaredProfile, filename });
  const reviewEvidenceSha256 = digestReviewEvidence(reviewEvidence);

  const receipt = Object.freeze({
    contract: RECEIPT_CONTRACT,
    reviewEngineContract: REVIEW_ENGINE_CONTRACT,
    reviewEvidenceIntegrityContract: REVIEW_EVIDENCE_INTEGRITY_CONTRACT,
    reviewEvidenceSha256,
    sourceBinding: Object.freeze({ path: source.path, sha256: source.sha256, byteLength: source.byteLength }),
    comparisonBindings: Object.freeze(compareBindings),
    intendedRole: args.intendedRole ?? null,
    declaredProfile: args.declaredProfile ?? null,
    filename,
    resolvedProfile: result.profile,
    profileReason: result.profileReason,
    quality: result.quality,
    defectReview: result.defectReview,
    finishingPlan: result.finishingPlan,
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
        ? `Visually confirm the review-only finishing route ${result.finishingPlan.route}, then use the smallest preservation-first operation and rerun source-vs-edit review.`
        : "Perform mandatory visual/semantic review at intended runtime size before any promotion decision.",
  });
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeCreateOnlyBundle([{ path: receiptPath, data: payload, encoding: "utf8" }]);

  return Object.freeze({ ok: true, receiptPath, receiptSha256: sha256(Buffer.from(payload, "utf8")), sourceBinding: receipt.sourceBinding, reviewEvidenceSha256, decision: result.decision, finishingRoute: result.finishingPlan.route, blockers: result.blockers, warnings: result.warnings, visualReviewRequired: true, publicationAllowed: false });
}

async function verifySession(args) {
  if (typeof args.receiptPath !== "string") throw new Error("receiptPath is required.");
  const receiptFile = await bindInput(args.receiptPath, "receiptPath");
  const value = JSON.parse(receiptFile.bytes.toString("utf8"));
  if (value.contract !== RECEIPT_CONTRACT) throw new Error("Unsupported image-review session receipt contract.");
  if (value.reviewEngineContract !== REVIEW_ENGINE_CONTRACT) throw new Error("Image-review receipt was produced by an unsupported review engine.");
  if (value.reviewEvidenceIntegrityContract !== REVIEW_EVIDENCE_INTEGRITY_CONTRACT || !/^[0-9a-f]{64}$/u.test(String(value.reviewEvidenceSha256 ?? ""))) throw new Error("Image-review receipt is missing canonical review-evidence integrity metadata.");
  if (!value.finishingPlan || value.finishingPlan.automaticRepairAllowed !== false || value.finishingPlan.visualConfirmationRequired !== true) throw new Error("Image-review receipt is missing the governed review-only finishing plan.");
  if (value.visualReviewRequired !== true || value.approvalState !== "unapproved" || value.sourceMutationPerformed !== false || value.publicationAllowed !== false || value.cloudOverwriteAllowed !== false || value.websiteMutationAllowed !== false) throw new Error("Image-review receipt carries forbidden promotion or mutation authority.");
  if (typeof value.filename !== "string" || !value.filename.trim()) throw new Error("Image-review receipt is missing the filename input required for deterministic recomputation.");

  const storedEvidence = reviewEvidenceFromReceipt(value);
  const storedEvidenceSha256 = digestReviewEvidence(storedEvidence);
  if (storedEvidenceSha256 !== value.reviewEvidenceSha256) throw new Error("Image-review receipt review evidence was modified after review.");

  const source = await bindInput(value.sourceBinding?.path, "sourceBinding");
  if (source.sha256 !== value.sourceBinding?.sha256 || source.byteLength !== value.sourceBinding?.byteLength) throw new Error("Image-review source bytes changed after review.");

  const comparisons = [];
  for (const item of value.comparisonBindings ?? []) {
    const current = await bindInput(item.path, `comparisonBinding:${item.id}`);
    if (current.sha256 !== item.sha256 || current.byteLength !== item.byteLength) throw new Error(`Comparison source ${JSON.stringify(item.id)} changed after review.`);
    comparisons.push({ id: item.id, image: current.bytes });
  }

  const recomputed = await orchestrateImageReview(source.bytes, {
    ...(value.intendedRole ? { intendedRole: value.intendedRole } : {}),
    ...(value.declaredProfile ? { declaredProfile: value.declaredProfile } : {}),
    filename: value.filename,
    ...(comparisons.length ? { compareAgainst: comparisons } : {}),
  });
  const recomputedEvidence = reviewEvidenceFromResult({ result: recomputed, intendedRole: value.intendedRole ?? undefined, declaredProfile: value.declaredProfile ?? undefined, filename: value.filename });
  const recomputedEvidenceSha256 = digestReviewEvidence(recomputedEvidence);
  if (recomputedEvidenceSha256 !== value.reviewEvidenceSha256) throw new Error("Image-review evidence no longer matches deterministic review-engine recomputation.");

  return Object.freeze({
    ok: true,
    receiptPath: receiptFile.path,
    receiptSha256: receiptFile.sha256,
    sourceBindingVerified: true,
    comparisonBindingsVerified: true,
    finishingPlanVerified: true,
    reviewEvidenceIntegrityVerified: true,
    reviewEvidenceRecomputedAndMatched: true,
    reviewEvidenceSha256: value.reviewEvidenceSha256,
    decision: value.decision,
    finishingRoute: value.finishingPlan.route,
    approvalState: value.approvalState,
    publicationAllowed: false,
  });
}

const tools = Object.freeze([
  Object.freeze({ name: "evavo_image_review_session_capabilities", description: "Describe durable source-bound unified image-review receipts with canonical evidence integrity and deterministic review-engine recomputation.", inputSchema: { type: "object", properties: {}, additionalProperties: false } }),
  Object.freeze({ name: "evavo_create_image_review_session", description: "Persist exact-byte-bound unified image QA plus canonical reviewEvidenceSha256. Never grants repair or promotion authority.", inputSchema: { type: "object", properties: { inputPath: { type: "string", minLength: 1 }, receiptPath: { type: "string", minLength: 1 }, intendedRole: { type: "string", enum: [...ROLES] }, declaredProfile: { type: "string", enum: [...IMAGE_REVIEW_PROFILE_NAMES] }, filename: { type: "string" }, compareAgainst: { type: "array", maxItems: 24, items: { type: "object", required: ["id", "path"], properties: { id: { type: "string", minLength: 1 }, path: { type: "string", minLength: 1 } }, additionalProperties: false } }, confirmLocalWrite: { type: "boolean", const: true } }, required: ["inputPath", "receiptPath", "confirmLocalWrite"], additionalProperties: false } }),
  Object.freeze({ name: "evavo_verify_image_review_session", description: "Reverify source/comparison bytes, canonical review evidence and a full deterministic orchestrator recomputation before downstream use.", inputSchema: { type: "object", properties: { receiptPath: { type: "string", minLength: 1 } }, required: ["receiptPath"], additionalProperties: false } }),
]);
function capabilities() {
  return Object.freeze({ contract: RECEIPT_CONTRACT, serverVersion: SERVER_VERSION, reviewEngineContract: REVIEW_ENGINE_CONTRACT, reviewEvidenceIntegrityContract: REVIEW_EVIDENCE_INTEGRITY_CONTRACT, reviewEvidenceSha256Required: true, reviewEvidenceCanonicalDigestRequired: true, reviewEvidenceRecomputedDuringVerification: true, reviewEvidenceTamperRejected: true, filenameInputPersistedForRecomputation: true, finishingPlanPersisted: true, finishingPlanNeverAuthorizesRepair: true, sourceSha256AndLengthBound: true, comparisonSha256AndLengthBound: true, staleEvidenceVerification: true, createOnlyReceiptWrite: true, sourceMutationPerformed: false, visualReviewRequired: true, publicationAllowed: false, allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV), writesEnabled: writesEnabled() });
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
    const message = JSON.parse(line); let outgoing;
    if (message.method === "initialize") outgoing = response(message.id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } });
    else if (message.method === "notifications/initialized") outgoing = null;
    else if (message.method === "tools/list") outgoing = response(message.id, { tools });
    else if (message.method === "tools/call") { try { outgoing = response(message.id, toolResult(await callTool(message.params?.name, message.params?.arguments ?? {}))); } catch (error) { outgoing = response(message.id, toolResult({ ok: false, message: error instanceof Error ? error.message : String(error) }, true)); } }
    else outgoing = response(message.id, toolResult({ ok: false, message: `Unsupported method ${JSON.stringify(message.method)}.` }, true));
    if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`);
  } catch (error) { process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: String(error) }, true)))}\n`); }
}
