import { createHash } from "node:crypto";

import type { RgbColour } from "./logo-matte.js";

export type LogoSurfaceProofFindingCode =
  | "LOGO_VISIBLE_BOUNDS_EMPTY"
  | "LOGO_VISIBLE_BOUNDS_CROPPED"
  | "LOGO_CORNER_OPACITY"
  | "LOGO_BORDER_MATTE_REMAINS"
  | "LOGO_EDGE_HALO_EXCESSIVE";

export type LogoSurfaceProofFinding = Readonly<{
  code: LogoSurfaceProofFindingCode;
  severity: "warning" | "blocking";
  message: string;
  evidence: Readonly<Record<string, string | number | boolean>>;
}>;

export type LogoSurfaceProofOptions = Readonly<{
  assetId: string;
  intendedSurface: "light" | "dark" | "mixed";
  matteColour?: RgbColour;
  matteDistance?: number;
  minimumPaddingPx?: number;
  maximumOpaqueCornerCount?: number;
  maximumBorderMatteShare?: number;
  maximumSemiTransparentEdgeShare?: number;
}>;

export type LogoSurfaceProofReport = Readonly<{
  schemaVersion: "evavo-logo-surface-proof-v1";
  assetId: string;
  intendedSurface: "light" | "dark" | "mixed";
  width: number;
  height: number;
  rgbaSha256: string;
  blocking: boolean;
  score: number;
  findings: readonly LogoSurfaceProofFinding[];
  metrics: Readonly<{
    transparentPixelCount: number;
    semiTransparentPixelCount: number;
    opaquePixelCount: number;
    opaqueCornerCount: number;
    borderPixelCount: number;
    borderMattePixelCount: number;
    borderMatteShare: number;
    semiTransparentEdgePixelCount: number;
    semiTransparentEdgeShare: number;
    minimumVisiblePaddingPx: number;
  }>;
  visibleBounds?: Readonly<{
    left: number;
    top: number;
    right: number;
    bottom: number;
  }>;
  readyForHumanReview: true;
  sourceMutationPerformed: false;
  brandApprovalPerformed: false;
  releaseApprovalPerformed: false;
}>;

const SURFACES = new Set(["light", "dark", "mixed"] as const);
const MAX_PIXELS = 64 * 1024 * 1024;

type DataRecord = Record<string, unknown>;

function finiteNonNegative(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a finite non-negative number`);
  }
  return value;
}

function ratio(value: unknown, label: string): number {
  const result = finiteNonNegative(value, label);
  if (result > 1) throw new TypeError(`${label} must be between 0 and 1`);
  return result;
}

function positiveInteger(value: unknown, label: string): number {
  const result = finiteNonNegative(value, label);
  if (!Number.isSafeInteger(result) || result < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return result;
}

function plainOptions(value: LogoSurfaceProofOptions): DataRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("options must be a plain data object");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("options must be a plain data object");
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new TypeError("options must not contain symbol keys");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) {
      throw new TypeError(`options.${key} must be a data property`);
    }
  }
  const allowed = new Set([
    "assetId",
    "intendedSurface",
    "matteColour",
    "matteDistance",
    "minimumPaddingPx",
    "maximumOpaqueCornerCount",
    "maximumBorderMatteShare",
    "maximumSemiTransparentEdgeShare"
  ]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new TypeError(`options contains unsupported fields: ${unknown.sort().join(", ")}`);
  }
  return value as DataRecord;
}

function parseColour(value: unknown): RgbColour {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError("matteColour must contain exactly three channels");
  }
  const channels = value.map((channel, index) => {
    if (typeof channel !== "number" || !Number.isInteger(channel) || channel < 0 || channel > 255) {
      throw new TypeError(`matteColour[${index}] must be an integer from 0 to 255`);
    }
    return channel;
  });
  return [channels[0]!, channels[1]!, channels[2]!];
}

function colourDistance(red: number, green: number, blue: number, matte: RgbColour): number {
  const dr = red - matte[0];
  const dg = green - matte[1];
  const db = blue - matte[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function isBorder(x: number, y: number, width: number, height: number): boolean {
  return x === 0 || y === 0 || x === width - 1 || y === height - 1;
}

function addFinding(
  findings: LogoSurfaceProofFinding[],
  finding: LogoSurfaceProofFinding
): void {
  findings.push(finding);
}

export function inspectLogoSurfaceProof(
  rgba: Uint8ClampedArray,
  widthValue: number,
  heightValue: number,
  optionsValue: LogoSurfaceProofOptions
): LogoSurfaceProofReport {
  if (!(rgba instanceof Uint8ClampedArray)) {
    throw new TypeError("rgba must be a Uint8ClampedArray");
  }
  const width = positiveInteger(widthValue, "width");
  const height = positiveInteger(heightValue, "height");
  if (width * height > MAX_PIXELS) throw new RangeError(`logo proof exceeds ${MAX_PIXELS} pixels`);
  if (rgba.length !== width * height * 4) {
    throw new TypeError(`RGBA length ${rgba.length} does not match ${width} x ${height}`);
  }

  const options = plainOptions(optionsValue);
  const assetId = typeof options.assetId === "string" ? options.assetId.trim() : "";
  if (!assetId || assetId.length > 256 || /[\u0000-\u001F\u007F]/u.test(assetId)) {
    throw new TypeError("assetId must be a bounded non-empty identifier");
  }
  if (!SURFACES.has(options.intendedSurface as "light" | "dark" | "mixed")) {
    throw new TypeError("intendedSurface must be light, dark or mixed");
  }
  const intendedSurface = options.intendedSurface as "light" | "dark" | "mixed";
  const matteColour = options.matteColour === undefined
    ? ([0, 0, 0] as const)
    : parseColour(options.matteColour);
  const matteDistance = options.matteDistance === undefined
    ? 18
    : finiteNonNegative(options.matteDistance, "matteDistance");
  const minimumPaddingPx = options.minimumPaddingPx === undefined
    ? 1
    : Math.floor(finiteNonNegative(options.minimumPaddingPx, "minimumPaddingPx"));
  const maximumOpaqueCornerCount = options.maximumOpaqueCornerCount === undefined
    ? 0
    : Math.floor(finiteNonNegative(options.maximumOpaqueCornerCount, "maximumOpaqueCornerCount"));
  if (maximumOpaqueCornerCount > 4) {
    throw new TypeError("maximumOpaqueCornerCount must not exceed four");
  }
  const maximumBorderMatteShare = options.maximumBorderMatteShare === undefined
    ? 0.08
    : ratio(options.maximumBorderMatteShare, "maximumBorderMatteShare");
  const maximumSemiTransparentEdgeShare = options.maximumSemiTransparentEdgeShare === undefined
    ? 0.3
    : ratio(options.maximumSemiTransparentEdgeShare, "maximumSemiTransparentEdgeShare");

  let transparentPixelCount = 0;
  let semiTransparentPixelCount = 0;
  let opaquePixelCount = 0;
  let borderPixelCount = 0;
  let borderMattePixelCount = 0;
  let semiTransparentEdgePixelCount = 0;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const index = pixel * 4;
    const red = rgba[index]!;
    const green = rgba[index + 1]!;
    const blue = rgba[index + 2]!;
    const alpha = rgba[index + 3]!;
    const x = pixel % width;
    const y = Math.floor(pixel / width);

    if (alpha === 0) transparentPixelCount += 1;
    else if (alpha === 255) opaquePixelCount += 1;
    else semiTransparentPixelCount += 1;

    if (alpha > 0) {
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }

    if (isBorder(x, y, width, height)) {
      borderPixelCount += 1;
      if (alpha > 0 && colourDistance(red, green, blue, matteColour) <= matteDistance) {
        borderMattePixelCount += 1;
      }
      if (alpha > 0 && alpha < 255) semiTransparentEdgePixelCount += 1;
    }
  }

  const cornerIndexes = [
    3,
    (width - 1) * 4 + 3,
    ((height - 1) * width) * 4 + 3,
    ((height * width) - 1) * 4 + 3
  ];
  const opaqueCornerCount = cornerIndexes.reduce(
    (count, index) => count + (rgba[index]! > 0 ? 1 : 0),
    0
  );
  const visibleBounds = right < left || bottom < top
    ? undefined
    : { left, top, right, bottom };
  const minimumVisiblePaddingPx = visibleBounds === undefined
    ? 0
    : Math.min(
      visibleBounds.left,
      visibleBounds.top,
      width - 1 - visibleBounds.right,
      height - 1 - visibleBounds.bottom
    );
  const borderMatteShare = borderPixelCount === 0 ? 0 : borderMattePixelCount / borderPixelCount;
  const semiTransparentEdgeShare = borderPixelCount === 0
    ? 0
    : semiTransparentEdgePixelCount / borderPixelCount;

  const findings: LogoSurfaceProofFinding[] = [];
  if (visibleBounds === undefined) {
    addFinding(findings, {
      code: "LOGO_VISIBLE_BOUNDS_EMPTY",
      severity: "blocking",
      message: "The repaired logo contains no visible pixels.",
      evidence: { width, height }
    });
  } else if (minimumVisiblePaddingPx < minimumPaddingPx) {
    addFinding(findings, {
      code: "LOGO_VISIBLE_BOUNDS_CROPPED",
      severity: "blocking",
      message: "Visible logo pixels touch or breach the required crop padding.",
      evidence: { minimumVisiblePaddingPx, minimumPaddingPx }
    });
  }
  if (opaqueCornerCount > maximumOpaqueCornerCount) {
    addFinding(findings, {
      code: "LOGO_CORNER_OPACITY",
      severity: "blocking",
      message: "Corner opacity indicates that an exterior matte or cropped artwork may remain.",
      evidence: { opaqueCornerCount, maximumOpaqueCornerCount }
    });
  }
  if (borderMatteShare > maximumBorderMatteShare) {
    addFinding(findings, {
      code: "LOGO_BORDER_MATTE_REMAINS",
      severity: "blocking",
      message: "Too much of the image border remains close to the declared matte colour.",
      evidence: {
        borderMatteShare: Number(borderMatteShare.toFixed(4)),
        maximumBorderMatteShare,
        borderMattePixelCount,
        borderPixelCount
      }
    });
  }
  if (semiTransparentEdgeShare > maximumSemiTransparentEdgeShare) {
    addFinding(findings, {
      code: "LOGO_EDGE_HALO_EXCESSIVE",
      severity: "warning",
      message: "The exterior edge contains an unusually large semi-transparent halo.",
      evidence: {
        semiTransparentEdgeShare: Number(semiTransparentEdgeShare.toFixed(4)),
        maximumSemiTransparentEdgeShare,
        semiTransparentEdgePixelCount,
        borderPixelCount
      }
    });
  }

  const blocking = findings.some((finding) => finding.severity === "blocking");
  const penalty = findings.reduce(
    (sum, finding) => sum + (finding.severity === "blocking" ? 30 : 10),
    0
  );
  return {
    schemaVersion: "evavo-logo-surface-proof-v1",
    assetId,
    intendedSurface,
    width,
    height,
    rgbaSha256: createHash("sha256").update(Buffer.from(rgba)).digest("hex"),
    blocking,
    score: Math.max(0, 100 - penalty),
    findings,
    metrics: {
      transparentPixelCount,
      semiTransparentPixelCount,
      opaquePixelCount,
      opaqueCornerCount,
      borderPixelCount,
      borderMattePixelCount,
      borderMatteShare: Number(borderMatteShare.toFixed(4)),
      semiTransparentEdgePixelCount,
      semiTransparentEdgeShare: Number(semiTransparentEdgeShare.toFixed(4)),
      minimumVisiblePaddingPx
    },
    ...(visibleBounds === undefined ? {} : { visibleBounds }),
    readyForHumanReview: true,
    sourceMutationPerformed: false,
    brandApprovalPerformed: false,
    releaseApprovalPerformed: false
  };
}