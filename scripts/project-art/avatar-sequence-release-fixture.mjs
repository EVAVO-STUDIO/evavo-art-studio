export const REQUIRED_SEQUENCE_RELEASE_FAIL_CLOSED_CODES = Object.freeze([
  'AVATAR_SEQUENCE_RELEASE_FRAME_NOT_ADMITTED',
  'AVATAR_SEQUENCE_RELEASE_LOOP_REVIEW_FAILED',
  'AVATAR_SEQUENCE_RELEASE_TIMING_HASH_MISMATCH',
  'AVATAR_SEQUENCE_RELEASE_APPROVAL_TIME_INVALID',
  'AVATAR_SEQUENCE_RELEASE_EXISTING_BUNDLE_INVALID',
]);

const PLAN_AUTHORITY_KEYS = Object.freeze([
  'providerExecution',
  'sourceMutation',
  'sourceDeletion',
  'candidateApproval',
  'candidatePromotion',
  'targetRepositoryMutation',
  'gitCommit',
  'gitPush',
  'publication',
  'deployment',
  'forcePush',
]);

export function minimalAvatarSequenceMasteringPlan(overrides = {}) {
  const frame = {
    id: 'idle-a',
    path: 'assets/eva-female/reviewed/idle-a.png',
    sha256: 'a'.repeat(64),
    bytes: 128,
    width: 64,
    height: 64,
  };
  const clip = {
    id: 'idle-main',
    kind: 'idle',
    loopMode: 'once',
    frames: [{ frameId: frame.id, durationMs: 120 }],
    neutralFrameId: frame.id,
    emotion: null,
    durationMs: 120,
  };
  const plan = {
    schema: 'evavo.project-art-avatar-sequence-mastering-plan.v1',
    planId: 'eva-sequence-plan-v1',
    assignmentId: 'eva-owner-declared-v1',
    characterId: 'eva-female',
    revision: 1,
    purpose: 'Owner-declared avatar sequence fixture.',
    compiledAt: '2026-08-13T09:00:00.000Z',
    requestSha256: '1'.repeat(64),
    requestCanonicalSha256: '2'.repeat(64),
    assignment: {
      mode: 'owner-declared-only',
      semanticInferencePerformed: false,
      timestampOrderingUsedAsSemantics: false,
    },
    workspace: {
      root: '/fixture',
      sourcePathsAreRelative: true,
      symbolicLinksAllowed: false,
    },
    runtimeDraft: {
      targetSchema: 'evavo_avatar_sequence_pack_v2',
      characterId: 'eva-female',
      revision: 1,
      canvas: { width: 64, height: 64 },
      frames: [frame],
      clips: [clip],
      defaults: {
        idleClipId: clip.id,
        talk: {
          inClipId: clip.id,
          loopClipId: clip.id,
          outClipId: clip.id,
        },
        presence: {},
        events: {},
        emotions: {},
      },
      review: null,
      loopClosures: [],
      runtimeActivationAllowed: false,
      authority: Object.fromEntries(PLAN_AUTHORITY_KEYS.map((key) => [key, false])),
    },
    loopClosureRequests: [],
    finalizationRequirements: {
      timingReviewRequired: true,
      loopReviewsRequired: 0,
      artReviewRequired: true,
      animationReviewRequired: true,
      runtimeReviewRequired: true,
      releaseSealRequired: true,
      independentReviewRequired: true,
      productionReady: false,
      runtimeActivationAllowed: false,
    },
    outputs: {
      workspaceFilePlan: 'sequence/workspace-file-plan-request.json',
      runtimeDraft: 'sequence/runtime-sequence-draft.json',
      loopClosureRequestRoot: 'sequence/loop-closure',
      finalization: 'sequence/finalization-requirements.json',
    },
    authority: Object.fromEntries(PLAN_AUTHORITY_KEYS.map((key) => [key, false])),
    documentSha256: 'd'.repeat(64),
  };
  return Object.assign(structuredClone(plan), structuredClone(overrides));
}
