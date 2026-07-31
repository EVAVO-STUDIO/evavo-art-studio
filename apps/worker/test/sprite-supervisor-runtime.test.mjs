import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import {
  LocalRuntimeRepository,
  PermanentRuntimeError,
  RuntimeWorker,
} from "@evavo/art-runtime";
import { compileSpriteSupervisorWorkflow } from "@evavo/art-sprite-supervisor";

import { createBuiltinHandlers } from "../dist/index.js";
import { spriteSupervisorWorkerCapabilities } from "../dist/sprite-supervisor-handlers.js";

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function spritePlanRequest() {
  return {
    schemaVersion: "1.0",
    planId: "runtime-hero-plan",
    artDirectionRequest: {
      schemaVersion: "1.0",
      contractId: "runtime-hero-style",
      presetId: "console-platformer-16bit",
      project: {
        projectId: "runtime-demo",
        title: "Runtime Demo",
        engine: "Godot",
        engineVersion: "4.6.2",
        gameGenre: "platform action game",
        targetPlatform: "desktop",
      },
      style: {
        references: [
          {
            id: "runtime-hero-reference",
            role: "identity",
            uri: "artifact://runtime-hero-reference",
            rights: "project-owned",
          },
        ],
      },
      asset: {
        assetId: "runtime-hero",
        family: "character",
        purpose: "Runtime supervisor fixture.",
        dimensions: { width: 64, height: 64 },
        transparency: "required",
        animated: true,
        frameCount: 4,
        framesPerSecond: 8,
        loop: true,
        directionCount: 2,
        directionNames: ["left", "right"],
        asymmetric: true,
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
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-sprite-supervisor-"));
  const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
  const artifacts = new LocalArtifactStore({ root: path.join(root, "artifacts") });
  const identity = await artifacts.put("identity-source", {
    mediaType: "image/png",
    storageClass: "master",
    fileName: "identity.png",
    labels: {
      artifactRole: "canonical-identity",
      approvalState: "selected",
      qualityState: "passed",
      finalDeliverable: "false",
    },
  });
  return { root, runtime, artifacts, identity };
}

function request(identityArtifactId, options = {}) {
  return {
    schemaVersion: "1.0",
    runId: options.runId ?? "runtime-supervisor-run",
    spritePlanRequest: spritePlanRequest(),
    initialArtifactBindings: [
      {
        role: "canonical-identity",
        artifactIds: [identityArtifactId],
      },
    ],
    tasks: [
      {
        id: "produce-master",
        stage: "key-poses",
        title: "Produce selected sprite master",
        queue: "provider",
        kind: "art.candidate.generate",
        payloadTemplate: {
          schemaVersion: "1.0",
          operation: "generate",
          assetKind: "sprite-frame",
          continuityPhase: "key-pose",
          assetId: { $plan: "/asset/assetId" },
          candidateFamilyId: "runtime-hero-idle",
          frameId: "idle-left-000",
          creativeIntent: "Create one stable key pose.",
          style: {
            styleName: "compiled",
            intent: "follow the bound plan",
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
            role: "selected-master",
            source: "output-artifact-labels",
            labels: { artifactRole: "selected-art-master" },
            cardinality: "one",
          },
        ],
        maximumAttempts: 1,
        failurePolicy: {
          maxRedrives: 0,
          ...(options.repair
            ? {
                repairTaskId: "repair-master",
                maxRepairCycles: 1,
              }
            : {}),
          reviewOnUnclassified: true,
        },
      },
      ...(options.repair
        ? [
            {
              id: "repair-master",
              stage: "key-poses",
              title: "Repair failed master",
              queue: "selection",
              kind: "art.repair.plan",
              payloadTemplate: {
                schemaVersion: "1.0",
                repairId: "runtime-master-repair",
                familyEvidenceArtifactId: {
                  $artifact: "canonical-identity",
                },
                target: { frameId: "idle-left-000" },
                intent: "Repair only the failed frame.",
              },
              requiredCapabilities: [
                "repair.plan",
                "artifacts.store",
                "evidence.bundle",
              ],
              requiredArtifactRoles: ["canonical-identity"],
              triggeredByFailureOfTaskId: "produce-master",
              required: false,
              maximumAttempts: 1,
            },
          ]
        : []),
    ],
    policy: {
      tickDelayMs: 250,
      maximumTicks: 50,
      maximumActiveChildren: 4,
      requireAllPlanStagesCovered: false,
      requireFinalHumanApproval: false,
      requiredReleaseArtifactRoles: ["selected-master"],
    },
  };
}

async function runUntilSupervisorTerminal(worker, runtime, runId) {
  for (let cycle = 0; cycle < 40; cycle += 1) {
    await worker.runOnce();
    const roots = await runtime.list({
      kinds: ["art.sprite-production.supervise"],
      limit: 100,
    });
    const terminalResult = roots
      .flatMap((job) => job.outputArtifacts)
      .length > 0;
    const active = roots.some((job) =>
      ["waiting", "queued", "leased", "running", "retry-wait"].includes(job.state),
    );
    if (terminalResult && !active) return;
    await delay(275);
  }
  assert.fail(`Supervisor ${runId} did not become terminal within the fixture budget.`);
}

async function stateFor(artifacts, runId) {
  const reference = await artifacts.resolveReference(
    "sprite-supervisor/runtime-demo",
    runId,
  );
  assert.ok(reference);
  return JSON.parse((await artifacts.read(reference.artifactId)).toString("utf8"));
}

function workerFor(runtime, artifacts, childHandlers) {
  return new RuntimeWorker({
    runtime,
    artifacts,
    worker: {
      id: "sprite-supervisor-fixture-worker",
      queues: ["control", "provider", "selection"],
      capabilities: [
        ...spriteSupervisorWorkerCapabilities(),
        "provider.generate",
        "provider.reference-lock",
        "provider.candidate-store",
        "repair.plan",
        "artifacts.store",
        "evidence.bundle",
      ],
    },
    handlers: {
      ...createBuiltinHandlers([], undefined, runtime),
      ...childHandlers,
    },
    concurrency: 1,
  });
}

test("supervisor persists state, schedules a child and emits verified release evidence", async () => {
  const fx = await fixture();
  try {
    const workflow = compileSpriteSupervisorWorkflow(request(fx.identity.artifactId));
    let childCalls = 0;
    const generate = async (context) => {
      childCalls += 1;
      const master = await context.putArtifact("selected-master", {
        mediaType: "image/png",
        storageClass: "master",
        fileName: "runtime-hero.selected-master.png",
        labels: {
          artifactRole: "selected-art-master",
          approvalState: "selected",
          qualityState: "passed",
          finalDeliverable: "false",
        },
      });
      return {
        outputArtifacts: [master.artifactId],
        result: { masterArtifactId: master.artifactId },
      };
    };
    const worker = workerFor(fx.runtime, fx.artifacts, {
      "art.candidate.generate": generate,
    });
    await fx.runtime.submit(workflow.rootJob, "test");
    await runUntilSupervisorTerminal(worker, fx.runtime, workflow.runId);

    const state = await stateFor(fx.artifacts, workflow.runId);
    assert.equal(state.status, "succeeded");
    assert.equal(state.taskStates["produce-master"].status, "succeeded");
    assert.equal(childCalls, 1);
    assert.match(state.releaseEvidenceArtifactId, /^artifact_[a-f0-9]{64}$/);
    const releaseVerification = await fx.artifacts.verify(
      state.releaseEvidenceArtifactId,
    );
    assert.equal(releaseVerification.descriptorValid, true);
    assert.equal(releaseVerification.contentValid, true);
    assert.ok(state.decisions.some((entry) => entry.action === "complete"));
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});

test("supervisor routes a permanent failure through one repair and retries only the failed task", async () => {
  const fx = await fixture();
  try {
    const workflow = compileSpriteSupervisorWorkflow(
      request(fx.identity.artifactId, {
        runId: "runtime-supervisor-repair-run",
        repair: true,
      }),
    );
    let generationCalls = 0;
    let repairCalls = 0;
    const generate = async (context) => {
      generationCalls += 1;
      if (generationCalls === 1) {
        throw new PermanentRuntimeError(
          "SPRITE_FAMILY_BLOCKING_GATES_FAILED",
          "The first candidate failed family consistency.",
          { failedFrameId: "idle-left-000" },
        );
      }
      const master = await context.putArtifact("repaired-selected-master", {
        mediaType: "image/png",
        storageClass: "master",
        fileName: "runtime-hero.repaired.selected-master.png",
        labels: {
          artifactRole: "selected-art-master",
          approvalState: "selected",
          qualityState: "passed",
          finalDeliverable: "false",
        },
      });
      return { outputArtifacts: [master.artifactId] };
    };
    const repair = async () => {
      repairCalls += 1;
      return { result: { repaired: true } };
    };
    const worker = workerFor(fx.runtime, fx.artifacts, {
      "art.candidate.generate": generate,
      "art.repair.plan": repair,
    });
    await fx.runtime.submit(workflow.rootJob, "test");
    await runUntilSupervisorTerminal(worker, fx.runtime, workflow.runId);

    const state = await stateFor(fx.artifacts, workflow.runId);
    assert.equal(state.status, "succeeded");
    assert.equal(generationCalls, 2);
    assert.equal(repairCalls, 1);
    assert.equal(state.taskStates["produce-master"].repairCycles, 1);
    assert.ok(state.decisions.some((entry) => entry.action === "route-repair"));
    assert.ok(
      state.decisions.some((entry) => entry.action === "retry-after-repair"),
    );
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});
