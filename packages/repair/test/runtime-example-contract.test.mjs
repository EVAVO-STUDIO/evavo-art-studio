import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateTargetedRepairRequest } from "../dist/index.js";

test("published targeted repair runtime example remains lineage-complete", async () => {
  const job = JSON.parse(
    await readFile(
      new URL("../../../examples/runtime-targeted-repair-job.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(job.queue, "selection");
  assert.equal(job.kind, "art.repair.plan");
  const request = validateTargetedRepairRequest(job.payload);
  const expectedInputs = [
    request.familyEvidenceArtifactId,
    request.maskArtifactId,
    ...request.references.map((reference) => reference.artifactId),
  ].filter(Boolean);
  assert.deepEqual(
    [...new Set(job.inputArtifacts)].sort(),
    [...new Set(expectedInputs)].sort(),
  );
  assert.deepEqual(job.requiredCapabilities, [
    "repair.plan",
    "artifacts.store",
    "evidence.bundle",
  ]);
  assert.equal(request.policy.allowSharedLayerRepair, false);
  assert.equal(request.policy.allowWholeFramePixelRepair, false);
  assert.equal(request.policy.requireMaskForPixelRepair, true);
});
