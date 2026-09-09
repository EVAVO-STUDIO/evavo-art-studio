import sharp from "sharp";

export const TEXTURE_MAP_REVIEW_CONTRACT = "evavo.texture-map-review.v1" as const;

export type TextureMapKind =
  | "base-color"
  | "normal-tangent"
  | "roughness"
  | "metallic"
  | "ambient-occlusion"
  | "height"
  | "specular"
  | "emissive"
  | "opacity"
  | "orm-packed";

export type TextureMapReviewGrade = "pass" | "warn" | "fail";

export interface TextureMapReviewSpec {
  readonly kind: TextureMapKind;
  readonly expectSeamless?: boolean;
  readonly maximumSeamError?: number;
  readonly maximumScalarColourDeviation?: number;
  readonly minimumNormalBluePositiveRatio?: number;
  readonly maximumNormalLengthError?: number;
}

export interface TextureChannelStats {
  readonly mean: number;
  readonly standardDeviation: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly lowClipRatio: number;
  readonly highClipRatio: number;
}

export interface TextureMapReviewEvidence {
  readonly contract: typeof TEXTURE_MAP_REVIEW_CONTRACT;
  readonly kind: TextureMapKind;
  readonly width: number;
  readonly height: number;
  readonly hasAlpha: boolean;
  readonly megapixels: number;
  readonly channels: Readonly<{
    r: TextureChannelStats;
    g: TextureChannelStats;
    b: TextureChannelStats;
    a: TextureChannelStats;
  }>;
  readonly scalarColourDeviation: number;
  readonly leftRightSeamError: number;
  readonly topBottomSeamError: number;
  readonly expectSeamless: boolean;
  readonly normal?: Readonly<{
    bluePositiveRatio: number;
    meanBlue: number;
    meanVectorLength: number;
    meanVectorLengthError: number;
    excessiveLengthErrorRatio: number;
  }>;
  readonly score: number;
  readonly grade: TextureMapReviewGrade;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly visualChecks: readonly string[];
}

function ratio(value: number | undefined, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }
  return value;
}

function channelStats(values: Uint8Array): TextureChannelStats {
  if (!values.length) throw new Error("Texture channel has no pixels.");
  let sum = 0;
  let sumSq = 0;
  let minimum = 255;
  let maximum = 0;
  let lowClip = 0;
  let highClip = 0;
  for (const value of values) {
    sum += value;
    sumSq += value * value;
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
    if (value <= 2) lowClip += 1;
    if (value >= 253) highClip += 1;
  }
  const mean = sum / values.length;
  return Object.freeze({
    mean,
    standardDeviation: Math.sqrt(Math.max(0, sumSq / values.length - mean * mean)),
    minimum,
    maximum,
    lowClipRatio: lowClip / values.length,
    highClipRatio: highClip / values.length,
  });
}

function offset(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

function seamError(raw: Buffer, width: number, height: number, vertical: boolean): number {
  let total = 0;
  let samples = 0;
  if (vertical) {
    for (let y = 0; y < height; y += 1) {
      const a = offset(width, 0, y);
      const b = offset(width, width - 1, y);
      total += (Math.abs(raw[a]! - raw[b]!) + Math.abs(raw[a + 1]! - raw[b + 1]!) + Math.abs(raw[a + 2]! - raw[b + 2]!)) / (255 * 3);
      samples += 1;
    }
  } else {
    for (let x = 0; x < width; x += 1) {
      const a = offset(width, x, 0);
      const b = offset(width, x, height - 1);
      total += (Math.abs(raw[a]! - raw[b]!) + Math.abs(raw[a + 1]! - raw[b + 1]!) + Math.abs(raw[a + 2]! - raw[b + 2]!)) / (255 * 3);
      samples += 1;
    }
  }
  return samples ? total / samples : 0;
}

function scalarColourDeviation(raw: Buffer): number {
  let total = 0;
  const pixels = raw.length / 4;
  for (let i = 0; i < raw.length; i += 4) {
    const r = raw[i]!;
    const g = raw[i + 1]!;
    const b = raw[i + 2]!;
    total += (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  }
  return pixels ? total / pixels : 0;
}

function normalMetrics(raw: Buffer) {
  let bluePositive = 0;
  let sumBlue = 0;
  let sumLength = 0;
  let sumLengthError = 0;
  let excessiveLengthError = 0;
  const pixels = raw.length / 4;
  for (let i = 0; i < raw.length; i += 4) {
    const x = raw[i]! / 127.5 - 1;
    const y = raw[i + 1]! / 127.5 - 1;
    const z = raw[i + 2]! / 127.5 - 1;
    const length = Math.sqrt(x * x + y * y + z * z);
    const error = Math.abs(length - 1);
    if (raw[i + 2]! >= 128) bluePositive += 1;
    sumBlue += raw[i + 2]!;
    sumLength += length;
    sumLengthError += error;
    if (error > 0.25) excessiveLengthError += 1;
  }
  const safe = pixels || 1;
  return Object.freeze({
    bluePositiveRatio: bluePositive / safe,
    meanBlue: sumBlue / safe,
    meanVectorLength: sumLength / safe,
    meanVectorLengthError: sumLengthError / safe,
    excessiveLengthErrorRatio: excessiveLengthError / safe,
  });
}

function visualChecks(kind: TextureMapKind, expectSeamless: boolean): readonly string[] {
  const checks: string[] = [];
  if (expectSeamless) {
    checks.push("Inspect a repeated 3x3 tile preview for visible horizontal/vertical seams and repeated motifs.");
  }
  if (kind === "base-color") {
    checks.push("Check that lighting, hard shadows and specular highlights are not accidentally baked into base colour unless the target shader explicitly expects them.");
    checks.push("Inspect colour balance, material identity and repeated/generated detail at intended texel density.");
  } else if (kind === "normal-tangent") {
    checks.push("Confirm this is a tangent-space normal map and verify the target engine/channel convention before changing the green channel.");
    checks.push("Inspect seams under a rotating light; valid numeric vectors can still encode the wrong surface direction.");
  } else if (kind === "orm-packed") {
    checks.push("Verify the declared channel packing matches the target shader (typically AO=R, roughness=G, metallic=B) before export.");
    checks.push("Inspect each channel independently; RGB colour appearance is meaningless for a packed data texture.");
  } else if (kind === "emissive") {
    checks.push("Check emissive regions align with the base material and do not glow from unintended compression/noise pixels.");
  } else {
    checks.push("Inspect this scalar map in grayscale and confirm bright/dark meaning matches the target shader convention.");
    checks.push("Check that generated noise/detail represents the intended material rather than merely adding visual complexity.");
  }
  return Object.freeze(checks);
}

const SCALAR_KINDS = new Set<TextureMapKind>([
  "roughness",
  "metallic",
  "ambient-occlusion",
  "height",
  "specular",
  "opacity",
]);

export async function reviewTextureMap(
  encoded: Buffer,
  spec: TextureMapReviewSpec,
): Promise<TextureMapReviewEvidence> {
  if (!encoded.byteLength) throw new Error("Texture map review input is empty.");
  if (!spec?.kind) throw new Error("Texture map kind is required.");

  const decoded = await sharp(encoded, { failOn: "error" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = decoded.info.width;
  const height = decoded.info.height;
  if (!width || !height) throw new Error("Texture map has no dimensions.");
  const meta = await sharp(encoded, { failOn: "error" }).metadata();
  const raw = Buffer.from(decoded.data);
  const count = width * height;
  const r = new Uint8Array(count);
  const g = new Uint8Array(count);
  const b = new Uint8Array(count);
  const a = new Uint8Array(count);
  for (let p = 0; p < count; p += 1) {
    const i = p * 4;
    r[p] = raw[i]!;
    g[p] = raw[i + 1]!;
    b[p] = raw[i + 2]!;
    a[p] = raw[i + 3]!;
  }

  const channels = Object.freeze({
    r: channelStats(r),
    g: channelStats(g),
    b: channelStats(b),
    a: channelStats(a),
  });
  const deviation = scalarColourDeviation(raw);
  const leftRightSeamError = seamError(raw, width, height, true);
  const topBottomSeamError = seamError(raw, width, height, false);
  const expectSeamless = spec.expectSeamless === true;
  const maximumSeamError = ratio(spec.maximumSeamError, 0.08, 0, 1, "maximumSeamError");
  const maximumScalarColourDeviation = ratio(spec.maximumScalarColourDeviation, 0.025, 0, 1, "maximumScalarColourDeviation");
  const minimumNormalBluePositiveRatio = ratio(spec.minimumNormalBluePositiveRatio, 0.8, 0, 1, "minimumNormalBluePositiveRatio");
  const maximumNormalLengthError = ratio(spec.maximumNormalLengthError, 0.2, 0, 1, "maximumNormalLengthError");
  const normal = spec.kind === "normal-tangent" ? normalMetrics(raw) : undefined;

  const blockers: string[] = [];
  const warnings: string[] = [];
  let score = 100;

  if (expectSeamless) {
    const seamMax = Math.max(leftRightSeamError, topBottomSeamError);
    if (seamMax > maximumSeamError) {
      blockers.push(`seam-error-exceeds-limit:${seamMax.toFixed(4)}>${maximumSeamError.toFixed(4)}`);
      score -= 35;
    } else if (seamMax > maximumSeamError * 0.5) {
      warnings.push(`seam-error-near-limit:${seamMax.toFixed(4)}`);
      score -= 12;
    }
  }

  if (SCALAR_KINDS.has(spec.kind)) {
    if (deviation > Math.max(0.08, maximumScalarColourDeviation * 3)) {
      blockers.push(`scalar-map-has-colour-contamination:${deviation.toFixed(4)}`);
      score -= 30;
    } else if (deviation > maximumScalarColourDeviation) {
      warnings.push(`scalar-map-channel-mismatch:${deviation.toFixed(4)}`);
      score -= 14;
    }
  }

  if (normal) {
    if (normal.bluePositiveRatio < minimumNormalBluePositiveRatio) {
      blockers.push(`normal-map-blue-positive-ratio-too-low:${normal.bluePositiveRatio.toFixed(4)}`);
      score -= 35;
    }
    if (normal.meanVectorLengthError > maximumNormalLengthError) {
      blockers.push(`normal-vector-length-error:${normal.meanVectorLengthError.toFixed(4)}`);
      score -= 28;
    } else if (normal.excessiveLengthErrorRatio > 0.1) {
      warnings.push(`normal-vector-outliers:${normal.excessiveLengthErrorRatio.toFixed(4)}`);
      score -= 12;
    }
    if (channels.a.minimum < 255) {
      warnings.push("normal-map-has-nonopaque-alpha; verify whether alpha intentionally stores another channel");
      score -= 5;
    }
  }

  if (spec.kind === "metallic") {
    const mostlyBinary = channels.r.lowClipRatio + channels.r.highClipRatio;
    if (mostlyBinary < 0.5) warnings.push("metallic-map-is-mostly-midrange; verify material convention and authored intent");
  }
  if (spec.kind === "opacity" && channels.r.lowClipRatio + channels.r.highClipRatio < 0.2) {
    warnings.push("opacity-map-is-mostly-partial; verify blend/cutout mode and sorting expectations");
  }
  if (spec.kind === "orm-packed" && channels.a.minimum < 255) {
    warnings.push("packed-orm-map-has-alpha-data; verify whether the target material uses it");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade: TextureMapReviewGrade = blockers.length || score < 70
    ? "fail"
    : warnings.length || score < 90
      ? "warn"
      : "pass";

  return Object.freeze({
    contract: TEXTURE_MAP_REVIEW_CONTRACT,
    kind: spec.kind,
    width,
    height,
    hasAlpha: meta.hasAlpha ?? false,
    megapixels: count / 1_000_000,
    channels,
    scalarColourDeviation: deviation,
    leftRightSeamError,
    topBottomSeamError,
    expectSeamless,
    ...(normal ? { normal } : {}),
    score,
    grade,
    blockers: Object.freeze(blockers),
    warnings: Object.freeze(warnings),
    visualChecks: visualChecks(spec.kind, expectSeamless),
  });
}

export async function createTextureTileProof(
  encoded: Buffer,
  maximumTileDimension = 512,
): Promise<Readonly<{ png: Buffer; evidence: Readonly<{ tileWidth: number; tileHeight: number; proofWidth: number; proofHeight: number }> }>> {
  if (!Number.isInteger(maximumTileDimension) || maximumTileDimension < 64 || maximumTileDimension > 2048) {
    throw new Error("maximumTileDimension must be an integer from 64 through 2048.");
  }
  const meta = await sharp(encoded, { failOn: "error" }).metadata();
  if (!meta.width || !meta.height) throw new Error("Texture tile proof input has no dimensions.");
  const scale = Math.min(1, maximumTileDimension / Math.max(meta.width, meta.height));
  const tileWidth = Math.max(1, Math.round(meta.width * scale));
  const tileHeight = Math.max(1, Math.round(meta.height * scale));
  const tile = await sharp(encoded, { failOn: "error" })
    .resize({ width: tileWidth, height: tileHeight, fit: "fill", kernel: "nearest" })
    .png()
    .toBuffer();
  const composites = [];
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      composites.push({ input: tile, left: column * tileWidth, top: row * tileHeight });
    }
  }
  const proofWidth = tileWidth * 3;
  const proofHeight = tileHeight * 3;
  const png = await sharp({
    create: { width: proofWidth, height: proofHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  }).composite(composites).png().toBuffer();
  return Object.freeze({
    png,
    evidence: Object.freeze({ tileWidth, tileHeight, proofWidth, proofHeight }),
  });
}
