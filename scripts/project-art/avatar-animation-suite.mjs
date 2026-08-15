import { createHash } from 'node:crypto';
import {
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

export const AVATAR_ANIMATION_SUITE_REQUEST_SCHEMA =
  'evavo.project-art-avatar-animation-suite-request.v1';
export const AVATAR_ANIMATION_SUITE_PLAN_SCHEMA =
  'evavo.project-art-avatar-animation-suite-plan.v1';
export const AVATAR_ANIMATION_SUITE_CAPABILITIES_SCHEMA =
  'evavo.project-art-avatar-animation-suite-capabilities.v1';

const IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const ASSET_ID = /^[a-f0-9]{32}$/u;
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

const CLIPS = Object.freeze([
  clip('idle-primary', 'idle', 'loop', 16, 12, 'quiet neutral breathing'),
  clip('idle-breathe', 'idle', 'loop', 18, 12, 'subtle asymmetric breath and posture life'),
  clip('idle-weight-shift', 'idle', 'loop', 16, 12, 'small grounded weight transfer'),
  clip('idle-glance', 'idle', 'loop', 14, 12, 'brief eye-led glance returning to neutral'),
  clip('attention', 'idle', 'loop', 12, 12, 'alert neutral attention'),
  clip('listening', 'listening', 'loop', 16, 12, 'engaged listening with restrained response'),
  clip('thinking', 'thinking', 'ping-pong', 16, 12, 'considered thinking motion'),
  clip('blink-single', 'blink', 'once', 5, 20, 'natural lid close, contact and reopen'),
  clip('blink-double', 'blink', 'once', 8, 20, 'two unequal natural blinks'),
  clip('talk-in', 'talk-in', 'once', 5, 15, 'neutral-to-speaking transition'),
  clip('talk-neutral', 'talk-loop', 'loop', 16, 15, 'conversational neutral body cadence'),
  clip('talk-soft', 'talk-loop', 'loop', 16, 15, 'warm quiet conversational cadence'),
  clip('talk-engaged', 'talk-loop', 'loop', 16, 15, 'engaged forward conversational cadence'),
  clip('talk-emphasis', 'talk-emotion', 'loop', 14, 15, 'one restrained emphasis beat'),
  clip('talk-happy', 'talk-emotion', 'loop', 14, 15, 'pleased conversational cadence'),
  clip('talk-concerned', 'talk-emotion', 'loop', 14, 15, 'concerned but composed cadence'),
  clip('talk-out', 'talk-out', 'once', 5, 15, 'speaking-to-neutral transition'),
  clip('nod', 'gesture', 'once', 10, 15, 'single readable agreement nod'),
  clip('wave', 'wave', 'once', 14, 15, 'clean greeting wave with stable fingers'),
  clip('pleased', 'emotion', 'once', 12, 12, 'subtle pleased reaction'),
  clip('concerned', 'emotion', 'once', 12, 12, 'subtle concerned reaction'),
  clip('error', 'emotion', 'once', 10, 12, 'clear restrained error reaction'),
  clip('sleep', 'sleep', 'loop', 16, 8, 'calm closed-eye sleeping loop'),
  clip('wake', 'gesture', 'once', 8, 12, 'sleep-to-neutral recovery'),
]);

const MOUTH_POSES = Object.freeze([
  Object.freeze({ id: 'closed', variants: 1 }),
  Object.freeze({ id: 'slight', variants: 2 }),
  Object.freeze({ id: 'medium', variants: 2 }),
  Object.freeze({ id: 'wide', variants: 2 }),
  Object.freeze({ id: 'round', variants: 2 }),
  Object.freeze({ id: 'teeth', variants: 2 }),
]);

const EYE_POSES = Object.freeze([
  'open',
  'soft',
  'half',
  'closed',
  'glance-left',
  'glance-right',
]);

export class ProjectArtAvatarAnimationSuiteError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ProjectArtAvatarAnimationSuiteError';
    this.code = code;
  }
}

function fail(code, message = code) {
  throw new ProjectArtAvatarAnimationSuiteError(code, message);
}

function clip(id, kind, loopMode, targetFrames, fps, performance) {
  return Object.freeze({ id, kind, loopMode, targetFrames, fps, performance });
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exact(value, keys, label) {
  if (!isRecord(value)) {
    fail('PROJECT_ART_AVATAR_ANIMATION_OBJECT_INVALID', `${label} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail('PROJECT_ART_AVATAR_ANIMATION_KEYS_INVALID', `${label} keys are invalid.`);
  }
}

function id(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    fail('PROJECT_ART_AVATAR_ANIMATION_IDENTIFIER_INVALID', `${label} is invalid.`);
  }
  return value;
}

function integer(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail('PROJECT_ART_AVATAR_ANIMATION_INTEGER_INVALID', `${label} is invalid.`);
  }
  return value;
}

function timestamp(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    fail('PROJECT_ART_AVATAR_ANIMATION_TIME_INVALID', `${label} is invalid.`);
  }
  const normalized = new Date(value).toISOString();
  if (value !== normalized && value !== normalized.replace('.000Z', 'Z')) {
    fail('PROJECT_ART_AVATAR_ANIMATION_TIME_INVALID', `${label} is not canonical UTC.`);
  }
  return normalized;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

export function canonicalAvatarAnimationSuiteJson(value) {
  return JSON.stringify(canonical(value));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseAuthority(value) {
  exact(value, AUTHORITY_KEYS, 'authority');
  if (AUTHORITY_KEYS.some((key) => value[key] !== false)) {
    fail(
      'PROJECT_ART_AVATAR_ANIMATION_AUTHORITY_INVALID',
      'Avatar animation planning cannot grant production or publication authority.',
    );
  }
  return Object.freeze(Object.fromEntries(AUTHORITY_KEYS.map((key) => [key, false])));
}

function parseSource(value) {
  exact(
    value,
    [
      'provider',
      'cloudName',
      'publicId',
      'assetId',
      'version',
      'format',
      'width',
      'height',
      'bytes',
      'assetFolder',
      'secureUrl',
    ],
    'source',
  );
  if (
    value.provider !== 'cloudinary' ||
    typeof value.cloudName !== 'string' ||
    !/^[a-z0-9-]{1,64}$/u.test(value.cloudName) ||
    typeof value.publicId !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9_/-]{0,199}$/u.test(value.publicId) ||
    typeof value.assetId !== 'string' ||
    !ASSET_ID.test(value.assetId) ||
    typeof value.format !== 'string' ||
    !/^[a-z0-9]{2,8}$/u.test(value.format) ||
    typeof value.assetFolder !== 'string' ||
    value.assetFolder.length > 240
  ) {
    fail('PROJECT_ART_AVATAR_ANIMATION_SOURCE_INVALID');
  }
  let sourceUrl;
  try {
    sourceUrl = new URL(value.secureUrl);
  } catch {
    fail('PROJECT_ART_AVATAR_ANIMATION_SOURCE_INVALID');
  }
  if (
    sourceUrl.protocol !== 'https:' ||
    sourceUrl.hostname !== 'res.cloudinary.com' ||
    !sourceUrl.pathname.includes(`/${value.cloudName}/image/upload/`) ||
    !sourceUrl.pathname.endsWith(`/${value.publicId}.${value.format}`)
  ) {
    fail('PROJECT_ART_AVATAR_ANIMATION_SOURCE_INVALID');
  }
  return Object.freeze({
    ...value,
    version: integer(value.version, 'source.version', 1, Number.MAX_SAFE_INTEGER),
    width: integer(value.width, 'source.width', 1, 32768),
    height: integer(value.height, 'source.height', 1, 32768),
    bytes: integer(value.bytes, 'source.bytes', 1, 512_000_000),
    secureUrl: sourceUrl.toString(),
  });
}

function parseRequirements(value) {
  const keys = [
    'multipleIdleVariants',
    'multipleTalkVariants',
    'separatedMouthLayer',
    'separatedEyeLayer',
    'exactAudioTiming',
    'genuineTransparency',
    'fakeTransparencyGridAllowed',
    'professionalFrameAssurance',
  ];
  exact(value, keys, 'requirements');
  if (
    value.multipleIdleVariants !== 4 ||
    value.multipleTalkVariants !== 6 ||
    value.separatedMouthLayer !== true ||
    value.separatedEyeLayer !== true ||
    value.exactAudioTiming !== true ||
    value.genuineTransparency !== true ||
    value.fakeTransparencyGridAllowed !== false ||
    value.professionalFrameAssurance !== true
  ) {
    fail('PROJECT_ART_AVATAR_ANIMATION_REQUIREMENTS_INVALID');
  }
  return Object.freeze({ ...value });
}

export function parseAvatarAnimationSuiteRequest(value) {
  exact(
    value,
    [
      'schema',
      'sessionId',
      'requestedAt',
      'characterId',
      'source',
      'targetCanvas',
      'requirements',
      'authority',
    ],
    'request',
  );
  if (value.schema !== AVATAR_ANIMATION_SUITE_REQUEST_SCHEMA) {
    fail('PROJECT_ART_AVATAR_ANIMATION_SCHEMA_INVALID');
  }
  const characterId = id(value.characterId, 'characterId');
  if (!['eva-female', 'top-hat-man'].includes(characterId)) {
    fail('PROJECT_ART_AVATAR_ANIMATION_CHARACTER_INVALID');
  }
  exact(value.targetCanvas, ['width', 'height'], 'targetCanvas');
  const targetCanvas = Object.freeze({
    width: integer(value.targetCanvas.width, 'targetCanvas.width', 256, 4096),
    height: integer(value.targetCanvas.height, 'targetCanvas.height', 256, 4096),
  });
  if (targetCanvas.width !== 1024 || targetCanvas.height !== 1536) {
    fail('PROJECT_ART_AVATAR_ANIMATION_CANVAS_INVALID');
  }
  return Object.freeze({
    schema: AVATAR_ANIMATION_SUITE_REQUEST_SCHEMA,
    sessionId: id(value.sessionId, 'sessionId'),
    requestedAt: timestamp(value.requestedAt, 'requestedAt'),
    characterId,
    source: parseSource(value.source),
    targetCanvas,
    requirements: parseRequirements(value.requirements),
    authority: parseAuthority(value.authority),
  });
}

function signatureClip(characterId) {
  return characterId === 'top-hat-man'
    ? clip(
        'hat-tip',
        'gesture',
        'once',
        12,
        15,
        'polished top-hat greeting without hat geometry drift',
      )
    : clip('eva-greeting', 'gesture', 'once', 12, 15, 'warm restrained EVA greeting');
}

function identityRequirements(characterId) {
  return characterId === 'top-hat-man'
    ? Object.freeze([
        'top-hat crown height, brim ellipse and band remain registered',
        'face, moustache, costume tailoring and palette remain identity-locked',
        'hands, fingers and any cane remain anatomically stable',
      ])
    : Object.freeze([
        'face, hair silhouette, costume and palette remain identity-locked',
        'hands and fingers remain anatomically stable',
        'expression stays warm, intelligent and restrained',
      ]);
}

function compileFrameJobs(characterId, clips, identityLock) {
  const jobs = [];
  for (const entry of clips) {
    for (let ordinal = 0; ordinal < entry.targetFrames; ordinal += 1) {
      const frameNumber = String(ordinal + 1).padStart(3, '0');
      const jobId = `${characterId}-${entry.id}-${frameNumber}`;
      jobs.push(
        Object.freeze({
          jobId,
          clipId: entry.id,
          ordinal,
          frameNumber,
          phase: Number((ordinal / Math.max(1, entry.targetFrames - 1)).toFixed(6)),
          durationMs: Math.round(1000 / entry.fps),
          performance: entry.performance,
          dependencyJobIds: Object.freeze(
            ordinal === 0
              ? []
              : [
                  `${characterId}-${entry.id}-${String(ordinal).padStart(3, '0')}`,
                ],
          ),
          referenceRoles: Object.freeze([
            'canonical-identity',
            ...(ordinal > 0 ? ['previous-approved-frame'] : []),
            ...(entry.loopMode === 'loop' && ordinal === entry.targetFrames - 1
              ? ['loop-opening-frame']
              : []),
          ]),
          identityLock,
          promptContract: Object.freeze({
            oneFrameOnly: true,
            contactSheetForbidden: true,
            spriteSheetInProviderOutputForbidden: true,
            preserveCanvasAndRegistration: true,
            separatedMouthUnderlay: entry.kind.startsWith('talk-'),
            backgroundInstruction:
              'Use native file alpha when genuinely supported; otherwise use one declared flat high-chroma matte selected for low subject collision. Never draw a checkerboard, transparency grid, scenery, gradient, floor or shadow outside the character.',
          }),
          alphaMastering: Object.freeze({
            operation: 'media.background-recovery',
            strategy: 'native-alpha-or-declared-low-collision-chroma',
            admittedMattes: Object.freeze(['green', 'magenta', 'blue']),
            checkerboardRecoveryEnabled: true,
            paintedGridNeverAcceptedAsAlpha: true,
            borderConnectedSegmentationOnly: true,
            edgeColourUnmixingRequired: true,
            hiddenTransparentRgbMustBeZero: true,
          }),
          review: Object.freeze({
            frameAssuranceSchema: 'evavo.project-art-avatar-frame-assurance.v1',
            minimumIndependentInspectors: 2,
            minimumConfidence: 0.95,
            adjacentContinuityRequired: true,
            loopClosureRequired: entry.loopMode === 'loop',
          }),
        }),
      );
    }
  }
  return Object.freeze(jobs);
}

function compilePoseJobs(characterId) {
  const mouths = MOUTH_POSES.flatMap((pose) =>
    Array.from({ length: pose.variants }, (_, ordinal) =>
      Object.freeze({
        jobId: `${characterId}-mouth-${pose.id}-${ordinal + 1}`,
        layer: 'mouth',
        pose: pose.id,
        energy: pose.variants === 1 ? 'neutral' : ordinal === 0 ? 'relaxed' : 'energetic',
        registration: 'full-canvas-pixel-exact',
        transparentRgbaRequired: true,
      }),
    ),
  );
  const eyes = EYE_POSES.map((pose) =>
    Object.freeze({
      jobId: `${characterId}-eyes-${pose}`,
      layer: 'eyes',
      pose,
      registration: 'full-canvas-pixel-exact',
      transparentRgbaRequired: true,
    }),
  );
  return Object.freeze([...mouths, ...eyes]);
}

export function compileProjectArtAvatarAnimationSuite(value, options = {}) {
  const request = parseAvatarAnimationSuiteRequest(value);
  const compiledAt = timestamp(options.compiledAt, 'compiledAt');
  const clips = Object.freeze([...CLIPS, signatureClip(request.characterId)]);
  const identityLock = identityRequirements(request.characterId);
  const frameJobs = compileFrameJobs(request.characterId, clips, identityLock);
  const poseJobs = compilePoseJobs(request.characterId);
  const requestSha256 = sha256(
    Buffer.from(`${canonicalAvatarAnimationSuiteJson(request)}\n`, 'utf8'),
  );
  const body = Object.freeze({
    schema: AVATAR_ANIMATION_SUITE_PLAN_SCHEMA,
    sessionId: request.sessionId,
    characterId: request.characterId,
    requestedAt: request.requestedAt,
    compiledAt,
    requestSha256,
    source: request.source,
    targetCanvas: request.targetCanvas,
    identityLock,
    clips,
    frameJobs,
    poseJobs,
    routing: Object.freeze({
      idleVariants: Object.freeze([
        'idle-primary',
        'idle-breathe',
        'idle-weight-shift',
        'idle-glance',
      ]),
      talkVariants: Object.freeze([
        'talk-neutral',
        'talk-soft',
        'talk-engaged',
        'talk-emphasis',
        'talk-happy',
        'talk-concerned',
      ]),
      antiRepeatWindow: 2,
      speechTransitions: Object.freeze({ in: 'talk-in', out: 'talk-out' }),
      visemeLayer: 'mouth',
      exactAudioTimingSchema: 'evavo_avatar_speech_timing_v1',
      minimumVisibleMouthPoseMs: 64,
    }),
    batches: Object.freeze([
      Object.freeze({ id: 'identity-and-key-poses', maximumParallelJobs: 1 }),
      Object.freeze({ id: 'continuity-inbetweens', maximumParallelJobs: 3 }),
      Object.freeze({ id: 'registered-mouth-and-eye-layers', maximumParallelJobs: 2 }),
      Object.freeze({ id: 'alpha-mastering-and-frame-assurance', maximumParallelJobs: 4 }),
      Object.freeze({ id: 'sequence-loop-atlas-and-audio-calibration', maximumParallelJobs: 2 }),
    ]),
    qualityGates: Object.freeze({
      genuineAlphaRequired: true,
      paintedCheckerboardBlocking: true,
      tokenTransparentRimBlocking: true,
      flatMatteBlockingAfterMastering: true,
      edgeHaloBlocking: true,
      identityDriftBlocking: true,
      handAndFingerDefectsBlocking: true,
      topHatGeometryDriftBlocking: request.characterId === 'top-hat-man',
      sharedPivotAndBaselineRequired: true,
      adjacentFrameContinuityRequired: true,
      finalToFirstLoopEvidenceRequired: true,
      artAnimationRuntimeApprovalRequired: true,
    }),
    delivery: Object.freeze({
      canonicalMaster: 'png-rgba8-straight-alpha',
      runtimeFormats: Object.freeze(['webp-lossless', 'png']),
      atlasMaximumDimension: 4096,
      atlasExtrusionPixels: 2,
      transparentPaddingPixels: 2,
      trimTransparentBorders: false,
      hashBoundSequenceAndAtlas: true,
      retainLosslessMasters: true,
    }),
    counts: Object.freeze({
      clips: clips.length,
      fullCharacterFrames: frameJobs.length,
      registeredPoseLayers: poseJobs.length,
      totalPlannedImages: frameJobs.length + poseJobs.length,
      idleVariants: 4,
      talkVariants: 6,
      mouthPoses: MOUTH_POSES.length,
    }),
    status: 'executable-production-plan-ready',
    productionReady: false,
    runtimeActivationAllowed: false,
    authority: request.authority,
  });
  return Object.freeze({
    ...body,
    planSha256: sha256(
      Buffer.from(`${canonicalAvatarAnimationSuiteJson(body)}\n`, 'utf8'),
    ),
  });
}

function ordinaryFile(filePath, label) {
  const absolute = realpathSync(path.resolve(filePath));
  const metadata = lstatSync(absolute);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) {
    fail('PROJECT_ART_AVATAR_ANIMATION_FILE_INVALID', `${label} is invalid.`);
  }
  return absolute;
}

function createOnlyJson(filePath, value) {
  const absolute = path.resolve(filePath);
  const parent = realpathSync(path.dirname(absolute));
  const target = path.join(parent, path.basename(absolute));
  let descriptor;
  try {
    descriptor = openSync(target, 'wx', 0o600);
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  return target;
}

export function compileProjectArtAvatarAnimationSuiteFile({
  requestPath,
  outputPath,
  compiledAt,
}) {
  const inputPath = ordinaryFile(requestPath, 'requestPath');
  const bytes = readFileSync(inputPath);
  if (bytes.length < 2 || bytes.length > 512 * 1024) {
    fail('PROJECT_ART_AVATAR_ANIMATION_REQUEST_SIZE_INVALID');
  }
  let request;
  try {
    request = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail('PROJECT_ART_AVATAR_ANIMATION_REQUEST_JSON_INVALID');
  }
  const plan = compileProjectArtAvatarAnimationSuite(request, { compiledAt });
  createOnlyJson(outputPath, plan);
  return plan;
}

export function projectArtAvatarAnimationSuiteCapabilities() {
  return Object.freeze({
    schema: AVATAR_ANIMATION_SUITE_CAPABILITIES_SCHEMA,
    requestSchema: AVATAR_ANIMATION_SUITE_REQUEST_SCHEMA,
    planSchema: AVATAR_ANIMATION_SUITE_PLAN_SCHEMA,
    characters: Object.freeze(['eva-female', 'top-hat-man']),
    completeClipMatrix: true,
    multipleIdleVariants: 4,
    multipleTalkVariants: 6,
    separatedMouthAndEyeLayers: true,
    audioTimedVisemes: true,
    continuityLinkedFrameJobs: true,
    smartBackgroundRecovery: true,
    fakeTransparencyGridAllowed: false,
    createOnlyPlanWrites: true,
    providerExecution: false,
    candidateApproval: false,
    repositoryMutation: false,
    runtimeActivation: false,
    forcePush: false,
  });
}
