import assert from "node:assert/strict";
import test from "node:test";

import { compileAnimationProductionProfile } from "../tools/animation_production_profile_v1.mjs";
import {
  ANIMATION_PROVIDER_RUNTIME_BATCH_VERSION,
  compileAnimationProviderRuntimeBatch,
} from "../tools/animation_provider_runtime_adapter_v1.mjs";

const SHA = "a".repeat(64);

function request() {
  return {
    protocolVersion: "2026-08-30.3",
    kind: "animation-production-profile-request",
    id: "eva-female:test-motion",
    revision: 1,
    state: "review",
    title: "EVA test motion",
    action: "emote",
    direction: "camera",
    loop: false,
    durationSeconds: 1,
    sourceFramesPerSecond: 24,
    playbackFramesPerSecond: 60,
    detailLevel: "standard",
    mirrorPolicy: "forbidden",
    targets: ["cel-sequence"],
    subject: {
      subjectId: "eva-female",
      identityLockId: "eva-female-identity-lock",
      identityRevision: 1,
      identityReferenceArtifactId: `artifact_${SHA}`,
      silhouetteAnchors: ["canonical hair", "canonical body"],
      costumeAnchors: ["canonical costume"],
      propAnchors: [],
      asymmetricVisualAnchors: ["hair asymmetry"],
      anatomyRule: "Stable anatomy and five coherent fingers whenever visible.",
    },
    camera: {
      profileId: "eva-front-stage",
      perspective: "front-stage",
      projection: "orthographic",
      motion: "locked",
      yawDegrees: 0,
      pitchDegrees: 0,
      rollDegrees: 0,
      scale: 1,
      groundLineNormalized: 0.96,
      movementPlane: "screen plane",
      framing: "fixed full body front stage",
    },
    performance: {
      intent: "small controlled gesture",
      weight: "grounded",
      tempo: "authored holds and clear spacing",
      energy: 0.35,
      exaggeration: 0.25,
      continuityAnchors: ["face identity", "stable root"],
    },
    style: {
      styleId: "eva-canonical",
      styleRevision: 1,
      motionStyle: "cinematic-naturalistic",
      paletteLockId: "eva-palette",
      lineTreatment: "approved EVA raster finish",
      shapeLanguage: ["clean stable silhouette"],
      antiGenericTraits: ["specific EVA face"],
      exclusions: ["no camera drift", "no costume redesign"],
    },
    delivery: {
      canvas: { width: 1024, height: 1536 },
      alphaRequired: true,
      trim: false,
      pivot: { x: 0.5, y: 0.96 },
      textureFiltering: "linear",
      animationName: "eva-test-motion",
    },
    authoredPoseBeats: [
      {
        id: "start",
        phase: 0,
        generationClass: "key-pose",
        role: "hold",
        intent: "start anchor",
        contactAnchor: "both-feet",
        groundContactRequired: true,
        rootOffset: { x: 0, y: 0 },
      },
      {
        id: "apex",
        phase: 0.5,
        generationClass: "key-pose",
        role: "gesture",
        intent: "gesture apex",
        contactAnchor: "both-feet",
        groundContactRequired: true,
        rootOffset: { x: 0, y: 0 },
      },
      {
        id: "settle",
        phase: 0.85,
        generationClass: "breakdown",
        role: "settle",
        intent: "settle toward the final anchor",
        contactAnchor: "both-feet",
        groundContactRequired: true,
        rootOffset: { x: 0, y: 0 },
      },
    ],
    iteration: {
      maximumCandidatesPerKey: 2,
      maximumCandidatesPerBreakdown: 2,
      maximumCandidatesPerInbetween: 1,
      maximumAttemptsPerDrawing: 4,
      maximumReviewCycles: 6,
      maximumNoProgressCycles: 2,
      maximumBatchSize: 4,
    },
  };
}

function artifact(idChar) {
  return `artifact_${idChar.repeat(64)}`;
}

test("key-pose batch compiles directly against the immutable canonical identity", () => {
  const profile = compileAnimationProductionProfile(request(), new Date("2026-08-31T05:00:00.000Z"));
  const batch = profile.generationBatches.find((entry) => entry.phase === "key-pose");
  const compiled = compileAnimationProviderRuntimeBatch(profile, batch.id, { seedBase: 1200 });
  assert.equal(compiled.schema, ANIMATION_PROVIDER_RUNTIME_BATCH_VERSION);
  assert.equal(compiled.status, "ready");
  assert.equal(compiled.counts.ready, batch.drawingIds.length);
  for (const job of compiled.jobs) {
    assert.equal(job.contract.executionMode, "submit-runtime-job");
    assert.ok(job.contract.request.references.some((entry) => entry.role === "canonical-identity"));
    assert.equal(job.contract.request.operation, "generate");
    assert.equal(job.contract.request.target.transparency, "required");
  }
});

test("dependent drawing batch is blocked until all accepted bounding keys are content-addressed", () => {
  const profile = compileAnimationProductionProfile(request(), new Date("2026-08-31T05:00:00.000Z"));
  const batch = profile.generationBatches.find((entry) => entry.phase === "inbetween");
  const blocked = compileAnimationProviderRuntimeBatch(profile, batch.id);
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.jobs.length, 0);
  assert.ok(blocked.blocked.every((entry) => entry.code === "ANIMATION_PROVIDER_DEPENDENCY_ARTIFACT_MISSING"));

  const dependencies = Object.fromEntries(batch.dependencyDrawingIds.map((drawingId, index) => [
    drawingId,
    artifact(index % 2 === 0 ? "b" : "c"),
  ]));
  const ready = compileAnimationProviderRuntimeBatch(profile, batch.id, {
    acceptedDrawingArtifacts: dependencies,
    poseControlArtifacts: Object.fromEntries(batch.drawingIds.map((drawingId) => [drawingId, artifact("d")])),
  });
  assert.equal(ready.status, "ready");
  for (const job of ready.jobs) {
    const roles = job.contract.request.references.map((entry) => entry.role);
    assert.ok(roles.includes("canonical-identity"));
    assert.ok(roles.includes("previous-key-pose"));
    assert.ok(roles.includes("next-key-pose"));
    assert.ok(roles.includes("pose-control"));
  }
});

test("adapter never grants provider execution or promotion authority", () => {
  const profile = compileAnimationProductionProfile(request(), new Date("2026-08-31T05:00:00.000Z"));
  const batch = profile.generationBatches.find((entry) => entry.phase === "key-pose");
  const compiled = compileAnimationProviderRuntimeBatch(profile, batch.id);
  assert.deepEqual(compiled.authority, {
    providerExecution: false,
    automaticCreativeApproval: false,
    artifactPromotion: false,
    targetRepositoryMutation: false,
    gitCommit: false,
    gitPush: false,
    publication: false,
  });
});
