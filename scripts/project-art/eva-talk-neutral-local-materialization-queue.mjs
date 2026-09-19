export * from './eva-talk-neutral-local-queue-common.mjs';
export * from './eva-talk-neutral-local-queue-png.mjs';
export * from './eva-talk-neutral-local-queue-campaign.mjs';
export * from './eva-talk-neutral-local-queue-init.mjs';
export * from './eva-talk-neutral-local-queue-claims.mjs';
export * from './eva-talk-neutral-local-queue-completion.mjs';

import {
  EVA_TALK_NEUTRAL_LOCAL_BATCH_COUNT,
  EVA_TALK_NEUTRAL_LOCAL_CANDIDATE_COUNT,
  EVA_TALK_NEUTRAL_LOCAL_IMAGES_PER_BATCH,
  EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION,
  EVA_TALK_NEUTRAL_TARGET_FRAME_COUNT,
  MAXIMUM_LEASE_SECONDS,
  MINIMUM_LEASE_SECONDS,
  closedAuthority,
  deepFreeze,
} from './eva-talk-neutral-local-queue-common.mjs';

export function evaTalkNeutralLocalQueueCapabilities() {
  return deepFreeze({
    schema:
      'evavo.project-art-eva-talk-neutral-local-materialization-queue-capabilities.v1',
    protocolVersion: EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION,
    exactBatchCount: EVA_TALK_NEUTRAL_LOCAL_BATCH_COUNT,
    exactImagesPerBatch: EVA_TALK_NEUTRAL_LOCAL_IMAGES_PER_BATCH,
    exactCandidateCount: EVA_TALK_NEUTRAL_LOCAL_CANDIDATE_COUNT,
    semanticSelectionTargetFrameCount: EVA_TALK_NEUTRAL_TARGET_FRAME_COUNT,
    localFilesystemOnly: true,
    atomicSameFilesystemClaim: true,
    packetOnlyOrphanRecovery: true,
    workerBoundClaims: true,
    minimumLeaseSeconds: MINIMUM_LEASE_SECONDS,
    maximumLeaseSeconds: MAXIMUM_LEASE_SECONDS,
    heartbeatLeaseExtension: true,
    expiredClaimsWithWorkerEvidenceRequeued: false,
    completionRequiresTenExactRgbaPngs: true,
    outputManifestCanBePreparedFromVerifiedClaimOutputs: true,
    failureReceiptsSupported: true,
    deterministicPacketHashes: true,
    deterministicClaimHashes: true,
    exactPngSignatureAndCrcRequired: true,
    idatInflateAndScanlineValidationRequired: true,
    uniqueOutputBodiesRequired: true,
    candidateApprovalGranted: false,
    semanticOrderingAuthorityGranted: false,
    networkAccess: false,
    providerExecution: false,
    paidExecution: false,
    candidateApproval: false,
    candidatePromotion: false,
    publication: false,
    runtimeActivation: false,
    websiteActivation: false,
    deployment: false,
    gitMutation: false,
    authority: closedAuthority(),
  });
}
