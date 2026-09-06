#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import readline from "node:readline";

import {
  digestWorkHeaderCandidateReviewEvidence,
  prepareWorkHeaderApprovalPacket,
  reviewWorkHeaderPageRender,
} from "../packages/media/dist/index.js";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-header-page-render-review";
const SERVER_VERSION = "1.3.0";
const PROTOCOL_VERSION = "2025-03-26";
const ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";
const allowed = (path, output = false) => assertAllowedLocalPath(path, { envName: ROOTS_ENV, output, label: "work header page render review" });
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function bound(path) {
  const resolved = await allowed(path, false);
  const bytes = await readFile(resolved);
  return { path: resolved, bytes, sha256: sha256(bytes) };
}

async function verifyCandidateReviewReceipt(path) {
  const receipt = await bound(path);
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
  return { path: receipt.path, sha256: receipt.sha256, value, evidenceSha256, proofSha256: proof.sha256 };
}

async function verifySelectionReceipt(path) {
  const receipt = await bound(path);
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
  return { path: receipt.path, sha256: receipt.sha256, value, board };
}

async function runPageReview(args) {
  for (const name of ["selectionReceiptPath", "candidateImagePath", "currentDesktopPath", "candidateDesktopPath", "currentMobilePath", "candidateMobilePath", "receiptPath", "proofPath"]) {
    if (typeof args[name] !== "string") throw new Error(`${name} is required.`);
  }
  for (const name of ["titleLegibility", "focalPointQuality", "hierarchyQuality", "responsiveConsistency", "overallPageQuality", "currentPageQuality"]) {
    if (!Number.isFinite(args[name])) throw new Error(`${name} is required and must be numeric.`);
  }
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);

  const selection = await verifySelectionReceipt(args.selectionReceiptPath);
  const [candidateImage, currentDesktop, candidateDesktop, currentMobile, candidateMobile] = await Promise.all([
    bound(args.candidateImagePath), bound(args.currentDesktopPath), bound(args.candidateDesktopPath), bound(args.currentMobilePath), bound(args.candidateMobilePath),
  ]);
  if (candidateImage.sha256 !== selection.value.recommendedCandidateSha256) throw new Error("candidateImagePath does not match the exact candidate selected by the resolver.");

  const result = await reviewWorkHeaderPageRender({
    pageSlug: args.pageSlug,
    pageTitle: args.pageTitle,
    candidateId: selection.value.recommendedCandidateId,
    candidateSha256: candidateImage.sha256,
    currentDesktop: currentDesktop.bytes,
    candidateDesktop: candidateDesktop.bytes,
    currentMobile: currentMobile.bytes,
    candidateMobile: candidateMobile.bytes,
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
    candidateImage: { path: candidateImage.path, sha256: candidateImage.sha256 },
    currentDesktop: { path: currentDesktop.path, sha256: currentDesktop.sha256 },
    candidateDesktop: { path: candidateDesktop.path, sha256: candidateDesktop.sha256 },
    currentMobile: { path: currentMobile.path, sha256: currentMobile.sha256 },
    candidateMobile: { path: candidateMobile.path, sha256: candidateMobile.sha256 },
  };
  await writeFile(proofPath, result.proofPng, { flag: "wx" });
  await writeFile(receiptPath, `${JSON.stringify({
    contract: "evavo.work-header-page-render-review.v2",
    selectionReceiptPath: selection.path,
    selectionReceiptSha256: selection.sha256,
    candidateReviewReceiptPath: selection.board.path,
    candidateReviewReceiptSha256: selection.board.sha256,
    candidateReviewEvidenceSha256: selection.board.evidenceSha256,
    proofPath,
    proofSha256: sha256(result.proofPng),
    sourceBindings,
    evidence: result.evidence,
    approvalState: "unapproved",
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
  }, null, 2)}\n`, { flag: "wx" });
  return { ok: true, proofPath, receiptPath, evidence: result.evidence };
}

async function verifyPageReceipt(path) {
  const receipt = await bound(path);
  const value = JSON.parse(receipt.bytes.toString("utf8"));
  if (value.contract !== "evavo.work-header-page-render-review.v2" || !value.evidence) throw new Error("Page-render receipt contract is invalid.");
  const proof = await bound(value.proofPath);
  if (proof.sha256 !== value.proofSha256) throw new Error("Page-render proof bytes changed after review.");
  const bindings = value.sourceBindings ?? {};
  for (const [label, binding] of Object.entries(bindings)) {
    const current = await bound(binding.path);
    if (current.sha256 !== binding.sha256) throw new Error(`${label} bytes changed after page-render review.`);
  }
  if (!bindings.candidateImage || bindings.candidateImage.sha256 !== value.evidence.candidateSha256) throw new Error("Page-render candidate-image binding does not match reviewed candidate SHA-256.");
  if (bindings.currentDesktop?.sha256 !== value.evidence.currentDesktopSha256 || bindings.candidateDesktop?.sha256 !== value.evidence.candidateDesktopSha256 || bindings.currentMobile?.sha256 !== value.evidence.currentMobileSha256 || bindings.candidateMobile?.sha256 !== value.evidence.candidateMobileSha256) throw new Error("Page-render screenshot source bindings do not match review evidence.");
  const selection = await verifySelectionReceipt(value.selectionReceiptPath);
  if (selection.sha256 !== value.selectionReceiptSha256) throw new Error("Page-render review is bound to a different selection receipt version.");
  if (selection.value.recommendedCandidateId !== value.evidence.candidateId || selection.value.recommendedCandidateSha256 !== value.evidence.candidateSha256) throw new Error("Page-render candidate no longer matches verified selection evidence.");
  if (value.candidateReviewReceiptSha256 !== selection.board.sha256 || value.candidateReviewEvidenceSha256 !== selection.board.evidenceSha256) throw new Error("Page-render review is bound to stale candidate-review lineage.");
  return { path: receipt.path, sha256: receipt.sha256, value, selection };
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
  await writeFile(receiptPath, `${JSON.stringify({
    ...packet,
    selectionReceiptPath: selection.path,
    selectionReceiptSha256: selection.sha256,
    candidateReviewReceiptPath: selection.board.path,
    candidateReviewReceiptSha256: selection.board.sha256,
    candidateReviewEvidenceSha256: selection.board.evidenceSha256,
    pageRenderReceiptPath: page.path,
    pageRenderReceiptSha256: page.sha256,
    approvalState: "unapproved",
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
  }, null, 2)}\n`, { flag: "wx" });
  return { ok: true, receiptPath, packet };
}

const tools = [
  {
    name: "evavo_work_header_page_render_review_capabilities",
    description: "Describe exact-selection candidate page-render review with material current-page quality advantage, end-to-end lineage verification and review-only approval packets.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "evavo_review_work_header_candidate_page_render",
    description: "Review actual current and proposed desktop/mobile renders for the exact selected candidate. A candidate must prove a configurable material page-quality advantage over the current page, not merely look acceptable in isolation.",
    inputSchema: {
      type: "object",
      properties: {
        selectionReceiptPath: { type: "string" }, candidateImagePath: { type: "string" }, pageSlug: { type: "string" }, pageTitle: { type: "string" },
        currentDesktopPath: { type: "string" }, candidateDesktopPath: { type: "string" }, currentMobilePath: { type: "string" }, candidateMobilePath: { type: "string" },
        titleLegibility: { type: "number", minimum: 0, maximum: 5 }, focalPointQuality: { type: "number", minimum: 0, maximum: 5 }, hierarchyQuality: { type: "number", minimum: 0, maximum: 5 }, responsiveConsistency: { type: "number", minimum: 0, maximum: 5 }, overallPageQuality: { type: "number", minimum: 0, maximum: 5 }, currentPageQuality: { type: "number", minimum: 0, maximum: 5 }, minimumPageQualityAdvantage: { type: "number", minimum: 0, maximum: 2 },
        titleObscured: { type: "boolean" }, textContrastFailure: { type: "boolean" }, importantSubjectCropped: { type: "boolean" }, layoutOverflowOrBreakage: { type: "boolean" }, candidateLooksWorseThanCurrent: { type: "boolean" }, notes: { type: "array", items: { type: "string" } },
        proofPath: { type: "string" }, receiptPath: { type: "string" }, confirmLocalWrite: { type: "boolean" },
      },
      required: ["selectionReceiptPath", "candidateImagePath", "pageSlug", "pageTitle", "currentDesktopPath", "candidateDesktopPath", "currentMobilePath", "candidateMobilePath", "titleLegibility", "focalPointQuality", "hierarchyQuality", "responsiveConsistency", "overallPageQuality", "currentPageQuality", "proofPath", "receiptPath", "confirmLocalWrite"],
      additionalProperties: false,
    },
  },
  {
    name: "evavo_prepare_work_header_approval_packet",
    description: "Reverify candidate-review sources, selection lineage, exact candidate bytes, responsive screenshots and material page-quality advantage before preparing a review-only packet for explicit approval.",
    inputSchema: { type: "object", properties: { selectionReceiptPath: { type: "string" }, pageRenderReceiptPath: { type: "string" }, receiptPath: { type: "string" }, confirmLocalWrite: { type: "boolean" } }, required: ["selectionReceiptPath", "pageRenderReceiptPath", "receiptPath", "confirmLocalWrite"], additionalProperties: false },
  },
];

function capabilities() {
  return {
    contract: "evavo.work-header-page-render-review.v2",
    selectionReceiptRequiredForPageRenderReview: true,
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
    screenshotSha256Binding: true,
    screenshotSourcesReverifiedBeforeApprovalPacket: true,
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
