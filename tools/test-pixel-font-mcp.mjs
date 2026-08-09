import assert from "node:assert/strict";
import { copyFile, mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { COMPILE_TOOL, PROVIDER_BRIEF_TOOL, VALIDATE_TOOL, VERIFY_TOOL, callPixelFontTool, pixelFontPolicy, pixelFontTools } from "./pixel-font-mcp.mjs";

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const example = path.resolve(toolsDir, "..", "examples", "brass-brine-pixel-font-family.v1.json");

test("read-only mode exposes validation and verification only", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-font-mcp-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const policy = pixelFontPolicy({ EVAVO_PIXEL_FONT_ALLOWED_ROOTS: root });
  assert.deepEqual(pixelFontTools(policy).map((tool) => tool.name), [VALIDATE_TOOL, VERIFY_TOOL]);
});

test("write mode requires both gates and exposes bounded writes", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-font-mcp-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.throws(() => pixelFontPolicy({ EVAVO_PIXEL_FONT_ALLOWED_ROOTS: root, EVAVO_PIXEL_FONT_MCP_MODE: "read-write" }), /ALLOW_WRITES/iu);
  const policy = pixelFontPolicy({ EVAVO_PIXEL_FONT_ALLOWED_ROOTS: root, EVAVO_PIXEL_FONT_MCP_MODE: "read-write", EVAVO_PIXEL_FONT_ALLOW_WRITES: "true" });
  assert.equal(pixelFontTools(policy).some((tool) => tool.name === COMPILE_TOOL), true);
  assert.equal(pixelFontTools(policy).some((tool) => tool.name === PROVIDER_BRIEF_TOOL), true);
});

test("real compiler validation is callable without writes", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-font-mcp-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const specDir = path.join(root, "specs"); await mkdir(specDir);
  const copied = path.join(specDir, "family.json"); await copyFile(example, copied);
  const policy = pixelFontPolicy({ EVAVO_PIXEL_FONT_ALLOWED_ROOTS: root, EVAVO_PIXEL_FONT_PYTHON: process.platform === "win32" ? "py" : "python3" });
  const result = await callPixelFontTool(VALIDATE_TOOL, { specPath: copied }, { policy });
  assert.equal(result.status, "passed");
  assert.equal(result.normalizedSpec.familyId, "brass-brine-dos");
});
