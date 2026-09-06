#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import {
  ENHANCEMENT_ART_REVIEW_SCHEMA_SHA256,
  admitEnhancementStudioReviewManifest,
  reviewEnhancementStudioCandidate,
} from "../packages/media/dist/index.js";
import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-enhancement-review-session";
const SERVER_VERSION = "1.6.0";
const PROTOCOL_VERSION = "2025-03-26";
const ROOTS_ENV = "EVAVO_EXISTING_IMAGE_POLISH_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_EXISTING_IMAGE_POLISH_ALLOW_WRITES";
const allowed = (path, output = false) => assertAllowedLocalPath(path, { envName: ROOTS_ENV, output, label: "enhancement review session" });
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function bound(path, label = "file") {
  const resolved = await allowed(path, false);
  const bytes = await readFile(resolved);
  if (!bytes.length) throw new Error(`${label} is empty.`);
  return { path: resolved, bytes, sha256: sha256(bytes), byteLength: bytes.length };
}
async function optionalBuffer(path) { return path ? (await bound(path, "optional image")).bytes : undefined; }

async function verifyImageReviewSessionReceipt(path, manifest, admittedManifest, sourceFile, candidateFile) {
  const receipt = await bound(path, "imageReviewSessionReceiptPath");
  const value = JSON.parse(receipt.bytes.toString("utf8"));
  if (value.contract !== "evavo.image-review-session.v1_1") throw new Error("imageReviewSessionReceiptPath must point to an evavo.image-review-session.v1_1 receipt.");
  if (value.reviewEngineContract !== "evavo_image_review_orchestrator_v1_3") throw new Error("Image-review receipt was produced by an unsupported review engine contract.");
  if (!value.finishingPlan || value.finishingPlan.automaticRepairAllowed !== false || value.finishingPlan.visualConfirmationRequired !== true) throw new Error("Durable image-review receipt is missing the governed preservation-first finishing plan.");
  if (value.approvalState !== "unapproved" || value.publicationAllowed !== false || value.cloudOverwriteAllowed !== false || value.websiteMutationAllowed !== false) throw new Error("Image-review receipt carries forbidden approval or mutation authority.");
  if (value.visualReviewRequired !== true) throw new Error("Image-review receipt must preserve mandatory visual review.");

  const binding = value.sourceBinding;
  if (!binding || typeof binding.path !== "string" || typeof binding.sha256 !== "string" || !Number.isInteger(binding.byteLength)) throw new Error("Image-review receipt source binding is malformed.");
  const rebound = await bound(binding.path, "image review source binding");
  if (rebound.sha256 !== binding.sha256 || rebound.byteLength !== binding.byteLength) throw new Error("Image-review receipt source bytes changed after review.");
  if (rebound.path !== candidateFile.path || rebound.sha256 !== candidateFile.sha256 || rebound.byteLength !== candidateFile.byteLength) throw new Error("Durable image-review session is not bound to the exact enhancement candidate bytes.");
  if (binding.sha256 !== admittedManifest.candidateSha256 || binding.sha256 !== manifest.candidate_sha256) throw new Error("Durable image-review session candidate SHA does not match admitted Enhancement Studio manifest.");
  if (value.resolvedProfile !== admittedManifest.profile || value.resolvedProfile !== manifest.art_studio_review_profile) throw new Error("Durable image-review session profile does not match admitted Enhancement Studio manifest review profile.");

  let immutableSourceBound = false;
  for (const item of value.comparisonBindings ?? []) {
    if (!item || typeof item.id !== "string" || typeof item.path !== "string") throw new Error("Image-review comparison binding is malformed.");
    const comparison = await bound(item.path, `comparisonBinding:${item.id}`);
    if (comparison.sha256 !== item.sha256 || comparison.byteLength !== item.byteLength) throw new Error(`Image-review comparison source ${JSON.stringify(item.id)} changed after review.`);
    if (comparison.path === sourceFile.path && comparison.sha256 === sourceFile.sha256 && comparison.byteLength === sourceFile.byteLength) immutableSourceBound = true;
  }
  if (!immutableSourceBound) throw new Error("Durable image-review session must include the exact immutable enhancement source as a comparison binding.");
  if (sourceFile.sha256 !== admittedManifest.sourceSha256 || sourceFile.sha256 !== manifest.source_sha256) throw new Error("Durable review source comparison no longer matches admitted Enhancement Studio manifest source SHA.");
  return { path: receipt.path, sha256: receipt.sha256, value, immutableSourceBound: true, finishingPlanVerified: true };
}

async function runReview(args) {
  if (typeof args.manifestPath !== "string" || typeof args.imageReviewSessionReceiptPath !== "string" || typeof args.outputPrefix !== "string") throw new Error("manifestPath, imageReviewSessionReceiptPath and outputPrefix are required.");
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);

  const manifestFile = await bound(await allowed(args.manifestPath, false), "manifestPath");
  const manifest = JSON.parse(manifestFile.bytes.toString("utf8"));

  // Admit the manifest before trusting any path supplied by it. This validates
  // contract/schema digest, safety authority, role/profile mapping and geometry.
  const admittedManifest = admitEnhancementStudioReviewManifest(manifest);
  if (manifest.schema_sha256 !== ENHANCEMENT_ART_REVIEW_SCHEMA_SHA256) throw new Error("Enhancement Studio manifest schema digest is stale or unsupported.");
  if (admittedManifest.schemaSha256 !== ENHANCEMENT_ART_REVIEW_SCHEMA_SHA256) throw new Error("Art Studio manifest admission did not verify the current enhancement-review schema digest.");
  if (admittedManifest.durableImageReviewSessionRequired !== true) throw new Error("Enhancement Studio manifest does not require the durable image-review session boundary.");

  const [sourceFile, candidateFile] = await Promise.all([
    bound(await allowed(manifest.source_path, false), "source image"),
    bound(await allowed(manifest.candidate_path, false), "candidate image"),
  ]);
  if (sourceFile.sha256 !== admittedManifest.sourceSha256 || sourceFile.sha256 !== manifest.source_sha256) throw new Error("Physical source bytes do not match admitted Enhancement Studio manifest.");
  if (candidateFile.sha256 !== admittedManifest.candidateSha256 || candidateFile.sha256 !== manifest.candidate_sha256) throw new Error("Physical candidate bytes do not match admitted Enhancement Studio manifest.");

  const imageReviewSession = await verifyImageReviewSessionReceipt(args.imageReviewSessionReceiptPath, manifest, admittedManifest, sourceFile, candidateFile);
  const prefix = await allowed(args.outputPrefix, true);
  const result = await reviewEnhancementStudioCandidate({
    manifest,
    source: sourceFile.bytes,
    candidate: candidateFile.bytes,
    header: await optionalBuffer(args.headerPath),
    support: await optionalBuffer(args.supportPath),
    tile: await optionalBuffer(args.tilePath),
    desktopScreenshot: await optionalBuffer(args.desktopScreenshotPath),
    mobileScreenshot: await optionalBuffer(args.mobileScreenshotPath),
  });

  const qualityProofPath = `${prefix}.quality-proof.png`;
  const differenceProofPath = `${prefix}.difference-proof.png`;
  const pageProofPath = result.pageProofPng ? `${prefix}.page-proof.png` : null;
  const receiptPath = `${prefix}.receipt.json`;
  const receipt = {
    contract: "evavo.enhancement-art-review-session.v1_4",
    manifestPath: manifestFile.path,
    manifestSha256: manifestFile.sha256,
    manifestContract: manifest.contract,
    manifestSchemaSha256: admittedManifest.schemaSha256,
    manifestAdmissionVerified: true,
    manifestGeometryPreservationVerified: true,
    candidateAspectRatioRelativeDrift: admittedManifest.candidateAspectRatioRelativeDrift,
    sourceBinding: { path: sourceFile.path, sha256: sourceFile.sha256, byteLength: sourceFile.byteLength },
    candidateBinding: { path: candidateFile.path, sha256: candidateFile.sha256, byteLength: candidateFile.byteLength },
    imageReviewSessionReceiptPath: imageReviewSession.path,
    imageReviewSessionReceiptSha256: imageReviewSession.sha256,
    imageReviewSessionVerified: true,
    immutableSourceComparisonBindingVerified: true,
    finishingPlanVerified: true,
    finishingPlan: imageReviewSession.value.finishingPlan,
    qualityProofPath,
    differenceProofPath,
    pageProofPath,
    evidence: result.evidence,
    approvalState: "unapproved",
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
    finalVisualApprovalRequired: true,
  };
  await writeCreateOnlyBundle([
    { path: qualityProofPath, data: result.qualityProofPng },
    { path: differenceProofPath, data: result.differenceProofPng },
    ...(result.pageProofPng && pageProofPath ? [{ path: pageProofPath, data: result.pageProofPng }] : []),
    { path: receiptPath, data: `${JSON.stringify(receipt, null, 2)}\n`, encoding: "utf8" },
  ]);
  return {
    ok: true,
    receiptPath,
    qualityProofPath,
    differenceProofPath,
    pageProofPath,
    manifestAdmissionVerified: true,
    manifestSchemaSha256: admittedManifest.schemaSha256,
    manifestGeometryPreservationVerified: true,
    imageReviewSessionReceiptPath: imageReviewSession.path,
    imageReviewSessionReceiptSha256: imageReviewSession.sha256,
    immutableSourceComparisonBindingVerified: true,
    finishingPlanVerified: true,
    finishingRoute: imageReviewSession.value.finishingPlan.route,
    evidence: result.evidence,
  };
}

const tools = [
  { name: "evavo_enhancement_review_session_capabilities", description: "Describe end-to-end enhancement review with fail-closed manifest admission plus durable candidate/source and finishing-plan lineage.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_review_enhancement_candidate_end_to_end", description: "Admit the exact Enhancement Studio manifest before trusting any manifest path, verify its pinned schema digest and geometry/safety contract, then verify exact candidate/source bytes and a current durable image-review receipt before rollback-safe review evidence is written.", inputSchema: { type: "object", properties: { manifestPath: { type: "string", minLength: 1 }, imageReviewSessionReceiptPath: { type: "string", minLength: 1 }, outputPrefix: { type: "string", minLength: 1 }, headerPath: { type: "string" }, supportPath: { type: "string" }, tilePath: { type: "string" }, desktopScreenshotPath: { type: "string" }, mobileScreenshotPath: { type: "string" }, confirmLocalWrite: { type: "boolean" } }, required: ["manifestPath", "imageReviewSessionReceiptPath", "outputPrefix", "confirmLocalWrite"], additionalProperties: false } },
];
function capabilities() {
  return {
    contract: "evavo.enhancement-art-review-session.v1_4",
    serverVersion: SERVER_VERSION,
    allowedRootCount: configuredLocalRootCount(ROOTS_ENV),
    writesEnabled: writesEnabled(),
    manifestAdmissionBeforeManifestPathReads: true,
    exactManifestSchemaDigestRequired: true,
    requiredManifestSchemaSha256: ENHANCEMENT_ART_REVIEW_SCHEMA_SHA256,
    manifestGeometryPreservationRequired: true,
    durableImageReviewSessionRequired: true,
    requiredImageReviewSessionContract: "evavo.image-review-session.v1_1",
    requiredImageReviewEngineContract: "evavo_image_review_orchestrator_v1_3",
    exactCandidateReviewSessionBindingRequired: true,
    immutableSourceComparisonBindingRequired: true,
    finishingPlanRequired: true,
    finishingPlanMustRemainReviewOnly: true,
    imageReviewSessionProfileMustMatchManifest: true,
    staleImageReviewSessionRejected: true,
    rollbackSafeReviewArtifactBundle: true,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    automaticCreativeApproval: false,
  };
}
async function callTool(name, args) {
  if (name === "evavo_enhancement_review_session_capabilities") return capabilities();
  if (name === "evavo_review_enhancement_candidate_end_to_end") return runReview(args ?? {});
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}
const toolResult = (payload, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError });
const response = (id, result) => ({ jsonrpc: "2.0", id, result });
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
