import assert from "node:assert/strict";
import test from "node:test";

import { compileSpriteProductionPlan } from "@evavo/art-sprite-planner";
import {
  applySpriteSupervisorReviewResolutions,
  compileSpriteSupervisorWorkflow,
  createInitialSpriteSupervisorState,
} from "../dist/index.js";

const IDENTITY = `artifact_${"a".repeat(64)}`;

function plan() {
  return compileSpriteProductionPlan({
    schemaVersion: "1.0",
    planId: "reviewed-task-plan",
    artDirectionRequest: {
      schemaVersion: "1.0",
      contractId: "reviewed-task-style",
      presetId: "console-platformer-16bit",
      project: {
        projectId: "reviewed-task-demo",
        title: "Reviewed Task Demo",
        engine: "Godot",
        engineVersion: "4.6.2",
      },
      style: {
        references: [
          {
            id: "identity",
            role: "identity",
            uri: "artifact://identity",
            rights: "project-owned",
          },
        ],
      },
      asset: {
        assetId: "hero",
        family: "character",
        purpose: "Review resume fixture.",
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
  });
}

function request(reviewResolutions = []) {
  return {
    schemaVersion: "1.0",
    runId: "reviewed-task-run",
    spritePlan: plan(),
    initialArtifactBindings: [
      { role: "canonical-identity", artifactIds: [IDENTITY] },
    ],
    tasks: [
      {
        id: "generate-frame",
        stage: "key-poses",
        title: "Generate frame",
        queue: "provider",
        kind: "art.candidate.generate",
        payloadTemplate: { schemaVersion: "1.0" },
        requiredCapabilities: ["provider.generate"],
        requiredArtifactRoles: ["canonical-identity"],
        outputBindings: [
          {
            role: "release-frame",
            source: "output-artifact-labels",
            labels: {
              artifactRole: "selected-art-master",
              approvalState: "selected",
              qualityState: "passed",
            },
          },
        ],
      },
    ],
    policy: {
      requireAllPlanStagesCovered: false,
      requireFinalHumanApproval: true,
      requiredReleaseArtifactRoles: ["release-frame"],
    },
    reviewResolutions,
  };
}

test("task retry resumes production even when final human approval is required", () => {
  const workflow = compileSpriteSupervisorWorkflow(
    request([
      {
        resolutionId: "retry-frame-001",
        expectedStateTick: 3,
        taskId: "generate-frame",
        action: "retry",
        approver: "Greg Parker",
        reason: "The evidence is repairable; rerun only this bounded task.",
      },
    ]),
  );
  const initial = createInitialSpriteSupervisorState(
    workflow.request,
    workflow.workflowSha256,
  );
  const reviewed = {
    ...initial,
    status: "review-required",
    tick: 3,
    taskStates: {
      ...initial.taskStates,
      "generate-frame": {
        ...initial.taskStates["generate-frame"],
        status: "review-required",
        reviewReason: "Ambiguous frame evidence.",
      },
    },
  };
  const resumed = applySpriteSupervisorReviewResolutions(
    workflow.request,
    reviewed,
  );
  assert.equal(resumed.status, "running");
  assert.equal(resumed.taskStates["generate-frame"].status, "pending");
  assert.equal(resumed.taskStates["generate-frame"].cycle, 1);
  assert.equal(resumed.releaseApprovedBy, undefined);
  assert.equal(resumed.appliedReviewResolutions.length, 1);
});
