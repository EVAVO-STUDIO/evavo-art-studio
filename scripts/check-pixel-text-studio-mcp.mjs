#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  SERVER_NAME,
  SERVER_VERSION,
  TOOLS,
  callTool,
  handleRequest,
  policy,
  toolDefinitions,
} from "./pixel-text-studio-mcp.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(path.join(os.tmpdir(), "evavo-pixel-text-mcp-"));
try {
  const readOnly = policy({
    EVAVO_PIXEL_TEXT_STUDIO_MODE: "read-only",
    EVAVO_PIXEL_TEXT_STUDIO_ALLOWED_ROOTS: `${root};${temporary}`,
    EVAVO_PIXEL_TEXT_STUDIO_PYTHON: process.platform === "win32" ? "python" : "python3",
  });
  assert.equal(SERVER_NAME, "evavo-pixel-text-studio");
  assert.equal(SERVER_VERSION, "1.0.0");
  const readOnlyNames = toolDefinitions(readOnly).map((item) => item.name);
  assert.ok(readOnlyNames.includes(TOOLS.catalog));
  assert.ok(readOnlyNames.includes(TOOLS.validateStyle));
  assert.ok(!readOnlyNames.includes(TOOLS.render));
  const initialized = await handleRequest(
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    { policy: readOnly },
  );
  assert.equal(initialized.result.serverInfo.version, "1.0.0");
  const catalog = await callTool(TOOLS.catalog, {}, { policy: readOnly });
  assert.equal(catalog.engineVersion, "1.0.0");
  assert.ok(catalog.operations.includes("taper"));
  assert.ok(catalog.motions.includes("sparkle"));
  const example = await callTool(TOOLS.styleExample, { preset: "dos-brass-title" }, { policy: readOnly });
  assert.equal(example.schema, "evavo.pixel-text-style.v1");

  await assert.rejects(
    callTool(TOOLS.validateStyle, { stylePath: path.resolve(root, "..", "outside.json") }, { policy: readOnly }),
    /outside EVAVO_PIXEL_TEXT_STUDIO_ALLOWED_ROOTS|ENOENT/u,
  );

  const write = policy({
    EVAVO_PIXEL_TEXT_STUDIO_MODE: "read-write",
    EVAVO_PIXEL_TEXT_STUDIO_ALLOW_WRITES: "true",
    EVAVO_PIXEL_TEXT_STUDIO_ALLOWED_ROOTS: `${root};${temporary}`,
    EVAVO_PIXEL_TEXT_STUDIO_PYTHON: process.platform === "win32" ? "python" : "python3",
  });
  assert.ok(toolDefinitions(write).some((item) => item.name === TOOLS.render));
  await assert.rejects(
    callTool(
      TOOLS.render,
      {
        fontPath: path.join(temporary, "missing.fnt"),
        text: "ABC",
        stylePath: path.join(temporary, "style.json"),
        outputRoot: path.join(temporary, "output"),
      },
      { policy: write },
    ),
    /confirmWrite=true/u,
  );

  const source = await readFile(path.join(root, "scripts", "pixel-text-studio-mcp.mjs"), "utf8");
  for (const prohibited of [
    "shell: true",
    "git push",
    "force-push",
    "creativeApproval: true",
    "targetRepositoryMutation: true",
  ]) {
    assert.equal(source.includes(prohibited), false, `MCP contains prohibited authority: ${prohibited}`);
  }

  console.log("EVAVO_PIXEL_TEXT_STUDIO_MCP_CHECK_OK");
  console.log(JSON.stringify({ readOnlyToolCount: readOnlyNames.length, writeToolCount: toolDefinitions(write).length }, null, 2));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
