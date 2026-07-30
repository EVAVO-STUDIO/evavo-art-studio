import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readWorker = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
const readRepository = (relativePath) =>
  readFile(new URL(`../../../${relativePath}`, import.meta.url), "utf8");

test("worker registers immutable family revision execution exactly once", async () => {
  const [index, handlers, jobs] = await Promise.all([
    readWorker("src/index.ts"),
    readWorker("src/revision-handlers.ts"),
    readRepository("packages/repair/src/revision-jobs.ts"),
  ]);
  for (const token of [
    "createRepairedFamilyRevisionHandlers()",
    "repairedFamilyRevisionWorkerCapabilities()",
    '"art.repair.revise-family"',
  ]) {
    assert.ok(
      `${index}\n${handlers}`.includes(token),
      `missing revision worker invariant: ${token}`,
    );
  }
  for (const token of [
    '"repair.revise-family"',
    '"quality.sprite-frame"',
    '"sprite.family.verify"',
    '"media.layer-compose"',
    '"selection.compare"',
    '"artifacts.store"',
    '"evidence.bundle"',
  ]) {
    assert.ok(jobs.includes(token), `missing centralized capability: ${token}`);
  }
  assert.equal(
    index.split("createRepairedFamilyRevisionHandlers()").length - 1,
    1,
  );
  assert.ok(!handlers.includes("updateReference("));
  assert.ok(!handlers.includes("resolveReference("));
});
