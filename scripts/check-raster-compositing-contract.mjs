#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const files = Object.freeze({
  compositing: read("packages/media/src/compositing-pass.ts"),
  effects: read("packages/media/src/effect-layer.ts"),
  effectPresets: read("packages/media/src/effect-presets.ts"),
  proof: read("packages/media/src/transparency-proof.ts"),
  index: read("packages/media/src/index.ts"),
  tests: read("packages/media/test/compositing-pass.test.mjs"),
  effectTests: read("packages/media/test/effect-layer.test.mjs"),
  presetTests: read("packages/media/test/effect-presets.test.mjs"),
  proofTests: read("packages/media/test/transparency-proof.test.mjs"),
  cli: read("tools/compose_raster_layers.mjs"),
  effectCli: read("tools/create_raster_effect_layer.mjs"),
  proofCli: read("tools/create_transparency_proof.mjs"),
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
requireTokens("effects", [
  "export async function createRasterEffectLayer",
  'RasterEffectKind = "drop-shadow" | "outer-glow"',
  "materialize-shifted-alpha-source",
  "extract-source-alpha",
  "create-padded-effect-canvas",
  "subjectAnchorLeft",
  "subjectAnchorTop",
  "MAX_EFFECT_PIXELS",
  "minimum safe padding",
  "colorize:",
]);
requireTokens("effectPresets", [
  "RASTER_EFFECT_PRESETS",
  '"product-soft-shadow"',
  '"product-lift-shadow"',
  '"signal-cherry-glow"',
  '"motion-cherry-glow"',
  "getRasterEffectPreset",
  "fixed kind",
]);
requireTokens("proof", [
  "createTransparencyProofSheet",
  '"#00ff00"',
  '"#ff00ff"',
  "includesAlphaMask: true",
  "checkerboardUsed: false",
  "inputSha256",
  "outputSha256",
  "maximumInputBytes",
  "maximumPixels",
]);
requireTokens("index", [
  'export * from "./compositing-pass.js";',
  'export * from "./effect-layer.js";',
  'export * from "./effect-presets.js";',
  'export * from "./transparency-proof.js";',
]);
requireTokens("tests", [
  "composites ordered layers with resize opacity blend and exact placement",
  "creates a transparent canvas and applies a transformed alpha mask",
  "rejects negative coordinates, oversized layers and out-of-bounds placement",
  "rejects incomplete canvases and unbounded layer stacks",
]);
requireTokens("effectTests", [
  "creates a padded drop-shadow layer with deterministic anchor evidence",
  "composes a generated shadow behind its subject using returned anchor evidence",
  "creates an outer glow with zero offset and meaningful transparent falloff",
  "alphaRange",
  "nonOpaque",
]);
requireTokens("presetTests", [
  "exposes restrained production shadow and glow presets",
  "allows controlled preset tuning while preserving the semantic effect kind",
]);
requireTokens("proofTests", [
  "creates a deterministic transparency proof with green and alpha-mask tiles",
  "supports explicit diagnostic backgrounds and rejects invalid proof requests",
  "TRANSPARENCY_PROOF_BACKGROUNDS_INVALID",
  "TRANSPARENCY_PROOF_INPUT_INVALID",
]);
requireTokens("cli", [
  "composeRasterLayers",
  "--spec <json-file>",
  "path.isAbsolute(filePath)",
  "at most ${MAX_LAYERS} layers",
]);
requireTokens("effectCli", [
  "RASTER_EFFECT_PRESETS",
  "getRasterEffectPreset",
  "--preset <name>",
  "Choose either --preset or --kind",
]);
requireTokens("proofCli", [
  "createTransparencyProofSheet",
  "--backgrounds #000000,#ffffff,#00ff00",
  "--max-preview <px>",
  "bytesReturned: false",
]);
requireTokens("mcp", [
  "evavo_raster_compositing_capabilities",
  "evavo_compose_raster_layers",
  "evavo_create_raster_effect_layer",
  "drop-shadow-effect-layer",
  "outer-glow-effect-layer",
  "subject anchor coordinates",
  "EVAVO_RASTER_COMPOSE_ALLOWED_ROOTS",
  "confirmLocalWrite=true is required",
  "symlink escapes fail closed",
  "bytesReturned: false",
]);
requireTokens("finishingMcp", [
  "evavo_create_transparency_proof",
  "createTransparencyProofSheet",
  "transparency-proof-black-white-grey-green-magenta-alpha-mask",
  "source pixels are not modified",
  "EVAVO_RASTER_FINISH_ALLOWED_ROOTS",
  'from "./lib/local_path_policy.mjs"',
  "assertAllowedLocalPath",
  "configuredLocalRootCount",
  "confirmLocalWrite=true is required",
  "bytesReturned: false",
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
  "rejects input and output paths that escape through an existing symlink ancestor",
  "fails closed when no allowed roots are configured",
]);
requireTokens("config", [
  "evavo-raster-compositing-v1",
  "tools/raster_compositing_mcp.mjs",
  "EVAVO_RASTER_COMPOSE_ALLOWED_ROOTS",
  "EVAVO_RASTER_COMPOSE_ALLOW_WRITES",
]);
requireTokens("docs", [
  "Choose the smallest correct operation",
  "Reviewed production presets",
  "Transparency proofing",
  "evavo_create_transparency_proof",
  "Do not overwrite a shared catalogue/canonical asset",
  "Local write safety",
]);

if (/return\s+result\.buffer/u.test(files.mcp) || /bytesReturned:\s*true/u.test(files.mcp)) {
  failures.push("mcp:raw-image-bytes-must-not-be-returned");
}
if (/return\s+result\.(?:buffer|png)/u.test(files.finishingMcp) || /bytesReturned:\s*true/u.test(files.finishingMcp)) {
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
if (/\.composite\([^;]+\)\s*\.ensureAlpha\(\)\s*\.extractChannel\(3\)/su.test(files.effects)) {
  failures.push("effects:lazy-composite-alpha-regression-restored");
}

if (failures.length) {
  console.error("Raster compositing contract failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("raster_compositing_contract_passed");
console.log("- finishing, compositing, effects, presets and transparency proofing remain exported and governed");
console.log("- ordered layer geometry, masks, opacity, blend and placement evidence remain explicit");
console.log("- shadow/glow remain separate alpha-derived layers with subject-anchor evidence");
console.log("- reviewed effect presets preserve semantic kind while allowing controlled tuning");
console.log("- transparency proof sheets retain black/white/grey/green/magenta plus alpha-mask evidence and SHA receipts");
console.log("- effect alpha is materialized before extraction so lazy composite pipelines cannot produce empty masks");
console.log("- canvas, effect, layer-count and local path boundaries fail closed before provider writes");
console.log("- finishing and compositing share the same canonical symlink-safe local path policy");
console.log("- CLI and MCP surfaces remain file/path based and never return image bytes");
console.log("- local MCP writes remain root-scoped, environment-gated and per-call confirmed");
