import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { compileEvaCanonicalProfileBundle } from "../tools/eva_avatar_canonical_profile_adapter_v1.mjs";
import { compileEvaIdleReviewedSourceGenerationState } from "../tools/eva_idle_reviewed_source_generation_adapter_v1.mjs";

const raw = (c) => c.repeat(64);
const pref = (c) => `sha256:${raw(c)}`;
const artifact = (c) => `artifact_${raw(c)}`;
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
function digest(value) { return `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`; }
function profile() {
  const bundle = compileEvaCanonicalProfileBundle({
    characterId: "eva-female",
    compiledAt: "2026-08-31T10:00:00.000Z",
    targetCanvas: { width: 1024, height: 1536 },
    animationIdentityMaster: { asset: { sha256: raw("1") } },
    clips: [{ id: "idle-primary", kind: "idle", loopMode: "loop", targetFrames: 36, fps: 24, performance: "quiet neutral breathing" }],
  }, { generatedAt: "2026-08-31T10:00:00.000Z", state: "approved" });
  return bundle.bodyProfiles[0].plan;
}
function source(id, drawingId, char) {
  return {
    sourceId: id,
    reviewDecisionId: `decision:${id}`,
    reviewDecisionDigest: pref(char),
    inspectionEvidenceDigest: pref("e"),
    artifactId: artifact(char),
    contentDigest: pref(char),
    byteLength: 1000,
    mediaType: "image/png",
    width: 1024,
    height: 1536,
    meaningfulAlpha: true,
    reviewStatus: "sealed",
    decision: "keep",
    identityLockId: "eva-female-identity-lock",
    identityRevision: 1,
    eligibleDrawingIds: [drawingId],
    reusePriority: 1,
  };
}
function bridge(plan, { rest = true, exhale = true } = {}) {
  const poses = new Map(plan.drawings.map((d) => [d.poseId, d]));
  const reviewedSources = [];
  if (rest) reviewedSources.push(source("reviewed-rest", poses.get("rest").id, "2"));
  if (exhale) reviewedSources.push(source("reviewed-exhale", poses.get("exhale").id, "3"));
  const supplemental = {};
  for (const poseId of ["inhale", "settle"]) {
    supplemental[poses.get(poseId).id] = [{
      role: "reviewed-silhouette-reference",
      artifactId: artifact("4"),
      contentDigest: pref("4"),
      mediaType: "image/png",
      width: 1024,
      height: 1536,
      sourceFrameId: "pose-ref",
      sourceReviewDigest: pref("5"),
    }];
  }
  const body = {
    schema: "evavo.eva-idle-source-review-bridge.v1",
    characterId: "eva-female",
    clipId: "idle-primary",
    profileId: plan.profileId,
    profileDigest: plan.contentDigest,
    sourceReviewFinalizationSha256: raw("6"),
    sourceReusePlanSha256: raw("7"),
    reviewedSources,
    referenceBindings: [{ artifactId: artifact("1"), contentDigest: pref("1"), mediaType: "image/png", width: 1024, height: 1536 }],
    supplementalReferencesByDrawing: supplemental,
    routing: { restReuseEligible: rest, exhaleReuseEligible: exhale, inhaleRequiresAuthoredWork: true, settleRequiresAuthoredWork: true },
    authority: {
      providerExecution: false, localExecution: false, sourceMutation: false, semanticAssignment: false,
      automaticCreativeApproval: false, drawingMediaAdmission: false, artifactPromotion: false,
      targetRepositoryMutation: false, gitCommit: false, gitPush: false, runtimeActivation: false, publication: false,
    },
  };
  return { ...body, contentDigest: digest(body) };
}

test("reviewed rest and exhale satisfy key-pose production and unlock only inhale + settle", () => {
  const plan = profile();
  const state = compileEvaIdleReviewedSourceGenerationState(plan, bridge(plan));
  const poses = new Map(plan.drawings.map((d) => [d.poseId, d]));
  assert.deepEqual(state.completedDrawingIds, [poses.get("exhale").id, poses.get("rest").id].sort());
  assert.deepEqual(state.pendingDrawingIds, [poses.get("inhale").id, poses.get("settle").id].sort());
  assert.equal(state.nextBatch.phase, "breakdown");
  assert.deepEqual([...state.nextBatch.drawingIds].sort(), state.pendingDrawingIds);
  assert.equal(state.reusedDrawings.every((entry) => entry.generationRequired === false && entry.reviewStillRequired === true), true);
  assert.equal(state.workOrders.length, 2);
  assert.equal(state.workOrders.every((entry) => entry.authoritativeNeighbours.length === 2), true);
  assert.deepEqual(state.workOrders.find((entry) => entry.poseId === "inhale").authoritativeNeighbours.map((entry) => entry.poseId), ["rest", "exhale"]);
  assert.deepEqual(state.workOrders.find((entry) => entry.poseId === "settle").authoritativeNeighbours.map((entry) => entry.poseId), ["exhale", "rest"]);
  assert.equal(state.workOrders.every((entry) => entry.rules.noPixelInterpolationAsCanonicalDrawing === true), true);
  assert.ok(Object.values(state.authority).every((value) => value === false));
});

test("a missing reviewed rest endpoint blocks breakdown production", () => {
  const plan = profile();
  assert.throws(() => compileEvaIdleReviewedSourceGenerationState(plan, bridge(plan, { rest: false })), /EVA_IDLE_GENERATION_REQUIRED_REUSE_MISSING:rest/u);
});

test("a missing reviewed exhale endpoint blocks breakdown production", () => {
  const plan = profile();
  assert.throws(() => compileEvaIdleReviewedSourceGenerationState(plan, bridge(plan, { exhale: false })), /EVA_IDLE_GENERATION_REQUIRED_REUSE_MISSING:exhale/u);
});

test("reviewed key poses never leak back into the missing generation batch", () => {
  const plan = profile();
  const state = compileEvaIdleReviewedSourceGenerationState(plan, bridge(plan));
  const reused = new Set(state.completedDrawingIds);
  assert.equal(state.nextBatch.drawingIds.some((id) => reused.has(id)), false);
  assert.equal(state.workOrders.some((entry) => reused.has(entry.drawingId)), false);
});
