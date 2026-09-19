import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourcePath = new URL(
  "./visual_continuity_3d_reference_adapter_mcp.mjs",
  import.meta.url,
);
const configPath = new URL(
  "../.mcp.visual-continuity-3d-reference-adapter-v1.json",
  import.meta.url,
);

test("3D adapter MCP exposes only guarded compile and verify operations", async () => {
  const [source, config] = await Promise.all([
    readFile(sourcePath, "utf8"),
    readFile(configPath, "utf8"),
  ]);
  for (const token of [
    "evavo_visual_continuity_3d_adapter_capabilities",
    "evavo_compile_visual_continuity_3d_handoff",
    "evavo_verify_visual_continuity_3d_handoff",
    "compileContinuity3dReferenceHandoff",
    "verifyContinuity3dReferenceHandoff",
    "assertAllowedLocalPath",
    "writeCreateOnlyBundle",
    "EVAVO_VISUAL_CONTINUITY_3D_ALLOWED_ROOTS",
    "EVAVO_VISUAL_CONTINUITY_3D_ALLOW_WRITES",
    "receiverExecutionPerformed: false",
    "automaticCreativeApproval: false",
    "targetRepositoryMutation: false",
    "publication: false",
  ]) {
    assert.ok(
      `${source}\n${config}`.includes(token),
      `missing 3D adapter MCP invariant ${token}`,
    );
  }
  for (const forbidden of [
    "child_process",
    "shell: true",
    "OPENAI_API_KEY",
    "receiverExecutionPerformed: true",
    "automaticCreativeApproval: true",
    "targetRepositoryMutation: true",
    "publication: true",
  ]) {
    assert.equal(
      source.includes(forbidden),
      false,
      `3D adapter MCP contains unsafe shortcut ${forbidden}`,
    );
  }
  assert.match(source, /create-only JSON file/i);
  assert.match(source, /Does not execute the receiver/i);
  assert.match(source, /Receiver execution is always separate/i);
});

test("3D adapter MCP configuration uses the fixed adapter entry point", async () => {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const server = config.mcpServers[
    "evavo-visual-continuity-3d-reference-adapter-v1"
  ];
  assert.equal(server.command, "node");
  assert.deepEqual(server.args, [
    "tools/visual_continuity_3d_reference_adapter_mcp.mjs",
  ]);
  assert.equal(
    server.env.EVAVO_VISUAL_CONTINUITY_3D_ALLOW_WRITES,
    "true",
  );
  assert.ok(
    server.env.EVAVO_VISUAL_CONTINUITY_3D_ALLOWED_ROOTS.includes(
      "C:\\GitRepos",
    ),
  );
});
