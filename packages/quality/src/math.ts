import type { RgbaColour } from "./types.js";

export const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export function colourDistance(left: RgbaColour, right: RgbaColour): number {
  const red = left.r - right.r;
  const green = left.g - right.g;
  const blue = left.b - right.b;
  return Math.sqrt(red * red + green * green + blue * blue);
}

export function nearestColourDistance(
  colour: RgbaColour,
  candidates: readonly RgbaColour[],
): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) nearest = Math.min(nearest, colourDistance(colour, candidate));
  return nearest;
}

export function quantizedColourKey(red: number, green: number, blue: number): string {
  return `${red >> 4}:${green >> 4}:${blue >> 4}`;
}

export function mean(values: readonly number[]): number {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

export function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
