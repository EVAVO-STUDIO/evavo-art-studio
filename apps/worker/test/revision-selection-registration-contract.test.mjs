import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("worker registers revision selection preparation exactly once", async () => {
  const [index, handlers, jobs] = await Promise.all([
    read("src/index.ts"),
    read("src/revision-selection-handlers.ts"),
    read("../../packages/repair/src/revision-selection-jobs.ts"),
  ]);
  const combined = `${index}\n${handlers}\n${jobs}`;
  for (const token of [
    "createRepairedFamilySelectionHandlers()",
    "repairedFamilySelectionWorkerCapabilities()",
    '"art.repair.prepare-revision-selection"',
    '"repair.revision-selection"',
    '"artifacts.store"',
    '"evidence.bundle"',
    "prepareRepairedFamilySelection(request",
  ]) {
    assert.ok(combined.includes(token), `missing revision selection invariant: ${token}`);
  }
  assert.equal(
    index.split("createRepairedFamilySelectionHandlers()").length - 1,
    1,
  );
  for (const forbidden of [
    "executeCandidateSelection(",
    "promoteSelectedCandidate(",
    "updateReference(",
    "resolveReference(",
    "OPENAI_API_KEY",
  ]) {
    assert.ok(
      !handlers.includes(forbidden),
      `revision selection worker contains forbidden authority: ${forbidden}`,
    );
  }
});
