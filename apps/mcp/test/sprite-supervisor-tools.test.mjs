import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("MCP exposes closed-loop supervision without runtime authority", async () => {
  const [tools, spritePlan, packageSource, tsconfigSource] = await Promise.all([
    read("src/sprite-supervisor-tools.ts"),
    read("src/sprite-plan-tools.ts"),
    read("package.json"),
    read("tsconfig.json"),
  ]);
  const packageJson = JSON.parse(packageSource);
  const tsconfig = JSON.parse(tsconfigSource);
  const combined = `${tools}\n${spritePlan}`;

  for (const token of [
    "sprite_production_supervisor_protocol",
    "validate_sprite_production_supervisor",
    "compile_sprite_production_supervisor",
    "spriteSupervisorProtocolSummary()",
    "compileSpriteSupervisorWorkflow(request)",
    "registerSpriteSupervisorTools(server)",
    "art.sprite-production.supervise",
  ]) {
    assert.ok(
      combined.includes(token),
      `missing sprite supervisor MCP invariant: ${token}`,
    );
  }

  assert.equal(
    packageJson.dependencies["@evavo/art-sprite-supervisor"],
    "workspace:*",
  );
  assert.ok(
    tsconfig.references.some(
      (entry) => entry.path === "../../packages/sprite-supervisor",
    ),
  );

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
      `sprite supervisor MCP contains execution shortcut: ${forbidden}`,
    );
  }
});
