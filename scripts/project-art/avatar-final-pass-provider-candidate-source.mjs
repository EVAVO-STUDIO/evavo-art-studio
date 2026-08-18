import {
  AVATAR_FINAL_PASS_PROVIDER_METADATA_SCHEMA,
  AVATAR_PROVIDER_RUNTIME_BINDING_SCHEMA,
  AVATAR_PROVIDER_RUNTIME_DISPATCH_SCHEMA,
  AVATAR_PROVIDER_RUNTIME_OUTCOME_SCHEMA,
  AVATAR_PROVIDER_RUNTIME_PROTOCOL_VERSION,
  GENERIC_PROVIDER_PROTOCOL_VERSION,
} from './avatar-final-pass-provider-candidate-constants.mjs';
import {
  allFalseAuthority,
  boundedText,
  artifactId,
  assert,
  canonicalRelativePath,
  deepFreeze,
  digest,
  exactKeys,
  identifier,
  isRecord,
  providerRequestId,
  sha256Document,
  sourceCommit,
  verifySelfHash,
} from './avatar-final-pass-provider-candidate-common.mjs';

const DISPATCH_AUTHORITY_KEYS = Object.freeze([
  'runtimeContractCompilation',
  'runtimeEnqueue',
  'providerExecution',
  'candidateMaterialization',
  'receiptPersistence',
  'deterministicQa',
  'creativeReview',
  'candidateApproval',
  'candidatePromotion',
  'targetRepositoryMutation',
  'gitMutation',
  'deployment',
  'publication',
  'runtimeActivation',
  'explicitWriteEnabledRuntimeRequired',
]);

const BINDING_AUTHORITY_KEYS = Object.freeze([
  'runtimeEnqueue',
  'providerExecution',
  'candidateMaterialization',
  'receiptPersistence',
  'candidateApproval',
  'candidatePromotion',
  'targetRepositoryMutation',
  'gitMutation',
  'deployment',
  'publication',
  'runtimeActivation',
]);

const OUTCOME_AUTHORITY_KEYS = Object.freeze([
  'candidateMaterialization',
  'receiptPersistence',
  'deterministicQa',
  'creativeReview',
  'candidateApproval',
  'candidatePromotion',
  'targetRepositoryMutation',
  'gitMutation',
  'deployment',
  'publication',
  'runtimeActivation',
]);

function dispatchAuthority(value) {
  exactKeys(
    value,
    DISPATCH_AUTHORITY_KEYS,
    'runtime dispatch authority',
    'AVATAR_PROVIDER_CANDIDATE_DISPATCH_AUTHORITY_INVALID',
  );
  for (const key of DISPATCH_AUTHORITY_KEYS) {
    const expected = key === 'explicitWriteEnabledRuntimeRequired';
    assert(
      value[key] === expected,
      'AVATAR_PROVIDER_CANDIDATE_DISPATCH_AUTHORITY_INVALID',
      `runtime dispatch authority ${key} is invalid.`,
    );
  }
}

function falseApprovals(value, label, requiredKeys) {
  allFalseAuthority(value, label);
  for (const key of requiredKeys) {
    assert(
      value[key] === false,
      'AVATAR_PROVIDER_CANDIDATE_APPROVAL_INVALID',
      `${label}.${key} must be false.`,
    );
  }
}

function parseDispatch(input) {
  const dispatch = verifySelfHash(
    input,
    'runtimeDispatchSha256',
    'runtime dispatch',
  );
  assert(
    dispatch.schema === AVATAR_PROVIDER_RUNTIME_DISPATCH_SCHEMA &&
      dispatch.protocolVersion === AVATAR_PROVIDER_RUNTIME_PROTOCOL_VERSION,
    'AVATAR_PROVIDER_CANDIDATE_DISPATCH_SCHEMA_INVALID',
  );
  identifier(dispatch.requestId, 'runtime dispatch.requestId');
  identifier(dispatch.jobId, 'runtime dispatch.jobId');
  identifier(dispatch.frameId, 'runtime dispatch.frameId');
  identifier(dispatch.sessionId, 'runtime dispatch.sessionId');
  identifier(dispatch.characterId, 'runtime dispatch.characterId');
  sourceCommit(dispatch.sourceCommit, 'runtime dispatch.sourceCommit');
  digest(dispatch.batchSha256, 'runtime dispatch.batchSha256');
  digest(dispatch.planSha256, 'runtime dispatch.planSha256');
  digest(
    dispatch.providerRequestInputSha256,
    'runtime dispatch.providerRequestInputSha256',
  );
  assert(
    dispatch.operation === 'edit' || dispatch.operation === 'generate',
    'AVATAR_PROVIDER_CANDIDATE_OPERATION_INVALID',
  );
  assert(
    dispatch.kind === 'provider-redraw' ||
      dispatch.kind === 'provider-generated-inbetween',
    'AVATAR_PROVIDER_CANDIDATE_KIND_INVALID',
  );
  assert(
    isRecord(dispatch.providerCompiler) &&
      isRecord(dispatch.providerCompiler.input) &&
      dispatch.providerCompiler.package === '@evavo/art-providers' &&
      dispatch.providerCompiler.export ===
        'compileProviderCandidateRuntimeContract' &&
      dispatch.providerCompiler.inputSha256 ===
        dispatch.providerRequestInputSha256 &&
      dispatch.providerCompiler.validationRequired === true,
    'AVATAR_PROVIDER_CANDIDATE_PROVIDER_COMPILER_INVALID',
  );
  const providerInput = dispatch.providerCompiler.input;
  const sourceSpaceRepair =
    dispatch.sessionId === 'eva-source-repair-v1' &&
    dispatch.kind === 'provider-redraw';
  assert(
    sha256Document(providerInput) ===
      dispatch.providerRequestInputSha256,
    'AVATAR_PROVIDER_CANDIDATE_PROVIDER_INPUT_HASH_MISMATCH',
  );
  assert(
    providerInput.operation === dispatch.operation &&
      providerInput.assetKind === 'sprite-frame' &&
      providerInput.continuityPhase === dispatch.continuityPhase &&
      providerInput.candidateCount === 1 &&
      providerInput.target?.outputFormat === 'png' &&
      providerInput.target?.transparency ===
        (sourceSpaceRepair ? 'opaque' : 'required') &&
      providerInput.background?.strategy ===
        (sourceSpaceRepair ? 'opaque-source' : 'native-alpha') &&
      providerInput.selection?.allowFallback === false &&
      providerInput.metadata?.schema ===
        AVATAR_FINAL_PASS_PROVIDER_METADATA_SCHEMA &&
      providerInput.metadata?.jobId === dispatch.jobId &&
      providerInput.metadata?.frameId === dispatch.frameId &&
      providerInput.metadata?.sessionId === dispatch.sessionId &&
      providerInput.metadata?.characterId === dispatch.characterId,
    'AVATAR_PROVIDER_CANDIDATE_PROVIDER_INPUT_INVALID',
  );
  falseApprovals(
    providerInput.metadata.approvals,
    'runtime dispatch provider metadata approvals',
    [
      'creative',
      'anatomy',
      'identity',
      'continuity',
      'loop',
      'runtime',
      'publication',
    ],
  );

  const admission = dispatch.candidateAdmission;
  assert(
    isRecord(admission),
    'AVATAR_PROVIDER_CANDIDATE_ADMISSION_INVALID',
  );
  canonicalRelativePath(
    admission.candidateOutputPath,
    'runtime dispatch candidate output path',
  );
  canonicalRelativePath(
    admission.reviewedTargetPath,
    'runtime dispatch reviewed target path',
  );
  assert(
    admission.candidateOutputPath !== admission.reviewedTargetPath &&
      admission.expectedMediaType === 'image/png' &&
      Number.isSafeInteger(admission.expectedWidth) &&
      Number.isSafeInteger(admission.expectedHeight) &&
      admission.expectedWidth >= 1 &&
      admission.expectedHeight >= 1 &&
      admission.expectedCandidateArtifacts === 1 &&
      admission.expectedEvidenceArtifacts === 1 &&
      admission.createOnlyMaterializationRequired === true &&
      admission.frameFinisherRequired === true &&
      admission.independentReviewRequired === true &&
      admission.finalSha256RequiredBeforeSequenceUse === true &&
      providerInput.target.width === admission.expectedWidth &&
      providerInput.target.height === admission.expectedHeight &&
      providerInput.metadata.candidateOutputPath ===
        admission.candidateOutputPath &&
      providerInput.metadata.targetPath === admission.reviewedTargetPath,
    'AVATAR_PROVIDER_CANDIDATE_ADMISSION_INVALID',
  );
  dispatchAuthority(dispatch.authority);
  return dispatch;
}

function parseBinding(input, dispatch) {
  const binding = verifySelfHash(
    input,
    'runtimeBindingSha256',
    'runtime binding',
  );
  assert(
    binding.schema === AVATAR_PROVIDER_RUNTIME_BINDING_SCHEMA &&
      binding.protocolVersion === AVATAR_PROVIDER_RUNTIME_PROTOCOL_VERSION &&
      binding.runtimeDispatchSha256 === dispatch.runtimeDispatchSha256 &&
      binding.jobId === dispatch.jobId &&
      binding.frameId === dispatch.frameId &&
      binding.operation === dispatch.operation &&
      binding.providerRequestInputSha256 ===
        dispatch.providerRequestInputSha256 &&
      binding.candidateOutputPath ===
        dispatch.candidateAdmission.candidateOutputPath,
    'AVATAR_PROVIDER_CANDIDATE_BINDING_MISMATCH',
  );
  providerRequestId(
    binding.normalizedProviderRequestId,
    'runtime binding.normalizedProviderRequestId',
  );
  digest(
    binding.normalizedProviderRequestSha256,
    'runtime binding.normalizedProviderRequestSha256',
  );
  digest(
    binding.compiledPromptSha256,
    'runtime binding.compiledPromptSha256',
  );
  assert(
    isRecord(binding.runtimeJob) &&
      binding.runtimeJob.queue === 'provider' &&
      binding.runtimeJob.kind ===
        `art.candidate.${dispatch.operation}` &&
      binding.runtimeJob.maximumAttempts === 3 &&
      binding.runtimeJob.leaseDurationMs === 300000 &&
      binding.runtimeJob.timeoutMs === 1800000 &&
      binding.runtimeJob.idempotencyKey ===
        `provider:${binding.normalizedProviderRequestId}`,
    'AVATAR_PROVIDER_CANDIDATE_RUNTIME_JOB_BINDING_INVALID',
  );
  exactKeys(
    binding.authority,
    BINDING_AUTHORITY_KEYS,
    'runtime binding authority',
    'AVATAR_PROVIDER_CANDIDATE_BINDING_AUTHORITY_INVALID',
  );
  allFalseAuthority(binding.authority, 'runtime binding authority');
  return binding;
}

function parseOutcome(input, dispatch, binding) {
  const sourceSpaceRepair =
    dispatch.sessionId === 'eva-source-repair-v1' &&
    dispatch.kind === 'provider-redraw';
  const outcome = verifySelfHash(
    input,
    'runtimeOutcomeSha256',
    'runtime outcome',
  );
  assert(
    outcome.schema === AVATAR_PROVIDER_RUNTIME_OUTCOME_SCHEMA &&
      outcome.protocolVersion === AVATAR_PROVIDER_RUNTIME_PROTOCOL_VERSION &&
      outcome.runtimeDispatchSha256 === dispatch.runtimeDispatchSha256 &&
      outcome.runtimeBindingSha256 === binding.runtimeBindingSha256 &&
      outcome.jobId === dispatch.jobId &&
      outcome.frameId === dispatch.frameId &&
      outcome.kind === dispatch.kind &&
      outcome.operation === dispatch.operation &&
      outcome.providerCallCount === 1 &&
      outcome.submissionIdempotencyKey ===
        dispatch.submissionIdempotencyKey,
    'AVATAR_PROVIDER_CANDIDATE_OUTCOME_MISMATCH',
  );
  exactKeys(
    outcome.authority,
    OUTCOME_AUTHORITY_KEYS,
    'runtime outcome authority',
    'AVATAR_PROVIDER_CANDIDATE_OUTCOME_AUTHORITY_INVALID',
  );
  allFalseAuthority(outcome.authority, 'runtime outcome authority');

  const result = outcome.result;
  assert(
    isRecord(result) &&
      result.status === 'candidate-materialization-required' &&
      result.candidateCount === 1 &&
      typeof result.adapterId === 'string' &&
      result.adapterId.length > 0 &&
      typeof result.model === 'string' &&
      result.model.length > 0 &&
      result.requiresAlphaExtraction === false,
    'AVATAR_PROVIDER_CANDIDATE_OUTCOME_NOT_MATERIALIZABLE',
    sourceSpaceRepair
      ? 'Runtime outcome must contain one source-space RGBA candidate.'
      : 'Runtime outcome must contain one native-alpha candidate.',
  );
  const candidateArtifactId = artifactId(
    result.candidateArtifactId,
    'runtime outcome candidateArtifactId',
  );
  const evidenceArtifactId = artifactId(
    result.evidenceArtifactId,
    'runtime outcome evidenceArtifactId',
  );
  assert(
    candidateArtifactId !== evidenceArtifactId,
    'AVATAR_PROVIDER_CANDIDATE_ARTIFACT_COLLISION',
  );

  const request = result.materializationRequest;
  assert(
    isRecord(request) &&
      request.sourceArtifactId === candidateArtifactId &&
      request.targetPath ===
        dispatch.candidateAdmission.candidateOutputPath &&
      request.reviewedTargetPath ===
        dispatch.candidateAdmission.reviewedTargetPath &&
      request.expectedMediaType === 'image/png' &&
      request.expectedWidth ===
        dispatch.candidateAdmission.expectedWidth &&
      request.expectedHeight ===
        dispatch.candidateAdmission.expectedHeight &&
      request.createOnly === true &&
      request.oneImageOnly === true &&
      request.sourceArtifactSha256VerificationRequired === true &&
      request.outputSha256Required === true,
    'AVATAR_PROVIDER_CANDIDATE_MATERIALIZATION_REQUEST_INVALID',
  );
  falseApprovals(
    result.approvals,
    'runtime outcome approvals',
    [
      'technical',
      'creative',
      'anatomy',
      'identity',
      'continuity',
      'loop',
      'runtime',
      'publication',
    ],
  );
  return outcome;
}

export function parseAvatarProviderCandidateSourceChain({
  dispatch: dispatchInput,
  binding: bindingInput,
  outcome: outcomeInput,
}) {
  const dispatch = parseDispatch(dispatchInput);
  const binding = parseBinding(bindingInput, dispatch);
  const outcome = parseOutcome(outcomeInput, dispatch, binding);

  const normalizedRequest = {
    ...dispatch.providerCompiler.input,
    requestId: binding.normalizedProviderRequestId,
    protocolVersion: GENERIC_PROVIDER_PROTOCOL_VERSION,
  };
  assert(
    sha256Document(normalizedRequest) ===
      binding.normalizedProviderRequestSha256,
    'AVATAR_PROVIDER_CANDIDATE_NORMALIZED_REQUEST_HASH_MISMATCH',
  );

  return deepFreeze({
    dispatch,
    binding,
    outcome,
    candidateArtifactId: outcome.result.candidateArtifactId,
    evidenceArtifactId: outcome.result.evidenceArtifactId,
    providerRequestId: binding.normalizedProviderRequestId,
    providerRequestSha256: binding.normalizedProviderRequestSha256,
    compiledPromptSha256: binding.compiledPromptSha256,
    candidateOutputPath:
      dispatch.candidateAdmission.candidateOutputPath,
    reviewedTargetPath:
      dispatch.candidateAdmission.reviewedTargetPath,
    expectedWidth: dispatch.candidateAdmission.expectedWidth,
    expectedHeight: dispatch.candidateAdmission.expectedHeight,
  });
}
