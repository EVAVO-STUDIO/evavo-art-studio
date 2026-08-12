#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink } from "node:fs/promises";
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
} from "./pixel-font-studio-universal-mcp.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const examples = path.join(root, "examples", "pixel-font-universal");
const temporary = await mkdtemp(path.join(os.tmpdir(), "evavo-universal-mcp-"));
try {
  const readOnly = policy({
    EVAVO_PIXEL_FONT_UNIVERSAL_MODE: "read-only",
    EVAVO_PIXEL_FONT_UNIVERSAL_ALLOWED_ROOTS: `${root};${temporary}`,
    EVAVO_PIXEL_FONT_UNIVERSAL_PYTHON: process.platform === "win32" ? "python" : "python3",
  });
  assert.equal(SERVER_NAME, "evavo-pixel-font-universal");
  assert.equal(SERVER_VERSION, "3.0.0");
  const readOnlyNames = toolDefinitions(readOnly).map((item) => item.name);
  assert.ok(readOnlyNames.includes(TOOLS.catalog));
  assert.ok(readOnlyNames.includes(TOOLS.validateFace));
  assert.ok(!readOnlyNames.includes(TOOLS.compile));
  const initialized = await handleRequest(
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    { policy: readOnly },
  );
  assert.equal(initialized.result.serverInfo.version, "3.0.0");
  const catalog = await callTool(TOOLS.catalog, {}, { policy: readOnly });
  assert.equal(catalog.engineVersion, "3.0.0");
  assert.ok(catalog.pixelModes.includes("component-composed"));
  const facePath = path.join(examples, "rgba-layered-components.face.json");
  const profilePath = path.join(examples, "fantasy-herald.profile.json");
  assert.equal((await callTool(TOOLS.validateFace, { facePath }, { policy: readOnly })).status, "passed");
  assert.equal((await callTool(TOOLS.validateProfile, { profilePath }, { policy: readOnly })).engineVersion, "3.0.0");
  await assert.rejects(
    callTool(TOOLS.validateFace, { facePath: path.resolve(root, "..", "outside.json") }, { policy: readOnly }),
    /outside EVAVO_PIXEL_FONT_UNIVERSAL_ALLOWED_ROOTS|ENOENT/u,
  );
  const symlinkPath = path.join(temporary, "face-link.json");
  await symlink(facePath, symlinkPath);
  await assert.rejects(
    callTool(TOOLS.validateFace, { facePath: symlinkPath }, { policy: readOnly }),
    /must not be a symlink/u,
  );

  const write = policy({
    EVAVO_PIXEL_FONT_UNIVERSAL_MODE: "read-write",
    EVAVO_PIXEL_FONT_UNIVERSAL_ALLOW_WRITES: "true",
    EVAVO_PIXEL_FONT_UNIVERSAL_ALLOWED_ROOTS: `${root};${temporary}`,
    EVAVO_PIXEL_FONT_UNIVERSAL_PYTHON: process.platform === "win32" ? "python" : "python3",
  });
  assert.ok(toolDefinitions(write).some((item) => item.name === TOOLS.compile));
  const denied = path.join(temporary, "denied");
  await assert.rejects(
    callTool(TOOLS.compile, { facePath, profilePath, outputRoot: denied }, { policy: write }),
    /confirmWrite=true/u,
  );
  const first = path.join(temporary, "first");
  const second = path.join(temporary, "second");
  for (const outputRoot of [first, second]) {
    const built = await callTool(
      TOOLS.compile,
      { facePath, profilePath, outputRoot, confirmWrite: true },
      { policy: write },
    );
    assert.equal(built.status, "passed");
    const validation = await callTool(TOOLS.validateOutput, { outputRoot }, { policy: readOnly });
    assert.equal(validation.status, "passed");
  }
  const comparison = await callTool(
    TOOLS.compare,
    { firstRoot: first, secondRoot: second },
    { policy: readOnly },
  );
  assert.equal(comparison.status, "passed");

  const source = await readFile(path.join(root, "scripts", "pixel-font-studio-universal-mcp.mjs"), "utf8");
  for (const prohibited of [
    "shell: true",
    "git push",
    "force-push",
    "targetRepositoryMutation: true",
    "creativeApproval: true",
    "operation_registry",
  ]) {
    assert.equal(source.includes(prohibited), false, `MCP contains prohibited surface: ${prohibited}`);
  }
  console.log("EVAVO_PIXEL_FONT_UNIVERSAL_MCP_CHECK_OK");
  console.log(JSON.stringify({ readOnlyToolCount: readOnlyNames.length, writeToolCount: toolDefinitions(write).length, comparison }, null, 2));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
