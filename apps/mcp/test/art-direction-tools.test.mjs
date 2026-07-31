import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("MCP compiles art direction without provider, artifact or approval authority", async () => {
  const [tools, provider, packageJson, tsconfig] = await Promise.all([
    read("src/art-direction-tools.ts"),
    read("src/provider-tools.ts"),
    read("package.json").then(JSON.parse),
    read("tsconfig.json").then(JSON.parse),
  ]);
  for (const token of [
    "art_direction_protocol",
    "list_art_direction_presets",
    "list_art_direction_output_profiles",
    "validate_art_direction_request",
    "compile_art_direction_contract",
    "compileArtDirectionContract(request)",
    "compileArtDirectionJob(request)",
    '"art.direction.compile"',
    '"art-direction.compile"',
    '"style.preset.resolve"',
    '"output-profile.compile"',
    "registerArtDirectionTools(server)",
  ]) {
    assert.ok(
      `${tools}\n${provider}`.includes(token),
      `missing art-direction MCP invariant: ${token}`,
    );
  }
  assert.equal(
    provider.split("registerArtDirectionTools(server)").length - 1,
    1,
  );
  assert.equal(packageJson.dependencies["@evavo/art-direction"], "workspace:*");
  assert.ok(
    tsconfig.references.some(
      (entry) => entry.path === "../../packages/art-direction",
    ),
  );
  for (const forbidden of [
    "LocalArtifactStore",
    "OPENAI_API_KEY",
    "EVAVO_ART_WRITE_TOKEN",
    "executeProviderCandidateRequest",
    "RuntimeWorker",
    "promoteSelectedCandidate",
    "updateReference(",
    "resolveReference(",
    "child_process",
    "shell: true",
  ]) {
    assert.ok(
      !tools.includes(forbidden),
      `art-direction MCP contains execution shortcut: ${forbidden}`,
    );
  }
});
