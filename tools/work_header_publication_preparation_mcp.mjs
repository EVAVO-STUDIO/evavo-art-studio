#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { reviewWorkMediaDiversity } from "../packages/media/dist/index.js";
import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-header-publication-preparation";
const SERVER_VERSION = "1.2.0";
const PROTOCOL_VERSION = "2025-03-26";
const CONTRACT = "evavo.work-header-publication-preparation.v1";
const SCHEMA_SHA256 = "90ccf22b01ae9a06b371eb3e9691e5d863d8492d9ef4a6c4a53e8c99bbe14d1c";
const SCHEMA_URL = new URL("../contracts/work-header-publication-preparation-v1.schema.json", import.meta.url);
const DIVERSITY_RECEIPT_CONTRACT = "evavo.work-media-diversity-receipt.v1_2";
const DIVERSITY_REVIEW_CONTRACT = "evavo.work-media-diversity.v1_2";
const STORY_MODEL = "work-story-archetype-v1";
const ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";
const TARGET_KINDS = new Set(["website-header-source-update", "cloudinary-stable-id-replacement"]);
const MAX_TARGET_IDENTIFIER = 512;
const MAX_NOTE = 2_000;
const allowed = (p, output = false) => assertAllowedLocalPath(p, { envName: ROOTS_ENV, output, label: "work header publication preparation" });
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const canonical = (value) => JSON.stringify(value);

async function assertCurrentSchemaDigest() {
  const bytes = await readFile(SCHEMA_URL);
  const current = sha256(bytes);
  if (current !== SCHEMA_SHA256) throw new Error(`Publication-preparation schema bytes drifted from the governed SHA-256 (${current}).`);
  return Object.freeze({ sha256: current, byteLength: bytes.length });
}
async function bound(filePath) {
  const resolved = await allowed(filePath, false);
  const bytes = await readFile(resolved);
  if (!bytes.length) throw new Error(`Evidence file is empty: ${resolved}`);
  return Object.freeze({ path: resolved, bytes, sha256: sha256(bytes), byteLength: bytes.length });
}
function boundedText(value, label, max) {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  const text = value.trim();
  if (!text || text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) throw new Error(`${label} must contain 1-${max} safe characters.`);
  return text;
}
function assertNoMutationAuthority(value, label) {
  if (value?.publicationAllowed !== false || value?.cloudOverwriteAllowed !== false || value?.websiteMutationAllowed !== false) throw new Error(`${label} carries forbidden direct publication or mutation authority.`);
  if (value?.executionAllowed !== undefined && value.executionAllowed !== false) throw new Error(`${label} carries forbidden execution authority.`);
}

async function verifyDiversityReceipt(identity, route, candidateSha256, candidateByteLength) {
  if (!identity?.diversityReceiptPath || identity.storySimilarityModel !== STORY_MODEL) throw new Error("Approved decision is missing governed semantic story-diversity lineage.");
  const diversityFile = await bound(identity.diversityReceiptPath);
  if (diversityFile.sha256 !== identity.diversityReceiptSha256 || diversityFile.byteLength !== identity.diversityReceiptByteLength) throw new Error("Semantic Work-media diversity receipt bytes changed after approval.");
  const receipt = JSON.parse(diversityFile.bytes.toString("utf8"));
  if (receipt.contract !== DIVERSITY_RECEIPT_CONTRACT || receipt.reviewContract !== DIVERSITY_REVIEW_CONTRACT || receipt.storySimilarityModel !== STORY_MODEL) throw new Error("Semantic Work-media diversity receipt contract/model is invalid or stale.");
  assertNoMutationAuthority(receipt, "Work-media diversity receipt");
  if (receipt.automaticReplacementAllowed !== false || receipt.visualReviewRequired !== true) throw new Error("Work-media diversity receipt carries unsafe automatic replacement state.");

  const sourceBindings = Array.isArray(receipt.sourceBindings) ? receipt.sourceBindings : [];
  if (sourceBindings.length < 3) throw new Error("Semantic Work-media diversity evidence must include the candidate and at least two comparison images.");
  const routeCount = new Set(sourceBindings.map((item) => item?.route).filter((value) => typeof value === "string" && value.startsWith("/work/"))).size;
  if (routeCount < 3) throw new Error("Semantic Work-media diversity evidence must span at least three Work routes.");
  const images = [];
  for (const binding of sourceBindings) {
    if (!binding?.id || !binding?.path || !binding?.sha256 || !Number.isInteger(binding?.byteLength)) throw new Error("Semantic Work-media diversity source binding is malformed.");
    const current = await bound(binding.path);
    if (current.sha256 !== binding.sha256 || current.byteLength !== binding.byteLength) throw new Error(`Semantic Work-media diversity source bytes changed: ${binding.id}.`);
    images.push({ id: binding.id, route: binding.route ?? undefined, role: binding.role ?? "other", story: binding.story ?? undefined, image: current.bytes });
  }
  const evidence = receipt.evidence ?? {};
  const recomputed = await reviewWorkMediaDiversity({
    images,
    nearDuplicateThreshold: evidence.nearDuplicateThreshold,
    reviewSimilarityThreshold: evidence.reviewSimilarityThreshold,
    storyCollisionThreshold: evidence.storyCollisionThreshold,
    storyReviewThreshold: evidence.storyReviewThreshold,
    requireStoryReview: true,
    maximumImages: Math.max(3, images.length),
  });
  if (recomputed.contract !== DIVERSITY_REVIEW_CONTRACT || canonical(recomputed.evidence) !== canonical(evidence)) throw new Error("Semantic Work-media diversity evidence changed on recomputation.");
  if (recomputed.evidence.storyReviewComplete !== true || recomputed.evidence.semanticStoryReviewPassed !== true || recomputed.evidence.storyDistinctnessPass !== true || recomputed.evidence.distinctnessPass !== true) throw new Error("Approved candidate no longer passes semantic Work-media story diversity.");
  if (recomputed.evidence.genericOrFillerItems.length || recomputed.evidence.crossRouteStoryCollisionCount || recomputed.evidence.crossRouteDuplicateCount || recomputed.evidence.crossRouteNearDuplicateCount) throw new Error("Approved candidate diversity evidence contains generic filler, repeated storytelling or cross-route duplicate imagery.");
  const candidateBinding = sourceBindings.find((binding) => binding.route === route && binding.role === "header" && binding.sha256 === candidateSha256 && binding.byteLength === candidateByteLength);
  if (!candidateBinding) throw new Error("Semantic Work-media diversity receipt does not contain the exact approved candidate as its route header.");
  if (!candidateBinding.story || candidateBinding.story.genericStockOrAiFiller === true || candidateBinding.story.specificity === "generic") throw new Error("Approved candidate story is missing, generic, stock-like or AI-filler-like.");
  return Object.freeze({ diversityFile, receipt, candidateBinding, evidence: recomputed.evidence });
}

async function verifyApprovedDecision(filePath) {
  const decisionFile = await bound(filePath);
  const decision = JSON.parse(decisionFile.bytes.toString("utf8"));
  if (decision.contract !== "evavo.work-header-approval-decision.v1" || decision.decision !== "approved" || decision.decisionSource !== "explicit-caller" || decision.automaticDecision !== false) throw new Error("Publication preparation requires an explicit approved Work-header decision receipt.");
  assertNoMutationAuthority(decision, "Approval decision receipt");
  for (const flag of ["publicationPreparationAllowed", "approvalPacketReverifiedBeforeDecision", "storyDiversityReceiptReverifiedBeforeDecision", "semanticStoryReviewPassed", "candidateNotGenericStockOrAiFiller", "crossRouteStoryCollisionRejected", "fullReceiptLineageVerified", "browserResponseMetadataVerified", "candidateBytesVerified"]) {
    if (decision[flag] !== true) throw new Error(`Approval decision lacks required verified state ${flag}.`);
  }
  const identity = decision.evidenceIdentity;
  if (!identity?.approvalPacketPath || decision.evidenceIdentitySha256 !== sha256(Buffer.from(canonical(identity), "utf8"))) throw new Error("Approval decision evidence identity digest is invalid.");

  const packetFile = await bound(identity.approvalPacketPath);
  if (packetFile.sha256 !== identity.approvalPacketSha256 || packetFile.byteLength !== identity.approvalPacketByteLength) throw new Error("Approval decision is bound to changed approval-packet bytes.");
  const packet = JSON.parse(packetFile.bytes.toString("utf8"));
  if (packet.contract !== "evavo.work-header-approval-packet.v2" || packet.approvalState !== "unapproved" || packet.fullReceiptLineageVerified !== true || packet.browserResponseBodyIdentityVerified !== true || packet.browserResponseMetadataBound !== true) throw new Error("Approval packet is invalid or no longer proves complete browser/receipt lineage.");
  assertNoMutationAuthority(packet, "Approval packet");

  const pageFile = await bound(packet.pageRenderReceiptPath);
  if (pageFile.sha256 !== packet.pageRenderReceiptSha256 || pageFile.byteLength !== packet.pageRenderReceiptByteLength || pageFile.sha256 !== identity.pageRenderReceiptSha256) throw new Error("Publication preparation page-render lineage is stale.");
  const page = JSON.parse(pageFile.bytes.toString("utf8"));
  if (page.contract !== "evavo.work-header-page-render-review.v2" || page.approvalState !== "unapproved" || page.previewAdmissionFullyReverified !== true || page.fullReceiptLineageVerified !== true || page.browserResponseBodyIdentityVerified !== true || page.browserResponseMetadataBound !== true || page.exactPreviewedCandidateBytesMatchedSelectedCandidate !== true) throw new Error("Page-render receipt no longer proves the fully verified selected candidate/browser lineage.");
  assertNoMutationAuthority(page, "Page-render receipt");

  const selectionFile = await bound(packet.selectionReceiptPath);
  if (selectionFile.sha256 !== packet.selectionReceiptSha256 || selectionFile.byteLength !== packet.selectionReceiptByteLength || selectionFile.sha256 !== identity.selectionReceiptSha256 || selectionFile.sha256 !== page.selectionReceiptSha256 || selectionFile.byteLength !== page.selectionReceiptByteLength) throw new Error("Publication preparation selection lineage is stale.");
  const selection = JSON.parse(selectionFile.bytes.toString("utf8"));
  if (selection.contract !== "evavo.work-header-selection-resolver.v1" || selection.recommendation !== "candidate-recommended") throw new Error("Selection receipt no longer recommends an exact candidate.");
  assertNoMutationAuthority(selection, "Selection receipt");

  const candidateReviewFile = await bound(packet.candidateReviewReceiptPath);
  if (candidateReviewFile.sha256 !== packet.candidateReviewReceiptSha256 || candidateReviewFile.byteLength !== packet.candidateReviewReceiptByteLength || candidateReviewFile.sha256 !== identity.candidateReviewReceiptSha256 || candidateReviewFile.sha256 !== page.candidateReviewReceiptSha256 || candidateReviewFile.byteLength !== page.candidateReviewReceiptByteLength) throw new Error("Publication preparation candidate-review lineage is stale.");
  const previewFile = await bound(packet.previewAdmissionReceiptPath);
  if (previewFile.sha256 !== packet.previewAdmissionReceiptSha256 || previewFile.byteLength !== packet.previewAdmissionReceiptByteLength || previewFile.sha256 !== identity.previewAdmissionReceiptSha256 || previewFile.sha256 !== page.previewAdmissionReceiptSha256 || previewFile.byteLength !== page.previewAdmissionReceiptByteLength) throw new Error("Publication preparation preview-admission lineage is stale.");
  const preview = JSON.parse(previewFile.bytes.toString("utf8"));
  if (preview.contract !== "evavo.work-header-preview-admission.v1" || preview.approvalState !== "unapproved" || preview.immutableCandidateContentArtifactVerified !== true || preview.browserResponseBodyIdentityVerified !== true || preview.browserResponseMetadataBound !== true || preview.atomicPreviewEvidenceBundleVerified !== true || preview.exactCandidateResponseBytesVerified !== true) throw new Error("Preview-admission receipt no longer proves exact immutable/browser candidate evidence.");
  assertNoMutationAuthority(preview, "Preview-admission receipt");

  const artifactFile = await bound(packet.immutablePreviewCandidateArtifactPath);
  if (artifactFile.sha256 !== packet.immutablePreviewCandidateArtifactSha256 || artifactFile.byteLength !== packet.immutablePreviewCandidateArtifactByteLength || artifactFile.sha256 !== identity.candidateSha256 || artifactFile.byteLength !== identity.candidateByteLength) throw new Error("Publication preparation immutable candidate bytes changed.");
  if (selection.recommendedCandidateSha256 !== artifactFile.sha256 || selection.recommendedCandidateId !== identity.candidateId) throw new Error("Publication preparation candidate identity no longer matches selection.");
  if (page.evidence?.candidateSha256 !== artifactFile.sha256 || page.evidence?.candidateId !== identity.candidateId || page.evidence?.pageSlug !== identity.route) throw new Error("Publication preparation page evidence drifted from the approved candidate identity.");
  const proofFile = await bound(page.proofPath);
  if (proofFile.sha256 !== page.proofSha256 || proofFile.byteLength !== page.proofByteLength) throw new Error("Publication preparation page-render proof bytes changed.");
  for (const [label, binding] of Object.entries(page.sourceBindings ?? {})) {
    if (!binding?.path) throw new Error(`Publication preparation source binding ${label} is malformed.`);
    const current = await bound(binding.path);
    if (current.sha256 !== binding.sha256 || current.byteLength !== binding.byteLength) throw new Error(`Publication preparation source binding ${label} changed.`);
  }
  if (canonical(packet.browserResponseBindings) !== canonical(page.browserResponseBindings) || canonical(packet.browserResponseBindings) !== canonical(preview.browserResponseBindings)) throw new Error("Publication preparation responsive Chrome response metadata drifted across durable receipts.");

  const diversity = await verifyDiversityReceipt(identity, identity.route, artifactFile.sha256, artifactFile.byteLength);
  return Object.freeze({ decisionFile, decision, identity, packetFile, packet, pageFile, page, selectionFile, selection, candidateReviewFile, previewFile, preview, artifactFile, proofFile, diversityFile: diversity.diversityFile, diversityReceipt: diversity.receipt, route: identity.route, candidateId: identity.candidateId, candidateSha256: artifactFile.sha256, candidateByteLength: artifactFile.byteLength, browserResponseBindings: packet.browserResponseBindings, fullReceiptLineageVerified: true, semanticStoryDiversityVerified: true });
}

function preparationIdentity(review, targetKind, targetIdentifier) {
  return Object.freeze({
    approvalDecisionPath: review.decisionFile.path,
    approvalDecisionSha256: review.decisionFile.sha256,
    approvalDecisionByteLength: review.decisionFile.byteLength,
    approvalPacketSha256: review.packetFile.sha256,
    pageRenderReceiptSha256: review.pageFile.sha256,
    selectionReceiptSha256: review.selectionFile.sha256,
    candidateReviewReceiptSha256: review.candidateReviewFile.sha256,
    previewAdmissionReceiptSha256: review.previewFile.sha256,
    diversityReceiptPath: review.diversityFile.path,
    diversityReceiptSha256: review.diversityFile.sha256,
    diversityReceiptByteLength: review.diversityFile.byteLength,
    storySimilarityModel: STORY_MODEL,
    candidateSha256: review.candidateSha256,
    candidateByteLength: review.candidateByteLength,
    route: review.route,
    candidateId: review.candidateId,
    targetKind,
    targetIdentifier,
  });
}

async function preparePublication(args) {
  await assertCurrentSchemaDigest();
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required to create a publication-preparation receipt.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);
  if (!TARGET_KINDS.has(args.targetKind)) throw new Error("targetKind must be website-header-source-update or cloudinary-stable-id-replacement.");
  const targetIdentifier = boundedText(args.targetIdentifier, "targetIdentifier", MAX_TARGET_IDENTIFIER);
  const preparationNote = boundedText(args.preparationNote, "preparationNote", MAX_NOTE);
  const review = await verifyApprovedDecision(args.approvalDecisionReceiptPath);
  if (!/^\/work\/[a-z0-9-]+$/u.test(String(review.route ?? ""))) throw new Error("Approved decision is missing a canonical Work route.");
  const identity = preparationIdentity(review, args.targetKind, targetIdentifier);
  const receipt = {
    contract: CONTRACT,
    schemaSha256: SCHEMA_SHA256,
    preparationState: "prepared-unexecuted",
    targetKind: args.targetKind,
    targetIdentifier,
    preparationNote,
    preparedAt: new Date().toISOString(),
    preparationIdentity: identity,
    preparationIdentitySha256: sha256(Buffer.from(canonical(identity), "utf8")),
    approvalDecisionReverifiedBeforePreparation: true,
    explicitReviewerApprovalRequiredAndVerified: true,
    fullReceiptLineageVerified: true,
    browserResponseMetadataVerified: true,
    candidateBytesVerified: true,
    semanticStoryDiversityVerified: true,
    diversityReceiptSha256AndLengthBound: true,
    backupRequiredBeforeExecution: true,
    rollbackEvidenceRequiredBeforeExecution: true,
    stableUrlOrPublicIdPreservationRequired: args.targetKind === "cloudinary-stable-id-replacement",
    sourceCodeBackupOrRevertPointRequired: args.targetKind === "website-header-source-update",
    executionAllowed: false,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
    nextRequiredAction: "Create a separate governed publication transaction that re-verifies this semantic-diversity-bound preparation receipt, captures the current target as backup/rollback evidence, and requires explicit execution confirmation before any website or Cloudinary mutation.",
  };
  const receiptPath = await allowed(args.receiptPath, true);
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeCreateOnlyBundle([{ path: receiptPath, data: payload, encoding: "utf8" }]);
  return Object.freeze({ ok: true, receiptPath, receiptSha256: sha256(Buffer.from(payload, "utf8")), schemaSha256: SCHEMA_SHA256, route: review.route, candidateId: review.candidateId, candidateSha256: review.candidateSha256, diversityReceiptSha256: review.diversityFile.sha256, semanticStoryDiversityVerified: true, targetKind: args.targetKind, targetIdentifier, preparationState: receipt.preparationState, executionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

async function verifyPreparation(receiptPath) {
  await assertCurrentSchemaDigest();
  const preparationFile = await bound(receiptPath);
  const value = JSON.parse(preparationFile.bytes.toString("utf8"));
  if (value.contract !== CONTRACT || value.schemaSha256 !== SCHEMA_SHA256 || value.preparationState !== "prepared-unexecuted" || !TARGET_KINDS.has(value.targetKind)) throw new Error("Publication-preparation receipt contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(value, "Publication-preparation receipt");
  for (const flag of ["backupRequiredBeforeExecution", "rollbackEvidenceRequiredBeforeExecution", "approvalDecisionReverifiedBeforePreparation", "explicitReviewerApprovalRequiredAndVerified", "fullReceiptLineageVerified", "browserResponseMetadataVerified", "candidateBytesVerified", "semanticStoryDiversityVerified", "diversityReceiptSha256AndLengthBound"]) if (value[flag] !== true) throw new Error(`Publication-preparation receipt lacks required verified state ${flag}.`);
  if (value.executionAllowed !== false) throw new Error("Publication-preparation receipt must remain unexecuted.");
  boundedText(value.targetIdentifier, "targetIdentifier", MAX_TARGET_IDENTIFIER);
  boundedText(value.preparationNote, "preparationNote", MAX_NOTE);
  const identity = value.preparationIdentity;
  if (!identity?.approvalDecisionPath || value.preparationIdentitySha256 !== sha256(Buffer.from(canonical(identity), "utf8"))) throw new Error("Publication-preparation identity digest is invalid.");
  if (identity.targetKind !== value.targetKind || identity.targetIdentifier !== value.targetIdentifier) throw new Error("Publication-preparation target identity drifted.");
  const review = await verifyApprovedDecision(identity.approvalDecisionPath);
  const expected = preparationIdentity(review, value.targetKind, value.targetIdentifier);
  if (canonical(identity) !== canonical(expected)) throw new Error("Publication preparation is bound to stale or changed approval, diversity or candidate lineage.");
  if (value.stableUrlOrPublicIdPreservationRequired !== (value.targetKind === "cloudinary-stable-id-replacement")) throw new Error("Publication-preparation stable-public-ID requirement is inconsistent.");
  if (value.sourceCodeBackupOrRevertPointRequired !== (value.targetKind === "website-header-source-update")) throw new Error("Publication-preparation website rollback requirement is inconsistent.");
  return Object.freeze({ ok: true, receiptPath: preparationFile.path, receiptSha256: preparationFile.sha256, receiptByteLength: preparationFile.byteLength, schemaSha256: SCHEMA_SHA256, schemaDigestVerified: true, route: review.route, candidateId: review.candidateId, candidateSha256: review.candidateSha256, candidateByteLength: review.candidateByteLength, diversityReceiptSha256: review.diversityFile.sha256, semanticStoryDiversityVerified: true, diversityReceiptSha256AndLengthBound: true, targetKind: value.targetKind, targetIdentifier: value.targetIdentifier, approvalDecisionReverifiedAndMatched: true, fullReceiptLineageVerified: true, backupRequiredBeforeExecution: true, rollbackEvidenceRequiredBeforeExecution: true, executionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

const tools = [
  { name: "evavo_work_header_publication_preparation_capabilities", description: "Describe schema-bound non-executing Work-header publication preparation. It now requires the exact approved candidate to retain recomputed semantic cross-route story diversity, not merely pixel distinctness.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_prepare_work_header_publication", description: "Create a schema-bound publication-preparation receipt after re-verifying explicit reviewer approval, exact candidate/browser lineage and the SHA/length-bound semantic Work-media diversity receipt. It never mutates website source or Cloudinary.", inputSchema: { type: "object", properties: { approvalDecisionReceiptPath: { type: "string", minLength: 1 }, receiptPath: { type: "string", minLength: 1 }, targetKind: { type: "string", enum: ["website-header-source-update", "cloudinary-stable-id-replacement"] }, targetIdentifier: { type: "string", minLength: 1, maxLength: MAX_TARGET_IDENTIFIER }, preparationNote: { type: "string", minLength: 1, maxLength: MAX_NOTE }, confirmLocalWrite: { type: "boolean" } }, required: ["approvalDecisionReceiptPath", "receiptPath", "targetKind", "targetIdentifier", "preparationNote", "confirmLocalWrite"], additionalProperties: false } },
  { name: "evavo_verify_work_header_publication_preparation", description: "Read-only reverification of physical schema bytes, approved decision, semantic story diversity, exact candidate bytes and complete downstream evidence lineage.", inputSchema: { type: "object", properties: { receiptPath: { type: "string", minLength: 1 } }, required: ["receiptPath"], additionalProperties: false } },
];
function capabilities() {
  return Object.freeze({ contract: CONTRACT, serverVersion: SERVER_VERSION, schemaPath: "contracts/work-header-publication-preparation-v1.schema.json", schemaSha256: SCHEMA_SHA256, physicalSchemaDigestRequired: true, receiptSchemaDigestRequired: true, explicitApprovedDecisionRequired: true, approvalDecisionReverificationRequired: true, semanticStoryDiversityRequired: true, diversityReceiptContract: DIVERSITY_RECEIPT_CONTRACT, diversityReviewContract: DIVERSITY_REVIEW_CONTRACT, storySimilarityModel: STORY_MODEL, diversityReceiptSha256AndLengthBound: true, exactApprovedCandidateHeaderBindingRequired: true, genericStockOrAiFillerForbidden: true, crossRouteStoryCollisionForbidden: true, crossRoutePerceptualDuplicateForbidden: true, fullReceiptLineageRequired: true, exactCandidateBytesRequired: true, responsiveBrowserResponseMetadataRequired: true, backupRequiredBeforeExecution: true, rollbackEvidenceRequiredBeforeExecution: true, stableUrlOrPublicIdPreservationRequiredForCloudinary: true, sourceCodeBackupOrRevertPointRequiredForWebsite: true, createOnlyPreparationReceipt: true, rollbackSafePreparationReceiptWrite: true, executionAllowed: false, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false, allowedRootCount: configuredLocalRootCount(ROOTS_ENV), writesEnabled: writesEnabled() });
}
async function callTool(name, args) {
  if (name === "evavo_work_header_publication_preparation_capabilities") return capabilities();
  if (name === "evavo_prepare_work_header_publication") return preparePublication(args ?? {});
  if (name === "evavo_verify_work_header_publication_preparation") return verifyPreparation(args?.receiptPath);
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
