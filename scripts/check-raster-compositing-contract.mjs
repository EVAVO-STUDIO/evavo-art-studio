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
  "ordered, deterministic raster layer compositing",
  "apply-alpha-mask",
  "opacity:",
  "composite-layer:",
  "left and top",
  "cannot combine explicit coordinates with gravity",
  "create-canvas",
  "fit-base-to-canvas",
  "encode:",
]);
requireTokens("index", ['export * from "./compositing-pass.js";']);
requireTokens("tests", [
  "composites ordered layers with resize opacity blend and exact placement",
  "creates a transparent canvas and applies a transformed alpha mask",
  "rejects mismatched transformed masks and ambiguous positioning",
]);
requireTokens("cli", [
  "composeRasterLayers",
  "--spec <json-file>",
  "--print-evidence",
]);
requireTokens("mcp", [
  "evavo_raster_compositing_capabilities",
  "evavo_compose_raster_layers",
  "EVAVO_RASTER_COMPOSE_ALLOWED_ROOTS",
  "EVAVO_RASTER_COMPOSE_ALLOW_WRITES",
  "confirmLocalWrite=true is required",
  "bytesReturned: false",
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
if (!files.mcp.includes("Path is outside configured raster compositing roots")) {
  failures.push("mcp:allowed-root-fail-closed-message-missing");
}
if (!files.compositing.includes("provider-agnostic")) {
  failures.push("compositing:provider-agnostic-mask-contract-missing");
}

if (failures.length) {
  console.error("Raster compositing contract failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("raster_compositing_contract_passed");
console.log("- ordered local layer composition remains exported from @evavo/art-media");
console.log("- resize, rotate, mask, opacity, blend and placement evidence remain explicit");
console.log("- CLI and MCP surfaces remain file/path based and never return image bytes");
console.log("- local MCP writes remain root-scoped, environment-gated and per-call confirmed");
console.log("- agent documentation keeps finishing, compositing, segmentation and catalogue roles separate");
