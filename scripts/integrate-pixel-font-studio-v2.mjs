#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relative) {
  return JSON.parse(await readFile(path.join(root, relative), "utf8"));
}

async function writeJson(relative, value) {
  await writeFile(path.join(root, relative), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function includeOnce(values, value) {
  if (!values.includes(value)) values.push(value);
}

const packageDocument = await readJson("package.json");
const scripts = packageDocument.scripts ?? {};
scripts["pixel-font:v2:catalog"] = "python tools/pixel_font_studio_v2.py catalog";
scripts["pixel-font:v2:audit"] = "python tools/pixel_font_studio_v2.py audit";
scripts["pixel-font:v2:build"] = "python tools/pixel_font_studio_v2.py build";
scripts["pixel-font:v2:validate"] = "python tools/pixel_font_studio_v2.py validate";
scripts["pixel-font:v2:compare"] = "python tools/pixel_font_studio_v2.py compare";
scripts["pixel-font:v2:mcp"] = "node scripts/pixel-font-studio-v2-mcp.mjs";
scripts["pixel-font:v2:chess-lord:audit"] = "python tools/pixel_font_studio_v2.py audit --family config/pixel-font-families/chess-lord-v2/chess-lord.family.json";
scripts["pixel-font:v2:check"] = "node scripts/check-pixel-font-studio-v2.mjs";
scripts["pixel-font:check"] = "node scripts/check-pixel-font-studio.mjs && node scripts/check-pixel-font-studio-v2.mjs";
packageDocument.scripts = scripts;
await writeJson("package.json", packageDocument);

const reliability = await readJson("evavo.reliability.json");
reliability.pixelFontStudioV2 = {
  contract: "evavo.pixel-font-studio.v2",
  toolVersion: "2.2.0",
  familyMasterSchema: "evavo.pixel-font-family-master.v2",
  faceMasterSchema: "evavo.pixel-font-face-master.v2",
  familyOutputSchema: "evavo.pixel-font-family.v2",
  canonicalRuntime: [
    "AngelCode BMFont text .fnt",
    "binary RGBA PNG atlas"
  ],
  interchangeAndAuthoringOutputs: [
    "BDF 2.1 bitmap font",
    "engine-neutral atlas JSON",
    "fixed-cell transparent grid PNG and JSON",
    "deterministic TrueType convenience derivative",
    "Godot FontVariation .tres",
    "native and integer-scaled specimen PNGs"
  ],
  authoredMasters: {
    independentPerFace: true,
    variableGlyphDimensions: true,
    perGlyphOffsetsAndAdvances: true,
    perFaceKerning: true,
    unicodeCoverage: true,
    deterministicGzipTransportSupported: true,
    externalFontBinaryUsed: false
  },
  deterministic: true,
  createOnly: true,
  mcpDefaultMode: "read-only",
  writeEnvironmentGateRequired: true,
  writePerCallConfirmationRequired: true,
  allowedRootBoundaryRequired: true,
  godotPolicy: {
    targetVersion: "4.6.2",
    officialLinuxArchiveSha256: "30e6b6d141f0cd5bebd629ad1d0ef1324e60091bb20662d026b402ba58c59937",
    textureFilter: "nearest",
    integerScaleOnly: true,
    subpixelPositioning: false,
    mipmaps: false,
    systemFallback: false,
    nativeImportAndRenderVerificationRequired: true
  },
  qa: {
    printableAsciiRequired: true,
    westernLatinRequired: true,
    confusableSequencesRequired: true,
    exhaustiveOrderedPairCollisionChecks: true,
    duplicateGlyphAllowlistRequired: true,
    exactRebuildComparisonRequired: true,
    ttfCmapAndKerningValidationRequired: true,
    bdfCoverageAndAdvanceValidationRequired: true,
    atlasAndGridMetadataValidationRequired: true
  },
  authority: {
    providerExecution: false,
    creativeApproval: false,
    historicalApproval: false,
    candidatePromotion: false,
    sourceDeletion: false,
    targetRepositoryMutation: false,
    gitCommit: false,
    gitPush: false,
    publication: false,
    forcePush: false
  }
};
reliability.validation ??= [];
includeOnce(reliability.validation, "python -m pip install --disable-pip-version-check -r requirements/pixel-font-studio-v2.txt");
includeOnce(reliability.validation, "node scripts/check-pixel-font-studio-v2.mjs");
reliability.capabilityBoundary ??= {};
reliability.capabilityBoundary.validationMay ??= [];
for (const capability of [
  "build independently authored proportional pixel-font families",
  "emit deterministic BMFont, BDF, atlas JSON, grid sheets and TrueType convenience derivatives",
  "run exact Godot 4.6.2 bitmap-font import and render verification"
]) includeOnce(reliability.capabilityBoundary.validationMay, capability);
reliability.notes ??= [];
includeOnce(reliability.notes, "Pixel Font Studio v2.2 retains independent per-face masters and emits canonical BMFont/PNG runtime assets plus BDF, atlas JSON, fixed-cell grids and optional deterministic TTF derivatives.");
includeOnce(reliability.notes, "Pixel Font Studio v2.2 native CI downloads the official Godot 4.6.2 Linux archive only after verifying its exact SHA-256.");
await writeJson("evavo.reliability.json", reliability);

console.log("Pixel Font Studio v2.2 package and reliability integration complete.");
