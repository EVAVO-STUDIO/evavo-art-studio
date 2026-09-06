import type { ImageReviewProfileName } from "./image-review-profiles.js";
import type { ExistingImageDefectDetectionResult } from "./existing-image-defect-detection.js";
import type { DefectRegionComponentsResult } from "./defect-region-components.js";

export const EXISTING_IMAGE_FINISHING_PLAN_CONTRACT = "evavo.existing-image-finishing-plan.v1" as const;

export type ExistingImageFinishingRoute = "no-op" | "preservation-polish" | "localized-repair" | "manual-review";

export interface ExistingImageFinishingPlanSpec {
  readonly profile: ImageReviewProfileName;
  readonly maximumAutomaticRegionCount?: number;
  readonly maximumAutomaticCoverageRatio?: number;
  readonly regionPadding?: number;
}

export interface ExistingImageFinishingRegionPlan {
  readonly id: string;
  readonly rank: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly padding: number;
  readonly shape: "rectangle";
  readonly pixelRatio: number;
  readonly density: number;
  readonly touchesCanvasEdge: boolean;
  readonly requiresVisualConfirmation: true;
}

export interface ExistingImageFinishingPlan {
  readonly contract: typeof EXISTING_IMAGE_FINISHING_PLAN_CONTRACT;
  readonly profile: ImageReviewProfileName;
  readonly route: ExistingImageFinishingRoute;
  readonly reasonCodes: readonly string[];
  readonly regions: readonly ExistingImageFinishingRegionPlan[];
  readonly sourceMutationAllowed: false;
  readonly automaticRepairAllowed: false;
  readonly visualConfirmationRequired: true;
  readonly maximumAutomaticCoverageRatio: number;
  readonly nextTool: string | null;
  readonly postRepairRequiredTools: readonly string[];
}

function finiteRatio(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0 || value > 1) throw new Error(`${label} must be greater than 0 and no more than 1.`);
  return value;
}

function integer(value: number | undefined, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be ${min}..${max}.`);
  return value;
}

/**
 * Converts defect evidence into a bounded, review-only finishing route. This is
 * deliberately not an executor: it selects the smallest preservation-first next
 * step and emits mask-authoring regions for human/vision confirmation.
 */
export function planExistingImageFinishing(
  defectEvidence: ExistingImageDefectDetectionResult["evidence"],
  defectRegions: DefectRegionComponentsResult,
  spec: ExistingImageFinishingPlanSpec,
): ExistingImageFinishingPlan {
  if (!defectEvidence || !defectRegions) throw new Error("Defect evidence and region evidence are required.");
  if (defectEvidence.width !== defectRegions.width || defectEvidence.height !== defectRegions.height) {
    throw new Error("Defect evidence and region evidence dimensions do not match.");
  }
  const maximumAutomaticRegionCount = integer(spec.maximumAutomaticRegionCount, 8, 1, 64, "maximumAutomaticRegionCount");
  const maximumAutomaticCoverageRatio = finiteRatio(spec.maximumAutomaticCoverageRatio, 0.12, "maximumAutomaticCoverageRatio");
  const regionPadding = integer(spec.regionPadding, 2, 0, 64, "regionPadding");
  const reasons: string[] = [];

  const severeAlpha = defectEvidence.defectCounts["alpha-pinhole"]
    + defectEvidence.defectCounts["isolated-alpha-speck"]
    + defectEvidence.defectCounts["hard-alpha-stair-step"];
  const cleanupOnly = severeAlpha === 0
    && (defectEvidence.defectCounts["transparent-rgb-contamination"] > 0 || defectEvidence.defectCounts["edge-halo-risk"] > 0);

  let route: ExistingImageFinishingRoute;
  if (defectEvidence.defectPixels === 0) {
    route = "no-op";
    reasons.push("no-detected-defect-pixels");
  } else if (
    defectEvidence.suggestedAction === "manual-review"
    || defectEvidence.maskCoverageRatio > maximumAutomaticCoverageRatio
    || defectRegions.retainedComponentCount > maximumAutomaticRegionCount
  ) {
    route = "manual-review";
    if (defectEvidence.suggestedAction === "manual-review") reasons.push("detector-requested-manual-review");
    if (defectEvidence.maskCoverageRatio > maximumAutomaticCoverageRatio) reasons.push("repair-surface-exceeds-finishing-plan-budget");
    if (defectRegions.retainedComponentCount > maximumAutomaticRegionCount) reasons.push("too-many-independent-defect-regions");
  } else if (cleanupOnly) {
    route = "preservation-polish";
    reasons.push("transparent-rgb-or-matte-fringe-cleanup-only");
  } else {
    route = "localized-repair";
    reasons.push("localized-alpha-or-edge-defects-require-bounded-repair");
  }

  const regions = defectRegions.regions.slice(0, maximumAutomaticRegionCount).map((region) => Object.freeze({
    id: region.id,
    rank: region.rank,
    x: region.bounds.left,
    y: region.bounds.top,
    width: region.bounds.width,
    height: region.bounds.height,
    padding: regionPadding,
    shape: "rectangle" as const,
    pixelRatio: region.pixelRatio,
    density: region.density,
    touchesCanvasEdge: region.touchesCanvasEdge,
    requiresVisualConfirmation: true as const,
  }));

  const nextTool = route === "preservation-polish"
    ? "evavo_polish_existing_raster_preserving_artwork"
    : route === "localized-repair"
      ? "evavo_create_existing_image_edit_mask"
      : null;

  return Object.freeze({
    contract: EXISTING_IMAGE_FINISHING_PLAN_CONTRACT,
    profile: spec.profile,
    route,
    reasonCodes: Object.freeze(reasons),
    regions: Object.freeze(regions),
    sourceMutationAllowed: false,
    automaticRepairAllowed: false,
    visualConfirmationRequired: true,
    maximumAutomaticCoverageRatio,
    nextTool,
    postRepairRequiredTools: Object.freeze([
      "evavo_review_existing_image_edit",
      "evavo_create_existing_image_inspection_proof",
      "evavo_create_image_review_session",
      "evavo_verify_image_review_session",
    ]),
  });
}
