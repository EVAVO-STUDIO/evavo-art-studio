export const IMAGE_REPAIR_DECISION_CONTRACT = "evavo.image-repair-decision.v1" as const;

export type ImageRepairDisposition =
  | "no-repair"
  | "safe-local-repair"
  | "localized-repair"
  | "semantic-edit"
  | "reacquire-or-regenerate"
  | "human-review";

export type ImageRepairVisualFinding =
  | "broken-anatomy"
  | "malformed-text"
  | "identity-drift"
  | "style-mismatch"
  | "wrong-composition"
  | "wrong-content"
  | "perspective-error"
  | "repeated-structure"
  | "nonsensical-detail"
  | "painted-checkerboard-alpha"
  | "unknown-semantic-defect";

export interface ImageRepairReviewLike {
  readonly decision: "pass-to-visual-review" | "needs-finishing" | "reject";
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly quality: Readonly<{
    hasAlpha: boolean;
    grade: "pass" | "warn" | "fail";
    issues: readonly string[];
  }>;
  readonly finishingPlan: Readonly<{
    route: "no-op" | "preservation-polish" | "localized-repair" | "manual-review";
    reasonCodes: readonly string[];
    nextTool: string | null;
    postRepairRequiredTools: readonly string[];
  }>;
  readonly artifactSignals: Readonly<{
    nearestNeighbourUpscaleRisk?: boolean;
    posterizationRisk?: boolean;
    warnings?: readonly string[];
  }>;
}

export interface ImageRepairDecisionSpec {
  readonly visualFindings?: readonly ImageRepairVisualFinding[];
  /**
   * Set only by a higher-level review surface that has explicit asset-role
   * evidence. The repair router never infers alpha-recovery eligibility from
   * pixels or filename appearance by itself.
   */
  readonly paintedCheckerboardAlphaRecoveryEligible?: boolean;
}

export interface ImageRepairDecision {
  readonly contract: typeof IMAGE_REPAIR_DECISION_CONTRACT;
  readonly disposition: ImageRepairDisposition;
  readonly recipe: string | null;
  readonly downstreamTool: string | null;
  readonly reasonCodes: readonly string[];
  readonly agentExecutable: boolean;
  readonly requiresExplicitWriteConfirmation: boolean;
  readonly requiresMask: boolean;
  readonly requiresReference: boolean;
  readonly requiresVisualConfirmation: true;
  readonly sourceMutationAllowed: false;
  readonly approvalState: "unapproved";
  readonly postRepairRequiredTools: readonly string[];
}

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)]);
}

function hasPrefix(values: readonly string[], prefix: string): boolean {
  return values.some((value) => value === prefix || value.startsWith(`${prefix}:`));
}

function decision(
  disposition: ImageRepairDisposition,
  recipe: string | null,
  downstreamTool: string | null,
  reasonCodes: readonly string[],
  options: Readonly<{
    agentExecutable?: boolean;
    requiresMask?: boolean;
    requiresReference?: boolean;
    postRepairRequiredTools?: readonly string[];
  }> = {},
): ImageRepairDecision {
  return Object.freeze({
    contract: IMAGE_REPAIR_DECISION_CONTRACT,
    disposition,
    recipe,
    downstreamTool,
    reasonCodes: unique(reasonCodes),
    agentExecutable: options.agentExecutable === true,
    requiresExplicitWriteConfirmation: options.agentExecutable === true,
    requiresMask: options.requiresMask === true,
    requiresReference: options.requiresReference === true,
    requiresVisualConfirmation: true as const,
    sourceMutationAllowed: false as const,
    approvalState: "unapproved" as const,
    postRepairRequiredTools: Object.freeze([...(options.postRepairRequiredTools ?? [])]),
  });
}

/**
 * Converts deterministic review evidence plus explicit visual findings into the
 * smallest safe repair route. This is an admission decision, not an executor.
 * It never authorises source mutation or automatic promotion.
 */
export function planImageRepairDecision(
  review: ImageRepairReviewLike,
  spec: ImageRepairDecisionSpec = {},
): ImageRepairDecision {
  if (!review || !review.quality || !review.finishingPlan || !review.artifactSignals) {
    throw new Error("Image repair routing requires complete image review evidence.");
  }

  const visualFindings = Object.freeze([...(spec.visualFindings ?? [])]);
  const postRepairRequiredTools = review.finishingPlan.postRepairRequiredTools;
  const hasPaintedCheckerboardAlpha = visualFindings.includes("painted-checkerboard-alpha");
  if (hasPaintedCheckerboardAlpha) {
    const otherFindings = visualFindings.filter((finding) => finding !== "painted-checkerboard-alpha");
    if (otherFindings.length > 0) {
      return decision(
        "human-review",
        null,
        null,
        [
          "visual-finding:painted-checkerboard-alpha",
          ...otherFindings.map((finding) => `visual-finding:${finding}`),
          "painted-checkerboard-alpha-is-mixed-with-other-semantic-findings",
          "alpha-recovery-must-not-hide-semantic-repair-requirements",
        ],
        { postRepairRequiredTools },
      );
    }
    if (spec.paintedCheckerboardAlphaRecoveryEligible !== true) {
      return decision(
        "human-review",
        null,
        null,
        [
          "visual-finding:painted-checkerboard-alpha",
          "painted-checkerboard-alpha-recovery-requires-explicit-title-logo-ui-or-sprite-role",
          "transparency-must-not-be-inferred-from-image-appearance",
        ],
        { postRepairRequiredTools },
      );
    }
    return decision(
      "localized-repair",
      "painted-checkerboard-alpha-recovery",
      "evavo-title-alpha",
      [
        "visual-finding:painted-checkerboard-alpha",
        "explicit-alpha-recovery-role-is-eligible",
        "enhancement-repair-requires-explicit-matte-colours-and-create-only-output",
        "checkerboard-preview-is-not-proof-of-real-alpha",
      ],
      {
        // Recommendation only. Image Enhancement owns execution and must still
        // receive explicit matte colours and create a new reviewed output.
        agentExecutable: false,
        postRepairRequiredTools,
      },
    );
  }

  if (visualFindings.length > 0) {
    return decision(
      "semantic-edit",
      "masked-semantic-repair",
      "governed-provider-edit-or-inpaint",
      visualFindings.map((finding) => `visual-finding:${finding}`),
      {
        requiresMask: true,
        requiresReference: visualFindings.some((finding) =>
          finding === "identity-drift" || finding === "style-mismatch" || finding === "wrong-content"),
        postRepairRequiredTools,
      },
    );
  }

  const qualityIssues = review.quality.issues;
  const unrecoverableTechnical =
    hasPrefix(qualityIssues, "soft-or-blurry")
    || review.blockers.some((value) => value.includes("work-header crop/resolution"))
    || review.blockers.includes("probable-nearest-neighbour-upscale-of-non-pixel-art")
    || review.artifactSignals.nearestNeighbourUpscaleRisk === true;

  if (unrecoverableTechnical) {
    return decision(
      "reacquire-or-regenerate",
      null,
      "source-or-provider-regeneration",
      [
        ...(hasPrefix(qualityIssues, "soft-or-blurry") ? ["source-is-too-soft-for-safe-detail-reconstruction"] : []),
        ...(review.artifactSignals.nearestNeighbourUpscaleRisk === true ? ["suspicious-non-pixel-art-nearest-neighbour-upscale"] : []),
        ...review.blockers,
      ],
      { postRepairRequiredTools },
    );
  }

  if (review.finishingPlan.route === "preservation-polish") {
    const expectedRepairBlockers = new Set([
      "technical image-quality review failed",
      "transparent RGB contamination exceeds profile limit",
      "edge halo risk exceeds profile limit",
    ]);
    const unrelatedBlockers = review.blockers.filter((value) => !expectedRepairBlockers.has(value));
    const admissible = review.quality.hasAlpha && unrelatedBlockers.length === 0;
    if (!admissible) {
      return decision(
        "human-review",
        null,
        "evavo_polish_existing_raster_preserving_artwork",
        [
          ...review.finishingPlan.reasonCodes,
          ...(!review.quality.hasAlpha ? ["preservation-polish-requires-existing-alpha"] : []),
          ...unrelatedBlockers,
        ],
        { postRepairRequiredTools },
      );
    }
    return decision(
      "safe-local-repair",
      "preservation-polish",
      "evavo_polish_existing_raster_preserving_artwork",
      [
        ...review.finishingPlan.reasonCodes,
        ...(review.blockers.length ? ["only-preservation-target-blockers-present"] : []),
      ],
      { agentExecutable: true, postRepairRequiredTools },
    );
  }

  if (review.finishingPlan.route === "manual-review" || review.decision === "reject") {
    return decision(
      "human-review",
      null,
      null,
      [
        ...review.finishingPlan.reasonCodes,
        ...review.blockers,
        ...(review.quality.grade === "fail" ? ["technical-quality-grade-failed"] : []),
      ],
      { postRepairRequiredTools },
    );
  }

  if (review.finishingPlan.route === "localized-repair") {
    return decision(
      "localized-repair",
      "masked-candidate-composite",
      "evavo_apply_localized_raster_edit",
      review.finishingPlan.reasonCodes,
      {
        agentExecutable: true,
        requiresMask: true,
        postRepairRequiredTools,
      },
    );
  }

  if (review.finishingPlan.route === "no-op" && review.decision === "pass-to-visual-review") {
    return decision(
      "no-repair",
      null,
      null,
      review.finishingPlan.reasonCodes,
      { postRepairRequiredTools },
    );
  }

  return decision(
    "human-review",
    null,
    review.finishingPlan.nextTool,
    [
      ...review.finishingPlan.reasonCodes,
      ...review.warnings,
      "review-state-does-not-admit-a-bounded-repair",
    ],
    { postRepairRequiredTools },
  );
}
