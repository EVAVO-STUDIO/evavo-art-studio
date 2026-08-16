export const AVATAR_DISPLAY_BRIDGE_REQUEST_SCHEMA =
  'evavo.project-art-avatar-display-bridge-request.v1';
export const AVATAR_DISPLAY_BRIDGE_PLAN_SCHEMA =
  'evavo.project-art-avatar-display-bridge-plan.v1';
export const AVATAR_DISPLAY_CADENCE_SCHEMA =
  'evavo_avatar_display_cadence_v2';

export const AVATAR_DISPLAY_BRIDGE_CONSTANTS = Object.freeze({
  minimumAuthoredFps: 24,
  preferredAuthoredFps: 30,
  displayTargetFps: 60,
  minimumBlendWindowMs: 80,
  maximumBlendWindowMs: 560,
  blendWindowRatio: 0.78,
  interpolationEasing: 'smootherstep',
  droppedFramePolicy: 'sample-current-logical-time-never-catch-up-burst',
});

const IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const LOOP_MODES = new Set(['once', 'loop', 'ping-pong']);
const AUTHORITY_KEYS = Object.freeze([
  'providerExecution',
  'candidateApproval',
  'candidatePromotion',
  'sourceMutation',
  'repositoryMutation',
  'gitCommit',
  'gitPush',
  'publication',
  'runtimeActivation',
  'deployment',
  'forcePush',
]);

export class ProjectArtAvatarDisplayBridgeError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ProjectArtAvatarDisplayBridgeError';
    this.code = code;
  }
}

function fail(code, message = code) {
  throw new ProjectArtAvatarDisplayBridgeError(code, message);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exact(value, keys, label) {
  if (!isRecord(value)) {
    fail('PROJECT_ART_AVATAR_DISPLAY_OBJECT_INVALID', `${label} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail('PROJECT_ART_AVATAR_DISPLAY_KEYS_INVALID', `${label} keys are invalid.`);
  }
}

function identifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    fail('PROJECT_ART_AVATAR_DISPLAY_IDENTIFIER_INVALID', `${label} is invalid.`);
  }
  return value;
}

function integer(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail('PROJECT_ART_AVATAR_DISPLAY_INTEGER_INVALID', `${label} is invalid.`);
  }
  return value;
}

function finite(value, label, minimum, maximum) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    fail('PROJECT_ART_AVATAR_DISPLAY_NUMBER_INVALID', `${label} is invalid.`);
  }
  return value;
}

function parseAuthority(value) {
  exact(value, AUTHORITY_KEYS, 'authority');
  if (AUTHORITY_KEYS.some((key) => value[key] !== false)) {
    fail(
      'PROJECT_ART_AVATAR_DISPLAY_AUTHORITY_INVALID',
      'A display bridge cannot approve art, mutate repositories, activate a runtime or publish.',
    );
  }
  return Object.freeze(Object.fromEntries(AUTHORITY_KEYS.map((key) => [key, false])));
}

function parseFrame(value, index) {
  exact(value, ['frameId', 'durationMs', 'approved'], `frames[${index}]`);
  if (value.approved !== true) {
    fail(
      'PROJECT_ART_AVATAR_DISPLAY_FRAME_UNAPPROVED',
      `frames[${index}] must be explicitly approved before runtime bridging.`,
    );
  }
  return Object.freeze({
    frameId: identifier(value.frameId, `frames[${index}].frameId`),
    durationMs: finite(value.durationMs, `frames[${index}].durationMs`, 1, 60_000),
    approved: true,
  });
}

function blendWindow(durationMs) {
  return Math.min(
    durationMs,
    Math.max(
      AVATAR_DISPLAY_BRIDGE_CONSTANTS.minimumBlendWindowMs,
      Math.min(
        AVATAR_DISPLAY_BRIDGE_CONSTANTS.maximumBlendWindowMs,
        durationMs * AVATAR_DISPLAY_BRIDGE_CONSTANTS.blendWindowRatio,
      ),
    ),
  );
}

export function compileProjectArtAvatarDisplayBridge(value) {
  exact(
    value,
    [
      'schema',
      'characterId',
      'clipId',
      'loopMode',
      'authoredFps',
      'frames',
      'registeredMouthLayer',
      'authority',
    ],
    'request',
  );
  if (value.schema !== AVATAR_DISPLAY_BRIDGE_REQUEST_SCHEMA) {
    fail('PROJECT_ART_AVATAR_DISPLAY_SCHEMA_INVALID');
  }
  const characterId = identifier(value.characterId, 'characterId');
  if (!['eva-female', 'top-hat-man'].includes(characterId)) {
    fail('PROJECT_ART_AVATAR_DISPLAY_CHARACTER_INVALID');
  }
  const clipId = identifier(value.clipId, 'clipId');
  if (!LOOP_MODES.has(value.loopMode)) {
    fail('PROJECT_ART_AVATAR_DISPLAY_LOOP_MODE_INVALID');
  }
  const authoredFps = integer(
    value.authoredFps,
    'authoredFps',
    AVATAR_DISPLAY_BRIDGE_CONSTANTS.minimumAuthoredFps,
    AVATAR_DISPLAY_BRIDGE_CONSTANTS.preferredAuthoredFps,
  );
  if (!Array.isArray(value.frames) || value.frames.length < 2 || value.frames.length > 4_096) {
    fail('PROJECT_ART_AVATAR_DISPLAY_FRAMES_INVALID');
  }
  const frames = Object.freeze(value.frames.map(parseFrame));
  if (new Set(frames.map((frame) => frame.frameId)).size !== frames.length) {
    fail('PROJECT_ART_AVATAR_DISPLAY_FRAME_ID_DUPLICATE');
  }
  exact(
    value.registeredMouthLayer,
    ['enabled', 'registration', 'audioTimingRequired', 'minimumVisibleMs'],
    'registeredMouthLayer',
  );
  if (
    value.registeredMouthLayer.enabled !== true ||
    value.registeredMouthLayer.registration !== 'full-canvas-pixel-exact' ||
    value.registeredMouthLayer.audioTimingRequired !== true ||
    value.registeredMouthLayer.minimumVisibleMs !== 64
  ) {
    fail('PROJECT_ART_AVATAR_DISPLAY_MOUTH_LAYER_INVALID');
  }
  const authority = parseAuthority(value.authority);
  const frameDurationMs = 1_000 / authoredFps;
  const transitionWindows = Object.freeze(
    frames.map((frame) =>
      Object.freeze({
        frameId: frame.frameId,
        durationMs: frame.durationMs,
        blendWindowMs: blendWindow(frame.durationMs),
        continuousTransitionCoverage:
          blendWindow(frame.durationMs) / frame.durationMs,
      }),
    ),
  );

  return Object.freeze({
    schema: AVATAR_DISPLAY_BRIDGE_PLAN_SCHEMA,
    characterId,
    clipId,
    loopMode: value.loopMode,
    authoredFps,
    authoredFrameDurationMs: frameDurationMs,
    frames,
    transitionWindows,
    cadence: Object.freeze({
      schema: AVATAR_DISPLAY_CADENCE_SCHEMA,
      ...AVATAR_DISPLAY_BRIDGE_CONSTANTS,
      browserRefreshSynchronized: true,
      continuousPoseInterpolation: true,
      duplicateVisualFrameBlendSuppressed: true,
      wholeBodyVisemeCrossfadeForbidden: true,
      registeredMouthLayerKeepsBodyCadenceIndependent: true,
      reducedMotionUsesNeutralFrame: true,
      syntheticFrameGeneration: false,
    }),
    registeredMouthLayer: Object.freeze({ ...value.registeredMouthLayer }),
    qualityGates: Object.freeze({
      genuineAlphaRequired: true,
      paintedCheckerboardBlocking: true,
      hiddenRgbUnderZeroAlphaBlocking: true,
      visibleCanvasEdgeBlocking: true,
      identityDriftBlocking: true,
      adjacentFrameContinuityRequired: true,
      finalToFirstLoopEvidenceRequired: value.loopMode !== 'once',
    }),
    runtimeActivationAllowed: false,
    productionReady: false,
    authority,
  });
}

export function projectArtAvatarDisplayBridgeCapabilities() {
  return Object.freeze({
    schema: 'evavo.project-art-avatar-display-bridge-capabilities.v1',
    requestSchema: AVATAR_DISPLAY_BRIDGE_REQUEST_SCHEMA,
    planSchema: AVATAR_DISPLAY_BRIDGE_PLAN_SCHEMA,
    cadenceSchema: AVATAR_DISPLAY_CADENCE_SCHEMA,
    ...AVATAR_DISPLAY_BRIDGE_CONSTANTS,
    continuousPoseInterpolation: true,
    wholeBodyVisemeCrossfadeForbidden: true,
    registeredMouthLayerKeepsBodyCadenceIndependent: true,
    genuineAlphaRequired: true,
    fakeTransparencyGridAllowed: false,
    providerExecution: false,
    candidateApproval: false,
    candidatePromotion: false,
    repositoryMutation: false,
    runtimeActivation: false,
    deployment: false,
    publication: false,
    forcePush: false,
  });
}
