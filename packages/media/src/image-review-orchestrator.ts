import sharp from "sharp";
import { reviewExistingImageQuality } from "./existing-image-quality-review.js";
import { reviewWorkHeaderImage } from "./work-header-quality.js";
import { compareImageSimilarity } from "./image-similarity.js";
import {
  IMAGE_REVIEW_PROFILES,
  type ImageReviewProfileName,
} from "./image-review-profiles.js";

export interface ImageReviewContext {
  readonly intendedRole?: "work-header" | "support-image" | "tile" | "logo" | "ui" | "photo" | "sprite" | "illustration" | "texture";
  readonly declaredProfile?: ImageReviewProfileName;
  readonly filename?: string;
  readonly compareAgainst?: readonly Readonly<{ id: string; image: Buffer }>[];
}

export interface ImageReviewOrchestrationResult {
  readonly profile: ImageReviewProfileName;
  readonly profileReason: readonly string[];
  readonly quality: Awaited<ReturnType<typeof reviewExistingImageQuality>>;
  readonly header?: Awaited<ReturnType<typeof reviewWorkHeaderImage>>["evidence"];
  readonly similarity: readonly Readonly<{
    id: string;
    distance: number;
    classification: string;
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

  const meta = await sharp(encoded).metadata();
  const name = (context.filename ?? "").toLowerCase();
  const reasons: string[] = [];
  if (meta.hasAlpha && /logo|mark|icon|cutout|sticker/u.test(name)) {
    reasons.push("alpha channel plus filename suggests logo/cutout artwork");
    return { profile: /logo|mark/u.test(name) ? "logo-transparent" : "product-cutout", reasons };
  }
  if (/screenshot|dashboard|console|interface|ui\b/u.test(name)) {
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
  const profile = IMAGE_REVIEW_PROFILES[inferred.profile];
  const quality = await reviewExistingImageQuality(encoded, profile.quality);
  const blockers: string[] = [];
  const warnings: string[] = [...quality.issues];

  if (quality.grade === "fail") blockers.push("technical image-quality review failed");
  if (quality.evidence?.transparentRgbContaminationRatio > (profile.quality.maximumTransparentRgbContaminationRatio ?? 1)) blockers.push("transparent RGB contamination exceeds profile limit");
  if (quality.evidence?.edgeHaloRiskRatio > (profile.quality.maximumEdgeHaloRiskRatio ?? 1)) blockers.push("edge halo risk exceeds profile limit");

  let header: Awaited<ReturnType<typeof reviewWorkHeaderImage>>["evidence"] | undefined;
  if (context.intendedRole === "work-header") {
    const headerResult = await reviewWorkHeaderImage(encoded, profile.header ?? {});
    header = headerResult.evidence;
    if (header.grade === "fail") blockers.push("work-header crop/resolution/quality review failed");
    warnings.push(...header.issues.map((issue) => `header:${issue}`));
  }

  const similarity = [];
  for (const candidate of context.compareAgainst ?? []) {
    const compared = await compareImageSimilarity(encoded, candidate.image);
    similarity.push({ id: candidate.id, distance: compared.distance, classification: compared.classification });
    if (compared.classification === "exact" || compared.classification === "near-duplicate") {
      warnings.push(`too-similar-to:${candidate.id}:${compared.classification}`);
    }
  }

  const decision = blockers.length
    ? "reject"
    : warnings.some((warning) => /halo|contamination|pinhole|block|soft|blur/u.test(warning))
      ? "needs-finishing"
      : "pass-to-visual-review";

  return Object.freeze({
    profile: inferred.profile,
    profileReason: Object.freeze(inferred.reasons),
    quality,
    ...(header ? { header } : {}),
    similarity: Object.freeze(similarity),
    decision,
    blockers: Object.freeze(blockers),
    warnings: Object.freeze([...new Set(warnings)]),
    visualReviewRequired: true,
    visualChecklist: Object.freeze([
      ...profile.visualChecklist,
      "Judge the image at intended runtime size, not only at 100% zoom.",
      "Reject imagery that is technically valid but looks cheap, generic, repetitive, semantically weak or badly art-directed.",
      "For page media, compare against adjacent imagery and avoid near-duplicate storytelling.",
      "Do not publish automatically from numeric scores; the reviewer must inspect the actual proof/crop.",
    ]),
  });
}
