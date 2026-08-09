#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  compiler: "tools/pixel_font_studio.py",
  common: "tools/pixel_font_studio_common.py",
  raster: "tools/pixel_font_studio_raster.py",
  spec: "tools/pixel_font_studio_spec.py",
  pipeline: "tools/pixel_font_studio_pipeline.py",
  compilerTest: "tools/test_pixel_font_studio.py",
  mcp: "tools/pixel-font-mcp.mjs",
  mcpTest: "tools/test-pixel-font-mcp.mjs",
  schema: "config/pixel-font-family.v1.schema.json",
  glyphMaster: "config/pixel-font-master-5x7.v1.json",
  mcpConfig: "config/pixel-font-mcp.windows.example.json",
  example: "examples/brass-brine-pixel-font-family.v1.json",
  docs: "docs/pixel-font-studio.md",
};
for (const relative of Object.values(files)) {
  const target = path.join(root, relative);
  assert.equal(existsSync(target), true, `missing ${relative}`);
  const state = lstatSync(target);
  assert.equal(state.isFile() && !state.isSymbolicLink(), true, `${relative} must be a regular file`);
  assert.ok(state.size > 0 && state.size < 2_000_000, `${relative} is empty or unbounded`);
}
const compiler = [files.compiler, files.common, files.raster, files.spec, files.pipeline].map((relative) => readFileSync(path.join(root, relative), "utf8")).join("\n");
const mcp = readFileSync(path.join(root, files.mcp), "utf8");
const docs = readFileSync(path.join(root, files.docs), "utf8");
const spec = JSON.parse(readFileSync(path.join(root, files.example), "utf8"));
const schema = JSON.parse(readFileSync(path.join(root, files.schema), "utf8"));
const glyphMaster = JSON.parse(readFileSync(path.join(root, files.glyphMaster), "utf8"));
const mcpConfig = JSON.parse(readFileSync(path.join(root, files.mcpConfig), "utf8"));
assert.equal(schema.$id.includes("pixel-font-family.v1"), true);
assert.equal(glyphMaster.schema, "evavo.pixel-font-master.v1");
assert.ok(Object.keys(glyphMaster.glyphs).length >= 95);
assert.deepEqual(spec.fonts.map((font) => font.role), ["display", "ui", "ledger", "micro", "symbols"]);
assert.equal(spec.godot.textureFilter, "nearest");
assert.equal(spec.godot.testedVersion, "4.6.2");
assert.match(spec.glyphMasterSha256, /^[0-9a-f]{64}$/u);
const server = mcpConfig.mcpServers?.["evavo-pixel-font-studio"];
assert.ok(server); assert.equal(server.env.EVAVO_PIXEL_FONT_ALLOW_WRITES, "true");
for (const token of ["evavo.pixel-font-family-manifest.v1", "glyphMasterSha256", "evavo.pixel-font-family-qa.v1", "MASTER_5X7", "encode_png", "verify_family", "--replace-generated"]) assert.equal(compiler.includes(token), true, `compiler missing ${token}`);
for (const token of ["evavo_pixel_font_validate_spec", "evavo_pixel_font_compile", "evavo_pixel_font_verify", "evavo_pixel_font_provider_brief", "EVAVO_PIXEL_FONT_ALLOW_WRITES", "confirmWrite", "shell:false"]) assert.equal(mcp.replaceAll(" ", "").includes(token.replaceAll(" ", "")), true, `MCP missing ${token}`);
for (const forbidden of ["shell: true", "git push", "git commit", "submit_art_runtime_jobs", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"]) assert.equal(mcp.includes(forbidden), false, `MCP contains forbidden ${forbidden}`);
assert.equal(docs.includes("Godot Theme"), true); assert.equal(docs.includes("reference-only"), true);
const run = (label, command, args) => { const result = spawnSync(command, args, { cwd: root, encoding: "utf8", shell: false, windowsHide: true, timeout: 180_000, maxBuffer: 32 * 1024 * 1024 }); assert.equal(result.status, 0, `${label} failed:\n${result.stdout}\n${result.stderr}`); };
const python = process.platform === "win32" ? "py" : "python3"; const prefix = process.platform === "win32" ? ["-3"] : [];
for (const relative of [files.compiler, files.common, files.raster, files.spec, files.pipeline]) run(`syntax ${relative}`, python, [...prefix, "-m", "py_compile", relative]);
run("MCP syntax", process.execPath, ["--check", files.mcp]);
run("compiler tests", python, [...prefix, files.compilerTest, "-v"]);
run("MCP tests", process.execPath, ["--test", files.mcpTest]);
const temporary = mkdtempSync(path.join(os.tmpdir(), "evavo-pixel-font-check-"));
try {
  const output = path.join(temporary, "family");
  run("reference compile", python, [...prefix, files.compiler, "compile", "--spec", files.example, "--output-dir", output]);
  run("reference verify", python, [...prefix, files.compiler, "verify", "--manifest", path.join(output, "pixel-font-family.manifest.json")]);
} finally { rmSync(temporary, { recursive: true, force: true }); }
console.log("EVAVO Pixel Font Studio governance passed.");
console.log("- original deterministic glyph masters compile reproducibly");
console.log("- BMFont, PNG, Godot theme and manifest evidence verify");
console.log("- MCP writes are gated and arbitrary execution is absent");
