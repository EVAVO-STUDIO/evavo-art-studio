export const IMAGE_REVIEW_PROFILE_NAMES = Object.freeze([
  "logo-transparent",
  "web-hero",
  "ui-screenshot",
  "product-cutout",
  "photo",
  "cel-animation-frame",
  "pixel-art",
  "texture",
  "illustration",
] as const);

export type ImageReviewProfileName = (typeof IMAGE_REVIEW_PROFILE_NAMES)[number];

export interface ImageReviewProfile {
  readonly name: ImageReviewProfileName;
  readonly minimumSharpness: number;
  readonly minimumLumaStdDev: number;
  readonly maximumTransparentRgbContaminationRatio: number;
  readonly maximumEdgeHaloRiskRatio: number;
  readonly maximumPinholeRatio: number;
  readonly maximumBlockinessRatio: number;
  readonly maximumChangedPixelRatio: number;
  readonly maximumSharpnessRegressionRatio: number;
  readonly maximumHaloRegression: number;
  readonly maximumPinholeRegression: number;
  readonly preserveOpaqueRgb: boolean;
  readonly visualChecks: readonly string[];
}

const PROFILES: Readonly<Record<ImageReviewProfileName, ImageReviewProfile>> = Object.freeze({
  "logo-transparent": Object.freeze({
    name: "logo-transparent",
    minimumSharpness: 16,
    minimumLumaStdDev: 8,
    maximumTransparentRgbContaminationRatio: 0.002,
    maximumEdgeHaloRiskRatio: 0.012,
    maximumPinholeRatio: 0.0005,
    maximumBlockinessRatio: 2.2,
    maximumChangedPixelRatio: 0.18,
    maximumSharpnessRegressionRatio: 0.04,
    maximumHaloRegression: 0,
    maximumPinholeRegression: 0,
    preserveOpaqueRgb: true,
    visualChecks: Object.freeze([
      "Inspect the full silhouette on white, black, grey, green, magenta and EVAVO cherry red.",
      "Check every letterform, logo corner, counter-space and negative-space opening for deformation.",
      "Reject white fringe, dark fringe, crunchy alpha, stair-stepping and clipped outer pixels.",
      "At intended runtime size confirm the mark still feels clean and premium, not merely mathematically valid.",
    ]),
  }),
  "web-hero": Object.freeze({
    name: "web-hero",
    minimumSharpness: 18,
    minimumLumaStdDev: 18,
    maximumTransparentRgbContaminationRatio: 0.01,
    maximumEdgeHaloRiskRatio: 0.025,
    maximumPinholeRatio: 0.001,
    maximumBlockinessRatio: 2.0,
    maximumChangedPixelRatio: 0.35,
    maximumSharpnessRegressionRatio: 0.08,
    maximumHaloRegression: 0.002,
    maximumPinholeRegression: 0.001,
    preserveOpaqueRgb: false,
    visualChecks: Object.freeze([
      "Inspect actual desktop, laptop and mobile hero crops rather than the source image in isolation.",
      "Reject weak focal hierarchy, bad crop balance, irrelevant subject matter and generic AI-looking filler.",
      "Check that important UI, faces, products, marks and text are not cropped or softened by delivery scaling.",
      "Judge premium art direction at the real page size, including whether the image competes with the page title.",
    ]),
  }),
  "ui-screenshot": Object.freeze({
    name: "ui-screenshot",
    minimumSharpness: 22,
    minimumLumaStdDev: 14,
    maximumTransparentRgbContaminationRatio: 0.01,
    maximumEdgeHaloRiskRatio: 0.02,
    maximumPinholeRatio: 0.0005,
    maximumBlockinessRatio: 1.7,
    maximumChangedPixelRatio: 0.22,
    maximumSharpnessRegressionRatio: 0.03,
    maximumHaloRegression: 0.001,
    maximumPinholeRegression: 0,
    preserveOpaqueRgb: true,
    visualChecks: Object.freeze([
      "Inspect text, icons, 1px dividers, charts and controls at 100% pixel scale.",
      "Reject invented UI labels, malformed glyphs, inconsistent spacing, moire and resampling blur.",
      "Check browser/device chrome is intentional and current rather than accidental screenshot residue.",
      "Verify any redaction or masking is clean and does not leak sensitive or irrelevant content.",
    ]),
  }),
  "product-cutout": Object.freeze({
    name: "product-cutout",
    minimumSharpness: 18,
    minimumLumaStdDev: 12,
    maximumTransparentRgbContaminationRatio: 0.003,
    maximumEdgeHaloRiskRatio: 0.012,
    maximumPinholeRatio: 0.001,
    maximumBlockinessRatio: 2.0,
    maximumChangedPixelRatio: 0.3,
    maximumSharpnessRegressionRatio: 0.06,
    maximumHaloRegression: 0,
    maximumPinholeRegression: 0,
    preserveOpaqueRgb: false,
    visualChecks: Object.freeze([
      "Inspect the complete object perimeter for white/black matte contamination and missing thin parts.",
      "Check holes, handles, spokes, straps, hair-like details and glass/translucent regions separately.",
      "Review on both light and dark hostile backgrounds and at intended card/tile size.",
      "Reject floating fragments, clipped shadows and inconsistent edge softness.",
    ]),
  }),
  photo: Object.freeze({
    name: "photo",
    minimumSharpness: 14,
    minimumLumaStdDev: 20,
    maximumTransparentRgbContaminationRatio: 0.02,
    maximumEdgeHaloRiskRatio: 0.03,
    maximumPinholeRatio: 0.001,
    maximumBlockinessRatio: 2.2,
    maximumChangedPixelRatio: 0.45,
    maximumSharpnessRegressionRatio: 0.1,
    maximumHaloRegression: 0.004,
    maximumPinholeRegression: 0.001,
    preserveOpaqueRgb: false,
    visualChecks: Object.freeze([
      "Reject waxy skin, smeared texture, oversharpened hair, halos and denoise/plastic artifacts.",
      "Inspect faces, hands, eyes, teeth, jewellery, signage and repeated backgrounds for generative defects.",
      "Check local contrast and tonal balance without crushing blacks or clipping highlights.",
      "At runtime scale confirm the image still looks photographic rather than overprocessed.",
    ]),
  }),
  "cel-animation-frame": Object.freeze({
    name: "cel-animation-frame",
    minimumSharpness: 10,
    minimumLumaStdDev: 12,
    maximumTransparentRgbContaminationRatio: 0.005,
    maximumEdgeHaloRiskRatio: 0.018,
    maximumPinholeRatio: 0.001,
    maximumBlockinessRatio: 3.0,
    maximumChangedPixelRatio: 0.3,
    maximumSharpnessRegressionRatio: 0.08,
    maximumHaloRegression: 0,
    maximumPinholeRegression: 0,
    preserveOpaqueRgb: false,
    visualChecks: Object.freeze([
      "Judge line confidence and colour-shape cleanliness rather than photographic micro-detail.",
      "Reject broken outlines, accidental colour leaks, boiling edges and inconsistent shadow shapes.",
      "When part of a sequence compare adjacent frames for volume, silhouette and character consistency.",
      "Do not penalise intentional flat fills or stylised limited detail as photographic softness.",
    ]),
  }),
  "pixel-art": Object.freeze({
    name: "pixel-art",
    minimumSharpness: 4,
    minimumLumaStdDev: 8,
    maximumTransparentRgbContaminationRatio: 0.002,
    maximumEdgeHaloRiskRatio: 0.004,
    maximumPinholeRatio: 0.0005,
    maximumBlockinessRatio: 8,
    maximumChangedPixelRatio: 0.22,
    maximumSharpnessRegressionRatio: 0,
    maximumHaloRegression: 0,
    maximumPinholeRegression: 0,
    preserveOpaqueRgb: true,
    visualChecks: Object.freeze([
      "Inspect with nearest-neighbour scaling only; never judge intentional pixels as JPEG blockiness.",
      "Reject interpolation, half-pixel blur, anti-aliased outlines and unintended palette colours.",
      "Check clusters, silhouette readability and animation anchors at native resolution.",
      "Preserve deliberate dithering and jagged period-authentic forms rather than smoothing them away.",
    ]),
  }),
  texture: Object.freeze({
    name: "texture",
    minimumSharpness: 10,
    minimumLumaStdDev: 10,
    maximumTransparentRgbContaminationRatio: 0.02,
    maximumEdgeHaloRiskRatio: 0.04,
    maximumPinholeRatio: 0.005,
    maximumBlockinessRatio: 2.5,
    maximumChangedPixelRatio: 0.5,
    maximumSharpnessRegressionRatio: 0.12,
    maximumHaloRegression: 0.005,
    maximumPinholeRegression: 0.002,
    preserveOpaqueRgb: false,
    visualChecks: Object.freeze([
      "Inspect for obvious tiling seams and repeated cloned features.",
      "Check frequency balance so detail is not smeared at one scale and noisy at another.",
      "For seamless assets inspect wrapped edges horizontally and vertically.",
      "Preserve intentional grain/dither; reject compression blocks or accidental resampling patterns.",
    ]),
  }),
  illustration: Object.freeze({
    name: "illustration",
    minimumSharpness: 10,
    minimumLumaStdDev: 12,
    maximumTransparentRgbContaminationRatio: 0.01,
    maximumEdgeHaloRiskRatio: 0.02,
    maximumPinholeRatio: 0.001,
    maximumBlockinessRatio: 2.5,
    maximumChangedPixelRatio: 0.35,
    maximumSharpnessRegressionRatio: 0.08,
    maximumHaloRegression: 0.002,
    maximumPinholeRegression: 0.001,
    preserveOpaqueRgb: false,
    visualChecks: Object.freeze([
      "Inspect shape language, line quality, local texture consistency and focal hierarchy.",
      "Reject accidental AI artifacts, nonsensical small details, malformed lettering and inconsistent perspective.",
      "Check whether cleanup has erased intended texture or introduced overly digital smoothing.",
      "Judge against the target art direction rather than photographic realism.",
    ]),
  }),
});

export function getImageReviewProfile(name: ImageReviewProfileName): ImageReviewProfile {
  const profile = PROFILES[name];
  if (!profile) throw new Error(`Unknown image review profile ${JSON.stringify(name)}.`);
  return profile;
}

export function listImageReviewProfiles(): readonly ImageReviewProfile[] {
  return Object.freeze(IMAGE_REVIEW_PROFILE_NAMES.map((name) => PROFILES[name]));
}
