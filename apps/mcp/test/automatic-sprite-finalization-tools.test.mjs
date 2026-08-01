import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("MCP compiles background and 3D-aware finalization without execution authority", async () => {
  const tools = await read("src/sprite-supervisor-tools.ts");
  for (const token of [
    "automatic_sprite_finalization_protocol",
    "validate_automatic_sprite_finalization",
    "compile_automatic_sprite_finalization",
    "automaticSpriteFinalizationProtocolSummary()",
    "compileAutomaticSpriteFinalizationWorkflow(request)",
    "background",
    "threeD",
  ]) {
    assert.ok(tools.includes(token), `missing MCP invariant: ${token}`);
  }
  for (const forbidden of [
    "LocalRuntimeRepository",
    "LocalArtifactStore",
    "runtime.submit(",
    "RuntimeWorker",
    "OPENAI_API_KEY",
    "executeProviderCandidateRequest",
    "promoteSelectedCandidate",
    "updateReference(",
    "child_process",
    "shell: true",
  ]) {
    assert.ok(
      !tools.includes(forbidden),
      `MCP contains execution shortcut: ${forbidden}`,
    );
  }
  assert.match(tools, /Compile-only/);
});
