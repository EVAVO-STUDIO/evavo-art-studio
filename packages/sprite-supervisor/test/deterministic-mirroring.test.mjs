import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  SpriteSupervisorError,
  automaticSpriteFinalizationRequestSha256,
  compileAutomaticSpriteFinalizationWorkflow,
  compileAutomaticSpriteWorkflow,
} from "../dist/index.js";

async function automaticRequest() {
  const input = JSON.parse(
    await readFile(
      new URL(
        "../../../examples/automatic-sprite-workflow.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  input.spritePlanRequest.allowDerivedMirrors = true;
  input.spritePlanRequest.clipOverrides = [
    { id: "jump-loop", include: true },
    { id: "fall", include: true },
    { id: "land", include: true },
  ];
  input.spritePlanRequest.artDirectionRequest.asset.asymmetric = false;
  input.references.layerReferenceArtifactIds = {
    shadow: `artifact_${"b".repeat(64)}`,
  };
  input.metadata = {
    ...(input.metadata ?? {}),
    deterministicMirroring: {
      lightingReviewed: true,
    },
  };
  return input;
}

function tasksOf(compiled, operation) {
  return compiled.supervisorRequest.tasks.filter(
    (task) => task.payloadTemplate?.operation === operation,
  );
}

test("compiles planner-approved directions into exact deterministic mirror tasks", async () => {
  const input = await automaticRequest();
  const first = compileAutomaticSpriteWorkflow(input);
  const second = compileAutomaticSpriteWorkflow(input);
  const mirrors = tasksOf(first, "mirror-horizontal");

  assert.equal(first.analysis.disposition, "ready");
  assert.equal(first.request.policy.failOnDerivedDirections, true);
  assert.equal(first.requestSha256, second.requestSha256);
  assert.equal(
    first.supervisorWorkflow.workflowSha256,
    second.supervisorWorkflow.workflowSha256,
  );
  assert.equal(first.analysis.totals.derivedDirections, 1);
  assert.ok(first.analysis.totals.derivedFrames > 0);
  assert.equal(first.analysis.totals.mirrorJobs, mirrors.length);
  assert.ok(mirrors.length > 1);
  assert.ok(
    mirrors.every(
      (task) =>
        task.kind === "art.candidate.finalize-adaptive" &&
        task.queue === "media" &&
        task.requiredCapabilities.includes("media.sprite-mirror") &&
        task.payloadTemplate.policy.requireExactRoundTrip === true &&
        task.payloadTemplate.policy.preserveTransparentRgb === true,
    ),
  );

  const family = first.supervisorRequest.tasks.find(
    (task) => task.kind === "sprite.family.verify",
  );
  assert.ok(family);
  assert.equal(
    family.payloadTemplate.frames.length,
    first.request.spritePlan.frames.length,
  );
  assert.equal(
    family.payloadTemplate.metadata.deterministicMirroring.operation,
    "mirror-horizontal",
  );
  assert.equal(
    family.payloadTemplate.metadata.motionTopologySha256,
    first.motionTopology.topologySha256,
  );
  const derivedAirborneFrames = family.payloadTemplate.frames.filter(
    (frame) =>
      frame.animation === "jump-loop" &&
      first.request.spritePlan.directions.some(
        (direction) => !direction.authored && direction.name === frame.direction,
      ),
  );
  assert.ok(derivedAirborneFrames.length > 0);
  assert.equal(
    derivedAirborneFrames.every((frame) => frame.groundContact === false),
    true,
  );
  const derivedAirborneUnits = first.analysis.productionUnits.filter(
    (unit) =>
      unit.derivation?.kind === "horizontal-mirror" &&
      unit.clipId === "jump-loop",
  );
  assert.ok(derivedAirborneUnits.length > 0);
  assert.equal(
    derivedAirborneUnits.every(
      (unit) => unit.motion?.phase.groundContact === "airborne",
    ),
    true,
  );
  assert.ok(
    mirrors.every(
      (task) =>
        task.payloadTemplate.metadata.motionTopologySha256 ===
        first.motionTopology.topologySha256,
    ),
  );
  assert.ok(
    first.supervisorRequest.policy.requiredReleaseArtifactRoles.includes(
      "automatic.family-horizontal-mirror-proof-evidence",
    ),
  );
});

test("adaptive finalization retains both adaptive and mirror family proof roles", async () => {
  const workflow = await automaticRequest();
  const compiled = compileAutomaticSpriteFinalizationWorkflow({
    schemaVersion: "1.0",
    workflow,
    background: {
      mode: "auto",
      nativeAlphaAdapterIds: [],
      requireFakeTransparencyRejection: true,
      requireMeaningfulAlpha: true,
      proofBackgrounds: [
        "#000000",
        "#ffffff",
        "#808080",
        "#00ff00",
        "#ff00ff",
      ],
    },
    finalization: {
      deliveryProfileId: "godot-sprite-lossless",
      requireFamilyVerification: true,
      requireHostileMatteProof: true,
      requireNoRejectedArtifacts: true,
      requireExactDimensions: true,
      maximumDeterministicRepairPasses: 2,
      transparentBleedRadius: 2,
      matteSearchRadius: 6,
      matteDistanceThreshold: 72,
    },
  });
  const roles = compiled.supervisorRequest.policy.requiredReleaseArtifactRoles;
  assert.ok(roles.includes("automatic.family-adaptive-proof-evidence"));
  assert.ok(roles.includes("automatic.family-horizontal-mirror-proof-evidence"));
  assert.equal(
    compiled.analysis.base.totals.tasks,
    compiled.supervisorRequest.tasks.length,
  );
  assert.equal(
    compiled.request.workflow.policy.failOnDerivedDirections,
    true,
  );
  assert.equal(
    compiled.requestSha256,
    automaticSpriteFinalizationRequestSha256(compiled.request),
  );
  assert.ok(tasksOf(compiled, "mirror-horizontal").length > 0);
});

test("directional lighting cannot be mirrored without explicit style-owner review", async () => {
  const input = await automaticRequest();
  delete input.metadata.deterministicMirroring;
  assert.throws(
    () => compileAutomaticSpriteWorkflow(input),
    (error) =>
      error instanceof SpriteSupervisorError &&
      error.code === "AUTOMATIC_SPRITE_MIRROR_BLOCKED" &&
      error.details.blockers.some(
        (entry) =>
          entry.code ===
          "AUTOMATIC_SPRITE_MIRROR_LIGHTING_REVIEW_REQUIRED",
      ),
  );
});

test("readable text blocks deterministic reflection", async () => {
  const input = await automaticRequest();
  input.spritePlanRequest.artDirectionRequest.style.antiGeneric.prohibitReadableText =
    false;
  assert.throws(
    () => compileAutomaticSpriteWorkflow(input),
    (error) =>
      error instanceof SpriteSupervisorError &&
      error.code === "AUTOMATIC_SPRITE_MIRROR_BLOCKED" &&
      error.details.blockers.some(
        (entry) =>
          entry.code === "AUTOMATIC_SPRITE_MIRROR_READABLE_TEXT_UNSAFE",
      ),
  );
});

test("centred odd-width canvases retain an exact integer mirror pivot", async () => {
  const input = await automaticRequest();
  input.spritePlanRequest.artDirectionRequest.asset.dimensions.width = 63;
  const compiled = compileAutomaticSpriteWorkflow(input);
  const mirrors = tasksOf(compiled, "mirror-horizontal");
  assert.ok(mirrors.length > 0);
  assert.ok(
    mirrors.every(
      (task) =>
        task.payloadTemplate.expectedWidth === 63 &&
        task.payloadTemplate.pivot.x === 31,
    ),
  );
});
