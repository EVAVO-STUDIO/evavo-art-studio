import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  compileRepairedFamilyRankingJob,
  validateRepairedFamilyRankingRequest,
} from "../dist/index.js";

const exampleUrl = new URL(
  "../../../examples/runtime-revision-ranking-job.json",
  import.meta.url,
);

test("published revision ranking runtime example remains contract-complete", async () => {
  const example = JSON.parse(await readFile(exampleUrl, "utf8"));
  const request = validateRepairedFamilyRankingRequest(example.payload);
  const compiled = compileRepairedFamilyRankingJob(request);
  assert.equal(compiled.runtimeJob.kind, example.kind);
  assert.equal(compiled.runtimeJob.queue, example.queue);
  assert.deepEqual(compiled.runtimeJob.inputArtifacts, example.inputArtifacts);
  assert.deepEqual(
    compiled.runtimeJob.requiredCapabilities,
    example.requiredCapabilities,
  );
  assert.equal(compiled.runtimeJob.maximumAttempts, 1);
});
