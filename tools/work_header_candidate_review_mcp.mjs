#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import readline from "node:readline";

import { compareWorkHeaderCandidates, judgeWorkHeaderVisualCritique } from "../packages/media/dist/index.js";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-header-candidate-review";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";

const allowed = (path, output = false) => assertAllowedLocalPath(path, {
  envName: ROOTS_ENV,
  output,
  label: "work header candidate review",
});
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());

async function optionalBuffer(path) {
  if (!path) return undefined;
  return readFile(await allowed(path, false));
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
  await writeFile(proofPath, result.proofPng, { flag: "wx" });
  await writeFile(receiptPath, `${JSON.stringify({
    contract: "evavo.work-header-candidate-review.v1",
    proofPath,
    evidence: result.evidence,
    approvalState: "unapproved",
    creativeWinner: null,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    nextRequiredAction: "A human or vision-capable agent must inspect the board and submit an explicit visual critique for shortlisted candidates.",
  }, null, 2)}\n`, { flag: "wx" });
  return { ok: true, proofPath, receiptPath, evidence: result.evidence };
}

async function recordCritique(args) {
  if (typeof args.receiptPath !== "string") throw new Error("receiptPath is required.");
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);
  const result = judgeWorkHeaderVisualCritique(args.critique ?? {});
  const receiptPath = await allowed(args.receiptPath, true);
  await writeFile(receiptPath, `${JSON.stringify({
    ...result,
    approvalState: "unapproved",
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
  }, null, 2)}\n`, { flag: "wx" });
  return { ok: true, receiptPath, critique: result };
}

const tools = [
  {
    name: "evavo_work_header_candidate_review_capabilities",
    description: "Describe comparative Work-header candidate review and explicit visual-critique requirements.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "evavo_compare_work_header_candidates",
    description: "Create a side-by-side responsive crop board for multiple Work-header candidates, technically shortlist them, and deliberately refuse to choose a creative winner automatically.",
    inputSchema: {
      type: "object",
      properties: {
        candidates: {
          type: "array", minItems: 2, maxItems: 12,
          items: {
            type: "object",
            properties: { id: { type: "string" }, path: { type: "string" }, provenance: { type: "string" } },
            required: ["id", "path"], additionalProperties: false,
          },
        },
        currentHeaderPath: { type: "string" },
        supportImagePath: { type: "string" },
        tileImagePath: { type: "string" },
        maximumCandidates: { type: "integer", minimum: 2, maximum: 12 },
        proofPath: { type: "string" },
        receiptPath: { type: "string" },
        confirmLocalWrite: { type: "boolean" },
      },
      required: ["candidates", "proofPath", "receiptPath", "confirmLocalWrite"],
      additionalProperties: false,
    },
  },
  {
    name: "evavo_record_work_header_visual_critique",
    description: "Record explicit human/vision judgement for one Work-header candidate after inspecting the proof board. Generic, AI-looking, blurry/cheap, damaged-text/logo and failed-mobile-crop flags are hard disqualifiers.",
    inputSchema: {
      type: "object",
      properties: {
        critique: { type: "object" },
        receiptPath: { type: "string" },
        confirmLocalWrite: { type: "boolean" },
      },
      required: ["critique", "receiptPath", "confirmLocalWrite"],
      additionalProperties: false,
    },
  },
];

function capabilities() {
  return {
    contract: "evavo.work-header-candidate-review.v1",
    allowedRootCount: configuredLocalRootCount(ROOTS_ENV),
    writesEnabled: writesEnabled(),
    comparativeResponsiveProofBoard: true,
    technicalShortlistingOnly: true,
    explicitVisualCritiqueRequired: true,
    genericStockRiskHardDisqualifier: true,
    aiLookingRiskHardDisqualifier: true,
    blurryCheapRiskHardDisqualifier: true,
    mobileCropFailureHardDisqualifier: true,
    automaticCreativeWinner: false,
    automaticPublicationAllowed: false,
    cloudOverwriteAllowed: false,
  };
}

async function callTool(name, args) {
  if (name === "evavo_work_header_candidate_review_capabilities") return capabilities();
  if (name === "evavo_compare_work_header_candidates") return compareCandidates(args ?? {});
  if (name === "evavo_record_work_header_visual_critique") return recordCritique(args ?? {});
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
  try {
    const outgoing = await handle(JSON.parse(line));
    if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: String(error) }, true)))}\n`);
  }
}
