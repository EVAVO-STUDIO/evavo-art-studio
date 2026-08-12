import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  AVATAR_SEQUENCE_LOOP_EVIDENCE_TARGET_SCHEMA,
  AVATAR_SEQUENCE_PACK_TARGET_SCHEMA,
  PLAN_AUTHORITY_KEYS,
  PLAN_EFFECT_KEYS,
  PROJECT_ART_AVATAR_SEQUENCE_PLAN_SCHEMA,
  PROJECT_ART_LOOP_CLOSURE_REQUEST_SCHEMA,
  REVIEW_DISCIPLINES,
  RUNTIME_AUTHORITY_KEYS,
  canonicalJson,
  falseAuthority,
  hashBytes,
  withDocumentHash,
} from './avatar-sequence-bundle-common.mjs';

function digest(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function loopReviewId(assignmentId, clipId) {
  return `loop-${hashBytes(Buffer.from(`${assignmentId}:${clipId}`, 'utf8')).slice(0, 24)}`;
}

function thresholds() {
  return {
    maximumChangedFraction: 0.25,
    maximumMeanChannelDelta: 48,
    maximumAlphaChangedFraction: 0.2,
    maximumCentroidShiftPixels: 24,
  };
}

export function makeAvatarSequenceBundlePlan(workspace) {
  const assignmentId = 'eva-owner-assignment-v1';
  const characterId = 'eva-female';
  const frameSpecs = [
    ['idle-a', 101],
    ['idle-b', 102],
    ['talk-a', 103],
    ['talk-b', 104],
  ];
  const sources = frameSpecs.map(([id, seed]) => ({
    id,
    sourcePath: `source/${id}.png`,
    targetPath: `assets/${characterId}/reviewed/${id}.png`,
    sha256: digest(seed),
    bytes: 128 + seed,
    image: {
      format: 'png',
      width: 2,
      height: 2,
      bitDepth: 8,
      colourType: 6,
      alphaChannel: true,
      interlaced: false,
    },
    alreadyReviewedAtTarget: false,
  }));
  const frames = sources.map((source) => ({
    id: source.id,
    path: source.targetPath,
    sha256: source.sha256,
    bytes: source.bytes,
    width: 2,
    height: 2,
  }));
  const clips = [
    {
      id: 'idle-main',
      kind: 'idle',
      loopMode: 'loop',
      frames: [
        { frameId: 'idle-a', durationMs: 80 },
        { frameId: 'idle-b', durationMs: 80 },
      ],
      neutralFrameId: 'idle-a',
      emotion: null,
      durationMs: 160,
    },
    {
      id: 'talk-enter',
      kind: 'talk-in',
      loopMode: 'once',
      frames: [
        { frameId: 'idle-a', durationMs: 80 },
        { frameId: 'talk-a', durationMs: 80 },
      ],
      neutralFrameId: 'idle-a',
      emotion: null,
      durationMs: 160,
    },
    {
      id: 'talk-main',
      kind: 'talk-loop',
      loopMode: 'loop',
      frames: [
        { frameId: 'talk-a', durationMs: 80 },
        { frameId: 'talk-b', durationMs: 80 },
      ],
      neutralFrameId: 'talk-a',
      emotion: null,
      durationMs: 160,
    },
    {
      id: 'talk-exit',
      kind: 'talk-out',
      loopMode: 'once',
      frames: [
        { frameId: 'talk-b', durationMs: 80 },
        { frameId: 'idle-a', durationMs: 80 },
      ],
      neutralFrameId: 'idle-a',
      emotion: null,
      durationMs: 160,
    },
  ];
  const frameById = new Map(frames.map((frame) => [frame.id, frame]));
  const loopRequests = clips
    .filter((clip) => clip.loopMode === 'loop')
    .map((clip) => {
      const request = {
        schema: PROJECT_ART_LOOP_CLOSURE_REQUEST_SCHEMA,
        reviewId: loopReviewId(assignmentId, clip.id),
        projectId: characterId,
        purpose: `Validate the final-to-first seam for explicitly assigned clip ${clip.id}.`,
        frames: clip.frames.map((entry) => {
          const frame = frameById.get(entry.frameId);
          return { path: frame.path, expectedSha256: frame.sha256 };
        }),
        expected: { width: 2, height: 2, requireAlpha: true },
        thresholds: thresholds(),
        preview: { difference: true, overlay: true, onionSkin: true },
        authority: falseAuthority(PLAN_AUTHORITY_KEYS),
      };
      return {
        clipId: clip.id,
        request,
        requestCanonicalSha256: hashBytes(
          Buffer.from(canonicalJson(request), 'utf8'),
        ),
      };
    });
  const totalBytes = sources.reduce((sum, source) => sum + source.bytes, 0);
  const requestCanonicalSha256 = digest('owner-request-canonical');
  return withDocumentHash({
    schema: PROJECT_ART_AVATAR_SEQUENCE_PLAN_SCHEMA,
    planId: `avatar-sequence-${requestCanonicalSha256.slice(0, 24)}`,
    assignmentId,
    characterId,
    revision: 1,
    purpose: 'Materialize exact owner-declared EVA sequence handoffs.',
    compiledAt: '2026-08-11T23:55:00.000Z',
    requestSha256: digest('owner-request-bytes'),
    requestCanonicalSha256,
    assignment: {
      mode: 'owner-declared-only',
      semanticInferencePerformed: false,
      timestampOrderingUsedAsSemantics: false,
    },
    workspace: {
      root: workspace,
      sourcePathsAreRelative: true,
      symbolicLinksAllowed: false,
      hardLinkedSourcesAllowed: false,
    },
    sourceSummary: {
      frameCount: sources.length,
      clipCount: clips.length,
      loopClipCount: loopRequests.length,
      totalSourceBytes: totalBytes,
      totalDecodedPixels: sources.length * 4,
      sourceIdentitiesReadStably: true,
      allFramesMatchCanvas: true,
      allFramesHaveAlpha: true,
      allRuntimePathsReviewed: true,
    },
    sources,
    workspaceFilePlanRequest: {
      workspaceRoot: workspace,
      idempotencyKey: `avatar-sequence:${requestCanonicalSha256}`,
      operations: sources.map((source) => ({
        type: 'copy',
        source: source.sourcePath,
        target: source.targetPath,
        expectedSourceSha256: source.sha256,
      })),
    },
    runtimeDraft: {
      targetSchema: AVATAR_SEQUENCE_PACK_TARGET_SCHEMA,
      characterId,
      revision: 1,
      canvas: { width: 2, height: 2 },
      review: null,
      frames,
      clips,
      loopClosures: [],
      runtimeActivationAllowed: false,
      defaults: {
        idleClipId: 'idle-main',
        talk: {
          inClipId: 'talk-enter',
          loopClipId: 'talk-main',
          outClipId: 'talk-exit',
        },
        presence: { idle: 'idle-main' },
        events: {},
        emotions: {},
      },
      authority: falseAuthority(RUNTIME_AUTHORITY_KEYS),
    },
    loopClosureRequests: loopRequests,
    finalizationRequirements: {
      targetPackSchema: AVATAR_SEQUENCE_PACK_TARGET_SCHEMA,
      targetLoopEvidenceSchema: AVATAR_SEQUENCE_LOOP_EVIDENCE_TARGET_SCHEMA,
      workspaceFilePlanApplicationRequired: true,
      requiredLoopClosureEvidenceCount: loopRequests.length,
      independentReviewRequired: true,
      requiredApprovalDisciplines: REVIEW_DISCIPLINES,
      releaseSealRequired: true,
      runtimeActivationAllowed: false,
    },
    effects: falseAuthority(PLAN_EFFECT_KEYS),
    limits: {
      maximumRequestBytes: 16 * 1024 * 1024,
      maximumSourceBytes: 128 * 1024 * 1024,
      maximumTotalSourceBytes: 2 * 1024 * 1024 * 1024,
      maximumDecodedPixels: 300_000_000,
      maximumFrames: 2_048,
      maximumClips: 256,
      maximumFramesPerClip: 240,
      maximumMapEntries: 64,
    },
    authority: falseAuthority(PLAN_AUTHORITY_KEYS),
  });
}

export async function createAvatarSequenceBundleFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-avatar-bundle-'));
  const workspace = path.join(root, 'workspace');
  await mkdir(path.join(workspace, 'plans'), { recursive: true });
  await mkdir(path.join(workspace, 'bundles'), { recursive: true });
  const plan = makeAvatarSequenceBundlePlan(workspace);
  const planPath = path.join(workspace, 'plans', 'eva-mastering-plan.json');
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 });
  return { root, workspace, plan, planPath };
}
