import {
  AVATAR_FINAL_PASS_PROVIDER_RUNTIME_BINDING_SCHEMA,
  AVATAR_FINAL_PASS_PROVIDER_RUNTIME_CAPABILITIES_SCHEMA,
  AVATAR_FINAL_PASS_PROVIDER_RUNTIME_DISPATCH_SCHEMA,
  AVATAR_FINAL_PASS_PROVIDER_RUNTIME_OUTCOME_SCHEMA,
  AVATAR_FINAL_PASS_PROVIDER_RUNTIME_PROTOCOL_VERSION,
} from './avatar-final-pass-provider-runtime-constants.mjs';
import {
  deepFreeze,
  stableJsonFile,
  writeJsonCreateOnly,
} from './avatar-final-pass-provider-runtime-common.mjs';
import {
  compileAvatarFinalPassProviderRuntimeDispatch,
  compileAvatarFinalPassProviderRuntimeOutcome,
  validateAvatarFinalPassCompiledProviderRuntimeContract,
  verifyAvatarFinalPassProviderRuntimeContract,
} from './avatar-final-pass-provider-runtime-dispatch.mjs';

export {
  AVATAR_FINAL_PASS_PROVIDER_BATCH_SCHEMA,
  AVATAR_FINAL_PASS_PROVIDER_RUNTIME_BINDING_SCHEMA,
  AVATAR_FINAL_PASS_PROVIDER_RUNTIME_CAPABILITIES_SCHEMA,
  AVATAR_FINAL_PASS_PROVIDER_RUNTIME_DISPATCH_SCHEMA,
  AVATAR_FINAL_PASS_PROVIDER_RUNTIME_OUTCOME_SCHEMA,
  AVATAR_FINAL_PASS_PROVIDER_RUNTIME_PROTOCOL_VERSION,
} from './avatar-final-pass-provider-runtime-constants.mjs';
export {
  ProjectArtAvatarFinalPassProviderRuntimeError,
  canonicalJson as canonicalAvatarFinalPassProviderRuntimeJson,
  sha256Document as sha256AvatarFinalPassProviderRuntimeDocument,
  snapshotJsonValue as snapshotAvatarFinalPassProviderRuntimeJson,
} from './avatar-final-pass-provider-runtime-common.mjs';
export {
  compileAvatarFinalPassProviderRuntimeDispatch,
  compileAvatarFinalPassProviderRuntimeOutcome,
  parseAvatarFinalPassProviderRuntimeBinding,
  parseAvatarFinalPassProviderRuntimeDispatch,
  validateAvatarFinalPassCompiledProviderRuntimeContract,
  verifyAvatarFinalPassProviderRuntimeContract,
} from './avatar-final-pass-provider-runtime-dispatch.mjs';
export {
  parseAvatarFinalPassProviderBatch,
  selectReadyAvatarProviderJob,
} from './avatar-final-pass-provider-runtime-batch.mjs';

export function avatarFinalPassProviderRuntimeCapabilities() {
  return deepFreeze({
    schema: AVATAR_FINAL_PASS_PROVIDER_RUNTIME_CAPABILITIES_SCHEMA,
    protocolVersion: AVATAR_FINAL_PASS_PROVIDER_RUNTIME_PROTOCOL_VERSION,
    dispatchSchema: AVATAR_FINAL_PASS_PROVIDER_RUNTIME_DISPATCH_SCHEMA,
    bindingSchema: AVATAR_FINAL_PASS_PROVIDER_RUNTIME_BINDING_SCHEMA,
    outcomeSchema: AVATAR_FINAL_PASS_PROVIDER_RUNTIME_OUTCOME_SCHEMA,
    tools: [
      'evavo_art_avatar_final_pass_provider_runtime_capabilities',
      'evavo_art_compile_avatar_final_pass_provider_runtime_dispatch',
      'evavo_art_bind_avatar_final_pass_provider_runtime_contract',
      'evavo_art_compile_avatar_final_pass_provider_runtime_outcome',
    ],
    inputs: {
      sealedProviderBatch: true,
      exactReadyJobSelection: true,
      genericProviderRuntimeContract: true,
      providerCandidateRunResultOrFailure: true,
    },
    outputs: {
      oneJobRuntimeDispatch: true,
      genericRuntimeBinding: true,
      candidateMaterializationPlan: true,
      providerFailureRecordTemplate: true,
      exactSelfHashes: true,
    },
    providerCompiler: {
      package: '@evavo/art-providers',
      export: 'compileProviderCandidateRuntimeContract',
    },
    sourceImageBytesFlowThroughMcp: false,
    shellExecution: false,
    runtimeContractCompilation: false,
    runtimeEnqueue: false,
    providerExecution: false,
    candidateMaterialization: false,
    receiptPersistence: false,
    candidateApproval: false,
    candidatePromotion: false,
    repositoryMutation: false,
    gitPush: false,
    deployment: false,
    publication: false,
    runtimeActivation: false,
    forcePush: false,
  });
}

export function compileAvatarFinalPassProviderRuntimeDispatchFile({
  batchPath,
  jobId,
  outputPath,
  compiledAt,
}) {
  const batch = stableJsonFile(batchPath, 'provider batch file');
  const dispatch = compileAvatarFinalPassProviderRuntimeDispatch({
    batch: batch.value,
    jobId,
    ...(compiledAt ? { compiledAt } : {}),
  });
  const absolute = writeJsonCreateOnly(outputPath, dispatch);
  return Object.freeze({ dispatch, outputPath: absolute });
}

export function bindAvatarFinalPassProviderRuntimeContractFile({
  dispatchPath,
  compiledRuntimeContractPath,
  outputPath,
}) {
  const dispatch = stableJsonFile(dispatchPath, 'runtime dispatch file');
  const compiled = stableJsonFile(
    compiledRuntimeContractPath,
    'compiled provider runtime contract file',
  );
  const binding = validateAvatarFinalPassCompiledProviderRuntimeContract(
    dispatch.value,
    compiled.value,
  );
  const absolute = writeJsonCreateOnly(outputPath, binding);
  return Object.freeze({ binding, outputPath: absolute });
}

export function compileAvatarFinalPassProviderRuntimeOutcomeFile({
  dispatchPath,
  bindingPath,
  runtimeOutcomePath,
  outputPath,
}) {
  const dispatch = stableJsonFile(dispatchPath, 'runtime dispatch file');
  const binding = stableJsonFile(bindingPath, 'runtime binding file');
  const outcome = stableJsonFile(runtimeOutcomePath, 'provider runtime outcome file');
  const result = compileAvatarFinalPassProviderRuntimeOutcome(
    dispatch.value,
    binding.value,
    outcome.value,
  );
  const absolute = writeJsonCreateOnly(outputPath, result);
  return Object.freeze({ outcome: result, outputPath: absolute });
}

export function verifyAvatarFinalPassProviderRuntime() {
  return verifyAvatarFinalPassProviderRuntimeContract();
}
