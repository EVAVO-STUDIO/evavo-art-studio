import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("MCP compiles revision-bound ranking without execution authority", async () => {
  const [repair, jobs] = await Promise.all([
    read("src/repair-tools.ts"),
    read("../../packages/repair/src/revision-ranking-jobs.ts"),
  ]);
  const combined = `${repair}\n${jobs}`;
  for (const token of [
    "repaired_family_revision_ranking_protocol",
    "validate_repaired_family_revision_ranking_request",
    "compile_repaired_family_revision_ranking_job",
    "compileRepairedFamilyRankingJob(request)",
    'kind: "art.repair.rank-revisions"',
    '"repair.revision-ranking"',
    '"selection.compare"',
    '"artifacts.store"',
    '"evidence.bundle"',
  ]) {
    assert.ok(combined.includes(token), `missing ranking MCP invariant: ${token}`);
  }
  for (const forbidden of [
    "executeRepairedFamilyRanking(",
    "executeCandidateSelection(",
    "promoteSelectedCandidate(",
    "LocalArtifactStore",
    "updateReference(",
    "OPENAI_API_KEY",
  ]) {
    assert.ok(
      !repair.includes(forbidden),
      `ranking MCP contains forbidden authority: ${forbidden}`,
    );
  }
});
