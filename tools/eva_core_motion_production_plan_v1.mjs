import {
  compileEvaCanonicalProfileRequest,
} from "./eva_avatar_canonical_profile_adapter_v1.mjs";
import {
  compileAnimationProductionProfile,
} from "./animation_production_profile_v1.mjs";

export const EVA_CORE_MOTION_PRODUCTION_PLAN_VERSION =
  "evavo.eva-core-motion-production-plan.v1";

export const EVA_CORE_BODY_CLIPS = Object.freeze([
  "idle-primary",
  "attention",
  "listening",
  "thinking",
  "talk-in",
  "talk-neutral",
  "talk-out",
]);

export const EVA_CORE_FACE_LAYERS = Object.freeze({
  eyes: Object.freeze(["open", "soft", "half", "closed", "glance-left", "glance-right"]),
  mouth: Object.freeze(["closed", "slight", "medium", "wide", "round", "teeth"]),
});

const AUTHORITY = Object.freeze({
  providerExecution: false,
  localExecution: false,
  automaticCreativeApproval: false,
  artifactPromotion: false,
  targetRepositoryMutation: false,
  gitCommit: false,
  gitPush: false,
  publication: false,
  runtimeActivation: false,
});

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function record(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function clipMap(suitePlan) {
  const plan = record(suitePlan, "EVA_CORE_SUITE_PLAN_INVALID");
  if (plan.characterId !== "eva-female" || !Array.isArray(plan.clips)) {
    fail("EVA_CORE_SUITE_PLAN_INVALID");
  }
  const map = new Map(plan.clips.map((clip) => [clip.id, clip]));
  const missing = EVA_CORE_BODY_CLIPS.filter((id) => !map.has(id));
  if (missing.length) fail("EVA_CORE_CLIPS_MISSING", missing.join(","));
  return { plan, map };
}

function stage(id, description, clipIds, prerequisites = []) {
  return Object.freeze({
    id,
    description,
    clipIds: Object.freeze([...clipIds]),
    prerequisites: Object.freeze([...prerequisites]),
  });
}

export function compileEvaCoreMotionProductionPlan(suitePlan, options = {}) {
  const { plan, map } = clipMap(suitePlan);
  const generatedAt = options.generatedAt instanceof Date
    ? options.generatedAt
    : new Date(options.generatedAt ?? Date.now());
  if (Number.isNaN(generatedAt.valueOf())) fail("EVA_CORE_TIME_INVALID");

  const profileState = options.profileState ?? "approved";
  if (!["draft", "review", "approved"].includes(profileState)) {
    fail("EVA_CORE_PROFILE_STATE_INVALID");
  }

  const profiles = EVA_CORE_BODY_CLIPS.map((clipId) => {
    const compiled = compileEvaCanonicalProfileRequest(plan, map.get(clipId), {
      ...options,
      state: profileState,
    });
    if (compiled === null) fail("EVA_CORE_BODY_CLIP_BECAME_FACE_ONLY", clipId);
    const canonicalPlan = compileAnimationProductionProfile(
      compiled.request,
      generatedAt,
    );
    return Object.freeze({
      clipId,
      productionClass: compiled.productionClass,
      logicalPresentationFrames: compiled.logicalPresentationFrames,
      uniqueDrawings: canonicalPlan.drawings.length,
      profileId: canonicalPlan.profileId,
      contentDigest: canonicalPlan.contentDigest,
      request: compiled.request,
      plan: canonicalPlan,
    });
  });

  const byClip = Object.freeze(
    Object.fromEntries(profiles.map((entry) => [entry.clipId, entry])),
  );
  const stages = Object.freeze([
    stage(
      "source-reconciliation",
      "Review and reconcile existing EVA sources before requesting any new drawing. Resolve neutral, attentive and speaking anchors plus reusable clip-key candidates.",
      [],
    ),
    stage(
      "idle-proof",
      "Produce idle-primary first. This is the architecture proof for identity, alpha, exposure timing, loop closure, motion containment, ledger admission and browser presentation.",
      ["idle-primary"],
      ["source-reconciliation"],
    ),
    stage(
      "attention-system",
      "Establish attentive, listening and thinking body acting from shared anchors while preserving intentional stillness.",
      ["attention", "listening", "thinking"],
      ["idle-proof"],
    ),
    stage(
      "speech-body-system",
      "Establish the shared speaking anchor and seamless talk-in, talk-neutral and talk-out body path. Mouth phonemes remain separate registered face layers.",
      ["talk-in", "talk-neutral", "talk-out"],
      ["attention-system"],
    ),
    stage(
      "registered-face-core",
      "Author and register reusable full-canvas eye and mouth layers against the same identity family after the body anchors are stable.",
      [],
      ["speech-body-system"],
    ),
    stage(
      "runtime-proof",
      "Compile the hybrid release, run local visual QA at full/waist/portrait crops and only then consider public release or website migration.",
      EVA_CORE_BODY_CLIPS,
      ["registered-face-core"],
    ),
  ]);

  return Object.freeze({
    schema: EVA_CORE_MOTION_PRODUCTION_PLAN_VERSION,
    characterId: "eva-female",
    generatedAt: generatedAt.toISOString(),
    sourceSuitePlanSha256: plan.planSha256 ?? null,
    profileState,
    coreBodyClips: EVA_CORE_BODY_CLIPS,
    faceLayers: EVA_CORE_FACE_LAYERS,
    profiles: Object.freeze(profiles),
    byClip,
    stages,
    totals: Object.freeze({
      bodyClips: profiles.length,
      logicalPresentationFrames: profiles.reduce(
        (total, entry) => total + entry.logicalPresentationFrames,
        0,
      ),
      uniqueDrawings: profiles.reduce(
        (total, entry) => total + entry.uniqueDrawings,
        0,
      ),
      eyeLayerPoses: EVA_CORE_FACE_LAYERS.eyes.length,
      mouthLayerPoses: EVA_CORE_FACE_LAYERS.mouth.length,
    }),
    productionPolicy: Object.freeze({
      reuseReviewedSourcesBeforeGeneration: true,
      deterministicRepairBeforeAi: true,
      localAiBeforeProvider: true,
      providerIsFallback: true,
      acceptedDependencyKeysRequiredForInbetweens: true,
      oneDrawingCandidatePerOutput: true,
      xSheetExposureInsteadOfDuplicateFrames: true,
      normalSpeedReviewRequired: true,
      frameByFrameReviewRequired: true,
      finalPublicCreativeApprovalSeparate: true,
    }),
    authority: AUTHORITY,
  });
}
