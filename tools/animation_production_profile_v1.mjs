#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PROTOCOL_VERSION = "2026-08-30.3";
export const REQUEST_KIND = "evavo.animation-production-profile.request.v1";
export const PLAN_KIND = "evavo.animation-production-profile.plan.v1";
export const REVIEW_KIND = "evavo.animation-production-profile.review.v1";

export const ACTIONS = Object.freeze([
  "idle", "walk", "run", "sprint", "jump", "land", "climb", "swim", "fly",
  "melee-attack", "ranged-attack", "cast", "hit-reaction", "knockdown",
  "get-up", "death", "interact", "dialogue", "emote", "effect", "custom",
]);
export const PERSPECTIVES = Object.freeze([
  "side-stage", "top-down", "isometric-2-1", "three-quarter", "front-stage",
  "first-person-overlay", "cinematic-perspective", "custom-fixed",
]);
export const DIRECTIONS = Object.freeze([
  "none", "camera", "left", "right", "up", "down", "up-left", "up-right",
  "down-left", "down-right",
]);
export const TARGETS = Object.freeze(["godot-sprite", "cel-sequence", "video-sequence"]);

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const ARTIFACT_ID = /^artifact_[0-9a-f]{64}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const GENERIC_FILLER = /\b(masterpiece|best quality|trending|award winning|8k|ultra detailed)\b/i;
const EPSILON = 1e-9;

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}

export function sha256(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
}

function object(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function safeId(value, code) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) fail(code);
  return value;
}

function nonBlank(value, code) {
  if (typeof value !== "string" || !value.trim()) fail(code);
  return value.trim();
}

function finite(value, code, minimum, maximum) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) fail(code);
  return value;
}

function positiveInteger(value, code, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) fail(code);
  return value;
}

function distinctStrings(value, code, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum) fail(code);
  const result = value.map((entry) => nonBlank(entry, code));
  if (new Set(result).size !== result.length) fail(`${code}_DUPLICATE`);
  return result;
}

function member(value, values, code) {
  if (!values.includes(value)) fail(code);
  return value;
}

function round(value, places = 6) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function validateDirection(request) {
  const allowed = {
    "side-stage": ["left", "right", "camera", "none"],
    "top-down": ["up", "down", "left", "right", "up-left", "up-right", "down-left", "down-right", "none"],
    "isometric-2-1": ["up-left", "up-right", "down-left", "down-right", "none"],
    "three-quarter": DIRECTIONS,
    "front-stage": ["camera", "none", "left", "right"],
    "first-person-overlay": ["camera", "none"],
    "cinematic-perspective": DIRECTIONS,
    "custom-fixed": DIRECTIONS,
  };
  if (!allowed[request.camera.perspective].includes(request.direction)) {
    fail("ANIMATION_PROFILE_DIRECTION_CAMERA_MISMATCH", `${request.camera.perspective}:${request.direction}`);
  }
  if (["walk", "run", "sprint", "jump", "land", "climb", "swim", "fly"].includes(request.action) && request.direction === "none") {
    fail("ANIMATION_PROFILE_DIRECTION_REQUIRED", request.action);
  }
}

function validateRequest(submitted) {
  const request = object(submitted, "ANIMATION_PROFILE_REQUEST_INVALID");
  if (request.protocolVersion !== PROTOCOL_VERSION) fail("ANIMATION_PROFILE_PROTOCOL_UNSUPPORTED");
  if (request.kind !== REQUEST_KIND) fail("ANIMATION_PROFILE_REQUEST_KIND_INVALID");
  safeId(request.id, "ANIMATION_PROFILE_ID_INVALID");
  positiveInteger(request.revision, "ANIMATION_PROFILE_REVISION_INVALID", 1_000_000);
  member(request.state, ["draft", "review", "approved"], "ANIMATION_PROFILE_STATE_INVALID");
  nonBlank(request.title, "ANIMATION_PROFILE_TITLE_INVALID");
  member(request.action, ACTIONS, "ANIMATION_PROFILE_ACTION_INVALID");
  member(request.direction, DIRECTIONS, "ANIMATION_PROFILE_DIRECTION_INVALID");
  if (typeof request.loop !== "boolean") fail("ANIMATION_PROFILE_LOOP_INVALID");
  finite(request.durationSeconds, "ANIMATION_PROFILE_DURATION_INVALID", 0.05, 120);
  member(request.sourceFramesPerSecond, [12, 24, 25, 30], "ANIMATION_PROFILE_SOURCE_FPS_INVALID");
  if (request.playbackFramesPerSecond !== undefined) finite(request.playbackFramesPerSecond, "ANIMATION_PROFILE_PLAYBACK_FPS_INVALID", 1, 120);
  member(request.detailLevel, ["limited", "standard", "feature"], "ANIMATION_PROFILE_DETAIL_INVALID");
  member(request.mirrorPolicy, ["forbidden", "safe-horizontal"], "ANIMATION_PROFILE_MIRROR_POLICY_INVALID");
  const targets = distinctStrings(request.targets, "ANIMATION_PROFILE_TARGETS_INVALID", 1);
  for (const target of targets) member(target, TARGETS, "ANIMATION_PROFILE_TARGET_INVALID");

  const subject = object(request.subject, "ANIMATION_PROFILE_SUBJECT_INVALID");
  safeId(subject.subjectId, "ANIMATION_PROFILE_SUBJECT_ID_INVALID");
  safeId(subject.identityLockId, "ANIMATION_PROFILE_IDENTITY_LOCK_INVALID");
  positiveInteger(subject.identityRevision, "ANIMATION_PROFILE_IDENTITY_REVISION_INVALID");
  if (typeof subject.identityReferenceArtifactId !== "string" || !ARTIFACT_ID.test(subject.identityReferenceArtifactId)) fail("ANIMATION_PROFILE_IDENTITY_ARTIFACT_INVALID");
  if (subject.directionMasterArtifactId !== undefined && (typeof subject.directionMasterArtifactId !== "string" || !ARTIFACT_ID.test(subject.directionMasterArtifactId))) fail("ANIMATION_PROFILE_DIRECTION_ARTIFACT_INVALID");
  distinctStrings(subject.silhouetteAnchors, "ANIMATION_PROFILE_SILHOUETTE_ANCHORS_INVALID", 2);
  distinctStrings(subject.costumeAnchors, "ANIMATION_PROFILE_COSTUME_ANCHORS_INVALID", 1);
  distinctStrings(subject.propAnchors, "ANIMATION_PROFILE_PROP_ANCHORS_INVALID");
  distinctStrings(subject.asymmetricVisualAnchors, "ANIMATION_PROFILE_ASYMMETRIC_ANCHORS_INVALID");
  nonBlank(subject.anatomyRule, "ANIMATION_PROFILE_ANATOMY_RULE_INVALID");
  if (request.mirrorPolicy === "safe-horizontal" && subject.asymmetricVisualAnchors.length > 0) fail("ANIMATION_PROFILE_UNSAFE_MIRROR_POLICY");

  const camera = object(request.camera, "ANIMATION_PROFILE_CAMERA_INVALID");
  safeId(camera.profileId, "ANIMATION_PROFILE_CAMERA_PROFILE_INVALID");
  member(camera.perspective, PERSPECTIVES, "ANIMATION_PROFILE_PERSPECTIVE_INVALID");
  member(camera.projection, ["orthographic", "perspective"], "ANIMATION_PROFILE_PROJECTION_INVALID");
  member(camera.motion, ["locked", "authored"], "ANIMATION_PROFILE_CAMERA_MOTION_INVALID");
  finite(camera.yawDegrees, "ANIMATION_PROFILE_CAMERA_YAW_INVALID", -360, 360);
  finite(camera.pitchDegrees, "ANIMATION_PROFILE_CAMERA_PITCH_INVALID", -89, 89);
  finite(camera.rollDegrees, "ANIMATION_PROFILE_CAMERA_ROLL_INVALID", -180, 180);
  finite(camera.scale, "ANIMATION_PROFILE_CAMERA_SCALE_INVALID", 0.01, 100);
  finite(camera.groundLineNormalized, "ANIMATION_PROFILE_GROUND_LINE_INVALID", 0, 1);
  nonBlank(camera.movementPlane, "ANIMATION_PROFILE_MOVEMENT_PLANE_INVALID");
  nonBlank(camera.framing, "ANIMATION_PROFILE_FRAMING_INVALID");
  if (["side-stage", "top-down", "isometric-2-1", "front-stage"].includes(camera.perspective) && camera.projection !== "orthographic") fail("ANIMATION_PROFILE_ORTHOGRAPHIC_CAMERA_REQUIRED");
  validateDirection(request);

  const performance = object(request.performance, "ANIMATION_PROFILE_PERFORMANCE_INVALID");
  nonBlank(performance.intent, "ANIMATION_PROFILE_PERFORMANCE_INTENT_INVALID");
  nonBlank(performance.weight, "ANIMATION_PROFILE_PERFORMANCE_WEIGHT_INVALID");
  nonBlank(performance.tempo, "ANIMATION_PROFILE_PERFORMANCE_TEMPO_INVALID");
  finite(performance.energy, "ANIMATION_PROFILE_ENERGY_INVALID", 0, 1);
  finite(performance.exaggeration, "ANIMATION_PROFILE_EXAGGERATION_INVALID", 0, 2);
  distinctStrings(performance.continuityAnchors, "ANIMATION_PROFILE_CONTINUITY_ANCHORS_INVALID", 2);

  const style = object(request.style, "ANIMATION_PROFILE_STYLE_INVALID");
  safeId(style.styleId, "ANIMATION_PROFILE_STYLE_ID_INVALID");
  positiveInteger(style.styleRevision, "ANIMATION_PROFILE_STYLE_REVISION_INVALID");
  member(style.motionStyle, ["pixel-90s", "vga-adventure", "arcade-snappy", "limited-cel", "full-cel", "cinematic-naturalistic", "engraved-dos"], "ANIMATION_PROFILE_MOTION_STYLE_INVALID");
  safeId(style.paletteLockId, "ANIMATION_PROFILE_PALETTE_LOCK_INVALID");
  nonBlank(style.lineTreatment, "ANIMATION_PROFILE_LINE_TREATMENT_INVALID");
  distinctStrings(style.shapeLanguage, "ANIMATION_PROFILE_SHAPE_LANGUAGE_INVALID", 2);
  distinctStrings(style.antiGenericTraits, "ANIMATION_PROFILE_ANTI_GENERIC_TRAITS_INVALID", 3);
  distinctStrings(style.exclusions, "ANIMATION_PROFILE_EXCLUSIONS_INVALID", 3);
  const directionText = [performance.intent, performance.weight, performance.tempo, style.lineTreatment, ...style.shapeLanguage, ...style.antiGenericTraits].join(" ");
  if (GENERIC_FILLER.test(directionText)) fail("ANIMATION_PROFILE_GENERIC_PROMPT_FILLER_FORBIDDEN");

  const delivery = object(request.delivery, "ANIMATION_PROFILE_DELIVERY_INVALID");
  const canvas = object(delivery.canvas, "ANIMATION_PROFILE_CANVAS_INVALID");
  positiveInteger(canvas.width, "ANIMATION_PROFILE_CANVAS_WIDTH_INVALID", 8192);
  positiveInteger(canvas.height, "ANIMATION_PROFILE_CANVAS_HEIGHT_INVALID", 8192);
  if (typeof delivery.alphaRequired !== "boolean" || delivery.trim !== false) fail("ANIMATION_PROFILE_DELIVERY_POLICY_INVALID");
  const pivot = object(delivery.pivot, "ANIMATION_PROFILE_PIVOT_INVALID");
  finite(pivot.x, "ANIMATION_PROFILE_PIVOT_X_INVALID", 0, 1);
  finite(pivot.y, "ANIMATION_PROFILE_PIVOT_Y_INVALID", 0, 1);
  member(delivery.textureFiltering, ["nearest", "linear"], "ANIMATION_PROFILE_FILTERING_INVALID");
  safeId(delivery.animationName, "ANIMATION_PROFILE_ANIMATION_NAME_INVALID");

  if (request.action === "custom") {
    nonBlank(request.customActionName, "ANIMATION_PROFILE_CUSTOM_ACTION_NAME_REQUIRED");
    if (!Array.isArray(request.authoredPoseBeats) || request.authoredPoseBeats.length < 2) fail("ANIMATION_PROFILE_CUSTOM_BEATS_REQUIRED");
  }
  if (request.authoredPoseBeats !== undefined) validateBeats(request.authoredPoseBeats);
  if (request.events !== undefined) validateEvents(request.events);
  return request;
}

function validateBeats(beats) {
  if (!Array.isArray(beats) || beats.length < 2 || beats.length > 256) fail("ANIMATION_PROFILE_BEATS_INVALID");
  const ids = new Set();
  let previous = -1;
  for (const [index, beat] of beats.entries()) {
    object(beat, `ANIMATION_PROFILE_BEAT_INVALID:${index}`);
    safeId(beat.id, `ANIMATION_PROFILE_BEAT_ID_INVALID:${index}`);
    if (ids.has(beat.id)) fail("ANIMATION_PROFILE_BEAT_ID_DUPLICATE", beat.id);
    ids.add(beat.id);
    finite(beat.phase, `ANIMATION_PROFILE_BEAT_PHASE_INVALID:${index}`, 0, 0.999999);
    if (beat.phase <= previous) fail("ANIMATION_PROFILE_BEAT_ORDER_INVALID", beat.id);
    previous = beat.phase;
    member(beat.generationClass, ["key-pose", "breakdown"], "ANIMATION_PROFILE_BEAT_CLASS_INVALID");
    nonBlank(beat.role, "ANIMATION_PROFILE_BEAT_ROLE_INVALID");
    nonBlank(beat.intent, "ANIMATION_PROFILE_BEAT_INTENT_INVALID");
  }
}

function validateEvents(events) {
  if (!Array.isArray(events) || events.length > 1024) fail("ANIMATION_PROFILE_EVENTS_INVALID");
  const ids = new Set();
  for (const [index, event] of events.entries()) {
    object(event, `ANIMATION_PROFILE_EVENT_INVALID:${index}`);
    safeId(event.id, `ANIMATION_PROFILE_EVENT_ID_INVALID:${index}`);
    if (ids.has(event.id)) fail("ANIMATION_PROFILE_EVENT_ID_DUPLICATE", event.id);
    ids.add(event.id);
    finite(event.phase, `ANIMATION_PROFILE_EVENT_PHASE_INVALID:${index}`, 0, 0.999999);
    nonBlank(event.kind, "ANIMATION_PROFILE_EVENT_KIND_INVALID");
  }
}

function beat(id, phase, generationClass, role, intent, contactAnchor = "none", groundContactRequired = false, rootOffset = { x: 0, y: 0 }) {
  return { id, phase, generationClass, role, intent, contactAnchor, groundContactRequired, rootOffset };
}

function locomotion(action) {
  const flight = action === "run" || action === "sprint";
  return [
    beat("left-contact", 0, "key-pose", "contact", "Left foot receives weight; hips and shoulders oppose cleanly.", "left-foot", true),
    beat("left-down", 0.125, "breakdown", "down", "Compress over the planted left leg.", "left-foot", true, { x: 0.02, y: 0.02 }),
    beat("left-passing", 0.25, "key-pose", "passing", "Free leg passes under the root with a readable support line.", flight ? "none" : "left-foot", !flight, { x: 0.04, y: -0.02 }),
    beat("left-up", 0.375, "breakdown", flight ? "flight" : "up", "Reach the first high or flight pose without camera-scale drift.", flight ? "none" : "left-foot", !flight, { x: 0.06, y: -0.03 }),
    beat("right-contact", 0.5, "key-pose", "contact", "Right foot receives weight with matched phase and stride.", "right-foot", true, { x: 0.08, y: 0 }),
    beat("right-down", 0.625, "breakdown", "down", "Compress over the planted right leg.", "right-foot", true, { x: 0.1, y: 0.02 }),
    beat("right-passing", 0.75, "key-pose", "passing", "Opposite passing pose preserves designed asymmetry.", flight ? "none" : "right-foot", !flight, { x: 0.12, y: -0.02 }),
    beat("right-up", 0.875, "breakdown", flight ? "flight" : "up", "Close the cycle into the first contact without a hitch.", flight ? "none" : "right-foot", !flight, { x: 0.14, y: -0.03 }),
  ];
}

function template(action) {
  if (["walk", "run", "sprint"].includes(action)) return locomotion(action);
  if (action === "idle") return [
    beat("rest", 0, "key-pose", "idle", "Stable rest with intentional weight.", "both-feet", true),
    beat("breath", 0.35, "breakdown", "hold", "Small ribcage-led breath, never whole-body scaling.", "both-feet", true),
    beat("attention", 0.65, "key-pose", "expression", "Specific attention shift with identity intact.", "both-feet", true),
    beat("settle", 0.88, "breakdown", "settle", "Human, non-sinusoidal return to rest.", "both-feet", true),
  ];
  if (action === "jump") return [
    beat("anticipation", 0, "key-pose", "anticipation", "Compress against the ground.", "both-feet", true),
    beat("takeoff", 0.2, "key-pose", "takeoff", "Extend through hips, knees and ankles.", "both-feet", true, { x: 0.02, y: -0.03 }),
    beat("ascent", 0.42, "breakdown", "flight", "Carry upward momentum with limb drag.", "none", false, { x: 0.05, y: -0.12 }),
    beat("apex", 0.64, "key-pose", "apex", "Brief weighted apex, not a freeze.", "none", false, { x: 0.08, y: -0.18 }),
    beat("descent", 0.84, "breakdown", "descent", "Prepare the landing while preserving trajectory.", "none", false, { x: 0.11, y: -0.1 }),
  ];
  if (action === "land") return [
    beat("pre-contact", 0, "key-pose", "descent", "Approach the ground with balance prepared."),
    beat("contact", 0.24, "key-pose", "landing", "Both feet meet one coherent baseline.", "both-feet", true),
    beat("compression", 0.48, "breakdown", "down", "Absorb impact through the full body.", "both-feet", true, { x: 0, y: 0.05 }),
    beat("recovery", 0.72, "key-pose", "recovery", "Recover balance without snapping to idle.", "both-feet", true),
    beat("settle", 0.9, "breakdown", "settle", "Resolve residual motion.", "both-feet", true),
  ];
  if (["climb", "swim", "fly"].includes(action)) return [
    beat("reach-a", 0, "key-pose", "contact", "First strong reach and body line.", action === "climb" ? "both-hands" : "none", action === "climb"),
    beat("power-a", 0.23, "breakdown", "interaction", "Drive through visible resistance."),
    beat("recover-a", 0.46, "key-pose", "recovery", "Compact readable recovery."),
    beat("reach-b", 0.58, "key-pose", "contact", "Opposite reach without mirrored stiffness."),
    beat("power-b", 0.8, "breakdown", "interaction", "Second power phase preserves cadence."),
  ];
  if (["melee-attack", "ranged-attack", "cast"].includes(action)) return [
    beat("ready", 0, "key-pose", "brace", "Readable ready pose and prop ownership."),
    beat("anticipation", 0.18, "key-pose", "anticipation", "Gather force before commitment."),
    beat("wind-up", 0.34, "breakdown", "wind-up", "Escalate tension without camera drift."),
    beat("release", 0.5, "key-pose", action === "melee-attack" ? "impact" : "release", "Peak action, force direction and interaction point."),
    beat("overshoot", 0.66, "breakdown", "overshoot", "Carry momentum while protecting anatomy."),
    beat("recoil", 0.78, "key-pose", "recoil", "Credible recoil or energy dissipation."),
    beat("recovery", 0.92, "breakdown", "recovery", "Recover without a mechanical snap."),
  ];
  if (["hit-reaction", "knockdown", "get-up", "death"].includes(action)) return [
    beat("pre-impact", 0, "key-pose", "brace", "Preserve starting balance and incoming direction.", "both-feet", true),
    beat("impact", 0.2, "key-pose", "impact", "Immediate response with one clear force direction.", "body", false, { x: -0.03, y: 0 }),
    beat("collapse", 0.45, "breakdown", "collapse", "Transfer weight through credible support loss.", "body", false, { x: -0.06, y: 0.08 }),
    beat("low-point", 0.68, "key-pose", action === "get-up" ? "brace" : "collapse", "Reach the clearest low or displaced point.", "body", false, { x: -0.08, y: 0.16 }),
    beat("resolve", 0.92, "key-pose", action === "death" ? "terminal" : "recovery", action === "death" ? "Unambiguous terminal pose." : "Recover with residual weight."),
  ];
  if (action === "interact") return [
    beat("approach", 0, "key-pose", "brace", "Align to the interaction point.", "both-feet", true),
    beat("reach", 0.25, "key-pose", "interaction", "Clear hand, prop and target ownership.", "right-hand", true),
    beat("contact", 0.5, "breakdown", "contact", "Maintain exact contact geometry.", "prop", true),
    beat("response", 0.7, "key-pose", "interaction", "Show the authored response."),
    beat("withdraw", 0.9, "breakdown", "recovery", "Release contact with follow-through."),
  ];
  if (["dialogue", "emote"].includes(action)) return [
    beat("neutral", 0, "key-pose", "expression", "Stable face and body construction.", "both-feet", true),
    beat("thought", 0.24, "breakdown", "anticipation", "Preparation led by thought and breath.", "both-feet", true),
    beat("expression", 0.48, "key-pose", "expression", "Specific authored expression or gesture.", "both-feet", true),
    beat("secondary", 0.7, "breakdown", "expression", "Controlled supporting secondary action.", "both-feet", true),
    beat("settle", 0.9, "key-pose", "settle", "Resolve into a usable hold.", "both-feet", true),
  ];
  if (action === "effect") return [
    beat("origin", 0, "key-pose", "anticipation", "Define source, scale and directional force."),
    beat("ignition", 0.18, "key-pose", "release", "Fast readable onset."),
    beat("expansion", 0.42, "breakdown", "impact", "Expand along authored arcs."),
    beat("peak", 0.62, "key-pose", "overshoot", "Designed peak shape at runtime scale."),
    beat("dissipation", 0.82, "breakdown", "recovery", "Intentional decreasing-energy forms."),
    beat("clear", 0.96, "key-pose", "terminal", "Clean terminal or loop handoff."),
  ];
  return [];
}

function authoredBeats(request) {
  if (request.authoredPoseBeats?.length) return request.authoredPoseBeats.map((entry) => ({
    id: entry.id,
    phase: entry.phase,
    generationClass: entry.generationClass,
    role: entry.role,
    intent: entry.intent.trim(),
    contactAnchor: entry.contactAnchor ?? "none",
    groundContactRequired: entry.groundContactRequired ?? false,
    rootOffset: entry.rootOffset ?? { x: 0, y: 0 },
  }));
  const result = template(request.action);
  if (result.length < 2) fail("ANIMATION_PROFILE_TEMPLATE_MISSING", request.action);
  return result;
}

function drawingCount(request, totalFrames, minimum) {
  const base = request.detailLevel === "limited" ? 5 : request.detailLevel === "standard" ? 8 : 12;
  const factor = ["idle", "dialogue", "emote", "effect"].includes(request.action) ? 0.75 : ["melee-attack", "ranged-attack", "cast", "death"].includes(request.action) ? 1.25 : 1;
  return Math.min(totalFrames, Math.max(minimum, Math.round(base * factor)));
}

function expandBeats(input, count, loop) {
  const result = input.map((entry) => ({ ...entry }));
  let serial = 1;
  while (result.length < count) {
    result.sort((left, right) => left.phase - right.phase || left.id.localeCompare(right.id));
    let best = null;
    for (let index = 0; index < result.length - 1; index += 1) {
      const left = result[index];
      const right = result[index + 1];
      const gap = right.phase - left.phase;
      if (!best || gap > best.gap) best = { left, right, gap, phase: (left.phase + right.phase) / 2 };
    }
    if (loop) {
      const left = result.at(-1);
      const right = result[0];
      const gap = 1 - left.phase + right.phase;
      if (!best || gap > best.gap) best = { left, right, gap, phase: (left.phase + gap / 2) % 1 };
    }
    if (!best || best.gap <= EPSILON) break;
    result.push({
      id: `inbetween-${String(serial).padStart(3, "0")}`,
      phase: round(best.phase, 9),
      generationClass: "inbetween",
      role: "inbetween",
      intent: `Interpolate the authored arc between ${best.left.id} and ${best.right.id}; preserve identity, camera and contact authority.`,
      contactAnchor: best.left.contactAnchor === best.right.contactAnchor ? best.left.contactAnchor : "none",
      groundContactRequired: best.left.groundContactRequired && best.right.groundContactRequired,
      rootOffset: { x: round((best.left.rootOffset.x + best.right.rootOffset.x) / 2), y: round((best.left.rootOffset.y + best.right.rootOffset.y) / 2) },
    });
    serial += 1;
  }
  return result.sort((left, right) => left.phase - right.phase || left.id.localeCompare(right.id));
}

function exposures(beats, totalFrames) {
  if (beats.length > totalFrames) fail("ANIMATION_PROFILE_DRAWINGS_EXCEED_TIMELINE");
  const starts = beats.map((entry, index) => clamp(Math.floor(entry.phase * totalFrames) + 1, index + 1, totalFrames - (beats.length - index - 1)));
  return starts.map((start, index) => {
    const end = starts[index + 1] === undefined ? totalFrames : starts[index + 1] - 1;
    return { start, end, count: end - start + 1 };
  });
}

function neighbours(beats, index, loop) {
  const authored = beats.map((entry, ordinal) => ({ entry, ordinal })).filter(({ entry }) => entry.generationClass !== "inbetween");
  const previous = authored.filter(({ ordinal }) => ordinal < index).at(-1)?.entry ?? (loop ? authored.at(-1)?.entry : authored[0]?.entry);
  const next = authored.find(({ ordinal }) => ordinal > index)?.entry ?? (loop ? authored[0]?.entry : authored.at(-1)?.entry);
  if (!previous || !next) fail("ANIMATION_PROFILE_DEPENDENCY_NEIGHBOURS_MISSING");
  return { previous, next };
}

function compileDrawings(request, beats, totalFrames, playbackFps) {
  const assigned = exposures(beats, totalFrames);
  const provisional = beats.map((entry, index) => ({
    id: `${request.id}:${request.direction}:drawing-${String(index + 1).padStart(4, "0")}`,
    ordinal: index + 1,
    phase: entry.phase,
    generationClass: entry.generationClass,
    role: entry.role,
    poseId: entry.id,
    poseIntent: entry.intent,
    contactAnchor: entry.contactAnchor,
    groundContactRequired: entry.groundContactRequired,
    expectedRootOffset: entry.rootOffset,
    exposureStartFrame: assigned[index].start,
    exposureEndFrame: assigned[index].end,
    exposureFrames: assigned[index].count,
    durationMs: round((assigned[index].count / request.sourceFramesPerSecond) * 1000, 3),
    godotRelativeDuration: round((assigned[index].count * playbackFps) / request.sourceFramesPerSecond),
  }));
  return provisional.map((entry, index) => {
    const previous = provisional[index === 0 ? (request.loop ? provisional.length - 1 : 0) : index - 1];
    const next = provisional[index === provisional.length - 1 ? (request.loop ? 0 : provisional.length - 1) : index + 1];
    const dependencies = [];
    if (entry.generationClass !== "key-pose") {
      const around = neighbours(beats, index, request.loop);
      const previousAuthored = provisional[beats.indexOf(around.previous)];
      const nextAuthored = provisional[beats.indexOf(around.next)];
      dependencies.push(previousAuthored.id);
      if (nextAuthored.id !== previousAuthored.id) dependencies.push(nextAuthored.id);
    }
    return { ...entry, previousDrawingId: previous.id, nextDrawingId: next.id, dependencyDrawingIds: dependencies };
  });
}

function guidance(perspective) {
  const values = {
    "side-stage": ["horizontal travel", "vertical lift", "Lock one baseline and profile construction."],
    "top-down": ["screen x", "screen y", "Lock the root to the ground footprint and approved pitch."],
    "isometric-2-1": ["2:1 down-right", "2:1 down-left", "Lock feet to the isometric diamond coordinate."],
    "three-quarter": ["screen horizontal", "shallow depth", "Preserve near/far limb scale and camera yaw."],
    "front-stage": ["screen horizontal", "vertical", "Lock both feet and pelvis to the front baseline."],
    "first-person-overlay": ["screen x", "screen y", "Lock hands and props to the authored overlay anchor."],
    "cinematic-perspective": ["camera x", "camera depth", "Bind root and scale to approved lens geometry."],
    "custom-fixed": ["authored x", "authored depth", "Use only the exact custom camera contract."],
  };
  const [primaryAxis, secondaryAxis, rootPivotPolicy] = values[perspective];
  return {
    perspective,
    screenAxes: [primaryAxis, secondaryAxis],
    rootPivotPolicy,
    rules: [
      "Preserve camera projection, yaw, pitch, scale and ground line across every drawing.",
      "Protect silhouette, interaction points and asymmetric visual anchors.",
      "Mirror only when the request explicitly proves every asymmetric element safe.",
    ],
  };
}

function batches(request, drawings, batchSize) {
  const result = [];
  for (const phase of ["key-pose", "breakdown", "inbetween"]) {
    const selected = drawings.filter((drawing) => drawing.generationClass === phase);
    for (let offset = 0; offset < selected.length; offset += batchSize) {
      const slice = selected.slice(offset, offset + batchSize);
      result.push({
        id: `${request.id}:${phase}:batch-${String(offset / batchSize + 1).padStart(3, "0")}`,
        phase,
        drawingIds: slice.map((drawing) => drawing.id),
        dependencyDrawingIds: [...new Set(slice.flatMap((drawing) => drawing.dependencyDrawingIds))].sort(),
        maximumCandidatesPerDrawing: phase === "key-pose" ? request.iteration?.maximumCandidatesPerKey ?? 4 : phase === "breakdown" ? request.iteration?.maximumCandidatesPerBreakdown ?? 3 : request.iteration?.maximumCandidatesPerInbetween ?? 2,
      });
    }
  }
  return result;
}

function targetPlans(request, drawings, playbackFps) {
  return request.targets.map((target) => ({
    target,
    format: target === "godot-sprite" ? "godot-spriteframes+atlas" : target === "cel-sequence" ? "png-sequence+x-sheet" : "png-sequence+timing-manifest",
    timingMode: target === "godot-sprite" ? "relative-duration" : target === "cel-sequence" ? "x-sheet-exposure" : "timeline-frame-expansion",
    timelineFramesPerSecond: request.sourceFramesPerSecond,
    playbackFramesPerSecond: playbackFps,
    animationName: request.delivery.animationName,
    drawingIds: drawings.map((drawing) => drawing.id),
    exposureFrames: drawings.map((drawing) => drawing.exposureFrames),
    relativeDurations: drawings.map((drawing) => drawing.godotRelativeDuration),
    requirements: target === "godot-sprite" ? ["Preserve relative durations, pivot, alpha and filtering.", "Do not infer unsafe mirroring."] : target === "cel-sequence" ? ["Represent holds as exposure, not duplicate drawings.", "Retain key, breakdown and in-between roles."] : ["Expand authored exposure before encoding.", "Do not interpolate across holds, impacts or event frames."],
  }));
}

function qualityGates(request) {
  const exacting = request.detailLevel === "feature" || request.style.motionStyle === "cinematic-naturalistic";
  const drawing = exacting ? 0.92 : request.detailLevel === "standard" ? 0.88 : 0.84;
  const sequence = exacting ? 0.9 : request.detailLevel === "standard" ? 0.86 : 0.82;
  return {
    drawing: { identity: drawing, style: drawing, silhouette: drawing - 0.02, camera: drawing, anatomy: drawing - 0.02, palette: drawing - 0.03 },
    sequence: { timingReadability: sequence, motionReadability: sequence, styleContinuity: sequence, cameraContinuity: sequence, loopSeam: sequence },
  };
}

function planBody(plan) {
  const { contentDigest: _digest, generatedAt: _time, ...body } = plan;
  return body;
}

export function compileAnimationProductionProfile(submitted, now = new Date()) {
  const request = validateRequest(submitted);
  const totalTimelineFrames = Math.max(2, Math.round(request.durationSeconds * request.sourceFramesPerSecond));
  const playbackFramesPerSecond = request.playbackFramesPerSecond ?? (["pixel-90s", "engraved-dos"].includes(request.style.motionStyle) ? 8 : request.style.motionStyle === "vga-adventure" ? 10 : request.style.motionStyle === "cinematic-naturalistic" ? 24 : 12);
  const base = authoredBeats(request);
  const expanded = expandBeats(base, drawingCount(request, totalTimelineFrames, base.length), request.loop);
  const drawings = compileDrawings(request, expanded, totalTimelineFrames, playbackFramesPerSecond);
  const events = [...(request.events ?? [])].sort((left, right) => left.phase - right.phase || left.id.localeCompare(right.id)).map((event) => {
    const drawing = [...drawings].sort((left, right) => Math.abs(left.phase - event.phase) - Math.abs(right.phase - event.phase) || left.ordinal - right.ordinal)[0];
    return { ...event, drawingId: drawing.id, drawingOrdinal: drawing.ordinal, timelineFrame: drawing.exposureStartFrame };
  });
  const maximumBatchSize = request.iteration?.maximumBatchSize ?? 8;
  positiveInteger(maximumBatchSize, "ANIMATION_PROFILE_BATCH_SIZE_INVALID", 100);
  const warnings = [];
  if (!request.subject.directionMasterArtifactId && !["none", "camera"].includes(request.direction)) warnings.push({ code: "ANIMATION_PROFILE_DIRECTION_MASTER_MISSING", severity: "warning", remediation: "Approve the exact directional master before provider dispatch." });
  if (request.camera.motion === "authored" && request.targets.includes("godot-sprite")) warnings.push({ code: "ANIMATION_PROFILE_CAMERA_TRACK_SEPARATION_REQUIRED", severity: "warning", remediation: "Keep authored camera motion in a separate runtime/video track." });
  const body = {
    protocolVersion: PROTOCOL_VERSION,
    kind: PLAN_KIND,
    profileId: `${request.id}:r${request.revision}`,
    request,
    totalTimelineFrames,
    playbackFramesPerSecond,
    perspectiveGuidance: guidance(request.camera.perspective),
    drawings,
    events,
    generationBatches: batches(request, drawings, maximumBatchSize),
    targetPlans: targetPlans(request, drawings, playbackFramesPerSecond),
    qualityGates: qualityGates(request),
    iterationPolicy: {
      maximumAttemptsPerDrawing: request.iteration?.maximumAttemptsPerDrawing ?? 4,
      maximumReviewCycles: request.iteration?.maximumReviewCycles ?? 6,
      maximumNoProgressCycles: request.iteration?.maximumNoProgressCycles ?? 2,
      maximumBatchSize,
      regenerateRejectedDrawingsOnly: true,
      preserveAcceptedDrawings: true,
      stopOnNoProgress: true,
    },
    quality: { blockerCount: 0, warningCount: warnings.length, findings: warnings, planningValid: true, promotable: request.state === "approved" },
    authority: { providerExecution: false, automaticCreativeApproval: false, artifactPromotion: false, targetRepositoryMutation: false, gitCommit: false, gitPush: false, publication: false },
  };
  return { ...body, contentDigest: sha256(body), generatedAt: now.toISOString() };
}

export function assertAnimationProductionProfileIntegrity(plan) {
  object(plan, "ANIMATION_PROFILE_PLAN_INVALID");
  if (plan.kind !== PLAN_KIND || plan.protocolVersion !== PROTOCOL_VERSION || typeof plan.contentDigest !== "string" || !DIGEST.test(plan.contentDigest)) fail("ANIMATION_PROFILE_PLAN_PROTOCOL_INVALID");
  const time = new Date(plan.generatedAt);
  if (Number.isNaN(time.valueOf()) || time.toISOString() !== plan.generatedAt) fail("ANIMATION_PROFILE_PLAN_TIME_INVALID");
  const expected = compileAnimationProductionProfile(plan.request, time);
  if (expected.contentDigest !== plan.contentDigest || JSON.stringify(expected.drawings) !== JSON.stringify(plan.drawings)) fail("ANIMATION_PROFILE_PLAN_INTEGRITY_MISMATCH");
}

function drawingFailures(plan, evidence) {
  const failures = [];
  if (typeof evidence.artifactId !== "string" || !ARTIFACT_ID.test(evidence.artifactId)) fail("ANIMATION_PROFILE_EVIDENCE_ARTIFACT_INVALID");
  if (typeof evidence.contentDigest !== "string" || !DIGEST.test(evidence.contentDigest)) fail("ANIMATION_PROFILE_EVIDENCE_DIGEST_INVALID");
  positiveInteger(evidence.attempt, "ANIMATION_PROFILE_EVIDENCE_ATTEMPT_INVALID", 1000);
  if (evidence.width !== plan.request.delivery.canvas.width || evidence.height !== plan.request.delivery.canvas.height) failures.push(["CANVAS_MISMATCH", "Render the exact locked canvas without trimming or scaling."]);
  if (plan.request.delivery.alphaRequired && evidence.meaningfulAlpha !== true) failures.push(["ALPHA_MISSING", "Restore meaningful native alpha and transparent edges."]);
  positiveInteger(evidence.unsafeEdgeContactPixels + 1, "ANIMATION_PROFILE_EDGE_CONTACT_INVALID");
  if (evidence.unsafeEdgeContactPixels > 0) failures.push(["UNSAFE_EDGE_CONTACT", "Reframe without changing pivot, scale or pose intent."]);
  const scoreMap = { identity: "IDENTITY", style: "STYLE", silhouette: "SILHOUETTE", camera: "CAMERA", anatomy: "ANATOMY", palette: "PALETTE" };
  for (const [metric, code] of Object.entries(scoreMap)) {
    finite(evidence.scores?.[metric], `ANIMATION_PROFILE_SCORE_INVALID:${metric}`, 0, 1);
    if (evidence.scores[metric] + EPSILON < plan.qualityGates.drawing[metric]) failures.push([`${code}_BELOW_GATE`, `Repair ${metric} against the immutable approved references without altering accepted neighbours.`]);
  }
  finite(evidence.scores?.motionReadability, "ANIMATION_PROFILE_SCORE_INVALID:motionReadability", 0, 1);
  for (const finding of evidence.findings ?? []) {
    safeId(finding.code, "ANIMATION_PROFILE_FINDING_CODE_INVALID");
    member(finding.severity, ["minor", "major", "blocking"], "ANIMATION_PROFILE_FINDING_SEVERITY_INVALID");
    if (finding.severity !== "minor") failures.push([finding.code, nonBlank(finding.remediation, "ANIMATION_PROFILE_FINDING_REMEDIATION_INVALID")]);
  }
  return failures;
}

function sequenceFailures(plan, evidence) {
  const failures = [];
  if (evidence.normalSpeedReviewed !== true) failures.push(["NORMAL_SPEED_REVIEW_REQUIRED", "Review the whole sequence at authored speed."]);
  if (evidence.frameByFrameReviewed !== true) failures.push(["FRAME_REVIEW_REQUIRED", "Review every unique drawing and transition frame-by-frame."]);
  for (const metric of ["timingReadability", "motionReadability", "styleContinuity", "cameraContinuity"]) {
    finite(evidence[`${metric}Score`], `ANIMATION_PROFILE_SEQUENCE_SCORE_INVALID:${metric}`, 0, 1);
    if (evidence[`${metric}Score`] + EPSILON < plan.qualityGates.sequence[metric]) failures.push([`${metric.toUpperCase()}_BELOW_GATE`, `Repair only poses or exposures implicated in ${metric}.`]);
  }
  if (plan.request.loop) {
    finite(evidence.loopSeamScore, "ANIMATION_PROFILE_LOOP_SEAM_SCORE_INVALID", 0, 1);
    if (evidence.loopSeamScore + EPSILON < plan.qualityGates.sequence.loopSeam) failures.push(["LOOP_SEAM_BELOW_GATE", "Repair final-to-first pose, root, contact and secondary-action continuity."]);
  }
  for (const finding of evidence.findings ?? []) {
    safeId(finding.code, "ANIMATION_PROFILE_SEQUENCE_FINDING_CODE_INVALID");
    member(finding.severity, ["minor", "major", "blocking"], "ANIMATION_PROFILE_SEQUENCE_FINDING_SEVERITY_INVALID");
    if (finding.severity !== "minor") failures.push([finding.code, nonBlank(finding.remediation, "ANIMATION_PROFILE_SEQUENCE_FINDING_REMEDIATION_INVALID")]);
  }
  return failures;
}

export function reviewAnimationProductionProfile(input, now = new Date()) {
  object(input, "ANIMATION_PROFILE_REVIEW_INPUT_INVALID");
  assertAnimationProductionProfileIntegrity(input.profile);
  positiveInteger(input.cycle, "ANIMATION_PROFILE_REVIEW_CYCLE_INVALID", input.profile.iterationPolicy.maximumReviewCycles);
  const drawingMap = new Map(input.profile.drawings.map((drawing) => [drawing.id, drawing]));
  const evidenceMap = new Map();
  for (const evidence of input.drawingEvidence ?? []) {
    safeId(evidence.drawingId, "ANIMATION_PROFILE_EVIDENCE_DRAWING_INVALID");
    if (!drawingMap.has(evidence.drawingId)) fail("ANIMATION_PROFILE_EVIDENCE_DRAWING_UNKNOWN", evidence.drawingId);
    if (evidenceMap.has(evidence.drawingId)) fail("ANIMATION_PROFILE_EVIDENCE_DRAWING_DUPLICATE", evidence.drawingId);
    evidenceMap.set(evidence.drawingId, evidence);
  }
  const accepted = [];
  const reviewRequired = [];
  const rejected = new Map();
  for (const drawing of input.profile.drawings) {
    const evidence = evidenceMap.get(drawing.id);
    if (!evidence) reviewRequired.push(drawing.id);
    else {
      const failures = drawingFailures(input.profile, evidence);
      if (failures.length) rejected.set(drawing.id, failures);
      else accepted.push(drawing.id);
    }
  }
  let sequenceReviewRequired = false;
  let sequenceFailureList = [];
  if (!reviewRequired.length && !rejected.size) {
    if (!input.sequenceEvidence) sequenceReviewRequired = true;
    else sequenceFailureList = sequenceFailures(input.profile, input.sequenceEvidence);
  }
  if (sequenceFailureList.length) {
    const affected = distinctStrings(input.sequenceEvidence?.affectedDrawingIds ?? [], "ANIMATION_PROFILE_SEQUENCE_AFFECTED_INVALID");
    for (const drawingId of affected) {
      if (!drawingMap.has(drawingId)) fail("ANIMATION_PROFILE_SEQUENCE_DRAWING_UNKNOWN", drawingId);
      rejected.set(drawingId, [...(rejected.get(drawingId) ?? []), ...sequenceFailureList]);
      const index = accepted.indexOf(drawingId);
      if (index >= 0) accepted.splice(index, 1);
    }
  }
  const rejectedIds = [...rejected.keys()].sort();
  const sequenceCodes = [...new Set(sequenceFailureList.map(([code]) => code))].sort();
  const sameAsPrevious = input.previousDecision && JSON.stringify(input.previousDecision.rejectedDrawingIds) === JSON.stringify(rejectedIds) && JSON.stringify(input.previousDecision.sequenceFailureCodes) === JSON.stringify(sequenceCodes) && rejectedIds.length > 0;
  const noProgressCycles = sameAsPrevious ? input.previousDecision.noProgressCycles + 1 : 0;
  const blockers = [];
  const retryQueue = [];
  for (const drawingId of rejectedIds) {
    const evidence = evidenceMap.get(drawingId);
    if (evidence.attempt >= input.profile.iterationPolicy.maximumAttemptsPerDrawing) blockers.push(`ATTEMPT_BUDGET_EXHAUSTED:${drawingId}`);
    else retryQueue.push({
      drawingId,
      currentAttempt: evidence.attempt,
      nextAttempt: evidence.attempt + 1,
      failureCodes: [...new Set(rejected.get(drawingId).map(([code]) => code))].sort(),
      repairInstructions: [...new Set(rejected.get(drawingId).map(([, remediation]) => remediation))].sort(),
      authoritativeDependencyDrawingIds: drawingMap.get(drawingId).dependencyDrawingIds,
      preserveDrawingIds: [...accepted].sort(),
    });
  }
  if (noProgressCycles >= input.profile.iterationPolicy.maximumNoProgressCycles) blockers.push("NO_PROGRESS_BUDGET_EXHAUSTED");
  if ((rejectedIds.length || sequenceCodes.length) && input.cycle >= input.profile.iterationPolicy.maximumReviewCycles) blockers.push("REVIEW_CYCLE_BUDGET_EXHAUSTED");
  const status = blockers.length ? "blocked" : rejectedIds.length || sequenceCodes.length ? "rework-required" : reviewRequired.length || sequenceReviewRequired ? "review-required" : "accepted";
  return {
    protocolVersion: PROTOCOL_VERSION,
    kind: REVIEW_KIND,
    profileDigest: input.profile.contentDigest,
    cycle: input.cycle,
    status,
    acceptedDrawingIds: [...accepted].sort(),
    reviewRequiredDrawingIds: [...reviewRequired].sort(),
    rejectedDrawingIds: rejectedIds,
    retryQueue,
    sequenceReviewRequired,
    sequenceFailureCodes: sequenceCodes,
    rejectionFingerprint: sha256({ profileDigest: input.profile.contentDigest, rejectedIds, sequenceCodes }),
    noProgressCycles,
    blockers: [...new Set(blockers)].sort(),
    authority: { providerExecution: false, automaticCreativeApproval: false, artifactPromotion: false, runtimeActivation: false, publication: false },
    decidedAt: now.toISOString(),
  };
}

export function compileAcceptedRuntimeClip(profile, decision) {
  assertAnimationProductionProfileIntegrity(profile);
  if (decision.profileDigest !== profile.contentDigest || decision.status !== "accepted") fail("ANIMATION_PROFILE_RUNTIME_REVIEW_NOT_ACCEPTED");
  if (!profile.quality.promotable || decision.acceptedDrawingIds.length !== profile.drawings.length) fail("ANIMATION_PROFILE_RUNTIME_NOT_PROMOTABLE");
  const kind = profile.request.action === "idle" ? "idle" : ["walk", "run", "sprint"].includes(profile.request.action) ? "locomotion" : ["jump", "land", "climb", "swim", "fly", "get-up"].includes(profile.request.action) ? "traversal" : ["melee-attack", "ranged-attack", "cast", "interact"].includes(profile.request.action) ? "action" : ["hit-reaction", "knockdown"].includes(profile.request.action) ? "reaction" : profile.request.action === "death" ? "death" : profile.request.action === "dialogue" ? "dialogue" : profile.request.action === "emote" ? "emote" : profile.request.action === "effect" ? "effect" : "custom";
  return {
    id: `clip.${profile.request.delivery.animationName}`,
    animationName: profile.request.delivery.animationName,
    kind,
    direction: profile.request.direction === "camera" ? "none" : profile.request.direction,
    cameraProfileId: profile.request.camera.profileId,
    sourcePlanDigest: profile.contentDigest,
    frameCount: profile.drawings.length,
    framesPerSecond: profile.playbackFramesPerSecond,
    frameDurations: profile.drawings.map((drawing) => drawing.exposureFrames),
    loopMode: profile.request.loop ? "linear" : "none",
    ...(["walk", "run", "sprint"].includes(profile.request.action) ? { phaseFamily: `locomotion.${profile.request.direction}` } : {}),
    mirrorPolicy: profile.request.mirrorPolicy,
    asymmetricVisualAnchors: profile.request.subject.asymmetricVisualAnchors,
    markers: profile.events.map((event) => ({ id: event.id, frame: event.drawingOrdinal, kind: event.kind, ...(event.payload ? { payload: event.payload } : {}) })),
  };
}

export function nextAnimationProductionBatch(profile, completedDrawingIds = []) {
  assertAnimationProductionProfileIntegrity(profile);
  const completed = new Set(distinctStrings(completedDrawingIds, "ANIMATION_PROFILE_COMPLETED_IDS_INVALID"));
  const known = new Set(profile.drawings.map((drawing) => drawing.id));
  for (const drawingId of completed) if (!known.has(drawingId)) fail("ANIMATION_PROFILE_COMPLETED_DRAWING_UNKNOWN", drawingId);
  for (const batch of profile.generationBatches) {
    const remaining = batch.drawingIds.filter((drawingId) => !completed.has(drawingId));
    if (!remaining.length) continue;
    if (!batch.dependencyDrawingIds.every((drawingId) => completed.has(drawingId))) return null;
    return { ...batch, drawingIds: remaining };
  }
  return null;
}

function safeWorkspacePath(input) {
  const root = process.cwd();
  const absolute = resolve(root, input);
  const rel = relative(root, absolute);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return absolute;
  fail("ANIMATION_PROFILE_PATH_OUTSIDE_WORKSPACE", input);
}

async function emit(value, outputPath) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  if (!outputPath) process.stdout.write(body);
  else await writeFile(safeWorkspacePath(outputPath), body, { encoding: "utf8", flag: "wx" });
}

async function cli() {
  const [command, inputPath, outputPath] = process.argv.slice(2);
  if (!command || !inputPath || !["compile", "verify", "review", "runtime", "next-batch"].includes(command)) {
    fail("ANIMATION_PROFILE_USAGE", "node tools/animation_production_profile_v1.mjs <compile|verify|review|runtime|next-batch> <input.json> [output.json]");
  }
  const input = JSON.parse(await readFile(safeWorkspacePath(inputPath), "utf8"));
  if (command === "compile") return emit(compileAnimationProductionProfile(input), outputPath);
  if (command === "verify") {
    assertAnimationProductionProfileIntegrity(input);
    return emit({ status: "verified", profileId: input.profileId, contentDigest: input.contentDigest, promotable: input.quality.promotable }, outputPath);
  }
  if (command === "review") return emit(reviewAnimationProductionProfile(input), outputPath);
  if (command === "runtime") return emit(compileAcceptedRuntimeClip(input.profile, input.decision), outputPath);
  return emit(nextAnimationProductionBatch(input.profile, input.completedDrawingIds), outputPath);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  cli().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "error", message: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 1;
  });
}
