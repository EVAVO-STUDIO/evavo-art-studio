#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-header-current-target-attestation";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const CONTRACT = "evavo.work-header-current-target-attestation.v1";
const SCHEMA_SHA256 = "0799f7ea8161512e44594868b119c71d5124810a0f3047bbe70f01d90d77624b";
const SCHEMA_URL = new URL("../contracts/work-header-current-target-attestation-v1.schema.json", import.meta.url);
const ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";
const MAX_REMOTE_BYTES = 80 * 1024 * 1024;
const TARGET_KINDS = new Set(["website-header-source-update", "cloudinary-stable-id-replacement"]);
const CLOUDINARY_HOST = "res.cloudinary.com";
const CLOUDINARY_CLOUD = "dntogqtey";
const allowed = (p, output = false) => assertAllowedLocalPath(p, { envName: ROOTS_ENV, output, label: "work header current target attestation" });
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function assertCurrentSchemaDigest() {
  const bytes = await readFile(SCHEMA_URL);
  const current = sha256(bytes);
  if (current !== SCHEMA_SHA256) throw new Error(`Current-target attestation schema bytes drifted from governed SHA-256 (${current}).`);
}

function bounded(value, label, max = 2048) {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  const text = value.trim();
  if (!text || text.length > max || /[\u0000-\u001f\u007f]/u.test(text)) throw new Error(`${label} must contain 1-${max} safe characters.`);
  return text;
}

async function readLocalSource(filePath) {
  const resolved = await allowed(filePath, false);
  const bytes = await readFile(resolved);
  if (!bytes.length) throw new Error("Current website target source is empty.");
  return Object.freeze({ kind: "local-file", locator: resolved, bytes, sha256: sha256(bytes), byteLength: bytes.length, contentType: null });
}

function normalizeCloudinaryUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== CLOUDINARY_HOST || !url.pathname.startsWith(`/${CLOUDINARY_CLOUD}/`)) throw new Error("Cloudinary current-target URL must use EVAVO's governed HTTPS cloud.");
  url.hash = "";
  return url.href;
}

async function readCloudinarySource(urlValue) {
  const url = normalizeCloudinaryUrl(urlValue);
  const response = await fetch(url, { method: "GET", redirect: "follow", cache: "no-store", headers: { "cache-control": "no-cache", pragma: "no-cache", accept: "image/*,*/*;q=0.1" } });
  if (!response.ok) throw new Error(`Current Cloudinary target returned HTTP ${response.status}.`);
  const contentType = String(response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.startsWith("image/")) throw new Error("Current Cloudinary target did not return image bytes.");
  const advertisedLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(advertisedLength) && advertisedLength > MAX_REMOTE_BYTES) throw new Error("Current Cloudinary target exceeds governed snapshot limit.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_REMOTE_BYTES) throw new Error("Current Cloudinary target bytes are empty or exceed governed snapshot limit.");
  const finalUrl = normalizeCloudinaryUrl(response.url || url);
  return Object.freeze({ kind: "https-url", locator: finalUrl, bytes, sha256: sha256(bytes), byteLength: bytes.length, contentType });
}

async function readObservedSource(args) {
  if (args.targetKind === "website-header-source-update") {
    if (typeof args.currentTargetPath !== "string" || args.currentTargetUrl !== undefined) throw new Error("website-header-source-update requires currentTargetPath only.");
    return readLocalSource(args.currentTargetPath);
  }
  if (typeof args.currentTargetUrl !== "string" || args.currentTargetPath !== undefined) throw new Error("cloudinary-stable-id-replacement requires currentTargetUrl only.");
  return readCloudinarySource(args.currentTargetUrl);
}

async function captureAttestation(args) {
  await assertCurrentSchemaDigest();
  if (!TARGET_KINDS.has(args.targetKind)) throw new Error("targetKind is unsupported.");
  const route = bounded(args.route, "route", 200);
  if (!/^\/work\/[a-z0-9-]+$/u.test(route)) throw new Error("route must be a canonical Work detail route.");
  const targetIdentifier = bounded(args.targetIdentifier, "targetIdentifier", 512);
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required to write immutable target evidence.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);

  const observed = await readObservedSource(args);
  const snapshotPath = await allowed(args.snapshotPath, true);
  const receiptPath = await allowed(args.receiptPath, true);
  if (snapshotPath === receiptPath) throw new Error("snapshotPath and receiptPath must be separate files.");

  const receipt = {
    contract: CONTRACT,
    schemaSha256: SCHEMA_SHA256,
    attestationState: "captured-read-only",
    targetKind: args.targetKind,
    targetIdentifier,
    route,
    observedSource: { kind: observed.kind, locator: observed.locator, sha256: observed.sha256, byteLength: observed.byteLength, contentType: observed.contentType },
    currentTargetSnapshot: { path: snapshotPath, sha256: observed.sha256, byteLength: observed.byteLength, immutableEvidence: true },
    currentTargetIdentityVerified: true,
    sourceReadOnly: true,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
  };
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeCreateOnlyBundle([{ path: snapshotPath, data: observed.bytes }, { path: receiptPath, data: payload, encoding: "utf8" }]);
  return Object.freeze({ ok: true, receiptPath, receiptSha256: sha256(Buffer.from(payload, "utf8")), snapshotPath, snapshotSha256: observed.sha256, snapshotByteLength: observed.byteLength, targetKind: args.targetKind, targetIdentifier, route, currentTargetIdentityVerified: true, sourceReadOnly: true, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

async function verifyAttestation(receiptPath) {
  await assertCurrentSchemaDigest();
  const resolvedReceipt = await allowed(receiptPath, false);
  const receiptBytes = await readFile(resolvedReceipt);
  if (!receiptBytes.length) throw new Error("Current-target attestation receipt is empty.");
  const value = JSON.parse(receiptBytes.toString("utf8"));
  if (value.contract !== CONTRACT || value.schemaSha256 !== SCHEMA_SHA256 || value.attestationState !== "captured-read-only" || !TARGET_KINDS.has(value.targetKind)) throw new Error("Current-target attestation receipt contract/schema/state is invalid.");
  if (value.currentTargetIdentityVerified !== true || value.sourceReadOnly !== true || value.publicationAllowed !== false || value.cloudOverwriteAllowed !== false || value.websiteMutationAllowed !== false) throw new Error("Current-target attestation receipt carries unsafe or unverified authority state.");
  const snapshot = value.currentTargetSnapshot;
  const snapshotPath = await allowed(snapshot?.path, false);
  const snapshotBytes = await readFile(snapshotPath);
  if (!snapshotBytes.length || snapshot.sha256 !== sha256(snapshotBytes) || snapshot.byteLength !== snapshotBytes.length || snapshot.immutableEvidence !== true) throw new Error("Current-target snapshot bytes changed after attestation.");
  if (value.observedSource?.sha256 !== snapshot.sha256 || value.observedSource?.byteLength !== snapshot.byteLength) throw new Error("Observed target identity no longer matches immutable snapshot evidence.");

  let current;
  if (value.observedSource?.kind === "local-file") current = await readLocalSource(value.observedSource.locator);
  else if (value.observedSource?.kind === "https-url") current = await readCloudinarySource(value.observedSource.locator);
  else throw new Error("Observed target source kind is invalid.");
  if (current.sha256 !== snapshot.sha256 || current.byteLength !== snapshot.byteLength) throw new Error("Live current target changed after snapshot attestation; capture fresh target evidence before planning publication.");

  return Object.freeze({ ok: true, receiptPath: resolvedReceipt, receiptSha256: sha256(receiptBytes), receiptByteLength: receiptBytes.length, schemaSha256: SCHEMA_SHA256, targetKind: value.targetKind, targetIdentifier: value.targetIdentifier, route: value.route, snapshotPath, snapshotSha256: snapshot.sha256, snapshotByteLength: snapshot.byteLength, liveTargetStillMatchesSnapshot: true, currentTargetIdentityVerified: true, sourceReadOnly: true, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false });
}

const tools = [
  { name: "evavo_work_header_current_target_attestation_capabilities", description: "Describe read-only capture and reverification of the actual current website source file or governed Cloudinary bytes before publication transaction planning.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "evavo_capture_work_header_current_target", description: "Read the actual current publication target, write its exact bytes plus a schema-bound receipt as one create-only evidence bundle, and grant no mutation authority.", inputSchema: { type: "object", properties: { targetKind: { enum: ["website-header-source-update", "cloudinary-stable-id-replacement"] }, targetIdentifier: { type: "string" }, route: { type: "string" }, currentTargetPath: { type: "string" }, currentTargetUrl: { type: "string" }, snapshotPath: { type: "string" }, receiptPath: { type: "string" }, confirmLocalWrite: { type: "boolean" } }, required: ["targetKind", "targetIdentifier", "route", "snapshotPath", "receiptPath", "confirmLocalWrite"], additionalProperties: false } },
  { name: "evavo_verify_work_header_current_target_attestation", description: "Re-read the immutable current-target snapshot and the live source/Cloudinary target; reject stale evidence before transaction planning.", inputSchema: { type: "object", properties: { receiptPath: { type: "string", minLength: 1 } }, required: ["receiptPath"], additionalProperties: false } },
];

function capabilities() { return Object.freeze({ contract: CONTRACT, serverVersion: SERVER_VERSION, schemaSha256: SCHEMA_SHA256, localWebsiteSourceReadOnlyCapture: true, governedCloudinaryReadOnlyCapture: true, liveTargetReverificationAvailable: true, atomicSnapshotAndReceiptWrite: true, createOnlyEvidenceWrite: true, currentTargetIdentityVerified: true, publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false, allowedRootCount: configuredLocalRootCount(ROOTS_ENV), writesEnabled: writesEnabled() }); }
async function callTool(name, args) {
  if (name === "evavo_work_header_current_target_attestation_capabilities") return capabilities();
  if (name === "evavo_capture_work_header_current_target") return captureAttestation(args ?? {});
  if (name === "evavo_verify_work_header_current_target_attestation") return verifyAttestation(args?.receiptPath);
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}
const response = (id, result) => ({ jsonrpc: "2.0", id, result });
const toolResult = (payload, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError });
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  try { const message = JSON.parse(line); let outgoing; if (message.method === "initialize") outgoing = response(message.id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } }); else if (message.method === "notifications/initialized") outgoing = null; else if (message.method === "tools/list") outgoing = response(message.id, { tools }); else if (message.method === "tools/call") { try { outgoing = response(message.id, toolResult(await callTool(message.params?.name, message.params?.arguments ?? {}))); } catch (error) { outgoing = response(message.id, toolResult({ ok: false, message: error instanceof Error ? error.message : String(error) }, true)); } } else outgoing = response(message.id, toolResult({ ok: false, message: `Unsupported method ${JSON.stringify(message.method)}.` }, true)); if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`); } catch (error) { process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: String(error) }, true)))}\n`); }
}
