import sharp from "sharp";

export type EditMaskRegion = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
  shape?: "rectangle" | "ellipse";
  padding?: number;
}>;

export interface EditMaskResult {
  readonly png: Buffer;
  readonly evidence: Readonly<{
    width: number;
    height: number;
    regions: number;
    coveredPixels: number;
    coverageRatio: number;
    operations: readonly string[];
  }>;
}

function int(value: number, label: string, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer from ${min} through ${max}.`);
  }
  return value;
}

/** Build a deterministic monochrome edit mask from simple bounded regions. */
export async function createEditMask(
  width: number,
  height: number,
  regions: readonly EditMaskRegion[],
): Promise<EditMaskResult> {
  int(width, "width", 1, 32768);
  int(height, "height", 1, 32768);
  if (!Array.isArray(regions) || regions.length < 1 || regions.length > 128) {
    throw new Error("regions must contain 1 through 128 edit regions.");
  }

  const mask = Buffer.alloc(width * height, 0);
  for (const [index, region] of regions.entries()) {
    const x = int(region.x, `regions[${index}].x`, 0, width - 1);
    const y = int(region.y, `regions[${index}].y`, 0, height - 1);
    const rw = int(region.width, `regions[${index}].width`, 1, width);
    const rh = int(region.height, `regions[${index}].height`, 1, height);
    const padding = region.padding === undefined ? 0 : int(region.padding, `regions[${index}].padding`, 0, 4096);
    const left = Math.max(0, x - padding);
    const top = Math.max(0, y - padding);
    const right = Math.min(width, x + rw + padding);
    const bottom = Math.min(height, y + rh + padding);
    const shape = region.shape ?? "rectangle";

    if (shape === "rectangle") {
      for (let yy = top; yy < bottom; yy += 1) {
        mask.fill(255, yy * width + left, yy * width + right);
      }
      continue;
    }
    if (shape !== "ellipse") throw new Error(`Unknown mask shape ${JSON.stringify(shape)}.`);
    const cx = (left + right - 1) / 2;
    const cy = (top + bottom - 1) / 2;
    const rx = Math.max(0.5, (right - left) / 2);
    const ry = Math.max(0.5, (bottom - top) / 2);
    for (let yy = top; yy < bottom; yy += 1) {
      for (let xx = left; xx < right; xx += 1) {
        const dx = (xx - cx) / rx;
        const dy = (yy - cy) / ry;
        if (dx * dx + dy * dy <= 1) mask[yy * width + xx] = 255;
      }
    }
  }

  let coveredPixels = 0;
  for (const value of mask) if (value > 0) coveredPixels += 1;
  return {
    png: await sharp(mask, { raw: { width, height, channels: 1 } }).png({ compressionLevel: 9 }).toBuffer(),
    evidence: Object.freeze({
      width,
      height,
      regions: regions.length,
      coveredPixels,
      coverageRatio: coveredPixels / (width * height),
      operations: Object.freeze(["bounded-region-validation", "mask-union", "monochrome-png"]),
    }),
  };
}
