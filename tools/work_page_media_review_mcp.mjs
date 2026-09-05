#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import { createWorkPageMediaReviewBundle } from "../packages/media/dist/index.js";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-work-page-media-review";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOWED_ROOTS";
const ALLOW_WRITES_ENV = "EVAVO_WORK_HEADER_REVIEW_ALLOW_WRITES";

const assertAllowed = (filePath, { output = false } = {}) =>
  assertAllowedLocalPath(filePath, { envName: ALLOWED_ROOTS_ENV, output, label: "work page media review" });

function assertWrite(args) {
  if (process.env[ALLOW_WRITES_ENV] !== "true") throw new Error(`Work-page media review writes are disabled. Set ${ALLOW_WRITES_ENV}=true.`);
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required for proof/receipt output.");
}

async function optionalImage(args, key) {
  if (typeof args[key] !== "string") return undefined;
  return readFile(await assertAllowed(args[key]));
}

async function review(args) {
  assertWrite(args);
  for (const key of ["headerPath", "proofPath", "receiptPath"]) {
    if (typeof args[key] !== "string") throw new Error(`${key} is required.`);
  }
  const headerPath = await assertAllowed(args.headerPath);
  const proofPath = await assertAllowed(args.proofPath, { output: true });
  const receiptPath = await assertAllowed(args.receiptPath, { output: true });
  const inputs = [headerPath, args.supportPath, args.tilePath, args.desktopScreenshotPath, args.mobileScreenshotPath]
    .filter((value) => typeof value === "string")
    .map((value) => path.resolve(value));
  const outputs = [path.resolve(proofPath), path.resolve(receiptPath)];
  if (new Set([...inputs, ...outputs]).size !== inputs.length + outputs.length) {
    throw new Error("Work-page media review inputs and outputs must use distinct paths.");
  }

  const result = await createWorkPageMediaReviewBundle({
    pageSlug: typeof args.pageSlug === "string" ? args.pageSlug : undefined,
    header: await readFile(headerPath),
    support: await optionalImage(args, "supportPath"),
    tile: await optionalImage(args, "tilePath"),
    desktopScreenshot: await optionalImage(args, "desktopScreenshotPath"),
    mobileScreenshot: await optionalImage(args, "mobileScreenshotPath"),
    nearDuplicateThreshold: typeof args.nearDuplicateThreshold === "number" ? args.nearDuplicateThreshold : undefined,
  });

  const receipt = Object.freeze({
    schemaVersion: "1.0",
    operation: "evavo-work-page-media-context-review",
    pageSlug: typeof args.pageSlug === "string" ? args.pageSlug : null,
    approvalState: "unapproved",
    headerPath,
    supportPath: typeof args.supportPath === "string" ? args.supportPath : null,
    tilePath: typeof args.tilePath === "string" ? args.tilePath : null,
    desktopScreenshotPath: typeof args.desktopScreenshotPath === "string" ? args.desktopScreenshotPath : null,
    mobileScreenshotPath: typeof args.mobileScreenshotPath === "string" ? args.mobileScreenshotPath : null,
    evidence: result.evidence,
    visualReviewRequired: true,
    reviewChecklist: [
      "Open the combined proof and judge the actual desktop/mobile page screenshots, not just the isolated header source.",
      "Reject weak focal hierarchy, poor title/image balance, irrelevant subject matter, generic filler and obviously AI-looking detail.",
      "Reject a technically sharp image if it still appears soft at delivery size or is badly cropped on either viewport.",
      "Compare header, support and tile imagery for repetition; support imagery should normally add a different visual story.",
      "Check visible UI, logos, products, people and typography for damage or implausible detail.",
      "Do not publish or overwrite Cloudinary from this review alone.",
    ],
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
  });

  for (const output of [proofPath, receiptPath]) await mkdir(path.dirname(output), { recursive: true });
  await writeFile(proofPath, result.proofPng, { flag: "wx" });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  return Object.freeze({
    ok: true,
    proofPath,
    receiptPath,
    evidence: result.evidence,
    approvalState: "unapproved",
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    bytesReturned: false,
  });
}

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_work_page_media_review_capabilities",
    description: "Describe page-context review for EVAVO Work-page header, support and tile imagery.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_review_work_page_media_context",
    description: "Build one combined proof for a Work page: desktop/laptop/mobile hero crops, support image, tile image and optional actual desktop/mobile browser screenshots. Detects technical hero failures and duplicate/near-duplicate storytelling, but always requires visual page review before publication.",
    inputSchema: {
      type: "object",
      properties: {
        pageSlug: { type: "string" },
        headerPath: { type: "string", minLength: 1 },
        supportPath: { type: "string", minLength: 1 },
        tilePath: { type: "string", minLength: 1 },
        desktopScreenshotPath: { type: "string", minLength: 1 },
        mobileScreenshotPath: { type: "string", minLength: 1 },
        proofPath: { type: "string", minLength: 1 },
        receiptPath: { type: "string", minLength: 1 },
        nearDuplicateThreshold: { type: "number", minimum: 0, maximum: 1 },
        confirmLocalWrite: { type: "boolean", const: true }
      },
      required: ["headerPath", "proofPath", "receiptPath", "confirmLocalWrite"],
      additionalProperties: false
    }
  })
]);

function capabilities() {
  return Object.freeze({
    contract: "evavo_work_page_media_context_review_v1",
    allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
    media: ["header", "support", "tile", "desktop-page-screenshot", "mobile-page-screenshot"],
    checks: ["header-quality", "viewport-crops", "support-quality", "tile-quality", "hero-support-similarity", "hero-tile-similarity"],
    actualBrowserScreenshotsSupported: true,
    visualPageReviewRequired: true,
    publicationAllowed: false,
    cloudOverwriteAllowed: false
  });
}

async function callTool(name, args) {
  if (name === "evavo_work_page_media_review_capabilities") return capabilities();
  if (name === "evavo_review_work_page_media_context") return review(args ?? {});
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}

function response(id, result) { return { jsonrpc: "2.0", id, result }; }
function toolResult(payload, isError = false) { return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError }; }

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
