#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { admitWorkHeaderCandidatePreviewManifest } from "../packages/media/dist/index.js";
import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-header-preview-admission";
const SERVER_VERSION = "1.3.0";
const PROTOCOL_VERSION = "2025-03-26";
const ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";
const allowed = (filePath, output = false) => assertAllowedLocalPath(filePath, { envName: ROOTS_ENV, output, label: "work header preview admission" });
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function readBound(filePath) {
  const resolved = await allowed(filePath, false);
  const bytes = await readFile(resolved);
  if (!bytes.length) throw new Error(`Evidence file is empty: ${resolved}`);
  return { path: resolved, bytes, sha256: sha256(bytes), byteLength: bytes.length };
}

function captureByProfile(manifest, profile) {
  const capture = manifest?.captures?.find((item) => item?.profile === profile);
  if (!capture) throw new Error(`Preview manifest is missing ${profile} capture evidence.`);
  return capture;
}

function expectedScreenshotBindings(manifest) {
  const desktop = captureByProfile(manifest, "desktop");
  const mobile = captureByProfile(manifest, "mobile");
  return {
    currentDesktop: desktop.currentScreenshot,
    candidateDesktop: desktop.candidateScreenshot,
    currentMobile: mobile.currentScreenshot,
    candidateMobile: mobile.candidateScreenshot,
  };
}

async function readAndVerifyScreenshots(manifest, receiptBindings = null) {
  const expected = expectedScreenshotBindings(manifest);
  const files = {};
  for (const [label, binding] of Object.entries(expected)) {
    if (!binding || typeof binding.path !== "string" || !/^[0-9a-f]{64}$/u.test(String(binding.sha256 ?? "")) || !Number.isInteger(binding.bytes) || binding.bytes < 1) {
      throw new Error(`${label} preview screenshot binding is malformed.`);
    }
    const receiptBinding = receiptBindings?.[label];
    if (receiptBindings && (!receiptBinding || receiptBinding.path !== binding.path || receiptBinding.sha256 !== binding.sha256 || receiptBinding.bytes !== binding.bytes)) {
      throw new Error(`${label} preview-admission binding no longer matches preview manifest evidence.`);
    }
    const file = await readBound(binding.path);
    if (file.sha256 !== binding.sha256 || file.byteLength !== binding.bytes) throw new Error(`${label} screenshot bytes changed after preview capture.`);
    files[label] = file;
  }
  return files;
}

function buffersFrom(files) {
  return {
    currentDesktop: files.currentDesktop.bytes,
    candidateDesktop: files.candidateDesktop.bytes,
    currentMobile: files.currentMobile.bytes,
    candidateMobile: files.candidateMobile.bytes,
  };
}

function assertAdmissionEquivalent(expected, current) {
  for (const key of [
    "route",
    "candidateId",
    "candidateSrc",
    "candidateSourceUrlSha256",
    "naturalWidth",
    "naturalHeight",
  ]) {
    if (current?.[key] !== expected?.[key]) throw new Error(`Preview admission evidence drifted for ${key}.`);
  }
  for (const key of [
    "screenshotHashesVerified",
    "responsiveSourceIdentityVerified",
    "browserOnlyPreviewVerified",
    "candidateRenderDifferenceVerified",
    "titleSubtitleIdentityVerified",
    "atomicEvidenceBundleVerified",
  ]) {
    if (expected?.[key] !== true || current?.[key] !== true) throw new Error(`Preview admission invariant ${key} is not verified.`);
  }
  const expectedPaths = expected?.pageRenderPaths ?? {};
  const currentPaths = current?.pageRenderPaths ?? {};
  for (const key of ["currentDesktopPath", "candidateDesktopPath", "currentMobilePath", "candidateMobilePath"]) {
    if (currentPaths[key] !== expectedPaths[key]) throw new Error(`Preview admission page-render path drifted for ${key}.`);
  }
}

async function verifyReceipt(receiptPath) {
  const receiptFile = await readBound(receiptPath);
  const value = JSON.parse(receiptFile.bytes.toString("utf8"));
  if (value.contract !== "evavo.work-header-preview-admission.v1" || !value.admission) throw new Error("Unsupported or malformed Work-header preview-admission receipt.");
  if (value.approvalState !== "unapproved" || value.publicationAllowed !== false || value.cloudOverwriteAllowed !== false || value.websiteMutationAllowed !== false) {
    throw new Error("Preview-admission receipt carries forbidden approval or mutation authority.");
  }
  if (value.atomicPreviewEvidenceBundleVerified !== true || value.admission.atomicEvidenceBundleVerified !== true) {
    throw new Error("Preview-admission receipt does not prove an atomic preview evidence bundle.");
  }
  if (typeof value.manifestPath !== "string" || typeof value.manifestSha256 !== "string" || !Number.isInteger(value.manifestByteLength)) {
    throw new Error("Preview-admission manifest binding is malformed.");
  }

  const manifestFile = await readBound(value.manifestPath);
  if (manifestFile.sha256 !== value.manifestSha256 || manifestFile.byteLength !== value.manifestByteLength) {
    throw new Error("Preview manifest bytes changed after Art Studio admission.");
  }
  const manifest = JSON.parse(manifestFile.bytes.toString("utf8"));
  const screenshots = await readAndVerifyScreenshots(manifest, value.screenshotBindings ?? {});
  const readmission = admitWorkHeaderCandidatePreviewManifest(manifest, buffersFrom(screenshots));
  assertAdmissionEquivalent(value.admission, readmission);

  return Object.freeze({
    ok: true,
    receiptPath: receiptFile.path,
    receiptSha256: receiptFile.sha256,
    receiptByteLength: receiptFile.byteLength,
    manifestPath: manifestFile.path,
    manifestSha256: manifestFile.sha256,
    manifestByteLength: manifestFile.byteLength,
    manifestAndScreenshotBindingsVerified: true,
    atomicPreviewEvidenceBundleVerified: true,
    admissionRecomputedAndMatched: true,
    route: readmission.route,
    candidateId: readmission.candidateId,
    candidateSrc: readmission.candidateSrc,
    approvalState: "unapproved",
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
  });
}

async function admit(args) {
  if (typeof args.manifestPath !== "string" || typeof args.receiptPath !== "string") throw new Error("manifestPath and receiptPath are required.");
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);

  const receiptPath = await allowed(args.receiptPath, true);
  const manifestFile = await readBound(args.manifestPath);
  const manifest = JSON.parse(manifestFile.bytes.toString("utf8"));
  const screenshots = await readAndVerifyScreenshots(manifest);
  const admission = admitWorkHeaderCandidatePreviewManifest(manifest, buffersFrom(screenshots));
  if (admission.atomicEvidenceBundleVerified !== true) throw new Error("Candidate preview did not prove one rollback-safe atomic evidence bundle.");
  const screenshotBindings = Object.fromEntries(Object.entries(screenshots).map(([label, file]) => [label, { path: file.path, sha256: file.sha256, bytes: file.byteLength }]));
  const receipt = {
    contract: "evavo.work-header-preview-admission.v1",
    previewContract: manifest.contract,
    manifestPath: manifestFile.path,
    manifestSha256: manifestFile.sha256,
    manifestByteLength: manifestFile.byteLength,
    admission,
    screenshotBindings,
    atomicPreviewEvidenceBundleVerified: true,
    approvalState: "unapproved",
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
    nextRequiredAction: "Reverify this exact admission receipt before candidate page-render review. Any manifest or screenshot byte change requires a fresh admission.",
  };
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeCreateOnlyBundle([{ path: receiptPath, data: payload, encoding: "utf8" }]);
  return { ok: true, receiptPath, receiptSha256: sha256(Buffer.from(payload, "utf8")), admission, screenshotBindings, atomicPreviewEvidenceBundleVerified: true };
}

const tools = [
  {
    name: "evavo_work_header_preview_admission_capabilities",
    description: "Describe durable and re-verifiable admission of rollback-safe next-website Work-header candidate preview v4 evidence into Art Studio.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "evavo_admit_work_header_candidate_preview",
    description: "Re-read candidate-preview v4 evidence, require one create-only rollback-safe screenshot+manifest bundle, reverify source identity and all screenshots, then write a create-only admission receipt required by page-render review.",
    inputSchema: {
      type: "object",
      properties: { manifestPath: { type: "string" }, receiptPath: { type: "string" }, confirmLocalWrite: { type: "boolean" } },
      required: ["manifestPath", "receiptPath", "confirmLocalWrite"],
      additionalProperties: false,
    },
  },
  {
    name: "evavo_verify_work_header_preview_admission",
    description: "Read-only reverification of a Work-header preview-admission receipt against its exact manifest bytes, all four screenshot SHA-256/length bindings, preview v4 atomic-bundle evidence and recomputed Art Studio admission invariants.",
    inputSchema: {
      type: "object",
      properties: { receiptPath: { type: "string", minLength: 1 } },
      required: ["receiptPath"],
      additionalProperties: false,
    },
  },
];

function capabilities() {
  return {
    contract: "evavo.work-header-preview-admission.v1",
    serverVersion: SERVER_VERSION,
    acceptedPreviewContract: "evavo.work-header-candidate-preview-capture.v4",
    atomicPreviewEvidenceBundleRequired: true,
    durableAdmissionReceiptAvailable: true,
    previewAdmissionReverificationAvailable: true,
    staleManifestOrScreenshotEvidenceRejected: true,
    admissionRecomputedDuringReverification: true,
    createOnlyReceiptWrite: true,
    rollbackSafeReceiptWrite: true,
    manifestSha256AndLengthBound: true,
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
  if (name === "evavo_verify_work_header_preview_admission") return verifyReceipt(args?.receiptPath);
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
