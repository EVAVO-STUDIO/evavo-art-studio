import type {
  AdventureCreativeIssueCodeV3,
  AdventureCreativeWorkOrderV3,
} from "./adventure-studio-handoff-v3.js";

export interface AdventureStudioArtReviewIssueV3 {
  readonly issueId: string;
  readonly code: AdventureCreativeIssueCodeV3;
  readonly severity: "blocking" | "major" | "minor";
  readonly message: string;
  readonly region?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly evidenceDigests: readonly string[];
  readonly suggestedRepair: string;
}

export interface AdventureStudioArtReviewV3 {
  readonly reviewVersion: 3;
  readonly workOrderId: string;
  readonly revision: number;
  readonly candidateArtifactDigest: string;
  readonly disposition: "candidate" | "repair-required" | "review-required" | "accepted" | "rejected";
  readonly issues: readonly AdventureStudioArtReviewIssueV3[];
  readonly closedIssueIds: readonly string[];
  readonly alphaEvidenceDigest?: string;
  readonly styleEvidenceDigest?: string;
  readonly reviewerEvidenceDigest: string;
}

export interface AdventureStudioArtDeliveryV3 {
  readonly deliveryVersion: 3;
  readonly workOrderId: string;
  readonly revision: number;
  readonly assetId: string;
  readonly approvedArtifactDigest: string;
  readonly approvedByteLength: number;
  readonly mediaType: string;
  readonly nativeSize: { readonly width: number; readonly height: number };
  readonly alphaEvidenceDigest?: string;
  readonly reviewEvidenceDigest: string;
  readonly sourceLineageDigests: readonly string[];
}

export interface AdventureStudioArtReviewEvidenceV3 {
  readonly candidateArtifactDigest: string;
  readonly reviewerEvidenceDigest: string;
  readonly alphaEvidenceDigest?: string;
  readonly styleEvidenceDigest?: string;
  readonly issues: readonly AdventureStudioArtReviewIssueV3[];
  readonly closedIssueIds?: readonly string[];
  readonly authorityViolation?: boolean;
}

const nonEmpty = (value: string | undefined): boolean => Boolean(value?.trim());

export const buildAdventureStudioArtReviewV3 = (
  order: AdventureCreativeWorkOrderV3,
  evidence: AdventureStudioArtReviewEvidenceV3,
): AdventureStudioArtReviewV3 => {
  if (order.destinationStudio !== "art-studio") throw new Error("Art review requires an Art Studio v3 work order.");
  if (!nonEmpty(evidence.candidateArtifactDigest) || !nonEmpty(evidence.reviewerEvidenceDigest)) {
    throw new Error("Art review requires candidate and reviewer evidence digests.");
  }
  const closed = new Set(evidence.closedIssueIds ?? []);
  const open = evidence.issues.filter((issue) => !closed.has(issue.issueId));
  const hasBlocking = open.some((issue) => issue.severity === "blocking");
  const hasSubjective = open.some((issue) => issue.severity === "major" || issue.severity === "minor");
  const alphaMissing = order.alphaPolicy !== "opaque" && !evidence.alphaEvidenceDigest;
  const disposition: AdventureStudioArtReviewV3["disposition"] = evidence.authorityViolation
    ? "rejected"
    : hasBlocking || alphaMissing
      ? "repair-required"
      : hasSubjective
        ? "review-required"
        : "accepted";
  return {
    reviewVersion: 3,
    workOrderId: order.workOrderId,
    revision: order.revision,
    candidateArtifactDigest: evidence.candidateArtifactDigest,
    disposition,
    issues: evidence.issues,
    closedIssueIds: [...closed].sort((left, right) => left.localeCompare(right)),
    ...(evidence.alphaEvidenceDigest ? { alphaEvidenceDigest: evidence.alphaEvidenceDigest } : {}),
    ...(evidence.styleEvidenceDigest ? { styleEvidenceDigest: evidence.styleEvidenceDigest } : {}),
    reviewerEvidenceDigest: evidence.reviewerEvidenceDigest,
  };
};

export const buildAdventureStudioArtDeliveryV3 = (
  order: AdventureCreativeWorkOrderV3,
  review: AdventureStudioArtReviewV3,
  input: {
    readonly byteLength: number;
    readonly mediaType: string;
    readonly sourceLineageDigests: readonly string[];
  },
): AdventureStudioArtDeliveryV3 => {
  if (review.disposition !== "accepted") throw new Error(`Cannot deliver art from '${review.disposition}' review.`);
  if (review.candidateArtifactDigest.length === 0) throw new Error("Accepted art review is missing artifact digest.");
  if (order.alphaPolicy !== "opaque" && !review.alphaEvidenceDigest) throw new Error("Transparent art delivery requires accepted alpha evidence.");
  if (!Number.isSafeInteger(input.byteLength) || input.byteLength <= 0 || !nonEmpty(input.mediaType)) {
    throw new Error("Art delivery requires positive byte length and media type.");
  }
  return {
    deliveryVersion: 3,
    workOrderId: order.workOrderId,
    revision: order.revision,
    assetId: order.assetId,
    approvedArtifactDigest: review.candidateArtifactDigest,
    approvedByteLength: input.byteLength,
    mediaType: input.mediaType,
    nativeSize: order.nativeSize,
    ...(review.alphaEvidenceDigest ? { alphaEvidenceDigest: review.alphaEvidenceDigest } : {}),
    reviewEvidenceDigest: review.reviewerEvidenceDigest,
    sourceLineageDigests: [...new Set(input.sourceLineageDigests)].sort((left, right) => left.localeCompare(right)),
  };
};
