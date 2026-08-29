import {
  ANIMATION_RUNTIME_DIRECTIONS,
  ANIMATION_RUNTIME_LOOP_MODES,
  ANIMATION_RUNTIME_MARKER_KINDS,
  ANIMATION_RUNTIME_MIRROR_POLICIES,
  ANIMATION_RUNTIME_STATE_KINDS,
  type AnimationRuntimeClip,
  type AnimationRuntimeFinding,
  type AnimationRuntimeGraphRequest,
  type AnimationRuntimeState,
} from "./animation-runtime-graph-types.js";
import {
  ANIMATION_RUNTIME_DIGEST_PATTERN,
  assertAnimationRuntimePositiveInteger,
  assertAnimationRuntimeSafeId,
  assertFinitePositive,
  finding,
} from "./animation-runtime-graph-validation-common.js";

export function validateClips(
  request: AnimationRuntimeGraphRequest,
  findings: AnimationRuntimeFinding[],
): ReadonlyMap<string, AnimationRuntimeClip> {
  const map = new Map<string, AnimationRuntimeClip>();
  const animationNames = new Map<string, string>();
  for (const [index, clip] of request.clips.entries()) {
    const path = `clips[${index}]`;
    assertAnimationRuntimeSafeId(clip.id, `ANIMATION_RUNTIME_CLIP_ID_INVALID:${index}`);
    assertAnimationRuntimeSafeId(clip.animationName, `ANIMATION_RUNTIME_CLIP_ANIMATION_NAME_INVALID:${index}`);
    assertAnimationRuntimeSafeId(clip.cameraProfileId, `ANIMATION_RUNTIME_CLIP_CAMERA_PROFILE_ID_INVALID:${index}`);
    if (map.has(clip.id)) throw new Error(`ANIMATION_RUNTIME_CLIP_ID_DUPLICATE:${clip.id}`);
    const existingAnimationName = animationNames.get(clip.animationName);
    if (existingAnimationName) {
      throw new Error(
        `ANIMATION_RUNTIME_CLIP_ANIMATION_NAME_DUPLICATE:${clip.animationName}:${existingAnimationName}:${clip.id}`,
      );
    }
    animationNames.set(clip.animationName, clip.id);
    if (!ANIMATION_RUNTIME_STATE_KINDS.includes(clip.kind)) {
      throw new Error(`ANIMATION_RUNTIME_CLIP_KIND_INVALID:${clip.id}`);
    }
    if (!ANIMATION_RUNTIME_DIRECTIONS.includes(clip.direction)) {
      throw new Error(`ANIMATION_RUNTIME_CLIP_DIRECTION_INVALID:${clip.id}`);
    }
    if (!ANIMATION_RUNTIME_LOOP_MODES.includes(clip.loopMode)) {
      throw new Error(`ANIMATION_RUNTIME_CLIP_LOOP_MODE_INVALID:${clip.id}`);
    }
    if (!ANIMATION_RUNTIME_MIRROR_POLICIES.includes(clip.mirrorPolicy)) {
      throw new Error(`ANIMATION_RUNTIME_CLIP_MIRROR_POLICY_INVALID:${clip.id}`);
    }
    if (!ANIMATION_RUNTIME_DIGEST_PATTERN.test(clip.sourcePlanDigest)) {
      throw new Error(`ANIMATION_RUNTIME_CLIP_SOURCE_DIGEST_INVALID:${clip.id}`);
    }
    assertAnimationRuntimePositiveInteger(clip.frameCount, `ANIMATION_RUNTIME_CLIP_FRAME_COUNT_INVALID:${clip.id}`, 10_000);
    assertFinitePositive(clip.framesPerSecond, `ANIMATION_RUNTIME_CLIP_FPS_INVALID:${clip.id}`, 240);
    if (clip.frameDurations.length !== clip.frameCount) {
      throw new Error(`ANIMATION_RUNTIME_CLIP_DURATION_COUNT_MISMATCH:${clip.id}`);
    }
    for (const [durationIndex, duration] of clip.frameDurations.entries()) {
      assertAnimationRuntimePositiveInteger(
        duration,
        `ANIMATION_RUNTIME_CLIP_DURATION_INVALID:${clip.id}:${durationIndex}`,
        10_000,
      );
    }
    if (clip.cameraProfileId !== request.cameraProfileId) {
      finding(
        findings,
        "ANIMATION_RUNTIME_CAMERA_PROFILE_MISMATCH",
        "blocking",
        `${path}.cameraProfileId`,
        `Clip ${clip.id} uses camera profile ${clip.cameraProfileId}, not graph camera ${request.cameraProfileId}.`,
        "Recompile the clip for the graph camera instead of mixing incompatible perspectives.",
      );
    }
    if (clip.phaseFamily !== undefined) {
      assertAnimationRuntimeSafeId(clip.phaseFamily, `ANIMATION_RUNTIME_CLIP_PHASE_FAMILY_INVALID:${clip.id}`);
      if (clip.loopMode === "none") {
        finding(
          findings,
          "ANIMATION_RUNTIME_NON_LOOP_PHASE_FAMILY",
          "warning",
          `${path}.phaseFamily`,
          `Non-looping clip ${clip.id} declares a cycle phase family.`,
          "Remove the phase family unless the clip participates in a deliberate cyclic transition.",
        );
      }
    }
    if (new Set(clip.asymmetricVisualAnchors).size !== clip.asymmetricVisualAnchors.length) {
      throw new Error(`ANIMATION_RUNTIME_CLIP_ASYMMETRY_DUPLICATE:${clip.id}`);
    }
    for (const anchor of clip.asymmetricVisualAnchors) {
      if (!anchor) throw new Error(`ANIMATION_RUNTIME_CLIP_ASYMMETRY_INVALID:${clip.id}`);
    }
    if (clip.mirrorPolicy === "safe-horizontal" && clip.asymmetricVisualAnchors.length > 0) {
      finding(
        findings,
        "ANIMATION_RUNTIME_UNSAFE_MIRROR_POLICY",
        "blocking",
        `${path}.mirrorPolicy`,
        `Clip ${clip.id} allows horizontal mirroring despite asymmetric visual anchors.`,
        "Author the opposite direction or remove all asymmetry before declaring the clip safe to mirror.",
      );
    }
    const markerIds = new Set<string>();
    for (const [markerIndex, marker] of clip.markers.entries()) {
      assertAnimationRuntimeSafeId(marker.id, `ANIMATION_RUNTIME_MARKER_ID_INVALID:${clip.id}:${markerIndex}`);
      assertAnimationRuntimePositiveInteger(marker.frame, `ANIMATION_RUNTIME_MARKER_FRAME_INVALID:${clip.id}:${marker.id}`);
      if (marker.frame > clip.frameCount) {
        throw new Error(`ANIMATION_RUNTIME_MARKER_OUTSIDE_CLIP:${clip.id}:${marker.id}`);
      }
      if (!ANIMATION_RUNTIME_MARKER_KINDS.includes(marker.kind)) {
        throw new Error(`ANIMATION_RUNTIME_MARKER_KIND_INVALID:${clip.id}:${marker.id}`);
      }
      if (markerIds.has(marker.id)) throw new Error(`ANIMATION_RUNTIME_MARKER_ID_DUPLICATE:${clip.id}:${marker.id}`);
      markerIds.add(marker.id);
      if (marker.payload !== undefined && !marker.payload.trim()) {
        throw new Error(`ANIMATION_RUNTIME_MARKER_PAYLOAD_INVALID:${clip.id}:${marker.id}`);
      }
    }
    map.set(clip.id, clip);
  }
  return map;
}

export function validateStates(
  request: AnimationRuntimeGraphRequest,
  clips: ReadonlyMap<string, AnimationRuntimeClip>,
  findings: AnimationRuntimeFinding[],
): ReadonlyMap<string, AnimationRuntimeState> {
  const map = new Map<string, AnimationRuntimeState>();
  for (const [index, state] of request.states.entries()) {
    assertAnimationRuntimeSafeId(state.id, `ANIMATION_RUNTIME_STATE_ID_INVALID:${index}`);
    assertAnimationRuntimeSafeId(state.clipId, `ANIMATION_RUNTIME_STATE_CLIP_ID_INVALID:${index}`);
    if (map.has(state.id)) throw new Error(`ANIMATION_RUNTIME_STATE_ID_DUPLICATE:${state.id}`);
    const clip = clips.get(state.clipId);
    if (!clip) throw new Error(`ANIMATION_RUNTIME_STATE_CLIP_UNKNOWN:${state.id}:${state.clipId}`);
    assertAnimationRuntimePositiveInteger(state.entryFrame, `ANIMATION_RUNTIME_STATE_ENTRY_FRAME_INVALID:${state.id}`);
    if (state.entryFrame > clip.frameCount) {
      throw new Error(`ANIMATION_RUNTIME_STATE_ENTRY_FRAME_OUTSIDE_CLIP:${state.id}`);
    }
    assertFinitePositive(state.speedScale, `ANIMATION_RUNTIME_STATE_SPEED_SCALE_INVALID:${state.id}`, 16);
    if (typeof state.terminal !== "boolean") {
      throw new Error(`ANIMATION_RUNTIME_STATE_TERMINAL_INVALID:${state.id}`);
    }
    if (state.terminal && clip.loopMode !== "none") {
      finding(
        findings,
        "ANIMATION_RUNTIME_TERMINAL_STATE_LOOPS",
        "blocking",
        `states.${state.id}.terminal`,
        `Terminal state ${state.id} binds looping clip ${clip.id}.`,
        "Use a non-looping terminal clip so final-state playback cannot wrap unexpectedly.",
      );
    }
    if (clip.kind === "death" && !state.terminal) {
      finding(
        findings,
        "ANIMATION_RUNTIME_DEATH_STATE_NOT_TERMINAL",
        "blocking",
        `states.${state.id}.terminal`,
        `Death clip ${clip.id} is bound to non-terminal state ${state.id}.`,
        "Mark death states terminal and exclude them from wildcard transitions.",
      );
    }
    map.set(state.id, state);
  }
  if (!map.has(request.initialStateId)) throw new Error("ANIMATION_RUNTIME_GRAPH_INITIAL_STATE_UNKNOWN");
  return map;
}
