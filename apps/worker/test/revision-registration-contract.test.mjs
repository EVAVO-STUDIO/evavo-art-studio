import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("worker registers immutable family revision execution exactly once", async () => {
  const [index, handlers] = await Promise.all([
    read("src/index.ts"),
    read("src/revision-handlers.ts"),
  ]);
  for (const token of [
    "createRepairedFamilyRevisionHandlers()",
    "repairedFamilyRevisionWorkerCapabilities()",
    '"art.repair.revise-family"',
    '"repair.revise-family"',
    '"quality.sprite-frame"',
    '"sprite.family.verify"',
    '"media.layer-compose"',
  ]) {
    assert.ok(
      `${index}\n${handlers}`.includes(token),
      `missing revision worker invariant: ${token}`,
    );
  }
  assert.equal(
    index.split("createRepairedFamilyRevisionHandlers()").length - 1,
    1,
  );
  assert.ok(!handlers.includes("updateReference("));
  assert.ok(!handlers.includes("resolveReference("));
});
