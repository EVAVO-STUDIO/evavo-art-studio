import {
  createImageFinishingReviewPacket,
  type ImageFinishingReviewPacket,
  type ImageFinishingReviewPacketSpec,
} from "./image-finishing-review-packet.js";
import {
  reviewImageDeliveryIntegrity,
  type ImageDeliveryIntegrityEvidence,
  type ImageDeliveryIntegritySpec,
} from "./image-delivery-integrity.js";

export const IMAGE_FINALIZATION_REVIEW_CONTRACT = "evavo.image-finalization-review.v1" as const;

export type ImageFinalizationDecision =
  | "blocked"
  | "needs-image-finishing"
  | "needs-delivery-review"
  | "ready-for-approval-review";

export interface ImageFinalizationReviewSpec {
  readonly finishing?: ImageFinishingReviewPacketSpec;
  readonly delivery: ImageDeliveryIntegritySpec;
}

export interface ImageFinalizationReviewResult {
  readonly contract: typeof IMAGE_FINALIZATION_REVIEW_CONTRACT;
  readonly decision: ImageFinalizationDecision;
  readonly finishing: ImageFinishingReviewPacket;
  readonly delivery: ImageDeliveryIntegrityEvidence;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly reasonCodes: readonly string[];
  readonly recommendedNextTools: readonly string[];
  readonly requiresHumanVisualReview: true;
  readonly automaticPromotionAllowed: false;
  readonly sourceMutationAllowed: false;
}

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.filter(Boolean))]);
}

function finalizationDecision(
  finishing: ImageFinishingReviewPacket,
  delivery: ImageDeliveryIntegrityEvidence,
): ImageFinalizationDecision {
  if (delivery.grade === "fail" || finishing.disposition === "reacquire-or-regenerate") return "blocked";
  if (finishing.disposition !== "ready-for-visual-review") return "needs-image-finishing";
  if (delivery.grade === "warn") return "needs-delivery-review";
  return "ready-for-approval-review";
}

function nextTools(
  decision: ImageFinalizationDecision,
  finishing: ImageFinishingReviewPacket,
  delivery: ImageDeliveryIntegrityEvidence,
): readonly string[] {
  const tools: string[] = [];
  if (decision === "needs-image-finishing" || decision === "blocked") {
    tools.push(...finishing.recommendedNextTools.filter((tool) => tool !== "human-visual-review"));
  }
  if (delivery.grade !== "pass") {
    tools.push("create-deliberate-delivery-derivative");
    tools.push("evavo_review_image_delivery_integrity");
  }
  tools.push("human-visual-review");
  if (decision === "ready-for-approval-review") tools.push("existing-promotion-and-approval-gates");
  else tools.push("evavo_review_image_finalization");
  return unique(tools);
}

/**
 * Final read-only admission review for one finished raster candidate. It combines
 * finishing/art-quality evidence with destination/container integrity and never
 * edits pixels or grants promotion authority.
 */
export async function reviewImageFinalization(
  encoded: Buffer,
  spec: ImageFinalizationReviewSpec,
): Promise<ImageFinalizationReviewResult> {
  if (!Buffer.isBuffer(encoded) || encoded.length === 0) throw new Error("Image finalization review input is empty.");
  if (!spec?.delivery?.target) throw new Error("Image finalization review requires a delivery target.");

  const [finishing, delivery] = await Promise.all([
    createImageFinishingReviewPacket(encoded, spec.finishing ?? {}),
    reviewImageDeliveryIntegrity(encoded, spec.delivery),
  ]);
  const decision = finalizationDecision(finishing, delivery);
  const blockers = [
    ...delivery.blockers.map((item) => `delivery:${item}`),
    ...(finishing.disposition === "reacquire-or-regenerate" ? ["finishing:source-must-be-reacquired-or-regenerated"] : []),
  ];
  const warnings = [
    ...finishing.technicalReview.warnings.map((item) => `finishing:${item}`),
    ...delivery.warnings.map((item) => `delivery:${item}`),
  ];
  const reasonCodes = [
    `finishing-disposition:${finishing.disposition}`,
    `delivery-grade:${delivery.grade}`,
    ...finishing.reasonCodes.map((item) => `finishing:${item}`),
    ...delivery.blockers.map((item) => `delivery-blocker:${item}`),
    ...delivery.warnings.map((item) => `delivery-warning:${item}`),
  ];

  return Object.freeze({
    contract: IMAGE_FINALIZATION_REVIEW_CONTRACT,
    decision,
    finishing,
    delivery,
    blockers: unique(blockers),
    warnings: unique(warnings),
    reasonCodes: unique(reasonCodes),
    recommendedNextTools: nextTools(decision, finishing, delivery),
    requiresHumanVisualReview: true,
    automaticPromotionAllowed: false,
    sourceMutationAllowed: false,
  });
}
