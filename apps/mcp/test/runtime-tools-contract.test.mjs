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
    "RuntimeError",
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
    'current?.spec.labels.migrationMode === "book-art-shadow-candidate"',
    '"RUNTIME_REDRIVE_POLICY_FORBIDDEN"',
    "immutable at one provider attempt and cannot be redriven",
  ]) {
    assert.ok(source.includes(token), `missing runtime MCP token: ${token}`);
  }

  const readBeforeRedrive = source.indexOf("const current = await runtime.get(jobId);");
  const policyBeforeRedrive = source.indexOf("RUNTIME_REDRIVE_POLICY_FORBIDDEN");
  const redrive = source.indexOf("await runtime.redrive(");
  assert.ok(readBeforeRedrive >= 0, "redrive must inspect the durable job first");
  assert.ok(policyBeforeRedrive > readBeforeRedrive, "Book Art policy check must follow the durable read");
  assert.ok(redrive > policyBeforeRedrive, "generic redrive must remain behind the Book Art policy check");

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
