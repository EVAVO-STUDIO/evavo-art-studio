import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("MCP exposes selection and promotion compilers without execution shortcuts", async () => {
  const selection = await read("src/selection-tools.ts");
  const provider = await read("src/provider-tools.ts");
  const combined = `${selection}\n${provider}`;
  for (const token of [
    "candidate_selection_protocol",
    "validate_candidate_selection",
    "compile_candidate_selection_job",
    "validate_candidate_promotion",
    "compile_candidate_promotion_job",
    'kind: "art.candidate.select"',
    'kind: "art.candidate.promote"',
    'queue: "selection"',
    '"selection.compare"',
    '"selection.promote"',
    "registerSelectionTools(server)",
    'executionMode: "durable-worker-only"',
  ]) {
    assert.ok(combined.includes(token), `missing selection MCP invariant: ${token}`);
  }
  for (const forbidden of [
    "executeCandidateSelection(",
    "promoteSelectedCandidate(",
    "LocalArtifactStore",
    "OPENAI_API_KEY",
    "child_process",
    "eval(",
  ]) {
    assert.ok(
      !selection.includes(forbidden),
      `selection MCP contains execution shortcut: ${forbidden}`,
    );
  }
});
