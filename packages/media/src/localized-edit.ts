import sharp from "sharp";

export interface LocalizedEditSpec {
  readonly featherRadius?: number;
  readonly maskThreshold?: number;
  readonly preserveOutsideMask?: boolean;
  readonly preserveOpaqueOutsideMask?: boolean;
}

export interface LocalizedEditResult {
  readonly buffer: Buffer;
  readonly evidence: Readonly<{
    width: number;
    height: number;
    totalPixels: number;
    maskPixels: number;
    maskCoverageRatio: number;
    changedPixels: number;
    changedOutsideMaskPixels: number;
    changedOpaqueOutsideMaskPixels: number;
    featherRadius: number;
    maskThreshold: number;
    preservationPassed: boolean;
    operations: readonly string[];
  }>;
}

function boundedInteger(value: number | undefined, label: string, min: number, max: number, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer from ${min} through ${max}.`);
  }
  return value;
}

async function rgba(buffer: Buffer) {
  const result = await sharp(buffer, { failOn: "error" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: Buffer.from(result.data), width: result.info.width, height: result.info.height };
}

async function maskBytes(buffer: Buffer, width: number, height: number, featherRadius: number): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  if (meta.width !== width || meta.height !== height) {
    throw new Error("Localized edit mask dimensions must exactly match the source image.");
  }
  let image = sharp(buffer, { failOn: "error" }).greyscale();
  if (featherRadius > 0) image = image.blur(featherRadius);
  const result = await image.raw().toBuffer({ resolveWithObject: true });
  return Buffer.from(result.data);
}

/**
 * Apply a candidate repair only inside an explicit mask. This function is
 * deliberately provider-agnostic: the candidate can come from Photoshop,
 * Cloudinary, ComfyUI, local inpainting, a human retoucher, or another tool.
 * Pixels outside the authorized mask are copied byte-for-byte from the source.
 */
export async function applyLocalizedRasterEdit(
  sourceEncoded: Buffer,
  candidateEncoded: Buffer,
  maskEncoded: Buffer,
  spec: LocalizedEditSpec = {},
): Promise<LocalizedEditResult> {
  if (!sourceEncoded.byteLength || !candidateEncoded.byteLength || !maskEncoded.byteLength) {
    throw new Error("Localized edit requires non-empty source, candidate and mask inputs.");
  }

  const source = await rgba(sourceEncoded);
  const candidate = await rgba(candidateEncoded);
  if (candidate.width !== source.width || candidate.height !== source.height) {
    throw new Error("Localized edit candidate dimensions must exactly match the source image.");
  }

  const featherRadius = boundedInteger(spec.featherRadius, "featherRadius", 0, 32, 2);
  const maskThreshold = boundedInteger(spec.maskThreshold, "maskThreshold", 0, 255, 8);
  const mask = await maskBytes(maskEncoded, source.width, source.height, featherRadius);
  const output = Buffer.from(source.data);

  let maskPixels = 0;
  let changedPixels = 0;
  let changedOutsideMaskPixels = 0;
  let changedOpaqueOutsideMaskPixels = 0;

  for (let p = 0; p < source.width * source.height; p += 1) {
    const i = p * 4;
    const rawMask = mask[p] ?? 0;
    const authorized = rawMask > maskThreshold;
    if (authorized) maskPixels += 1;

    if (authorized) {
      const t = rawMask / 255;
      for (let c = 0; c < 4; c += 1) {
        output[i + c] = Math.round(source.data[i + c]! * (1 - t) + candidate.data[i + c]! * t);
      }
    }

    const changed =
      output[i] !== source.data[i] ||
      output[i + 1] !== source.data[i + 1] ||
      output[i + 2] !== source.data[i + 2] ||
      output[i + 3] !== source.data[i + 3];
    if (changed) changedPixels += 1;
    if (!authorized && changed) {
      changedOutsideMaskPixels += 1;
      if (source.data[i + 3] === 255) changedOpaqueOutsideMaskPixels += 1;
    }
  }

  const preserveOutsideMask = spec.preserveOutsideMask !== false;
  const preserveOpaqueOutsideMask = spec.preserveOpaqueOutsideMask !== false;
  if (preserveOutsideMask && changedOutsideMaskPixels > 0) {
    throw new Error(`Localized edit changed ${changedOutsideMaskPixels} pixels outside the authorized mask.`);
  }
  if (preserveOpaqueOutsideMask && changedOpaqueOutsideMaskPixels > 0) {
    throw new Error(`Localized edit changed ${changedOpaqueOutsideMaskPixels} opaque pixels outside the authorized mask.`);
  }

  const buffer = await sharp(output, {
    raw: { width: source.width, height: source.height, channels: 4 },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  return {
    buffer,
    evidence: Object.freeze({
      width: source.width,
      height: source.height,
      totalPixels: source.width * source.height,
      maskPixels,
      maskCoverageRatio: maskPixels / (source.width * source.height),
      changedPixels,
      changedOutsideMaskPixels,
      changedOpaqueOutsideMaskPixels,
      featherRadius,
      maskThreshold,
      preservationPassed: changedOutsideMaskPixels === 0 && changedOpaqueOutsideMaskPixels === 0,
      operations: Object.freeze([
        "candidate-dimension-lock",
        "mask-dimension-lock",
        featherRadius > 0 ? `mask-feather:${featherRadius}` : "mask-feather:none",
        "source-preserving-mask-composite",
        "outside-mask-byte-preservation",
      ]),
    }),
  };
}
