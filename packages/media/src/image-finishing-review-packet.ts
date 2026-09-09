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
  reviewImageReferenceConsistencyBatch,
  type ImageReferenceBatchResult,
  type ImageReferenceConsistencyResult,
  type ImageReferenceInput,
} from "./image-reference-consistency.js";

export const IMAGE_FINISHING_REVIEW_PACKET_CONTRACT = "evavo.image-finishing-review-packet.v1" as const;
export const IMAGE_FINISHING_REVIEW_BATCH_CONTRACT = "evavo.image-finishing-review-batch.v1" as const;

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

export interface ImageFinishingReviewBatchItemInput {
  readonly id: string;
  readonly encoded: Buffer;
  readonly reviewContext?: ImageReviewContext;
  readonly visualFindings?: readonly ImageRepairVisualFinding[];
}

export interface ImageFinishingReviewBatchSpec {
  readonly defaultReviewContext?: ImageReviewContext;
  readonly approvedReferences?: readonly ImageReferenceInput[];
}

export interface ImageFinishingReviewBatchResult {
  readonly contract: typeof IMAGE_FINISHING_REVIEW_BATCH_CONTRACT;
  readonly itemCount: number;
  readonly referenceCount: number;
  readonly referenceCoherence: ImageReferenceBatchResult["referenceCoherence"] | null;
  readonly items: readonly Readonly<{ id: string; packet: ImageFinishingReviewPacket }>[];
  readonly reviewPriority: readonly string[];
  readonly summary: Readonly<{
    dispositions: Readonly<Record<ImageFinishingPacketDisposition, number>>;
    priorities: Readonly<Record<ImageFinishingPacketPriority, number>>;
    technicalRejectCount: number;
    generatedDetailRiskCount: number;
    referenceDriftCount: number;
  }>;
  readonly requiresHumanVisualReview: true;
  readonly automaticPromotionAllowed: false;
  readonly sourcesModified: false;
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
  if (reference?.referenceCoherence.state === "unstable") tools.push("review-and-curate-approved-reference-set");
  if (reference && reference.grade !== "pass") tools.push("evavo_create_image_reference_consistency_proof");
  if (repair.downstreamTool) tools.push(repair.downstreamTool);
  tools.push(...repair.postRepairRequiredTools);
  if (disposition === "semantic-repair") tools.push("governed-provider-edit-or-inpaint");
  if (disposition === "reacquire-or-regenerate") tools.push("source-or-provider-regeneration");
  tools.push("evavo_review_image_for_finishing");
  if (reference) tools.push("evavo_review_image_against_references");
  tools.push("human-visual-review");
  return unique(tools);
}

function assemblePacket(
  technicalReview: ImageReviewOrchestrationResult,
  repairDecision: ImageRepairDecision,
  referenceConsistency: ImageReferenceConsistencyResult | null,
): ImageFinishingReviewPacket {
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

function mergedContext(defaults: ImageReviewContext | undefined, override: ImageReviewContext | undefined): ImageReviewContext {
  return Object.freeze({ ...(defaults ?? {}), ...(override ?? {}) });
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
  return assemblePacket(technicalReview, repairDecision, referenceConsistency);
}

/**
 * Review up to 128 related images with one shared approved-reference model.
 * Technical/repair review remains per-image while the reference baseline is
 * computed once, avoiding repeated reference decoding in large batches.
 */
export async function createImageFinishingReviewBatch(
  inputs: readonly ImageFinishingReviewBatchItemInput[],
  spec: ImageFinishingReviewBatchSpec = {},
): Promise<ImageFinishingReviewBatchResult> {
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 128) {
    throw new Error("Finishing review batch requires 1 through 128 images.");
  }
  const seen = new Set<string>();
  for (const [index, input] of inputs.entries()) {
    if (!input || typeof input.id !== "string" || !input.id.trim()) throw new Error(`inputs[${index}].id must be a non-empty string.`);
    if (seen.has(input.id)) throw new Error(`Duplicate finishing batch id ${JSON.stringify(input.id)}.`);
    seen.add(input.id);
    if (!Buffer.isBuffer(input.encoded) || input.encoded.length === 0) throw new Error(`inputs[${index}].encoded is empty.`);
  }

  const references = spec.approvedReferences ?? [];
  const referencePromise = references.length
    ? reviewImageReferenceConsistencyBatch(
      inputs.map((input) => ({ id: input.id, encoded: input.encoded })),
      references,
    )
    : Promise.resolve(null);
  const technicalItemsPromise = Promise.all(inputs.map(async (input) => {
    const technicalReview = await orchestrateImageReview(
      input.encoded,
      mergedContext(spec.defaultReviewContext, input.reviewContext),
    );
    const repairDecision = planImageRepairDecision(technicalReview, {
      ...(input.visualFindings?.length ? { visualFindings: input.visualFindings } : {}),
    });
    return Object.freeze({ id: input.id, technicalReview, repairDecision });
  }));

  const [referenceBatch, technicalItems] = await Promise.all([referencePromise, technicalItemsPromise]);
  const referenceById = new Map<string, ImageReferenceConsistencyResult>();
  for (const item of referenceBatch?.results ?? []) referenceById.set(item.id, item.review);
  const items = technicalItems.map((item) => Object.freeze({
    id: item.id,
    packet: assemblePacket(item.technicalReview, item.repairDecision, referenceById.get(item.id) ?? null),
  }));

  const priorityRank: Readonly<Record<ImageFinishingPacketPriority, number>> = Object.freeze({
    normal: 1,
    review: 2,
    high: 3,
    critical: 4,
  });
  const reviewPriority = [...items]
    .sort((a, b) => {
      const priorityDifference = priorityRank[b.packet.priority] - priorityRank[a.packet.priority];
      if (priorityDifference !== 0) return priorityDifference;
      const referenceDifference = (b.packet.referenceConsistency?.distance.composite ?? 0) - (a.packet.referenceConsistency?.distance.composite ?? 0);
      if (referenceDifference !== 0) return referenceDifference;
      return a.packet.technicalReview.quality.score - b.packet.technicalReview.quality.score;
    })
    .map((item) => item.id);

  const dispositions: Record<ImageFinishingPacketDisposition, number> = {
    "ready-for-visual-review": 0,
    "safe-local-repair": 0,
    "localized-repair": 0,
    "semantic-repair": 0,
    "reacquire-or-regenerate": 0,
    "human-review": 0,
  };
  const priorities: Record<ImageFinishingPacketPriority, number> = { normal: 0, review: 0, high: 0, critical: 0 };
  for (const item of items) {
    dispositions[item.packet.disposition] += 1;
    priorities[item.packet.priority] += 1;
  }

  return Object.freeze({
    contract: IMAGE_FINISHING_REVIEW_BATCH_CONTRACT,
    itemCount: items.length,
    referenceCount: references.length,
    referenceCoherence: referenceBatch?.referenceCoherence ?? null,
    items: Object.freeze(items),
    reviewPriority: Object.freeze(reviewPriority),
    summary: Object.freeze({
      dispositions: Object.freeze(dispositions),
      priorities: Object.freeze(priorities),
      technicalRejectCount: items.filter((item) => item.packet.technicalReview.decision === "reject").length,
      generatedDetailRiskCount: items.filter((item) => item.packet.technicalReview.generatedDetailRisk.repeatedDetailRisk || item.packet.technicalReview.generatedDetailRisk.detailImbalanceRisk).length,
      referenceDriftCount: items.filter((item) => item.packet.referenceConsistency?.grade !== undefined && item.packet.referenceConsistency.grade !== "pass").length,
    }),
    requiresHumanVisualReview: true,
    automaticPromotionAllowed: false,
    sourcesModified: false,
  });
}
