import sharp from "sharp";

export const ENHANCEMENT_LOCAL_DETAIL_RISK_CONTRACT = "evavo.enhancement-local-detail-risk.v1" as const;

export interface EnhancementLocalDetailRiskSpec {
  readonly gridColumns?: number;
  readonly gridRows?: number;
  readonly highDetailRatio?: number;
  readonly lowDetailRatio?: number;
}

export interface EnhancementLocalDetailRiskResult {
  readonly contract: typeof ENHANCEMENT_LOCAL_DETAIL_RISK_CONTRACT;
  readonly gridColumns: number;
  readonly gridRows: number;
  readonly highDetailPatchFraction: number;
  readonly lowDetailPatchFraction: number;
  readonly maximumDetailRatio: number;
  readonly minimumDetailRatio: number;
  readonly patches: readonly Readonly<{
    column: number;
    row: number;
    sourceEdgeEnergy: number;
    candidateEdgeEnergy: number;
    detailRatio: number;
    highDetailRisk: boolean;
    lowDetailRisk: boolean;
  }>[];
  readonly reviewRequired: true;
  readonly automaticRejectionAllowed: false;
}

function integer(value: number | undefined, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer from ${min} through ${max}.`);
  return value;
}

function finite(value: number | undefined, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return value;
}

function edgeEnergy(data: Buffer, width: number, height: number, left: number, top: number, right: number, bottom: number): number {
  let sumSq = 0;
  let count = 0;
  for (let y = Math.max(top, 1); y < bottom; y += 1) {
    for (let x = Math.max(left, 1); x < right; x += 1) {
      const i = y * width + x;
      const gx = Math.abs(data[i]! - data[i - 1]!);
      const gy = Math.abs(data[i]! - data[i - width]!);
      const gradient = gx + gy;
      sumSq += gradient * gradient;
      count += 1;
    }
  }
  return count ? Math.sqrt(sumSq / count) : 0;
}

function ratio(source: number, candidate: number): number {
  if (source <= 1e-9) return candidate <= 1e-9 ? 1 : 999;
  return candidate / source;
}

async function metadata(buffer: Buffer) {
  const meta = await sharp(buffer, { failOn: "error" }).metadata();
  if (!meta.width || !meta.height) throw new Error("Enhancement local-detail review image has no dimensions.");
  return { width: meta.width, height: meta.height };
}

export async function reviewEnhancementLocalDetailRisk(
  source: Buffer,
  candidate: Buffer,
  spec: EnhancementLocalDetailRiskSpec = {},
): Promise<EnhancementLocalDetailRiskResult> {
  if (!source?.length || !candidate?.length) throw new Error("Source and candidate image buffers are required.");
  const gridColumns = integer(spec.gridColumns, 6, 2, 12, "gridColumns");
  const gridRows = integer(spec.gridRows, 6, 2, 12, "gridRows");
  const highDetailRatio = finite(spec.highDetailRatio, 2.4, 1.2, 8, "highDetailRatio");
  const lowDetailRatio = finite(spec.lowDetailRatio, 0.45, 0.05, 0.95, "lowDetailRatio");

  const [sourceMeta, candidateMeta] = await Promise.all([metadata(source), metadata(candidate)]);
  if (candidateMeta.width < sourceMeta.width || candidateMeta.height < sourceMeta.height) {
    throw new Error("Enhancement candidate cannot be smaller than source for local-detail review.");
  }

  const [baseline, candidateGray] = await Promise.all([
    sharp(source, { failOn: "error" })
      .greyscale()
      .resize(candidateMeta.width, candidateMeta.height, { fit: "fill", kernel: "lanczos3" })
      .raw()
      .toBuffer(),
    sharp(candidate, { failOn: "error" })
      .greyscale()
      .resize(candidateMeta.width, candidateMeta.height, { fit: "fill" })
      .raw()
      .toBuffer(),
  ]);

  const patches = [];
  let highCount = 0;
  let lowCount = 0;
  let maximumDetailRatio = 0;
  let minimumDetailRatio = Number.POSITIVE_INFINITY;
  for (let row = 0; row < gridRows; row += 1) {
    const top = Math.round(row * candidateMeta.height / gridRows);
    const bottom = Math.max(top + 1, Math.round((row + 1) * candidateMeta.height / gridRows));
    for (let column = 0; column < gridColumns; column += 1) {
      const left = Math.round(column * candidateMeta.width / gridColumns);
      const right = Math.max(left + 1, Math.round((column + 1) * candidateMeta.width / gridColumns));
      const sourceEdgeEnergy = edgeEnergy(baseline, candidateMeta.width, candidateMeta.height, left, top, right, bottom);
      const candidateEdgeEnergy = edgeEnergy(candidateGray, candidateMeta.width, candidateMeta.height, left, top, right, bottom);
      const detailRatio = ratio(sourceEdgeEnergy, candidateEdgeEnergy);
      const highDetailRisk = detailRatio > highDetailRatio;
      const lowDetailRisk = detailRatio < lowDetailRatio;
      if (highDetailRisk) highCount += 1;
      if (lowDetailRisk) lowCount += 1;
      maximumDetailRatio = Math.max(maximumDetailRatio, detailRatio);
      minimumDetailRatio = Math.min(minimumDetailRatio, detailRatio);
      patches.push(Object.freeze({
        column,
        row,
        sourceEdgeEnergy,
        candidateEdgeEnergy,
        detailRatio,
        highDetailRisk,
        lowDetailRisk,
      }));
    }
  }
  const total = Math.max(1, patches.length);
  return Object.freeze({
    contract: ENHANCEMENT_LOCAL_DETAIL_RISK_CONTRACT,
    gridColumns,
    gridRows,
    highDetailPatchFraction: highCount / total,
    lowDetailPatchFraction: lowCount / total,
    maximumDetailRatio,
    minimumDetailRatio: Number.isFinite(minimumDetailRatio) ? minimumDetailRatio : 1,
    patches: Object.freeze(patches),
    reviewRequired: true,
    automaticRejectionAllowed: false,
  });
}
