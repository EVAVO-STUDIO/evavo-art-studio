import {
  AVATAR_FINAL_PASS_PROVIDER_BATCH_SCHEMA,
  GENERIC_PROVIDER_PROTOCOL_VERSION,
  PROVIDER_BATCH_AUTHORITY_KEYS,
} from './avatar-final-pass-provider-runtime-constants.mjs';
import {
  createAuthority,
  sha256Document,
  sha256Text,
} from './avatar-final-pass-provider-runtime-common.mjs';
import {
  compileAvatarFinalPassProviderRuntimeDispatch,
  compileAvatarFinalPassProviderRuntimeOutcome,
  validateAvatarFinalPassCompiledProviderRuntimeContract,
} from './avatar-final-pass-provider-runtime-dispatch.mjs';

export const fixtureTime = '2026-08-13T03:00:00.000Z';
export const hash = (character) => character.repeat(64);
export const artifact = (character) => `artifact_${hash(character)}`;

function admittedReference(
  bindingKey,
  role,
  sourcePath,
  sourceSha256,
  marker,
) {
  return Object.freeze({
    bindingKey,
    role,
    sourcePath,
    sourceSha256,
    required: true,
    note: `${role} fixture reference.`,
    artifactId: artifact(marker),
    evidenceSha256: hash(marker === 'f' ? 'e' : 'f'),
    actorClass: 'human',
    actorId: 'greg-parker',
    occurredAt: fixtureTime,
  });
}

function requiredReference(admitted) {
  const {
    artifactId: _artifactId,
    evidenceSha256: _evidenceSha256,
    actorClass: _actorClass,
    actorId: _actorId,
    occurredAt: _occurredAt,
    ...required
  } = admitted;
  return Object.freeze(required);
}

function style() {
  return Object.freeze({
    styleName: 'eva-female canonical avatar production style',
    intent: 'Match the admitted canonical identity and neighbouring frames.',
    mustHave: Object.freeze([
      'one coherent character frame',
      'clean hands and fingers',
      'stable face identity',
      'native transparent alpha',
    ]),
    mustAvoid: Object.freeze([
      'malformed hands',
      'identity drift',
      'background contamination',
    ]),
    identityLocks: Object.freeze(['character eva-female']),
    palette: Object.freeze([]),
    lineTreatment: Object.freeze(['Match the canonical reference.']),
    materials: Object.freeze([]),
    cameraRules: Object.freeze(['Preserve the existing camera.']),
    compositionRules: Object.freeze(['Preserve exact canvas registration.']),
    eraRules: Object.freeze([]),
  });
}

function requestInput({
  operation,
  continuityPhase,
  frameId,
  candidateOutputPath,
  targetPath,
  references,
}) {
  return Object.freeze({
    schemaVersion: '1.0',
    operation,
    assetKind: 'sprite-frame',
    continuityPhase,
    assetId: `eva-female:${frameId}`,
    candidateFamilyId: `avatar-final-pass:eva-final-pass-v1:${frameId}`,
    creativeIntent:
      operation === 'edit'
        ? `Create exactly one repaired EVA frame ${frameId} with clean hands.`
        : `Create exactly one coherent EVA in-between frame ${frameId}.`,
    negativeIntent: 'Reject malformed anatomy, identity drift and extra images.',
    style: style(),
    shot: Object.freeze({
      subject: `eva-female frame ${frameId}`,
      action:
        operation === 'edit'
          ? 'Repair only the malformed hand.'
          : 'Create one coherent breathing in-between.',
      direction: 'Match the admitted references exactly.',
      include: Object.freeze(['stable identity', 'clean anatomy']),
      exclude: Object.freeze(['double exposure', 'extra hands']),
      separateAssets: Object.freeze([]),
      framing: Object.freeze(['One registered character frame.']),
    }),
    target: Object.freeze({
      width: 1024,
      height: 1024,
      transparency: 'required',
      outputFormat: 'png',
    }),
    sourceCanvas: Object.freeze({ width: 1024, height: 1024 }),
    background: Object.freeze({ strategy: 'native-alpha' }),
    quality: 'high',
    candidateCount: 1,
    references: Object.freeze(
      references.map((entry) =>
        Object.freeze({
          artifactId: entry.artifactId,
          role: entry.role,
          strength: 1,
          required: true,
          note: entry.note,
        }),
      ),
    ),
    selection: Object.freeze({
      allowedAdapterIds: Object.freeze([]),
      allowFallback: false,
      requireSeed: false,
    }),
    metadata: Object.freeze({
      schema: 'evavo.project-art-avatar-final-pass-provider-metadata.v1',
      planSha256: hash('a'),
      sourceCommit: '1'.repeat(40),
      sessionId: 'eva-final-pass-v1',
      characterId: 'eva-female',
      jobId:
        operation === 'edit' ? `redraw:${frameId}` : `inbetween:${frameId}`,
      frameId,
      upstreamJobSha256: hash(operation === 'edit' ? 'd' : 'e'),
      targetPath,
      candidateOutputPath,
      identityFrameId: 'idle-a',
      authorizationEvidenceSha256: hash('9'),
      approvals: Object.freeze({
        creative: false,
        anatomy: false,
        identity: false,
        continuity: false,
        loop: false,
        runtime: false,
        publication: false,
      }),
    }),
  });
}

function job({
  jobId,
  frameId,
  kind,
  operation,
  continuityPhase,
  targetPath,
  candidateOutputPath,
  admittedReferences,
}) {
  const providerRequestInput = requestInput({
    operation,
    continuityPhase,
    frameId,
    candidateOutputPath,
    targetPath,
    references: admittedReferences,
  });
  const composedPrompt = providerRequestInput.creativeIntent;
  const body = {
    jobId,
    frameId,
    kind,
    operation,
    continuityPhase,
    status: 'ready-for-explicit-provider-submission',
    blockers: Object.freeze([]),
    identityFrameId: 'idle-a',
    targetPath,
    candidateOutputPath,
    upstreamJobSha256: hash(operation === 'edit' ? 'd' : 'e'),
    requiredReferences: Object.freeze(
      admittedReferences.map(requiredReference),
    ),
    admittedReferences: Object.freeze(admittedReferences),
    authorization: Object.freeze({
      action: 'run-provider-once',
      actorClass: 'human',
      actorId: 'greg-parker',
      occurredAt: fixtureTime,
      evidenceSha256: hash('9'),
    }),
    composedPrompt,
    promptSha256: sha256Text(composedPrompt),
    providerRequestInput,
    providerRequestSha256: sha256Document(providerRequestInput),
    candidateCount: 1,
    providerExecution: false,
    candidateApproval: false,
    candidatePromotion: false,
    targetPublication: false,
  };
  return Object.freeze({
    ...body,
    jobEnvelopeSha256: sha256Document(body),
  });
}

export function providerBatch() {
  const identity = admittedReference(
    'canonical-identity',
    'canonical-identity',
    'frames/idle-a.png',
    hash('a'),
    '1',
  );
  const base = admittedReference(
    'base-image',
    'base-image',
    'frames/talk-a.png',
    hash('b'),
    '2',
  );
  const previous = admittedReference(
    'previous-key-pose',
    'previous-key-pose',
    'frames/idle-a.png',
    hash('a'),
    '3',
  );
  const next = admittedReference(
    'next-key-pose',
    'next-key-pose',
    'frames/idle-b.png',
    hash('c'),
    '4',
  );
  const edit = job({
    jobId: 'redraw:talk-a',
    frameId: 'talk-a',
    kind: 'provider-redraw',
    operation: 'edit',
    continuityPhase: 'key-pose',
    targetPath: 'assets/eva-female/reviewed/talk-a.png',
    candidateOutputPath:
      'scratch/avatar-final-pass/eva-final-pass-v1/talk-a/candidate-01.png',
    admittedReferences: [identity, base],
  });
  const generate = job({
    jobId: 'inbetween:idle-mid',
    frameId: 'idle-mid',
    kind: 'provider-generated-inbetween',
    operation: 'generate',
    continuityPhase: 'in-between',
    targetPath: 'assets/eva-female/reviewed/idle-mid.png',
    candidateOutputPath:
      'scratch/avatar-final-pass/eva-final-pass-v1/idle-mid/candidate-01.png',
    admittedReferences: [identity, previous, next],
  });
  const jobs = Object.freeze([edit, generate]);
  const body = {
    schema: AVATAR_FINAL_PASS_PROVIDER_BATCH_SCHEMA,
    requestId: 'eva-provider-run-001',
    compiledAt: fixtureTime,
    plan: Object.freeze({
      schema: 'evavo.project-art-avatar-final-pass-plan.v1',
      planSha256: hash('a'),
      sourceCommit: '1'.repeat(40),
      sessionId: 'eva-final-pass-v1',
      characterId: 'eva-female',
      canvas: Object.freeze({ width: 1024, height: 1024 }),
    }),
    requestSha256: hash('b'),
    requestCanonicalSha256: hash('c'),
    jobs,
    readySubmissions: Object.freeze(
      jobs.map((entry) =>
        Object.freeze({
          jobId: entry.jobId,
          candidateOutputPath: entry.candidateOutputPath,
          providerRequestSha256: entry.providerRequestSha256,
          providerRequestInput: entry.providerRequestInput,
        }),
      ),
    ),
    counts: Object.freeze({
      requested: 2,
      ready: 2,
      blocked: 0,
      redraws: 1,
      inbetweens: 1,
    }),
    candidateCountPerJob: 1,
    explicitProviderSubmissionRequired: true,
    providerExecution: false,
    candidateApproval: false,
    candidatePromotion: false,
    productionReady: false,
    runtimeActivationAllowed: false,
    authority: createAuthority(PROVIDER_BATCH_AUTHORITY_KEYS),
  };
  return Object.freeze({
    ...body,
    batchSha256: sha256Document(body),
  });
}

function expectedCapabilityProfile(input) {
  const values = new Set([input.operation, 'reference-images']);
  if (input.references.length > 1) values.add('multiple-reference-images');
  for (const reference of input.references) {
    if (reference.role === 'canonical-identity') values.add('identity-reference');
    if (
      reference.role === 'previous-key-pose' ||
      reference.role === 'next-key-pose'
    ) {
      values.add('temporal-reference');
    }
  }
  values.add('native-alpha');
  values.add('custom-size');
  values.add('candidate-count');
  return Object.freeze([...values].sort());
}

export function compiledRuntimeContract(dispatch) {
  const input = dispatch.providerCompiler.input;
  const base = {
    ...input,
    protocolVersion: GENERIC_PROVIDER_PROTOCOL_VERSION,
  };
  const requestId = `provider_${sha256Document(base).slice(0, 40)}`;
  const request = Object.freeze({ ...base, requestId });
  const compiledPrompt = `Provider candidate request\n\n${request.creativeIntent}`;
  const requiredCapabilities = Object.freeze([
    `provider.${request.operation}`,
    'provider.reference-lock',
    'provider.candidate-store',
    'evidence.bundle',
  ]);
  const requiredCapabilityProfile = expectedCapabilityProfile(input);
  return Object.freeze({
    schemaVersion: '1.0',
    request,
    requestSha256: sha256Document(request),
    requiredAdapterCapabilities: requiredCapabilityProfile,
    compiledPrompt,
    compiledPromptSha256: sha256Text(compiledPrompt),
    runtimeJob: Object.freeze({
      queue: 'provider',
      kind: `art.candidate.${request.operation}`,
      idempotencyKey: `provider:${requestId}`,
      payload: request,
      requiredCapabilities,
      requiredCapabilityProfile,
      maximumAttempts: 3,
      leaseDurationMs: 300_000,
      timeoutMs: 1_800_000,
      labels: Object.freeze({
        providerRequestId: requestId,
        candidateFamilyId: request.candidateFamilyId,
        assetId: request.assetId,
        continuityPhase: request.continuityPhase,
      }),
    }),
    executionMode: 'submit-runtime-job',
  });
}

export function candidateRunOutcome(dispatch, binding) {
  const requestId = binding.normalizedProviderRequestId;
  return Object.freeze({
    kind: 'candidate-run-result',
    submissionIdempotencyKey: dispatch.submissionIdempotencyKey,
    providerCallCount: 1,
    completedAt: fixtureTime,
    result: Object.freeze({
      schemaVersion: '1.0',
      protocolVersion: GENERIC_PROVIDER_PROTOCOL_VERSION,
      requestId,
      requestSha256: binding.normalizedProviderRequestSha256,
      compiledPromptSha256: binding.compiledPromptSha256,
      routingInspection: Object.freeze({
        schemaVersion: '1.0',
        protocolVersion: GENERIC_PROVIDER_PROTOCOL_VERSION,
        requestId,
        requestSha256: binding.normalizedProviderRequestSha256,
        requiredCapabilities: dispatch.expectedRuntimeContract.requiredCapabilityProfile,
        adapters: Object.freeze([]),
        eligibleAdapterIds: Object.freeze(['fixture-adapter']),
        firstEligibleAdapterId: 'fixture-adapter',
        outcome: 'eligible',
        fallbackAllowed: false,
        providerCallPerformedByInspection: false,
      }),
      adapterId: 'fixture-adapter',
      model: 'fixture-model',
      candidateArtifacts: Object.freeze([artifact('7')]),
      evidenceArtifact: artifact('8'),
      attempts: Object.freeze([
        Object.freeze({
          adapterId: 'fixture-adapter',
          model: 'fixture-model',
          startedAt: fixtureTime,
          completedAt: fixtureTime,
          outcome: 'succeeded',
        }),
      ]),
      requiresAlphaExtraction: false,
    }),
  });
}

export function providerFailureOutcome(dispatch) {
  return Object.freeze({
    kind: 'provider-failure',
    submissionIdempotencyKey: dispatch.submissionIdempotencyKey,
    providerCallCount: 1,
    completedAt: fixtureTime,
    failure: Object.freeze({
      code: 'PROVIDER_TIMEOUT',
      classification: 'transient',
      message: 'The provider timed out before returning a candidate.',
      adapterId: 'fixture-adapter',
      model: 'fixture-model',
      attemptCount: 1,
      candidateCount: 0,
    }),
  });
}

export function completeFixture(jobId = 'redraw:talk-a') {
  const batch = providerBatch();
  const dispatch = compileAvatarFinalPassProviderRuntimeDispatch({
    batch,
    jobId,
    compiledAt: fixtureTime,
  });
  const compiled = compiledRuntimeContract(dispatch);
  const binding = validateAvatarFinalPassCompiledProviderRuntimeContract(
    dispatch,
    compiled,
  );
  const outcome = compileAvatarFinalPassProviderRuntimeOutcome(
    dispatch,
    binding,
    candidateRunOutcome(dispatch, binding),
  );
  return Object.freeze({ batch, dispatch, compiled, binding, outcome });
}
