#!/usr/bin/env node

import assert from "node:assert/strict";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "scripts/pixel-font/common.mjs",
  "scripts/pixel-font/contracts.mjs",
  "scripts/pixel-font/io.mjs",
  "scripts/pixel-font/png.mjs",
  "scripts/pixel-font/glyph-punctuation.mjs",
  "scripts/pixel-font/glyph-digits.mjs",
  "scripts/pixel-font/glyph-upper.mjs",
  "scripts/pixel-font/glyph-lower.mjs",
  "scripts/pixel-font/glyph-extended.mjs",
  "scripts/pixel-font/glyph-private.mjs",
  "scripts/pixel-font/glyph-library.mjs",
  "scripts/pixel-font/font-presets.mjs",
  "scripts/pixel-font/font-face.mjs",
  "scripts/pixel-font/font-config.mjs",
  "scripts/pixel-font/font-plan.mjs",
  "scripts/pixel-font/font-render.mjs",
  "scripts/pixel-font/font-output.mjs",
  "scripts/pixel-font/font-qa.mjs",
  "scripts/pixel-font/font-build.mjs",
  "scripts/pixel-font/font-validate.mjs",
  "scripts/pixel-font/builder.mjs",
  "scripts/pixel-font-studio.mjs",
  "scripts/pixel-font-studio-mcp.mjs",
  "scripts/build-brass-brine-pixel-font-family.mjs",
  "scripts/pixel-font-studio.test.mjs",
  "scripts/pixel-font-brass-brine.test.mjs",
  "config/pixel-font-studio.v1.json",
  "config/pixel-font-family.example.v1.json",
  "config/pixel-font-family.brass-brine.v1.json",
  "docs/PIXEL_FONT_STUDIO.md",
  "docs/BRASS_BRINE_PIXEL_FONT_FAMILY.md",
  "config/mcp.pixel-font-studio.windows.example.json",
  ".github/workflows/pixel-font-studio.yml",
  "evavo.reliability.json",
  "package.json",
];
const source = {};
for (const relative of files) {
  const target = path.join(root, relative);
  const state = await lstat(target);
  assert.equal(state.isFile(), true, `${relative} must be a file`);
  assert.equal(state.isSymbolicLink(), false, `${relative} must not be a symlink`);
  assert.ok(state.size > 0 && state.size < 1_000_000, `${relative} has invalid size`);
  source[relative] = await readFile(target, "utf8");
  if (relative.endsWith(".mjs")) {
    const syntax = spawnSync(process.execPath, ["--check", target], {
      cwd: root,
      encoding: "utf8",
      shell: false,
    });
    assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);
  }
}
const combined = Object.values(source).join("\n");
for (const token of [
  "evavo.pixel-font-family-request.v1",
  "evavo.pixel-font-family-plan.v1",
  "evavo.pixel-font-family.v1",
  "evavo.pixel-font-validation.v1",
  "evavo.pixel-font-build-receipt.v1",
  "AngelCode BMFont .fnt",
  "Godot FontVariation .tres",
  "externalFontBinaryUsed: false",
  "includeSpecimens",
  "includeDetailedGlyphRecords",
  "strictPngVerificationRequired",
  "confirmWrite",
  "EVAVO_PIXEL_FONT_ALLOWED_ROOTS",
  "brass-brine-dos",
  "bb_dos_display",
  "bb_dos_ui",
  "bb_dos_ledger",
  "bb_dos_micro",
  "bb_dos_symbols",
  "escapes the family root",
  "role-map-role:",
  "fnt-header:",
]) {
  assert.equal(combined.includes(token), true, `missing ${token}`);
}
for (const forbidden of [
  "fontforge",
  "opentype.js",
  "freetype",
  "ttf2",
  "Invoke-WebRequest",
  "https://raw.githubusercontent.com",
  "shell: true",
  "git push",
  "git commit",
  "forcePush: true",
]) {
  assert.equal(
    combined.toLowerCase().includes(forbidden.toLowerCase()),
    false,
    `forbidden ${forbidden}`,
  );
}
const contract = JSON.parse(source["config/pixel-font-studio.v1.json"]);
assert.equal(contract.contract, "evavo.pixel-font-studio.v1");
assert.equal(
  Object.values(contract.requirements).every((value) => value === true),
  true,
);
assert.equal(
  Object.values(contract.authority).every((value) => value === false),
  true,
);
const brass = JSON.parse(
  source["config/pixel-font-family.brass-brine.v1.json"],
);
assert.equal(brass.familyId, "brass-brine-dos");
assert.deepEqual(
  brass.faces.map((face) => face.role),
  ["display", "ui", "ledger", "micro", "symbols"],
);
assert.equal(brass.godot.minimumVersion, "4.6.2");
assert.equal(brass.godot.targetVersion, "4.6.2");
assert.equal(brass.godot.textureFilter, "nearest");
assert.equal(brass.godot.integerScaleOnly, true);
assert.equal(brass.godot.subpixelPositioning, false);
assert.equal(brass.godot.mipmaps, false);
const packageDocument = JSON.parse(source["package.json"]);
for (const name of [
  "pixel-font:catalog",
  "pixel-font:plan",
  "pixel-font:build",
  "pixel-font:validate",
  "pixel-font:mcp",
  "pixel-font:brass:build",
  "pixel-font:brass:test",
  "pixel-font:check",
]) {
  assert.ok(packageDocument.scripts?.[name], `package missing ${name}`);
}
assert.match(packageDocument.scripts.check, /pixel-font:check/u);
const tests = spawnSync(
  process.execPath,
  [
    "--test",
    path.join(root, "scripts/pixel-font-studio.test.mjs"),
    path.join(root, "scripts/pixel-font-brass-brine.test.mjs"),
  ],
  {
    cwd: root,
    encoding: "utf8",
    shell: false,
    timeout: 180_000,
    maxBuffer: 32 * 1024 * 1024,
  },
);
assert.equal(tests.status, 0, tests.stderr || tests.stdout);
console.log("EVAVO Pixel Font Studio governance passed.");
console.log("- original deterministic glyph primitives, atlases, BMFont metadata and specimens verified");
console.log("- Brass & Brine display, UI, ledger, micro and symbol production family verified");
console.log("- generated paths, role maps, BMFont headers and Godot resource links fail closed when rehashed or redirected");
console.log("- compact runtime delivery retains exact BMFont coverage while omitting review-only evidence");
console.log("- Godot nearest/integer-scale role-map policy remains mandatory");
console.log("- MCP writes remain allow-root, environment and per-call gated");
console.log("- provider, target-repository, Git, publication and force-push authority remain false");
