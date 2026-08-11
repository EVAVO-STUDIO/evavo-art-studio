#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  AUTHORITY_KEYS,
  AVATAR_SEQUENCE_LOOP_EVIDENCE_TARGET_SCHEMA,
  AVATAR_SEQUENCE_PACK_TARGET_SCHEMA,
  LIMITS,
  PROJECT_ART_AVATAR_SEQUENCE_PLAN_SCHEMA,
  PROJECT_ART_AVATAR_SEQUENCE_REQUEST_SCHEMA,
  PROJECT_ART_LOOP_CLOSURE_REQUEST_SCHEMA,
  ProjectArtAvatarSequenceError,
  REVIEW_DISCIPLINES,
  RUNTIME_AUTHORITY_KEYS,
  boundedInteger,
  boundedString,
  canonicalJson,
  canonicalPath,
  digest,
  exactKeys,
  fail,
  hashBytes,
  identifier,
  isRecord,
  parseRequestBytes,
  reviewedTargetPath,
  timestamp,
  withProjectArtAvatarSequenceDocumentHash,
} from './project-art/avatar-sequence-common.mjs';
export {
  AVATAR_SEQUENCE_PACK_TARGET_SCHEMA,
  PROJECT_ART_AVATAR_SEQUENCE_PLAN_SCHEMA,
  PROJECT_ART_AVATAR_SEQUENCE_REQUEST_SCHEMA,
  PROJECT_ART_LOOP_CLOSURE_REQUEST_SCHEMA,
  ProjectArtAvatarSequenceError,
} from './project-art/avatar-sequence-common.mjs';

import {
  falseAuthority,
  parseAuthority,
  parseCanvas,
  parseClips,
  parseDefaults,
} from './project-art/avatar-sequence-contract.mjs';
import {
  assertTargetAvailable,
  directory,
  pngHeader,
  regularFile,
  resolveSource,
  sameSnapshot,
  stableHash,
} from './project-art/avatar-sequence-filesystem.mjs';

export async function compileProjectArtAvatarSequence({
  workspaceRoot,
  request,
  requestBytes,
  compiledAt = new Date().toISOString(),
}) {
  const root = directory(workspaceRoot, 'workspace-root');
  timestamp(compiledAt, 'compiledAt');
  if (
    !Buffer.isBuffer(requestBytes) ||
    requestBytes.length < 2 ||
    requestBytes.length > LIMITS.maximumRequestBytes
  ) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_REQUEST_INVALID',
      'requestBytes must remain inside the exact request boundary.',
    );
  }
  const requestFromBytes = parseRequestBytes(requestBytes);
  if (!isRecord(request) || request.schema !== PROJECT_ART_AVATAR_SEQUENCE_REQUEST_SCHEMA) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_REQUEST_INVALID',
      `Request must use ${PROJECT_ART_AVATAR_SEQUENCE_REQUEST_SCHEMA}.`,
    );
  }
  exactKeys(
    request,
    [
      'schema',
      'assignmentId',
      'characterId',
      'revision',
      'purpose',
      'assignmentMode',
      'semanticInferencePerformed',
      'timestampOrderingUsedAsSemantics',
      'canvas',
      'frames',
      'clips',
      'defaults',
      'authority',
    ],
    'request',
  );
  if (
    request.assignmentMode !== 'owner-declared-only' ||
    request.semanticInferencePerformed !== false ||
    request.timestampOrderingUsedAsSemantics !== false
  ) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_EXPLICIT_ASSIGNMENT_REQUIRED',
      'Animation meaning must be owner-declared; filenames and timestamps cannot assign semantics.',
    );
  }
  if (canonicalJson(requestFromBytes) !== canonicalJson(request)) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_REQUEST_BYTES_MISMATCH',
      'requestBytes must encode the exact supplied request object.',
    );
  }

  const assignmentId = identifier(request.assignmentId, 'assignmentId');
  const characterId = identifier(request.characterId, 'characterId');
  const revision = boundedInteger(request.revision, 'revision', 1, 1_000_000);
  const purpose = boundedString(request.purpose, 'purpose', 8192);
  const canvas = parseCanvas(request.canvas);
  const authority = parseAuthority(request.authority);
  const runtimeAuthority = falseAuthority(RUNTIME_AUTHORITY_KEYS);
  if (
    !Array.isArray(request.frames) ||
    request.frames.length < 1 ||
    request.frames.length > LIMITS.maximumFrames
  ) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_FRAMES_INVALID');
  }

  const ids = new Set();
  const sourcePaths = new Set();
  const targetPaths = new Set();
  const hashes = new Map();
  const frames = [];
  const sources = [];
  const operations = [];
  let totalBytes = 0;
  let totalPixels = 0;

  for (const [index, descriptor] of request.frames.entries()) {
    exactKeys(
      descriptor,
      ['id', 'sourcePath', 'targetPath', 'expectedSha256'],
      `frames[${index}]`,
    );
    const id = identifier(descriptor.id, `frames[${index}].id`);
    if (ids.has(id)) fail('PROJECT_ART_AVATAR_SEQUENCE_FRAME_ID_DUPLICATE');
    ids.add(id);
    const sourcePath = canonicalPath(
      descriptor.sourcePath,
      `frames[${index}].sourcePath`,
    );
    if (path.posix.extname(sourcePath).toLowerCase() !== '.png') {
      fail('PROJECT_ART_AVATAR_SEQUENCE_FRAME_FORMAT_INVALID');
    }
    if (sourcePaths.has(sourcePath)) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_SOURCE_PATH_DUPLICATE');
    }
    sourcePaths.add(sourcePath);
    const targetPath = reviewedTargetPath(
      descriptor.targetPath,
      characterId,
      id,
      `frames[${index}].targetPath`,
    );
    if (targetPaths.has(targetPath)) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_TARGET_PATH_DUPLICATE');
    }
    targetPaths.add(targetPath);
    const source = resolveSource(root, sourcePath, `frames[${index}].sourcePath`);
    const identity = await stableHash(source.absolute, `frames[${index}]`);
    if (identity.sha256 !== digest(descriptor.expectedSha256, `frames[${index}].expectedSha256`)) {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_SOURCE_HASH_MISMATCH',
        `Source SHA-256 mismatch: ${sourcePath}.`,
      );
    }
    if (hashes.has(identity.sha256)) {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_FRAME_BYTES_DUPLICATE',
        'Exact duplicate frame bytes must be represented once and reused by frame ID.',
      );
    }
    hashes.set(identity.sha256, id);
    const image = pngHeader(source.absolute, `frames[${index}]`);
    if (image.width !== canvas.width || image.height !== canvas.height) {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_DIMENSION_MISMATCH',
        `${sourcePath} does not match the declared canvas.`,
      );
    }
    totalBytes += identity.bytes;
    totalPixels += image.width * image.height;
    if (totalBytes > LIMITS.maximumTotalSourceBytes) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_SOURCE_BUDGET_EXCEEDED');
    }
    if (totalPixels > LIMITS.maximumDecodedPixels) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_PIXEL_BUDGET_EXCEEDED');
    }
    assertTargetAvailable(
      root,
      targetPath,
      source.absolute,
      `frames[${index}].targetPath`,
    );
    const frame = Object.freeze({
      id,
      path: targetPath,
      sha256: identity.sha256,
      bytes: identity.bytes,
      width: image.width,
      height: image.height,
    });
    frames.push(frame);
    sources.push(
      Object.freeze({
        id,
        sourcePath,
        targetPath,
        sha256: identity.sha256,
        bytes: identity.bytes,
        image,
        alreadyReviewedAtTarget: sourcePath === targetPath,
      }),
    );
    if (sourcePath !== targetPath) {
      operations.push(
        Object.freeze({
          type: 'copy',
          source: sourcePath,
          target: targetPath,
          expectedSourceSha256: identity.sha256,
        }),
      );
    }
  }

  const framesById = new Map(frames.map((frame) => [frame.id, frame]));
  const parsedClips = parseClips(
    request.clips,
    framesById,
    assignmentId,
    characterId,
    canvas,
    falseAuthority(AUTHORITY_KEYS),
  );
  const defaults = parseDefaults(
    request.defaults,
    parsedClips.clips,
    parsedClips.clipIds,
  );
  const requestSha256 = hashBytes(requestBytes);
  const requestCanonicalSha256 = hashBytes(
    Buffer.from(canonicalJson(request), 'utf8'),
  );
  const planId = `avatar-sequence-${requestCanonicalSha256.slice(0, 24)}`;
  const runtimeDraft = Object.freeze({
    targetSchema: AVATAR_SEQUENCE_PACK_TARGET_SCHEMA,
    characterId,
    revision,
    canvas: Object.freeze({ width: canvas.width, height: canvas.height }),
    review: null,
    frames: Object.freeze(frames),
    clips: parsedClips.clips,
    loopClosures: Object.freeze([]),
    runtimeActivationAllowed: false,
    defaults,
    authority: runtimeAuthority,
  });

  return withProjectArtAvatarSequenceDocumentHash({
    schema: PROJECT_ART_AVATAR_SEQUENCE_PLAN_SCHEMA,
    planId,
    assignmentId,
    characterId,
    revision,
    purpose,
    compiledAt,
    requestSha256,
    requestCanonicalSha256,
    assignment: Object.freeze({
      mode: 'owner-declared-only',
      semanticInferencePerformed: false,
      timestampOrderingUsedAsSemantics: false,
    }),
    workspace: Object.freeze({
      root,
      sourcePathsAreRelative: true,
      symbolicLinksAllowed: false,
      hardLinkedSourcesAllowed: false,
    }),
    sourceSummary: Object.freeze({
      frameCount: frames.length,
      clipCount: parsedClips.clips.length,
      loopClipCount: parsedClips.loopClosureRequests.length,
      totalSourceBytes: totalBytes,
      totalDecodedPixels: totalPixels,
      sourceIdentitiesReadStably: true,
      allFramesMatchCanvas: true,
      allFramesHaveAlpha: true,
      allRuntimePathsReviewed: true,
    }),
    sources: Object.freeze(sources),
    workspaceFilePlanRequest: Object.freeze({
      workspaceRoot: root,
      idempotencyKey: `avatar-sequence:${requestCanonicalSha256}`,
      operations: Object.freeze(operations),
    }),
    runtimeDraft,
    loopClosureRequests: parsedClips.loopClosureRequests,
    finalizationRequirements: Object.freeze({
      targetPackSchema: AVATAR_SEQUENCE_PACK_TARGET_SCHEMA,
      targetLoopEvidenceSchema: AVATAR_SEQUENCE_LOOP_EVIDENCE_TARGET_SCHEMA,
      workspaceFilePlanApplicationRequired: operations.length > 0,
      requiredLoopClosureEvidenceCount: parsedClips.loopClosureRequests.length,
      independentReviewRequired: true,
      requiredApprovalDisciplines: REVIEW_DISCIPLINES,
      releaseSealRequired: true,
      runtimeActivationAllowed: false,
    }),
    effects: Object.freeze({
      sourceMutation: false,
      sourceDeletion: false,
      targetImageWrite: false,
      providerExecution: false,
      candidateApproval: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitCommit: false,
      gitPush: false,
      publication: false,
      deployment: false,
      forcePush: false,
    }),
    limits: LIMITS,
    authority,
  });
}

function readRequest(value) {
  const before = regularFile(value, 'request', LIMITS.maximumRequestBytes);
  const bytes = readFileSync(value);
  const after = regularFile(value, 'request', LIMITS.maximumRequestBytes);
  if (!sameSnapshot(before, after) || bytes.length !== before.size) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_FILE_CHANGED', 'request changed during read.');
  }
  const request = parseRequestBytes(bytes);
  return { request, requestBytes: bytes };
}

export async function compileProjectArtAvatarSequenceFile(
  requestPath,
  outputPath,
  { workspaceRoot, compiledAt = new Date().toISOString() },
) {
  const { request, requestBytes } = readRequest(path.resolve(requestPath));
  const plan = await compileProjectArtAvatarSequence({
    workspaceRoot,
    request,
    requestBytes,
    compiledAt,
  });
  const target = path.resolve(outputPath);
  directory(path.dirname(target), 'output parent');
  try {
    writeFileSync(target, `${JSON.stringify(plan, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
  } catch (error) {
    if (error?.code === 'EEXIST') {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_TARGET_EXISTS',
        'Mastering plan output is create-only and already exists.',
      );
    }
    throw error;
  }
  return plan;
}

function argumentsMap(argv) {
  const allowed = new Set([
    '--workspace-root',
    '--request',
    '--output',
    '--compiled-at',
  ]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || value === undefined || value.startsWith('--')) {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_ARGUMENT_INVALID',
        `Invalid argument near ${key ?? '<missing>'}.`,
      );
    }
    if (values.has(key)) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_ARGUMENT_INVALID', `Duplicate argument: ${key}.`);
    }
    values.set(key, value);
  }
  for (const required of ['--workspace-root', '--request', '--output']) {
    if (!values.has(required)) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_ARGUMENT_INVALID', `Missing ${required}.`);
    }
  }
  return values;
}

async function main() {
  const args = argumentsMap(process.argv.slice(2));
  const plan = await compileProjectArtAvatarSequenceFile(
    args.get('--request'),
    args.get('--output'),
    {
      workspaceRoot: args.get('--workspace-root'),
      compiledAt: args.get('--compiled-at') ?? new Date().toISOString(),
    },
  );
  console.log(
    JSON.stringify({
      status: 'passed',
      schema: plan.schema,
      planId: plan.planId,
      assignmentId: plan.assignmentId,
      characterId: plan.characterId,
      frameCount: plan.sourceSummary.frameCount,
      clipCount: plan.sourceSummary.clipCount,
      loopClipCount: plan.sourceSummary.loopClipCount,
      copyOperationCount: plan.workspaceFilePlanRequest.operations.length,
      documentSha256: plan.documentSha256,
      semanticInferencePerformed: false,
      sourceMutation: false,
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
  main().catch((error) => {
    console.error(
      `${error?.code ?? 'PROJECT_ART_AVATAR_SEQUENCE_COMPILE_FAILED'}: ${error?.message ?? String(error)}`,
    );
    process.exit(1);
  });
}
