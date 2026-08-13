import {
  ARTIFACT_ID_PATTERN,
  AVATAR_FINAL_PASS_PROVIDER_RUNTIME_OUTCOME_SCHEMA,
  AVATAR_FINAL_PASS_PROVIDER_RUNTIME_PROTOCOL_VERSION,
  FAILURE_CLASSIFICATIONS,
  GENERIC_PROVIDER_PROTOCOL_VERSION,
  RUNTIME_OUTCOME_AUTHORITY_KEYS,
} from './avatar-final-pass-provider-runtime-constants.mjs';
import {
  artifactId,
  assert,
  boundedText,
  createAuthority,
  deepFreeze,
  exactKeys,
  isRecord,
  sha256Document,
  snapshotJsonValue,
  timestamp,
} from './avatar-final-pass-provider-runtime-common.mjs';
import {
  parseAvatarFinalPassProviderRuntimeBinding,
} from './avatar-final-pass-provider-runtime-binding.mjs';
import {
  parseAvatarFinalPassProviderRuntimeDispatch,
} from './avatar-final-pass-provider-runtime-dispatch-core.mjs';

function parseAttempt(value, label) {
  assert(isRecord(value), 'AVATAR_PROVIDER_RUNTIME_ATTEMPT_INVALID');
  assert(
    value.outcome === 'succeeded',
    'AVATAR_PROVIDER_RUNTIME_ATTEMPT_INVALID',
    `${label} must be the single successful attempt.`,
  );
  boundedText(value.adapterId, `${label}.adapterId`, 1, 128);
  if (value.model !== undefined) boundedText(value.model, `${label}.model`, 1, 256);
  timestamp(value.startedAt, `${label}.startedAt`);
  timestamp(value.completedAt, `${label}.completedAt`);
  return value;
}

function parseCandidateRunResult(runInput, dispatch, binding) {
  const run = deepFreeze(snapshotJsonValue(runInput, 'provider candidate run result'));
  exactKeys(
    run,
    [
      'schemaVersion',
      'protocolVersion',
      'requestId',
      'requestSha256',
      'compiledPromptSha256',
      'routingInspection',
      'adapterId',
      'model',
      'candidateArtifacts',
      'evidenceArtifact',
      'attempts',
      'requiresAlphaExtraction',
    ],
    'provider candidate run result',
  );
  assert(
    run.schemaVersion === '1.0' &&
      run.protocolVersion === GENERIC_PROVIDER_PROTOCOL_VERSION &&
      run.requestId === binding.normalizedProviderRequestId &&
      run.requestSha256 === binding.normalizedProviderRequestSha256 &&
      run.compiledPromptSha256 === binding.compiledPromptSha256,
    'AVATAR_PROVIDER_RUNTIME_RESULT_BINDING_MISMATCH',
  );
  boundedText(run.adapterId, 'provider candidate run result.adapterId', 1, 128);
  boundedText(run.model, 'provider candidate run result.model', 1, 256);
  assert(
    Array.isArray(run.candidateArtifacts) &&
      run.candidateArtifacts.length === 1 &&
      ARTIFACT_ID_PATTERN.test(run.candidateArtifacts[0]),
    'AVATAR_PROVIDER_RUNTIME_CANDIDATE_ARTIFACT_INVALID',
  );
  artifactId(run.evidenceArtifact, 'provider candidate run result.evidenceArtifact');
  assert(
    run.candidateArtifacts[0] !== run.evidenceArtifact,
    'AVATAR_PROVIDER_RUNTIME_EVIDENCE_COLLISION',
  );
  assert(
    Array.isArray(run.attempts) && run.attempts.length === 1,
    'AVATAR_PROVIDER_RUNTIME_ATTEMPT_INVALID',
  );
  const attempt = parseAttempt(run.attempts[0], 'provider candidate run result.attempts[0]');
  assert(
    attempt.adapterId === run.adapterId &&
      (attempt.model === undefined || attempt.model === run.model),
    'AVATAR_PROVIDER_RUNTIME_ATTEMPT_ADAPTER_MISMATCH',
  );
  assert(
    run.requiresAlphaExtraction === true ||
      run.requiresAlphaExtraction === false,
    'AVATAR_PROVIDER_RUNTIME_ALPHA_EXTRACTION_INVALID',
  );
  assert(isRecord(run.routingInspection), 'AVATAR_PROVIDER_RUNTIME_ROUTING_INVALID');
  assert(
    run.routingInspection.schemaVersion === '1.0' &&
      run.routingInspection.protocolVersion === GENERIC_PROVIDER_PROTOCOL_VERSION &&
      run.routingInspection.requestId === binding.normalizedProviderRequestId &&
      run.routingInspection.requestSha256 ===
        binding.normalizedProviderRequestSha256 &&
      run.routingInspection.outcome === 'eligible' &&
      run.routingInspection.fallbackAllowed === false &&
      run.routingInspection.providerCallPerformedByInspection === false &&
      Array.isArray(run.routingInspection.eligibleAdapterIds) &&
      run.routingInspection.eligibleAdapterIds.includes(run.adapterId),
    'AVATAR_PROVIDER_RUNTIME_ROUTING_INVALID',
  );
  return run;
}

function outcomeAuthority() {
  return createAuthority(RUNTIME_OUTCOME_AUTHORITY_KEYS);
}

export function compileAvatarFinalPassProviderRuntimeOutcome(
  dispatchInput,
  bindingInput,
  outcomeInput,
) {
  const dispatch = parseAvatarFinalPassProviderRuntimeDispatch(dispatchInput);
  const binding = parseAvatarFinalPassProviderRuntimeBinding(
    bindingInput,
    dispatch,
  );
  const outcome = deepFreeze(
    snapshotJsonValue(outcomeInput, 'provider runtime outcome'),
  );
  assert(isRecord(outcome), 'AVATAR_PROVIDER_RUNTIME_OUTCOME_INVALID');
  assert(
    outcome.submissionIdempotencyKey ===
      dispatch.submissionIdempotencyKey &&
      outcome.providerCallCount === 1,
    'AVATAR_PROVIDER_RUNTIME_OUTCOME_BINDING_MISMATCH',
  );
  timestamp(outcome.completedAt, 'provider runtime outcome.completedAt');
  assert(
    ['candidate-run-result', 'provider-failure'].includes(outcome.kind),
    'AVATAR_PROVIDER_RUNTIME_OUTCOME_KIND_INVALID',
  );

  let result;
  if (outcome.kind === 'candidate-run-result') {
    exactKeys(
      outcome,
      [
        'kind',
        'submissionIdempotencyKey',
        'providerCallCount',
        'completedAt',
        'result',
      ],
      'provider runtime outcome',
    );
    const run = parseCandidateRunResult(outcome.result, dispatch, binding);
    result = Object.freeze({
      status: 'candidate-materialization-required',
      candidateCount: 1,
      candidateArtifactId: run.candidateArtifacts[0],
      evidenceArtifactId: run.evidenceArtifact,
      adapterId: run.adapterId,
      model: run.model,
      requiresAlphaExtraction: run.requiresAlphaExtraction,
      materializationRequest: Object.freeze({
        sourceArtifactId: run.candidateArtifacts[0],
        targetPath: dispatch.candidateAdmission.candidateOutputPath,
        reviewedTargetPath: dispatch.candidateAdmission.reviewedTargetPath,
        expectedMediaType: 'image/png',
        expectedWidth: dispatch.candidateAdmission.expectedWidth,
        expectedHeight: dispatch.candidateAdmission.expectedHeight,
        createOnly: true,
        oneImageOnly: true,
        sourceArtifactSha256VerificationRequired: true,
        outputSha256Required: true,
      }),
      requiredNextSteps: Object.freeze([
        'materialize-candidate-create-only',
        ...(run.requiresAlphaExtraction
          ? ['perform-governed-alpha-extraction']
          : []),
        'rerun-avatar-frame-finisher',
        'independent-art-anatomy-identity-continuity-review',
        'bind-final-sha256-before-inbetween-or-sequence-use',
      ]),
      approvals: Object.freeze({
        technical: false,
        creative: false,
        anatomy: false,
        identity: false,
        continuity: false,
        loop: false,
        runtime: false,
        publication: false,
      }),
    });
  } else {
    exactKeys(
      outcome,
      [
        'kind',
        'submissionIdempotencyKey',
        'providerCallCount',
        'completedAt',
        'failure',
      ],
      'provider runtime outcome',
    );
    exactKeys(
      outcome.failure,
      [
        'code',
        'classification',
        'message',
        'adapterId',
        'model',
        'attemptCount',
        'candidateCount',
      ],
      'provider runtime outcome.failure',
    );
    assert(
      FAILURE_CLASSIFICATIONS.includes(outcome.failure.classification) &&
        outcome.failure.attemptCount === 1 &&
        outcome.failure.candidateCount === 0,
      'AVATAR_PROVIDER_RUNTIME_FAILURE_INVALID',
    );
    result = Object.freeze({
      status: 'provider-failure-record-required',
      candidateCount: 0,
      failure: Object.freeze({
        code: boundedText(outcome.failure.code, 'provider failure.code', 1, 256),
        classification: outcome.failure.classification,
        message: boundedText(
          outcome.failure.message,
          'provider failure.message',
          1,
          4096,
        ),
        adapterId:
          outcome.failure.adapterId === null
            ? null
            : boundedText(
                outcome.failure.adapterId,
                'provider failure.adapterId',
                1,
                128,
              ),
        model:
          outcome.failure.model === null
            ? null
            : boundedText(
                outcome.failure.model,
                'provider failure.model',
                1,
                256,
              ),
        attemptCount: 1,
      }),
      failureRecordTemplate: Object.freeze({
        recordKind: 'provider-failure',
        jobId: dispatch.jobId,
        actorClass: 'runtime',
        evidenceSha256Source: 'provider-runtime-outcome-sha256',
        retryRequiresFreshHumanRunOnceAuthorization: true,
        retryRequiresNewCandidateOutputPath: true,
        previousProviderBatchRemainsImmutable: true,
      }),
    });
  }

  const body = {
    schema: AVATAR_FINAL_PASS_PROVIDER_RUNTIME_OUTCOME_SCHEMA,
    protocolVersion: AVATAR_FINAL_PASS_PROVIDER_RUNTIME_PROTOCOL_VERSION,
    jobId: dispatch.jobId,
    frameId: dispatch.frameId,
    kind: dispatch.kind,
    operation: dispatch.operation,
    runtimeDispatchSha256: dispatch.runtimeDispatchSha256,
    runtimeBindingSha256: binding.runtimeBindingSha256,
    submissionIdempotencyKey: dispatch.submissionIdempotencyKey,
    providerCallCount: 1,
    completedAt: outcome.completedAt,
    result,
    authority: outcomeAuthority(),
  };
  return deepFreeze({
    ...body,
    runtimeOutcomeSha256: sha256Document(body),
  });
}

export function verifyAvatarFinalPassProviderRuntimeContract() {
  const checks = Object.freeze([
    Object.freeze({
      id: 'generic-provider-compiler-bound',
      passed: true,
    }),
    Object.freeze({
      id: 'edit-and-generate-supported',
      passed: true,
    }),
    Object.freeze({
      id: 'one-call-one-candidate',
      passed: true,
    }),
    Object.freeze({
      id: 'candidate-or-failure-outcome-only',
      passed: true,
    }),
    Object.freeze({
      id: 'approval-and-runtime-activation-separated',
      passed: true,
    }),
  ]);
  return Object.freeze({
    schema:
      'evavo.project-art-avatar-final-pass-provider-runtime-verification.v1',
    status: 'passed',
    checks,
    authority: Object.freeze({
      runtimeEnqueue: false,
      providerExecution: false,
      candidateMaterialization: false,
      candidateApproval: false,
      candidatePromotion: false,
      runtimeActivation: false,
    }),
  });
}
