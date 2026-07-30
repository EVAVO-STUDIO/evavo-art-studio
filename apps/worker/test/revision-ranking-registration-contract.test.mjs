import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("selection workers register revision-bound ranking without promotion shortcuts", async () => {
  const [selection, ranking, jobs] = await Promise.all([
    read("src/selection-handlers.ts"),
    read("src/revision-ranking-handlers.ts"),
    read("../../packages/repair/src/revision-ranking-jobs.ts"),
  ]);
  const combined = `${selection}\n${ranking}\n${jobs}`;
  for (const token of [
    "createRepairedFamilyRankingHandlers()",
    "repairedFamilyRankingWorkerCapabilities()",
    '"art.repair.rank-revisions"',
    '"repair.revision-ranking"',
    '"selection.compare"',
    '"artifacts.store"',
    '"evidence.bundle"',
    "executeRepairedFamilyRanking(request",
  ]) {
    assert.ok(combined.includes(token), `missing ranking worker invariant: ${token}`);
  }
  assert.equal(
    selection.split("createRepairedFamilyRankingHandlers()").length - 1,
    1,
  );
  for (const forbidden of [
    "promoteSelectedCandidate(",
    "updateReference(",
    "resolveReference(",
    "OPENAI_API_KEY",
  ]) {
    assert.ok(
      !ranking.includes(forbidden),
      `revision ranking worker contains forbidden authority: ${forbidden}`,
    );
  }
});
