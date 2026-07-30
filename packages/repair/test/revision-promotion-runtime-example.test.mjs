import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  compileRepairedFamilyPromotionJob,
  validateRepairedFamilyPromotionRequest,
} from "../dist/index.js";

const exampleUrl = new URL(
  "../../../examples/runtime-revision-promotion-job.json",
  import.meta.url,
);

test("published revision promotion runtime example remains contract-complete", async () => {
  const example = JSON.parse(await readFile(exampleUrl, "utf8"));
  const request = validateRepairedFamilyPromotionRequest(example.payload);
  const compiled = compileRepairedFamilyPromotionJob(request);
  assert.equal(compiled.runtimeJob.kind, example.kind);
  assert.equal(compiled.runtimeJob.queue, example.queue);
  assert.deepEqual(compiled.runtimeJob.inputArtifacts, example.inputArtifacts);
  assert.deepEqual(
    compiled.runtimeJob.requiredCapabilities,
    example.requiredCapabilities,
  );
  assert.equal(
    compiled.runtimeJob.payload.target.expectedArtifactId,
    example.payload.target.expectedArtifactId,
  );
  assert.equal(compiled.runtimeJob.maximumAttempts, 1);
});
