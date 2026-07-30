import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("MCP compiles repair, revision and revision-selection jobs without artifact access", async () => {
  const repair = await read("src/repair-tools.ts");
  const selection = await read("src/selection-tools.ts");
  const packageJson = JSON.parse(await read("package.json"));
  const tsconfig = JSON.parse(await read("tsconfig.json"));
  const combined = `${repair}\n${selection}`;
  for (const token of [
    "targeted_repair_protocol",
    "validate_targeted_repair_request",
    "compile_targeted_repair_job",
    'kind: "art.repair.plan"',
    'queue: "selection"',
    '"repair.plan"',
    '"artifacts.store"',
    '"evidence.bundle"',
    'executionMode: "durable-worker-only"',
    "registerRepairTools(server)",
    "repaired_family_revision_protocol",
    "validate_repaired_family_revision_request",
    "compile_repaired_family_revision_job",
    "compileRepairedFamilyRevisionJob(request)",
    "repaired_family_revision_selection_protocol",
    "validate_repaired_family_revision_selection_request",
    "compile_repaired_family_revision_selection_job",
    "compileRepairedFamilySelectionJob(request)",
    '"art.repair.prepare-revision-selection"',
    '"repair.revision-selection"',
  ]) {
    assert.ok(combined.includes(token), `missing repair MCP invariant: ${token}`);
  }
  assert.equal(packageJson.dependencies["@evavo/art-repair"], "workspace:*");
  assert.ok(
    tsconfig.references.some((entry) => entry.path === "../../packages/repair"),
  );
  for (const forbidden of [
    "planTargetedRepair(",
    "createRepairedFamilyRevision(",
    "prepareRepairedFamilySelection(",
    "executeCandidateSelection(",
    "LocalArtifactStore",
    "OPENAI_API_KEY",
    "EVAVO_ART_WRITE_TOKEN",
    "promoteSelectedCandidate",
    "child_process",
    "shell: true",
    "updateReference(",
  ]) {
    assert.ok(
      !repair.includes(forbidden),
      `repair MCP contains execution shortcut: ${forbidden}`,
    );
  }
});
