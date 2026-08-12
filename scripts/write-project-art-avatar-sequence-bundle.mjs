#!/usr/bin/env node

import {
  closeSync,
  constants as fsConstants,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  AVATAR_SEQUENCE_LOOP_EVIDENCE_TARGET_SCHEMA,
  AVATAR_SEQUENCE_PACK_TARGET_SCHEMA,
  BUNDLE_AUTHORITY_KEYS,
  LIMITS,
  PLAN_AUTHORITY_KEYS,
  PLAN_EFFECT_KEYS,
  PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RECEIPT_SCHEMA,
  PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_SCHEMA,
  PROJECT_ART_AVATAR_SEQUENCE_PLAN_SCHEMA,
  PROJECT_ART_LOOP_CLOSURE_REQUEST_SCHEMA,
  REVIEW_DISCIPLINES,
  RUNTIME_AUTHORITY_KEYS,
  boundedInteger,
  boundedString,
  canonicalJson,
  canonicalRelativePath,
  digest,
  exactKeys,
  fail,
  falseAuthority,
  hashBytes,
  identifier,
  isRecord,
  parseFalseAuthority,
  parseJsonBytes,
  timestamp,
  verifyDocumentHash,
  withDocumentHash,
} from './project-art/avatar-sequence-bundle-common.mjs';

export {
  PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RECEIPT_SCHEMA,
  PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_SCHEMA,
} from './project-art/avatar-sequence-bundle-common.mjs';

const LOOP_MODES = Object.freeze(['once', 'loop', 'ping-pong']);
const CLIP_KINDS = Object.freeze([
  'idle',
  'blink',
  'talk-in',
  'talk-loop',
  'talk-out',
  'talk-emotion',
  'listening',
  'thinking',
  'gesture',
  'wave',
  'sleep',
  'dance',
  'emotion',
]);

function snapshot(metadata) {
  return Object.freeze({
    mode: metadata.mode,
    device: metadata.dev,
    inode: metadata.ino,
    links: metadata.nlink,
    size: metadata.size,
    modifiedMs: metadata.mtimeMs,
    changedMs: metadata.ctimeMs,
  });
}

function sameSnapshot(left, right) {
  return Object.keys(left).every((key) => left[key] === right[key]);
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

function directory(value, label) {
  const lexical = path.resolve(value);
  let metadata;
  try {
    metadata = lstatSync(lexical);
  } catch {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_DIRECTORY_MISSING',
      `${label} is missing.`,
    );
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_DIRECTORY_UNSAFE',
      `${label} must be a non-symbolic directory.`,
    );
  }
  return realpathSync(lexical);
}

function secureExistingPath(root, value, label) {
  const lexical = path.resolve(path.isAbsolute(value) ? value : path.join(root, value));
  if (!inside(root, lexical) || lexical === root) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_PATH_ESCAPE',
      `${label} must remain inside workspace-root.`,
    );
  }
  const relative = path.relative(root, lexical);
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let metadata;
    try {
      metadata = lstatSync(current);
    } catch {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_FILE_MISSING',
        `${label} is missing.`,
      );
    }
    if (metadata.isSymbolicLink()) {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_PATH_SYMLINK',
        `${label} contains a symbolic-link component.`,
      );
    }
  }
  const resolved = realpathSync(lexical);
  if (!inside(root, resolved)) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_PATH_ESCAPE',
      `${label} escaped workspace-root.`,
    );
  }
  return Object.freeze({ lexical, resolved });
}

function regularFile(value, label, maximumBytes) {
  let metadata;
  try {
    metadata = lstatSync(value);
  } catch {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_FILE_MISSING',
      `${label} is missing.`,
    );
  }
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.nlink !== 1 ||
    metadata.size < 2 ||
    metadata.size > maximumBytes
  ) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_FILE_UNSAFE',
      `${label} must be a bounded, single-link regular file.`,
    );
  }
  return snapshot(metadata);
}

function readStableJsonFile(root, value, label) {
  const resolved = secureExistingPath(root, value, label);
  const before = regularFile(resolved.resolved, label, LIMITS.maximumPlanBytes);
  const bytes = readFileSync(resolved.resolved);
  const after = regularFile(resolved.resolved, label, LIMITS.maximumPlanBytes);
  if (!sameSnapshot(before, after) || bytes.length !== before.size) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_FILE_CHANGED',
      `${label} changed during read.`,
    );
  }
  return Object.freeze({
    absolutePath: resolved.resolved,
    relativePath: path.relative(root, resolved.resolved).split(path.sep).join('/'),
    bytes,
    fileSha256: hashBytes(bytes),
    document: parseJsonBytes(bytes, label),
    snapshot: before,
  });
}

function assertSameStableFile(root, original, label) {
  const current = readStableJsonFile(root, original.absolutePath, label);
  if (
    current.fileSha256 !== original.fileSha256 ||
    !sameSnapshot(current.snapshot, original.snapshot)
  ) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_SOURCE_REVALIDATION_FAILED',
      `${label} changed before atomic publication.`,
    );
  }
  return current;
}

function secureOutputRoot(root, value) {
  const lexical = path.resolve(path.isAbsolute(value) ? value : path.join(root, value));
  if (!inside(root, lexical) || lexical === root) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_PATH_ESCAPE',
      'output-root must remain inside workspace-root.',
    );
  }
  const parent = path.dirname(lexical);
  const relative = path.relative(root, parent);
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let metadata;
    try {
      metadata = lstatSync(current);
    } catch {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_OUTPUT_INVALID',
        'output-root parent is missing.',
      );
    }
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_OUTPUT_INVALID',
        'output-root parent must be a non-symbolic directory.',
      );
    }
  }
  try {
    lstatSync(lexical);
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_OUTPUT_EXISTS',
      'Avatar-sequence bundle output is create-only and already exists.',
    );
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return Object.freeze({
    absolutePath: lexical,
    relativePath: path.relative(root, lexical).split(path.sep).join('/'),
    parent,
  });
}

function parseFalseFlags(value, keys, label, code) {
  return parseFalseAuthority(value, keys, label, code);
}

function validateCanvas(value, label) {
  exactKeys(value, ['width', 'height'], label);
  return Object.freeze({
    width: boundedInteger(value.width, `${label}.width`, 1, 32_768),
    height: boundedInteger(value.height, `${label}.height`, 1, 32_768),
  });
}

function validateImage(value, canvas, label) {
  exactKeys(
    value,
    [
      'format',
      'width',
      'height',
      'bitDepth',
      'colourType',
      'alphaChannel',
      'interlaced',
    ],
    label,
  );
  if (
    value.format !== 'png' ||
    value.width !== canvas.width ||
    value.height !== canvas.height ||
    value.bitDepth !== 8 ||
    ![4, 6].includes(value.colourType) ||
    value.alphaChannel !== true ||
    value.interlaced !== false
  ) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_IMAGE_INVALID',
      `${label} must retain the exact non-interlaced 8-bit alpha PNG contract.`,
    );
  }
  return Object.freeze({ ...value });
}

function validateThresholds(value, label) {
  exactKeys(
    value,
    [
      'maximumChangedFraction',
      'maximumMeanChannelDelta',
      'maximumAlphaChangedFraction',
      'maximumCentroidShiftPixels',
    ],
    label,
  );
  const boundaries = {
    maximumChangedFraction: 1,
    maximumMeanChannelDelta: 255,
    maximumAlphaChangedFraction: 1,
    maximumCentroidShiftPixels: 1_000_000,
  };
  const output = {};
  for (const [key, maximum] of Object.entries(boundaries)) {
    if (
      typeof value[key] !== 'number' ||
      !Number.isFinite(value[key]) ||
      value[key] < 0 ||
      value[key] > maximum
    ) {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_THRESHOLD_INVALID',
        `${label}.${key} is invalid.`,
      );
    }
    output[key] = Object.is(value[key], -0) ? 0 : value[key];
  }
  return Object.freeze(output);
}

function validateClipMap(value, clipIds, label) {
  if (!isRecord(value) || Object.keys(value).length > 64) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_DEFAULTS_INVALID',
      `${label} is invalid.`,
    );
  }
  const output = {};
  for (const [key, clipIdValue] of Object.entries(value)) {
    const canonicalKey = identifier(key, `${label}.${key}`);
    const clipId = identifier(clipIdValue, `${label}.${key}`);
    if (!clipIds.has(clipId)) {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_DEFAULTS_INVALID',
        `${label}.${canonicalKey} refers to an unknown clip.`,
      );
    }
    output[canonicalKey] = clipId;
  }
  return Object.freeze(output);
}

function validatePlan(plan, workspaceRoot) {
  exactKeys(
    plan,
    [
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
    ],
    'plan',
    'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_PLAN_INVALID',
  );
  if (plan.schema !== PROJECT_ART_AVATAR_SEQUENCE_PLAN_SCHEMA) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_PLAN_VERSION_INVALID',
      `Plan must use ${PROJECT_ART_AVATAR_SEQUENCE_PLAN_SCHEMA}.`,
    );
  }
  verifyDocumentHash(plan, 'plan');
  const planId = identifier(plan.planId, 'plan.planId');
  const assignmentId = identifier(plan.assignmentId, 'plan.assignmentId');
  const characterId = identifier(plan.characterId, 'plan.characterId');
  const revision = boundedInteger(plan.revision, 'plan.revision', 1, 1_000_000);
  boundedString(plan.purpose, 'plan.purpose', 8192);
  timestamp(plan.compiledAt, 'plan.compiledAt');
  digest(plan.requestSha256, 'plan.requestSha256');
  digest(plan.requestCanonicalSha256, 'plan.requestCanonicalSha256');

  exactKeys(
    plan.assignment,
    ['mode', 'semanticInferencePerformed', 'timestampOrderingUsedAsSemantics'],
    'plan.assignment',
  );
  if (
    plan.assignment.mode !== 'owner-declared-only' ||
    plan.assignment.semanticInferencePerformed !== false ||
    plan.assignment.timestampOrderingUsedAsSemantics !== false
  ) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_EXPLICIT_ASSIGNMENT_REQUIRED',
      'The mastering plan must retain owner-declared semantics only.',
    );
  }

  exactKeys(
    plan.workspace,
    [
      'root',
      'sourcePathsAreRelative',
      'symbolicLinksAllowed',
      'hardLinkedSourcesAllowed',
    ],
    'plan.workspace',
  );
  if (
    path.resolve(plan.workspace.root) !== workspaceRoot ||
    plan.workspace.sourcePathsAreRelative !== true ||
    plan.workspace.symbolicLinksAllowed !== false ||
    plan.workspace.hardLinkedSourcesAllowed !== false
  ) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_WORKSPACE_MISMATCH',
      'The mastering plan is not bound to this workspace.',
    );
  }

  exactKeys(
    plan.sourceSummary,
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
  );
  const frameCount = boundedInteger(
    plan.sourceSummary.frameCount,
    'plan.sourceSummary.frameCount',
    1,
    LIMITS.maximumFrames,
  );
  const clipCount = boundedInteger(
    plan.sourceSummary.clipCount,
    'plan.sourceSummary.clipCount',
    4,
    LIMITS.maximumClips,
  );
  const loopClipCount = boundedInteger(
    plan.sourceSummary.loopClipCount,
    'plan.sourceSummary.loopClipCount',
    1,
    LIMITS.maximumLoopRequests,
  );
  boundedInteger(
    plan.sourceSummary.totalSourceBytes,
    'plan.sourceSummary.totalSourceBytes',
    1,
    Number.MAX_SAFE_INTEGER,
  );
  boundedInteger(
    plan.sourceSummary.totalDecodedPixels,
    'plan.sourceSummary.totalDecodedPixels',
    1,
    Number.MAX_SAFE_INTEGER,
  );
  for (const key of [
    'sourceIdentitiesReadStably',
    'allFramesMatchCanvas',
    'allFramesHaveAlpha',
    'allRuntimePathsReviewed',
  ]) {
    if (plan.sourceSummary[key] !== true) {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_SOURCE_SUMMARY_INVALID',
        `plan.sourceSummary.${key} must be true.`,
      );
    }
  }

  if (!Array.isArray(plan.sources) || plan.sources.length !== frameCount) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_SOURCES_INVALID');
  }
  const sourceIds = new Set();
  const targetPaths = new Set();
  const sourceById = new Map();
  let observedSourceBytes = 0;
  let observedPixels = 0;
  let canvas = null;
  for (const [index, source] of plan.sources.entries()) {
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
    );
    const id = identifier(source.id, `plan.sources[${index}].id`);
    if (sourceIds.has(id)) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_SOURCE_ID_DUPLICATE');
    }
    sourceIds.add(id);
    const sourcePath = canonicalRelativePath(
      source.sourcePath,
      `plan.sources[${index}].sourcePath`,
    );
    const targetPath = canonicalRelativePath(
      source.targetPath,
      `plan.sources[${index}].targetPath`,
    );
    if (targetPaths.has(targetPath)) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_TARGET_PATH_DUPLICATE');
    }
    targetPaths.add(targetPath);
    const sourceSha256 = digest(
      source.sha256,
      `plan.sources[${index}].sha256`,
    );
    const bytes = boundedInteger(
      source.bytes,
      `plan.sources[${index}].bytes`,
      33,
      128 * 1024 * 1024,
    );
    if (typeof source.alreadyReviewedAtTarget !== 'boolean') {
      fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_SOURCE_INVALID');
    }
    if (source.alreadyReviewedAtTarget !== (sourcePath === targetPath)) {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_SOURCE_REVIEW_STATE_INVALID',
      );
    }
    const sourceCanvas = Object.freeze({
      width: boundedInteger(
        source.image?.width,
        `plan.sources[${index}].image.width`,
        1,
        32_768,
      ),
      height: boundedInteger(
        source.image?.height,
        `plan.sources[${index}].image.height`,
        1,
        32_768,
      ),
    });
    if (canvas === null) canvas = sourceCanvas;
    if (
      sourceCanvas.width !== canvas.width ||
      sourceCanvas.height !== canvas.height
    ) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_CANVAS_DRIFT');
    }
    const image = validateImage(
      source.image,
      canvas,
      `plan.sources[${index}].image`,
    );
    observedSourceBytes += bytes;
    observedPixels += image.width * image.height;
    sourceById.set(
      id,
      Object.freeze({
        id,
        sourcePath,
        targetPath,
        sha256: sourceSha256,
        bytes,
        image,
      }),
    );
  }
  if (
    observedSourceBytes !== plan.sourceSummary.totalSourceBytes ||
    observedPixels !== plan.sourceSummary.totalDecodedPixels
  ) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_SOURCE_SUMMARY_INVALID');
  }

  exactKeys(
    plan.workspaceFilePlanRequest,
    ['workspaceRoot', 'idempotencyKey', 'operations'],
    'plan.workspaceFilePlanRequest',
  );
  if (path.resolve(plan.workspaceFilePlanRequest.workspaceRoot) !== workspaceRoot) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_WORKSPACE_MISMATCH');
  }
  boundedString(
    plan.workspaceFilePlanRequest.idempotencyKey,
    'plan.workspaceFilePlanRequest.idempotencyKey',
    512,
  );
  if (
    !Array.isArray(plan.workspaceFilePlanRequest.operations) ||
    plan.workspaceFilePlanRequest.operations.length > LIMITS.maximumOperations
  ) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_OPERATIONS_INVALID');
  }
  const expectedOperations = plan.sources.filter(
    (source) => source.sourcePath !== source.targetPath,
  );
  if (
    plan.workspaceFilePlanRequest.operations.length !== expectedOperations.length
  ) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_OPERATIONS_INVALID');
  }
  for (const [index, operation] of plan.workspaceFilePlanRequest.operations.entries()) {
    exactKeys(
      operation,
      ['type', 'source', 'target', 'expectedSourceSha256'],
      `plan.workspaceFilePlanRequest.operations[${index}]`,
    );
    const expected = expectedOperations[index];
    if (
      operation.type !== 'copy' ||
      operation.source !== expected.sourcePath ||
      operation.target !== expected.targetPath ||
      operation.expectedSourceSha256 !== expected.sha256
    ) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_OPERATIONS_INVALID');
    }
  }

  exactKeys(
    plan.runtimeDraft,
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
  );
  if (
    plan.runtimeDraft.targetSchema !== AVATAR_SEQUENCE_PACK_TARGET_SCHEMA ||
    plan.runtimeDraft.characterId !== characterId ||
    plan.runtimeDraft.revision !== revision ||
    plan.runtimeDraft.review !== null ||
    !Array.isArray(plan.runtimeDraft.loopClosures) ||
    plan.runtimeDraft.loopClosures.length !== 0 ||
    plan.runtimeDraft.runtimeActivationAllowed !== false
  ) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RUNTIME_DRAFT_INVALID');
  }
  const runtimeCanvas = validateCanvas(
    plan.runtimeDraft.canvas,
    'plan.runtimeDraft.canvas',
  );
  if (
    runtimeCanvas.width !== canvas.width ||
    runtimeCanvas.height !== canvas.height
  ) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_CANVAS_DRIFT');
  }
  parseFalseFlags(
    plan.runtimeDraft.authority,
    RUNTIME_AUTHORITY_KEYS,
    'plan.runtimeDraft.authority',
    'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RUNTIME_AUTHORITY_INVALID',
  );

  if (
    !Array.isArray(plan.runtimeDraft.frames) ||
    plan.runtimeDraft.frames.length !== frameCount
  ) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RUNTIME_FRAMES_INVALID');
  }
  const runtimeFramesById = new Map();
  for (const [index, frame] of plan.runtimeDraft.frames.entries()) {
    exactKeys(
      frame,
      ['id', 'path', 'sha256', 'bytes', 'width', 'height'],
      `plan.runtimeDraft.frames[${index}]`,
    );
    const source = sourceById.get(frame.id);
    if (
      !source ||
      frame.path !== source.targetPath ||
      frame.sha256 !== source.sha256 ||
      frame.bytes !== source.bytes ||
      frame.width !== canvas.width ||
      frame.height !== canvas.height
    ) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RUNTIME_FRAMES_INVALID');
    }
    runtimeFramesById.set(frame.id, frame);
  }

  if (
    !Array.isArray(plan.runtimeDraft.clips) ||
    plan.runtimeDraft.clips.length !== clipCount
  ) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RUNTIME_CLIPS_INVALID');
  }
  const clipIds = new Set();
  const clipsById = new Map();
  const loopClips = [];
  for (const [clipIndex, clip] of plan.runtimeDraft.clips.entries()) {
    exactKeys(
      clip,
      [
        'id',
        'kind',
        'loopMode',
        'frames',
        'neutralFrameId',
        'emotion',
        'durationMs',
      ],
      `plan.runtimeDraft.clips[${clipIndex}]`,
    );
    const id = identifier(clip.id, `plan.runtimeDraft.clips[${clipIndex}].id`);
    if (clipIds.has(id)) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_CLIP_ID_DUPLICATE');
    }
    clipIds.add(id);
    if (!CLIP_KINDS.includes(clip.kind) || !LOOP_MODES.includes(clip.loopMode)) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RUNTIME_CLIPS_INVALID');
    }
    if (
      !Array.isArray(clip.frames) ||
      clip.frames.length < 1 ||
      clip.frames.length > 240
    ) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RUNTIME_CLIPS_INVALID');
    }
    let durationMs = 0;
    const orderedFrames = [];
    for (const [frameIndex, entry] of clip.frames.entries()) {
      exactKeys(
        entry,
        ['frameId', 'durationMs'],
        `plan.runtimeDraft.clips[${clipIndex}].frames[${frameIndex}]`,
      );
      const frameId = identifier(
        entry.frameId,
        `plan.runtimeDraft.clips[${clipIndex}].frames[${frameIndex}].frameId`,
      );
      if (!runtimeFramesById.has(frameId)) {
        fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RUNTIME_CLIPS_INVALID');
      }
      const frameDuration = boundedInteger(
        entry.durationMs,
        `plan.runtimeDraft.clips[${clipIndex}].frames[${frameIndex}].durationMs`,
        16,
        2000,
      );
      durationMs += frameDuration;
      orderedFrames.push(Object.freeze({ frameId, durationMs: frameDuration }));
    }
    if (
      clip.durationMs !== durationMs ||
      !runtimeFramesById.has(clip.neutralFrameId) ||
      !orderedFrames.some((entry) => entry.frameId === clip.neutralFrameId)
    ) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RUNTIME_CLIPS_INVALID');
    }
    if (clip.emotion !== null) {
      identifier(clip.emotion, `plan.runtimeDraft.clips[${clipIndex}].emotion`);
    }
    const normalized = Object.freeze({
      id,
      kind: clip.kind,
      loopMode: clip.loopMode,
      frames: Object.freeze(orderedFrames),
      neutralFrameId: clip.neutralFrameId,
      emotion: clip.emotion,
      durationMs,
    });
    clipsById.set(id, normalized);
    if (clip.loopMode === 'loop') loopClips.push(normalized);
  }
  if (loopClips.length !== loopClipCount) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_LOOP_COUNT_INVALID');
  }

  exactKeys(
    plan.runtimeDraft.defaults,
    ['idleClipId', 'talk', 'presence', 'events', 'emotions'],
    'plan.runtimeDraft.defaults',
  );
  exactKeys(
    plan.runtimeDraft.defaults.talk,
    ['inClipId', 'loopClipId', 'outClipId'],
    'plan.runtimeDraft.defaults.talk',
  );
  for (const clipId of [
    plan.runtimeDraft.defaults.idleClipId,
    plan.runtimeDraft.defaults.talk.inClipId,
    plan.runtimeDraft.defaults.talk.loopClipId,
    plan.runtimeDraft.defaults.talk.outClipId,
  ]) {
    if (!clipIds.has(clipId)) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_DEFAULTS_INVALID');
    }
  }
  validateClipMap(
    plan.runtimeDraft.defaults.presence,
    clipIds,
    'plan.runtimeDraft.defaults.presence',
  );
  validateClipMap(
    plan.runtimeDraft.defaults.events,
    clipIds,
    'plan.runtimeDraft.defaults.events',
  );
  validateClipMap(
    plan.runtimeDraft.defaults.emotions,
    clipIds,
    'plan.runtimeDraft.defaults.emotions',
  );

  if (
    !Array.isArray(plan.loopClosureRequests) ||
    plan.loopClosureRequests.length !== loopClipCount
  ) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_LOOP_REQUESTS_INVALID');
  }
  for (const [index, entry] of plan.loopClosureRequests.entries()) {
    exactKeys(
      entry,
      ['clipId', 'request', 'requestCanonicalSha256'],
      `plan.loopClosureRequests[${index}]`,
    );
    const clip = loopClips[index];
    if (!clip || entry.clipId !== clip.id) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_LOOP_REQUESTS_INVALID');
    }
    exactKeys(
      entry.request,
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
      `plan.loopClosureRequests[${index}].request`,
    );
    if (
      entry.request.schema !== PROJECT_ART_LOOP_CLOSURE_REQUEST_SCHEMA ||
      entry.request.projectId !== characterId ||
      entry.request.reviewId !==
        `loop-${hashBytes(Buffer.from(`${assignmentId}:${clip.id}`, 'utf8')).slice(0, 24)}` ||
      entry.requestCanonicalSha256 !==
        hashBytes(Buffer.from(canonicalJson(entry.request), 'utf8'))
    ) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_LOOP_REQUESTS_INVALID');
    }
    boundedString(
      entry.request.purpose,
      `plan.loopClosureRequests[${index}].request.purpose`,
      8192,
    );
    if (
      !Array.isArray(entry.request.frames) ||
      entry.request.frames.length !== clip.frames.length
    ) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_LOOP_REQUESTS_INVALID');
    }
    for (const [frameIndex, requestFrame] of entry.request.frames.entries()) {
      exactKeys(
        requestFrame,
        ['path', 'expectedSha256'],
        `plan.loopClosureRequests[${index}].request.frames[${frameIndex}]`,
      );
      const runtimeFrame = runtimeFramesById.get(clip.frames[frameIndex].frameId);
      if (
        requestFrame.path !== runtimeFrame.path ||
        requestFrame.expectedSha256 !== runtimeFrame.sha256
      ) {
        fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_LOOP_REQUESTS_INVALID');
      }
    }
    exactKeys(
      entry.request.expected,
      ['width', 'height', 'requireAlpha'],
      `plan.loopClosureRequests[${index}].request.expected`,
    );
    if (
      entry.request.expected.width !== canvas.width ||
      entry.request.expected.height !== canvas.height ||
      entry.request.expected.requireAlpha !== true
    ) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_LOOP_REQUESTS_INVALID');
    }
    validateThresholds(
      entry.request.thresholds,
      `plan.loopClosureRequests[${index}].request.thresholds`,
    );
    if (
      !isRecord(entry.request.preview) ||
      entry.request.preview.difference !== true ||
      entry.request.preview.overlay !== true ||
      entry.request.preview.onionSkin !== true ||
      Object.keys(entry.request.preview).length !== 3
    ) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_LOOP_REQUESTS_INVALID');
    }
    parseFalseFlags(
      entry.request.authority,
      PLAN_AUTHORITY_KEYS,
      `plan.loopClosureRequests[${index}].request.authority`,
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_LOOP_AUTHORITY_INVALID',
    );
  }

  exactKeys(
    plan.finalizationRequirements,
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
  );
  if (
    plan.finalizationRequirements.targetPackSchema !==
      AVATAR_SEQUENCE_PACK_TARGET_SCHEMA ||
    plan.finalizationRequirements.targetLoopEvidenceSchema !==
      AVATAR_SEQUENCE_LOOP_EVIDENCE_TARGET_SCHEMA ||
    plan.finalizationRequirements.workspaceFilePlanApplicationRequired !==
      (plan.workspaceFilePlanRequest.operations.length > 0) ||
    plan.finalizationRequirements.requiredLoopClosureEvidenceCount !==
      loopClipCount ||
    plan.finalizationRequirements.independentReviewRequired !== true ||
    JSON.stringify(plan.finalizationRequirements.requiredApprovalDisciplines) !==
      JSON.stringify(REVIEW_DISCIPLINES) ||
    plan.finalizationRequirements.releaseSealRequired !== true ||
    plan.finalizationRequirements.runtimeActivationAllowed !== false
  ) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_FINALIZATION_INVALID');
  }

  parseFalseFlags(
    plan.effects,
    PLAN_EFFECT_KEYS,
    'plan.effects',
    'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_EFFECTS_INVALID',
  );
  parseFalseFlags(
    plan.authority,
    PLAN_AUTHORITY_KEYS,
    'plan.authority',
    'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_PLAN_AUTHORITY_INVALID',
  );

  if (!isRecord(plan.limits) || Object.keys(plan.limits).length < 1) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_LIMITS_INVALID');
  }
  for (const [key, value] of Object.entries(plan.limits)) {
    boundedInteger(value, `plan.limits.${key}`, 1, Number.MAX_SAFE_INTEGER);
  }

  return Object.freeze({
    planId,
    assignmentId,
    characterId,
    revision,
    frameCount,
    clipCount,
    loopClipCount,
  });
}

function jsonPayload(value) {
  const payload = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  if (payload.length > LIMITS.maximumOutputDocumentBytes) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_OUTPUT_TOO_LARGE',
      'A bundle output exceeded the JSON document boundary.',
    );
  }
  return payload;
}

function writeCreateOnly(target, value, role) {
  const payload = jsonPayload(value);
  let descriptor;
  try {
    descriptor = openSync(
      target,
      fsConstants.O_WRONLY |
        fsConstants.O_CREAT |
        fsConstants.O_EXCL |
        (fsConstants.O_NOFOLLOW ?? 0),
      0o600,
    );
  } catch (error) {
    if (error?.code === 'EEXIST') {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_OUTPUT_EXISTS',
        `Create-only output already exists: ${target}.`,
      );
    }
    throw error;
  }
  try {
    let written = 0;
    while (written < payload.length) {
      written += writeSync(descriptor, payload, written, payload.length - written);
    }
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  return Object.freeze({
    role,
    path: target,
    sha256: hashBytes(payload),
    bytes: payload.length,
  });
}

function relativeOutputRecord(stagingRoot, record) {
  return Object.freeze({
    role: record.role,
    path: path.relative(stagingRoot, record.path).split(path.sep).join('/'),
    sha256: record.sha256,
    bytes: record.bytes,
  });
}

export function writeProjectArtAvatarSequenceBundle({
  workspaceRoot,
  planPath,
  outputRoot,
  createdAt = new Date().toISOString(),
}) {
  const workspace = directory(workspaceRoot, 'workspace-root');
  timestamp(createdAt, 'createdAt');
  const sourcePlan = readStableJsonFile(workspace, planPath, 'mastering plan');
  const planSummary = validatePlan(sourcePlan.document, workspace);
  const output = secureOutputRoot(workspace, outputRoot);
  const bundleId = `avatar-sequence-bundle-${sourcePlan.document.documentSha256.slice(0, 24)}`;
  const staging = mkdtempSync(
    path.join(output.parent, `.${path.basename(output.absolutePath)}.staging-`),
  );
  let published = false;
  try {
    mkdirSync(path.join(staging, 'loop-closure'), {
      mode: 0o700,
      recursive: false,
    });

    const workspaceRecord = writeCreateOnly(
      path.join(staging, 'workspace-file-plan-request.json'),
      sourcePlan.document.workspaceFilePlanRequest,
      'workspace-file-plan-request',
    );
    const runtimeDraftRecord = writeCreateOnly(
      path.join(staging, 'runtime-draft.json'),
      sourcePlan.document.runtimeDraft,
      'runtime-draft',
    );
    const loopRecords = sourcePlan.document.loopClosureRequests.map(
      (entry, index) => {
        const relative = path.posix.join(
          'loop-closure',
          `${String(index).padStart(3, '0')}-${entry.clipId}.request.json`,
        );
        const record = writeCreateOnly(
          path.join(staging, ...relative.split('/')),
          entry.request,
          'loop-closure-request',
        );
        return Object.freeze({
          clipId: entry.clipId,
          requestCanonicalSha256: entry.requestCanonicalSha256,
          ...relativeOutputRecord(staging, record),
        });
      },
    );

    const bundleEffects = falseAuthority(BUNDLE_AUTHORITY_KEYS);
    const manifest = withDocumentHash({
      schema: PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_SCHEMA,
      bundleId,
      planId: planSummary.planId,
      assignmentId: planSummary.assignmentId,
      characterId: planSummary.characterId,
      revision: planSummary.revision,
      createdAt,
      sourcePlan: Object.freeze({
        path: sourcePlan.relativePath,
        fileSha256: sourcePlan.fileSha256,
        documentSha256: sourcePlan.document.documentSha256,
        bytes: sourcePlan.bytes.length,
      }),
      handoffs: Object.freeze({
        workspaceFilePlanRequest: relativeOutputRecord(staging, workspaceRecord),
        runtimeDraft: relativeOutputRecord(staging, runtimeDraftRecord),
        loopClosureRequests: Object.freeze(loopRecords),
      }),
      counts: Object.freeze({
        frames: planSummary.frameCount,
        clips: planSummary.clipCount,
        loopClosureRequests: planSummary.loopClipCount,
        workspaceOperations:
          sourcePlan.document.workspaceFilePlanRequest.operations.length,
      }),
      finalizationRequirements:
        sourcePlan.document.finalizationRequirements,
      runtimeActivationAllowed: false,
      effects: bundleEffects,
    });
    const manifestRecord = writeCreateOnly(
      path.join(staging, 'manifest.json'),
      manifest,
      'bundle-manifest',
    );

    const outputRecords = Object.freeze([
      relativeOutputRecord(staging, workspaceRecord),
      relativeOutputRecord(staging, runtimeDraftRecord),
      ...loopRecords.map(({ clipId: _clipId, requestCanonicalSha256: _hash, ...record }) =>
        Object.freeze(record),
      ),
      relativeOutputRecord(staging, manifestRecord),
    ]);
    if (outputRecords.length > LIMITS.maximumOutputs) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_OUTPUT_COUNT_INVALID');
    }

    const receipt = withDocumentHash({
      schema: PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RECEIPT_SCHEMA,
      bundleId,
      createdAt,
      outputRoot: output.relativePath,
      sourcePlan: Object.freeze({
        path: sourcePlan.relativePath,
        fileSha256: sourcePlan.fileSha256,
        documentSha256: sourcePlan.document.documentSha256,
        bytes: sourcePlan.bytes.length,
      }),
      manifest: Object.freeze({
        path: path.relative(staging, manifestRecord.path).split(path.sep).join('/'),
        fileSha256: manifestRecord.sha256,
        documentSha256: manifest.documentSha256,
        bytes: manifestRecord.bytes,
      }),
      outputs: outputRecords,
      sourcePlanRevalidatedBeforePublication: true,
      wholeRunAtomicPublication: true,
      createOnly: true,
      bytesFlowThroughMcp: false,
      runtimeActivationAllowed: false,
      effects: bundleEffects,
    });
    writeCreateOnly(
      path.join(staging, 'receipt.json'),
      receipt,
      'bundle-receipt',
    );

    const revalidated = assertSameStableFile(
      workspace,
      sourcePlan,
      'mastering plan',
    );
    if (
      revalidated.document.documentSha256 !==
        sourcePlan.document.documentSha256
    ) {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_SOURCE_REVALIDATION_FAILED',
      );
    }

    try {
      renameSync(staging, output.absolutePath);
    } catch (error) {
      if (error?.code === 'EEXIST' || error?.code === 'ENOTEMPTY') {
        fail(
          'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_OUTPUT_EXISTS',
          'Avatar-sequence bundle output is create-only and already exists.',
        );
      }
      throw error;
    }
    published = true;
    return Object.freeze({
      manifest,
      receipt,
      outputRoot: output.absolutePath,
      outputRootRelative: output.relativePath,
    });
  } finally {
    if (!published) {
      rmSync(staging, { recursive: true, force: true });
    }
  }
}

function argumentsMap(argv) {
  const allowed = new Set([
    '--workspace-root',
    '--plan',
    '--output-root',
    '--created-at',
  ]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || value === undefined || value.startsWith('--')) {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_ARGUMENT_INVALID',
        `Invalid argument near ${key ?? '<missing>'}.`,
      );
    }
    if (values.has(key)) {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_ARGUMENT_INVALID',
        `Duplicate argument: ${key}.`,
      );
    }
    values.set(key, value);
  }
  for (const required of ['--workspace-root', '--plan', '--output-root']) {
    if (!values.has(required)) {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_ARGUMENT_INVALID',
        `Missing ${required}.`,
      );
    }
  }
  return values;
}

function main() {
  const args = argumentsMap(process.argv.slice(2));
  const result = writeProjectArtAvatarSequenceBundle({
    workspaceRoot: args.get('--workspace-root'),
    planPath: args.get('--plan'),
    outputRoot: args.get('--output-root'),
    createdAt: args.get('--created-at') ?? new Date().toISOString(),
  });
  console.log(
    JSON.stringify({
      status: 'passed',
      schema: result.manifest.schema,
      receiptSchema: result.receipt.schema,
      bundleId: result.manifest.bundleId,
      characterId: result.manifest.characterId,
      frameCount: result.manifest.counts.frames,
      clipCount: result.manifest.counts.clips,
      loopClosureRequestCount:
        result.manifest.counts.loopClosureRequests,
      workspaceOperationCount:
        result.manifest.counts.workspaceOperations,
      outputRoot: result.outputRootRelative,
      manifestSha256: result.manifest.documentSha256,
      receiptSha256: result.receipt.documentSha256,
      sourcePlanRevalidatedBeforePublication: true,
      wholeRunAtomicPublication: true,
      runtimeActivationAllowed: false,
      sourceMutation: false,
      targetImageWrite: false,
      providerExecution: false,
      repositoryMutation: false,
      gitPush: false,
      publication: false,
    }),
  );
}

const isEntrypoint =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntrypoint) {
  try {
    main();
  } catch (error) {
    console.error(
      `${error?.code ?? 'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_FAILED'}: ${
        error?.message ?? String(error)
      }`,
    );
    process.exit(1);
  }
}
