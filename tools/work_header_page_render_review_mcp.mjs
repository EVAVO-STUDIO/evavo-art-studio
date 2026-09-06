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
const SERVER_VERSION = "1.5.0";
const PROTOCOL_VERSION = "2025-03-26";
const ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";
const allowed = (filePath, output = false) => assertAllowedLocalPath(filePath, { envName: ROOTS_ENV, output, label: "work header page render review" });
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function bound(filePath) {
  const resolved = await allowed(filePath, false);
  const bytes = await readFile(resolved);
  if (!bytes.length) throw new Error(`Evidence file is empty: ${resolved}`);
  return { path: resolved, bytes, sha256: sha256(bytes), byteLength: bytes.length };
}

async function verifyCandidateReviewReceipt(filePath) {
  const receipt = await bound(filePath);
  const value = JSON.parse(receipt.bytes.toString("utf8"));
  if (value.contract !== "evavo.work-header-candidate-review.v1" || !value.evidence) throw new Error("Candidate-review receipt contract is invalid.");
  const evidenceSha256 = digestWorkHeaderCandidateReviewEvidence(value.evidence);
  if (value.evidenceSha256 !== evidenceSha256) throw new Error("Candidate-review evidence digest is invalid.");
  const proof = await bound(value.proofPath);
  if (proof.sha256 !== value.proofSha256) throw new Error("Candidate-review proof bytes changed after review.");
  const bindings = value.sourceBindings;
  if (!bindings || !Array.isArray(bindings.candidates)) throw new Error("Candidate-review source bindings are missing.");
  for (const item of bindings.candidates) {
    const current = await bound(item.path);
    if (current.sha256 !== item.sha256) throw new Error(`Candidate ${JSON.stringify(item.id)} bytes changed after candidate review.`);
    const evidenceCandidate = value.evidence.candidates?.find((candidate) => candidate.id === item.id);
    if (!evidenceCandidate || evidenceCandidate.imageSha256 !== current.sha256) throw new Error(`Candidate ${JSON.stringify(item.id)} source binding no longer matches review evidence.`);
  }
  for (const [label, item, evidenceHash] of [
    ["current-header", bindings.currentHeader, value.evidence.currentHeader?.imageSha256],
    ["support-image", bindings.supportImage, value.evidence.supportImageSha256],
    ["tile-image", bindings.tileImage, value.evidence.tileImageSha256],
  ]) {
    if (!item) continue;
    const current = await bound(item.path);
    if (current.sha256 !== item.sha256 || current.sha256 !== evidenceHash) throw new Error(`${label} source binding changed after candidate review.`);
  }
  return { path: receipt.path, sha256: receipt.sha256, byteLength: receipt.byteLength, value, evidenceSha256, proofSha256: proof.sha256 };
}

async function verifySelectionReceipt(filePath) {
  const receipt = await bound(filePath);
  const value = JSON.parse(receipt.bytes.toString("utf8"));
  if (value.contract !== "evavo.work-header-selection-resolver.v1") throw new Error("selectionReceiptPath must point to an evavo.work-header-selection-resolver.v1 receipt.");
  if (value.publicationAllowed !== false || value.cloudOverwriteAllowed !== false || value.websiteMutationAllowed !== false) throw new Error("Selection receipt carries forbidden mutation/publication authority.");
  if (value.recommendation !== "candidate-recommended" || !value.recommendedCandidateId || !value.recommendedCandidateSha256) throw new Error(`Selection receipt does not recommend a candidate: ${String(value.recommendation)}.`);
  if (value.sourceBindingsVerifiedAtResolution !== true) throw new Error("Selection receipt does not prove source bindings were reverified at resolution.");
  if (typeof value.candidateReviewReceiptPath !== "string") throw new Error("Selection receipt is missing candidate-review lineage.");
  const board = await verifyCandidateReviewReceipt(value.candidateReviewReceiptPath);
  if (value.candidateReviewReceiptSha256 !== board.sha256) throw new Error("Selection receipt is bound to a different candidate-review receipt version.");
  if (value.candidateReviewProofSha256 !== board.proofSha256) throw new Error("Selection receipt is bound to a different candidate-review proof.");
  if (value.candidateReviewEvidenceSha256 !== board.evidenceSha256) throw new Error("Selection receipt is bound to changed candidate-review evidence.");
  const selected = board.value.evidence.candidates?.find((candidate) => candidate.id === value.recommendedCandidateId);
  if (!selected || selected.imageSha256 !== value.recommendedCandidateSha256) throw new Error("Selection candidate identity/hash no longer matches candidate-review evidence.");
  return { path: receipt.path, sha256: receipt.sha256, byteLength: receipt.byteLength, value, board };
}

function captureByProfile(manifest, profile) {
  const capture = manifest?.captures?.find((item) => item?.profile === profile);
  if (!capture) throw new Error(`Preview manifest is missing ${profile} capture evidence.`);
  return capture;
}

async function verifyPreviewAdmissionReceipt(filePath) {
  const receipt = await bound(filePath);
  const value = JSON.parse(receipt.bytes.toString("utf8"));
  if (value.contract !== "evavo.work-header-preview-admission.v1" || !value.admission) throw new Error("previewAdmissionReceiptPath must point to an evavo.work-header-preview-admission.v1 receipt.");
  if (value.approvalState !== "unapproved" || value.publicationAllowed !== false || value.cloudOverwriteAllowed !== false || value.websiteMutationAllowed !== false) throw new Error("Preview admission receipt carries forbidden approval/mutation authority.");
  if (value.atomicPreviewEvidenceBundleVerified !== true || value.admission.atomicEvidenceBundleVerified !== true) throw new Error("Preview admission receipt does not prove the governed atomic preview evidence bundle.");
  if (typeof value.manifestPath !== "string" || typeof value.manifestSha256 !== "string" || !Number.isInteger(value.manifestByteLength)) throw new Error("Preview admission receipt is missing SHA-256/length manifest lineage.");
  const manifestFile = await bound(value.manifestPath);
  if (manifestFile.sha256 !== value.manifestSha256 || manifestFile.byteLength !== value.manifestByteLength) throw new Error("Preview manifest bytes changed after Art Studio admission.");
  const manifest = JSON.parse(manifestFile.bytes.toString("utf8"));
  const desktop = captureByProfile(manifest, "desktop");
  const mobile = captureByProfile(manifest, "mobile");
  const bindings = value.screenshotBindings ?? {};
  const expected = {
    currentDesktop: desktop.currentScreenshot,
    candidateDesktop: desktop.candidateScreenshot,
    currentMobile: mobile.currentScreenshot,
    candidateMobile: mobile.candidateScreenshot,
  };
  const screenshots = {};
  for (const [label, manifestBinding] of Object.entries(expected)) {
    const receiptBinding = bindings[label];
    if (!receiptBinding || receiptBinding.path !== manifestBinding.path || receiptBinding.sha256 !== manifestBinding.sha256 || receiptBinding.bytes !== manifestBinding.bytes) throw new Error(`${label} preview-admission binding does not match preview manifest evidence.`);
    const current = await bound(receiptBinding.path);
    if (current.sha256 !== receiptBinding.sha256 || current.byteLength !== receiptBinding.bytes) throw new Error(`${label} screenshot bytes changed after preview admission.`);
    screenshots[label] = current;
  }
  const readmission = admitWorkHeaderCandidatePreviewManifest(manifest, {
    currentDesktop: screenshots.currentDesktop.bytes,
    candidateDesktop: screenshots.candidateDesktop.bytes,
    currentMobile: screenshots.currentMobile.bytes,
    candidateMobile: screenshots.candidateMobile.bytes,
  });
  for (const key of ["route", "candidateId", "candidateSrc", "candidateSourceUrlSha256", "naturalWidth", "naturalHeight"]) {
    if (readmission[key] !== value.admission[key]) throw new Error(`Preview admission evidence drifted for ${key}.`);
  }
  for (const key of ["screenshotHashesVerified", "responsiveSourceIdentityVerified", "browserOnlyPreviewVerified", "candidateRenderDifferenceVerified", "titleSubtitleIdentityVerified", "atomicEvidenceBundleVerified"]) {
    if (readmission[key] !== true || value.admission[key] !== true) throw new Error(`Preview admission invariant ${key} is not verified.`);
  }
  for (const key of ["currentDesktopPath", "candidateDesktopPath", "currentMobilePath", "candidateMobilePath"]) {
    if (readmission.pageRenderPaths?.[key] !== value.admission.pageRenderPaths?.[key]) throw new Error(`Preview admission page-render path drifted for ${key}.`);
  }
  return { path: receipt.path, sha256: receipt.sha256, byteLength: receipt.byteLength, value, manifestFile, manifest, admission: readmission, screenshots, fullyReverified: true };
}

async function runPageReview(args) {
  for (const name of ["selectionReceiptPath", "previewAdmissionReceiptPath", "candidateImagePath", "receiptPath", "proofPath"]) {
    if (typeof args[name] !== "string") throw new Error(`${name} is required.`);
  }
  for (const name of ["titleLegibility", "focalPointQuality", "hierarchyQuality", "responsiveConsistency", "overallPageQuality", "currentPageQuality"]) {
    if (!Number.isFinite(args[name])) throw new Error(`${name} is required and must be numeric.`);
  }
  if (typeof args.pageSlug !== "string" || typeof args.pageTitle !== "string") throw new Error("pageSlug and pageTitle are required.");
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);

  const [selection, preview, candidateImage] = await Promise.all([
    verifySelectionReceipt(args.selectionReceiptPath),
    verifyPreviewAdmissionReceipt(args.previewAdmissionReceiptPath),
    bound(args.candidateImagePath),
  ]);
  if (preview.fullyReverified !== true || preview.admission.atomicEvidenceBundleVerified !== true) throw new Error("Preview admission must fully reverify before page-render review.");
  if (candidateImage.sha256 !== selection.value.recommendedCandidateSha256) throw new Error("candidateImagePath does not match the exact candidate selected by the resolver.");
  if (preview.admission.candidateId !== selection.value.recommendedCandidateId) throw new Error("Preview admission candidateId does not match the exact candidate selected by the resolver.");
  if (preview.admission.route !== args.pageSlug) throw new Error("Preview admission route does not match pageSlug.");

  const result = await reviewWorkHeaderPageRender({
    pageSlug: args.pageSlug,
    pageTitle: args.pageTitle,
    candidateId: selection.value.recommendedCandidateId,
    candidateSha256: candidateImage.sha256,
    currentDesktop: preview.screenshots.currentDesktop.bytes,
    candidateDesktop: preview.screenshots.candidateDesktop.bytes,
    currentMobile: preview.screenshots.currentMobile.bytes,
    candidateMobile: preview.screenshots.candidateMobile.bytes,
    titleLegibility: args.titleLegibility,
    focalPointQuality: args.focalPointQuality,
    hierarchyQuality: args.hierarchyQuality,
    responsiveConsistency: args.responsiveConsistency,
    overallPageQuality: args.overallPageQuality,
    currentPageQuality: args.currentPageQuality,
    minimumPageQualityAdvantage: args.minimumPageQualityAdvantage,
    titleObscured: args.titleObscured === true,
    textContrastFailure: args.textContrastFailure === true,
    importantSubjectCropped: args.importantSubjectCropped === true,
    layoutOverflowOrBreakage: args.layoutOverflowOrBreakage === true,
    candidateLooksWorseThanCurrent: args.candidateLooksWorseThanCurrent === true,
    notes: args.notes ?? [],
  });

  const proofPath = await allowed(args.proofPath, true);
  const receiptPath = await allowed(args.receiptPath, true);
  const sourceBindings = {
    candidateImage: { path: candidateImage.path, sha256: candidateImage.sha256, byteLength: candidateImage.byteLength },
    currentDesktop: { path: preview.screenshots.currentDesktop.path, sha256: preview.screenshots.currentDesktop.sha256, byteLength: preview.screenshots.currentDesktop.byteLength },
    candidateDesktop: { path: preview.screenshots.candidateDesktop.path, sha256: preview.screenshots.candidateDesktop.sha256, byteLength: preview.screenshots.candidateDesktop.byteLength },
    currentMobile: { path: preview.screenshots.currentMobile.path, sha256: preview.screenshots.currentMobile.sha256, byteLength: preview.screenshots.currentMobile.byteLength },
    candidateMobile: { path: preview.screenshots.candidateMobile.path, sha256: preview.screenshots.candidateMobile.sha256, byteLength: preview.screenshots.candidateMobile.byteLength },
  };
  const pageReceipt = {
    contract: "evavo.work-header-page-render-review.v2",
    selectionReceiptPath: selection.path,
    selectionReceiptSha256: selection.sha256,
    candidateReviewReceiptPath: selection.board.path,
    candidateReviewReceiptSha256: selection.board.sha256,
    candidateReviewEvidenceSha256: selection.board.evidenceSha256,
    previewAdmissionReceiptPath: preview.path,
    previewAdmissionReceiptSha256: preview.sha256,
    previewAdmissionReceiptByteLength: preview.byteLength,
    previewAdmissionFullyReverified: true,
    atomicPreviewEvidenceBundleVerified: true,
    previewManifestPath: preview.manifestFile.path,
    previewManifestSha256: preview.manifestFile.sha256,
    previewManifestByteLength: preview.manifestFile.byteLength,
    proofPath,
    proofSha256: sha256(result.proofPng),
    proofByteLength: result.proofPng.length,
    sourceBindings,
    evidence: result.evidence,
    approvalState: "unapproved",
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
  };
  await writeCreateOnlyBundle([
    { path: proofPath, data: result.proofPng },
    { path: receiptPath, data: `${JSON.stringify(pageReceipt, null, 2)}\n`, encoding: "utf8" },
  ]);
  return { ok: true, proofPath, receiptPath, previewAdmissionReceiptPath: preview.path, previewAdmissionFullyReverified: true, atomicPreviewEvidenceBundleVerified: true, evidence: result.evidence };
}

async function verifyPageReceipt(filePath) {
  const receipt = await bound(filePath);
  const value = JSON.parse(receipt.bytes.toString("utf8"));
  if (value.contract !== "evavo.work-header-page-render-review.v2" || !value.evidence) throw new Error("Page-render receipt contract is invalid.");
  if (value.approvalState !== "unapproved" || value.publicationAllowed !== false || value.cloudOverwriteAllowed !== false || value.websiteMutationAllowed !== false) throw new Error("Page-render receipt carries forbidden approval/mutation authority.");
  if (value.previewAdmissionFullyReverified !== true || value.atomicPreviewEvidenceBundleVerified !== true) throw new Error("Page-render receipt lacks fully reverified atomic preview-admission evidence.");
  const proof = await bound(value.proofPath);
  if (proof.sha256 !== value.proofSha256 || proof.byteLength !== value.proofByteLength) throw new Error("Page-render proof bytes changed after review.");
  const preview = await verifyPreviewAdmissionReceipt(value.previewAdmissionReceiptPath);
  if (preview.sha256 !== value.previewAdmissionReceiptSha256 || preview.byteLength !== value.previewAdmissionReceiptByteLength || preview.manifestFile.sha256 !== value.previewManifestSha256 || preview.manifestFile.byteLength !== value.previewManifestByteLength || preview.manifestFile.path !== value.previewManifestPath) throw new Error("Page-render receipt is bound to stale preview-admission lineage.");
  const bindings = value.sourceBindings ?? {};
  for (const [label, binding] of Object.entries(bindings)) {
    const current = await bound(binding.path);
    if (current.sha256 !== binding.sha256 || current.byteLength !== binding.byteLength) throw new Error(`${label} bytes changed after page-render review.`);
  }
  if (!bindings.candidateImage || bindings.candidateImage.sha256 !== value.evidence.candidateSha256) throw new Error("Page-render candidate-image binding does not match reviewed candidate SHA-256.");
  if (bindings.currentDesktop?.sha256 !== value.evidence.currentDesktopSha256 || bindings.candidateDesktop?.sha256 !== value.evidence.candidateDesktopSha256 || bindings.currentMobile?.sha256 !== value.evidence.currentMobileSha256 || bindings.candidateMobile?.sha256 !== value.evidence.candidateMobileSha256) throw new Error("Page-render screenshot source bindings do not match review evidence.");
  if (bindings.currentDesktop?.path !== preview.screenshots.currentDesktop.path || bindings.candidateDesktop?.path !== preview.screenshots.candidateDesktop.path || bindings.currentMobile?.path !== preview.screenshots.currentMobile.path || bindings.candidateMobile?.path !== preview.screenshots.candidateMobile.path) throw new Error("Page-render screenshots no longer match admitted preview evidence.");
  const selection = await verifySelectionReceipt(value.selectionReceiptPath);
  if (selection.sha256 !== value.selectionReceiptSha256) throw new Error("Page-render review is bound to a different selection receipt version.");
  if (selection.value.recommendedCandidateId !== value.evidence.candidateId || selection.value.recommendedCandidateSha256 !== value.evidence.candidateSha256) throw new Error("Page-render candidate no longer matches verified selection evidence.");
  if (preview.admission.candidateId !== value.evidence.candidateId || preview.admission.route !== value.evidence.pageSlug) throw new Error("Page-render evidence no longer matches admitted preview identity.");
  if (value.candidateReviewReceiptSha256 !== selection.board.sha256 || value.candidateReviewEvidenceSha256 !== selection.board.evidenceSha256) throw new Error("Page-render review is bound to stale candidate-review lineage.");
  return { path: receipt.path, sha256: receipt.sha256, byteLength: receipt.byteLength, value, selection, preview };
}

async function runApprovalPacket(args) {
  if (typeof args.selectionReceiptPath !== "string" || typeof args.pageRenderReceiptPath !== "string" || typeof args.receiptPath !== "string") throw new Error("selectionReceiptPath, pageRenderReceiptPath and receiptPath are required.");
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);
  const selection = await verifySelectionReceipt(args.selectionReceiptPath);
  const page = await verifyPageReceipt(args.pageRenderReceiptPath);
  if (page.value.selectionReceiptSha256 !== selection.sha256 || page.value.selectionReceiptPath !== selection.path) throw new Error("Page-render receipt was created for a different selection receipt.");
  const packet = prepareWorkHeaderApprovalPacket({ selection: selection.value, pageRender: page.value.evidence });
  const receiptPath = await allowed(args.receiptPath, true);
  const approvalReceipt = {
    ...packet,
    selectionReceiptPath: selection.path,
    selectionReceiptSha256: selection.sha256,
    candidateReviewReceiptPath: selection.board.path,
    candidateReviewReceiptSha256: selection.board.sha256,
    candidateReviewEvidenceSha256: selection.board.evidenceSha256,
    previewAdmissionReceiptPath: page.preview.path,
    previewAdmissionReceiptSha256: page.preview.sha256,
    previewAdmissionReceiptByteLength: page.preview.byteLength,
    previewAdmissionFullyReverified: true,
    atomicPreviewEvidenceBundleVerified: true,
    previewManifestPath: page.preview.manifestFile.path,
    previewManifestSha256: page.preview.manifestFile.sha256,
    previewManifestByteLength: page.preview.manifestFile.byteLength,
    pageRenderReceiptPath: page.path,
    pageRenderReceiptSha256: page.sha256,
    pageRenderReceiptByteLength: page.byteLength,
    approvalState: "unapproved",
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
  };
  await writeCreateOnlyBundle([{ path: receiptPath, data: `${JSON.stringify(approvalReceipt, null, 2)}\n`, encoding: "utf8" }]);
  return { ok: true, receiptPath, packet };
}

const tools = [
  {
    name: "evavo_work_header_page_render_review_capabilities",
    description: "Describe exact-selection page-render review that requires fully reverified atomic browser-preview admission evidence.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "evavo_review_work_header_candidate_page_render",
    description: "Review the exact selected candidate using only screenshots derived from a fully reverified atomic next-website preview admission receipt. Raw screenshot paths cannot be substituted by the caller.",
    inputSchema: {
      type: "object",
      properties: {
        selectionReceiptPath: { type: "string" }, previewAdmissionReceiptPath: { type: "string" }, candidateImagePath: { type: "string" }, pageSlug: { type: "string" }, pageTitle: { type: "string" },
        titleLegibility: { type: "number", minimum: 0, maximum: 5 }, focalPointQuality: { type: "number", minimum: 0, maximum: 5 }, hierarchyQuality: { type: "number", minimum: 0, maximum: 5 }, responsiveConsistency: { type: "number", minimum: 0, maximum: 5 }, overallPageQuality: { type: "number", minimum: 0, maximum: 5 }, currentPageQuality: { type: "number", minimum: 0, maximum: 5 }, minimumPageQualityAdvantage: { type: "number", minimum: 0, maximum: 2 },
        titleObscured: { type: "boolean" }, textContrastFailure: { type: "boolean" }, importantSubjectCropped: { type: "boolean" }, layoutOverflowOrBreakage: { type: "boolean" }, candidateLooksWorseThanCurrent: { type: "boolean" }, notes: { type: "array", items: { type: "string" } },
        proofPath: { type: "string" }, receiptPath: { type: "string" }, confirmLocalWrite: { type: "boolean" },
      },
      required: ["selectionReceiptPath", "previewAdmissionReceiptPath", "candidateImagePath", "pageSlug", "pageTitle", "titleLegibility", "focalPointQuality", "hierarchyQuality", "responsiveConsistency", "overallPageQuality", "currentPageQuality", "proofPath", "receiptPath", "confirmLocalWrite"],
      additionalProperties: false,
    },
  },
  {
    name: "evavo_prepare_work_header_approval_packet",
    description: "Reverify candidate review, selection, atomic preview admission, preview manifest, screenshot bytes, page-render proof and material quality advantage before preparing a review-only packet.",
    inputSchema: { type: "object", properties: { selectionReceiptPath: { type: "string" }, pageRenderReceiptPath: { type: "string" }, receiptPath: { type: "string" }, confirmLocalWrite: { type: "boolean" } }, required: ["selectionReceiptPath", "pageRenderReceiptPath", "receiptPath", "confirmLocalWrite"], additionalProperties: false },
  },
];

function capabilities() {
  return {
    contract: "evavo.work-header-page-render-review.v2",
    serverVersion: SERVER_VERSION,
    selectionReceiptRequiredForPageRenderReview: true,
    previewAdmissionReceiptRequiredForPageRenderReview: true,
    previewAdmissionReceiptReverifiedBeforePageReview: true,
    previewAdmissionReceiptReverifiedBeforeApprovalPacket: true,
    previewAdmissionManifestSha256AndLengthReverified: true,
    atomicPreviewEvidenceBundleRequired: true,
    atomicPreviewEvidenceBundleReverifiedBeforePageReview: true,
    rawCallerScreenshotPathsAccepted: false,
    rollbackSafePageReviewEvidenceBundle: true,
    rollbackSafeApprovalReceiptWrite: true,
    candidateReviewLineageReverified: true,
    selectionLineageReverified: true,
    currentPageQualityBaselineRequired: true,
    materialPageQualityAdvantageRequired: true,
    defaultMinimumPageQualityAdvantage: 0.25,
    exactCandidateImageSha256Binding: true,
    candidateImageReverifiedBeforeApprovalPacket: true,
    currentVsCandidateDesktopReview: true,
    currentVsCandidateMobileReview: true,
    matchingViewportDimensionsRequired: true,
    unchangedCandidateRenderRejected: true,
    screenshotSha256AndLengthBinding: true,
    screenshotSourcesReverifiedBeforeApprovalPacket: true,
    pageRenderProofSha256AndLengthBinding: true,
    approvalPacketAvailable: true,
    explicitApprovalStillRequired: true,
    automaticPublicationAllowed: false,
    automaticCloudOverwriteAllowed: false,
    automaticWebsiteMutationAllowed: false,
    allowedRootCount: configuredLocalRootCount(ROOTS_ENV),
    writesEnabled: writesEnabled(),
  };
}

async function callTool(name, args) {
  if (name === "evavo_work_header_page_render_review_capabilities") return capabilities();
  if (name === "evavo_review_work_header_candidate_page_render") return runPageReview(args ?? {});
  if (name === "evavo_prepare_work_header_approval_packet") return runApprovalPacket(args ?? {});
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
