#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import readline from "node:readline";

import { prepareWorkHeaderApprovalPacket, reviewWorkHeaderPageRender } from "../packages/media/dist/index.js";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-header-page-render-review";
const SERVER_VERSION = "1.1.0";
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

async function runPageReview(args) {
  for (const name of ["candidateImagePath", "currentDesktopPath", "candidateDesktopPath", "currentMobilePath", "candidateMobilePath", "receiptPath", "proofPath"]) {
    if (typeof args[name] !== "string") throw new Error(`${name} is required.`);
  }
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);

  const [candidateImage, currentDesktop, candidateDesktop, currentMobile, candidateMobile] = await Promise.all([
    bound(args.candidateImagePath), bound(args.currentDesktopPath), bound(args.candidateDesktopPath), bound(args.currentMobilePath), bound(args.candidateMobilePath),
  ]);
  const result = await reviewWorkHeaderPageRender({
    pageSlug: args.pageSlug,
    pageTitle: args.pageTitle,
    candidateId: args.candidateId,
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
    contract: "evavo.work-header-page-render-review.v1",
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
  if (value.contract !== "evavo.work-header-page-render-review.v1" || !value.evidence) throw new Error("Page render receipt contract is invalid.");
  const proof = await bound(value.proofPath);
  if (proof.sha256 !== value.proofSha256) throw new Error("Page-render proof bytes changed after review.");
  const bindings = value.sourceBindings ?? {};
  for (const [label, binding] of Object.entries(bindings)) {
    const current = await bound(binding.path);
    if (current.sha256 !== binding.sha256) throw new Error(`${label} bytes changed after page-render review.`);
  }
  if (!bindings.candidateImage || bindings.candidateImage.sha256 !== value.evidence.candidateSha256) throw new Error("Page-render candidate-image binding does not match reviewed candidate SHA-256.");
  if (bindings.currentDesktop?.sha256 !== value.evidence.currentDesktopSha256 || bindings.candidateDesktop?.sha256 !== value.evidence.candidateDesktopSha256 || bindings.currentMobile?.sha256 !== value.evidence.currentMobileSha256 || bindings.candidateMobile?.sha256 !== value.evidence.candidateMobileSha256) {
    throw new Error("Page-render screenshot source bindings do not match review evidence.");
  }
  return { path: receipt.path, sha256: receipt.sha256, value };
}

async function runApprovalPacket(args) {
  if (typeof args.selectionReceiptPath !== "string" || typeof args.pageRenderReceiptPath !== "string" || typeof args.receiptPath !== "string") throw new Error("selectionReceiptPath, pageRenderReceiptPath and receiptPath are required.");
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);

  const selectionReceipt = await bound(args.selectionReceiptPath);
  const selection = JSON.parse(selectionReceipt.bytes.toString("utf8"));
  if (selection.contract !== "evavo.work-header-selection-resolver.v1") throw new Error("selectionReceiptPath must point to an evavo.work-header-selection-resolver.v1 receipt.");
  if (selection.publicationAllowed !== false || selection.cloudOverwriteAllowed !== false || selection.websiteMutationAllowed !== false) throw new Error("Selection receipt carries forbidden mutation/publication authority.");

  const page = await verifyPageReceipt(args.pageRenderReceiptPath);
  const packet = prepareWorkHeaderApprovalPacket({ selection, pageRender: page.value.evidence });
  const receiptPath = await allowed(args.receiptPath, true);
  await writeFile(receiptPath, `${JSON.stringify({
    ...packet,
    selectionReceiptPath: selectionReceipt.path,
    selectionReceiptSha256: selectionReceipt.sha256,
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
    description: "Describe exact-candidate current-vs-proposed desktop/mobile Work-page review and review-only approval-packet preparation.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "evavo_review_work_header_candidate_page_render",
    description: "Review actual current and candidate Work-page renders on desktop and mobile. Derives the candidate SHA from the candidate image file and binds it with all screenshot hashes.",
    inputSchema: {
      type: "object",
      properties: {
        pageSlug: { type: "string" }, pageTitle: { type: "string" }, candidateId: { type: "string" }, candidateImagePath: { type: "string" },
        currentDesktopPath: { type: "string" }, candidateDesktopPath: { type: "string" }, currentMobilePath: { type: "string" }, candidateMobilePath: { type: "string" },
        titleLegibility: { type: "number", minimum: 0, maximum: 5 }, focalPointQuality: { type: "number", minimum: 0, maximum: 5 }, hierarchyQuality: { type: "number", minimum: 0, maximum: 5 }, responsiveConsistency: { type: "number", minimum: 0, maximum: 5 }, overallPageQuality: { type: "number", minimum: 0, maximum: 5 },
        titleObscured: { type: "boolean" }, textContrastFailure: { type: "boolean" }, importantSubjectCropped: { type: "boolean" }, layoutOverflowOrBreakage: { type: "boolean" }, candidateLooksWorseThanCurrent: { type: "boolean" }, notes: { type: "array", items: { type: "string" } },
        proofPath: { type: "string" }, receiptPath: { type: "string" }, confirmLocalWrite: { type: "boolean" },
      },
      required: ["pageSlug", "pageTitle", "candidateId", "candidateImagePath", "currentDesktopPath", "candidateDesktopPath", "currentMobilePath", "candidateMobilePath", "titleLegibility", "focalPointQuality", "hierarchyQuality", "responsiveConsistency", "overallPageQuality", "proofPath", "receiptPath", "confirmLocalWrite"],
      additionalProperties: false,
    },
  },
  {
    name: "evavo_prepare_work_header_approval_packet",
    description: "Reverify selection, exact candidate bytes, proof and page-render screenshots, then prepare a review-only packet for explicit approval. Does not approve, publish, mutate website or overwrite Cloudinary.",
    inputSchema: { type: "object", properties: { selectionReceiptPath: { type: "string" }, pageRenderReceiptPath: { type: "string" }, receiptPath: { type: "string" }, confirmLocalWrite: { type: "boolean" } }, required: ["selectionReceiptPath", "pageRenderReceiptPath", "receiptPath", "confirmLocalWrite"], additionalProperties: false },
  },
];

function capabilities() {
  return {
    contract: "evavo.work-header-page-render-review.v1",
    exactCandidateImageSha256Binding: true,
    candidateImageReverifiedBeforeApprovalPacket: true,
    currentVsCandidateDesktopReview: true,
    currentVsCandidateMobileReview: true,
    screenshotSha256Binding: true,
    screenshotSourcesReverifiedBeforeApprovalPacket: true,
    titleLegibilityReviewRequired: true,
    responsiveCropReviewRequired: true,
    pageBreakageHardDisqualifier: true,
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
