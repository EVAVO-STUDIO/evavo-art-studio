#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-header-approval-decision";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const CONTRACT = "evavo.work-header-approval-decision.v1";
const ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";
const MAX_REVIEWER_LABEL = 160;
const MAX_NOTE = 2_000;
const DECISIONS = new Set(["approved", "rejected"]);
const allowed = (p, output = false) => assertAllowedLocalPath(p, { envName: ROOTS_ENV, output, label: "work header approval decision" });
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const canonical = (value) => JSON.stringify(value);

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
  if (value?.publicationAllowed !== false || value?.cloudOverwriteAllowed !== false || value?.websiteMutationAllowed !== false) throw new Error(`${label} carries forbidden publication or mutation authority.`);
}

async function verifyApprovalPacket(filePath) {
  const packetFile = await bound(filePath);
  const packet = JSON.parse(packetFile.bytes.toString("utf8"));
  if (packet.contract !== "evavo.work-header-approval-packet.v2" || packet.approvalState !== "unapproved") throw new Error("approvalPacketReceiptPath must point to an unapproved Work-header approval packet v2 receipt.");
  assertNoMutationAuthority(packet, "Approval packet");
  if (packet.fullReceiptLineageVerified !== true || packet.browserResponseBodyIdentityVerified !== true || packet.browserResponseMetadataBound !== true) throw new Error("Approval packet does not carry fully verified responsive browser/receipt lineage.");

  const page = await bound(packet.pageRenderReceiptPath);
  if (page.sha256 !== packet.pageRenderReceiptSha256 || page.byteLength !== packet.pageRenderReceiptByteLength) throw new Error("Approval packet page-render receipt bytes changed.");
  const pageValue = JSON.parse(page.bytes.toString("utf8"));
  if (pageValue.contract !== "evavo.work-header-page-render-review.v2" || pageValue.approvalState !== "unapproved") throw new Error("Approval packet page-render receipt is invalid.");
  assertNoMutationAuthority(pageValue, "Page-render receipt");
  if (pageValue.previewAdmissionFullyReverified !== true || pageValue.fullReceiptLineageVerified !== true || pageValue.browserResponseBodyIdentityVerified !== true || pageValue.browserResponseMetadataBound !== true || pageValue.exactPreviewedCandidateBytesMatchedSelectedCandidate !== true) throw new Error("Page-render receipt no longer proves complete candidate/browser lineage.");

  const selection = await bound(packet.selectionReceiptPath);
  if (selection.sha256 !== packet.selectionReceiptSha256 || selection.byteLength !== packet.selectionReceiptByteLength || selection.sha256 !== pageValue.selectionReceiptSha256 || selection.byteLength !== pageValue.selectionReceiptByteLength) throw new Error("Approval packet selection receipt lineage is stale.");
  const selectionValue = JSON.parse(selection.bytes.toString("utf8"));
  if (selectionValue.contract !== "evavo.work-header-selection-resolver.v1" || selectionValue.recommendation !== "candidate-recommended") throw new Error("Approval packet selection receipt no longer recommends an exact candidate.");
  assertNoMutationAuthority(selectionValue, "Selection receipt");

  const candidateReview = await bound(packet.candidateReviewReceiptPath);
  if (candidateReview.sha256 !== packet.candidateReviewReceiptSha256 || candidateReview.byteLength !== packet.candidateReviewReceiptByteLength || candidateReview.sha256 !== pageValue.candidateReviewReceiptSha256 || candidateReview.byteLength !== pageValue.candidateReviewReceiptByteLength) throw new Error("Approval packet candidate-review receipt lineage is stale.");

  const preview = await bound(packet.previewAdmissionReceiptPath);
  if (preview.sha256 !== packet.previewAdmissionReceiptSha256 || preview.byteLength !== packet.previewAdmissionReceiptByteLength || preview.sha256 !== pageValue.previewAdmissionReceiptSha256 || preview.byteLength !== pageValue.previewAdmissionReceiptByteLength) throw new Error("Approval packet preview-admission receipt lineage is stale.");
  const previewValue = JSON.parse(preview.bytes.toString("utf8"));
  if (previewValue.contract !== "evavo.work-header-preview-admission.v1" || previewValue.approvalState !== "unapproved") throw new Error("Approval packet preview-admission receipt is invalid.");
  assertNoMutationAuthority(previewValue, "Preview-admission receipt");
  if (previewValue.browserResponseBodyIdentityVerified !== true || previewValue.browserResponseMetadataBound !== true || previewValue.immutableCandidateContentArtifactVerified !== true || previewValue.atomicPreviewEvidenceBundleVerified !== true) throw new Error("Preview-admission receipt no longer proves exact browser-loaded candidate evidence.");

  const artifact = await bound(packet.immutablePreviewCandidateArtifactPath);
  if (artifact.sha256 !== packet.immutablePreviewCandidateArtifactSha256 || artifact.byteLength !== packet.immutablePreviewCandidateArtifactByteLength) throw new Error("Approval packet immutable candidate bytes changed.");
  if (selectionValue.recommendedCandidateSha256 !== artifact.sha256) throw new Error("Approval packet immutable candidate no longer matches the selected candidate.");
  if (pageValue.evidence?.candidateSha256 !== artifact.sha256 || pageValue.evidence?.candidateId !== selectionValue.recommendedCandidateId) throw new Error("Approval packet page-render candidate identity drifted from selection.");

  const proof = await bound(pageValue.proofPath);
  if (proof.sha256 !== pageValue.proofSha256 || proof.byteLength !== pageValue.proofByteLength) throw new Error("Approval packet page-render proof bytes changed.");
  for (const binding of Object.values(pageValue.sourceBindings ?? {})) {
    if (!binding?.path) throw new Error("Approval packet page-render source binding is malformed.");
    const current = await bound(binding.path);
    if (current.sha256 !== binding.sha256 || current.byteLength !== binding.byteLength) throw new Error("Approval packet page-render source bytes changed.");
  }

  if (canonical(packet.browserResponseBindings) !== canonical(pageValue.browserResponseBindings) || canonical(packet.browserResponseBindings) !== canonical(previewValue.browserResponseBindings)) throw new Error("Approval packet responsive Chrome response metadata drifted across durable receipts.");

  return Object.freeze({
    packetFile, packet, page, pageValue, selection, selectionValue, candidateReview, preview, previewValue, artifact, proof,
    route: pageValue.evidence?.pageSlug,
    candidateId: selectionValue.recommendedCandidateId,
    candidateSha256: artifact.sha256,
    candidateByteLength: artifact.byteLength,
    fullReceiptLineageVerified: true,
    browserResponseMetadataVerified: true,
  });
}

async function recordDecision(args) {
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required for a durable approval decision receipt.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);
  if (args.automaticDecision === true) throw new Error("Automatic/system-generated Work-header approval decisions are forbidden.");
  if (!DECISIONS.has(args.decision)) throw new Error("decision must be exactly approved or rejected.");
  const reviewerLabel = boundedText(args.reviewerLabel, "reviewerLabel", MAX_REVIEWER_LABEL);
  const reviewerAcknowledgement = boundedText(args.reviewerAcknowledgement, "reviewerAcknowledgement", MAX_NOTE);
  if (args.decision === "approved" && !/\b(reviewed|approve|approved)\b/iu.test(reviewerAcknowledgement)) throw new Error("Approved decisions require an explicit reviewer acknowledgement that the evidence was reviewed and approved.");
  const review = await verifyApprovalPacket(args.approvalPacketReceiptPath);
  if (!/^\/work\/[a-z0-9-]+$/u.test(String(review.route ?? ""))) throw new Error("Verified approval packet is missing a canonical Work route.");

  const receiptPath = await allowed(args.receiptPath, true);
  const evidenceIdentity = Object.freeze({
    approvalPacketPath: review.packetFile.path,
    approvalPacketSha256: review.packetFile.sha256,
    approvalPacketByteLength: review.packetFile.byteLength,
    pageRenderReceiptSha256: review.page.sha256,
    selectionReceiptSha256: review.selection.sha256,
    candidateReviewReceiptSha256: review.candidateReview.sha256,
    previewAdmissionReceiptSha256: review.preview.sha256,
    candidateSha256: review.candidateSha256,
    candidateByteLength: review.candidateByteLength,
    route: review.route,
    candidateId: review.candidateId,
  });
  const receipt = {
    contract: CONTRACT,
    decision: args.decision,
    decisionSource: "explicit-caller",
    automaticDecision: false,
    reviewerLabel,
    reviewerAcknowledgement,
    decidedAt: new Date().toISOString(),
    evidenceIdentity,
    evidenceIdentitySha256: sha256(Buffer.from(canonical(evidenceIdentity), "utf8")),
    approvalPacketReverifiedBeforeDecision: true,
    fullReceiptLineageVerified: true,
    browserResponseMetadataVerified: true,
    candidateBytesVerified: true,
    publicationPreparationAllowed: args.decision === "approved",
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
    nextRequiredAction: args.decision === "approved"
      ? "Prepare a separate governed publication transaction with backup and rollback evidence. This decision receipt does not itself publish or mutate anything."
      : "Retain the current Work header. A rejected candidate requires a new review chain before reconsideration.",
  };
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeCreateOnlyBundle([{ path: receiptPath, data: payload, encoding: "utf8" }]);
  return Object.freeze({ ok: true, receiptPath, receiptSha256: sha256(Buffer.from(payload, "utf8")), decision: receipt.decision, route: review.route, candidateId: review.candidateId, candidateSha256: review.candidateSha256, publicationPreparationAllowed: receipt.publicationPreparationAllowed, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

async function verifyDecision(receiptPath) {
  const decisionFile = await bound(receiptPath);
  const decision = JSON.parse(decisionFile.bytes.toString("utf8"));
  if (decision.contract !== CONTRACT || !DECISIONS.has(decision.decision) || decision.decisionSource !== "explicit-caller" || decision.automaticDecision !== false) throw new Error("Approval decision receipt contract or decision source is invalid.");
  assertNoMutationAuthority(decision, "Approval decision receipt");
  if (decision.publicationPreparationAllowed !== (decision.decision === "approved")) throw new Error("Approval decision publication-preparation state is inconsistent.");
  boundedText(decision.reviewerLabel, "reviewerLabel", MAX_REVIEWER_LABEL);
  boundedText(decision.reviewerAcknowledgement, "reviewerAcknowledgement", MAX_NOTE);
  const identity = decision.evidenceIdentity;
  if (!identity?.approvalPacketPath || decision.evidenceIdentitySha256 !== sha256(Buffer.from(canonical(identity), "utf8"))) throw new Error("Approval decision evidence identity digest is invalid.");
  const review = await verifyApprovalPacket(identity.approvalPacketPath);
  const expected = {
    approvalPacketPath: review.packetFile.path,
    approvalPacketSha256: review.packetFile.sha256,
    approvalPacketByteLength: review.packetFile.byteLength,
    pageRenderReceiptSha256: review.page.sha256,
    selectionReceiptSha256: review.selection.sha256,
    candidateReviewReceiptSha256: review.candidateReview.sha256,
    previewAdmissionReceiptSha256: review.preview.sha256,
    candidateSha256: review.candidateSha256,
    candidateByteLength: review.candidateByteLength,
    route: review.route,
    candidateId: review.candidateId,
  };
  if (canonical(identity) !== canonical(expected)) throw new Error("Approval decision is bound to stale or changed approval-packet lineage.");
  if (decision.approvalPacketReverifiedBeforeDecision !== true || decision.fullReceiptLineageVerified !== true || decision.browserResponseMetadataVerified !== true || decision.candidateBytesVerified !== true) throw new Error("Approval decision receipt lacks required verified evidence state.");
  return Object.freeze({ ok: true, receiptPath: decisionFile.path, receiptSha256: decisionFile.sha256, receiptByteLength: decisionFile.byteLength, decision: decision.decision, reviewerLabel: decision.reviewerLabel, route: review.route, candidateId: review.candidateId, candidateSha256: review.candidateSha256, approvalPacketReverifiedAndMatched: true, fullReceiptLineageVerified: true, publicationPreparationAllowed: decision.publicationPreparationAllowed, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

const tools = [
  { name: "evavo_work_header_approval_decision_capabilities", description: "Describe explicit reviewer Work-header decisions that consume a fully reverified approval packet but never publish or mutate the website/Cloudinary.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_record_work_header_approval_decision", description: "Record an explicit approved/rejected reviewer decision only after re-verifying the exact approval packet, page proof, selected candidate, preview admission and browser-response lineage. Writes one create-only decision receipt; grants no publication authority.", inputSchema: { type: "object", properties: { approvalPacketReceiptPath: { type: "string", minLength: 1 }, receiptPath: { type: "string", minLength: 1 }, decision: { type: "string", enum: ["approved", "rejected"] }, reviewerLabel: { type: "string", minLength: 1, maxLength: MAX_REVIEWER_LABEL }, reviewerAcknowledgement: { type: "string", minLength: 1, maxLength: MAX_NOTE }, automaticDecision: { type: "boolean" }, confirmLocalWrite: { type: "boolean" } }, required: ["approvalPacketReceiptPath", "receiptPath", "decision", "reviewerLabel", "reviewerAcknowledgement", "confirmLocalWrite"], additionalProperties: false } },
  { name: "evavo_verify_work_header_approval_decision", description: "Read-only reverification of an explicit Work-header approval decision against its exact approval packet and complete downstream evidence lineage.", inputSchema: { type: "object", properties: { receiptPath: { type: "string", minLength: 1 } }, required: ["receiptPath"], additionalProperties: false } },
];

function capabilities() {
  return Object.freeze({ contract: CONTRACT, serverVersion: SERVER_VERSION, explicitReviewerDecisionRequired: true, automaticDecisionAllowed: false, approvalPacketReverificationRequired: true, pageRenderProofReverificationRequired: true, candidateByteIdentityRequired: true, responsiveBrowserResponseMetadataRequired: true, fullReceiptLineageRequired: true, evidenceIdentityDigestRequired: true, createOnlyDecisionReceipt: true, rollbackSafeDecisionReceiptWrite: true, approvedDecisionAllowsPublicationPreparationOnly: true, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false, allowedRootCount: configuredLocalRootCount(ROOTS_ENV), writesEnabled: writesEnabled() });
}

async function callTool(name, args) {
  if (name === "evavo_work_header_approval_decision_capabilities") return capabilities();
  if (name === "evavo_record_work_header_approval_decision") return recordDecision(args ?? {});
  if (name === "evavo_verify_work_header_approval_decision") return verifyDecision(args?.receiptPath);
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
