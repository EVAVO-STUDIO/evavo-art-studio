#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-header-publication-page-postflight-admission";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const CONTRACT = "evavo.work-header-publication-page-postflight-admission.v1";
const SCHEMA_SHA256 = "7f7a2116736c69f92458e07811fd688815d3b5d61423867adcd032df2e205d24";
const SCHEMA_URL = new URL("../contracts/work-header-publication-page-postflight-admission-v1.schema.json", import.meta.url);
const PUBLICATION_POSTFLIGHT_CONTRACT = "evavo.work-header-publication-postflight.v1";
const PUBLICATION_POSTFLIGHT_SCHEMA_SHA256 = "5a1a2a9a329d3ce4eecd81981e3aa35cd2d6d2d3487f78b6b56672bacca99ae8";
const WEBSITE_PAGE_POSTFLIGHT_CONTRACT = "evavo.work-header-publication-page-postflight.v1";
const ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";
const allowed = (p, output = false) => assertAllowedLocalPath(p, { envName: ROOTS_ENV, output, label: "work header publication page postflight admission" });
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function assertSchemaDigest() {
  const bytes = await readFile(SCHEMA_URL);
  const current = sha256(bytes);
  if (current !== SCHEMA_SHA256) throw new Error(`Publication-page-postflight admission schema bytes drifted from governed SHA-256 (${current}).`);
}
async function bound(filePath) {
  const resolved = await allowed(filePath, false);
  const bytes = await readFile(resolved);
  if (!bytes.length) throw new Error(`Evidence file is empty: ${resolved}`);
  return Object.freeze({ path: resolved, bytes, sha256: sha256(bytes), byteLength: bytes.length });
}
function assertNoMutationAuthority(value, label) {
  for (const field of ["publicationAllowed", "cloudOverwriteAllowed", "websiteMutationAllowed"]) if (value?.[field] !== false) throw new Error(`${label} carries forbidden mutation authority (${field}).`);
  if (value?.executionAllowed !== undefined && value.executionAllowed !== false) throw new Error(`${label} carries forbidden execution authority.`);
}
async function verifyBinding(binding, label) {
  if (!binding || typeof binding.path !== "string" || typeof binding.sha256 !== "string" || !Number.isInteger(binding.byteLength)) throw new Error(`${label} file binding is malformed.`);
  const file = await bound(binding.path);
  if (file.sha256 !== binding.sha256 || file.byteLength !== binding.byteLength) throw new Error(`${label} bytes changed after website browser postflight capture.`);
  return file;
}

async function reverifyPublicationPostflight(receiptPath) {
  const file = await bound(receiptPath);
  const value = JSON.parse(file.bytes.toString("utf8"));
  if (value.contract !== PUBLICATION_POSTFLIGHT_CONTRACT || value.schemaSha256 !== PUBLICATION_POSTFLIGHT_SCHEMA_SHA256 || value.postflightState !== "published-verified-rollback-ready") throw new Error("Publication-postflight receipt contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(value, "Publication-postflight receipt");
  for (const field of ["executionResultReverified", "rollbackReadinessReverified", "liveTargetReverified", "liveTargetMatchesReviewedCandidate", "rollbackBackupStillReady", "postflightEvidenceOnly"]) if (value[field] !== true) throw new Error(`Publication-postflight receipt lacks required invariant ${field}.`);
  const live = await bound(value.liveTargetPath);
  if (live.sha256 !== value.liveTargetSha256 || live.byteLength !== value.liveTargetByteLength || live.sha256 !== value.candidateSha256 || live.byteLength !== value.candidateByteLength) throw new Error("Publication-postflight live target no longer exactly matches the reviewed candidate bytes.");
  const backup = await bound(value.rollbackBackupPath);
  if (backup.sha256 !== value.rollbackBackupSha256 || backup.byteLength !== value.rollbackBackupByteLength) throw new Error("Publication-postflight rollback backup changed after verification.");
  if (backup.path === live.path) throw new Error("Rollback backup must remain physically separate from the live target.");
  return Object.freeze({ file, value, live, backup });
}

async function reverifyWebsitePagePostflight(reportPath, publication) {
  const file = await bound(reportPath);
  const value = JSON.parse(file.bytes.toString("utf8"));
  if (value.contract !== WEBSITE_PAGE_POSTFLIGHT_CONTRACT || value.ok !== true) throw new Error("Website publication-page-postflight report is invalid or failed.");
  if (value.route !== publication.value.route || value.expectedCandidate?.sha256 !== publication.value.candidateSha256 || value.expectedCandidate?.byteLength !== publication.value.candidateByteLength) throw new Error("Website publication-page postflight candidate identity does not match publication evidence.");
  if (value.livePageMatchesReviewedCandidate !== true || value.responsiveBrowserBytesStable !== true || value.runtimeMediaAndLayoutVerified !== true) throw new Error("Website publication-page postflight does not prove exact responsive live candidate rendering and layout quality.");
  if (value.mutationPerformed !== false || value.publicationPerformed !== false || value.cloudinaryMutationPerformed !== false || value.sourceMutationPerformed !== false || value.deploymentMutationPerformed !== false) throw new Error("Website publication-page postflight violated the read-only evidence boundary.");
  const bundle = value.evidenceBundle ?? {};
  if (bundle.createOnly !== true || bundle.rollbackSafe !== true || bundle.desktopMobileScreenshotsAndReportPublishedTogether !== true) throw new Error("Website publication-page postflight does not prove a rollback-safe create-only evidence bundle.");
  if ((value.findings ?? []).some((finding) => finding?.severity === "error")) throw new Error("Website publication-page postflight contains blocking browser/runtime findings.");
  const profiles = new Map((value.profiles ?? []).map((item) => [item?.profile, item]));
  for (const profile of ["desktop", "mobile"]) {
    const item = profiles.get(profile);
    if (!item || item.ok !== true || item.browserResponse?.exactPageLoadRequestBound !== true || item.browserResponse?.method !== "GET" || item.browserResponse?.sha256 !== publication.value.candidateSha256 || item.browserResponse?.byteLength !== publication.value.candidateByteLength) throw new Error(`${profile} website page-postflight browser evidence does not identify the exact reviewed candidate bytes.`);
  }
  const desktop = await verifyBinding(value.screenshotBindings?.desktop, "desktop publication-page screenshot");
  const mobile = await verifyBinding(value.screenshotBindings?.mobile, "mobile publication-page screenshot");
  return Object.freeze({ file, value, desktop, mobile });
}

function deterministicReceiptPath(publicationPostflightPath) {
  return `${publicationPostflightPath}.page-browser-admission.json`;
}

async function review(publicationPostflightReceiptPath, websitePagePostflightReportPath) {
  const publication = await reverifyPublicationPostflight(publicationPostflightReceiptPath);
  const website = await reverifyWebsitePagePostflight(websitePagePostflightReportPath, publication);
  return Object.freeze({ publication, website });
}

async function admit(args) {
  await assertSchemaDigest();
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required to create durable page-postflight admission evidence.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);
  for (const name of ["publicationPostflightReceiptPath", "websitePagePostflightReportPath"]) if (typeof args[name] !== "string" || !args[name]) throw new Error(`${name} is required.`);
  const result = await review(args.publicationPostflightReceiptPath, args.websitePagePostflightReportPath);
  const receiptPath = await allowed(deterministicReceiptPath(result.publication.file.path), true);
  const receipt = {
    contract: CONTRACT,
    schemaSha256: SCHEMA_SHA256,
    admissionState: "live-page-verified-rollback-ready",
    publicationPostflightReceiptPath: result.publication.file.path,
    publicationPostflightReceiptSha256: result.publication.file.sha256,
    publicationPostflightReceiptByteLength: result.publication.file.byteLength,
    websitePagePostflightReportPath: result.website.file.path,
    websitePagePostflightReportSha256: result.website.file.sha256,
    websitePagePostflightReportByteLength: result.website.file.byteLength,
    route: result.publication.value.route,
    candidateSha256: result.publication.value.candidateSha256,
    candidateByteLength: result.publication.value.candidateByteLength,
    desktopScreenshot: { path: result.website.desktop.path, sha256: result.website.desktop.sha256, byteLength: result.website.desktop.byteLength },
    mobileScreenshot: { path: result.website.mobile.path, sha256: result.website.mobile.sha256, byteLength: result.website.mobile.byteLength },
    browserLoadedCandidateBytesVerifiedAcrossProfiles: true,
    runtimeMediaAndLayoutVerified: true,
    rollbackBackupStillReady: true,
    evidenceOnly: true,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
  };
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeCreateOnlyBundle([{ path: receiptPath, data: payload, encoding: "utf8" }]);
  return Object.freeze({ ok: true, receiptPath, receiptSha256: sha256(Buffer.from(payload, "utf8")), admissionState: receipt.admissionState, route: receipt.route, candidateSha256: receipt.candidateSha256, browserLoadedCandidateBytesVerifiedAcrossProfiles: true, runtimeMediaAndLayoutVerified: true, rollbackBackupStillReady: true, evidenceOnly: true, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

async function verify(receiptPath) {
  await assertSchemaDigest();
  const file = await bound(receiptPath);
  const value = JSON.parse(file.bytes.toString("utf8"));
  if (value.contract !== CONTRACT || value.schemaSha256 !== SCHEMA_SHA256 || value.admissionState !== "live-page-verified-rollback-ready") throw new Error("Publication-page-postflight admission receipt contract/schema/state is invalid or stale.");
  assertNoMutationAuthority(value, "Publication-page-postflight admission receipt");
  for (const field of ["browserLoadedCandidateBytesVerifiedAcrossProfiles", "runtimeMediaAndLayoutVerified", "rollbackBackupStillReady", "evidenceOnly"]) if (value[field] !== true) throw new Error(`Publication-page-postflight admission lacks required invariant ${field}.`);
  const expectedPath = await allowed(deterministicReceiptPath(value.publicationPostflightReceiptPath), false);
  if (file.path !== expectedPath) throw new Error("Publication-page-postflight admission is not at its deterministic create-only path.");
  const result = await review(value.publicationPostflightReceiptPath, value.websitePagePostflightReportPath);
  if (result.publication.file.sha256 !== value.publicationPostflightReceiptSha256 || result.publication.file.byteLength !== value.publicationPostflightReceiptByteLength) throw new Error("Publication-page-postflight admission publication lineage drifted.");
  if (result.website.file.sha256 !== value.websitePagePostflightReportSha256 || result.website.file.byteLength !== value.websitePagePostflightReportByteLength) throw new Error("Publication-page-postflight admission website browser report lineage drifted.");
  if (value.route !== result.publication.value.route || value.candidateSha256 !== result.publication.value.candidateSha256 || value.candidateByteLength !== result.publication.value.candidateByteLength) throw new Error("Publication-page-postflight admission candidate identity drifted.");
  for (const [name, current] of [["desktopScreenshot", result.website.desktop], ["mobileScreenshot", result.website.mobile]]) if (value[name]?.path !== current.path || value[name]?.sha256 !== current.sha256 || value[name]?.byteLength !== current.byteLength) throw new Error(`${name} binding drifted.`);
  return Object.freeze({ ok: true, receiptPath: file.path, receiptSha256: file.sha256, receiptByteLength: file.byteLength, admissionState: value.admissionState, route: value.route, candidateSha256: value.candidateSha256, browserLoadedCandidateBytesVerifiedAcrossProfiles: true, runtimeMediaAndLayoutVerified: true, rollbackBackupStillReady: true, evidenceOnly: true, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

const tools = [
  { name: "evavo_work_header_publication_page_postflight_admission_capabilities", description: "Describe durable Art Studio admission of live desktop/mobile Work-page browser postflight evidence after external publication. It cannot publish, overwrite Cloudinary or mutate website source.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_admit_work_header_publication_page_postflight", description: "Reverify the existing publication postflight, exact live desktop/mobile Chrome-loaded candidate bytes, runtime media/layout quality and rollback backup, then write deterministic create-only admission evidence.", inputSchema: { type: "object", properties: { publicationPostflightReceiptPath: { type: "string", minLength: 1 }, websitePagePostflightReportPath: { type: "string", minLength: 1 }, confirmLocalWrite: { type: "boolean" } }, required: ["publicationPostflightReceiptPath", "websitePagePostflightReportPath", "confirmLocalWrite"], additionalProperties: false } },
  { name: "evavo_verify_work_header_publication_page_postflight_admission", description: "Read-only reverification of a publication-page postflight admission against the exact publication receipt, website browser report, screenshots, live candidate bytes and rollback backup.", inputSchema: { type: "object", properties: { receiptPath: { type: "string", minLength: 1 } }, required: ["receiptPath"], additionalProperties: false } },
];
function capabilities() { return Object.freeze({ contract: CONTRACT, serverVersion: SERVER_VERSION, schemaSha256: SCHEMA_SHA256, publicationPostflightReverificationRequired: true, websiteDesktopMobileBrowserPostflightRequired: true, exactChromeLoadedCandidateBytesRequiredAcrossProfiles: true, runtimeMediaAndLayoutQualityRequired: true, rollbackBackupMustRemainReady: true, deterministicCreateOnlyReceipt: true, evidenceOnly: true, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false, allowedRootCount: configuredLocalRootCount(ROOTS_ENV), writesEnabled: writesEnabled() }); }
async function callTool(name, args) {
  if (name === "evavo_work_header_publication_page_postflight_admission_capabilities") return capabilities();
  if (name === "evavo_admit_work_header_publication_page_postflight") return admit(args ?? {});
  if (name === "evavo_verify_work_header_publication_page_postflight_admission") return verify(args?.receiptPath);
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
    else outgoing = response(message.id, toolResult({ ok: false, message: `Unsupported method ${String(message.method)}.` }, true));
    if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`);
  } catch (error) { process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: String(error) }, true)))}\n`); }
}
