import {
  AVATAR_FINAL_PASS_PROVIDER_RUNTIME_DISPATCH_SCHEMA,
  AVATAR_FINAL_PASS_PROVIDER_RUNTIME_PROTOCOL_VERSION,
  GENERIC_PROVIDER_PROTOCOL_VERSION,
  REFERENCE_CAPABILITY_BY_ROLE,
  RUNTIME_DISPATCH_AUTHORITY_KEYS,
  SUBMISSION_IDEMPOTENCY_KEY_PATTERN,
} from './avatar-final-pass-provider-runtime-constants.mjs';
import {
  assert,
  canonicalPath,
  createAuthority,
  deepFreeze,
  digest,
  exactKeys,
  identifier,
  sameCanonical,
  sha256Document,
  sha256Text,
  timestamp,
  verifySelfHash,
} from './avatar-final-pass-provider-runtime-common.mjs';
import {
  parseAvatarFinalPassProviderBatch,
  selectReadyAvatarProviderJob,
} from './avatar-final-pass-provider-runtime-batch.mjs';

const DISPATCH_KEYS = Object.freeze([
  'schema',
  'protocolVersion',
  'compiledAt',
  'requestId',
  'jobId',
  'frameId',
  'kind',
  'operation',
  'continuityPhase',
  'batchSha256',
  'planSha256',
  'sourceCommit',
  'sessionId',
  'characterId',
  'jobEnvelopeSha256',
  'providerRequestInputSha256',
  'submissionIdempotencyKey',
  'providerCompiler',
  'expectedRuntimeContract',
  'candidateAdmission',
  'permittedRuntimeOutcomes',
  'authority',
  'runtimeDispatchSha256',
]);

function capabilityProfile(request) {
  const values = new Set([request.operation]);
  const references = request.references ?? [];
  if (references.length > 0) values.add('reference-images');
  if (references.length > 1) values.add('multiple-reference-images');
  for (const reference of references) {
    const capability = REFERENCE_CAPABILITY_BY_ROLE[reference.role];
    if (capability) values.add(capability);
  }
  if (request.target?.transparency === 'required') values.add('native-alpha');
  if (request.operation === 'edit') {
    values.add('mask-guided-edit');
    values.add('high-input-fidelity');
    values.add('non-target-invariance');
  }
  values.add('identity-reference-lock');
  values.add('true-alpha-validation');
  values.add('fake-transparency-rejection');
  values.add('custom-size');
  values.add('candidate-count');
  if (request.seed !== undefined) values.add('seed');
  return Object.freeze([...values].sort());
}

function runtimeRequiredCapabilities(operation) {
  return Object.freeze([
    `provider.${operation}`,
    'provider.reference-lock',
    'provider.candidate-store',
    'evidence.bundle',
  ]);
}

function submissionIdempotencyKey(batch, job) {
  const body = `${batch.batchSha256}\0${job.jobEnvelopeSha256}\0${job.providerRequestSha256}`;
  return `avatar-provider-submit:${sha256Text(body).slice(0, 40)}`;
}

export function compileAvatarFinalPassProviderRuntimeDispatch({
  batch: batchInput,
  jobId,
  compiledAt = new Date().toISOString(),
}) {
  const batch = parseAvatarFinalPassProviderBatch(batchInput);
  const job = selectReadyAvatarProviderJob(batch, jobId);
  timestamp(compiledAt, 'compiledAt');
  const idempotencyKey = submissionIdempotencyKey(batch, job);
  const requiredCapabilities = runtimeRequiredCapabilities(job.operation);
  const requiredCapabilityProfile = capabilityProfile(job.providerRequestInput);
  const body = {
    schema: AVATAR_FINAL_PASS_PROVIDER_RUNTIME_DISPATCH_SCHEMA,
    protocolVersion: AVATAR_FINAL_PASS_PROVIDER_RUNTIME_PROTOCOL_VERSION,
    compiledAt,
    requestId: batch.requestId,
    jobId: job.jobId,
    frameId: job.frameId,
    kind: job.kind,
    operation: job.operation,
    continuityPhase: job.continuityPhase,
    batchSha256: batch.batchSha256,
    planSha256: batch.plan.planSha256,
    sourceCommit: batch.plan.sourceCommit,
    sessionId: batch.plan.sessionId,
    characterId: batch.plan.characterId,
    jobEnvelopeSha256: job.jobEnvelopeSha256,
    providerRequestInputSha256: job.providerRequestSha256,
    submissionIdempotencyKey: idempotencyKey,
    providerCompiler: Object.freeze({
      package: '@evavo/art-providers',
      export: 'compileProviderCandidateRuntimeContract',
      input: job.providerRequestInput,
      inputSha256: job.providerRequestSha256,
      validationRequired: true,
    }),
    expectedRuntimeContract: Object.freeze({
      schemaVersion: '1.0',
      providerProtocolVersion: GENERIC_PROVIDER_PROTOCOL_VERSION,
      executionMode: 'submit-runtime-job',
      queue: 'provider',
      kind: `art.candidate.${job.operation}`,
      maximumAttempts: 3,
      leaseDurationMs: 300_000,
      timeoutMs: 1_800_000,
      candidateCount: 1,
      requiredCapabilities,
      requiredCapabilityProfile,
    }),
    candidateAdmission: Object.freeze({
      candidateOutputPath: job.candidateOutputPath,
      reviewedTargetPath: job.targetPath,
      expectedMediaType: 'image/png',
      expectedWidth: batch.plan.canvas.width,
      expectedHeight: batch.plan.canvas.height,
      expectedCandidateArtifacts: 1,
      expectedEvidenceArtifacts: 1,
      createOnlyMaterializationRequired: true,
      frameFinisherRequired: true,
      independentReviewRequired: true,
      finalSha256RequiredBeforeSequenceUse: true,
    }),
    permittedRuntimeOutcomes: Object.freeze([
      'candidate-run-result',
      'provider-failure',
    ]),
    authority: createAuthority(RUNTIME_DISPATCH_AUTHORITY_KEYS, [
      'explicitWriteEnabledRuntimeRequired',
    ]),
  };
  return deepFreeze({
    ...body,
    runtimeDispatchSha256: sha256Document(body),
  });
}

export function parseAvatarFinalPassProviderRuntimeDispatch(input) {
  exactKeys(input, DISPATCH_KEYS, 'runtime dispatch');
  const dispatch = verifySelfHash(
    input,
    'runtimeDispatchSha256',
    'runtime dispatch',
  );
  assert(
    dispatch.schema === AVATAR_FINAL_PASS_PROVIDER_RUNTIME_DISPATCH_SCHEMA &&
      dispatch.protocolVersion ===
        AVATAR_FINAL_PASS_PROVIDER_RUNTIME_PROTOCOL_VERSION,
    'AVATAR_PROVIDER_RUNTIME_DISPATCH_SCHEMA_INVALID',
  );
  timestamp(dispatch.compiledAt, 'runtime dispatch.compiledAt');
  identifier(dispatch.requestId, 'runtime dispatch.requestId');
  identifier(dispatch.jobId, 'runtime dispatch.jobId');
  identifier(dispatch.frameId, 'runtime dispatch.frameId');
  assert(
    ['edit', 'generate'].includes(dispatch.operation),
    'AVATAR_PROVIDER_RUNTIME_DISPATCH_OPERATION_INVALID',
  );
  digest(dispatch.batchSha256, 'runtime dispatch.batchSha256');
  digest(dispatch.planSha256, 'runtime dispatch.planSha256');
  digest(dispatch.jobEnvelopeSha256, 'runtime dispatch.jobEnvelopeSha256');
  digest(
    dispatch.providerRequestInputSha256,
    'runtime dispatch.providerRequestInputSha256',
  );
  assert(
    SUBMISSION_IDEMPOTENCY_KEY_PATTERN.test(
      dispatch.submissionIdempotencyKey,
    ),
    'AVATAR_PROVIDER_RUNTIME_IDEMPOTENCY_KEY_INVALID',
  );
  exactKeys(
    dispatch.providerCompiler,
    ['package', 'export', 'input', 'inputSha256', 'validationRequired'],
    'runtime dispatch.providerCompiler',
  );
  assert(
    dispatch.providerCompiler.package === '@evavo/art-providers' &&
      dispatch.providerCompiler.export ===
        'compileProviderCandidateRuntimeContract' &&
      dispatch.providerCompiler.validationRequired === true &&
      dispatch.providerCompiler.inputSha256 ===
        dispatch.providerRequestInputSha256 &&
      sha256Document(dispatch.providerCompiler.input) ===
        dispatch.providerRequestInputSha256,
    'AVATAR_PROVIDER_RUNTIME_COMPILER_BINDING_INVALID',
  );
  exactKeys(
    dispatch.expectedRuntimeContract,
    [
      'schemaVersion',
      'providerProtocolVersion',
      'executionMode',
      'queue',
      'kind',
      'maximumAttempts',
      'leaseDurationMs',
      'timeoutMs',
      'candidateCount',
      'requiredCapabilities',
      'requiredCapabilityProfile',
    ],
    'runtime dispatch.expectedRuntimeContract',
  );
  assert(
    dispatch.expectedRuntimeContract.schemaVersion === '1.0' &&
      dispatch.expectedRuntimeContract.providerProtocolVersion ===
        GENERIC_PROVIDER_PROTOCOL_VERSION &&
      dispatch.expectedRuntimeContract.executionMode ===
        'submit-runtime-job' &&
      dispatch.expectedRuntimeContract.queue === 'provider' &&
      dispatch.expectedRuntimeContract.kind ===
        `art.candidate.${dispatch.operation}` &&
      dispatch.expectedRuntimeContract.maximumAttempts === 3 &&
      dispatch.expectedRuntimeContract.leaseDurationMs === 300_000 &&
      dispatch.expectedRuntimeContract.timeoutMs === 1_800_000 &&
      dispatch.expectedRuntimeContract.candidateCount === 1,
    'AVATAR_PROVIDER_RUNTIME_EXPECTED_CONTRACT_INVALID',
  );
  exactKeys(
    dispatch.candidateAdmission,
    [
      'candidateOutputPath',
      'reviewedTargetPath',
      'expectedMediaType',
      'expectedWidth',
      'expectedHeight',
      'expectedCandidateArtifacts',
      'expectedEvidenceArtifacts',
      'createOnlyMaterializationRequired',
      'frameFinisherRequired',
      'independentReviewRequired',
      'finalSha256RequiredBeforeSequenceUse',
    ],
    'runtime dispatch.candidateAdmission',
  );
  canonicalPath(
    dispatch.candidateAdmission.candidateOutputPath,
    'runtime dispatch.candidateAdmission.candidateOutputPath',
  );
  canonicalPath(
    dispatch.candidateAdmission.reviewedTargetPath,
    'runtime dispatch.candidateAdmission.reviewedTargetPath',
  );
  assert(
    dispatch.candidateAdmission.candidateOutputPath !==
      dispatch.candidateAdmission.reviewedTargetPath &&
      dispatch.candidateAdmission.expectedMediaType === 'image/png' &&
      Number.isSafeInteger(dispatch.candidateAdmission.expectedWidth) &&
      dispatch.candidateAdmission.expectedWidth >= 1 &&
      Number.isSafeInteger(dispatch.candidateAdmission.expectedHeight) &&
      dispatch.candidateAdmission.expectedHeight >= 1 &&
      dispatch.candidateAdmission.expectedCandidateArtifacts === 1 &&
      dispatch.candidateAdmission.expectedEvidenceArtifacts === 1 &&
      dispatch.candidateAdmission.createOnlyMaterializationRequired === true &&
      dispatch.candidateAdmission.frameFinisherRequired === true &&
      dispatch.candidateAdmission.independentReviewRequired === true &&
      dispatch.candidateAdmission.finalSha256RequiredBeforeSequenceUse === true,
    'AVATAR_PROVIDER_RUNTIME_CANDIDATE_ADMISSION_INVALID',
  );
  assert(
    Array.isArray(dispatch.permittedRuntimeOutcomes) &&
      sameCanonical(dispatch.permittedRuntimeOutcomes, [
        'candidate-run-result',
        'provider-failure',
      ]),
    'AVATAR_PROVIDER_RUNTIME_OUTCOMES_INVALID',
  );
  exactKeys(
    dispatch.authority,
    RUNTIME_DISPATCH_AUTHORITY_KEYS,
    'runtime dispatch.authority',
    'AVATAR_PROVIDER_RUNTIME_AUTHORITY_INVALID',
  );
  for (const key of RUNTIME_DISPATCH_AUTHORITY_KEYS) {
    const expected = key === 'explicitWriteEnabledRuntimeRequired';
    assert(
      dispatch.authority[key] === expected,
      'AVATAR_PROVIDER_RUNTIME_AUTHORITY_INVALID',
      `runtime dispatch.authority.${key} is invalid.`,
    );
  }
  return dispatch;
}
