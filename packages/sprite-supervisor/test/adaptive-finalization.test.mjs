import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  SpriteSupervisorError,
  compileAutomaticSpriteFinalizationWorkflow,
} from "../dist/index.js";

async function request() {
  return JSON.parse(
    await readFile(
      new URL("../../../examples/automatic-sprite-finalization.json", import.meta.url),
      "utf8",
    ),
  );
}

function tasksOf(compiled, kind) {
  return compiled.supervisorRequest.tasks.filter((task) => task.kind === kind);
}

test("inserts one adaptive proof task after every ordinary mastering task", async () => {
  const input = await request();
  input.finalization.maximumDeterministicRepairPasses = 3;
  input.finalization.transparentBleedRadius = 2;
  input.finalization.matteSearchRadius = 7;
  input.finalization.matteDistanceThreshold = 64;
  const compiled = compileAutomaticSpriteFinalizationWorkflow(input);
  const masters = tasksOf(compiled, "art.candidate.master-alpha");
  const adaptive = tasksOf(compiled, "art.candidate.finalize-adaptive");
  assert.ok(masters.length > 0);
  assert.equal(adaptive.length, masters.length);
  assert.equal(
    compiled.analysis.finalization.candidateFinalizationTasks,
    adaptive.length,
  );
  assert.equal(
    compiled.analysis.base.totals.tasks,
    compiled.supervisorRequest.tasks.length,
  );
  for (const task of adaptive) {
    assert.equal(task.dependencyTaskIds.length, 1);
    assert.notEqual(task.dependencyTaskIds[0], task.id);
    assert.equal(task.payloadTemplate.maximumRepairPasses, 3);
    assert.equal(task.payloadTemplate.transparentBleedRadius, 2);
    assert.equal(task.payloadTemplate.matteSearchRadius, 7);
    assert.equal(task.payloadTemplate.matteDistanceThreshold, 64);
    assert.ok(task.requiredCapabilities.includes("media.adaptive-finalize"));
    assert.ok(
      task.outputBindings.some(
        (binding) =>
          binding.labels?.artifactRole === "candidate-hostile-background-proof" &&
          binding.required === true,
      ),
    );
    assert.ok(
      task.outputBindings.some(
        (binding) =>
          binding.source === "failure-details" &&
          binding.pointer === "/repairPlanArtifactId",
      ),
    );
  }
});

test("pre-adaptive mastering remains tolerant while selection waits for proof", async () => {
  const compiled = compileAutomaticSpriteFinalizationWorkflow(await request());
  const masters = tasksOf(compiled, "art.candidate.master-alpha");
  const adaptive = tasksOf(compiled, "art.candidate.finalize-adaptive");
  const adaptiveIds = new Set(adaptive.map((task) => task.id));
  const masterIds = new Set(masters.map((task) => task.id));
  for (const task of masters) {
    assert.equal(task.payloadTemplate.deliveryProfileId, "godot-sprite-lossless");
    const output = task.outputBindings.find(
      (binding) =>
        binding.labels?.artifactRole === "provider-candidate-alpha-master",
    );
    assert.ok(output);
    assert.equal(output.labels.qualityState, undefined);
    assert.match(output.role, /^automatic\.pre-adaptive\.[a-f0-9]{16}$/);
  }
  for (const selection of tasksOf(compiled, "art.candidate.select")) {
    assert.ok(selection.dependencyTaskIds.length > 0);
    assert.ok(selection.dependencyTaskIds.every((id) => adaptiveIds.has(id)));
    assert.ok(selection.dependencyTaskIds.every((id) => !masterIds.has(id)));
  }
});

test("adaptive options and expanded task counts remain bounded", async () => {
  const invalid = await request();
  invalid.finalization.maximumDeterministicRepairPasses = 99;
  assert.throws(
    () => compileAutomaticSpriteFinalizationWorkflow(invalid),
    (error) =>
      error instanceof SpriteSupervisorError &&
      error.code === "ADAPTIVE_FINALIZATION_OPTION_INVALID",
  );

  const limited = await request();
  limited.workflow.policy.maximumTasks = 1;
  assert.throws(
    () => compileAutomaticSpriteFinalizationWorkflow(limited),
    (error) =>
      error instanceof SpriteSupervisorError &&
      (error.code === "AUTOMATIC_SPRITE_WORKFLOW_TASK_LIMIT_EXCEEDED" ||
        error.code === "ADAPTIVE_FINALIZATION_TASK_LIMIT_EXCEEDED"),
  );
});
