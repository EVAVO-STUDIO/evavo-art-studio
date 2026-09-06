#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";
import {
  admitWorkHeaderCandidatePreviewManifest,
  digestWorkHeaderCandidateReviewEvidence,
  prepareWorkHeaderApprovalPacket,
  reviewWorkHeaderPageRender,
} from "../packages/media/dist/index.js";
import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-header-page-render-review";
const SERVER_VERSION = "1.8.0";
const PROTOCOL_VERSION = "2025-03-26";
const ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";
const MAX_CANDIDATE_BYTES = 80 * 1024 * 1024;
const allowed = (p, output = false) => assertAllowedLocalPath(p, { envName: ROOTS_ENV, output, label: "work header page render review" });
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
async function bound(p) { const resolved = await allowed(p, false); const bytes = await readFile(resolved); if (!bytes.length) throw new Error(`Evidence file is empty: ${resolved}`); return { path: resolved, bytes, sha256: sha256(bytes), byteLength: bytes.length }; }
async function fetchCandidateContent(url) {
  const response = await fetch(url, { method: "GET", redirect: "follow", cache: "no-store", headers: { "cache-control": "no-cache", pragma: "no-cache", accept: "image/*,*/*;q=0.1" } });
  if (!response.ok) throw new Error(`Preview candidate byte reverification failed with HTTP ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_CANDIDATE_BYTES) throw new Error("Preview candidate bytes are empty or exceed the governed review limit.");
  return { bytes, sha256: sha256(bytes), byteLength: bytes.length };
}
function browserBindingEquals(left, right) {
  for (const key of ["url", "status", "mimeType", "sha256", "byteLength", "protocol", "fromDiskCache", "fromServiceWorker", "encodedDataLength", "bodyBase64EncodedByCdp"]) if (left?.[key] !== right?.[key]) return false;
  return true;
}

async function verifyCandidateReviewReceipt(p) {
  const receipt = await bound(p); const value = JSON.parse(receipt.bytes.toString("utf8"));
  if (value.contract !== "evavo.work-header-candidate-review.v1" || !value.evidence) throw new Error("Candidate-review receipt contract is invalid.");
  const evidenceSha256 = digestWorkHeaderCandidateReviewEvidence(value.evidence);
  if (value.evidenceSha256 !== evidenceSha256) throw new Error("Candidate-review evidence digest is invalid.");
  const proof = await bound(value.proofPath); if (proof.sha256 !== value.proofSha256) throw new Error("Candidate-review proof bytes changed after review.");
  for (const item of value.sourceBindings?.candidates ?? []) { const current = await bound(item.path); if (current.sha256 !== item.sha256) throw new Error(`Candidate ${item.id} bytes changed after candidate review.`); }
  return { path: receipt.path, sha256: receipt.sha256, byteLength: receipt.byteLength, value, evidenceSha256, proofSha256: proof.sha256 };
}
async function verifySelectionReceipt(p) {
  const receipt = await bound(p); const value = JSON.parse(receipt.bytes.toString("utf8"));
  if (value.contract !== "evavo.work-header-selection-resolver.v1" || value.recommendation !== "candidate-recommended" || !value.recommendedCandidateId || !value.recommendedCandidateSha256) throw new Error("Selection receipt does not recommend an exact candidate.");
  if (value.publicationAllowed !== false || value.cloudOverwriteAllowed !== false || value.websiteMutationAllowed !== false) throw new Error("Selection receipt carries forbidden authority.");
  const board = await verifyCandidateReviewReceipt(value.candidateReviewReceiptPath);
  if (value.candidateReviewReceiptSha256 !== board.sha256 || value.candidateReviewEvidenceSha256 !== board.evidenceSha256 || value.candidateReviewProofSha256 !== board.proofSha256) throw new Error("Selection receipt candidate-review lineage is stale.");
  const selected = board.value.evidence.candidates?.find((candidate) => candidate.id === value.recommendedCandidateId);
  if (!selected || selected.imageSha256 !== value.recommendedCandidateSha256) throw new Error("Selection candidate identity/hash drifted.");
  return { path: receipt.path, sha256: receipt.sha256, byteLength: receipt.byteLength, value, board };
}
function captureByProfile(manifest, profile) { const capture = manifest?.captures?.find((item) => item?.profile === profile); if (!capture) throw new Error(`Preview manifest is missing ${profile} capture evidence.`); return capture; }
async function verifyPreviewAdmissionReceipt(p) {
  const receipt = await bound(p); const value = JSON.parse(receipt.bytes.toString("utf8"));
  if (value.contract !== "evavo.work-header-preview-admission.v1" || value.approvalState !== "unapproved" || value.publicationAllowed !== false || value.cloudOverwriteAllowed !== false || value.websiteMutationAllowed !== false) throw new Error("Preview admission receipt is invalid or unsafe.");
  if (value.immutableCandidateContentArtifactVerified !== true || value.exactCandidateResponseBytesVerified !== true || value.atomicPreviewEvidenceBundleVerified !== true || value.browserResponseBodyIdentityVerified !== true || value.browserResponseMetadataBound !== true) throw new Error("Preview admission lacks immutable candidate or durable Chrome response evidence.");
  const manifestFile = await bound(value.manifestPath);
  if (manifestFile.sha256 !== value.manifestSha256 || manifestFile.byteLength !== value.manifestByteLength) throw new Error("Preview manifest bytes changed after admission.");
  const manifest = JSON.parse(manifestFile.bytes.toString("utf8"));
  const desktop = captureByProfile(manifest, "desktop"), mobile = captureByProfile(manifest, "mobile");
  const expected = { currentDesktop: desktop.currentScreenshot, candidateDesktop: desktop.candidateScreenshot, currentMobile: mobile.currentScreenshot, candidateMobile: mobile.candidateScreenshot };
  const screenshots = {};
  for (const [label, binding] of Object.entries(expected)) {
    const rb = value.screenshotBindings?.[label]; if (!rb || rb.path !== binding.path || rb.sha256 !== binding.sha256 || rb.bytes !== binding.bytes) throw new Error(`${label} preview binding drifted.`);
    const file = await bound(rb.path); if (file.sha256 !== rb.sha256 || file.byteLength !== rb.bytes) throw new Error(`${label} screenshot bytes changed.`); screenshots[label] = file;
  }
  const artifactBinding = value.candidateContentArtifactBinding;
  if (!artifactBinding || artifactBinding.path !== manifest.candidateContentArtifact?.path) throw new Error("Preview candidate artifact binding is missing or stale.");
  const artifact = await bound(artifactBinding.path);
  if (artifact.sha256 !== artifactBinding.sha256 || artifact.byteLength !== artifactBinding.byteLength || artifact.sha256 !== manifest.candidateContentArtifact.sha256 || artifact.byteLength !== manifest.candidateContentArtifact.bytes) throw new Error("Immutable preview candidate artifact bytes changed after admission.");
  const remote = await fetchCandidateContent(manifest.candidateSrc);
  if (remote.sha256 !== artifact.sha256 || remote.byteLength !== artifact.byteLength) throw new Error("Current remote candidate response no longer matches immutable preview artifact.");
  const readmission = admitWorkHeaderCandidatePreviewManifest(manifest, { currentDesktop: screenshots.currentDesktop.bytes, candidateDesktop: screenshots.candidateDesktop.bytes, currentMobile: screenshots.currentMobile.bytes, candidateMobile: screenshots.candidateMobile.bytes, candidateContent: artifact.bytes });
  for (const key of ["route", "candidateId", "candidateSrc", "candidateContentSha256", "candidateContentByteLength", "candidateContentArtifactPath"]) if (readmission[key] !== value.admission?.[key]) throw new Error(`Preview admission evidence drifted for ${key}.`);
  if (readmission.immutableCandidateContentArtifactVerified !== true || readmission.candidateContentBytesVerified !== true || readmission.atomicEvidenceBundleVerified !== true || readmission.browserResponseBodyIdentityVerified !== true || readmission.browserResponseMetadataBound !== true) throw new Error("Preview admission invariant failed on recomputation.");
  for (const profile of ["desktop", "mobile"]) {
    if (!browserBindingEquals(readmission.browserResponseBindings?.[profile], value.browserResponseBindings?.[profile])) throw new Error(`${profile} Chrome response metadata no longer matches the durable preview-admission receipt.`);
  }
  return { path: receipt.path, sha256: receipt.sha256, byteLength: receipt.byteLength, value, manifestFile, manifest, admission: readmission, screenshots, artifact, remote, browserResponseBindings: readmission.browserResponseBindings, fullyReverified: true };
}

async function runPageReview(args) {
  for (const name of ["selectionReceiptPath", "previewAdmissionReceiptPath", "candidateImagePath", "receiptPath", "proofPath", "pageSlug", "pageTitle"]) if (typeof args[name] !== "string") throw new Error(`${name} is required.`);
  for (const name of ["titleLegibility", "focalPointQuality", "hierarchyQuality", "responsiveConsistency", "overallPageQuality", "currentPageQuality"]) if (!Number.isFinite(args[name])) throw new Error(`${name} must be numeric.`);
  if (args.confirmLocalWrite !== true || !writesEnabled()) throw new Error("Explicit review evidence write admission is required.");
  const [selection, preview, candidateImage] = await Promise.all([verifySelectionReceipt(args.selectionReceiptPath), verifyPreviewAdmissionReceipt(args.previewAdmissionReceiptPath), bound(args.candidateImagePath)]);
  if (candidateImage.sha256 !== selection.value.recommendedCandidateSha256) throw new Error("candidateImagePath does not match selected candidate SHA-256.");
  if (candidateImage.sha256 !== preview.artifact.sha256 || candidateImage.byteLength !== preview.artifact.byteLength) throw new Error("Selected local candidate bytes do not match immutable candidate bytes preserved by the website preview.");
  if (preview.admission.candidateId !== selection.value.recommendedCandidateId || preview.admission.route !== args.pageSlug) throw new Error("Preview identity does not match selection/page route.");
  const result = await reviewWorkHeaderPageRender({ pageSlug: args.pageSlug, pageTitle: args.pageTitle, candidateId: selection.value.recommendedCandidateId, candidateSha256: candidateImage.sha256, currentDesktop: preview.screenshots.currentDesktop.bytes, candidateDesktop: preview.screenshots.candidateDesktop.bytes, currentMobile: preview.screenshots.currentMobile.bytes, candidateMobile: preview.screenshots.candidateMobile.bytes, titleLegibility: args.titleLegibility, focalPointQuality: args.focalPointQuality, hierarchyQuality: args.hierarchyQuality, responsiveConsistency: args.responsiveConsistency, overallPageQuality: args.overallPageQuality, currentPageQuality: args.currentPageQuality, minimumPageQualityAdvantage: args.minimumPageQualityAdvantage, titleObscured: args.titleObscured === true, textContrastFailure: args.textContrastFailure === true, importantSubjectCropped: args.importantSubjectCropped === true, layoutOverflowOrBreakage: args.layoutOverflowOrBreakage === true, candidateLooksWorseThanCurrent: args.candidateLooksWorseThanCurrent === true, notes: args.notes ?? [] });
  const proofPath = await allowed(args.proofPath, true), receiptPath = await allowed(args.receiptPath, true);
  const sourceBindings = { candidateImage: { path: candidateImage.path, sha256: candidateImage.sha256, byteLength: candidateImage.byteLength }, immutablePreviewCandidateArtifact: { path: preview.artifact.path, sha256: preview.artifact.sha256, byteLength: preview.artifact.byteLength }, currentDesktop: { path: preview.screenshots.currentDesktop.path, sha256: preview.screenshots.currentDesktop.sha256, byteLength: preview.screenshots.currentDesktop.byteLength }, candidateDesktop: { path: preview.screenshots.candidateDesktop.path, sha256: preview.screenshots.candidateDesktop.sha256, byteLength: preview.screenshots.candidateDesktop.byteLength }, currentMobile: { path: preview.screenshots.currentMobile.path, sha256: preview.screenshots.currentMobile.sha256, byteLength: preview.screenshots.currentMobile.byteLength }, candidateMobile: { path: preview.screenshots.candidateMobile.path, sha256: preview.screenshots.candidateMobile.sha256, byteLength: preview.screenshots.candidateMobile.byteLength } };
  const pageReceipt = { contract: "evavo.work-header-page-render-review.v2", selectionReceiptPath: selection.path, selectionReceiptSha256: selection.sha256, candidateReviewReceiptPath: selection.board.path, candidateReviewReceiptSha256: selection.board.sha256, candidateReviewEvidenceSha256: selection.board.evidenceSha256, previewAdmissionReceiptPath: preview.path, previewAdmissionReceiptSha256: preview.sha256, previewAdmissionReceiptByteLength: preview.byteLength, previewManifestPath: preview.manifestFile.path, previewManifestSha256: preview.manifestFile.sha256, previewManifestByteLength: preview.manifestFile.byteLength, previewAdmissionFullyReverified: true, immutablePreviewCandidateArtifactVerified: true, browserResponseBodyIdentityVerified: true, browserResponseMetadataBound: true, browserResponseBindings: preview.browserResponseBindings, currentRemoteCandidateStillMatchesArtifact: true, exactPreviewedCandidateBytesMatchedSelectedCandidate: true, proofPath, proofSha256: sha256(result.proofPng), proofByteLength: result.proofPng.length, sourceBindings, evidence: result.evidence, approvalState: "unapproved", publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false };
  await writeCreateOnlyBundle([{ path: proofPath, data: result.proofPng }, { path: receiptPath, data: `${JSON.stringify(pageReceipt, null, 2)}\n`, encoding: "utf8" }]);
  return { ok: true, proofPath, receiptPath, immutablePreviewCandidateArtifactVerified: true, browserResponseMetadataBound: true, exactPreviewedCandidateBytesMatchedSelectedCandidate: true, evidence: result.evidence };
}

async function verifyPageReceipt(p) {
  const receipt = await bound(p), value = JSON.parse(receipt.bytes.toString("utf8"));
  if (value.contract !== "evavo.work-header-page-render-review.v2" || value.approvalState !== "unapproved" || value.immutablePreviewCandidateArtifactVerified !== true || value.exactPreviewedCandidateBytesMatchedSelectedCandidate !== true || value.browserResponseBodyIdentityVerified !== true || value.browserResponseMetadataBound !== true) throw new Error("Page-render receipt is invalid or lacks immutable preview/browser-response evidence.");
  const proof = await bound(value.proofPath); if (proof.sha256 !== value.proofSha256 || proof.byteLength !== value.proofByteLength) throw new Error("Page-render proof bytes changed.");
  const preview = await verifyPreviewAdmissionReceipt(value.previewAdmissionReceiptPath);
  for (const profile of ["desktop", "mobile"]) if (!browserBindingEquals(value.browserResponseBindings?.[profile], preview.browserResponseBindings?.[profile])) throw new Error(`${profile} page-render Chrome response metadata drifted from the reverified preview admission.`);
  const candidate = await bound(value.sourceBindings.candidateImage.path), artifact = await bound(value.sourceBindings.immutablePreviewCandidateArtifact.path);
  if (candidate.sha256 !== artifact.sha256 || candidate.byteLength !== artifact.byteLength || artifact.sha256 !== preview.artifact.sha256) throw new Error("Page-render candidate/artifact lineage drifted.");
  const selection = await verifySelectionReceipt(value.selectionReceiptPath);
  if (selection.value.recommendedCandidateSha256 !== candidate.sha256) throw new Error("Page-render candidate no longer matches selection.");
  return { path: receipt.path, sha256: receipt.sha256, byteLength: receipt.byteLength, value, selection, preview };
}
async function runApprovalPacket(args) {
  if (args.confirmLocalWrite !== true || !writesEnabled()) throw new Error("Explicit approval-packet evidence write admission is required.");
  const selection = await verifySelectionReceipt(args.selectionReceiptPath), page = await verifyPageReceipt(args.pageRenderReceiptPath);
  const packet = prepareWorkHeaderApprovalPacket({ selection: selection.value, pageRender: page.value.evidence });
  const receiptPath = await allowed(args.receiptPath, true);
  const approvalReceipt = { ...packet, selectionReceiptPath: selection.path, selectionReceiptSha256: selection.sha256, previewAdmissionReceiptPath: page.preview.path, previewAdmissionReceiptSha256: page.preview.sha256, immutablePreviewCandidateArtifactPath: page.preview.artifact.path, immutablePreviewCandidateArtifactSha256: page.preview.artifact.sha256, immutablePreviewCandidateArtifactByteLength: page.preview.artifact.byteLength, browserResponseBodyIdentityVerified: true, browserResponseMetadataBound: true, browserResponseBindings: page.preview.browserResponseBindings, pageRenderReceiptPath: page.path, pageRenderReceiptSha256: page.sha256, approvalState: "unapproved", publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false };
  await writeCreateOnlyBundle([{ path: receiptPath, data: `${JSON.stringify(approvalReceipt, null, 2)}\n`, encoding: "utf8" }]);
  return { ok: true, receiptPath, packet };
}

const tools = [
  { name: "evavo_work_header_page_render_review_capabilities", description: "Describe Work page review bound to immutable candidate preview content and durable responsive Chrome response evidence.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_review_work_header_candidate_page_render", description: "Review the selected candidate only when it exactly matches the immutable candidate artifact from a reverified preview v7 admission whose desktop/mobile Chrome response metadata remains bound.", inputSchema: { type: "object", properties: { selectionReceiptPath: { type: "string" }, previewAdmissionReceiptPath: { type: "string" }, candidateImagePath: { type: "string" }, pageSlug: { type: "string" }, pageTitle: { type: "string" }, titleLegibility: { type: "number" }, focalPointQuality: { type: "number" }, hierarchyQuality: { type: "number" }, responsiveConsistency: { type: "number" }, overallPageQuality: { type: "number" }, currentPageQuality: { type: "number" }, minimumPageQualityAdvantage: { type: "number" }, proofPath: { type: "string" }, receiptPath: { type: "string" }, confirmLocalWrite: { type: "boolean" } }, required: ["selectionReceiptPath", "previewAdmissionReceiptPath", "candidateImagePath", "pageSlug", "pageTitle", "titleLegibility", "focalPointQuality", "hierarchyQuality", "responsiveConsistency", "overallPageQuality", "currentPageQuality", "proofPath", "receiptPath", "confirmLocalWrite"], additionalProperties: true } },
  { name: "evavo_prepare_work_header_approval_packet", description: "Prepare a review-only approval packet after re-verifying immutable preview candidate and responsive Chrome response evidence.", inputSchema: { type: "object", properties: { selectionReceiptPath: { type: "string" }, pageRenderReceiptPath: { type: "string" }, receiptPath: { type: "string" }, confirmLocalWrite: { type: "boolean" } }, required: ["selectionReceiptPath", "pageRenderReceiptPath", "receiptPath", "confirmLocalWrite"], additionalProperties: false } },
];
function capabilities() { return { contract: "evavo.work-header-page-render-review.v2", serverVersion: SERVER_VERSION, previewAdmissionReceiptReverifiedBeforePageReview: true, immutablePreviewCandidateArtifactRequired: true, immutablePreviewCandidateArtifactReverifiedBeforePageReview: true, browserResponseMetadataRequiredFromAdmission: true, browserResponseMetadataPersistedInPageReceipt: true, browserResponseMetadataReverifiedBeforeApprovalPacket: true, currentRemoteCandidateMustMatchImmutableArtifact: true, selectedLocalCandidateMustMatchPreviewedResponseBytes: true, exactPreviewedCandidateBytesMatchedSelectedCandidate: true, rawCallerScreenshotPathsAccepted: false, rollbackSafePageReviewEvidenceBundle: true, rollbackSafeApprovalReceiptWrite: true, currentPageQualityBaselineRequired: true, materialPageQualityAdvantageRequired: true, defaultMinimumPageQualityAdvantage: 0.25, screenshotSha256AndLengthBinding: true, pageRenderProofSha256AndLengthBinding: true, explicitApprovalStillRequired: true, automaticPublicationAllowed: false, automaticCloudOverwriteAllowed: false, automaticWebsiteMutationAllowed: false, allowedRootCount: configuredLocalRootCount(ROOTS_ENV), writesEnabled: writesEnabled() }; }
async function callTool(name, args) { if (name === "evavo_work_header_page_render_review_capabilities") return capabilities(); if (name === "evavo_review_work_header_candidate_page_render") return runPageReview(args ?? {}); if (name === "evavo_prepare_work_header_approval_packet") return runApprovalPacket(args ?? {}); throw new Error(`Unknown tool ${name}`); }
const response = (id, result) => ({ jsonrpc: "2.0", id, result }); const toolResult = (payload, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError });
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) { if (!line.trim()) continue; try { const message = JSON.parse(line); let outgoing; if (message.method === "initialize") outgoing = response(message.id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } }); else if (message.method === "notifications/initialized") outgoing = null; else if (message.method === "tools/list") outgoing = response(message.id, { tools }); else if (message.method === "tools/call") { try { outgoing = response(message.id, toolResult(await callTool(message.params?.name, message.params?.arguments ?? {}))); } catch (error) { outgoing = response(message.id, toolResult({ ok: false, message: String(error) }, true)); } } if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`); } catch (error) { process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: String(error) }, true)))}\n`); } }
