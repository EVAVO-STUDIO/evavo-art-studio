import sharp from "sharp";

export type HeaderQualityGrade = "pass" | "warn" | "fail";

export interface HeaderViewportSpec {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly devicePixelRatio?: number;
}

export interface WorkHeaderQualitySpec {
  readonly viewports?: readonly HeaderViewportSpec[];
  readonly minimumScore?: number;
  readonly minimumSharpness?: number;
  readonly maximumUpscaleRatio?: number;
  readonly minimumCropRetainedRatio?: number;
  readonly minimumLumaMean?: number;
  readonly maximumLumaMean?: number;
  readonly minimumLumaStdDev?: number;
}

export interface WorkHeaderQualityEvidence {
  readonly width: number;
  readonly height: number;
  readonly hasAlpha: boolean;
  readonly megapixels: number;
  readonly aspectRatio: number;
  readonly lumaMean: number;
  readonly lumaStdDev: number;
  readonly shadowClipRatio: number;
  readonly highlightClipRatio: number;
  readonly sharpness: number;
  readonly detailEnergy: number;
  readonly score: number;
  readonly grade: HeaderQualityGrade;
  readonly issues: readonly string[];
  readonly viewportEvidence: readonly Readonly<{
    name: string;
    targetWidth: number;
    targetHeight: number;
    targetAspectRatio: number;
    cropRetainedRatio: number;
    effectiveUpscaleRatio: number;
    sufficientResolution: boolean;
    cropSafe: boolean;
  }>[];
}

export interface WorkHeaderQualityResult {
  readonly evidence: WorkHeaderQualityEvidence;
  readonly proofPng: Buffer;
}

const DEFAULT_VIEWPORTS: readonly HeaderViewportSpec[] = Object.freeze([
  Object.freeze({ name: "desktop", width: 1920, height: 900, devicePixelRatio: 1 }),
  Object.freeze({ name: "laptop", width: 1440, height: 720, devicePixelRatio: 1 }),
  Object.freeze({ name: "mobile", width: 780, height: 960, devicePixelRatio: 1 }),
]);

function finite(value: number | undefined, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return value;
}

function positiveInt(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 32 || value > 16384) throw new Error(`${label} must be an integer from 32 through 16384.`);
  return value;
}

function cropRetainedRatio(sourceRatio: number, targetRatio: number): number {
  return sourceRatio >= targetRatio ? targetRatio / sourceRatio : sourceRatio / targetRatio;
}

function effectiveUpscale(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): number {
  // Cover fit must scale until both target axes are covered.
  return Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
}

async function luminanceMetrics(encoded: Buffer): Promise<{
  mean: number;
  stdDev: number;
  shadowClipRatio: number;
  highlightClipRatio: number;
  sharpness: number;
  detailEnergy: number;
}> {
  const sampled = await sharp(encoded, { failOn: "error" })
    .flatten({ background: "#000000" })
    .greyscale()
    .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const data = sampled.data;
  const width = sampled.info.width;
  const height = sampled.info.height;
  if (!width || !height || data.length === 0) throw new Error("Unable to sample header image pixels.");

  let sum = 0;
  let sumSq = 0;
  let shadow = 0;
  let highlight = 0;
  for (const value of data) {
    sum += value;
    sumSq += value * value;
    if (value <= 5) shadow += 1;
    if (value >= 250) highlight += 1;
  }
  const mean = sum / data.length;
  const variance = Math.max(0, sumSq / data.length - mean * mean);

  let gradientSum = 0;
  let gradientSq = 0;
  let gradientCount = 0;
  for (let y = 1; y < height; y += 1) {
    for (let x = 1; x < width; x += 1) {
      const i = y * width + x;
      const gx = Math.abs(data[i]! - data[i - 1]!);
      const gy = Math.abs(data[i]! - data[i - width]!);
      const g = gx + gy;
      gradientSum += g;
      gradientSq += g * g;
      gradientCount += 1;
    }
  }
  const detailEnergy = gradientCount ? gradientSum / gradientCount : 0;
  const sharpness = gradientCount ? Math.sqrt(gradientSq / gradientCount) : 0;

  return {
    mean,
    stdDev: Math.sqrt(variance),
    shadowClipRatio: shadow / data.length,
    highlightClipRatio: highlight / data.length,
    sharpness,
    detailEnergy,
  };
}

async function cropTile(encoded: Buffer, viewport: HeaderViewportSpec, labelHeight = 48): Promise<Buffer> {
  const width = 640;
  const height = Math.max(180, Math.round(width * viewport.height / viewport.width));
  const preview = await sharp(encoded, { failOn: "error" })
    .resize({ width, height, fit: "cover", position: "attention" })
    .png()
    .toBuffer();
  const label = Buffer.from(
    `<svg width="${width}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#090909"/><text x="18" y="31" font-family="Arial,sans-serif" font-size="20" fill="#ffffff">${viewport.name}  ${viewport.width}×${viewport.height}</text></svg>`,
  );
  return sharp({ create: { width, height: height + labelHeight, channels: 4, background: "#000000" } })
    .composite([{ input: preview, top: 0, left: 0 }, { input: label, top: height, left: 0 }])
    .png()
    .toBuffer();
}

/**
 * Deterministic technical/art-direction preflight for EXISTING work-page hero/header images.
 * It catches blurry/low-detail, undersized, destructive-crop and exposure failures, then emits
 * desktop/laptop/mobile cover crops that a vision-capable reviewer must inspect for semantic
 * relevance, composition and whether the image simply looks poor.
 */
export async function reviewWorkHeaderImage(
  encoded: Buffer,
  spec: WorkHeaderQualitySpec = {},
): Promise<WorkHeaderQualityResult> {
  if (encoded.byteLength === 0) throw new Error("Header review input is empty.");
  const meta = await sharp(encoded, { failOn: "error" }).metadata();
  if (!meta.width || !meta.height) throw new Error("Header review input has no dimensions.");

  const minimumScore = finite(spec.minimumScore, 76, 0, 100, "minimumScore");
  const minimumSharpness = finite(spec.minimumSharpness, 18, 0, 255, "minimumSharpness");
  const maximumUpscaleRatio = finite(spec.maximumUpscaleRatio, 1.15, 1, 8, "maximumUpscaleRatio");
  const minimumCropRetainedRatio = finite(spec.minimumCropRetainedRatio, 0.52, 0.1, 1, "minimumCropRetainedRatio");
  const minimumLumaMean = finite(spec.minimumLumaMean, 24, 0, 255, "minimumLumaMean");
  const maximumLumaMean = finite(spec.maximumLumaMean, 235, 0, 255, "maximumLumaMean");
  const minimumLumaStdDev = finite(spec.minimumLumaStdDev, 18, 0, 128, "minimumLumaStdDev");

  const viewports = (spec.viewports?.length ? spec.viewports : DEFAULT_VIEWPORTS).map((viewport) => ({
    ...viewport,
    width: positiveInt(viewport.width, `${viewport.name}.width`),
    height: positiveInt(viewport.height, `${viewport.name}.height`),
  }));
  const metrics = await luminanceMetrics(encoded);
  const sourceRatio = meta.width / meta.height;
  const issues: string[] = [];
  let score = 100;

  if (metrics.sharpness < minimumSharpness) {
    issues.push(`blurry-or-soft:${metrics.sharpness.toFixed(1)}<${minimumSharpness.toFixed(1)}`);
    score -= 30;
  }
  if (metrics.detailEnergy < 7) {
    issues.push(`very-low-detail:${metrics.detailEnergy.toFixed(1)}`);
    score -= 16;
  }
  if (metrics.mean < minimumLumaMean) {
    issues.push(`too-dark:${metrics.mean.toFixed(1)}`);
    score -= 14;
  }
  if (metrics.mean > maximumLumaMean) {
    issues.push(`too-bright:${metrics.mean.toFixed(1)}`);
    score -= 14;
  }
  if (metrics.stdDev < minimumLumaStdDev) {
    issues.push(`flat-low-contrast:${metrics.stdDev.toFixed(1)}`);
    score -= 10;
  }
  if (metrics.shadowClipRatio > 0.35) {
    issues.push(`heavy-shadow-clipping:${(metrics.shadowClipRatio * 100).toFixed(1)}%`);
    score -= 8;
  }
  if (metrics.highlightClipRatio > 0.2) {
    issues.push(`heavy-highlight-clipping:${(metrics.highlightClipRatio * 100).toFixed(1)}%`);
    score -= 8;
  }

  const viewportEvidence = viewports.map((viewport) => {
    const dpr = finite(viewport.devicePixelRatio, 1, 0.5, 4, `${viewport.name}.devicePixelRatio`);
    const targetWidth = viewport.width * dpr;
    const targetHeight = viewport.height * dpr;
    const crop = cropRetainedRatio(sourceRatio, viewport.width / viewport.height);
    const upscale = effectiveUpscale(meta.width!, meta.height!, targetWidth, targetHeight);
    const sufficientResolution = upscale <= maximumUpscaleRatio;
    const cropSafe = crop >= minimumCropRetainedRatio;
    if (!sufficientResolution) {
      issues.push(`undersized-for-${viewport.name}:${upscale.toFixed(2)}x-upscale`);
      score -= 18;
    }
    if (!cropSafe) {
      issues.push(`destructive-${viewport.name}-crop:${(crop * 100).toFixed(1)}%-retained`);
      score -= 12;
    }
    return Object.freeze({
      name: viewport.name,
      targetWidth,
      targetHeight,
      targetAspectRatio: viewport.width / viewport.height,
      cropRetainedRatio: crop,
      effectiveUpscaleRatio: upscale,
      sufficientResolution,
      cropSafe,
    });
  });

  score = Math.max(0, Math.min(100, Math.round(score)));
  const hardFailure = issues.some((issue) =>
    issue.startsWith("blurry-or-soft") || issue.startsWith("undersized-for-") || issue.startsWith("destructive-")
  );
  const grade: HeaderQualityGrade = hardFailure || score < minimumScore ? "fail" : score < 86 || issues.length ? "warn" : "pass";

  const tiles = await Promise.all(viewports.map((viewport) => cropTile(encoded, viewport)));
  const tileMeta = await Promise.all(tiles.map((tile) => sharp(tile).metadata()));
  const proofWidth = 640;
  const gap = 16;
  const proofHeight = tileMeta.reduce((sum, item) => sum + (item.height ?? 0), 0) + gap * (tiles.length - 1);
  let top = 0;
  const composites: sharp.OverlayOptions[] = [];
  for (let i = 0; i < tiles.length; i += 1) {
    composites.push({ input: tiles[i], left: 0, top });
    top += (tileMeta[i]!.height ?? 0) + gap;
  }
  const proofPng = await sharp({ create: { width: proofWidth, height: proofHeight, channels: 4, background: "#111111" } })
    .composite(composites)
    .png()
    .toBuffer();

  return {
    evidence: Object.freeze({
      width: meta.width,
      height: meta.height,
      hasAlpha: meta.hasAlpha ?? false,
      megapixels: (meta.width * meta.height) / 1_000_000,
      aspectRatio: sourceRatio,
      lumaMean: metrics.mean,
      lumaStdDev: metrics.stdDev,
      shadowClipRatio: metrics.shadowClipRatio,
      highlightClipRatio: metrics.highlightClipRatio,
      sharpness: metrics.sharpness,
      detailEnergy: metrics.detailEnergy,
      score,
      grade,
      issues: Object.freeze(issues),
      viewportEvidence: Object.freeze(viewportEvidence),
    }),
    proofPng,
  };
}
