import {
  compileEvaDenseMotionFamilyReleaseEvidenceV2,
  evaDenseMotionFamilyReleaseAssemblyV2Capabilities,
} from './eva-dense-motion-family-release-assembly-v2.mjs';
import {
  evaDenseMotionFamilyApprovalProvenanceCapabilities,
  verifyEvaDenseMotionFamilyApprovalProvenance,
} from './eva-dense-motion-family-approval-provenance-v1.mjs';

export const EVA_DENSE_MOTION_FAMILY_RELEASE_PROVENANCE_GATE_VERSION = '2026-09-09.1';

export function compileEvaDenseMotionFamilyReleaseEvidenceV2WithProvenance(args) {
  const approvalProvenance = verifyEvaDenseMotionFamilyApprovalProvenance({
    familyEvidenceRoot: args?.familyEvidenceRoot,
    familyReleaseManifest: args?.familyReleaseManifest,
    assembledAt: args?.assembledAt,
  });
  const assembled = compileEvaDenseMotionFamilyReleaseEvidenceV2(args);
  return Object.freeze({
    ...assembled,
    approvalProvenance,
  });
}

export function evaDenseMotionFamilyReleaseAssemblyV2ProvenanceCapabilities() {
  const assembly = evaDenseMotionFamilyReleaseAssemblyV2Capabilities();
  const provenance = evaDenseMotionFamilyApprovalProvenanceCapabilities();
  return Object.freeze({
    schema: 'evavo.project-art-eva-dense-motion-family-release-assembly-provenance-capabilities.v1',
    version: EVA_DENSE_MOTION_FAMILY_RELEASE_PROVENANCE_GATE_VERSION,
    delegatesToV2Assembly: true,
    preservesV2FailClosedReleaseEvaluation: true,
    fileBackedHumanFamilyApprovalEvidenceRequired:
      provenance.fileBackedHumanFamilyApprovalEvidenceRequired,
    byteExactSha256VerificationRequired: provenance.byteExactSha256VerificationRequired,
    semanticReviewBindingRequired: provenance.semanticReviewBindingRequired,
    distinctHumanApproversRequired: provenance.distinctHumanApproversRequired,
    distinctEvidenceFilesRequired: provenance.distinctEvidenceFilesRequired,
    exactTenRuntimeFrameEvidenceRequired: assembly.exactTenRuntimeFrameEvidenceRequired,
    exactTenContinuityEdgesRequired: assembly.exactTenContinuityEdgesRequired,
    providerExecution: false,
    imageMutation: false,
    publication: false,
    deployment: false,
    runtimeActivation: false,
  });
}
