import path from 'node:path';

import {
  AUTHORITY_KEYS,
  AVATAR_SEQUENCE_LOOP_EVIDENCE_TARGET_SCHEMA,
  AVATAR_SEQUENCE_PACK_TARGET_SCHEMA,
  CLIP_KINDS,
  LIMITS,
  LOOP_MODES,
  PROJECT_ART_AVATAR_SEQUENCE_PLAN_SCHEMA,
  PROJECT_ART_LOOP_CLOSURE_REQUEST_SCHEMA,
  REVIEW_DISCIPLINES,
  RUNTIME_AUTHORITY_KEYS,
  boundedInteger,
  boundedString,
  canonicalJson,
  canonicalPath,
  digest,
  exactKeys,
  fail,
  finiteNumber,
  hashBytes,
  identifier,
  isRecord,
  reviewedTargetPath,
  timestamp,
} from './avatar-sequence-common.mjs';
import { directory } from './avatar-sequence-filesystem.mjs';

const PLAN_KEYS = Object.freeze([
  'schema',
  'planId',
  'assignmentId',
  'characterId',
  'revision',
  'purpose',
  'compiledAt',
  'requestSha256',
  'requestCanonicalSha256',
  'assignment',
  'workspace',
  'sourceSummary',
  'sources',
  'workspaceFilePlanRequest',
  'runtimeDraft',
  'loopClosureRequests',
  'finalizationRequirements',
  'effects',
  'limits',
  'authority',
  'documentSha256',
]);
const EFFECT_KEYS = Object.freeze([
  'sourceMutation',
  'sourceDeletion',
  'targetImageWrite',
  'providerExecution',
  'candidateApproval',
  'candidatePromotion',
  'targetRepositoryMutation',
  'gitCommit',
  'gitPush',
  'publication',
  'deployment',
  'forcePush',
]);

function sameJson(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function assertFalseRecord(value, keys, label, code) {
  exactKeys(value, keys, label, code);
  for (const key of keys) {
    if (value[key] !== false) {
      fail(code, `${label}.${key} must remain false.`);
    }
  }
  return value;
}

function requireArray(value, label, minimum, maximum) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID', `${label} is invalid.`);
  }
  return value;
}

function requireTrue(value, label) {
  if (value !== true) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID', `${label} must be true.`);
  }
}

function requireFalse(value, label) {
  if (value !== false) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_AUTHORITY_ESCALATION', `${label} must remain false.`);
  }
}

function parseImage(value, label, canvas) {
  exactKeys(
    value,
    [
      'format',
      'width',
      'height',
      'bitDepth',
      'colourType',
      'alphaChannel',
      'animated',
      'interlaced',
    ],
    label,
    'PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID',
  );
  if (
    value.format !== 'png' ||
    value.width !== canvas.width ||
    value.height !== canvas.height ||
    value.bitDepth !== 8 ||
    ![4, 6].includes(value.colourType) ||
    value.alphaChannel !== true ||
    value.animated !== false ||
    value.interlaced !== false
  ) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID', `${label} drifted.`);
  }
  return value;
}

function parseMap(value, clipIds, label) {
  if (!isRecord(value) || Object.keys(value).length > LIMITS.maximumMapEntries) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID', `${label} is invalid.`);
  }
  const result = {};
  for (const [key, rawClipId] of Object.entries(value)) {
    const canonicalKey = identifier(key, `${label}.${key}`);
    const clipId = identifier(rawClipId, `${label}.${key}`);
    if (!clipIds.has(clipId)) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID', `${label}.${canonicalKey} is unknown.`);
    }
    result[canonicalKey] = clipId;
  }
  return result;
}

function verifyDefaults(value, clipsById) {
  exactKeys(
    value,
    ['idleClipId', 'talk', 'presence', 'events', 'emotions'],
    'runtimeDraft.defaults',
    'PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID',
  );
  exactKeys(
    value.talk,
    ['inClipId', 'loopClipId', 'outClipId'],
    'runtimeDraft.defaults.talk',
    'PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID',
  );
  const clipIds = new Set(clipsById.keys());
  const idleClipId = identifier(value.idleClipId, 'runtimeDraft.defaults.idleClipId');
  const talk = {
    inClipId: identifier(value.talk.inClipId, 'runtimeDraft.defaults.talk.inClipId'),
    loopClipId: identifier(
      value.talk.loopClipId,
      'runtimeDraft.defaults.talk.loopClipId',
    ),
    outClipId: identifier(value.talk.outClipId, 'runtimeDraft.defaults.talk.outClipId'),
  };
  for (const clipId of [idleClipId, ...Object.values(talk)]) {
    if (!clipIds.has(clipId)) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID', `Default clip ${clipId} is unknown.`);
    }
  }
  const expectedKinds = [
    [idleClipId, 'idle', 'loop'],
    [talk.inClipId, 'talk-in', 'once'],
    [talk.loopClipId, 'talk-loop', 'loop'],
    [talk.outClipId, 'talk-out', 'once'],
  ];
  for (const [clipId, kind, loopMode] of expectedKinds) {
    const clip = clipsById.get(clipId);
    if (clip.kind !== kind || clip.loopMode !== loopMode) {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID',
        `Default clip ${clipId} does not preserve ${kind}/${loopMode}.`,
      );
    }
  }
  return {
    idleClipId,
    talk,
    presence: parseMap(value.presence, clipIds, 'runtimeDraft.defaults.presence'),
    events: parseMap(value.events, clipIds, 'runtimeDraft.defaults.events'),
    emotions: parseMap(value.emotions, clipIds, 'runtimeDraft.defaults.emotions'),
  };
}

function verifyThresholds(value, label) {
  exactKeys(
    value,
    [
      'maximumChangedFraction',
      'maximumMeanChannelDelta',
      'maximumAlphaChangedFraction',
      'maximumCentroidShiftPixels',
    ],
    label,
    'PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID',
  );
  finiteNumber(value.maximumChangedFraction, `${label}.maximumChangedFraction`, 0, 1);
  finiteNumber(value.maximumMeanChannelDelta, `${label}.maximumMeanChannelDelta`, 0, 255);
  finiteNumber(
    value.maximumAlphaChangedFraction,
    `${label}.maximumAlphaChangedFraction`,
    0,
    1,
  );
  finiteNumber(
    value.maximumCentroidShiftPixels,
    `${label}.maximumCentroidShiftPixels`,
    0,
    1_000_000,
  );
}

function verifyLoopRequest(entry, clip, framesById, characterId, canvas, index) {
  exactKeys(
    entry,
    ['clipId', 'request', 'requestCanonicalSha256'],
    `loopClosureRequests[${index}]`,
    'PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID',
  );
  if (entry.clipId !== clip.id) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID', 'Loop request clip ordering drifted.');
  }
  const request = entry.request;
  exactKeys(
    request,
    [
      'schema',
      'reviewId',
      'projectId',
      'purpose',
      'frames',
      'expected',
      'thresholds',
      'preview',
      'authority',
    ],
    `loopClosureRequests[${index}].request`,
    'PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID',
  );
  if (
    request.schema !== PROJECT_ART_LOOP_CLOSURE_REQUEST_SCHEMA ||
    request.projectId !== characterId
  ) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID', 'Loop request identity drifted.');
  }
  identifier(request.reviewId, `loopClosureRequests[${index}].request.reviewId`);
  boundedString(request.purpose, `loopClosureRequests[${index}].request.purpose`, 8192);
  requireArray(
    request.frames,
    `loopClosureRequests[${index}].request.frames`,
    clip.frames.length,
    clip.frames.length,
  );
  const expectedFrames = clip.frames.map((frame) => {
    const admitted = framesById.get(frame.frameId);
    return { path: admitted.path, expectedSha256: admitted.sha256 };
  });
  if (!sameJson(request.frames, expectedFrames)) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID', 'Loop request frame identity drifted.');
  }
  if (!sameJson(request.expected, { ...canvas, requireAlpha: true })) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID', 'Loop request canvas drifted.');
  }
  verifyThresholds(request.thresholds, `loopClosureRequests[${index}].request.thresholds`);
  if (
    !sameJson(request.preview, {
      difference: true,
      overlay: true,
      onionSkin: true,
    })
  ) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID', 'Loop request preview contract drifted.');
  }
  assertFalseRecord(
    request.authority,
    AUTHORITY_KEYS,
    `loopClosureRequests[${index}].request.authority`,
    'PROJECT_ART_AVATAR_SEQUENCE_PLAN_AUTHORITY_ESCALATION',
  );
  if (
    digest(
      entry.requestCanonicalSha256,
      `loopClosureRequests[${index}].requestCanonicalSha256`,
    ) !== hashBytes(Buffer.from(canonicalJson(request), 'utf8'))
  ) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID',
      'Loop request canonical SHA-256 drifted.',
    );
  }
}

export function verifyProjectArtAvatarSequencePlan(value, options = {}) {
  exactKeys(
    value,
    PLAN_KEYS,
    'plan',
    'PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID',
  );
  if (value.schema !== PROJECT_ART_AVATAR_SEQUENCE_PLAN_SCHEMA) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID', 'Unsupported mastering plan schema.');
  }
  const suppliedHash = digest(value.documentSha256, 'plan.documentSha256');
  const body = { ...value };
  delete body.documentSha256;
  if (hashBytes(Buffer.from(canonicalJson(body), 'utf8')) !== suppliedHash) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_HASH_MISMATCH');
  }

  const assignmentId = identifier(value.assignmentId, 'plan.assignmentId');
  const characterId = identifier(value.characterId, 'plan.characterId');
  const revision = boundedInteger(value.revision, 'plan.revision', 1, 1_000_000);
  boundedString(value.purpose, 'plan.purpose', 8192);
  timestamp(value.compiledAt, 'plan.compiledAt');
  digest(value.requestSha256, 'plan.requestSha256');
  const requestCanonicalSha256 = digest(
    value.requestCanonicalSha256,
    'plan.requestCanonicalSha256',
  );
  if (value.planId !== `avatar-sequence-${requestCanonicalSha256.slice(0, 24)}`) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID', 'planId drifted.');
  }

  exactKeys(
    value.assignment,
    ['mode', 'semanticInferencePerformed', 'timestampOrderingUsedAsSemantics'],
    'plan.assignment',
    'PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID',
  );
  if (
    value.assignment.mode !== 'owner-declared-only' ||
    value.assignment.semanticInferencePerformed !== false ||
    value.assignment.timestampOrderingUsedAsSemantics !== false
  ) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_PLAN_AUTHORITY_ESCALATION',
      'Plan semantics must remain explicitly owner-declared.',
    );
  }

  exactKeys(
    value.workspace,
    ['root', 'sourcePathsAreRelative', 'symbolicLinksAllowed', 'hardLinkedSourcesAllowed'],
    'plan.workspace',
    'PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID',
  );
  const workspaceRoot = directory(value.workspace.root, 'plan.workspace.root');
  if (path.normalize(workspaceRoot) !== path.normalize(value.workspace.root)) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_STALE', 'Workspace root identity drifted.');
  }
  if (
    options.workspaceRoot !== undefined &&
    path.normalize(path.resolve(options.workspaceRoot)) !== path.normalize(workspaceRoot)
  ) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_STALE', 'Requested workspace root differs.');
  }
  requireTrue(value.workspace.sourcePathsAreRelative, 'plan.workspace.sourcePathsAreRelative');
  requireFalse(value.workspace.symbolicLinksAllowed, 'plan.workspace.symbolicLinksAllowed');
  requireFalse(value.workspace.hardLinkedSourcesAllowed, 'plan.workspace.hardLinkedSourcesAllowed');

  exactKeys(
    value.sourceSummary,
    [
      'frameCount',
      'clipCount',
      'loopClipCount',
      'totalSourceBytes',
      'totalDecodedPixels',
      'sourceIdentitiesReadStably',
      'allFramesMatchCanvas',
      'allFramesHaveAlpha',
      'allRuntimePathsReviewed',
    ],
    'plan.sourceSummary',
    'PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID',
  );
  const frameCount = boundedInteger(
    value.sourceSummary.frameCount,
    'plan.sourceSummary.frameCount',
    1,
    LIMITS.maximumFrames,
  );
  const clipCount = boundedInteger(
    value.sourceSummary.clipCount,
    'plan.sourceSummary.clipCount',
    4,
    LIMITS.maximumClips,
  );
  const loopClipCount = boundedInteger(
    value.sourceSummary.loopClipCount,
    'plan.sourceSummary.loopClipCount',
    1,
    LIMITS.maximumClips,
  );
  boundedInteger(
    value.sourceSummary.totalSourceBytes,
    'plan.sourceSummary.totalSourceBytes',
    33,
    LIMITS.maximumTotalSourceBytes,
  );
  boundedInteger(
    value.sourceSummary.totalDecodedPixels,
    'plan.sourceSummary.totalDecodedPixels',
    1,
    LIMITS.maximumDecodedPixels,
  );
  for (const key of [
    'sourceIdentitiesReadStably',
    'allFramesMatchCanvas',
    'allFramesHaveAlpha',
    'allRuntimePathsReviewed',
  ]) {
    requireTrue(value.sourceSummary[key], `plan.sourceSummary.${key}`);
  }

  requireArray(value.sources, 'plan.sources', frameCount, frameCount);
  const sourceIds = new Set();
  const sourcePaths = new Set();
  const targetPaths = new Set();
  const sourceHashes = new Set();
  const sourcesById = new Map();
  let totalSourceBytes = 0;
  let totalDecodedPixels = 0;
  for (const [index, source] of value.sources.entries()) {
    exactKeys(
      source,
      [
        'id',
        'sourcePath',
        'targetPath',
        'sha256',
        'bytes',
        'image',
        'alreadyReviewedAtTarget',
      ],
      `plan.sources[${index}]`,
      'PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID',
    );
    const id = identifier(source.id, `plan.sources[${index}].id`);
    const sourcePath = canonicalPath(
      source.sourcePath,
      `plan.sources[${index}].sourcePath`,
    );
    const targetPath = reviewedTargetPath(
      source.targetPath,
      characterId,
      id,
      `plan.sources[${index}].targetPath`,
    );
    const sourceSha256 = digest(source.sha256, `plan.sources[${index}].sha256`);
    if (
      sourceIds.has(id) ||
      sourcePaths.has(sourcePath) ||
      targetPaths.has(targetPath) ||
      sourceHashes.has(sourceSha256)
    ) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID', 'Plan source identity is duplicated.');
    }
    sourceIds.add(id);
    sourcePaths.add(sourcePath);
    targetPaths.add(targetPath);
    sourceHashes.add(sourceSha256);
    const bytes = boundedInteger(
      source.bytes,
      `plan.sources[${index}].bytes`,
      33,
      LIMITS.maximumSourceBytes,
    );
    const image = parseImage(
      source.image,
      `plan.sources[${index}].image`,
      value.runtimeDraft?.canvas ?? { width: source.image?.width, height: source.image?.height },
    );
    if (source.alreadyReviewedAtTarget !== (sourcePath === targetPath)) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID', 'Reviewed-in-place state drifted.');
    }
    totalSourceBytes += bytes;
    totalDecodedPixels += image.width * image.height;
    if (
      totalSourceBytes > LIMITS.maximumTotalSourceBytes ||
      totalDecodedPixels > LIMITS.maximumDecodedPixels
    ) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID', 'Plan source budget exceeded.');
    }
    sourcesById.set(id, source);
  }
  if (
    totalSourceBytes !== value.sourceSummary.totalSourceBytes ||
    totalDecodedPixels !== value.sourceSummary.totalDecodedPixels
  ) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID', 'Source summary totals drifted.');
  }

  exactKeys(
    value.workspaceFilePlanRequest,
    ['workspaceRoot', 'idempotencyKey', 'operations'],
    'plan.workspaceFilePlanRequest',
    'PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID',
  );
  if (
    path.normalize(value.workspaceFilePlanRequest.workspaceRoot) !==
      path.normalize(workspaceRoot) ||
    value.workspaceFilePlanRequest.idempotencyKey !==
      `avatar-sequence:${requestCanonicalSha256}`
  ) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID', 'Workspace file plan identity drifted.');
  }
  const expectedOperations = value.sources
    .filter((source) => !source.alreadyReviewedAtTarget)
    .map((source) => ({
      type: 'copy',
      source: source.sourcePath,
      target: source.targetPath,
      expectedSourceSha256: source.sha256,
    }));
  if (!sameJson(value.workspaceFilePlanRequest.operations, expectedOperations)) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID', 'Workspace copy operations drifted.');
  }

  const runtime = value.runtimeDraft;
  exactKeys(
    runtime,
    [
      'targetSchema',
      'characterId',
      'revision',
      'canvas',
      'review',
      'frames',
      'clips',
      'loopClosures',
      'runtimeActivationAllowed',
      'defaults',
      'authority',
    ],
    'plan.runtimeDraft',
    'PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID',
  );
  if (
    runtime.targetSchema !== AVATAR_SEQUENCE_PACK_TARGET_SCHEMA ||
    runtime.characterId !== characterId ||
    runtime.revision !== revision ||
    runtime.review !== null ||
    !Array.isArray(runtime.loopClosures) ||
    runtime.loopClosures.length !== 0 ||
    runtime.runtimeActivationAllowed !== false
  ) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_AUTHORITY_ESCALATION', 'Runtime draft is not inert.');
  }
  exactKeys(
    runtime.canvas,
    ['width', 'height'],
    'plan.runtimeDraft.canvas',
    'PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID',
  );
  const canvas = {
    width: boundedInteger(runtime.canvas.width, 'runtimeDraft.canvas.width', 1, 32_768),
    height: boundedInteger(runtime.canvas.height, 'runtimeDraft.canvas.height', 1, 32_768),
  };
  if (canvas.width * canvas.height > LIMITS.maximumDecodedPixels) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID', 'Runtime canvas is too large.');
  }
  for (const [index, source] of value.sources.entries()) {
    parseImage(source.image, `plan.sources[${index}].image`, canvas);
  }
  assertFalseRecord(
    runtime.authority,
    RUNTIME_AUTHORITY_KEYS,
    'plan.runtimeDraft.authority',
    'PROJECT_ART_AVATAR_SEQUENCE_PLAN_AUTHORITY_ESCALATION',
  );
  requireArray(runtime.frames, 'plan.runtimeDraft.frames', frameCount, frameCount);
  const expectedFrames = value.sources.map((source) => ({
    id: source.id,
    path: source.targetPath,
    sha256: source.sha256,
    bytes: source.bytes,
    width: source.image.width,
    height: source.image.height,
  }));
  if (!sameJson(runtime.frames, expectedFrames)) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID', 'Runtime frame identities drifted.');
  }
  const framesById = new Map(runtime.frames.map((frame) => [frame.id, frame]));

  requireArray(runtime.clips, 'plan.runtimeDraft.clips', clipCount, clipCount);
  const clipIds = new Set();
  const clipsById = new Map();
  for (const [index, clip] of runtime.clips.entries()) {
    exactKeys(
      clip,
      ['id', 'kind', 'loopMode', 'frames', 'neutralFrameId', 'emotion', 'durationMs'],
      `runtimeDraft.clips[${index}]`,
      'PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID',
    );
    const id = identifier(clip.id, `runtimeDraft.clips[${index}].id`);
    if (clipIds.has(id) || !CLIP_KINDS.includes(clip.kind) || !LOOP_MODES.includes(clip.loopMode)) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID', 'Runtime clip identity drifted.');
    }
    clipIds.add(id);
    requireArray(
      clip.frames,
      `runtimeDraft.clips[${index}].frames`,
      1,
      LIMITS.maximumFramesPerClip,
    );
    let durationMs = 0;
    const orderedFrameIds = [];
    for (const [frameIndex, frame] of clip.frames.entries()) {
      exactKeys(
        frame,
        ['frameId', 'durationMs'],
        `runtimeDraft.clips[${index}].frames[${frameIndex}]`,
        'PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID',
      );
      const frameId = identifier(
        frame.frameId,
        `runtimeDraft.clips[${index}].frames[${frameIndex}].frameId`,
      );
      if (!framesById.has(frameId)) {
        fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID', `Unknown frame ${frameId}.`);
      }
      durationMs += boundedInteger(
        frame.durationMs,
        `runtimeDraft.clips[${index}].frames[${frameIndex}].durationMs`,
        16,
        2000,
      );
      orderedFrameIds.push(frameId);
    }
    if (durationMs !== clip.durationMs) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID', `Clip ${id} duration drifted.`);
    }
    if (!orderedFrameIds.includes(clip.neutralFrameId)) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID', `Clip ${id} neutral frame drifted.`);
    }
    if (clip.emotion !== null) identifier(clip.emotion, `runtimeDraft.clips[${index}].emotion`);
    if (
      clip.loopMode === 'loop' &&
      (orderedFrameIds.length < 2 || new Set(orderedFrameIds).size !== orderedFrameIds.length)
    ) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID', `Loop clip ${id} is not reviewable.`);
    }
    clipsById.set(id, clip);
  }
  verifyDefaults(runtime.defaults, clipsById);

  const loopClips = runtime.clips.filter((clip) => clip.loopMode === 'loop');
  requireArray(
    value.loopClosureRequests,
    'plan.loopClosureRequests',
    loopClipCount,
    loopClipCount,
  );
  if (loopClips.length !== loopClipCount) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID', 'Loop clip summary drifted.');
  }
  for (let index = 0; index < loopClips.length; index += 1) {
    verifyLoopRequest(
      value.loopClosureRequests[index],
      loopClips[index],
      framesById,
      characterId,
      canvas,
      index,
    );
  }

  exactKeys(
    value.finalizationRequirements,
    [
      'targetPackSchema',
      'targetLoopEvidenceSchema',
      'workspaceFilePlanApplicationRequired',
      'requiredLoopClosureEvidenceCount',
      'independentReviewRequired',
      'requiredApprovalDisciplines',
      'releaseSealRequired',
      'runtimeActivationAllowed',
    ],
    'plan.finalizationRequirements',
    'PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID',
  );
  if (
    value.finalizationRequirements.targetPackSchema !== AVATAR_SEQUENCE_PACK_TARGET_SCHEMA ||
    value.finalizationRequirements.targetLoopEvidenceSchema !==
      AVATAR_SEQUENCE_LOOP_EVIDENCE_TARGET_SCHEMA ||
    value.finalizationRequirements.workspaceFilePlanApplicationRequired !==
      (expectedOperations.length > 0) ||
    value.finalizationRequirements.requiredLoopClosureEvidenceCount !== loopClipCount ||
    value.finalizationRequirements.independentReviewRequired !== true ||
    !sameJson(
      value.finalizationRequirements.requiredApprovalDisciplines,
      REVIEW_DISCIPLINES,
    ) ||
    value.finalizationRequirements.releaseSealRequired !== true ||
    value.finalizationRequirements.runtimeActivationAllowed !== false
  ) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_AUTHORITY_ESCALATION', 'Finalization boundary drifted.');
  }

  assertFalseRecord(
    value.effects,
    EFFECT_KEYS,
    'plan.effects',
    'PROJECT_ART_AVATAR_SEQUENCE_PLAN_AUTHORITY_ESCALATION',
  );
  if (!sameJson(value.limits, LIMITS)) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_PLAN_INVALID', 'Plan limits drifted.');
  }
  assertFalseRecord(
    value.authority,
    AUTHORITY_KEYS,
    'plan.authority',
    'PROJECT_ART_AVATAR_SEQUENCE_PLAN_AUTHORITY_ESCALATION',
  );

  return Object.freeze({
    plan: value,
    workspaceRoot,
    assignmentId,
    characterId,
    revision,
    sourceCount: frameCount,
    clipCount,
    loopClipCount,
    sourcesById,
    framesById,
    clipsById,
  });
}
