import {
  orchestrateImageReview,
  type ImageReviewContext,
  type ImageReviewOrchestrationResult,
} from "./image-review-orchestrator.js";
import {
  planImageRepairDecision,
  type ImageRepairDecision,
  type ImageRepairVisualFinding,
} from "./image-repair-routing.js";
import {
  reviewImageReferenceConsistency,
  type ImageReferenceConsistencyResult,
  type ImageReferenceInput,
} from "./image-reference-consistency.js";

export const IMAGE_FINISHING_REVIEW_PACKET_CONTRACT = "evavo.image-finishing-review-packet.v1" as const;

export type ImageFinishingPacketDisposition =
  | "ready-for-visual-review"
  | "safe-local-repair"
  | "localized-repair"
  | "semantic-repair"
  | "reacquire-or-regenerate"
  | "human-review";

export type ImageFinishingPacketPriority = "normal" | "review" | "high" | "critical";

export interface ImageFinishingReviewPacketSpec {
  readonly reviewContext?: ImageReviewContext;
  readonly approvedReferences?: readonly ImageReferenceInput[];
  readonly visualFindings?: readonly ImageRepairVisualFinding[];
}

export interface ImageFinishingReviewPacket {
  readonly contract: typeof IMAGE_FINISHING_REVIEW_PACKET_CONTRACT;
  readonly disposition: ImageFinishingPacketDisposition;
  readonly priority: ImageFinishingPacketPriority;
  readonly technicalReview: ImageReviewOrchestrationResult;
  readonly repairDecision: ImageRepairDecision;
  readonly referenceConsistency: ImageReferenceConsistencyResult | null;
  readonly reasonCodes: readonly string[];
  readonly recommendedNextTools: readonly string[];
  readonly requiresHumanVisualReview: true;
  readonly automaticPromotionAllowed: false;
  readonly sourceMutationAllowed: false;
  readonly originAssessment: Readonly<{
    aiGenerated: "not-determined";
    reason: string;
  }>;
}

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.filter(Boolean))]);
}

function dispositionFromRepair(decision: ImageRepairDecision): ImageFinishingPacketDisposition {
  switch (decision.disposition) {
    case "no-repair": return "ready-for-visual-review";
    case "safe-local-repair": return "safe-local-repair";
    case "localized-repair": return "localized-repair";
    case "semantic-edit": return "semantic-repair";
    case "reacquire-or-regenerate": return "reacquire-or-regenerate";
    case "human-review": return "human-review";
  }
}

function priorityFor(
  disposition: ImageFinishingPacketDisposition,
  technical: ImageReviewOrchestrationResult,
  reference: ImageReferenceConsistencyResult | null,
): ImageFinishingPacketPriority {
  if (disposition === "reacquire-or-regenerate" || technical.decision === "reject") return "critical";
  if (disposition === "semantic-repair" || disposition === "human-review" || reference?.grade === "fail") return "high";
  if (disposition === "safe-local-repair" || disposition === "localized-repair" || technical.decision === "needs-finishing" || reference?.grade === "warn") return "review";
  return "normal";
}

function nextTools(
  disposition: ImageFinishingPacketDisposition,
  repair: ImageRepairDecision,
  reference: ImageReferenceConsistencyResult | null,
): readonly string[] {
  const tools: string[] = [];
  if (reference?.referenceCoherence.state === "unstable") {
    tools.push("review-and-curate-approved-reference-set");
  }
  if (reference && reference.grade !== "pass") {
    tools.push("evavo_create_image_reference_consistency_proof");
  }
  if (repair.downstreamTool) tools.push(repair.downstreamTool);
  tools.push(...repair.postRepairRequiredTools);
  if (disposition === "semantic-repair") tools.push("governed-provider-edit-or-inpaint");
  if (disposition === "reacquire-or-regenerate") tools.push("source-or-provider-regeneration");
  tools.push("evavo_review_image_for_finishing");
  if (reference) tools.push("evavo_review_image_against_references");
  tools.push("human-visual-review");
  return unique(tools);
}

/**
 * Produce one read-only finishing decision packet from technical review,
 * repair admission and optional approved-reference consistency evidence.
 * The packet never executes edits and never authorises final promotion.
 */
export async function createImageFinishingReviewPacket(
  candidate: Buffer,
  spec: ImageFinishingReviewPacketSpec = {},
): Promise<ImageFinishingReviewPacket> {
  if (!Buffer.isBuffer(candidate) || candidate.length === 0) throw new Error("Finishing review packet candidate is empty.");
  const technicalReview = await orchestrateImageReview(candidate, spec.reviewContext ?? {});
  const repairDecision = planImageRepairDecision(technicalReview, {
    ...(spec.visualFindings?.length ? { visualFindings: spec.visualFindings } : {}),
  });
  const referenceConsistency = spec.approvedReferences?.length
    ? await reviewImageReferenceConsistency(candidate, spec.approvedReferences)
    : null;

  let disposition = dispositionFromRepair(repairDecision);
  const reasons: string[] = [
    ...repairDecision.reasonCodes,
    ...technicalReview.blockers.map((item) => `technical-blocker:${item}`),
  ];

  if (referenceConsistency) {
    reasons.push(`reference-consistency:${referenceConsistency.decision}`);
    reasons.push(...referenceConsistency.flags.map((flag) => `reference:${flag}`));
    if (referenceConsistency.referenceCoherence.state === "unstable") {
      disposition = "human-review";
      reasons.push("approved-reference-set-is-not-stable-enough-for-automated-consistency-judgment");
    } else if (referenceConsistency.grade === "fail" && disposition === "ready-for-visual-review") {
      disposition = "human-review";
      reasons.push("candidate-has-strong-technical-visual-drift-from-approved-references");
    } else if (referenceConsistency.grade === "fail" && disposition === "safe-local-repair") {
      disposition = "human-review";
      reasons.push("reference-drift-exceeds-safe-deterministic-local-repair-scope");
    }
  }

  if (technicalReview.generatedDetailRisk.repeatedDetailRisk) reasons.push("generated-detail-risk:repeated-nontrivial-local-patterns");
  if (technicalReview.generatedDetailRisk.detailImbalanceRisk) reasons.push("generated-detail-risk:local-detail-density-imbalance");

  return Object.freeze({
    contract: IMAGE_FINISHING_REVIEW_PACKET_CONTRACT,
    disposition,
    priority: priorityFor(disposition, technicalReview, referenceConsistency),
    technicalReview,
    repairDecision,
    referenceConsistency,
    reasonCodes: unique(reasons),
    recommendedNextTools: nextTools(disposition, repairDecision, referenceConsistency),
    requiresHumanVisualReview: true,
    automaticPromotionAllowed: false,
    sourceMutationAllowed: false,
    originAssessment: Object.freeze({
      aiGenerated: "not-determined",
      reason: "Quality, artifact, generated-detail and approved-reference consistency evidence can identify production risks but cannot reliably prove image authorship.",
    }),
  });
}
