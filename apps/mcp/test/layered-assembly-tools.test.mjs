import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/art-direction-tools.ts", import.meta.url),
  "utf8",
);

test("MCP exposes layered district assembly without execution authority", () => {
  for (const token of [
    "layered_assembly_protocol",
    "compile_layered_assembly_manifest",
    "verify_layered_assembly_manifest",
    "layeredAssemblyProtocolSummary()",
    "compileLayeredAssemblyManifest(plan, assemblyRequest)",
    "verifyLayeredAssemblyManifest(manifest, plan)",
    "Manifest-only: no provider call",
    "Verification-only: no source artifact reads",
  ]) {
    assert.ok(source.includes(token), `missing layered-assembly MCP invariant: ${token}`);
  }
  for (const forbidden of [
    "executeProviderCandidateRequest",
    "RuntimeWorker",
    "promoteSelectedCandidate",
    "writeFile(",
    "copyFile(",
    "child_process",
    "shell: true",
    "forcePush",
  ]) {
    assert.ok(
      !source.includes(forbidden),
      `layered-assembly MCP contains execution shortcut: ${forbidden}`,
    );
  }
});
