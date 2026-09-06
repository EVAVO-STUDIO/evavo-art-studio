#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";
import { admitWorkHeaderCandidatePreviewManifest } from "../packages/media/dist/index.js";
import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-header-preview-admission";
const SERVER_VERSION = "1.6.0";
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
  const response = await fetch(url, { method: "GET", redirect: "follow", cache: "no-store", headers: { "cache-control": "no-cache", pragma: "no-cache", accept: "image/*,*/*;q=0.1" } });
  if (!response.ok) throw new Error(`Preview candidate byte reverification failed with HTTP ${response.status}.`);
  const contentType = String(response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.startsWith("image/")) throw new Error("Preview candidate byte reverification returned non-image content.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_CANDIDATE_BYTES) throw new Error("Preview candidate bytes are empty or exceed the governed review limit.");
  return { bytes, sha256: sha256(bytes), byteLength: bytes.length, contentType };
}
function captureByProfile(manifest, profile) {
  const capture = manifest?.captures?.find((item) => item?.profile === profile);
  if (!capture) throw new Error(`Preview manifest is missing ${profile} capture evidence.`);
  return capture;
}
function assertBrowserResponseIdentity(manifest) {
  const source = manifest.candidateSource ?? {};
  const identity = manifest.browserCandidateResponseIdentity ?? {};
  if (identity.matchesImmutableCandidateArtifact !== true || identity.stableAcrossProfiles !== true) throw new Error("Preview browser-response identity flags are not verified.");
  for (const profile of ["desktop", "mobile"]) {
    const capture = captureByProfile(manifest, profile);
    const response = capture.browserCandidateResponse ?? {};
    if (response.url !== manifest.candidateSrc || response.sha256 !== source.contentSha256 || response.byteLength !== source.contentByteLength) throw new Error(`${profile} Chrome response-body evidence no longer matches immutable candidate bytes.`);
    if (identity[`${profile}Sha256`] !== response.sha256 || identity[`${profile}ByteLength`] !== response.byteLength) throw new Error(`${profile} browser response summary drifted from captured CDP evidence.`);
  }
}
async function readScreenshots(manifest, receiptBindings = null) {
  const desktop = captureByProfile(manifest, "desktop");
  const mobile = captureByProfile(manifest, "mobile");
  const expected = { currentDesktop: desktop.currentScreenshot, candidateDesktop: desktop.candidateScreenshot, currentMobile: mobile.currentScreenshot, candidateMobile: mobile.candidateScreenshot };
  const files = {};
  for (const [label, binding] of Object.entries(expected)) {
    const receiptBinding = receiptBindings?.[label];
    if (receiptBindings && (!receiptBinding || receiptBinding.path !== binding.path || receiptBinding.sha256 !== binding.sha256 || receiptBinding.bytes !== binding.bytes)) throw new Error(`${label} preview-admission binding no longer matches preview manifest evidence.`);
    const file = await readBound(binding.path);
    if (file.sha256 !== binding.sha256 || file.byteLength !== binding.bytes) throw new Error(`${label} screenshot bytes changed after preview capture.`);
    files[label] = file;
  }
  return files;
}
async function readArtifact(manifest, receiptBinding = null) {
  const binding = manifest?.candidateContentArtifact;
  if (!binding?.path || binding.immutableEvidence !== true) throw new Error("Immutable candidate-content artifact binding is malformed.");
  if (receiptBinding && (receiptBinding.path !== binding.path || receiptBinding.sha256 !== binding.sha256 || receiptBinding.byteLength !== binding.bytes)) throw new Error("Candidate-content artifact receipt binding no longer matches preview manifest.");
  const file = await readBound(binding.path);
  if (file.sha256 !== binding.sha256 || file.byteLength !== binding.bytes) throw new Error("Immutable candidate-content artifact bytes changed after preview capture.");
  return file;
}
const buffersFrom = (screenshots, artifact) => ({ currentDesktop: screenshots.currentDesktop.bytes, candidateDesktop: screenshots.candidateDesktop.bytes, currentMobile: screenshots.currentMobile.bytes, candidateMobile: screenshots.candidateMobile.bytes, candidateContent: artifact.bytes });
function assertAdmissionEquivalent(expected, current) {
  for (const key of ["route", "candidateId", "candidateSrc", "candidateSourceUrlSha256", "candidateContentSha256", "candidateContentByteLength", "candidateContentArtifactPath", "naturalWidth", "naturalHeight"]) if (current?.[key] !== expected?.[key]) throw new Error(`Preview admission evidence drifted for ${key}.`);
  for (const key of ["screenshotHashesVerified", "candidateContentBytesVerified", "immutableCandidateContentArtifactVerified", "browserResponseBodyIdentityVerified", "responsiveSourceIdentityVerified", "browserOnlyPreviewVerified", "candidateRenderDifferenceVerified", "titleSubtitleIdentityVerified", "atomicEvidenceBundleVerified"]) if (expected?.[key] !== true || current?.[key] !== true) throw new Error(`Preview admission invariant ${key} is not verified.`);
}
async function verifyReceipt(receiptPath) {
  const receiptFile = await readBound(receiptPath);
  const value = JSON.parse(receiptFile.bytes.toString("utf8"));
  if (value.contract !== "evavo.work-header-preview-admission.v1" || value.approvalState !== "unapproved" || value.publicationAllowed !== false || value.cloudOverwriteAllowed !== false || value.websiteMutationAllowed !== false) throw new Error("Unsupported or unsafe Work-header preview-admission receipt.");
  const manifestFile = await readBound(value.manifestPath);
  if (manifestFile.sha256 !== value.manifestSha256 || manifestFile.byteLength !== value.manifestByteLength) throw new Error("Preview manifest bytes changed after Art Studio admission.");
  const manifest = JSON.parse(manifestFile.bytes.toString("utf8"));
  assertBrowserResponseIdentity(manifest);
  const screenshots = await readScreenshots(manifest, value.screenshotBindings);
  const artifact = await readArtifact(manifest, value.candidateContentArtifactBinding);
  const remote = await fetchCandidateContent(manifest.candidateSrc);
  if (remote.sha256 !== artifact.sha256 || remote.byteLength !== artifact.byteLength) throw new Error("Current preview candidate response no longer matches immutable candidate-content evidence.");
  const readmission = admitWorkHeaderCandidatePreviewManifest(manifest, buffersFrom(screenshots, artifact));
  assertAdmissionEquivalent(value.admission, readmission);
  return { ok: true, receiptPath: receiptFile.path, receiptSha256: receiptFile.sha256, receiptByteLength: receiptFile.byteLength, manifestPath: manifestFile.path, manifestSha256: manifestFile.sha256, manifestByteLength: manifestFile.byteLength, candidateContentArtifactPath: artifact.path, candidateContentSha256: artifact.sha256, candidateContentByteLength: artifact.byteLength, immutableCandidateContentArtifactVerified: true, browserResponseBodyIdentityVerified: true, currentRemoteCandidateStillMatchesArtifact: true, admissionRecomputedAndMatched: true, approvalState: "unapproved", publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false };
}
async function admit(args) {
  if (args.confirmLocalWrite !== true || !writesEnabled()) throw new Error("Explicit local-write admission is required.");
  const manifestFile = await readBound(args.manifestPath);
  const manifest = JSON.parse(manifestFile.bytes.toString("utf8"));
  assertBrowserResponseIdentity(manifest);
  const screenshots = await readScreenshots(manifest);
  const artifact = await readArtifact(manifest);
  const remote = await fetchCandidateContent(manifest.candidateSrc);
  if (remote.sha256 !== artifact.sha256 || remote.byteLength !== artifact.byteLength) throw new Error("Current preview candidate response does not match immutable candidate-content evidence.");
  const admission = admitWorkHeaderCandidatePreviewManifest(manifest, buffersFrom(screenshots, artifact));
  if (admission.browserResponseBodyIdentityVerified !== true) throw new Error("Art Studio admission did not verify the Chrome-loaded candidate bytes.");
  const screenshotBindings = Object.fromEntries(Object.entries(screenshots).map(([label, file]) => [label, { path: file.path, sha256: file.sha256, bytes: file.byteLength }]));
  const candidateContentArtifactBinding = { path: artifact.path, sha256: artifact.sha256, byteLength: artifact.byteLength, contentType: manifest.candidateContentArtifact.contentType };
  const candidateContentBinding = { url: manifest.candidateSrc, sha256: artifact.sha256, byteLength: artifact.byteLength, contentType: manifest.candidateContentArtifact.contentType, immutableArtifactPath: artifact.path };
  const browserResponseBinding = { sha256: manifest.browserCandidateResponseIdentity.desktopSha256, byteLength: manifest.browserCandidateResponseIdentity.desktopByteLength, verifiedAcrossProfiles: true };
  const receipt = { contract: "evavo.work-header-preview-admission.v1", previewContract: manifest.contract, manifestPath: manifestFile.path, manifestSha256: manifestFile.sha256, manifestByteLength: manifestFile.byteLength, admission, screenshotBindings, candidateContentArtifactBinding, candidateContentBinding, browserResponseBinding, atomicPreviewEvidenceBundleVerified: true, immutableCandidateContentArtifactVerified: true, browserResponseBodyIdentityVerified: true, exactCandidateResponseBytesVerified: true, currentRemoteCandidateMatchedArtifactAtAdmission: true, approvalState: "unapproved", publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false };
  const receiptPath = await allowed(args.receiptPath, true);
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeCreateOnlyBundle([{ path: receiptPath, data: payload, encoding: "utf8" }]);
  return { ok: true, receiptPath, admission, candidateContentArtifactBinding, browserResponseBinding, exactCandidateResponseBytesVerified: true };
}

const tools = [
  { name: "evavo_work_header_preview_admission_capabilities", description: "Describe immutable candidate-content preview v7 admission with exact Chrome response-body identity.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_admit_work_header_candidate_preview", description: "Admit preview v7 only when immutable candidate content, current remote bytes, screenshots and the actual Chrome image response body all identify the same bytes.", inputSchema: { type: "object", properties: { manifestPath: { type: "string" }, receiptPath: { type: "string" }, confirmLocalWrite: { type: "boolean" } }, required: ["manifestPath", "receiptPath", "confirmLocalWrite"], additionalProperties: false } },
  { name: "evavo_verify_work_header_preview_admission", description: "Reverify immutable candidate artifact, Chrome response-body identity, current candidate response, manifest and screenshots.", inputSchema: { type: "object", properties: { receiptPath: { type: "string" } }, required: ["receiptPath"], additionalProperties: false } },
];
function capabilities() { return { contract: "evavo.work-header-preview-admission.v1", serverVersion: SERVER_VERSION, acceptedPreviewContract: "evavo.work-header-candidate-preview-capture.v7", immutableCandidateContentArtifactRequired: true, browserResponseBodyIdentityRequired: true, browserResponseBodyMustMatchImmutableArtifact: true, browserResponseBodyMustMatchAcrossProfiles: true, candidateContentArtifactSha256AndLengthBound: true, currentRemoteCandidateMustMatchArtifact: true, candidateContentRefetchedDuringAdmission: true, candidateContentRefetchedDuringReverification: true, atomicPreviewEvidenceBundleRequired: true, previewAdmissionReverificationAvailable: true, staleManifestScreenshotArtifactBrowserOrRemoteEvidenceRejected: true, admissionRecomputedDuringReverification: true, createOnlyReceiptWrite: true, rollbackSafeReceiptWrite: true, manifestSha256AndLengthBound: true, screenshotPathSha256AndLengthBound: true, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false, allowedRootCount: configuredLocalRootCount(ROOTS_ENV), writesEnabled: writesEnabled() }; }
async function callTool(name, args) {
  if (name === "evavo_work_header_preview_admission_capabilities") return capabilities();
  if (name === "evavo_admit_work_header_candidate_preview") return admit(args ?? {});
  if (name === "evavo_verify_work_header_preview_admission") return verifyReceipt(args?.receiptPath);
  throw new Error(`Unknown tool ${name}`);
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
    else outgoing = response(message.id, toolResult({ ok: false, message: `Unsupported method ${message.method}` }, true));
    if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`);
  } catch (error) { process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: String(error) }, true)))}\n`); }
}
