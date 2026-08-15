import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  SpriteSupervisorError,
  compileAutomaticSpriteFinalizationWorkflow,
} from "../dist/index.js";

const A = `artifact_${"a".repeat(64)}`;
const B = `artifact_${"b".repeat(64)}`;
const C = `artifact_${"c".repeat(64)}`;
const D = `artifact_${"d".repeat(64)}`;
const E = `artifact_${"e".repeat(64)}`;
const F = `artifact_${"f".repeat(64)}`;
const S = `artifact_${"0".repeat(64)}`;

async function automaticWorkflow() {
  return JSON.parse(
    await readFile(
      new URL("../../../examples/automatic-sprite-workflow.json", import.meta.url),
      "utf8",
    ),
  );
}

async function request(overrides = {}) {
  return {
    schemaVersion: "1.0",
    workflow: await automaticWorkflow(),
    background: {
      mode: "auto",
      nativeAlphaAdapterIds: [],
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
    },
    ...overrides,
  };
}

function candidateTasks(compiled) {
  return compiled.supervisorRequest.tasks.filter(
    (task) => task.kind === "art.candidate.generate",
  );
}

function masteringTasks(compiled) {
  return compiled.supervisorRequest.tasks.filter(
    (task) => task.kind === "art.candidate.master-alpha",
  );
}

test("auto background chooses a low-collision matte and blocks fake transparency", async () => {
  const input = await request();
  input.workflow.spritePlanRequest.artDirectionRequest.style.palette = {
    mode: "indexed",
    colours: ["#00ff00", "#00cc22", "#161616", "#f0f0f0"],
    maxColours: 32,
  };
  const compiled = compileAutomaticSpriteFinalizationWorkflow(input);
  assert.equal(compiled.analysis.background.resolvedMode, "chroma-key");
  assert.equal(compiled.analysis.background.matteColour, "#ff00ff");
  assert.equal(compiled.analysis.finalization.fakeTransparencyIsBlocking, true);
  assert.deepEqual(compiled.analysis.background.proofBackgrounds, [
    "#000000",
    "#ffffff",
    "#808080",
    "#00ff00",
    "#ff00ff",
  ]);
  const candidate = candidateTasks(compiled)[0];
  assert.equal(candidate.payloadTemplate.background.strategy, "chroma-key");
  assert.equal(candidate.payloadTemplate.background.matteColour, "#ff00ff");
  assert.match(candidate.payloadTemplate.negativeIntent, /checkerboard/i);
  const mastering = masteringTasks(compiled)[0];
  assert.equal(mastering.payloadTemplate.backgroundMode, "chroma-key");
  assert.ok(
    mastering.requiredCapabilities.includes("media.background-recovery"),
  );
  assert.equal(mastering.payloadTemplate.deliveryProfileId, "godot-sprite-lossless");
  assert.equal(mastering.payloadTemplate.requireFakeTransparencyRejection, true);
  assert.ok(
    compiled.supervisorRequest.policy.requiredReleaseArtifactRoles.includes(
      "automatic.family-finalization-evidence",
    ),
  );
});

test("native alpha requires an explicitly verified adapter", async () => {
  const input = await request({
    background: {
      mode: "native-alpha",
      nativeAlphaAdapterIds: [],
    },
  });
  assert.throws(
    () => compileAutomaticSpriteFinalizationWorkflow(input),
    (error) =>
      error instanceof SpriteSupervisorError &&
      error.code === "AUTOMATIC_SPRITE_BACKGROUND_ALPHA_ADAPTER_UNVERIFIED",
  );
});

test("black additive is rejected for ordinary character sprites", async () => {
  const input = await request({ background: { mode: "black-additive" } });
  assert.throws(
    () => compileAutomaticSpriteFinalizationWorkflow(input),
    (error) =>
      error instanceof SpriteSupervisorError &&
      error.code === "AUTOMATIC_SPRITE_BACKGROUND_BLACK_INVALID",
  );
});

test("automatic release rejects partial key-pose or in-between coverage", async () => {
  const input = await request();
  input.workflow.policy.includeInBetweens = false;
  assert.throws(
    () => compileAutomaticSpriteFinalizationWorkflow(input),
    (error) =>
      error instanceof SpriteSupervisorError &&
      error.code ===
        "AUTOMATIC_SPRITE_WORKFLOW_COMPLETE_FRAME_COVERAGE_REQUIRED",
  );
});

test("3d direction, depth, rig and camera references are bound immutably", async () => {
  const input = await request({
    threeDReference: {
      repository: "EVAVO-STUDIO/evavo-3d-studio",
      revision: "4b765f9acd97b36e0ae2c5aef2ea9db1c1134a6b",
      renderRigArtifactId: A,
      cameraManifestArtifactId: B,
      materialReferenceArtifactId: C,
      turntableArtifactIds: [D],
      directionReferenceArtifactIds: { left: E, right: F },
      depthReferenceArtifactIds: { left: D, right: C },
      notes: ["Orthographic render rig remains fixed."],
    },
  });
  const compiled = compileAutomaticSpriteFinalizationWorkflow(input);
  assert.equal(compiled.analysis.threeD.enabled, true);
  assert.deepEqual(compiled.analysis.threeD.missingDirectionReferences, []);
  assert.equal(
    compiled.analysis.threeD.repository,
    "EVAVO-STUDIO/evavo-3d-studio",
  );
  const left = candidateTasks(compiled).find(
    (task) => task.payloadTemplate.shot.direction === "left",
  );
  assert.ok(left);
  assert.ok(
    left.requiredArtifactRoles.includes("automatic.3d.direction.left"),
  );
  assert.ok(
    left.requiredArtifactRoles.includes("automatic.3d.camera-manifest"),
  );
  assert.ok(
    left.payloadTemplate.references.some(
      (entry) => entry.role === "pose-control",
    ),
  );
  assert.ok(
    left.payloadTemplate.references.some(
      (entry) => entry.role === "depth-control",
    ),
  );
  const family = compiled.supervisorRequest.tasks.find(
    (task) => task.kind === "sprite.family.verify",
  );
  assert.equal(
    family.payloadTemplate.metadata.automaticFinalization.threeD.repository,
    "EVAVO-STUDIO/evavo-3d-studio",
  );
  assert.ok(family.staticInputArtifacts.includes(A));
  assert.ok(family.staticInputArtifacts.includes(B));
  assert.ok(family.staticInputArtifacts.includes(E));
});

test("layer in-betweens keep current body separate from neighbouring key poses", async () => {
  const input = await request();
  input.workflow.spritePlanRequest.artDirectionRequest.asset.independentShadow = true;
  input.workflow.references.layerReferenceArtifactIds = { shadow: S };
  const compiled = compileAutomaticSpriteFinalizationWorkflow(input);
  const task = candidateTasks(compiled).find(
    (entry) =>
      entry.payloadTemplate.assetKind === "sprite-layer" &&
      entry.payloadTemplate.continuityPhase === "in-between",
  );
  assert.ok(task);
  const references = Object.fromEntries(
    task.payloadTemplate.references
      .filter((entry) =>
        ["base-image", "previous-key-pose", "next-key-pose"].includes(
          entry.role,
        ),
      )
      .map((entry) => [entry.role, entry.artifactId.$artifact]),
  );
  assert.ok(references["base-image"]);
  assert.ok(references["previous-key-pose"]);
  assert.ok(references["next-key-pose"]);
  assert.notEqual(references["base-image"], references["previous-key-pose"]);
  assert.notEqual(references["base-image"], references["next-key-pose"]);
  assert.notEqual(
    references["previous-key-pose"],
    references["next-key-pose"],
  );
});

test("3d references without full direction coverage require named review", async () => {
  const input = await request({
    threeDReference: {
      repository: "EVAVO-STUDIO/evavo-3d-studio",
      revision: "4b765f9acd97b36e0ae2c5aef2ea9db1c1134a6b",
      directionReferenceArtifactIds: { left: E },
    },
  });
  const compiled = compileAutomaticSpriteFinalizationWorkflow(input);
  assert.deepEqual(compiled.analysis.threeD.missingDirectionReferences, ["right"]);
  assert.equal(
    compiled.supervisorRequest.policy.requireFinalHumanApproval,
    true,
  );
});
