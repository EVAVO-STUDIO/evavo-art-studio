import type { ImageReviewProfileName } from "./image-review-profiles.js";

export const ENHANCEMENT_ART_REVIEW_CONTRACT = "evavo.enhancement-art-review.v1" as const;

const REVIEW_PROFILES = new Set<ImageReviewProfileName>([
  "logo-transparent",
  "web-hero",
  "ui-screenshot",
  "product-cutout",
  "photo",
  "cel-animation-frame",
  "pixel-art",
  "texture",
  "illustration",
]);

export interface EnhancementStudioReviewManifest {
  readonly contract: string;
  readonly source_path: string;
  readonly source_sha256: string;
  readonly source_width: number;
  readonly source_height: number;
  readonly candidate_path: string;
  readonly candidate_sha256: string;
  readonly candidate_width: number;
  readonly candidate_height: number;
  readonly enhancement_profile: string;
  readonly art_studio_review_profile: string;
  readonly intended_role: string;
  readonly learned_candidate: boolean;
  readonly mandatory_art_studio_tools: readonly string[];
  readonly mandatory_visual_checks: readonly string[];
  readonly approval_state: string;
  readonly source_immutable: boolean;
  readonly candidate_is_review_only: boolean;
  readonly art_studio_visual_review_required: boolean;
  readonly page_context_review_required: boolean;
  readonly publication_allowed: boolean;
  readonly cloud_overwrite_allowed: boolean;
  readonly automatic_creative_approval: boolean;
  readonly automatic_release_approval: boolean;
}

export interface AdmittedEnhancementStudioReview {
  readonly profile: ImageReviewProfileName;
  readonly intendedRole: "work-header" | "support-image" | "tile" | "logo" | "ui" | "photo" | "sprite" | "illustration" | "texture";
  readonly sourceSha256: string;
  readonly candidateSha256: string;
  readonly learnedCandidate: boolean;
  readonly pageContextReviewRequired: boolean;
  readonly requiredTools: readonly string[];
  readonly visualChecks: readonly string[];
  readonly publicationAllowed: false;
  readonly cloudOverwriteAllowed: false;
  readonly finalApprovalRequired: true;
}

const ROLE_MAP: Readonly<Record<string, AdmittedEnhancementStudioReview["intendedRole"]>> = Object.freeze({
  "work-header": "work-header",
  "support-image": "support-image",
  "catalogue-tile": "tile",
  logo: "logo",
  ui: "ui",
  photo: "photo",
  sprite: "sprite",
  illustration: "illustration",
  texture: "texture",
});

function sha(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 hex digest.`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 32768) {
    throw new Error(`${label} must be an integer from 1 through 32768.`);
  }
  return Number(value);
}

function strings(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${label} must be an array of non-empty strings.`);
  }
  return Object.freeze([...new Set(value)]);
}

/**
 * Admits an Enhancement Studio review manifest into Art Studio without trusting
 * it as an approval. This intentionally fails closed on every authority field:
 * enhancement candidates remain source-bound review material until Art Studio's
 * technical AND actual visual/page-context review has completed.
 */
export function admitEnhancementStudioReviewManifest(
  value: EnhancementStudioReviewManifest,
): AdmittedEnhancementStudioReview {
  if (!value || typeof value !== "object") throw new Error("Enhancement Studio review manifest is required.");
  if (value.contract !== ENHANCEMENT_ART_REVIEW_CONTRACT) {
    throw new Error(`Unsupported Enhancement Studio review contract ${JSON.stringify(value.contract)}.`);
  }
  if (value.source_immutable !== true || value.candidate_is_review_only !== true) {
    throw new Error("Enhancement Studio manifest must preserve immutable-source and review-candidate boundaries.");
  }
  if (value.art_studio_visual_review_required !== true) {
    throw new Error("Enhancement Studio candidate cannot bypass Art Studio visual review.");
  }
  if (
    value.publication_allowed !== false ||
    value.cloud_overwrite_allowed !== false ||
    value.automatic_creative_approval !== false ||
    value.automatic_release_approval !== false
  ) {
    throw new Error("Enhancement Studio manifest attempted to carry forbidden publication/approval authority.");
  }
  if (value.approval_state !== "unapproved") {
    throw new Error("Enhancement Studio candidates must enter Art Studio in the unapproved state.");
  }

  const profile = value.art_studio_review_profile as ImageReviewProfileName;
  if (!REVIEW_PROFILES.has(profile)) {
    throw new Error(`Unknown Art Studio review profile ${JSON.stringify(value.art_studio_review_profile)}.`);
  }
  const role = ROLE_MAP[value.intended_role];
  if (!role) throw new Error(`Unknown Enhancement Studio intended role ${JSON.stringify(value.intended_role)}.`);

  positiveInteger(value.source_width, "source_width");
  positiveInteger(value.source_height, "source_height");
  positiveInteger(value.candidate_width, "candidate_width");
  positiveInteger(value.candidate_height, "candidate_height");
  const requiredTools = strings(value.mandatory_art_studio_tools, "mandatory_art_studio_tools");
  const visualChecks = strings(value.mandatory_visual_checks, "mandatory_visual_checks");

  const expectedTools = [
    "evavo_review_existing_image_quality",
    "evavo_review_existing_image_edit",
    "evavo_create_existing_image_inspection_proof",
  ];
  for (const tool of expectedTools) {
    if (!requiredTools.includes(tool)) throw new Error(`Enhancement Studio review manifest omitted required Art Studio tool ${tool}.`);
  }
  if (role === "work-header" && !requiredTools.includes("evavo_review_work_header_image")) {
    throw new Error("Work-header enhancement candidates must require the Art Studio header reviewer.");
  }
  if (["work-header", "support-image", "tile"].includes(role) && value.page_context_review_required !== true) {
    throw new Error("Website media enhancement candidates must require page-context review.");
  }

  return Object.freeze({
    profile,
    intendedRole: role,
    sourceSha256: sha(value.source_sha256, "source_sha256"),
    candidateSha256: sha(value.candidate_sha256, "candidate_sha256"),
    learnedCandidate: value.learned_candidate === true,
    pageContextReviewRequired: value.page_context_review_required === true,
    requiredTools,
    visualChecks,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    finalApprovalRequired: true,
  });
}
