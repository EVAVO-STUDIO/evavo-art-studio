import assert from "node:assert/strict";
import test from "node:test";

import {
  SpriteSupervisorError,
  compileSpriteSupervisorWorkflow,
} from "../dist/index.js";

const IDENTITY = `artifact_${"a".repeat(64)}`;

function spritePlanRequest() {
  return {
    schemaVersion: "1.0",
    planId: "release-policy-plan",
    artDirectionRequest: {
      schemaVersion: "1.0",
      contractId: "release-policy-style",
      presetId: "console-platformer-16bit",
      project: {
        projectId: "release-policy-demo",
        title: "Release Policy Demo",
        engine: "Godot",
        engineVersion: "4.6.2",
      },
      style: {
        references: [
          {
            id: "identity-reference",
            role: "identity",
            uri: "artifact://identity-reference",
            rights: "project-owned",
          },
        ],
      },
      asset: {
        assetId: "hero",
        family: "character",
        purpose: "Release policy fixture.",
        dimensions: { width: 32, height: 32 },
        transparency: "required",
        animated: true,
        frameCount: 4,
        framesPerSecond: 8,
        directionCount: 2,
        directionNames: ["left", "right"],
      },
      outputProfileIds: ["godot-4.6.2-character-sprite"],
    },
    role: "playable-character",
    gameplayProfile: "platformer",
    coverage: "core",
    fidelity: "economical",
    output: {
      sheetStrategy: "individual-frames-only",
      maximumSheetSize: 1024,
      includeAsepriteExport: false,
      includePerClipSheets: false,
      includeFamilyAtlas: false,
      includeGodotResources: false,
    },
  };
}

function request(artifactRole) {
  return {
    schemaVersion: "1.0",
    runId: "release-policy-run",
    spritePlanRequest: spritePlanRequest(),
    initialArtifactBindings: [
      { role: "canonical-identity", artifactIds: [IDENTITY] },
    ],
    tasks: [
      {
        id: "candidate",
        stage: "key-poses",
        title: "Candidate task",
        queue: "provider",
        kind: "art.candidate.generate",
        payloadTemplate: { schemaVersion: "1.0" },
        requiredCapabilities: ["provider.generate"],
        outputBindings: [
          {
            role: "release-output",
            source: "output-artifact-labels",
            labels: { artifactRole },
            cardinality: "one",
          },
        ],
      },
    ],
    policy: {
      requireAllPlanStagesCovered: false,
      requiredReleaseArtifactRoles: ["release-output"],
    },
  };
}

test("source sprite-plan requests are expanded before workflow hashing", () => {
  const workflow = compileSpriteSupervisorWorkflow(
    request("selected-art-master"),
  );
  assert.equal(workflow.request.spritePlan.planId, "release-policy-plan");
  assert.equal(workflow.request.spritePlan.asset.assetId, "hero");
  assert.match(workflow.workflowSha256, /^[a-f0-9]{64}$/);
});

test("provider candidates cannot satisfy release artifact roles", () => {
  assert.throws(
    () => compileSpriteSupervisorWorkflow(request("provider-candidate")),
    (error) =>
      error instanceof SpriteSupervisorError &&
      error.code === "SPRITE_SUPERVISOR_RELEASE_BINDING_UNSAFE",
  );
});

test("at least one release artifact role is mandatory", () => {
  const input = request("selected-art-master");
  input.policy.requiredReleaseArtifactRoles = [];
  assert.throws(
    () => compileSpriteSupervisorWorkflow(input),
    (error) =>
      error instanceof SpriteSupervisorError &&
      error.code === "SPRITE_SUPERVISOR_RELEASE_ROLES_REQUIRED",
  );
});
