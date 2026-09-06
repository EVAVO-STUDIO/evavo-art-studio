import type { WorkHeaderPageRenderReviewResult } from "./work-header-page-render-review.js";
import type { WorkHeaderSelectionResolverResult } from "./work-header-selection-resolver.js";

export const WORK_HEADER_APPROVAL_PACKET_CONTRACT = "evavo.work-header-approval-packet.v1" as const;

export interface WorkHeaderApprovalPacketSpec {
  readonly selection: WorkHeaderSelectionResolverResult;
  readonly pageRender: WorkHeaderPageRenderReviewResult["evidence"];
}

export interface WorkHeaderApprovalPacketResult {
  readonly contract: typeof WORK_HEADER_APPROVAL_PACKET_CONTRACT;
  readonly status: "ready-for-explicit-approval" | "blocked";
  readonly candidateId: string | null;
  readonly candidateSha256: string | null;
  readonly blockers: readonly string[];
  readonly verified: Readonly<{
    candidateRecommended: boolean;
    semanticBriefProvided: boolean;
    currentHeaderBaselineProvided: boolean;
    critiqueHashBindingVerified: boolean;
    reviewEvidenceHashBindingVerified: boolean;
    pageRenderShortlisted: boolean;
    comparableViewportGeometryVerified: boolean;
    candidateRenderDifferenceVerified: boolean;
    candidateIdentityMatchesPageRender: boolean;
    candidateHashMatchesPageRender: boolean;
  }>;
  readonly explicitApprovalStillRequired: true;
  readonly automaticPublicationAllowed: false;
  readonly automaticCloudOverwriteAllowed: false;
  readonly automaticWebsiteMutationAllowed: false;
}

export function prepareWorkHeaderApprovalPacket(spec: WorkHeaderApprovalPacketSpec): WorkHeaderApprovalPacketResult {
  if (!spec?.selection || !spec?.pageRender) throw new Error("selection and pageRender evidence are required.");
  const blockers: string[] = [];
  const candidateRecommended = spec.selection.recommendation === "candidate-recommended" && Boolean(spec.selection.recommendedCandidateId) && Boolean(spec.selection.recommendedCandidateSha256);
  if (!candidateRecommended) blockers.push(`selection-not-candidate-recommended:${spec.selection.recommendation}`);
  if (!spec.selection.semanticBriefProvided) blockers.push("semantic-review-brief-not-proved");
  if (!spec.selection.currentHeaderBaselineProvided) blockers.push("current-header-baseline-not-proved");
  if (!spec.selection.critiqueHashBindingVerified) blockers.push("critique-hash-binding-not-proved");
  if (!spec.selection.reviewEvidenceHashBindingVerified) blockers.push("review-evidence-hash-binding-not-proved");

  const pageRenderShortlisted = spec.pageRender.verdict === "page-shortlist" && spec.pageRender.disqualifiers.length === 0;
  if (!pageRenderShortlisted) blockers.push(`page-render-not-shortlisted:${spec.pageRender.verdict}`);
  if (!spec.pageRender.comparableViewportGeometryVerified) blockers.push("page-render-current-candidate-viewports-not-comparable");
  if (!spec.pageRender.candidateRenderDifferenceVerified) blockers.push("page-render-does-not-prove-candidate-was-visible-in-both-viewports");

  const candidateIdentityMatchesPageRender = Boolean(spec.selection.recommendedCandidateId) &&
    spec.pageRender.candidateId === spec.selection.recommendedCandidateId;
  if (!candidateIdentityMatchesPageRender) blockers.push("page-render-candidate-id-does-not-match-selection");

  const candidateHashMatchesPageRender = Boolean(spec.selection.recommendedCandidateSha256) &&
    spec.pageRender.candidateSha256 === spec.selection.recommendedCandidateSha256;
  if (!candidateHashMatchesPageRender) blockers.push("page-render-candidate-hash-does-not-match-selection");

  return Object.freeze({
    contract: WORK_HEADER_APPROVAL_PACKET_CONTRACT,
    status: blockers.length ? "blocked" : "ready-for-explicit-approval",
    candidateId: candidateRecommended ? spec.selection.recommendedCandidateId : null,
    candidateSha256: candidateIdentityMatchesPageRender && candidateHashMatchesPageRender ? spec.pageRender.candidateSha256 : null,
    blockers: Object.freeze(blockers),
    verified: Object.freeze({
      candidateRecommended,
      semanticBriefProvided: spec.selection.semanticBriefProvided,
      currentHeaderBaselineProvided: spec.selection.currentHeaderBaselineProvided,
      critiqueHashBindingVerified: spec.selection.critiqueHashBindingVerified,
      reviewEvidenceHashBindingVerified: spec.selection.reviewEvidenceHashBindingVerified,
      pageRenderShortlisted,
      comparableViewportGeometryVerified: spec.pageRender.comparableViewportGeometryVerified,
      candidateRenderDifferenceVerified: spec.pageRender.candidateRenderDifferenceVerified,
      candidateIdentityMatchesPageRender,
      candidateHashMatchesPageRender,
    }),
    explicitApprovalStillRequired: true,
    automaticPublicationAllowed: false,
    automaticCloudOverwriteAllowed: false,
    automaticWebsiteMutationAllowed: false,
  });
}
