import type { DecodedSpriteFrame, RgbaColour, SpriteQualityGateResult } from "./types.js";

export const pixelOffset = (width: number, x: number, y: number): number => (y * width + x) * 4;

export function colourAt(frame: DecodedSpriteFrame, x: number, y: number): RgbaColour {
  const offset = pixelOffset(frame.width, x, y);
  return {
    r: frame.data[offset]!,
    g: frame.data[offset + 1]!,
    b: frame.data[offset + 2]!,
    a: frame.data[offset + 3]!,
  };
}

export function gate(
  id: string,
  status: SpriteQualityGateResult["status"],
  blocking: boolean,
  message: string,
  evidence: Readonly<Record<string, unknown>>,
  value?: number | string | boolean,
  threshold?: number | string | boolean,
): SpriteQualityGateResult {
  return {
    id,
    status,
    blocking,
    message,
    ...(value === undefined ? {} : { value }),
    ...(threshold === undefined ? {} : { threshold }),
    evidence,
  };
}
