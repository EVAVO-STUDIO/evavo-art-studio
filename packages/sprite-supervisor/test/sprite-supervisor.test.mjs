import assert from "node:assert/strict";
import test from "node:test";

import { compileSpriteProductionPlan } from "@evavo/art-sprite-planner";

import {
  SpriteSupervisorError,
  applySpriteSupervisorReviewResolutions,
  compileSpriteSupervisorWorkflow,
  createInitialSpriteSupervisorState,
  decideSpriteSupervisorFailure,
  materializeSupervisorChildSubmission,
  materializeSupervisorTaskPayload,
  supervisorTaskReady,
  validateSpriteSupervisorCompileRequest,
} from "../dist/index.js";

const IDENTITY = `artifact_${"a".repeat(64)}`;
const CANDIDATE = `artifact_${"b".repeat(64)}`;

function spritePlan() {
  return compileSpriteProductionPlan({
    schemaVersion: "1.0",
    planId: "hero-complete-production",
    artDirectionRequest: {
      schemaVersion: "1.0",
      contractId: "hero-style",
      presetId: "console-platformer-16bit",
      project: {
        projectId: "demo-game",
        title: "Demo Game",
        engine: "Godot",
        engineVersion: "4.6.2",
        gameGenre: "platform action game",
        targetPlatform: "desktop",
      },
      style: {
        references: [
          {
            id: "hero-reference",
            role: "identity",
            uri: "artifact://hero-reference",
            rights: "project-owned",
          },
        ],
      },
      asset: {
        assetId: "hero",
        family: "character",
        purpose: "Playable hero sprite family.",
        dimensions: { width: 64, height: 64 },
        transparency: "required",
        animated: true,
        frameCount: 8,
        framesPerSecond: 8,
        loop: true,
        directionCount: 2,
        directionNames: ["left", "right"],
        asymmetric: true,
        independentShadow: true,
        needsCollision: true,
      },
      outputProfileIds: ["godot-4.6.2-character-sprite"],
    },
    role: "playable-character",
    gameplayProfile: "platformer",
    coverage: "core",
    fidelity: "economical",
    allowDerivedMirrors: false,
    variants: {
      costumeVariants: 1,
      equipmentVariants: 1,
      weaponVariants: 1,
      teamColourVariants: 1,
      damageVariants: 1,
    },
    output: {
      sheetStrategy: "individual-frames-only",
      maximumSheetSize: 2048,
      includeAsepriteExport: true,
      includePerClipSheets: false,
      includeFamilyAtlas: false,
      includeGodotResources: false,
    },
  });
}

function request(overrides = {}) {
  return {
    schemaVersion: "1.0",
    runId: "hero-supervision-run",
    spritePlan: spritePlan(),
    initialArtifactBindings: [
      { role: "canonical-identity", artifactIds: [IDENTITY] },
      { role: "release-master", artifactIds: [CANDIDATE] },
    ],
    tasks: [
      {
        id: "generate-idle",
        stage: "key-poses",
        title: "Generate idle key pose",
        queue: "provider",
        kind: "art.candidate.generate",
        payloadTemplate: {
          schemaVersion: "1.0",
          operation: "generate",
          assetKind: "sprite-frame",
          continuityPhase: "key-pose",
          assetId: { $plan: "/asset/assetId" },
          candidateFamilyId: "hero-idle-left",
          frameId: "idle-left-000",
          creativeIntent: "Create one stable idle key pose.",
          style: {
            styleName: "compiled",
            intent: "follow the bound art direction",
          },
          shot: { subject: "approved hero", direction: "left" },
          target: {
            width: { $plan: "/asset/dimensions/width" },
            height: { $plan: "/asset/dimensions/height" },
            transparency: "required",
          },
          references: [
            {
              artifactId: { $artifact: "canonical-identity" },
              role: "canonical-identity",
            },
          ],
        },
        requiredCapabilities: [
          "provider.generate",
          "provider.reference-lock",
          "provider.candidate-store",
          "evidence.bundle",
        ],
        requiredArtifactRoles: ["canonical-identity"],
        outputBindings: [
          {
            role: "idle-key-pose",
            source: "output-artifact-labels",
            labels: { artifactRole: "provider-candidate" },
            cardinality: "one",
          },
        ],
        failurePolicy: {
          redriveClassifications: ["transient"],
          maxRedrives: 1,
          repairTaskId: "repair-idle",
          maxRepairCycles: 1,
          reviewOnUnclassified: true,
        },
      },
      {
        id: "repair-idle",
        stage: "key-poses",
        title: "Repair failed idle key pose",
        queue: "selection",
        kind: "art.repair.plan",
        payloadTemplate: {
          schemaVersion: "1.0",
          repairId: "idle-repair",
          familyEvidenceArtifactId: { $artifact: "family-evidence" },
          target: { frameId: "idle-left-000" },
          intent: "Repair only the failed evidence.",
        },
        requiredCapabilities: [
          "repair.plan",
          "artifacts.store",
          "evidence.bundle",
        ],
        requiredArtifactRoles: ["family-evidence"],
        triggeredByFailureOfTaskId: "generate-idle",
        required: false,
      },
    ],
    policy: {
      requireAllPlanStagesCovered: false,
      requiredReleaseArtifactRoles: ["release-master"],
      defaultMaximumRedrives: 1,
      defaultMaximumRepairCycles: 1,
      requireFinalHumanApproval: true,
    },
    ...overrides,
  };
}

function finalReviewState(workflow, tick = 4) {
  const initial = createInitialSpriteSupervisorState(
    workflow.request,
    workflow.workflowSha256,
    new Date("2026-08-01T00:00:00.000Z"),
  );
  return {
    ...initial,
    status: "review-required",
    tick,
    taskStates: {
      ...initial.taskStates,
      "generate-idle": {
        ...initial.taskStates["generate-idle"],
        status: "succeeded",
      },
    },
  };
}

function releaseResolution(expectedStateTick = 4, overrides = {}) {
  return {
    resolutionId: "release-review-001",
    expectedStateTick,
    taskId: "$release",
    action: "approve-release",
    approver: "Greg Parker",
    reason: "Reviewed complete release evidence.",
    artifactBindings: [
      { role: "idle-key-pose", artifactIds: [CANDIDATE] },
    ],
    ...overrides,
  };
}

test("compiles deterministic root supervision jobs", () => {
  const normalized = validateSpriteSupervisorCompileRequest(request());
  assert.deepEqual(validateSpriteSupervisorCompileRequest(normalized), normalized);
  const first = compileSpriteSupervisorWorkflow(request());
  const second = compileSpriteSupervisorWorkflow(request());
  assert.equal(first.requestSha256, second.requestSha256);
  assert.equal(first.workflowSha256, second.workflowSha256);
  assert.equal(first.rootJob.kind, "art.sprite-production.supervise");
  assert.deepEqual(first.rootJob.requiredCapabilities, [
    "sprite.supervisor.run",
    "runtime.jobs",
    "artifacts.store",
    "evidence.bundle",
  ]);
  assert.ok(first.rootJob.inputArtifacts.includes(IDENTITY));
  assert.ok(first.rootJob.inputArtifacts.includes(CANDIDATE));
});

test("only output-artifact label selectors may normalize an empty pointer", () => {
  const invalid = request();
  invalid.tasks[0].outputBindings[0] = {
    role: "idle-key-pose",
    source: "runtime-result-json",
    labels: {},
    pointer: "",
    cardinality: "one",
  };
  assert.throws(
    () => validateSpriteSupervisorCompileRequest(invalid),
    (error) =>
      error instanceof SpriteSupervisorError &&
      error.code === "SPRITE_SUPERVISOR_REQUEST_INVALID" &&
      error.message.includes("pointer"),
  );
});

test("review submissions retain workflow identity but receive a new request identity", () => {
  const base = compileSpriteSupervisorWorkflow(request());
  const reviewed = compileSpriteSupervisorWorkflow(
    request({ reviewResolutions: [releaseResolution()] }),
  );
  assert.equal(reviewed.workflowSha256, base.workflowSha256);
  assert.notEqual(reviewed.requestSha256, base.requestSha256);
  assert.notEqual(reviewed.rootJob.idempotencyKey, base.rootJob.idempotencyKey);
  assert.equal(reviewed.rootJob.payload.requestSha256, reviewed.requestSha256);
});

test("materialises plan, run and artifact placeholders without losing lineage", () => {
  const workflow = compileSpriteSupervisorWorkflow(request());
  const state = createInitialSpriteSupervisorState(
    workflow.request,
    workflow.workflowSha256,
    new Date("2026-08-01T00:00:00.000Z"),
  );
  const task = workflow.request.tasks[0];
  const payload = materializeSupervisorTaskPayload(workflow.request, state, task);
  assert.equal(payload.assetId, "hero");
  assert.equal(payload.target.width, 64);
  assert.equal(payload.references[0].artifactId, IDENTITY);
  assert.equal(supervisorTaskReady(workflow.request, state, task), true);
  const child = materializeSupervisorChildSubmission(
    workflow.request,
    state,
    task,
  );
  assert.equal(child.idempotencyKey, "hero-supervision-run:generate-idle:cycle-0");
  assert.deepEqual(child.inputArtifacts, [IDENTITY]);
  assert.deepEqual(child.requiredCapabilityProfile, [
    "cancellation",
    "candidate-count",
    "generate",
    "identity-reference",
    "reference-images",
  ]);
});

test("redrives transient work, then routes repair, then requires review", () => {
  const workflow = compileSpriteSupervisorWorkflow(request());
  const task = workflow.request.tasks[0];
  const initial = createInitialSpriteSupervisorState(
    workflow.request,
    workflow.workflowSha256,
  ).taskStates[task.id];
  assert.equal(
    decideSpriteSupervisorFailure(task, initial, {
      classification: "transient",
      code: "PROVIDER_TEMPORARY_FAILURE",
      message: "temporary",
    }).action,
    "redrive",
  );
  const afterRedrive = { ...initial, redrives: 1 };
  assert.equal(
    decideSpriteSupervisorFailure(task, afterRedrive, {
      classification: "permanent",
      code: "SPRITE_FAMILY_BLOCKING_GATES_FAILED",
      message: "repairable",
    }).action,
    "repair",
  );
  const afterRepair = { ...afterRedrive, repairCycles: 1 };
  assert.equal(
    decideSpriteSupervisorFailure(task, afterRepair, {
      classification: "permanent",
      code: "SPRITE_FAMILY_BLOCKING_GATES_FAILED",
      message: "exhausted",
    }).action,
    "review",
  );
});

test("applies a one-time release approval only to the exact final review state", () => {
  const reviewedRequest = request({
    reviewResolutions: [releaseResolution()],
  });
  const workflow = compileSpriteSupervisorWorkflow(reviewedRequest);
  const state = finalReviewState(workflow);
  const applied = applySpriteSupervisorReviewResolutions(
    workflow.request,
    state,
    new Date("2026-08-01T01:00:00.000Z"),
  );
  assert.equal(applied.status, "running");
  assert.equal(applied.releaseApprovedBy?.approver, "Greg Parker");
  assert.equal(applied.releaseApprovedBy?.resolutionId, "release-review-001");
  assert.ok(applied.artifactBindings["idle-key-pose"].includes(CANDIDATE));
  assert.equal(applied.appliedReviewResolutions.length, 1);

  const replayed = applySpriteSupervisorReviewResolutions(
    workflow.request,
    applied,
    new Date("2026-08-01T01:01:00.000Z"),
  );
  assert.equal(replayed.appliedReviewResolutions.length, 1);
  assert.equal(
    replayed.decisions.filter((entry) => entry.action === "apply-review").length,
    1,
  );
});

test("rejects premature, stale and conflicting review commands", () => {
  const reviewed = compileSpriteSupervisorWorkflow(
    request({ reviewResolutions: [releaseResolution()] }),
  );
  const initial = createInitialSpriteSupervisorState(
    reviewed.request,
    reviewed.workflowSha256,
  );
  assert.throws(
    () => applySpriteSupervisorReviewResolutions(reviewed.request, initial),
    (error) =>
      error instanceof SpriteSupervisorError &&
      error.code === "SPRITE_SUPERVISOR_REVIEW_STATE_STALE",
  );

  const staleWorkflow = compileSpriteSupervisorWorkflow(
    request({ reviewResolutions: [releaseResolution(3)] }),
  );
  assert.throws(
    () =>
      applySpriteSupervisorReviewResolutions(
        staleWorkflow.request,
        finalReviewState(staleWorkflow, 4),
      ),
    (error) =>
      error instanceof SpriteSupervisorError &&
      error.code === "SPRITE_SUPERVISOR_REVIEW_STATE_STALE",
  );

  const applied = applySpriteSupervisorReviewResolutions(
    reviewed.request,
    finalReviewState(reviewed),
  );
  const conflicting = compileSpriteSupervisorWorkflow(
    request({
      reviewResolutions: [
        releaseResolution(4, { reason: "Different command content." }),
      ],
    }),
  );
  assert.throws(
    () => applySpriteSupervisorReviewResolutions(conflicting.request, applied),
    (error) =>
      error instanceof SpriteSupervisorError &&
      error.code === "SPRITE_SUPERVISOR_REVIEW_ID_CONFLICT",
  );
});

test("rejects secrets and attempts to weaken quality policy", () => {
  assert.throws(
    () => validateSpriteSupervisorCompileRequest(request({ apiKey: "secret" })),
    (error) =>
      error instanceof SpriteSupervisorError &&
      error.code === "SPRITE_SUPERVISOR_SECRET_FIELD_REJECTED",
  );
  const unsafe = request();
  unsafe.tasks[0].payloadTemplate.disableGate = true;
  assert.throws(
    () => validateSpriteSupervisorCompileRequest(unsafe),
    (error) =>
      error instanceof SpriteSupervisorError &&
      error.code === "SPRITE_SUPERVISOR_QUALITY_BYPASS_REJECTED",
  );
});

test("rejects uncovered production stages when completeness is required", () => {
  const incomplete = request();
  incomplete.policy.requireAllPlanStagesCovered = true;
  assert.throws(
    () => validateSpriteSupervisorCompileRequest(incomplete),
    (error) =>
      error instanceof SpriteSupervisorError &&
      error.code === "SPRITE_SUPERVISOR_PLAN_STAGE_UNCOVERED",
  );
});

test("rejects incomplete review command contracts", () => {
  const unsafe = request({
    reviewResolutions: [
      {
        taskId: "$release",
        action: "approve-release",
        approver: "Greg Parker",
        reason: "Missing state binding.",
      },
    ],
  });
  assert.throws(
    () => validateSpriteSupervisorCompileRequest(unsafe),
    (error) =>
      error instanceof SpriteSupervisorError &&
      error.code === "SPRITE_SUPERVISOR_REQUEST_INVALID",
  );
});

test("rejects arbitrary child job kinds and dependency cycles", () => {
  const unsafe = request();
  unsafe.tasks[0].kind = "shell.execute";
  assert.throws(
    () => validateSpriteSupervisorCompileRequest(unsafe),
    (error) =>
      error instanceof SpriteSupervisorError &&
      error.code === "SPRITE_SUPERVISOR_CHILD_KIND_REJECTED",
  );

  const cyclic = request();
  cyclic.tasks[0].dependencyTaskIds = ["repair-idle"];
  cyclic.tasks[1].dependencyTaskIds = ["generate-idle"];
  assert.throws(
    () => validateSpriteSupervisorCompileRequest(cyclic),
    (error) =>
      error instanceof SpriteSupervisorError &&
      error.code === "SPRITE_SUPERVISOR_TASK_DEPENDENCY_CYCLE",
  );
});
