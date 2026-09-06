#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { admitWorkHeaderCandidatePreviewManifest } from "../packages/media/dist/index.js";
import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-header-preview-admission";
const SERVER_VERSION = "1.4.0";
const PROTOCOL_VERSION = "2025-03-26";
const ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";
const MAX_CANDIDATE_BYTES = 80 * 1024 * 1024;
const allowed = (filePath, output = false) => assertAllowedLocalPath(filePath, { envName: ROOTS_ENV, output, label: "work header preview admission" });
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function readBound(filePath) {
  const resolved = await allowed(filePath, false);
  const bytes = await readFile(resolved);
  if (!bytes.length) throw new Error(`Evidence file is empty: ${resolved}`);
  return { path: resolved, bytes, sha256: sha256(bytes), byteLength: bytes.length };
}

async function fetchCandidateContent(url) {
  if (typeof url !== "string" || !/^https?:\/\//u.test(url)) throw new Error("Preview candidate URL is invalid.");
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    cache: "no-store",
    headers: { "cache-control": "no-cache", pragma: "no-cache", accept: "image/*,*/*;q=0.1" },
  });
  if (!response.ok) throw new Error(`Preview candidate byte reverification failed with HTTP ${response.status}.`);
  const contentType = String(response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.startsWith("image/")) throw new Error("Preview candidate byte reverification returned non-image content.");
  const advertisedLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(advertisedLength) && advertisedLength > MAX_CANDIDATE_BYTES) throw new Error("Preview candidate is too large for governed byte reverification.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_CANDIDATE_BYTES) throw new Error("Preview candidate bytes are empty or exceed the governed review limit.");
  return Object.freeze({ bytes, sha256: sha256(bytes), byteLength: bytes.length, contentType });
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

function buffersFrom(files, candidateContent) {
  return {
    currentDesktop: files.currentDesktop.bytes,
    candidateDesktop: files.candidateDesktop.bytes,
    currentMobile: files.currentMobile.bytes,
    candidateMobile: files.candidateMobile.bytes,
    candidateContent: candidateContent.bytes,
  };
}

function assertAdmissionEquivalent(expected, current) {
  for (const key of [
    "route",
    "candidateId",
    "candidateSrc",
    "candidateSourceUrlSha256",
    "candidateContentSha256",
    "candidateContentByteLength",
    "naturalWidth",
    "naturalHeight",
  ]) {
    if (current?.[key] !== expected?.[key]) throw new Error(`Preview admission evidence drifted for ${key}.`);
  }
  for (const key of [
    "screenshotHashesVerified",
    "candidateContentBytesVerified",
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
  const candidateContent = await fetchCandidateContent(manifest.candidateSrc);
  if (!value.candidateContentBinding || candidateContent.sha256 !== value.candidateContentBinding.sha256 || candidateContent.byteLength !== value.candidateContentBinding.byteLength) {
    throw new Error("Preview candidate response bytes changed after Art Studio admission.");
  }
  const readmission = admitWorkHeaderCandidatePreviewManifest(manifest, buffersFrom(screenshots, candidateContent));
  assertAdmissionEquivalent(value.admission, readmission);

  return Object.freeze({
    ok: true,
    receiptPath: receiptFile.path,
    receiptSha256: receiptFile.sha256,
    receiptByteLength: receiptFile.byteLength,
    manifestPath: manifestFile.path,
    manifestSha256: manifestFile.sha256,
    manifestByteLength: manifestFile.byteLength,
    candidateContentSha256: candidateContent.sha256,
    candidateContentByteLength: candidateContent.byteLength,
    manifestScreenshotAndCandidateBindingsVerified: true,
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
  const candidateContent = await fetchCandidateContent(manifest.candidateSrc);
  const admission = admitWorkHeaderCandidatePreviewManifest(manifest, buffersFrom(screenshots, candidateContent));
  if (admission.atomicEvidenceBundleVerified !== true || admission.candidateContentBytesVerified !== true) throw new Error("Candidate preview did not prove one rollback-safe atomic bundle bound to exact candidate bytes.");
  const screenshotBindings = Object.fromEntries(Object.entries(screenshots).map(([label, file]) => [label, { path: file.path, sha256: file.sha256, bytes: file.byteLength }]));
  const candidateContentBinding = { url: manifest.candidateSrc, sha256: candidateContent.sha256, byteLength: candidateContent.byteLength, contentType: candidateContent.contentType };
  const receipt = {
    contract: "evavo.work-header-preview-admission.v1",
    previewContract: manifest.contract,
    manifestPath: manifestFile.path,
    manifestSha256: manifestFile.sha256,
    manifestByteLength: manifestFile.byteLength,
    admission,
    screenshotBindings,
    candidateContentBinding,
    atomicPreviewEvidenceBundleVerified: true,
    exactCandidateResponseBytesVerified: true,
    approvalState: "unapproved",
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
    nextRequiredAction: "Reverify this exact admission receipt before candidate page-render review. Any manifest, screenshot or candidate response byte change requires a fresh admission.",
  };
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeCreateOnlyBundle([{ path: receiptPath, data: payload, encoding: "utf8" }]);
  return { ok: true, receiptPath, receiptSha256: sha256(Buffer.from(payload, "utf8")), admission, screenshotBindings, candidateContentBinding, atomicPreviewEvidenceBundleVerified: true, exactCandidateResponseBytesVerified: true };
}

const tools = [
  {
    name: "evavo_work_header_preview_admission_capabilities",
    description: "Describe durable and re-verifiable admission of exact-byte-bound next-website Work-header candidate preview v5 evidence into Art Studio.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "evavo_admit_work_header_candidate_preview",
    description: "Re-read candidate-preview v5 evidence, re-fetch and SHA-bind the exact candidate response bytes, require one create-only rollback-safe screenshot+manifest bundle, then write a create-only admission receipt required by page-render review.",
    inputSchema: {
      type: "object",
      properties: { manifestPath: { type: "string" }, receiptPath: { type: "string" }, confirmLocalWrite: { type: "boolean" } },
      required: ["manifestPath", "receiptPath", "confirmLocalWrite"],
      additionalProperties: false,
    },
  },
  {
    name: "evavo_verify_work_header_preview_admission",
    description: "Read-only reverification of a Work-header preview-admission receipt against exact manifest bytes, all four screenshot SHA-256/length bindings, current candidate response SHA-256/length, preview v5 atomic-bundle evidence and recomputed Art Studio admission invariants.",
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
    acceptedPreviewContract: "evavo.work-header-candidate-preview-capture.v5",
    atomicPreviewEvidenceBundleRequired: true,
    exactCandidateResponseBytesRequired: true,
    candidateContentSha256AndLengthBound: true,
    candidateContentRefetchedDuringAdmission: true,
    candidateContentRefetchedDuringReverification: true,
    durableAdmissionReceiptAvailable: true,
    previewAdmissionReverificationAvailable: true,
    staleManifestScreenshotOrCandidateEvidenceRejected: true,
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
