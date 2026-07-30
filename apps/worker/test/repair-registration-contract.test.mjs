import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("worker registers repair planning and execution independently from selection", async () => {
  const [index, repair, selection, jobs] = await Promise.all([
    read("src/index.ts"),
    read("src/repair-handlers.ts"),
    read("src/selection-handlers.ts"),
    read("../../packages/repair/src/jobs.ts"),
  ]);
  const combined = `${index}\n${repair}\n${jobs}`;
  for (const token of [
    "createTargetedRepairHandlers(providerRegistry)",
    "targetedRepairWorkerCapabilities(providerRegistry)",
    "compileTargetedRepairExecutionJob",
    "TARGETED_REPAIR_EXECUTION_CAPABILITIES",
    '"art.repair.plan"',
    '"art.repair.execute-provider-canvas"',
    '"repair.execute"',
    '"media.provider-canvas"',
    '"provider.inpaint"',
    '"provider.mask"',
    "TARGETED_REPAIR_RUNTIME_PACKET_CLOSURE_INCOMPLETE",
  ]) {
    assert.ok(combined.includes(token), `missing repair worker invariant: ${token}`);
  }
  assert.ok(!selection.includes("createTargetedRepairHandlers"));
  assert.ok(!selection.includes("targetedRepairWorkerCapabilities"));
  assert.ok(!repair.includes("updateReference("));
  assert.ok(!repair.includes("resolveReference("));
});
