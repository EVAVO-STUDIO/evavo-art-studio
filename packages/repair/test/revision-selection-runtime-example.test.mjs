import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  compileRepairedFamilySelectionJob,
  validateRepairedFamilySelectionRequest,
} from "../dist/index.js";

const exampleUrl = new URL(
  "../../../examples/runtime-revision-selection-job.json",
  import.meta.url,
);

test("published revision selection runtime example remains contract-complete", async () => {
  const example = JSON.parse(await readFile(exampleUrl, "utf8"));
  const request = validateRepairedFamilySelectionRequest(example.payload);
  const compiled = compileRepairedFamilySelectionJob(request);
  assert.equal(example.kind, "art.repair.prepare-revision-selection");
  assert.equal(compiled.runtimeJob.kind, example.kind);
  assert.deepEqual(compiled.runtimeJob.requiredCapabilities, example.requiredCapabilities);
  assert.deepEqual(compiled.runtimeJob.inputArtifacts, example.inputArtifacts);
  assert.equal(compiled.runtimeJob.queue, "selection");
  assert.equal(request.policy.allowAutomaticSelection, false);
});
