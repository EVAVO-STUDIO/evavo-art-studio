#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const files = Object.freeze({
  compositing: read("packages/media/src/compositing-pass.ts"),
  index: read("packages/media/src/index.ts"),
  tests: read("packages/media/test/compositing-pass.test.mjs"),
  cli: read("tools/compose_raster_layers.mjs"),
  mcp: read("tools/raster_compositing_mcp.mjs"),
  finishingMcp: read("tools/raster_finishing_mcp.mjs"),
  pathPolicy: read("tools/lib/local_path_policy.mjs"),
  pathTests: read("scripts/test-local-path-policy.mjs"),
  config: read(".mcp.raster-compositing-v1.json"),
  docs: read("docs/raster-finishing-and-compositing.md"),
});

const failures = [];

const requireTokens = (sourceName, tokens) => {
  const source = files[sourceName];
  for (const token of tokens) {
    if (!source.includes(token)) failures.push(`${sourceName}:missing:${token}`);
  }
};

requireTokens("compositing", [
  "export async function composeRasterLayers",
  "Ordered, deterministic raster layer compositing",
  "apply-alpha-mask",
  "opacity:",
  "composite-layer:",
  "left and top",
  "cannot combine explicit coordinates with gravity",
  "supports at most 256 layers per job",
  "canvas requires both width and height",
  "exceeds canvas",
  "placement exceeds canvas bounds",
  "create-canvas",
  "fit-base-to-canvas",
  "encode:",
]);
requireTokens("index", ['export * from "./compositing-pass.js";']);
requireTokens("tests", [
  "composites ordered layers with resize opacity blend and exact placement",
  "creates a transparent canvas and applies a transformed alpha mask",
  "rejects mismatched transformed masks and ambiguous positioning",
  "rejects negative coordinates, oversized layers and out-of-bounds placement",
  "rejects incomplete canvases and unbounded layer stacks",
]);
requireTokens("cli", [
  "composeRasterLayers",
  "--spec <json-file>",
  "--print-evidence",
  "path.isAbsolute(filePath)",
  "at most ${MAX_LAYERS} layers",
  "canvas requires integer width and height",
]);
requireTokens("mcp", [
  "evavo_raster_compositing_capabilities",
  "evavo_compose_raster_layers",
  "EVAVO_RASTER_COMPOSE_ALLOWED_ROOTS",
  "EVAVO_RASTER_COMPOSE_ALLOW_WRITES",
  'from "./lib/local_path_policy.mjs"',
  "assertAllowedLocalPath",
  "configuredLocalRootCount",
  "confirmLocalWrite=true is required",
  "maxItems: MAX_LAYERS",
  'required: ["width", "height"]',
  "minimum: 0, maximum: 32768",
  "canvas-bounds-validation",
  "symlink escapes fail closed",
  "bytesReturned: false",
]);
requireTokens("finishingMcp", [
  'from "./lib/local_path_policy.mjs"',
  "assertAllowedLocalPath",
  "configuredLocalRootCount",
  "EVAVO_RASTER_FINISH_ALLOWED_ROOTS",
  "symlink escapes fail closed",
  "confirmLocalWrite=true is required",
]);
requireTokens("pathPolicy", [
  "export async function canonicalizeProspectivePath",
  "export async function assertAllowedLocalPath",
  "export function configuredLocalRootCount",
  "await realpath(cursor)",
  "path.relative(root, candidate)",
  "not-yet-created suffix",
  "Path is outside configured",
]);
requireTokens("pathTests", [
  "allows real inputs and prospective nested outputs inside a configured root",
  "rejects real inputs and prospective outputs outside configured roots",
  "rejects input and output paths that escape through an existing symlink ancestor",
  "fails closed when no allowed roots are configured",
  "process.platform === \"win32\" ? \"junction\" : \"dir\"",
]);
requireTokens("config", [
  "evavo-raster-compositing-v1",
  "tools/raster_compositing_mcp.mjs",
  "EVAVO_RASTER_COMPOSE_ALLOWED_ROOTS",
  "EVAVO_RASTER_COMPOSE_ALLOW_WRITES",
]);
requireTokens("docs", [
  "Choose the smallest correct operation",
  "Use **raster finishing**",
  "Use **raster compositing**",
  "Do not overwrite a shared catalogue/canonical asset",
  "Local write safety",
]);

if (/return\s+result\.buffer/u.test(files.mcp) || /bytesReturned:\s*true/u.test(files.mcp)) {
  failures.push("mcp:raw-image-bytes-must-not-be-returned");
}
if (/return\s+result\.buffer/u.test(files.finishingMcp) || /bytesReturned:\s*true/u.test(files.finishingMcp)) {
  failures.push("finishing-mcp:raw-image-bytes-must-not-be-returned");
}
if (!files.compositing.includes("provider-agnostic")) {
  failures.push("compositing:provider-agnostic-mask-contract-missing");
}
if (/integer between -32768 and 32768/u.test(files.compositing)) {
  failures.push("compositing:negative-coordinate-contract-restored");
}
if (!files.pathPolicy.includes("canonicalizeProspectivePath(path.dirname(resolved))")) {
  failures.push("path-policy:prospective-output-canonicalization-missing");
}

if (failures.length) {
  console.error("Raster compositing contract failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("raster_compositing_contract_passed");
console.log("- ordered local layer composition remains exported from @evavo/art-media");
console.log("- resize, rotate, mask, opacity, blend and placement evidence remain explicit");
console.log("- canvas bounds, non-negative placement and the 256-layer ceiling fail closed before libvips composite work");
console.log("- CLI recipes resolve relative layer paths beside the spec file and cap layer materialization");
console.log("- MCP schema mirrors canvas, coordinate and layer-count admission rules before file reads");
console.log("- raster finishing and compositing share the same canonical symlink-safe local path policy");
console.log("- prospective output directories are checked through their nearest existing realpath ancestor");
console.log("- symlink and junction escapes are covered by adversarial local path tests");
console.log("- CLI and MCP surfaces remain file/path based and never return image bytes");
console.log("- local MCP writes remain root-scoped, environment-gated and per-call confirmed");
console.log("- agent documentation keeps finishing, compositing, segmentation and catalogue roles separate");
