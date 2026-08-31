import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { compileEvaCanonicalProfileBundle } from "../tools/eva_avatar_canonical_profile_adapter_v1.mjs";
import {
  EVA_IDLE_SOURCE_MATERIALIZATION_REQUEST_VERSION,
  EVA_IDLE_SOURCE_REVIEW_BRIDGE_VERSION,
  compileEvaIdleSourceMaterializationRequest,
  compileEvaIdleSourceReviewBridge,
} from "../tools/eva_idle_source_review_bridge_v1.mjs";

const rawSha = (char) => char.repeat(64);
const sha = (char) => `sha256:${rawSha(char)}`;
const artifact = (char) => `artifact_${rawSha(char)}`;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}
function rawDigest(value) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function idleProfileEntry() {
  const suite = {
    schema: "evavo.project-art-avatar-animation-suite-plan.v3",
    characterId: "eva-female",
    compiledAt: "2026-08-31T08:00:00.000Z",
    planSha256: rawSha("9"),
    targetCanvas: { width: 1024, height: 1536 },
    animationIdentityMaster: {
      asset: {
        path: "assets/eva-female/candidates/eva-female-animation-master-v1.alpha.png",
        width: 1024,
        height: 1536,
        sha256: rawSha("1"),
      },
    },
    clips: [
      {
        id: "idle-primary",
        kind: "idle",
        loopMode: "loop",
        targetFrames: 36,
        fps: 24,
        performance: "quiet neutral breathing",
      },
    ],
  };
  const bundle = compileEvaCanonicalProfileBundle(suite, {
    generatedAt: "2026-08-31T08:05:00.000Z",
    state: "approved",
  });
  return bundle.bodyProfiles[0];
}

function quality(score) {
  return {
    identity: score,
    anatomy: score,
    hands: score,
    alpha: score,
    registration: score,
    continuity: score,
  };
}

function sourceContracts() {
  const reconciliation = {
    schema: "evavo_eva_source_reconciliation_v1",
    characterId: "eva-female",
    decisions: [
      {
        frameId: "eva-frame-neutral",
        sourceSha256: rawSha("2"),
        disposition: "body-drawing",
        roles: ["neutral-anchor"],
        quality: quality(0.97),
      },
      {
        frameId: "eva-frame-idle-key",
        sourceSha256: rawSha("3"),
        disposition: "body-drawing",
        roles: ["idle-key"],
        quality: quality(0.94),
      },
      {
        frameId: "eva-frame-pose-ref",
        sourceSha256: rawSha("4"),
        disposition: "pose-reference",
        roles: ["pose-reference", "silhouette-reference"],
        quality: quality(0.91),
      },
      {
        frameId: "eva-frame-ignore",
        sourceSha256: rawSha("5"),
        disposition: "reject",
        roles: [],
        quality: quality(0.2),
      },
    ],
  };
  const finalization = {
    schema: "evavo_eva_source_reconciliation_finalization_v1",
    characterId: "eva-female",
    reviewPlanSha256: rawSha("6"),
    draftSha256: rawSha("7"),
    reconciliation,
  };
  finalization.finalizationSha256 = rawDigest({
    reviewPlanSha256: finalization.reviewPlanSha256,
    draftSha256: finalization.draftSha256,
    reconciliation,
  });
  const reuseBody = {
    schema: "evavo_eva_source_reuse_plan_v1",
    characterId: "eva-female",
    reviewPlanSha256: finalization.reviewPlanSha256,
    targets: [{ clipId: "idle-primary", route: "reuse-first-hybrid" }],
  };
  const reusePlan = { ...reuseBody, planSha256: rawDigest(reuseBody) };
  return { finalization, reusePlan };
}

function materializedSources() {
  return [
    ["eva-frame-neutral", "2", "a"],
    ["eva-frame-idle-key", "3", "b"],
    ["eva-frame-pose-ref", "4", "c"],
  ].map(([frameId, sourceChar, artifactChar]) => ({
    frameId,
    sourceSha256: rawSha(sourceChar),
    artifactId: artifact(artifactChar),
    contentDigest: sha(artifactChar),
    inspectionEvidenceDigest: sha("d"),
    byteLength: 1_500_000,
    mediaType: "image/png",
    width: 1024,
    height: 1536,
    meaningfulAlpha: true,
  }));
}

test("materialization request selects only source frames that can contribute to idle production", () => {
  const { finalization, reusePlan } = sourceContracts();
  const request = compileEvaIdleSourceMaterializationRequest({
    sourceReviewFinalization: finalization,
    reusePlan,
  });
  assert.equal(request.schema, EVA_IDLE_SOURCE_MATERIALIZATION_REQUEST_VERSION);
  assert.deepEqual(
    request.sourceFrames.map((entry) => entry.frameId),
    ["eva-frame-idle-key", "eva-frame-neutral", "eva-frame-pose-ref"],
  );
  assert.equal(request.rules.sourceBytesMustRemainImmutable, true);
  assert.equal(request.rules.sourceReviewDoesNotEqualArtifactAdmission, true);
  assert.equal(request.authority.drawingMediaAdmission, false);
});

test("bridge maps neutral and idle keys to exact authored poses while keeping references guidance-only", () => {
  const profileEntry = idleProfileEntry();
  const { finalization, reusePlan } = sourceContracts();
  const identity = {
    artifactId: artifact("1"),
    contentDigest: sha("1"),
    mediaType: "image/png",
    width: 1024,
    height: 1536,
  };
  const bridge = compileEvaIdleSourceReviewBridge({
    sourceReviewFinalization: finalization,
    reusePlan,
    profileEntry,
    materializedSources: materializedSources(),
    baseReferenceBindings: [identity],
  });
  assert.equal(bridge.schema, EVA_IDLE_SOURCE_REVIEW_BRIDGE_VERSION);
  assert.equal(bridge.reviewedSources.length, 2);

  const byPose = new Map(profileEntry.plan.drawings.map((drawing) => [drawing.poseId, drawing.id]));
  const rest = bridge.reviewedSources.find((entry) => entry.eligibleDrawingIds.includes(byPose.get("rest")));
  const exhale = bridge.reviewedSources.find((entry) => entry.eligibleDrawingIds.includes(byPose.get("exhale")));
  assert.ok(rest);
  assert.ok(exhale);
  assert.equal(bridge.routing.restReuseEligible, true);
  assert.equal(bridge.routing.exhaleReuseEligible, true);
  assert.equal(bridge.routing.inhaleRequiresAuthoredWork, true);
  assert.equal(bridge.routing.settleRequiresAuthoredWork, true);

  assert.ok(bridge.referenceBindings.some((entry) => entry.artifactId === artifact("1")));
  assert.ok(bridge.referenceBindings.some((entry) => entry.artifactId === artifact("c")));
  assert.ok(bridge.supplementalReferencesByDrawing[byPose.get("inhale")].some(
    (entry) => entry.role === "reviewed-silhouette-reference" && entry.artifactId === artifact("c"),
  ));
  assert.equal(bridge.authority.providerExecution, false);
  assert.equal(bridge.authority.automaticCreativeApproval, false);
});

test("bridge fails closed when a reviewed useful source has not been physically materialized", () => {
  const profileEntry = idleProfileEntry();
  const { finalization, reusePlan } = sourceContracts();
  const sources = materializedSources().filter((entry) => entry.frameId !== "eva-frame-pose-ref");
  assert.throws(
    () => compileEvaIdleSourceReviewBridge({
      sourceReviewFinalization: finalization,
      reusePlan,
      profileEntry,
      materializedSources: sources,
      baseReferenceBindings: [{
        artifactId: artifact("1"),
        contentDigest: sha("1"),
        mediaType: "image/png",
        width: 1024,
        height: 1536,
      }],
    }),
    /EVA_IDLE_BRIDGE_MATERIALIZED_SOURCE_MISSING:eva-frame-pose-ref/u,
  );
});
