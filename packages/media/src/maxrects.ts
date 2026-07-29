import { SpriteAtlasInputError, type Rect } from "./types.js";
import { nextPowerOfTwo } from "./math.js";

export interface PackItem {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}

export interface PackPlacement extends Rect {
  readonly id: string;
}

export interface AtlasLayout {
  readonly width: number;
  readonly height: number;
  readonly placements: readonly PackPlacement[];
}

interface CandidateLayout extends AtlasLayout {
  readonly score: readonly number[];
}

function intersects(left: Rect, right: Rect): boolean {
  return !(
    right.x >= left.x + left.width ||
    right.x + right.width <= left.x ||
    right.y >= left.y + left.height ||
    right.y + right.height <= left.y
  );
}

function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function splitFreeRect(free: Rect, used: Rect): Rect[] {
  if (!intersects(free, used)) return [free];
  const result: Rect[] = [];
  if (used.x > free.x) {
    result.push({
      x: free.x,
      y: free.y,
      width: used.x - free.x,
      height: free.height,
    });
  }
  if (used.x + used.width < free.x + free.width) {
    result.push({
      x: used.x + used.width,
      y: free.y,
      width: free.x + free.width - used.x - used.width,
      height: free.height,
    });
  }
  if (used.y > free.y) {
    result.push({
      x: free.x,
      y: free.y,
      width: free.width,
      height: used.y - free.y,
    });
  }
  if (used.y + used.height < free.y + free.height) {
    result.push({
      x: free.x,
      y: used.y + used.height,
      width: free.width,
      height: free.y + free.height - used.y - used.height,
    });
  }
  return result.filter((rect) => rect.width > 0 && rect.height > 0);
}

function pruneFreeRects(rects: readonly Rect[]): Rect[] {
  return rects.filter(
    (candidate, candidateIndex) =>
      !rects.some(
        (other, otherIndex) =>
          candidateIndex !== otherIndex && contains(other, candidate),
      ),
  );
}

function compareScores(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function packAtWidth(
  items: readonly PackItem[],
  width: number,
  maximumHeight: number,
): Readonly<{
  placements: readonly PackPlacement[];
  usedWidth: number;
  usedHeight: number;
}> | null {
  let freeRects: Rect[] = [{ x: 0, y: 0, width, height: maximumHeight }];
  const placements: PackPlacement[] = [];

  for (const item of items) {
    let best:
      | Readonly<{
          free: Rect;
          score: readonly number[];
        }>
      | undefined;

    for (const free of freeRects) {
      if (item.width > free.width || item.height > free.height) continue;
      const remainingWidth = free.width - item.width;
      const remainingHeight = free.height - item.height;
      const score = [
        Math.min(remainingWidth, remainingHeight),
        Math.max(remainingWidth, remainingHeight),
        free.y,
        free.x,
      ] as const;
      if (!best || compareScores(score, best.score) < 0) {
        best = { free, score };
      }
    }

    if (!best) return null;
    const placement: PackPlacement = {
      id: item.id,
      x: best.free.x,
      y: best.free.y,
      width: item.width,
      height: item.height,
    };
    placements.push(placement);
    freeRects = pruneFreeRects(
      freeRects.flatMap((free) => splitFreeRect(free, placement)),
    );
  }

  return {
    placements,
    usedWidth: Math.max(...placements.map((placement) => placement.x + placement.width)),
    usedHeight: Math.max(...placements.map((placement) => placement.y + placement.height)),
  };
}

export function sortPackItems(items: readonly PackItem[]): PackItem[] {
  return [...items].sort(
    (left, right) =>
      Math.max(right.width, right.height) - Math.max(left.width, left.height) ||
      right.width * right.height - left.width * left.height ||
      right.height - left.height ||
      right.width - left.width ||
      left.id.localeCompare(right.id),
  );
}

export function createAtlasLayout(
  inputItems: readonly PackItem[],
  maximumWidth: number,
  maximumHeight: number,
  powerOfTwo: "required" | "preferred" | "not-required",
): AtlasLayout {
  if (powerOfTwo === "preferred") {
    try {
      return createAtlasLayout(
        inputItems,
        maximumWidth,
        maximumHeight,
        "required",
      );
    } catch (error: unknown) {
      if (
        !(error instanceof SpriteAtlasInputError) ||
        error.code !== "SPRITE_ATLAS_PACK_FAILED"
      ) {
        throw error;
      }
      return createAtlasLayout(
        inputItems,
        maximumWidth,
        maximumHeight,
        "not-required",
      );
    }
  }

  if (inputItems.length === 0) {
    throw new SpriteAtlasInputError(
      "SPRITE_ATLAS_PACK_EMPTY",
      "At least one frame is required for atlas packing.",
    );
  }
  const items = sortPackItems(inputItems);
  const minimumWidth = Math.max(...items.map((item) => item.width));
  const widths: number[] = [];
  if (powerOfTwo === "required") {
    for (
      let width = nextPowerOfTwo(minimumWidth);
      width <= maximumWidth;
      width *= 2
    ) {
      widths.push(width);
    }
  } else {
    for (let width = minimumWidth; width <= maximumWidth; width += 1) {
      widths.push(width);
    }
  }

  let best: CandidateLayout | undefined;
  for (const candidateWidth of widths) {
    const packed = packAtWidth(items, candidateWidth, maximumHeight);
    if (!packed) continue;
    const width =
      powerOfTwo === "required"
        ? nextPowerOfTwo(packed.usedWidth)
        : packed.usedWidth;
    const height =
      powerOfTwo === "required"
        ? nextPowerOfTwo(packed.usedHeight)
        : packed.usedHeight;
    if (width > maximumWidth || height > maximumHeight) continue;
    const score = [width * height, Math.max(width, height), height, width] as const;
    const candidate: CandidateLayout = {
      width,
      height,
      placements: packed.placements,
      score,
    };
    if (!best || compareScores(candidate.score, best.score) < 0) best = candidate;
  }

  if (!best) {
    throw new SpriteAtlasInputError(
      "SPRITE_ATLAS_PACK_FAILED",
      `Frames do not fit within ${maximumWidth}×${maximumHeight}.`,
    );
  }

  return {
    width: best.width,
    height: best.height,
    placements: best.placements,
  };
}
