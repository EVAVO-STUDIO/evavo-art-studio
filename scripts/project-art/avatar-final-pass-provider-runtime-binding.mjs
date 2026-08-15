import {
  AVATAR_FINAL_PASS_PROVIDER_RUNTIME_BINDING_SCHEMA,
  AVATAR_FINAL_PASS_PROVIDER_RUNTIME_PROTOCOL_VERSION,
  GENERIC_PROVIDER_PROTOCOL_VERSION,
  PROVIDER_REQUEST_ID_PATTERN,
  RUNTIME_BINDING_AUTHORITY_KEYS,
} from './avatar-final-pass-provider-runtime-constants.mjs';
import {
  assert,
  boundedText,
  createAuthority,
  deepFreeze,
  digest,
  exactKeys,
  isRecord,
  parseAllFalseAuthority,
  sameCanonical,
  sha256Document,
  sha256Text,
  snapshotJsonValue,
  verifySelfHash,
} from './avatar-final-pass-provider-runtime-common.mjs';
import {
  parseAvatarFinalPassProviderRuntimeDispatch,
} from './avatar-final-pass-provider-runtime-dispatch-core.mjs';

const BINDING_KEYS = Object.freeze([
  'schema',
  'protocolVersion',
  'jobId',
  'frameId',
  'operation',
  'runtimeDispatchSha256',
  'submissionIdempotencyKey',
  'providerRequestInputSha256',
  'normalizedProviderRequestId',
  'normalizedProviderRequestSha256',
  'compiledPromptSha256',
  'runtimeJob',
  'candidateOutputPath',
  'authority',
  'runtimeBindingSha256',
]);

function normalizedRequestComparable(request) {
  const snapshot = snapshotJsonValue(request, 'compiled provider request');
  const { requestId: _requestId, protocolVersion: _protocolVersion, ...rest } =
    snapshot;
  return rest;
}

function stringSetEqual(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    [...actual].sort().every((entry, index) => entry === [...expected].sort()[index])
  );
}

export function validateAvatarFinalPassCompiledProviderRuntimeContract(
  dispatchInput,
  compiledInput,
) {
  const dispatch = parseAvatarFinalPassProviderRuntimeDispatch(dispatchInput);
  const compiled = deepFreeze(
    snapshotJsonValue(compiledInput, 'compiled provider runtime contract'),
  );
  exactKeys(
    compiled,
    [
      'schemaVersion',
      'request',
      'requestSha256',
      'requiredAdapterCapabilities',
      'compiledPrompt',
      'compiledPromptSha256',
      'runtimeJob',
      'executionMode',
    ],
    'compiled provider runtime contract',
  );
  assert(
    compiled.schemaVersion === '1.0' &&
      compiled.executionMode === 'submit-runtime-job',
    'AVATAR_PROVIDER_RUNTIME_COMPILED_CONTRACT_INVALID',
  );
  const request = compiled.request;
  assert(isRecord(request), 'AVATAR_PROVIDER_RUNTIME_COMPILED_REQUEST_INVALID');
  const sourceSpaceRepair =
    dispatch.sessionId === 'eva-source-repair-v1' &&
    dispatch.kind === 'provider-redraw';
  assert(
    request.protocolVersion === GENERIC_PROVIDER_PROTOCOL_VERSION &&
      PROVIDER_REQUEST_ID_PATTERN.test(request.requestId) &&
      request.operation === dispatch.operation &&
      request.assetKind === 'sprite-frame' &&
      request.continuityPhase === dispatch.continuityPhase &&
      request.candidateCount === 1 &&
      request.target?.transparency === (sourceSpaceRepair ? 'opaque' : 'required') &&
      request.target?.outputFormat === 'png' &&
      request.background?.strategy ===
        (sourceSpaceRepair ? 'opaque-source' : 'native-alpha') &&
      request.selection?.allowFallback === false,
    'AVATAR_PROVIDER_RUNTIME_COMPILED_REQUEST_INVALID',
  );
  assert(
    sameCanonical(
      normalizedRequestComparable(request),
      dispatch.providerCompiler.input,
    ),
    'AVATAR_PROVIDER_RUNTIME_NORMALIZED_REQUEST_MISMATCH',
  );
  const requestSha256 = digest(
    compiled.requestSha256,
    'compiled provider runtime contract.requestSha256',
  );
  assert(
    sha256Document(request) === requestSha256,
    'AVATAR_PROVIDER_RUNTIME_NORMALIZED_REQUEST_HASH_MISMATCH',
  );
  const compiledPrompt = boundedText(
    compiled.compiledPrompt,
    'compiled provider runtime contract.compiledPrompt',
  );
  const compiledPromptSha256 = digest(
    compiled.compiledPromptSha256,
    'compiled provider runtime contract.compiledPromptSha256',
  );
  assert(
    sha256Text(compiledPrompt) === compiledPromptSha256 &&
      compiledPrompt.includes(dispatch.providerCompiler.input.creativeIntent),
   'AVATAR_PROVIDER_RUNTIME_COMPILED_PROMPT_INVALID',
  );
  assert(
    stringSetEqual(
      compiled.requiredAdapterCapabilities,
      dispatch.expectedRuntimeContract.requiredCapabilityProfile,
    ),
    'AVATAR_PROVIDER_RUNTIME_ADAPTER_CAPABILITIES_MISMATCH',
  );
  exactKeys(
    compiled.runtimeJob,
    [
      'queue',
      'kind',
      'idempotencyKey',
      'payload',
      'requiredCapabilities',
      'requiredCapabilityProfile',
      'maximumAttempts',
      'leaseDurationMs',
      'timeoutMs',
      'labels',
    ],
    'compiled provider runtime contract.runtimeJob',
  );
  const runtimeJob = compiled.runtimeJob;
  assert(
    runtimeJob.queue === dispatch.expectedRuntimeContract.queue &&
      runtimeJob.kind === dispatch.expectedRuntimeContract.kind &&
      runtimeJob.idempotencyKey === `provider:${request.requestId}` &&
      runtimeJob.maximumAttempts === 3 &&
      runtimeJob.leaseDurationMs === 300_000 &&
      runtimeJob.timeoutMs === 1_800_000 &&
      sameCanonical(runtimeJob.payload, request) &&
      stringSetEqual(
        runtimeJob.requiredCapabilities,
        dispatch.expectedRuntimeContract.requiredCapabilities,
      ) &&
      stringSetEqual(
        runtimeJob.requiredCapabilityProfile,
        dispatch.expectedRuntimeContract.requiredCapabilityProfile,
      ),
    'AVATAR_PROVIDER_RUNTIME_JOB_CONTRACT_MISMATCH',
  );
  exactKeys(
    runtimeJob.labels,
    ['providerRequestId', 'candidateFamilyId', 'assetId', 'continuityPhase'],
    'compiled provider runtime contract.runtimeJob.labels',
  );
  assert(
    runtimeJob.labels.providerRequestId === request.requestId &&
      runtimeJob.labels.candidateFamilyId === request.candidateFamilyId &&
      runtimeJob.labels.assetId === request.assetId &&
      runtimeJob.labels.continuityPhase === request.continuityPhase,
    'AVATAR_PROVIDER_RUNTIME_JOB_LABELS_MISMATCH',
  );

  const body = {
    schema: AVATAR_FINAL_PASS_PROVIDER_RUNTIME_BINDING_SCHEMA,
    protocolVersion: AVATAR_FINAL_PASS_PROVIDER_RUNTIME_PROTOCOL_VERSION,
    jobId: dispatch.jobId,
    frameId: dispatch.frameId,
    operation: dispatch.operation,
    runtimeDispatchSha256: dispatch.runtimeDispatchSha256,
    submissionIdempotencyKey: dispatch.submissionIdempotencyKey,
    providerRequestInputSha256: dispatch.providerRequestInputSha256,
    normalizedProviderRequestId: request.requestId,
    normalizedProviderRequestSha256: requestSha256,
    compiledPromptSha256,
    runtimeJob: Object.freeze({
      queue: runtimeJob.queue,
      kind: runtimeJob.kind,
      idempotencyKey: runtimeJob.idempotencyKey,
      maximumAttempts: runtimeJob.maximumAttempts,
      leaseDurationMs: runtimeJob.leaseDurationMs,
      timeoutMs: runtimeJob.timeoutMs,
      requiredCapabilities: Object.freeze([...runtimeJob.requiredCapabilities]),
      requiredCapabilityProfile: Object.freeze([
        ...runtimeJob.requiredCapabilityProfile,
      ]),
      labels: runtimeJob.labels,
    }),
    candidateOutputPath:
      dispatch.candidateAdmission.candidateOutputPath,
    authority: createAuthority(RUNTIME_BINDING_AUTHORITY_KEYS),
  };
  return deepFreeze({
    ...body,
    runtimeBindingSha256: sha256Document(body),
  });
}

export function parseAvatarFinalPassProviderRuntimeBinding(input, dispatch) {
  exactKeys(input, BINDING_KEYS, 'runtime binding');
  const binding = verifySelfHash(input, 'runtimeBindingSha256', 'runtime binding');
  assert(
    binding.schema === AVATAR_FINAL_PASS_PROVIDER_RUNTIME_BINDING_SCHEMA &&
      binding.protocolVersion ===
        AVATAR_FINAL_PASS_PROVIDER_RUNTIME_PROTOCOL_VERSION &&
      binding.runtimeDispatchSha256 === dispatch.runtimeDispatchSha256 &&
      binding.jobId === dispatch.jobId &&
      binding.frameId === dispatch.frameId &&
      binding.operation === dispatch.operation &&
      binding.submissionIdempotencyKey ===
        dispatch.submissionIdempotencyKey &&
      binding.providerRequestInputSha256 ===
        dispatch.providerRequestInputSha256 &&
      binding.candidateOutputPath ===
        dispatch.candidateAdmission.candidateOutputPath,
    'AVATAR_PROVIDER_RUNTIME_BINDING_MISMATCH',
  );
  assert(
    PROVIDER_REQUEST_ID_PATTERN.test(binding.normalizedProviderRequestId),
    'AVATAR_PROVIDER_RUNTIME_BINDING_REQUEST_ID_INVALID',
  );
  digest(
    binding.normalizedProviderRequestSha256,
    'runtime binding.normalizedProviderRequestSha256',
  );
  digest(binding.compiledPromptSha256, 'runtime binding.compiledPromptSha256');
  parseAllFalseAuthority(
    binding.authority,
    RUNTIME_BINDING_AUTHORITY_KEYS,
    'runtime binding.authority',
  );
  return binding;
}
