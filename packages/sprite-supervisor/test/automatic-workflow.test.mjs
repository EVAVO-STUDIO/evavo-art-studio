import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  SpriteSupervisorError,
  analyseAutomaticSpriteWorkflow,
  automaticSpriteWorkflowProtocolSummary,
  compileAutomaticSpriteWorkflow,
} from "../dist/index.js";

async function example() {
  return JSON.parse(
    await readFile(
      new URL(
        "../../../examples/automatic-sprite-workflow.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}

test("automatic workflow compiles every authored frame into executable branches", async () => {
  const input = await example();
  const first = compileAutomaticSpriteWorkflow(input);
  const second = compileAutomaticSpriteWorkflow(input);

  assert.equal(first.analysis.disposition, "ready");
  assert.equal(first.analysis.blockers.length, 0);
  assert.equal(first.requestSha256, second.requestSha256);
  assert.equal(
    first.supervisorWorkflow.workflowSha256,
    second.supervisorWorkflow.workflowSha256,
  );
  assert.ok(first.analysis.totals.authoredDirections >= 2);
  assert.ok(first.analysis.totals.authoredFrames > 0);
  assert.ok(
    first.analysis.totals.productionUnits >
      first.analysis.totals.authoredFrames,
  );
  assert.equal(
    first.analysis.totals.candidateJobs,
    first.analysis.totals.productionUnits * 2,
  );
  assert.equal(
    first.analysis.totals.masteringJobs,
    first.analysis.totals.candidateJobs,
  );

  const tasks = first.supervisorRequest.tasks;
  const providerTasks = tasks.filter(
    (entry) => entry.kind === "art.candidate.generate",
  );
  const masteringTasks = tasks.filter(
    (entry) => entry.kind === "art.candidate.master-alpha",
  );
  const selectionTasks = tasks.filter(
    (entry) => entry.kind === "art.candidate.select",
  );
  const promotionTasks = tasks.filter(
    (entry) => entry.kind === "art.candidate.promote",
  );
  const familyTasks = tasks.filter(
    (entry) => entry.kind === "sprite.family.verify",
  );

  assert.equal(providerTasks.length, first.analysis.totals.candidateJobs);
  assert.equal(masteringTasks.length, first.analysis.totals.masteringJobs);
  assert.equal(selectionTasks.length, first.analysis.totals.selectionJobs);
  assert.equal(promotionTasks.length, first.analysis.totals.promotionJobs);
  assert.equal(familyTasks.length, 1);

  for (const task of masteringTasks) {
    assert.equal(task.payloadTemplate.targetWidth, 64);
    assert.equal(task.payloadTemplate.targetHeight, 64);
    assert.equal(task.payloadTemplate.resampling, "nearest");
    assert.ok(task.requiredCapabilities.includes("media.raster"));
  }
  for (const task of selectionTasks) {
    assert.equal(task.payloadTemplate.policy.profile, "custom");
    assert.equal(task.payloadTemplate.policy.allowAutomaticSelection, true);
    assert.deepEqual(task.payloadTemplate.policy.externalEvidence, []);
    assert.equal(task.payloadTemplate.policy.requireQualityPassed, true);
  }
  for (const task of promotionTasks) {
    assert.equal(task.payloadTemplate.approval.mode, "automatic");
    assert.equal(task.payloadTemplate.target.expectedGeneration, 0);
    assert.match(task.payloadTemplate.target.namespace, /^projects\//);
  }

  const inBetween = providerTasks.find(
    (task) => task.payloadTemplate.continuityPhase === "in-between",
  );
  assert.ok(inBetween);
  const roles = inBetween.payloadTemplate.references.map((entry) => entry.role);
  assert.ok(roles.includes("canonical-identity"));
  assert.ok(roles.includes("direction-master"));
  assert.ok(roles.includes("previous-key-pose"));
  assert.ok(roles.includes("next-key-pose"));

  const family = familyTasks[0];
  assert.ok(Array.isArray(family.payloadTemplate.frames));
  assert.equal(
    family.payloadTemplate.frames.length,
    first.analysis.totals.authoredFrames,
  );
  assert.ok(
    family.outputBindings.some(
      (entry) => entry.role === "automatic.family-evidence",
    ),
  );
  assert.deepEqual(
    first.supervisorRequest.policy.requiredReleaseArtifactRoles,
    ["automatic.family-evidence", "automatic.family-manifest"],
  );
});

test("automatic protocol states its provider-free and fail-closed boundaries", () => {
  const protocol = automaticSpriteWorkflowProtocolSummary();
  assert.equal(protocol.protocolVersion, "2026-08-01.1");
  assert.ok(
    protocol.productionRules.some((entry) => entry.includes("target-size")),
  );
  assert.ok(
    protocol.failClosedRules.some((entry) => entry.includes("Derived mirrored")),
  );
  assert.match(protocol.executionBoundary, /never call a provider/i);
});

test("automatic workflow blocks unsafe mirrored directions", async () => {
  const input = await example();
  input.spritePlanRequest.allowDerivedMirrors = true;
  input.spritePlanRequest.artDirectionRequest.asset.asymmetric = false;
  const analysed = analyseAutomaticSpriteWorkflow(input);
  assert.equal(analysed.analysis.disposition, "blocked");
  assert.ok(
    analysed.analysis.blockers.some(
      (entry) =>
        entry.code ===
        "AUTOMATIC_SPRITE_WORKFLOW_DERIVED_DIRECTION_UNSUPPORTED",
    ),
  );
});

test("automatic workflow blocks required visible layers without references", async () => {
  const input = await example();
  input.spritePlanRequest.artDirectionRequest.asset.independentShadow = true;
  const analysed = analyseAutomaticSpriteWorkflow(input);
  assert.equal(analysed.analysis.disposition, "blocked");
  assert.ok(
    analysed.analysis.blockers.some(
      (entry) =>
        entry.code === "AUTOMATIC_SPRITE_WORKFLOW_LAYER_REFERENCE_MISSING" &&
        entry.details.role === "shadow",
    ),
  );
});

test("automatic workflow enforces task ceilings before execution", async () => {
  const input = await example();
  input.policy.maximumTasks = 10;
  const analysed = analyseAutomaticSpriteWorkflow(input);
  assert.equal(analysed.analysis.disposition, "blocked");
  assert.ok(
    analysed.analysis.blockers.some(
      (entry) => entry.code === "AUTOMATIC_SPRITE_WORKFLOW_TASK_LIMIT_EXCEEDED",
    ),
  );
});

test("automatic workflow rejects an art direction that differs from the plan", async () => {
  const input = await example();
  input.artDirectionRequest = structuredClone(
    input.spritePlanRequest.artDirectionRequest,
  );
  input.artDirectionRequest.contractId = "different-art-direction";
  assert.throws(
    () => compileAutomaticSpriteWorkflow(input),
    (error) =>
      error instanceof SpriteSupervisorError &&
      error.code ===
        "AUTOMATIC_SPRITE_WORKFLOW_ART_DIRECTION_BINDING_MISMATCH",
  );
});
