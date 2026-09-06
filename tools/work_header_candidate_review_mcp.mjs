#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import readline from "node:readline";

import {
  compareWorkHeaderCandidates,
  digestWorkHeaderCandidateReviewEvidence,
  judgeWorkHeaderVisualCritique,
  resolveWorkHeaderSelection,
} from "../packages/media/dist/index.js";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-header-candidate-review";
const SERVER_VERSION = "1.4.0";
const PROTOCOL_VERSION = "2025-03-26";
const ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";

const allowed = (path, output = false) => assertAllowedLocalPath(path, {
  envName: ROOTS_ENV,
  output,
  label: "work header candidate review",
});
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function optionalBuffer(path) {
  if (!path) return undefined;
  return readFile(await allowed(path, false));
}

async function readCandidateReviewReceipt(path) {
  const resolved = await allowed(path, false);
  const bytes = await readFile(resolved);
  const value = JSON.parse(bytes.toString("utf8"));
  if (value.contract !== "evavo.work-header-candidate-review.v1" || !value.evidence) {
    throw new Error("candidateReviewReceiptPath must point to an evavo.work-header-candidate-review.v1 receipt.");
  }
  const evidenceSha256 = digestWorkHeaderCandidateReviewEvidence(value.evidence);
  if (typeof value.evidenceSha256 !== "string" || value.evidenceSha256 !== evidenceSha256) {
    throw new Error("Candidate-review receipt evidence digest is missing or invalid.");
  }
  return { path: resolved, value, evidenceSha256, receiptSha256: sha256(bytes) };
}

function hashForCritique(evidence, candidateId) {
  if (candidateId === "current-header") {
    if (!evidence.currentHeader?.imageSha256) throw new Error("Candidate review has no current-header hash baseline.");
    return evidence.currentHeader.imageSha256;
  }
  const candidate = evidence.candidates?.find((item) => item.id === candidateId);
  if (!candidate?.imageSha256) throw new Error(`Candidate review has no hash-bound candidate ${JSON.stringify(candidateId)}.`);
  return candidate.imageSha256;
}

async function compareCandidates(args) {
  if (!Array.isArray(args.candidates) || args.candidates.length < 2) throw new Error("candidates must contain at least two items.");
  if (typeof args.proofPath !== "string" || typeof args.receiptPath !== "string") throw new Error("proofPath and receiptPath are required.");
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);

  const candidates = await Promise.all(args.candidates.map(async (candidate) => {
    if (!candidate || typeof candidate.id !== "string" || typeof candidate.path !== "string") throw new Error("Each candidate requires id and path.");
    return {
      id: candidate.id,
      image: await readFile(await allowed(candidate.path, false)),
      ...(typeof candidate.provenance === "string" ? { provenance: candidate.provenance } : {}),
    };
  }));
  const result = await compareWorkHeaderCandidates({
    candidates,
    currentHeader: await optionalBuffer(args.currentHeaderPath),
    supportImage: await optionalBuffer(args.supportImagePath),
    tileImage: await optionalBuffer(args.tileImagePath),
    maximumCandidates: args.maximumCandidates,
  });
  const proofPath = await allowed(args.proofPath, true);
  const receiptPath = await allowed(args.receiptPath, true);
  const evidenceSha256 = digestWorkHeaderCandidateReviewEvidence(result.evidence);
  await writeFile(proofPath, result.proofPng, { flag: "wx" });
  await writeFile(receiptPath, `${JSON.stringify({
    contract: "evavo.work-header-candidate-review.v1",
    proofPath,
    proofSha256: sha256(result.proofPng),
    evidenceSha256,
    evidence: result.evidence,
    approvalState: "unapproved",
    creativeWinner: null,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    nextRequiredAction: "Inspect this exact proof/evidence set, critique the current header and shortlisted candidates, then run the conservative selection resolver.",
  }, null, 2)}\n`, { flag: "wx" });
  return { ok: true, proofPath, receiptPath, proofSha256: sha256(result.proofPng), evidenceSha256, evidence: result.evidence };
}

async function recordCritique(args) {
  if (typeof args.candidateReviewReceiptPath !== "string") throw new Error("candidateReviewReceiptPath is required.");
  if (typeof args.receiptPath !== "string") throw new Error("receiptPath is required.");
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);
  if (!args.critique || typeof args.critique.candidateId !== "string") throw new Error("critique.candidateId is required.");

  const board = await readCandidateReviewReceipt(args.candidateReviewReceiptPath);
  const candidateSha256 = hashForCritique(board.value.evidence, args.critique.candidateId);
  const result = judgeWorkHeaderVisualCritique({
    ...args.critique,
    candidateSha256,
    candidateReviewEvidenceSha256: board.evidenceSha256,
  });
  const receiptPath = await allowed(args.receiptPath, true);
  await writeFile(receiptPath, `${JSON.stringify({
    ...result,
    candidateReviewReceiptPath: board.path,
    candidateReviewReceiptSha256: board.receiptSha256,
    approvalState: "unapproved",
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
  }, null, 2)}\n`, { flag: "wx" });
  return { ok: true, receiptPath, critique: result };
}

async function resolveSelection(args) {
  if (typeof args.candidateReviewReceiptPath !== "string") throw new Error("candidateReviewReceiptPath is required.");
  if (!Array.isArray(args.critiqueReceiptPaths) || args.critiqueReceiptPaths.length < 1) throw new Error("critiqueReceiptPaths must contain at least one critique receipt.");
  if (typeof args.receiptPath !== "string") throw new Error("receiptPath is required.");
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);

  const board = await readCandidateReviewReceipt(args.candidateReviewReceiptPath);
  const critiques = [];
  for (const path of args.critiqueReceiptPaths) {
    const resolved = await allowed(path, false);
    const value = JSON.parse(await readFile(resolved, "utf8"));
    if (value.contract !== "evavo.work-header-visual-critique.v1") throw new Error(`Critique receipt ${resolved} has an unsupported contract.`);
    if (value.candidateReviewReceiptPath !== board.path) throw new Error(`Critique receipt ${resolved} is not bound to this candidate review receipt.`);
    if (value.candidateReviewReceiptSha256 !== board.receiptSha256) throw new Error(`Critique receipt ${resolved} is bound to a different version of the candidate review receipt.`);
    if (value.candidateReviewEvidenceSha256 !== board.evidenceSha256) throw new Error(`Critique receipt ${resolved} is bound to changed candidate review evidence.`);
    critiques.push(value);
  }
  let currentHeaderCritique;
  if (args.currentHeaderCritiqueReceiptPath) {
    const resolved = await allowed(args.currentHeaderCritiqueReceiptPath, false);
    const value = JSON.parse(await readFile(resolved, "utf8"));
    if (value.contract !== "evavo.work-header-visual-critique.v1") throw new Error("currentHeaderCritiqueReceiptPath must point to an evavo.work-header-visual-critique.v1 receipt.");
    if (value.candidateReviewReceiptPath !== board.path || value.candidateReviewReceiptSha256 !== board.receiptSha256 || value.candidateReviewEvidenceSha256 !== board.evidenceSha256) {
      throw new Error("Current-header critique is not bound to this exact candidate review receipt/evidence.");
    }
    currentHeaderCritique = value;
  }

  const result = resolveWorkHeaderSelection({
    candidateReview: board.value.evidence,
    critiques,
    currentHeaderCritique,
    minimumVisualScore: args.minimumVisualScore,
    minimumAdvantageOverCurrent: args.minimumAdvantageOverCurrent,
    minimumTechnicalScore: args.minimumTechnicalScore,
    maximumTechnicalDeficitToCurrent: args.maximumTechnicalDeficitToCurrent,
    requireCurrentHeaderBaseline: args.requireCurrentHeaderBaseline,
  });
  const receiptPath = await allowed(args.receiptPath, true);
  await writeFile(receiptPath, `${JSON.stringify({
    ...result,
    candidateReviewReceiptPath: board.path,
    candidateReviewReceiptSha256: board.receiptSha256,
    candidateReviewEvidenceSha256: board.evidenceSha256,
    approvalState: "unapproved",
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
  }, null, 2)}\n`, { flag: "wx" });
  return { ok: true, receiptPath, resolution: result };
}

const tools = [
  {
    name: "evavo_work_header_candidate_review_capabilities",
    description: "Describe comparative Work-header candidate review, hash-bound visual critique, evidence-lineage verification and conservative retain-current selection policy.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "evavo_compare_work_header_candidates",
    description: "Create a responsive comparison board for candidate headers plus the current baseline. Records exact image hashes, proof hash and canonical evidence hash; never selects a creative winner automatically.",
    inputSchema: {
      type: "object",
      properties: {
        candidates: { type: "array", minItems: 2, maxItems: 12, items: { type: "object", properties: { id: { type: "string" }, path: { type: "string" }, provenance: { type: "string" } }, required: ["id", "path"], additionalProperties: false } },
        currentHeaderPath: { type: "string" }, supportImagePath: { type: "string" }, tileImagePath: { type: "string" },
        maximumCandidates: { type: "integer", minimum: 2, maximum: 12 }, proofPath: { type: "string" }, receiptPath: { type: "string" }, confirmLocalWrite: { type: "boolean" },
      },
      required: ["candidates", "proofPath", "receiptPath", "confirmLocalWrite"], additionalProperties: false,
    },
  },
  {
    name: "evavo_record_work_header_visual_critique",
    description: "Record visual judgement for one image from one exact candidate-review receipt. Binds the critique to both the image SHA-256 and canonical comparison-evidence SHA-256.",
    inputSchema: { type: "object", properties: { candidateReviewReceiptPath: { type: "string" }, critique: { type: "object" }, receiptPath: { type: "string" }, confirmLocalWrite: { type: "boolean" } }, required: ["candidateReviewReceiptPath", "critique", "receiptPath", "confirmLocalWrite"], additionalProperties: false },
  },
  {
    name: "evavo_resolve_work_header_selection",
    description: "Resolve only critiques bound to the exact same immutable comparison receipt/evidence. Retains the current header unless a candidate proves material visual and technical advantage. Never mutates website or Cloudinary.",
    inputSchema: {
      type: "object",
      properties: {
        candidateReviewReceiptPath: { type: "string" }, critiqueReceiptPaths: { type: "array", minItems: 1, maxItems: 12, items: { type: "string" } }, currentHeaderCritiqueReceiptPath: { type: "string" },
        minimumVisualScore: { type: "number", minimum: 0, maximum: 100 }, minimumAdvantageOverCurrent: { type: "number", minimum: 0, maximum: 30 }, minimumTechnicalScore: { type: "number", minimum: 0, maximum: 100 }, maximumTechnicalDeficitToCurrent: { type: "number", minimum: 0, maximum: 25 }, requireCurrentHeaderBaseline: { type: "boolean" }, receiptPath: { type: "string" }, confirmLocalWrite: { type: "boolean" },
      },
      required: ["candidateReviewReceiptPath", "critiqueReceiptPaths", "receiptPath", "confirmLocalWrite"], additionalProperties: false,
    },
  },
];

function capabilities() {
  return {
    contract: "evavo.work-header-candidate-review.v1",
    allowedRootCount: configuredLocalRootCount(ROOTS_ENV), writesEnabled: writesEnabled(), comparativeResponsiveProofBoard: true,
    currentHeaderTechnicalBaselineInProofBoard: true, candidateAndCurrentImageSha256Evidence: true, proofSha256Evidence: true,
    canonicalReviewEvidenceSha256: true, visualCritiqueHashBindingRequired: true, visualCritiqueReviewEvidenceBindingRequired: true,
    critiqueReceiptMustMatchExactCandidateReviewReceiptBytes: true, conservativeSelectionResolverAvailable: true,
    retainCurrentByDefault: true, currentHeaderTechnicalAndVisualBaselineRequired: true, materialAdvantageRequiredForReplacementRecommendation: true,
    materialTechnicalRegressionBlocksReplacementRecommendation: true, automaticCreativeWinner: false, automaticPublicationAllowed: false,
    automaticWebsiteMutationAllowed: false, cloudOverwriteAllowed: false,
  };
}

async function callTool(name, args) {
  if (name === "evavo_work_header_candidate_review_capabilities") return capabilities();
  if (name === "evavo_compare_work_header_candidates") return compareCandidates(args ?? {});
  if (name === "evavo_record_work_header_visual_critique") return recordCritique(args ?? {});
  if (name === "evavo_resolve_work_header_selection") return resolveSelection(args ?? {});
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}

const response = (id, result) => ({ jsonrpc: "2.0", id, result });
const toolResult = (payload, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError });

async function handle(message) {
  const { id, method, params } = message;
  if (method === "initialize") return response(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } });
  if (method === "notifications/initialized") return null;
  if (method === "tools/list") return response(id, { tools });
  if (method === "tools/call") {
    try { return response(id, toolResult(await callTool(params?.name, params?.arguments ?? {}))); }
    catch (error) { return response(id, toolResult({ ok: false, message: error instanceof Error ? error.message : String(error) }, true)); }
  }
  return response(id, toolResult({ ok: false, message: `Unsupported method ${JSON.stringify(method)}.` }, true));
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  try { const outgoing = await handle(JSON.parse(line)); if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: String(error) }, true)))}\n`); }
}
