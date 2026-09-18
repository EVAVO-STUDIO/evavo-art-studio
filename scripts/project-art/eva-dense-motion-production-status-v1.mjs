import {
  EVA_DENSE_MOTION_FALLBACK_REMASTER_ORDINALS,
  EVA_DENSE_MOTION_FINAL_MASTER_ORDINALS,
  evaDenseMotionTenMasterCapabilities,
  inspectEvaDenseMotionTenMasterProgram,
} from './eva-dense-motion-ten-master-program.mjs';
import { deepFreeze } from './eva-dense-motion-work-order-common.mjs';

export const EVA_DENSE_MOTION_PRODUCTION_STATUS_SCHEMA_V1 =
  'evavo.project-art-eva-dense-motion-production-status.v1';
export const EVA_DENSE_MOTION_PRODUCTION_STATUS_PROTOCOL_VERSION_V1 =
  '2026-09-09.1';

export function compileEvaDenseMotionProductionStatusV1(tenMasterProgram) {
  const status = inspectEvaDenseMotionTenMasterProgram(tenMasterProgram);
  const capabilities = evaDenseMotionTenMasterCapabilities();
  const masteredCount = status.masteredCount;
  const reviewedEdges = status.continuityEdgesReviewed;
  const requiredMasters = status.requiredNewMasterCount;
  const requiredEdges = tenMasterProgram.continuity.requiredEdgeCount;

  return deepFreeze({
    schema: EVA_DENSE_MOTION_PRODUCTION_STATUS_SCHEMA_V1,
    protocolVersion: EVA_DENSE_MOTION_PRODUCTION_STATUS_PROTOCOL_VERSION_V1,
    characterId: status.characterId,
    familyId: status.familyId,
    programSha256: status.programSha256,
    summary: 'three-frame-fallback-live__ten-new-final-masters-not-produced',
    publicFallback: {
      liveUntilAtomicActivation: true,
      frameCount: status.currentFallbackCount,
      ordinals: EVA_DENSE_MOTION_FALLBACK_REMASTER_ORDINALS,
      maySatisfyFinalMasterGate: false,
      finalMasterEligibleCount: 0,
    },
    finalMasterProduction: {
      sourceContractsBound: EVA_DENSE_MOTION_FINAL_MASTER_ORDINALS.length,
      requiredNewMasterCount: requiredMasters,
      producedMasterCount: masteredCount,
      remainingMasterCount: requiredMasters - masteredCount,
      fallbackFramesAlsoRequireRemastering: status.fallbackRemasterCount,
      allTenCandidateAssurancePassed: false,
      allTenAlphaMastersPassed: false,
      allTenFrameFinisherChecksPassed: false,
      allTenTechnicalInspectionsPassed: false,
      allTenCreativeApprovalsRecorded: false,
      sourcesBoundDoesNotMeanMastersProduced: true,
    },
    continuity: {
      requiredEdgeCount: requiredEdges,
      reviewedEdgeCount: reviewedEdges,
      remainingEdgeCount: requiredEdges - reviewedEdges,
      finalToFirstLoopClosureRequired: capabilities.finalToFirstLoopClosureRequired,
      finalToFirstLoopClosureReviewed: false,
    },
    release: {
      releaseReady: status.releaseReady,
      runtimeActivationReady: status.runtimeActivationReady,
      atomicTenMasterActivationRequired: capabilities.atomicTenMasterActivationRequired,
      partialPromotionAllowed: capabilities.partialPromotionAllowed,
      sequencePackRegenerated: false,
      releaseManifestRegenerated: false,
      browserPlaybackReverified: false,
      familyHumanApprovalsComplete: false,
      runtimeActivationApproved: false,
    },
    evidenceBoundary: {
      repositoryStatusOnly: true,
      workstationSourceMediaPreflightClaimed: false,
      candidateBytesClaimed: false,
      reviewEvidenceClaimed: false,
      publicationEvidenceClaimed: false,
      runtimeAdmissionEvidenceClaimed: false,
      note:
        'This status reports only the deterministic ten-master program state. Source-media availability, produced candidate bytes, human review, publication and Runtime admission require separate evidence receipts.',
    },
    blockingCodes: status.blockingCodes,
    authority: tenMasterProgram.authority,
  });
}

export function evaDenseMotionProductionStatusV1Capabilities() {
  return deepFreeze({
    schema: 'evavo.project-art-eva-dense-motion-production-status-capabilities.v1',
    protocolVersion: EVA_DENSE_MOTION_PRODUCTION_STATUS_PROTOCOL_VERSION_V1,
    separatesLiveFallbackFromFinalMasterSet: true,
    separatesSourceContractsFromProducedMasters: true,
    exposesRemainingMasterCount: true,
    exposesRemainingContinuityEdgeCount: true,
    refusesUnobservedWorkstationEvidenceClaims: true,
    partialPromotionAllowed: false,
    providerExecution: false,
    imageMutation: false,
    humanReviewCreation: false,
    publication: false,
    deployment: false,
    runtimeActivation: false,
  });
}
