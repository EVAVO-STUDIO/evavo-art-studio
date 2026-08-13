import {
  AVATAR_PROVIDER_CANDIDATE_CAPABILITIES_SCHEMA,
  AVATAR_PROVIDER_CANDIDATE_FINISHER_REQUEST_SCHEMA,
  AVATAR_PROVIDER_CANDIDATE_MATERIALIZATION_SCHEMA,
  AVATAR_PROVIDER_CANDIDATE_PROTOCOL_VERSION,
} from './avatar-final-pass-provider-candidate-constants.mjs';
import {
  deepFreeze,
  stableJsonFile,
} from './avatar-final-pass-provider-candidate-common.mjs';
import {
  materializeAvatarFinalPassProviderCandidate,
} from './avatar-final-pass-provider-candidate-materialize.mjs';

export {
  AUTHORIZATION_ACTION,
  AVATAR_PROVIDER_CANDIDATE_CAPABILITIES_SCHEMA,
  AVATAR_PROVIDER_CANDIDATE_FINISHER_REQUEST_SCHEMA,
  AVATAR_PROVIDER_CANDIDATE_MATERIALIZATION_SCHEMA,
  AVATAR_PROVIDER_CANDIDATE_PROTOCOL_VERSION,
} from './avatar-final-pass-provider-candidate-constants.mjs';
export {
  ProjectArtAvatarProviderCandidateError,
  canonicalJson as canonicalAvatarProviderCandidateJson,
  sha256Document as sha256AvatarProviderCandidateDocument,
  snapshotJsonValue as snapshotAvatarProviderCandidateJson,
} from './avatar-final-pass-provider-candidate-common.mjs';
export {
  inspectAvatarProviderCandidatePng,
  pngCrc32,
} from './avatar-final-pass-provider-candidate-png.mjs';
export {
  parseAvatarProviderCandidateSourceChain,
} from './avatar-final-pass-provider-candidate-source.mjs';
export {
  materializeAvatarFinalPassProviderCandidate,
} from './avatar-final-pass-provider-candidate-materialize.mjs';

export function avatarFinalPassProviderCandidateCapabilities() {
  return deepFreeze({
    schema: AVATAR_PROVIDER_CANDIDATE_CAPABILITIES_SCHEMA,
    protocolVersion: AVATAR_PROVIDER_CANDIDATE_PROTOCOL_VERSION,
    materializationSchema:
      AVATAR_PROVIDER_CANDIDATE_MATERIALIZATION_SCHEMA,
    finisherRequestSchema:
      AVATAR_PROVIDER_CANDIDATE_FINISHER_REQUEST_SCHEMA,
    tools: Object.freeze([
      'evavo_art_avatar_final_pass_provider_candidate_capabilities',
      'evavo_art_materialize_avatar_final_pass_provider_candidate',
    ]),
    inputs: Object.freeze({
      exactRuntimeDispatch: true,
      exactRuntimeBinding: true,
      successfulRuntimeOutcome: true,
      immutableCandidateArtifact: true,
      immutableProviderEvidenceArtifact: true,
      explicitMaterializationAuthorization: true,
      separatelyAllowlistedArtifactAndWorkspaceRoots: true,
    }),
    verification: Object.freeze({
      artifactDescriptorAndContent: true,
      providerRequestAndPromptHashes: true,
      providerEvidenceAndSingleAttempt: true,
      oneCandidateOnly: true,
      strictPngCrcAndChunkStructure: true,
      nonInterlacedEightBitRgba: true,
      exactCanvas: true,
      visibleAndTransparentPixelsRequired: true,
      createOnlyThreeFileTransaction: true,
      restartSafeExactReadback: true,
    }),
    outputs: Object.freeze({
      unapprovedCandidatePng: true,
      selfHashedMaterializationReceipt: true,
      selfHashedFrameFinisherRequest: true,
      finalReviewedSha256: false,
    }),
    imageBytesFlowThroughMcp: false,
    arbitraryShell: false,
    runtimeEnqueue: false,
    providerExecution: false,
    alphaExtraction: false,
    candidateMaterialization: false,
    deterministicQa: false,
    creativeReview: false,
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

async function localArtifactStore(artifactRoot) {
  let module;
  try {
    module = await import('../../packages/artifacts/dist/index.js');
  } catch (error) {
    throw new Error(
      `@evavo/art-artifacts must be built before candidate materialization: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (typeof module.LocalArtifactStore !== 'function') {
    throw new Error(
      '@evavo/art-artifacts build does not expose LocalArtifactStore.',
    );
  }
  return new module.LocalArtifactStore({ root: artifactRoot });
}

export async function materializeAvatarFinalPassProviderCandidateFiles({
  dispatchPath,
  bindingPath,
  outcomePath,
  artifactRoot,
  workspaceRoot,
  authorization,
  materializedAt,
  artifactStoreFactory = localArtifactStore,
}) {
  const dispatch = stableJsonFile(dispatchPath, 'runtime dispatch file');
  const binding = stableJsonFile(bindingPath, 'runtime binding file');
  const outcome = stableJsonFile(outcomePath, 'runtime outcome file');
  const store = await artifactStoreFactory(artifactRoot);
  return materializeAvatarFinalPassProviderCandidate({
    dispatch: dispatch.value,
    binding: binding.value,
    outcome: outcome.value,
    artifactStore: store,
    workspaceRoot,
    authorization,
    ...(materializedAt ? { materializedAt } : {}),
  });
}
