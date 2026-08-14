import {
  AVATAR_FINAL_PASS_PROVIDER_REQUEST_SCHEMA,
  compileProjectArtAvatarFinalPassProviderBatch,
  createAvatarFinalPassProviderAuthority,
  sha256AvatarFinalPassProviderDocument,
} from './avatar-final-pass-provider.mjs';

export const at = '2026-08-13T02:00:00.000Z';
export const hash = (character) => character.repeat(64);
const commit = '1'.repeat(40);

export function sealPlan(overrides = {}) {
  const authority = Object.freeze({
    semanticAssignment: false,
    sourceMutation: false,
    sourceDeletion: false,
    imageEditing: false,
    providerExecution: false,
    candidateApproval: false,
    candidatePromotion: false,
    repositoryMutation: false,
    gitCommit: false,
    gitPush: false,
    deployment: false,
    publication: false,
    runtimeActivation: false,
    forcePush: false,
  });
  const body = {
    schema: 'evavo.project-art-avatar-final-pass-plan.v1',
    sessionId: 'eva-final-pass-v1',
    characterId: 'eva-female',
    sourceCommit: commit,
    compiledAt: '2026-08-12T12:00:00.000Z',
    canvas: { width: 1024, height: 1024 },
    repairJobs: [
      {
        schema: 'evavo.project-art-avatar-frame-repair-request.v1',
        frameId: 'talk-a',
        mode: 'provider-redraw',
        sourcePath: 'frames/talk-a.png',
        sourceSha256: hash('a'),
        targetPath: 'assets/eva-female/reviewed/talk-a.png',
        issues: ['hands', 'fingers'],
        operations: [],
        referenceImages: ['frames/talk-a.png'],
        providerExecutionAllowed: false,
        candidateApproval: false,
      },
      {
        schema: 'evavo.project-art-avatar-frame-repair-request.v1',
        frameId: 'idle-b',
        mode: 'deterministic',
        sourcePath: 'frames/idle-b.png',
        sourceSha256: hash('c'),
        targetPath: 'assets/eva-female/reviewed/idle-b.png',
        issues: ['edge-halo'],
        operations: ['defringe'],
        sourceMutationAllowed: false,
        providerExecutionAllowed: false,
        candidateApproval: false,
      },
    ],
    inbetweenJobs: [
      {
        schema: 'evavo.project-art-avatar-inbetween-request.v1',
        frameId: 'idle-mid',
        method: 'provider-generated',
        before: {
          frameId: 'idle-a',
          path: 'assets/eva-female/reviewed/idle-a.png',
          sourceSha256: hash('b'),
        },
        after: {
          frameId: 'idle-b',
          path: 'assets/eva-female/reviewed/idle-b.png',
          sourceSha256: hash('c'),
        },
        targetPath: 'assets/eva-female/reviewed/idle-mid.png',
        durationMs: 80,
        constraints: ['hands', 'anatomy', 'face-identity', 'style'],
        canvas: { width: 1024, height: 1024 },
        productionEligible: false,
        providerExecutionAllowed: false,
        candidateApproval: false,
      },
      {
        schema: 'evavo.project-art-avatar-inbetween-request.v1',
        frameId: 'preview-mid',
        method: 'deterministic-morph-preview',
        before: {
          frameId: 'idle-a',
          path: 'assets/eva-female/reviewed/idle-a.png',
          sourceSha256: hash('b'),
        },
        after: {
          frameId: 'idle-b',
          path: 'assets/eva-female/reviewed/idle-b.png',
          sourceSha256: hash('c'),
        },
        targetPath: 'assets/eva-female/reviewed/preview-mid.png',
        durationMs: 80,
        constraints: ['hands'],
        canvas: { width: 1024, height: 1024 },
        productionEligible: false,
        providerExecutionAllowed: false,
        candidateApproval: false,
      },
    ],
    sequenceMasteringRequestTemplate: {
      schema: 'evavo.project-art-avatar-sequence-request.v1',
      frames: [
        {
          id: 'idle-a',
          sourcePath: 'frames/idle-a.png',
          targetPath: 'assets/eva-female/reviewed/idle-a.png',
          expectedSha256: hash('b'),
          pendingOutput: false,
        },
        {
          id: 'idle-b',
          sourcePath: 'frames/idle-b.png',
          targetPath: 'assets/eva-female/reviewed/idle-b.png',
          expectedSha256: hash('c'),
          pendingOutput: false,
        },
        {
          id: 'talk-a',
          sourcePath: 'frames/talk-a.png',
          targetPath: 'assets/eva-female/reviewed/talk-a.png',
          expectedSha256: null,
          pendingOutput: true,
        },
        {
          id: 'idle-mid',
          sourcePath: null,
          targetPath: 'assets/eva-female/reviewed/idle-mid.png',
          expectedSha256: null,
          pendingOutput: true,
        },
      ],
    },
    productionReady: false,
    runtimeActivationAllowed: false,
    authority,
    ...overrides,
  };
  return {
    ...body,
    planSha256: sha256AvatarFinalPassProviderDocument(body),
  };
}

export function admission(bindingKey, sourcePath, sourceSha256, marker) {
  return {
    bindingKey,
    sourcePath,
    sourceSha256,
    artifactId: `artifact_${hash(marker)}`,
    evidenceSha256: hash(marker === 'f' ? 'e' : 'f'),
    actorClass: 'human',
    actorId: 'greg-parker',
    occurredAt: at,
  };
}

export function selection() {
  return {
    preferredAdapterId: null,
    preferredModel: null,
    allowedAdapterIds: [],
    allowFallback: false,
    requireSeed: false,
    seed: null,
  };
}

export function authorization() {
  return {
    action: 'run-provider-once',
    actorClass: 'human',
    actorId: 'greg-parker',
    occurredAt: at,
    evidenceSha256: hash('9'),
  };
}

export function request(plan, { ready = true } = {}) {
  return {
    schema: AVATAR_FINAL_PASS_PROVIDER_REQUEST_SCHEMA,
    requestId: 'eva-provider-run-001',
    planSha256: plan.planSha256,
    jobs: [
      {
        jobId: 'redraw:talk-a',
        identityFrameId: 'idle-a',
        candidateOutputPath:
          'scratch/avatar-final-pass/eva-final-pass-v1/talk-a/candidate-01.png',
        selection: selection(),
        authorization: ready ? authorization() : null,
        artifactBindings: ready
          ? [
              admission(
                'canonical-identity',
                'frames/idle-a.png',
                hash('b'),
                '1',
              ),
              admission('base-image', 'frames/talk-a.png', hash('a'), '2'),
              admission(
                'defect-mask',
                'masks/talk-a-hands.png',
                hash('d'),
                '6',
              ),
            ]
          : [],
        notes: 'Repair only the malformed right hand and preserve the pose.',
      },
      {
        jobId: 'inbetween:idle-mid',
        identityFrameId: 'idle-a',
        candidateOutputPath:
          'scratch/avatar-final-pass/eva-final-pass-v1/idle-mid/candidate-01.png',
        selection: selection(),
        authorization: ready ? authorization() : null,
        artifactBindings: ready
          ? [
              admission(
                'canonical-identity',
                'frames/idle-a.png',
                hash('b'),
                '3',
              ),
              admission(
                'previous-key-pose',
                'frames/idle-a.png',
                hash('b'),
                '4',
              ),
              admission(
                'next-key-pose',
                'frames/idle-b.png',
                hash('c'),
                '5',
              ),
            ]
          : [],
        notes: 'Create one stable breathing in-between with no hand drift.',
      },
    ],
    authority: { ...createAvatarFinalPassProviderAuthority() },
  };
}

export function compile(plan, input) {
  const planBytes = Buffer.from(`${JSON.stringify(plan, null, 2)}\n`);
  const requestBytes = Buffer.from(`${JSON.stringify(input, null, 2)}\n`);
  return compileProjectArtAvatarFinalPassProviderBatch({
    plan,
    planBytes,
    request: input,
    requestBytes,
    compiledAt: at,
  });
}
