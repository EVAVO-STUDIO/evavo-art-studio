import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [source, provider] = await Promise.all([
  readFile(new URL("../src/layered-godot-tools.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/provider-tools.ts", import.meta.url), "utf8"),
]);

test("MCP exposes deterministic Godot integration without write or runtime authority", () => {
  for (const token of [
    "layered_godot_integration_protocol",
    "compile_layered_godot_integration_plan",
    "verify_layered_godot_integration_plan",
    "layeredGodotIntegrationProtocolSummary()",
    "compileLayeredAssemblyManifest(",
    "compileLayeredGodotIntegrationPlan(",
    "verifyLayeredGodotIntegrationPlan(",
    "Draft-only: no source image reads",
    "Verification-only: no source image reads",
  ]) {
    assert.ok(source.includes(token), `missing layered-Godot MCP invariant: ${token}`);
  }
  assert.ok(
    provider.includes('import { registerLayeredGodotTools } from "./layered-godot-tools.js";'),
  );
  assert.equal(
    provider.split("registerLayeredGodotTools(server)").length - 1,
    1,
  );
  for (const forbidden of [
    "writeFile(",
    "copyFile(",
    "rename(",
    "mkdir(",
    "executeProviderCandidateRequest",
    "RuntimeWorker",
    "promoteSelectedCandidate",
    "child_process",
    "shell: true",
    "forcePush",
  ]) {
    assert.ok(
      !source.includes(forbidden),
      `layered-Godot MCP contains execution shortcut: ${forbidden}`,
    );
  }
});
