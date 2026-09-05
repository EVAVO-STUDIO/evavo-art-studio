export const TOP_HAT_V3_SUITE_CONTRACT_SCHEMA =
  'evavo.project-art-top-hat-v3-suite-contract.v1';

export const TOP_HAT_V3_CLIPS = Object.freeze([
  Object.freeze({ id: 'idle-primary', frames: 36, fps: 24, loopMode: 'loop' }),
  Object.freeze({ id: 'idle-breathe', frames: 48, fps: 24, loopMode: 'loop' }),
  Object.freeze({ id: 'idle-weight-shift', frames: 40, fps: 24, loopMode: 'loop' }),
  Object.freeze({ id: 'idle-glance', frames: 32, fps: 24, loopMode: 'loop' }),
  Object.freeze({ id: 'attention', frames: 30, fps: 24, loopMode: 'loop' }),
  Object.freeze({ id: 'listening', frames: 40, fps: 24, loopMode: 'loop' }),
  Object.freeze({ id: 'thinking', frames: 40, fps: 24, loopMode: 'ping-pong' }),
  Object.freeze({ id: 'blink-single', frames: 9, fps: 30, loopMode: 'once' }),
  Object.freeze({ id: 'blink-double', frames: 15, fps: 30, loopMode: 'once' }),
  Object.freeze({ id: 'talk-in', frames: 12, fps: 30, loopMode: 'once' }),
  Object.freeze({ id: 'talk-neutral', frames: 36, fps: 30, loopMode: 'loop' }),
  Object.freeze({ id: 'talk-soft', frames: 36, fps: 30, loopMode: 'loop' }),
  Object.freeze({ id: 'talk-engaged', frames: 36, fps: 30, loopMode: 'loop' }),
  Object.freeze({ id: 'talk-emphasis', frames: 32, fps: 30, loopMode: 'loop' }),
  Object.freeze({ id: 'talk-happy', frames: 32, fps: 30, loopMode: 'loop' }),
  Object.freeze({ id: 'talk-concerned', frames: 32, fps: 30, loopMode: 'loop' }),
  Object.freeze({ id: 'talk-out', frames: 12, fps: 30, loopMode: 'once' }),
  Object.freeze({ id: 'nod', frames: 20, fps: 30, loopMode: 'once' }),
  Object.freeze({ id: 'wave', frames: 32, fps: 30, loopMode: 'once' }),
  Object.freeze({ id: 'pleased', frames: 24, fps: 24, loopMode: 'once' }),
  Object.freeze({ id: 'concerned', frames: 24, fps: 24, loopMode: 'once' }),
  Object.freeze({ id: 'error', frames: 20, fps: 24, loopMode: 'once' }),
  Object.freeze({ id: 'sleep', frames: 48, fps: 24, loopMode: 'loop' }),
  Object.freeze({ id: 'wake', frames: 18, fps: 24, loopMode: 'once' }),
  Object.freeze({ id: 'hat-tip', frames: 28, fps: 30, loopMode: 'once', signature: true }),
]);

export const TOP_HAT_V3_COUNTS = Object.freeze({
  clips: TOP_HAT_V3_CLIPS.length,
  bodyFrames: TOP_HAT_V3_CLIPS.reduce((sum, clip) => sum + clip.frames, 0),
  registeredLayers: 17,
  foundationPoses: 6,
  suiteImages:
    TOP_HAT_V3_CLIPS.reduce((sum, clip) => sum + clip.frames, 0) + 17,
  totalArtwork:
    TOP_HAT_V3_CLIPS.reduce((sum, clip) => sum + clip.frames, 0) + 17 + 6,
});

function fail(code, detail = code) {
  const error = new Error(`${code}:${detail}`);
  error.code = code;
  throw error;
}

function bodyClips(plan) {
  const phase = plan?.phases?.find?.((entry) => entry.id === 'body-clips');
  if (!phase || !Array.isArray(phase.clips)) {
    fail('TOP_HAT_V3_SUITE_BODY_CLIPS_MISSING');
  }
  return phase.clips;
}

export function assertTopHatV3GenerationPlanContract(plan) {
  if (
    !plan ||
    plan.schema !== 'evavo_top_hat_v3_generation_plan_v1' ||
    plan.characterId !== 'top-hat-man' ||
    plan.counts?.clips !== 25 ||
    plan.counts?.bodyFrames !== 732 ||
    plan.counts?.registeredLayers !== 17 ||
    plan.counts?.foundationPoses !== 6 ||
    plan.counts?.totalArtwork !== 755
  ) {
    fail('TOP_HAT_V3_SUITE_PLAN_COUNTS_INVALID');
  }
  const clips = bodyClips(plan);
  if (clips.length !== TOP_HAT_V3_CLIPS.length) {
    fail('TOP_HAT_V3_SUITE_CLIP_COUNT_INVALID');
  }
  for (let index = 0; index < TOP_HAT_V3_CLIPS.length; index += 1) {
    const expected = TOP_HAT_V3_CLIPS[index];
    const actual = clips[index];
    if (
      actual?.clipId !== expected.id ||
      actual?.targetFrames !== expected.frames ||
      actual?.fps !== expected.fps ||
      actual?.loopMode !== expected.loopMode
    ) {
      fail('TOP_HAT_V3_SUITE_CLIP_MISMATCH', expected.id);
    }
  }
  if (clips.at(-1)?.clipId !== 'hat-tip') {
    fail('TOP_HAT_V3_SUITE_SIGNATURE_CLIP_MISSING');
  }
  return Object.freeze({
    schema: TOP_HAT_V3_SUITE_CONTRACT_SCHEMA,
    characterId: 'top-hat-man',
    clipCount: 25,
    bodyFrameCount: 732,
    registeredLayerCount: 17,
    foundationPoseCount: 6,
    totalArtworkCount: 755,
    signatureClipId: 'hat-tip',
    signatureClipFrames: 28,
    signatureClipFps: 30,
  });
}
