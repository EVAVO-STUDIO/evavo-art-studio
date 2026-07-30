import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("selection workers register revision-bound promotion exactly once", async () => {
  const [selection, promotion, jobs] = await Promise.all([
    read("src/selection-handlers.ts"),
    read("src/revision-promotion-handlers.ts"),
    read("../../packages/repair/src/revision-promotion-jobs.ts"),
  ]);
  const combined = `${selection}\n${promotion}\n${jobs}`;
  for (const token of [
    "createRepairedFamilyPromotionHandlers()",
    "repairedFamilyPromotionWorkerCapabilities()",
    '"art.repair.promote-revision"',
    '"repair.revision-promote"',
    '"selection.promote"',
    '"artifacts.store"',
    '"evidence.bundle"',
    "promoteRepairedFamilyCandidate(request",
  ]) {
    assert.ok(combined.includes(token), `missing promotion worker invariant: ${token}`);
  }
  assert.equal(
    selection.split("createRepairedFamilyPromotionHandlers()").length - 1,
    1,
  );
  for (const forbidden of [
    "OPENAI_API_KEY",
    "provider.inpaint",
    "executeProviderCandidateRequest(",
  ]) {
    assert.ok(
      !promotion.includes(forbidden),
      `revision promotion worker contains provider shortcut: ${forbidden}`,
    );
  }
});
