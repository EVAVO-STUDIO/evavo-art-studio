#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { admitWorkHeaderCandidatePreviewManifest } from "../packages/media/dist/index.js";
import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-header-preview-admission";
const SERVER_VERSION = "1.1.0";
const PROTOCOL_VERSION = "2025-03-26";
const ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";
const allowed = (path, output = false) => assertAllowedLocalPath(path, { envName: ROOTS_ENV, output, label: "work header preview admission" });
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function readBound(path) {
  const resolved = await allowed(path, false);
  const bytes = await readFile(resolved);
  return { path: resolved, bytes, sha256: sha256(bytes) };
}

function captureByProfile(manifest, profile) {
  const capture = manifest?.captures?.find((item) => item?.profile === profile);
  if (!capture) throw new Error(`Preview manifest is missing ${profile} capture evidence.`);
  return capture;
}

async function admit(args) {
  if (typeof args.manifestPath !== "string" || typeof args.receiptPath !== "string") throw new Error("manifestPath and receiptPath are required.");
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);

  const receiptPath = await allowed(args.receiptPath, true);
  const manifestFile = await readBound(args.manifestPath);
  const manifest = JSON.parse(manifestFile.bytes.toString("utf8"));
  const desktop = captureByProfile(manifest, "desktop");
  const mobile = captureByProfile(manifest, "mobile");
  const [currentDesktop, candidateDesktop, currentMobile, candidateMobile] = await Promise.all([
    readBound(desktop.currentScreenshot.path),
    readBound(desktop.candidateScreenshot.path),
    readBound(mobile.currentScreenshot.path),
    readBound(mobile.candidateScreenshot.path),
  ]);
  const admission = admitWorkHeaderCandidatePreviewManifest(manifest, {
    currentDesktop: currentDesktop.bytes,
    candidateDesktop: candidateDesktop.bytes,
    currentMobile: currentMobile.bytes,
    candidateMobile: candidateMobile.bytes,
  });
  const screenshotBindings = {
    currentDesktop: { path: currentDesktop.path, sha256: currentDesktop.sha256, bytes: currentDesktop.bytes.length },
    candidateDesktop: { path: candidateDesktop.path, sha256: candidateDesktop.sha256, bytes: candidateDesktop.bytes.length },
    currentMobile: { path: currentMobile.path, sha256: currentMobile.sha256, bytes: currentMobile.bytes.length },
    candidateMobile: { path: candidateMobile.path, sha256: candidateMobile.sha256, bytes: candidateMobile.bytes.length },
  };
  const receipt = {
    contract: "evavo.work-header-preview-admission.v1",
    previewContract: manifest.contract,
    manifestPath: manifestFile.path,
    manifestSha256: manifestFile.sha256,
    admission,
    screenshotBindings,
    approvalState: "unapproved",
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
    nextRequiredAction: "Use this exact admission receipt for candidate page-render review. Any manifest or screenshot byte change requires a fresh admission.",
  };
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeCreateOnlyBundle([{ path: receiptPath, data: payload, encoding: "utf8" }]);
  return { ok: true, receiptPath, receiptSha256: sha256(Buffer.from(payload, "utf8")), admission, screenshotBindings };
}

const tools = [
  {
    name: "evavo_work_header_preview_admission_capabilities",
    description: "Describe durable, source-bound admission of next-website Work-header candidate preview v3 evidence into Art Studio.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "evavo_admit_work_header_candidate_preview",
    description: "Re-read candidate-preview v3 evidence, reverify source identity and all screenshots, then write a rollback-safe create-only admission receipt required by page-render review.",
    inputSchema: {
      type: "object",
      properties: { manifestPath: { type: "string" }, receiptPath: { type: "string" }, confirmLocalWrite: { type: "boolean" } },
      required: ["manifestPath", "receiptPath", "confirmLocalWrite"],
      additionalProperties: false,
    },
  },
];

function capabilities() {
  return {
    contract: "evavo.work-header-preview-admission.v1",
    serverVersion: SERVER_VERSION,
    acceptedPreviewContract: "evavo.work-header-candidate-preview-capture.v3",
    durableAdmissionReceiptAvailable: true,
    createOnlyReceiptWrite: true,
    rollbackSafeReceiptWrite: true,
    manifestSha256Bound: true,
    screenshotPathSha256AndLengthBound: true,
    screenshotSha256Reverification: true,
    responsiveCandidateSourceIdentityRequired: true,
    candidateRenderDifferenceRequired: true,
    titleSubtitleIdentityRequired: true,
    browserOnlyNonDestructiveBoundaryRequired: true,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
    allowedRootCount: configuredLocalRootCount(ROOTS_ENV),
    writesEnabled: writesEnabled(),
  };
}

async function callTool(name, args) {
  if (name === "evavo_work_header_preview_admission_capabilities") return capabilities();
  if (name === "evavo_admit_work_header_candidate_preview") return admit(args ?? {});
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
