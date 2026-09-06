import sharp from "sharp";

export const DEFECT_REGION_COMPONENTS_CONTRACT = "evavo.defect-region-components.v1" as const;

export interface DefectRegionComponentSpec {
  readonly minimumPixelCount?: number;
  readonly maximumRegions?: number;
  readonly mergeGap?: number;
}

export interface DefectRegionComponent {
  readonly id: string;
  readonly pixelCount: number;
  readonly pixelRatio: number;
  readonly bounds: Readonly<{ left: number; top: number; right: number; bottom: number; width: number; height: number }>;
  readonly centroid: Readonly<{ x: number; y: number }>;
  readonly density: number;
  readonly touchesCanvasEdge: boolean;
  readonly rank: number;
}

export interface DefectRegionComponentsResult {
  readonly contract: typeof DEFECT_REGION_COMPONENTS_CONTRACT;
  readonly width: number;
  readonly height: number;
  readonly foregroundPixels: number;
  readonly componentCount: number;
  readonly retainedComponentCount: number;
  readonly ignoredSmallComponentPixels: number;
  readonly regions: readonly DefectRegionComponent[];
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer from ${min} through ${max}.`);
  return value;
}

function intersectsOrNear(a: { left: number; top: number; right: number; bottom: number }, b: { left: number; top: number; right: number; bottom: number }, gap: number): boolean {
  return a.left <= b.right + gap && a.right + gap >= b.left && a.top <= b.bottom + gap && a.bottom + gap >= b.top;
}

function mergeRegions(regions: Array<{ pixels: number[]; left: number; top: number; right: number; bottom: number }>, width: number, gap: number) {
  if (gap <= 0 || regions.length < 2) return regions;
  const pending = [...regions];
  const merged: typeof regions = [];
  while (pending.length) {
    const base = pending.shift()!;
    let changed = true;
    while (changed) {
      changed = false;
      for (let index = pending.length - 1; index >= 0; index -= 1) {
        const candidate = pending[index]!;
        if (!intersectsOrNear(base, candidate, gap)) continue;
        base.pixels.push(...candidate.pixels);
        base.left = Math.min(base.left, candidate.left);
        base.top = Math.min(base.top, candidate.top);
        base.right = Math.max(base.right, candidate.right);
        base.bottom = Math.max(base.bottom, candidate.bottom);
        pending.splice(index, 1);
        changed = true;
      }
    }
    merged.push(base);
  }
  return merged;
}

/** Segment a binary/greyscale defect mask into ranked review regions. */
export async function segmentDefectMaskRegions(maskEncoded: Buffer, spec: DefectRegionComponentSpec = {}): Promise<DefectRegionComponentsResult> {
  if (!Buffer.isBuffer(maskEncoded) || maskEncoded.length === 0) throw new Error("Defect mask input is empty.");
  const minimumPixelCount = boundedInteger(spec.minimumPixelCount, 2, 1, 1_000_000, "minimumPixelCount");
  const maximumRegions = boundedInteger(spec.maximumRegions, 12, 1, 128, "maximumRegions");
  const mergeGap = boundedInteger(spec.mergeGap, 1, 0, 64, "mergeGap");

  const decoded = await sharp(maskEncoded, { failOn: "error" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const width = decoded.info.width;
  const height = decoded.info.height;
  if (!width || !height) throw new Error("Defect mask has no dimensions.");
  const data = decoded.data;
  const total = width * height;
  const foreground = new Uint8Array(total);
  let foregroundPixels = 0;
  for (let index = 0; index < total; index += 1) {
    if (data[index]! >= 128) {
      foreground[index] = 1;
      foregroundPixels += 1;
    }
  }

  const visited = new Uint8Array(total);
  const components: Array<{ pixels: number[]; left: number; top: number; right: number; bottom: number }> = [];
  const queue = new Int32Array(Math.max(1, total));
  for (let start = 0; start < total; start += 1) {
    if (!foreground[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    const pixels: number[] = [];
    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;

    while (head < tail) {
      const current = queue[head++]!;
      pixels.push(current);
      const y = Math.floor(current / width);
      const x = current - y * width;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy += 1) {
        for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx += 1) {
          if (xx === x && yy === y) continue;
          const neighbour = yy * width + xx;
          if (!foreground[neighbour] || visited[neighbour]) continue;
          visited[neighbour] = 1;
          queue[tail++] = neighbour;
        }
      }
    }
    components.push({ pixels, left, top, right, bottom });
  }

  const merged = mergeRegions(components, width, mergeGap);
  let ignoredSmallComponentPixels = 0;
  const retained = merged.filter((component) => {
    if (component.pixels.length >= minimumPixelCount) return true;
    ignoredSmallComponentPixels += component.pixels.length;
    return false;
  });

  const ranked = retained.map((component) => {
    const boxWidth = component.right - component.left + 1;
    const boxHeight = component.bottom - component.top + 1;
    let xSum = 0;
    let ySum = 0;
    for (const p of component.pixels) {
      const y = Math.floor(p / width);
      const x = p - y * width;
      xSum += x;
      ySum += y;
    }
    const density = component.pixels.length / (boxWidth * boxHeight);
    return {
      component,
      score: component.pixels.length * (0.75 + density * 0.25),
      region: {
        id: "",
        pixelCount: component.pixels.length,
        pixelRatio: component.pixels.length / total,
        bounds: Object.freeze({ left: component.left, top: component.top, right: component.right, bottom: component.bottom, width: boxWidth, height: boxHeight }),
        centroid: Object.freeze({ x: xSum / component.pixels.length, y: ySum / component.pixels.length }),
        density,
        touchesCanvasEdge: component.left === 0 || component.top === 0 || component.right === width - 1 || component.bottom === height - 1,
        rank: 0,
      },
    };
  }).sort((a, b) => b.score - a.score || b.region.pixelCount - a.region.pixelCount || a.region.bounds.top - b.region.bounds.top || a.region.bounds.left - b.region.bounds.left);

  const regions = ranked.slice(0, maximumRegions).map((entry, index) => Object.freeze({ ...entry.region, id: `region-${String(index + 1).padStart(2, "0")}`, rank: index + 1 }));

  return Object.freeze({
    contract: DEFECT_REGION_COMPONENTS_CONTRACT,
    width,
    height,
    foregroundPixels,
    componentCount: components.length,
    retainedComponentCount: retained.length,
    ignoredSmallComponentPixels,
    regions: Object.freeze(regions),
  });
}
