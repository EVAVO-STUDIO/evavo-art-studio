import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) =>
  readFile(new URL(`../${relative}`, import.meta.url), "utf8");

test("MCP runtime tools remain governed and write gated", async () => {
  const source = await read("src/runtime-tools.ts");
  for (const token of [
    "EVAVO_ART_ALLOW_WRITES",
    "EVAVO_ART_RUNTIME_ROOT",
    "EVAVO_ART_ARTIFACT_ROOT",
    "EVAVO_ART_ALLOWED_ROOTS",
    "LocalRuntimeRepository",
    "LocalArtifactStore",
    "assertPathWithinAllowedRoots",
    '"submit_art_runtime_jobs"',
    '"list_art_runtime_jobs"',
    '"control_art_runtime_job"',
    '"recover_art_runtime_leases"',
    '"read_art_runtime_events"',
    '"store_artifact_file"',
    '"inspect_artifact_record"',
    '"manage_artifact_reference"',
    "expectedGeneration",
  ]) {
    assert.ok(source.includes(token), `missing runtime MCP token: ${token}`);
  }
  for (const forbidden of [
    "child_process",
    "exec(",
    "spawn(",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "dangerouslySetInnerHTML",
  ]) {
    assert.ok(!source.includes(forbidden), `forbidden runtime MCP shortcut: ${forbidden}`);
  }
});

test("MCP server registers runtime tools without replacing existing art tools", async () => {
  const source = await read("src/index.ts");
  assert.ok(source.includes("registerRuntimeTools(server)"));
  for (const tool of [
    "art_studio_capabilities",
    "validate_art_brief",
    "compile_art_production_plan",
    "inspect_art_repository",
    "inspect_sprite_frame_quality",
    "inspect_sprite_sequence_quality",
    "build_sprite_atlas_package",
  ]) {
    assert.ok(source.includes(`\"${tool}\"`), `missing existing MCP tool: ${tool}`);
  }
});
