#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SERVER_NAME, SERVER_VERSION, TOOLS, callTool, handleRequest, policy, toolDefinitions } from "./pixel-typography-review-mcp.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(path.join(os.tmpdir(), "evavo-pixel-review-mcp-"));
try {
  const python = process.platform === "win32" ? "python" : "python3";
  const readOnly = policy({ EVAVO_PIXEL_TYPOGRAPHY_REVIEW_MODE: "read-only", EVAVO_PIXEL_TYPOGRAPHY_REVIEW_ALLOWED_ROOTS: `${root};${temporary}`, EVAVO_PIXEL_TYPOGRAPHY_REVIEW_PYTHON: python });
  assert.equal(SERVER_NAME, "evavo-pixel-typography-review");
  assert.equal(SERVER_VERSION, "1.1.0");
  const readOnlyNames = toolDefinitions(readOnly).map((item) => item.name);
  assert.deepEqual(readOnlyNames, [TOOLS.catalog, TOOLS.validateProfile, TOOLS.profileExample, TOOLS.validateOutput, TOOLS.compare]);
  assert.equal(readOnlyNames.includes(TOOLS.build), false);
  const initialized = await handleRequest({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, { policy: readOnly });
  assert.equal(initialized.result.serverInfo.version, "1.1.0");
  const catalog = await callTool(TOOLS.catalog, {}, { policy: readOnly });
  assert.equal(catalog.engineVersion, "1.1.0");
  assert.equal(catalog.displayAspectCorrection, true);
  assert.equal(catalog.pixelAspectEvidence, true);
  assert.ok(catalog.profilePresets.includes("vga-dos-320x200"));
  assert.ok(catalog.usageRoles.includes("hud-label"));
  assert.equal(catalog.policy.creativeApproval, false);
  const example = await callTool(TOOLS.profileExample, { preset: "vga-dos-320x200" }, { policy: readOnly });
  assert.deepEqual(example.nativeResolution, { width: 320, height: 200 });
  assert.deepEqual(example.displayPreview, { width: 320, height: 240, integerScales: [2, 3] });
  await assert.rejects(callTool(TOOLS.validateProfile, { profilePath: path.resolve(root, "..", "outside.json") }, { policy: readOnly }), /outside EVAVO_PIXEL_TYPOGRAPHY_REVIEW_ALLOWED_ROOTS|ENOENT/u);
  const symlinkPath = path.join(temporary, "profile-link.json");
  await symlink(path.join(root, "examples", "pixel-typography-review", "vga-dos-320x200.review.json"), symlinkPath);
  await assert.rejects(callTool(TOOLS.validateProfile, { profilePath: symlinkPath }, { policy: readOnly }), /must not be a symlink/u);

  const write = policy({ EVAVO_PIXEL_TYPOGRAPHY_REVIEW_MODE: "read-write", EVAVO_PIXEL_TYPOGRAPHY_REVIEW_ALLOW_WRITES: "true", EVAVO_PIXEL_TYPOGRAPHY_REVIEW_ALLOWED_ROOTS: `${root};${temporary}`, EVAVO_PIXEL_TYPOGRAPHY_REVIEW_PYTHON: python });
  assert.ok(toolDefinitions(write).some((item) => item.name === TOOLS.build));
  await assert.rejects(callTool(TOOLS.build, { fontPath: path.join(temporary, "missing.fnt"), stylePath: path.join(temporary, "missing.style.json"), profilePath: path.join(temporary, "missing.review.json"), outputRoot: path.join(temporary, "output") }, { policy: write }), /confirmWrite=true/u);

  const source = await readFile(path.join(root, "scripts", "pixel-typography-review-mcp.mjs"), "utf8");
  for (const prohibited of ["shell: true", "git push", "force-push", "creativeApproval: true", "targetRepositoryMutation: true"]) assert.equal(source.includes(prohibited), false, `MCP contains prohibited authority: ${prohibited}`);
  console.log("EVAVO_PIXEL_TYPOGRAPHY_REVIEW_MCP_CHECK_OK");
  console.log(JSON.stringify({ readOnlyToolCount: readOnlyNames.length, writeToolCount: toolDefinitions(write).length }, null, 2));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
