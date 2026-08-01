import assert from "node:assert/strict";
import test from "node:test";

import {
  SpriteSupervisorError,
  canonicalSpriteSupervisorQueue,
  compileSpriteSupervisorWorkflow,
} from "../dist/index.js";

const IDENTITY = `artifact_${"a".repeat(64)}`;
const MASTER = `artifact_${"b".repeat(64)}`;

function request(queue = "provider") {
  return {
    schemaVersion: "1.0",
    runId: "queue-policy-run",
    spritePlanRequest: {
      schemaVersion: "1.0",
      planId: "queue-policy-plan",
      artDirectionRequest: {
        schemaVersion: "1.0",
        contractId: "queue-policy-style",
        presetId: "console-platformer-16bit",
        project: {
          projectId: "queue-policy-demo",
          title: "Queue Policy Demo",
          engine: "Godot",
          engineVersion: "4.6.2"
        },
        style: {
          references: [
            {
              id: "identity-reference",
              role: "identity",
              uri: "artifact://identity-reference",
              rights: "project-owned"
            }
          ]
        },
        asset: {
          assetId: "hero",
          family: "character",
          purpose: "Queue policy fixture.",
          dimensions: { width: 32, height: 32 },
          transparency: "required",
          animated: true,
          frameCount: 4,
          framesPerSecond: 8,
          directionCount: 2,
          directionNames: ["left", "right"]
        },
        outputProfileIds: ["godot-4.6.2-character-sprite"]
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
        includeGodotResources: false
      }
    },
    initialArtifactBindings: [
      { role: "canonical-identity", artifactIds: [IDENTITY] },
      { role: "release-master", artifactIds: [MASTER] }
    ],
    tasks: [
      {
        id: "generate",
        stage: "key-poses",
        title: "Generate one key pose",
        queue,
        kind: "art.candidate.generate",
        payloadTemplate: { schemaVersion: "1.0" },
        requiredCapabilities: ["provider.generate"]
      }
    ],
    policy: {
      requireAllPlanStagesCovered: false,
      requiredReleaseArtifactRoles: ["release-master"]
    }
  };
}

test("canonical queue catalogue follows existing worker topology", () => {
  assert.equal(canonicalSpriteSupervisorQueue("art.candidate.generate"), "provider");
  assert.equal(canonicalSpriteSupervisorQueue("art.candidate.master-alpha"), "media");
  assert.equal(canonicalSpriteSupervisorQueue("sprite.family.verify"), "selection");
  assert.equal(canonicalSpriteSupervisorQueue("sprite.atlas.build"), "media");
  assert.equal(canonicalSpriteSupervisorQueue("unknown"), null);
});

test("workflow compilation rejects a child kind on the wrong queue", () => {
  assert.throws(
    () => compileSpriteSupervisorWorkflow(request("control")),
    (error) =>
      error instanceof SpriteSupervisorError &&
      error.code === "SPRITE_SUPERVISOR_QUEUE_MISMATCH",
  );
});
