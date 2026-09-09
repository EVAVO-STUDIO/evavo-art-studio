import sharp from "sharp";
import { reviewExistingImageQuality } from "./existing-image-quality-review.js";
import { detectExistingImageDefects } from "./existing-image-defect-detection.js";
import { segmentDefectMaskRegions } from "./defect-region-components.js";
import { planExistingImageFinishing } from "./existing-image-finishing-plan.js";
import { detectImageArtifactSignals } from "./image-artifact-signals.js";
import { detectGeneratedDetailArtifactRisk } from "./image-generated-detail-risk.js";
import { reviewWorkHeaderImage } from "./work-header-quality.js";
import { compareImageSimilarity } from "./image-similarity.js";
import {
  getImageReviewProfile,
  type ImageReviewProfileName,
} from "./image-review-profiles.js";

export interface ImageReviewContext {
  readonly intendedRole?: "work-header" | "support-image" | "tile" | "title" | "logo" | "ui" | "photo" | "sprite" | "illustration" | "texture";
  readonly declaredProfile?: ImageReviewProfileName;
  readonly filename?: string;
  readonly compareAgainst?: readonly Readonly<{ id: string; image: Buffer }>[];
}

export interface ImageReviewOrchestrationResult {
  readonly profile: ImageReviewProfileName;
  readonly profileReason: readonly string[];
  readonly quality: Awaited<ReturnType<typeof reviewExistingImageQuality>>;
  readonly defectReview: Readonly<{
    evidence: Awaited<ReturnType<typeof detectExistingImageDefects>>["evidence"];
    regions: Awaited<ReturnType<typeof segmentDefectMaskRegions>>;
  }>;
  readonly finishingPlan: ReturnType<typeof planExistingImageFinishing>;
  readonly artifactSignals: Awaited<ReturnType<typeof detectImageArtifactSignals>>;
  readonly generatedDetailRisk: Awaited<ReturnType<typeof detectGeneratedDetailArtifactRisk>>;
  readonly header?: Awaited<ReturnType<typeof reviewWorkHeaderImage>>["evidence"];
  readonly similarity: readonly Readonly<{
    id: string;
    exactBinaryMatch: boolean;
    perceptualDistance: number;
    perceptualSimilarity: number;
    nearDuplicate: boolean;
    recommendation: "distinct" | "review-similarity" | "reject-duplicate";
  }>[];
  readonly decision: "pass-to-visual-review" | "needs-finishing" | "reject";
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly visualReviewRequired: true;
  readonly visualChecklist: readonly string[];
}

function classifyByRole(role: ImageReviewContext["intendedRole"]): ImageReviewProfileName | undefined {
  switch (role) {
    case "work-header": return "web-hero";
    case "title":
    case "logo": return "logo-transparent";
    case "ui": return "ui-screenshot";
    case "photo": return "photo";
    case "sprite": return "pixel-art";
    case "illustration": return "illustration";
    case "texture": return "texture";
    default: return undefined;
  }
}

async function inferProfile(encoded: Buffer, context: ImageReviewContext): Promise<{ profile: ImageReviewProfileName; reasons: string[] }> {
  if (context.declaredProfile) return { profile: context.declaredProfile, reasons: ["explicit profile supplied"] };
  const byRole = classifyByRole(context.intendedRole);
  if (byRole) return { profile: byRole, reasons: [`intended role ${context.intendedRole} maps to ${byRole}`] };

  const meta = await sharp(encoded, { failOn: "error" }).metadata();
  const name = (context.filename ?? "").toLowerCase();
  const reasons: string[] = [];
  if (meta.hasAlpha && /logo|mark|icon|cutout|sticker/u.test(name)) {
    reasons.push("alpha channel plus filename suggests logo/cutout artwork");
    return { profile: /logo|mark/u.test(name) ? "logo-transparent" : "product-cutout", reasons };
  }
  if (/screenshot|dashboard|console|interface|(?:^|[^a-z])ui(?:[^a-z]|$)/u.test(name)) {
    reasons.push("filename suggests interface screenshot");
    return { profile: "ui-screenshot", reasons };
  }
  if (/sprite|pixel|8bit|16bit|retro/u.test(name)) {
    reasons.push("filename suggests pixel-art asset");
    return { profile: "pixel-art", reasons };
  }
  if (/cel|anime|frame/u.test(name)) {
    reasons.push("filename suggests cel animation frame");
    return { profile: "cel-animation-frame", reasons };
  }
  if (/texture|normal|roughness|metallic|albedo/u.test(name)) {
    reasons.push("filename suggests texture asset");
    return { profile: "texture", reasons };
  }
  reasons.push("no strong role/name signal; using illustration-safe general profile");
  return { profile: "illustration", reasons };
}

export async function orchestrateImageReview(
  encoded: Buffer,
  context: ImageReviewContext = {},
): Promise<ImageReviewOrchestrationResult> {
  if (encoded.byteLength === 0) throw new Error("Image review orchestration input is empty.");
  const inferred = await inferProfile(encoded, context);
  const profile = getImageReviewProfile(inferred.profile);
  const strictTransparentRgb = inferred.profile === "logo-transparent" || inferred.profile === "product-cutout";
  const [quality, defects, artifactSignals, generatedDetailRisk] = await Promise.all([
    reviewExistingImageQuality(encoded, {
      minimumSharpness: profile.minimumSharpness,
      minimumLumaStdDev: profile.minimumLumaStdDev,
      transparentRgbDetectionMode: strictTransparentRgb ? "all" : "edge-only",
      maximumTransparentRgbContaminationRatio: profile.maximumTransparentRgbContaminationRatio,
      maximumEdgeHaloRiskRatio: profile.maximumEdgeHaloRiskRatio,
      maximumPinholeRatio: profile.maximumPinholeRatio,
      maximumBlockinessRatio: profile.maximumBlockinessRatio,
    }),
    detectExistingImageDefects(encoded, { profile: inferred.profile }),
    detectImageArtifactSignals(encoded, { profile: inferred.profile }),
    detectGeneratedDetailArtifactRisk(encoded, { profile: inferred.profile }),
  ]);
  const defectRegions = await segmentDefectMaskRegions(defects.maskPng, {
    minimumPixelCount: 2,
    maximumRegions: 12,
    mergeGap: 1,
  });
  const finishingPlan = planExistingImageFinishing(defects.evidence, defectRegions, { profile: inferred.profile });
  const header = context.intendedRole === "work-header"
    ? (await reviewWorkHeaderImage(encoded)).evidence
    : undefined;
  const similarity = await Promise.all((context.compareAgainst ?? []).slice(0, 32).map(async (reference) => {
    const comparison = await compareImageSimilarity(encoded, reference.image);
    return Object.freeze({ id: reference.id, ...comparison });
  }));
  const blockers = [
    ...(quality.grade === "fail" ? quality.issues : []),
    ...(defects.evidence.suggestedAction === "manual-review" ? ["defect-mask-requires-manual-review"] : []),
    ...(finishingPlan.route === "manual-review" ? finishingPlan.reasonCodes : []),
    ...(header?.grade === "fail" ? header.issues : []),
    ...similarity.filter((item) => item.exactBinaryMatch).map((item) => `exact-duplicate-of:${item.id}`),
    ...similarity.filter((item) => !item.exactBinaryMatch && item.recommendation === "reject-duplicate").map((item) => `near-duplicate:${item.id}`),
  ];
  const warnings = [
    ...(quality.grade === "warn" ? quality.issues : []),
    ...(defects.evidence.defectPixels > 0 && defects.evidence.suggestedAction !== "manual-review" ? [`detected-defect-pixels:${defects.evidence.defectPixels}`] : []),
    ...(finishingPlan.route !== "no-op" && finishingPlan.route !== "manual-review" ? finishingPlan.reasonCodes : []),
    ...artifactSignals.warnings,
    ...generatedDetailRisk.warnings,
    ...(header?.grade === "warn" ? header.issues : []),
    ...similarity.filter((item) => item.recommendation === "review-similarity").map((item) => `review-similarity:${item.id}`),
  ];
  const decision = blockers.length > 0
    ? "reject"
    : finishingPlan.route === "no-op" && warnings.length === 0
      ? "pass-to-visual-review"
      : "needs-finishing";
  return Object.freeze({
    profile: inferred.profile,
    profileReason: Object.freeze(inferred.reasons),
    quality,
    defectReview: Object.freeze({ evidence: defects.evidence, regions: defectRegions }),
    finishingPlan,
    artifactSignals,
    generatedDetailRisk,
    ...(header ? { header } : {}),
    similarity: Object.freeze(similarity),
    decision,
    blockers: Object.freeze(blockers),
    warnings: Object.freeze(warnings),
    visualReviewRequired: true,
    visualChecklist: Object.freeze([
      ...profile.visualChecks,
      "Confirm the image is compositionally correct and appropriate for its intended role.",
      "Confirm faces, hands, text, logos and repeated structures are semantically correct where present.",
      "Confirm any repair preserves approved content rather than inventing replacement detail.",
    ]),
  });
}
