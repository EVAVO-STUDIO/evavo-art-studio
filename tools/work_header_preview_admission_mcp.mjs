#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { admitWorkHeaderCandidatePreviewManifest } from "../packages/media/dist/index.js";
import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-header-preview-admission";
const SERVER_VERSION = "1.5.0";
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
  const response = await fetch(url, { method: "GET", redirect: "follow", cache: "no-store", headers: { "cache-control": "no-cache", pragma: "no-cache", accept: "image/*,*/*;q=0.1" } });
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

async function readAndVerifyScreenshots(manifest, receiptBindings = null) {
  const desktop = captureByProfile(manifest, "desktop");
  const mobile = captureByProfile(manifest, "mobile");
  const expected = { currentDesktop: desktop.currentScreenshot, candidateDesktop: desktop.candidateScreenshot, currentMobile: mobile.currentScreenshot, candidateMobile: mobile.candidateScreenshot };
  const files = {};
  for (const [label, binding] of Object.entries(expected)) {
    if (!binding || typeof binding.path !== "string" || !/^[0-9a-f]{64}$/u.test(String(binding.sha256 ?? "")) || !Number.isInteger(binding.bytes) || binding.bytes < 1) throw new Error(`${label} preview screenshot binding is malformed.`);
    const receiptBinding = receiptBindings?.[label];
    if (receiptBindings && (!receiptBinding || receiptBinding.path !== binding.path || receiptBinding.sha256 !== binding.sha256 || receiptBinding.bytes !== binding.bytes)) throw new Error(`${label} preview-admission binding no longer matches preview manifest evidence.`);
    const file = await readBound(binding.path);
    if (file.sha256 !== binding.sha256 || file.byteLength !== binding.bytes) throw new Error(`${label} screenshot bytes changed after preview capture.`);
    files[label] = file;
  }
  return files;
}

async function readCandidateArtifact(manifest, receiptBinding = null) {
  const binding = manifest?.candidateContentArtifact;
  if (!binding || typeof binding.path !== "string" || !/^[0-9a-f]{64}$/u.test(String(binding.sha256 ?? "")) || !Number.isInteger(binding.bytes) || binding.bytes < 1 || binding.immutableEvidence !== true) throw new Error("Immutable candidate-content artifact binding is malformed.");
  if (receiptBinding && (receiptBinding.path !== binding.path || receiptBinding.sha256 !== binding.sha256 || receiptBinding.byteLength !== binding.bytes)) throw new Error("Candidate-content artifact receipt binding no longer matches preview manifest.");
  const file = await readBound(binding.path);
  if (file.sha256 !== binding.sha256 || file.byteLength !== binding.bytes) throw new Error("Immutable candidate-content artifact bytes changed after preview capture.");
  return file;
}

function buffersFrom(screenshots, artifact) {
  return { currentDesktop: screenshots.currentDesktop.bytes, candidateDesktop: screenshots.candidateDesktop.bytes, currentMobile: screenshots.currentMobile.bytes, candidateMobile: screenshots.candidateMobile.bytes, candidateContent: artifact.bytes };
}

function assertAdmissionEquivalent(expected, current) {
  for (const key of ["route", "candidateId", "candidateSrc", "candidateSourceUrlSha256", "candidateContentSha256", "candidateContentByteLength", "candidateContentArtifactPath", "naturalWidth", "naturalHeight"]) if (current?.[key] !== expected?.[key]) throw new Error(`Preview admission evidence drifted for ${key}.`);
  for (const key of ["screenshotHashesVerified", "candidateContentBytesVerified", "immutableCandidateContentArtifactVerified", "responsiveSourceIdentityVerified", "browserOnlyPreviewVerified", "candidateRenderDifferenceVerified", "titleSubtitleIdentityVerified", "atomicEvidenceBundleVerified"]) if (expected?.[key] !== true || current?.[key] !== true) throw new Error(`Preview admission invariant ${key} is not verified.`);
  for (const key of ["currentDesktopPath", "candidateDesktopPath", "currentMobilePath", "candidateMobilePath"]) if (current?.pageRenderPaths?.[key] !== expected?.pageRenderPaths?.[key]) throw new Error(`Preview admission page-render path drifted for ${key}.`);
}

async function verifyReceipt(receiptPath) {
  const receiptFile = await readBound(receiptPath);
  const value = JSON.parse(receiptFile.bytes.toString("utf8"));
  if (value.contract !== "evavo.work-header-preview-admission.v1" || !value.admission) throw new Error("Unsupported or malformed Work-header preview-admission receipt.");
  if (value.approvalState !== "unapproved" || value.publicationAllowed !== false || value.cloudOverwriteAllowed !== false || value.websiteMutationAllowed !== false) throw new Error("Preview-admission receipt carries forbidden approval or mutation authority.");
  if (value.atomicPreviewEvidenceBundleVerified !== true || value.immutableCandidateContentArtifactVerified !== true || value.exactCandidateResponseBytesVerified !== true) throw new Error("Preview-admission receipt lacks atomic immutable candidate evidence.");

  const manifestFile = await readBound(value.manifestPath);
  if (manifestFile.sha256 !== value.manifestSha256 || manifestFile.byteLength !== value.manifestByteLength) throw new Error("Preview manifest bytes changed after Art Studio admission.");
  const manifest = JSON.parse(manifestFile.bytes.toString("utf8"));
  const screenshots = await readAndVerifyScreenshots(manifest, value.screenshotBindings ?? {});
  const artifact = await readCandidateArtifact(manifest, value.candidateContentArtifactBinding);
  const remote = await fetchCandidateContent(manifest.candidateSrc);
  if (remote.sha256 !== artifact.sha256 || remote.byteLength !== artifact.byteLength) throw new Error("Current preview candidate response no longer matches immutable candidate-content evidence.");
  const readmission = admitWorkHeaderCandidatePreviewManifest(manifest, buffersFrom(screenshots, artifact));
  assertAdmissionEquivalent(value.admission, readmission);

  return Object.freeze({ ok: true, receiptPath: receiptFile.path, receiptSha256: receiptFile.sha256, receiptByteLength: receiptFile.byteLength, manifestPath: manifestFile.path, manifestSha256: manifestFile.sha256, manifestByteLength: manifestFile.byteLength, candidateContentArtifactPath: artifact.path, candidateContentSha256: artifact.sha256, candidateContentByteLength: artifact.byteLength, immutableCandidateContentArtifactVerified: true, currentRemoteCandidateStillMatchesArtifact: true, admissionRecomputedAndMatched: true, route: readmission.route, candidateId: readmission.candidateId, approvalState: "unapproved", publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

async function admit(args) {
  if (typeof args.manifestPath !== "string" || typeof args.receiptPath !== "string") throw new Error("manifestPath and receiptPath are required.");
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);
  const receiptPath = await allowed(args.receiptPath, true);
  const manifestFile = await readBound(args.manifestPath);
  const manifest = JSON.parse(manifestFile.bytes.toString("utf8"));
  const screenshots = await readAndVerifyScreenshots(manifest);
  const artifact = await readCandidateArtifact(manifest);
  const remote = await fetchCandidateContent(manifest.candidateSrc);
  if (remote.sha256 !== artifact.sha256 || remote.byteLength !== artifact.byteLength) throw new Error("Current preview candidate response does not match immutable candidate-content evidence.");
  const admission = admitWorkHeaderCandidatePreviewManifest(manifest, buffersFrom(screenshots, artifact));
  const screenshotBindings = Object.fromEntries(Object.entries(screenshots).map(([label, file]) => [label, { path: file.path, sha256: file.sha256, bytes: file.byteLength }]));
  const candidateContentArtifactBinding = { path: artifact.path, sha256: artifact.sha256, byteLength: artifact.byteLength, contentType: manifest.candidateContentArtifact.contentType };
  const receipt = { contract: "evavo.work-header-preview-admission.v1", previewContract: manifest.contract, manifestPath: manifestFile.path, manifestSha256: manifestFile.sha256, manifestByteLength: manifestFile.byteLength, admission, screenshotBindings, candidateContentArtifactBinding, atomicPreviewEvidenceBundleVerified: true, immutableCandidateContentArtifactVerified: true, exactCandidateResponseBytesVerified: true, currentRemoteCandidateMatchedArtifactAtAdmission: true, approvalState: "unapproved", publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false, nextRequiredAction: "Reverify immutable candidate artifact, current remote response, manifest and screenshots before page-render review." };
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeCreateOnlyBundle([{ path: receiptPath, data: payload, encoding: "utf8" }]);
  return { ok: true, receiptPath, receiptSha256: sha256(Buffer.from(payload, "utf8")), admission, candidateContentArtifactBinding, immutableCandidateContentArtifactVerified: true, exactCandidateResponseBytesVerified: true };
}

const tools = [
  { name: "evavo_work_header_preview_admission_capabilities", description: "Describe durable admission of immutable candidate-content Work-header preview v6 evidence.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_admit_work_header_candidate_preview", description: "Admit preview v6 by verifying its immutable candidate-content artifact, current remote response, manifest and all screenshots, then write an unapproved create-only receipt.", inputSchema: { type: "object", properties: { manifestPath: { type: "string" }, receiptPath: { type: "string" }, confirmLocalWrite: { type: "boolean" } }, required: ["manifestPath", "receiptPath", "confirmLocalWrite"], additionalProperties: false } },
  { name: "evavo_verify_work_header_preview_admission", description: "Read-only reverification of the immutable candidate artifact, current candidate response, manifest and screenshot evidence in an existing preview-admission receipt.", inputSchema: { type: "object", properties: { receiptPath: { type: "string", minLength: 1 } }, required: ["receiptPath"], additionalProperties: false } },
];
function capabilities() {
  return { contract: "evavo.work-header-preview-admission.v1", serverVersion: SERVER_VERSION, acceptedPreviewContract: "evavo.work-header-candidate-preview-capture.v6", immutableCandidateContentArtifactRequired: true, candidateContentArtifactSha256AndLengthBound: true, currentRemoteCandidateMustMatchArtifact: true, candidateContentRefetchedDuringAdmission: true, candidateContentRefetchedDuringReverification: true, atomicPreviewEvidenceBundleRequired: true, previewAdmissionReverificationAvailable: true, staleManifestScreenshotArtifactOrRemoteEvidenceRejected: true, admissionRecomputedDuringReverification: true, createOnlyReceiptWrite: true, rollbackSafeReceiptWrite: true, manifestSha256AndLengthBound: true, screenshotPathSha256AndLengthBound: true, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false, allowedRootCount: configuredLocalRootCount(ROOTS_ENV), writesEnabled: writesEnabled() };
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
    const message = JSON.parse(line); let outgoing;
    if (message.method === "initialize") outgoing = response(message.id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } });
    else if (message.method === "notifications/initialized") outgoing = null;
    else if (message.method === "tools/list") outgoing = response(message.id, { tools });
    else if (message.method === "tools/call") { try { outgoing = response(message.id, toolResult(await callTool(message.params?.name, message.params?.arguments ?? {}))); } catch (error) { outgoing = response(message.id, toolResult({ ok: false, message: error instanceof Error ? error.message : String(error) }, true)); } }
    else outgoing = response(message.id, toolResult({ ok: false, message: `Unsupported method ${JSON.stringify(message.method)}.` }, true));
    if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`);
  } catch (error) { process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: String(error) }, true)))}\n`); }
}
