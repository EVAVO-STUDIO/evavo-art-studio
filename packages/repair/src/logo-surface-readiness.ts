import type { RgbColour } from "./logo-matte.js";

export type LogoSurfaceReadinessOptions = Readonly<{
  matteColour?: RgbColour;
  alphaThreshold?: number;
  minimumTransparentPadding?: number;
  residualMatteDistance?: number;
  maximumResidualMatteRatio?: number;
}>;

export type LogoSurfaceReadinessFindingCode =
  | "NO_TRANSPARENCY"
  | "OPAQUE_CORNER"
  | "VISIBLE_BOUNDS_CLIPPED"
  | "TRANSPARENT_PADDING_INSUFFICIENT"
  | "RESIDUAL_MATTE_FRINGE";

export type LogoSurfaceReadinessFinding = Readonly<{
  id: string;
  severity: "warning" | "blocking";
  code: LogoSurfaceReadinessFindingCode;
  summary: string;
  remediation: string;
  evidence: Readonly<Record<string, string | number | boolean>>;
}>;

export type LogoSurfaceReadinessReport = Readonly<{
  schemaVersion: "evavo-logo-surface-readiness-v1";
  width: number;
  height: number;
  readyForSurfaceUse: boolean;
  blocking: boolean;
  readyForHumanReview: true;
  sourceMutationPerformed: false;
  repairPerformed: false;
  findings: readonly LogoSurfaceReadinessFinding[];
  metrics: Readonly<{
    transparentPixelCount: number;
    semiTransparentPixelCount: number;
    opaquePixelCount: number;
    cornerOpaqueCount: number;
    residualMattePixelCount: number;
    residualMatteRatio: number;
    minimumObservedPadding: number;
    visibleBounds?: Readonly<{
      left: number;
      top: number;
      right: number;
      bottom: number;
      paddingLeft: number;
      paddingTop: number;
      paddingRight: number;
      paddingBottom: number;
    }>;
  }>;
}>;

function validateInput(rgba: Uint8ClampedArray, width: number, height: number): void {
  if (!Number.isInteger(width) || width <= 0) throw new Error("width must be a positive integer");
  if (!Number.isInteger(height) || height <= 0) throw new Error("height must be a positive integer");
  if (rgba.length !== width * height * 4) {
    throw new Error(`RGBA length ${rgba.length} does not match ${width} x ${height}`);
  }
}

function validateOptions(options: LogoSurfaceReadinessOptions): void {
  if (options.alphaThreshold !== undefined && (!Number.isInteger(options.alphaThreshold) || options.alphaThreshold < 0 || options.alphaThreshold > 254)) {
    throw new Error("alphaThreshold must be an integer between 0 and 254");
  }
  if (options.minimumTransparentPadding !== undefined && (!Number.isInteger(options.minimumTransparentPadding) || options.minimumTransparentPadding < 0)) {
    throw new Error("minimumTransparentPadding must be a non-negative integer");
  }
  if (options.residualMatteDistance !== undefined && (!Number.isFinite(options.residualMatteDistance) || options.residualMatteDistance < 0)) {
    throw new Error("residualMatteDistance must be a finite non-negative number");
  }
  if (options.maximumResidualMatteRatio !== undefined && (!Number.isFinite(options.maximumResidualMatteRatio) || options.maximumResidualMatteRatio < 0 || options.maximumResidualMatteRatio > 1)) {
    throw new Error("maximumResidualMatteRatio must be between 0 and 1");
  }
}

function colourDistance(red: number, green: number, blue: number, matte: RgbColour): number {
  const dr = red - matte[0];
  const dg = green - matte[1];
  const db = blue - matte[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function stableFindingId(code: LogoSurfaceReadinessFindingCode, ordinal: number): string {
  const source = `${code}|${ordinal}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${code.toLowerCase().replaceAll("_", "-")}-${hash.toString(16).padStart(8, "0")}`;
}

function addFinding(
  findings: LogoSurfaceReadinessFinding[],
  finding: Omit<LogoSurfaceReadinessFinding, "id">,
): void {
  findings.push({
    id: stableFindingId(finding.code, findings.length),
    ...finding,
  });
}

export function inspectLogoSurfaceReadiness(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: LogoSurfaceReadinessOptions = {},
): LogoSurfaceReadinessReport {
  validateInput(rgba, width, height);
  validateOptions(options);
  const matte = options.matteColour ?? [0, 0, 0] as const;
  const alphaThreshold = options.alphaThreshold ?? 8;
  const minimumTransparentPadding = options.minimumTransparentPadding ?? 2;
  const residualMatteDistance = options.residualMatteDistance ?? 22;
  const maximumResidualMatteRatio = options.maximumResidualMatteRatio ?? 0.02;
  const findings: LogoSurfaceReadinessFinding[] = [];

  let transparentPixelCount = 0;
  let semiTransparentPixelCount = 0;
  let opaquePixelCount = 0;
  let residualMattePixelCount = 0;
  let visiblePixelCount = 0;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  const corners = new Set([0, width - 1, (height - 1) * width, height * width - 1]);
  let cornerOpaqueCount = 0;

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    const red = rgba[offset]!;
    const green = rgba[offset + 1]!;
    const blue = rgba[offset + 2]!;
    const alpha = rgba[offset + 3]!;
    if (alpha === 0) transparentPixelCount += 1;
    else if (alpha === 255) opaquePixelCount += 1;
    else semiTransparentPixelCount += 1;
    if (corners.has(pixel) && alpha > alphaThreshold) cornerOpaqueCount += 1;
    if (alpha > alphaThreshold) {
      visiblePixelCount += 1;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      if (alpha < 255 && colourDistance(red, green, blue, matte) <= residualMatteDistance) {
        residualMattePixelCount += 1;
      }
    }
  }

  const hasVisibleBounds = right >= left && bottom >= top;
  const visibleBounds = hasVisibleBounds
    ? {
        left,
        top,
        right,
        bottom,
        paddingLeft: left,
        paddingTop: top,
        paddingRight: width - 1 - right,
        paddingBottom: height - 1 - bottom,
      }
    : undefined;
  const minimumObservedPadding = visibleBounds
    ? Math.min(visibleBounds.paddingLeft, visibleBounds.paddingTop, visibleBounds.paddingRight, visibleBounds.paddingBottom)
    : 0;
  const residualMatteRatio = visiblePixelCount === 0 ? 0 : residualMattePixelCount / visiblePixelCount;

  if (transparentPixelCount === 0) {
    addFinding(findings, {
      severity: "blocking",
      code: "NO_TRANSPARENCY",
      summary: "The logo asset contains no transparent pixels.",
      remediation: "Export a genuine transparent logo master instead of placing a surface-coloured rectangle behind the mark.",
      evidence: { transparentPixelCount },
    });
  }
  if (cornerOpaqueCount > 0) {
    addFinding(findings, {
      severity: "blocking",
      code: "OPAQUE_CORNER",
      summary: "One or more logo-canvas corners contain visible pixels.",
      remediation: "Remove the baked background or expand the transparent canvas, then re-check all four corners.",
      evidence: { cornerOpaqueCount },
    });
  }
  if (!visibleBounds || minimumObservedPadding === 0) {
    addFinding(findings, {
      severity: "blocking",
      code: "VISIBLE_BOUNDS_CLIPPED",
      summary: visibleBounds
        ? "Visible artwork touches the canvas edge and may be cropped."
        : "The asset contains no visible artwork above the configured alpha threshold.",
      remediation: "Restore the complete mark and wordmark on a larger transparent canvas before release.",
      evidence: { visibleArtworkPresent: Boolean(visibleBounds), minimumObservedPadding },
    });
  } else if (minimumObservedPadding < minimumTransparentPadding) {
    addFinding(findings, {
      severity: "warning",
      code: "TRANSPARENT_PADDING_INSUFFICIENT",
      summary: "Transparent padding around the visible logo is below the configured threshold.",
      remediation: "Increase the transparent canvas padding so the complete lock-up can be placed without accidental cropping.",
      evidence: { minimumObservedPadding, minimumTransparentPadding },
    });
  }
  if (residualMatteRatio > maximumResidualMatteRatio) {
    addFinding(findings, {
      severity: residualMatteRatio > maximumResidualMatteRatio * 4 ? "blocking" : "warning",
      code: "RESIDUAL_MATTE_FRINGE",
      summary: "Semi-transparent edge pixels retain too much of the removed matte colour.",
      remediation: "Reconstruct or decontaminate the edge colour against transparency and inspect the result on both light and dark surfaces.",
      evidence: {
        residualMattePixelCount,
        residualMatteRatio: Number(residualMatteRatio.toFixed(4)),
        maximumResidualMatteRatio,
      },
    });
  }

  const blocking = findings.some((finding) => finding.severity === "blocking");
  return {
    schemaVersion: "evavo-logo-surface-readiness-v1",
    width,
    height,
    readyForSurfaceUse: !blocking && findings.length === 0,
    blocking,
    readyForHumanReview: true,
    sourceMutationPerformed: false,
    repairPerformed: false,
    findings,
    metrics: {
      transparentPixelCount,
      semiTransparentPixelCount,
      opaquePixelCount,
      cornerOpaqueCount,
      residualMattePixelCount,
      residualMatteRatio: Number(residualMatteRatio.toFixed(4)),
      minimumObservedPadding,
      ...(visibleBounds ? { visibleBounds } : {}),
    },
  };
}
