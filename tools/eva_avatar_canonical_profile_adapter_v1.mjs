import {
  PROTOCOL_VERSION,
  REQUEST_KIND,
  compileAnimationProductionProfile,
} from "./animation_production_profile_v1.mjs";

export const EVA_CANONICAL_PROFILE_ADAPTER_VERSION =
  "evavo.eva-avatar-canonical-profile-adapter.v1";
export const EVA_CANONICAL_PROFILE_BUNDLE_VERSION =
  "evavo.eva-avatar-canonical-profile-bundle.v1";

const BODY_PRODUCTION_CLASSES = Object.freeze(["parameter", "hybrid", "drawing"]);
const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u;

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function record(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function safeId(value, code) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) fail(code);
  return value;
}

function finite(value, minimum, maximum, code) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) fail(code);
  return value;
}

function classifyClip(clip) {
  if (clip.kind === "blink") return "face-only";
  if (["wave", "dance"].includes(clip.kind) || clip.id === "talk-emphasis") return "drawing";
  if (["idle-breathe", "idle-glance"].includes(clip.id)) return "parameter";
  return "hybrid";
}

function actionForClip(clip) {
  if (clip.kind === "idle") return "idle";
  if (clip.kind.startsWith("talk-")) return "dialogue";
  return "emote";
}

function beat(id, phase, generationClass, role, intent) {
  return Object.freeze({
    id,
    phase,
    generationClass,
    role,
    intent,
    contactAnchor: "both-feet",
    groundContactRequired: true,
    rootOffset: Object.freeze({ x: 0, y: 0 }),
  });
}

function beatsForClip(clip) {
  switch (clip.id) {
    case "idle-primary":
    case "idle-breathe":
      return Object.freeze([
        beat("rest", 0, "key-pose", "hold", "Canonical grounded neutral with stable face, hands, costume and baseline."),
        beat("inhale", 0.34, "breakdown", "breath", "Tiny ribcage-led inhale; keep feet, pelvis and face identity effectively locked."),
        beat("exhale", 0.66, "key-pose", "breath", "Subtle exhale with natural asymmetry and no whole-body scaling."),
        beat("settle", 0.88, "breakdown", "settle", "Settle quietly into the opening pose without a visible loop reset."),
      ]);
    case "attention":
      return Object.freeze([
        beat("neutral", 0, "key-pose", "hold", "Begin from the canonical neutral anchor."),
        beat("orient", 0.3, "breakdown", "attention", "Eye-led attention arrives before the body; head and torso movement stay restrained."),
        beat("attentive", 0.62, "key-pose", "attention", "Readable attentive posture with stable scale, anatomy and front-stage camera."),
        beat("hold", 0.86, "breakdown", "hold", "Hold attention without bobbing or unnecessary gesture."),
      ]);
    case "listening":
      return Object.freeze([
        beat("attentive", 0, "key-pose", "listening", "Start from the shared attentive anchor."),
        beat("receive", 0.28, "breakdown", "listening", "Very small listening lean led by thought, not by a rubbery torso warp."),
        beat("response", 0.58, "key-pose", "listening", "Subtle human acknowledgement while hands and lower body remain quiet."),
        beat("settle", 0.86, "breakdown", "hold", "Return to a reusable attentive hold with no identity drift."),
      ]);
    case "thinking":
      return Object.freeze([
        beat("attentive", 0, "key-pose", "thinking", "Start from the shared attentive anchor."),
        beat("consider", 0.26, "breakdown", "thinking", "Shift into thought with restrained head attitude and stable feet."),
        beat("thought", 0.56, "key-pose", "thinking", "Specific composed thinking pose; preserve EVA face and costume construction."),
        beat("return", 0.84, "breakdown", "settle", "Ease back toward the attentive anchor without a mechanical snap."),
      ]);
    case "talk-in":
      return Object.freeze([
        beat("attentive", 0, "key-pose", "transition", "Start at the shared attentive anchor."),
        beat("prepare", 0.32, "breakdown", "anticipation", "Small thought-and-breath preparation before speaking."),
        beat("speaking", 0.7, "key-pose", "transition", "Arrive on the shared speaking anchor without changing face geometry or body scale."),
      ]);
    case "talk-out":
      return Object.freeze([
        beat("speaking", 0, "key-pose", "transition", "Start at the shared speaking anchor."),
        beat("release", 0.34, "breakdown", "settle", "Release conversational energy while the mouth layer remains independently timed."),
        beat("neutral", 0.72, "key-pose", "transition", "Return cleanly to the canonical neutral anchor."),
      ]);
    case "wave":
      return Object.freeze([
        beat("neutral", 0, "key-pose", "hold", "Start from the canonical neutral anchor with both hands anatomically stable."),
        beat("raise", 0.2, "breakdown", "anticipation", "Raise the greeting arm along a clean arc; preserve shoulder construction and opposite side."),
        beat("wave-a", 0.42, "key-pose", "gesture", "Readable greeting extreme with five stable fingers and no face drift."),
        beat("wave-b", 0.63, "key-pose", "gesture", "Second restrained wave extreme; maintain wrist, palm and finger continuity."),
        beat("lower", 0.82, "breakdown", "recovery", "Lower the arm through the authored arc without torso or costume popping."),
        beat("neutral-return", 0.94, "key-pose", "hold", "Resolve exactly into the neutral anchor."),
      ]);
    default:
      if (clip.kind.startsWith("talk-")) {
        return Object.freeze([
          beat("speaking", 0, "key-pose", "dialogue", "Shared speaking anchor; lip sync remains a separate registered mouth layer."),
          beat("thought", 0.24, "breakdown", "dialogue", "Small thought-led conversational preparation with restrained shoulders and hands."),
          beat("gesture", 0.5, "key-pose", "dialogue", `${clip.performance}; one specific economical body beat, never constant bobbing.`),
          beat("secondary", 0.72, "breakdown", "dialogue", "Controlled follow-through while preserving face, hands, costume and baseline."),
          beat("speaking-return", 0.9, "key-pose", "hold", "Return to the shared speaking anchor for seamless continuation."),
        ]);
      }
      return Object.freeze([
        beat("neutral", 0, "key-pose", "hold", "Begin from the nearest shared neutral or attentive anchor."),
        beat("prepare", 0.24, "breakdown", "anticipation", `Prepare ${clip.performance} with restrained, grounded motion.`),
        beat("expression", 0.52, "key-pose", "expression", `${clip.performance}; preserve identity, anatomy, camera, palette and costume.`),
        beat("settle", 0.86, "breakdown", "settle", "Resolve into a reusable hold without unnecessary secondary movement."),
      ]);
  }
}

function animationMaster(plan) {
  const master = record(plan.animationIdentityMaster, "EVA_CANONICAL_PROFILE_ANIMATION_MASTER_REQUIRED");
  const asset = record(master.asset, "EVA_CANONICAL_PROFILE_ANIMATION_MASTER_REQUIRED");
  if (typeof asset.sha256 !== "string" || !SHA256.test(asset.sha256)) {
    fail("EVA_CANONICAL_PROFILE_ANIMATION_MASTER_SHA_INVALID");
  }
  return { master, asset };
}

function productionClassForClip(clip) {
  const value = classifyClip(clip);
  if (value === "face-only") return value;
  if (!BODY_PRODUCTION_CLASSES.includes(value)) fail("EVA_CANONICAL_PROFILE_CLASS_INVALID");
  return value;
}

export function compileEvaCanonicalProfileRequest(suitePlan, clipValue, options = {}) {
  const plan = record(suitePlan, "EVA_CANONICAL_PROFILE_SUITE_PLAN_INVALID");
  const clip = record(clipValue, "EVA_CANONICAL_PROFILE_CLIP_INVALID");
  if (plan.characterId !== "eva-female") fail("EVA_CANONICAL_PROFILE_CHARACTER_INVALID");
  safeId(clip.id, "EVA_CANONICAL_PROFILE_CLIP_ID_INVALID");
  const productionClass = productionClassForClip(clip);
  if (productionClass === "face-only") return null;
  const { asset } = animationMaster(plan);
  const canvas = record(plan.targetCanvas, "EVA_CANONICAL_PROFILE_CANVAS_INVALID");
  const width = finite(canvas.width, 256, 4096, "EVA_CANONICAL_PROFILE_CANVAS_INVALID");
  const height = finite(canvas.height, 256, 4096, "EVA_CANONICAL_PROFILE_CANVAS_INVALID");
  const fps = finite(clip.fps, 12, 30, "EVA_CANONICAL_PROFILE_FPS_INVALID");
  const targetFrames = finite(clip.targetFrames, 2, 1000, "EVA_CANONICAL_PROFILE_TARGET_FRAMES_INVALID");
  const identityRevision = Number.isSafeInteger(options.identityRevision) ? options.identityRevision : 1;
  const styleRevision = Number.isSafeInteger(options.styleRevision) ? options.styleRevision : 1;
  const state = options.state ?? "review";
  const action = actionForClip(clip);
  const request = {
    protocolVersion: PROTOCOL_VERSION,
    kind: REQUEST_KIND,
    id: `eva-female:${clip.id}`,
    revision: Number.isSafeInteger(options.revision) ? options.revision : 1,
    state,
    title: `EVA ${clip.id} canonical body performance`,
    action,
    direction: "camera",
    loop: clip.loopMode !== "once",
    durationSeconds: targetFrames / fps,
    sourceFramesPerSecond: fps,
    playbackFramesPerSecond: 60,
    detailLevel: productionClass === "drawing" ? "feature" : "standard",
    mirrorPolicy: "forbidden",
    targets: ["cel-sequence"],
    subject: {
      subjectId: "eva-female",
      identityLockId: "eva-female-identity-lock",
      identityRevision,
      identityReferenceArtifactId: `artifact_${asset.sha256}`,
      silhouetteAnchors: [
        "hair silhouette and hair-root placement",
        "head-to-body proportion and grounded full-body silhouette",
        "locked shoulder width, waist and lower-body construction",
      ],
      costumeAnchors: [
        "canonical EVA costume seams, neckline, jewellery and palette remain unchanged",
      ],
      propAnchors: [],
      asymmetricVisualAnchors: [
        "hair asymmetry",
        "side-specific costume and jewellery details",
      ],
      anatomyRule: "Preserve stable limb lengths and joint construction; every visible hand keeps correct palm orientation and five coherent fingers without fusion, duplication or count drift.",
    },
    camera: {
      profileId: "eva-front-stage-locked",
      perspective: "front-stage",
      projection: "orthographic",
      motion: "locked",
      yawDegrees: 0,
      pitchDegrees: 0,
      rollDegrees: 0,
      scale: 1,
      groundLineNormalized: 0.965,
      movementPlane: "screen-plane with feet locked to one canonical horizontal baseline",
      framing: "Full EVA body remains on the canonical transparent 1024x1536-style stage with stable scale and generous safe clearance.",
    },
    performance: {
      intent: clip.performance,
      weight: "grounded, restrained and human; thought leads motion and stillness is intentional",
      tempo: "economical authored timing with holds, selective accents and no perpetual bobbing",
      energy: productionClass === "drawing" ? 0.55 : productionClass === "hybrid" ? 0.32 : 0.16,
      exaggeration: productionClass === "drawing" ? 0.55 : 0.28,
      continuityAnchors: [
        "face identity and head scale stay stable across every drawing",
        "feet, pivot, baseline and camera scale stay registered unless the authored pose explicitly requires otherwise",
        "mouth phonemes are not encoded as whole-body changes",
      ],
    },
    style: {
      styleId: "eva-female-canonical",
      styleRevision,
      motionStyle: "cinematic-naturalistic",
      paletteLockId: "eva-female-palette",
      lineTreatment: "Preserve the approved EVA raster illustration finish, edge character, shading hierarchy and material treatment without repainting the design.",
      shapeLanguage: [
        "clean stable feminine silhouette with deliberate asymmetry",
        "restrained editorial character acting rather than mascot or streaming-avatar motion",
      ],
      antiGenericTraits: [
        "specific EVA facial proportions and hairstyle remain recognizable",
        "hands use deliberate readable poses with stable anatomy",
        "body acting includes meaningful stillness and asymmetric weight rather than looping sway",
      ],
      exclusions: [
        "no camera drift, zoom or perspective change",
        "no costume redesign, jewellery swap, hair-root drift or face replacement",
        "no rubber-hose deformation, floating torso, duplicated limbs or whole-body phoneme animation",
        "no painted checkerboard, matte, scenery, floor or cast shadow outside the character",
      ],
    },
    delivery: {
      canvas: { width, height },
      alphaRequired: true,
      trim: false,
      pivot: { x: 0.5, y: 0.965 },
      textureFiltering: "linear",
      animationName: `eva-${clip.id}`,
    },
    authoredPoseBeats: beatsForClip(clip),
    iteration: {
      maximumCandidatesPerKey: productionClass === "drawing" ? 3 : 2,
      maximumCandidatesPerBreakdown: 2,
      maximumCandidatesPerInbetween: 1,
      maximumAttemptsPerDrawing: 4,
      maximumReviewCycles: 6,
      maximumNoProgressCycles: 2,
      maximumBatchSize: productionClass === "drawing" ? 4 : 3,
    },
  };
  return Object.freeze({
    adapterVersion: EVA_CANONICAL_PROFILE_ADAPTER_VERSION,
    productionClass,
    logicalPresentationFrames: targetFrames,
    request: Object.freeze(request),
  });
}

export function compileEvaCanonicalProfileBundle(suitePlan, options = {}) {
  const plan = record(suitePlan, "EVA_CANONICAL_PROFILE_SUITE_PLAN_INVALID");
  if (!Array.isArray(plan.clips) || plan.clips.length === 0) fail("EVA_CANONICAL_PROFILE_CLIPS_INVALID");
  const generatedAt = new Date(options.generatedAt ?? plan.compiledAt ?? Date.now());
  if (Number.isNaN(generatedAt.valueOf())) fail("EVA_CANONICAL_PROFILE_TIME_INVALID");
  const bodyProfiles = [];
  const faceOnlyClips = [];
  for (const clip of plan.clips) {
    const compiled = compileEvaCanonicalProfileRequest(plan, clip, options);
    if (compiled === null) {
      faceOnlyClips.push(clip.id);
      continue;
    }
    const canonicalPlan = compileAnimationProductionProfile(compiled.request, generatedAt);
    bodyProfiles.push(Object.freeze({
      clipId: clip.id,
      productionClass: compiled.productionClass,
      logicalPresentationFrames: compiled.logicalPresentationFrames,
      uniqueDrawings: canonicalPlan.drawings.length,
      request: compiled.request,
      plan: canonicalPlan,
    }));
  }
  return Object.freeze({
    schema: EVA_CANONICAL_PROFILE_BUNDLE_VERSION,
    adapterVersion: EVA_CANONICAL_PROFILE_ADAPTER_VERSION,
    characterId: "eva-female",
    sourceSuiteSchema: plan.schema ?? null,
    sourceSuitePlanSha256: plan.planSha256 ?? null,
    bodyProfiles: Object.freeze(bodyProfiles),
    faceOnlyClips: Object.freeze(faceOnlyClips),
    totals: Object.freeze({
      logicalPresentationFrames: bodyProfiles.reduce((sum, entry) => sum + entry.logicalPresentationFrames, 0),
      uniqueDrawings: bodyProfiles.reduce((sum, entry) => sum + entry.uniqueDrawings, 0),
      bodyClips: bodyProfiles.length,
      faceOnlyClips: faceOnlyClips.length,
    }),
    authority: Object.freeze({
      providerExecution: false,
      automaticCreativeApproval: false,
      artifactPromotion: false,
      targetRepositoryMutation: false,
      gitCommit: false,
      gitPush: false,
      publication: false,
    }),
  });
}
