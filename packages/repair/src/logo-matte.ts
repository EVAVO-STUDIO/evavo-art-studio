export type RgbColour = readonly [red: number, green: number, blue: number];

export type LogoMatteRemovalOptions = Readonly<{
  matteColour?: RgbColour;
  transparentDistance?: number;
  opaqueDistance?: number;
  cropPadding?: number;
}>;

export type CornerMatteDetectionOptions = Readonly<{
  sampleRadius?: number;
  maximumCornerSpread?: number;
  minimumOpaqueCornerRatio?: number;
}>;

export type CornerMatteEstimate = Readonly<{
  schemaVersion: "evavo-logo-corner-matte-estimate-v1";
  detected: boolean;
  colour: RgbColour;
  confidence: number;
  maximumCornerSpread: number;
  opaqueCornerRatio: number;
  sampledPixelCount: number;
}>;

export type LogoMatteRemovalReport = Readonly<{
  schemaVersion: "evavo-logo-matte-removal-v1";
  width: number;
  height: number;
  matteColour: RgbColour;
  changedPixelCount: number;
  transparentPixelCount: number;
  semiTransparentPixelCount: number;
  opaquePixelCount: number;
  visibleBounds?: Readonly<{
    left: number;
    top: number;
    right: number;
    bottom: number;
  }>;
}>;

export type LogoMatteRemovalResult = Readonly<{
  rgba: Uint8ClampedArray;
  report: LogoMatteRemovalReport;
}>;

export type DetectedLogoMatteRemovalResult =
  | Readonly<{
      status: "removed";
      estimate: CornerMatteEstimate;
      result: LogoMatteRemovalResult;
    }>
  | Readonly<{
      status: "not-detected";
      estimate: CornerMatteEstimate;
      reason: string;
    }>;

export type LogoSurfaceProof = Readonly<{
  schemaVersion: "evavo-logo-surface-proof-v1";
  width: number;
  height: number;
  transparentCornerCount: number;
  visiblePixelCount: number;
  partiallyTransparentPixelCount: number;
  minimumPadding: number;
  completeVisibleBounds: boolean;
  readyForLightSurfaceReview: boolean;
  readyForDarkSurfaceReview: boolean;
}>;

export type LogoSurfaceVariantPlan = Readonly<{
  schemaVersion: "evavo-logo-surface-variant-plan-v1";
  sourceAssetId: string;
  variants: readonly Readonly<{
    id: string;
    surface: "light" | "dark";
    wordmarkColour: RgbColour;
    preserveAccentColour: true;
    transparentBackgroundRequired: true;
  }>[];
  releaseChecks: readonly string[];
}>;

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function colourDistance(red: number, green: number, blue: number, matte: RgbColour): number {
  const dr = red - matte[0];
  const dg = green - matte[1];
  const db = blue - matte[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function validateInput(rgba: Uint8ClampedArray, width: number, height: number): void {
  if (!Number.isInteger(width) || width <= 0) throw new Error("width must be a positive integer");
  if (!Number.isInteger(height) || height <= 0) throw new Error("height must be a positive integer");
  if (rgba.length !== width * height * 4) {
    throw new Error(`RGBA length ${rgba.length} does not match ${width} x ${height}`);
  }
}

function pixelOffset(x: number, y: number, width: number): number {
  return (y * width + x) * 4;
}

function cornerSampleCoordinates(
  width: number,
  height: number,
  radius: number,
): readonly Readonly<{ x: number; y: number }>[] {
  const coordinates: Array<{ x: number; y: number }> = [];
  const safeRadius = Math.max(0, Math.min(radius, Math.floor((Math.min(width, height) - 1) / 2)));
  const origins = [
    { x: 0, y: 0, dx: 1, dy: 1 },
    { x: width - 1, y: 0, dx: -1, dy: 1 },
    { x: 0, y: height - 1, dx: 1, dy: -1 },
    { x: width - 1, y: height - 1, dx: -1, dy: -1 },
  ] as const;

  for (const origin of origins) {
    for (let yStep = 0; yStep <= safeRadius; yStep += 1) {
      for (let xStep = 0; xStep <= safeRadius; xStep += 1) {
        coordinates.push({
          x: origin.x + origin.dx * xStep,
          y: origin.y + origin.dy * yStep,
        });
      }
    }
  }
  return coordinates;
}

export function estimateCornerMatteColour(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: CornerMatteDetectionOptions = {},
): CornerMatteEstimate {
  validateInput(rgba, width, height);
  const sampleRadius = Math.max(0, Math.floor(options.sampleRadius ?? 1));
  const maximumAllowedSpread = Math.max(1, options.maximumCornerSpread ?? 18);
  const minimumOpaqueCornerRatio = clamp(options.minimumOpaqueCornerRatio ?? 0.9);
  const coordinates = cornerSampleCoordinates(width, height, sampleRadius);

  let redTotal = 0;
  let greenTotal = 0;
  let blueTotal = 0;
  let opaqueCount = 0;
  const samples: Array<RgbColour> = [];

  for (const coordinate of coordinates) {
    const offset = pixelOffset(coordinate.x, coordinate.y, width);
    const alpha = rgba[offset + 3] ?? 0;
    if (alpha < 250) continue;
    const sample = [
      rgba[offset] ?? 0,
      rgba[offset + 1] ?? 0,
      rgba[offset + 2] ?? 0,
    ] as const;
    samples.push(sample);
    redTotal += sample[0];
    greenTotal += sample[1];
    blueTotal += sample[2];
    opaqueCount += 1;
  }

  const sampledPixelCount = coordinates.length;
  const opaqueCornerRatio = sampledPixelCount === 0 ? 0 : opaqueCount / sampledPixelCount;
  const colour: RgbColour = opaqueCount === 0
    ? [0, 0, 0]
    : [
        clampChannel(redTotal / opaqueCount),
        clampChannel(greenTotal / opaqueCount),
        clampChannel(blueTotal / opaqueCount),
      ];
  const maximumCornerSpread = samples.reduce(
    (maximum, sample) => Math.max(
      maximum,
      colourDistance(sample[0], sample[1], sample[2], colour),
    ),
    0,
  );
  const opacityConfidence = clamp(
    minimumOpaqueCornerRatio === 0 ? 1 : opaqueCornerRatio / minimumOpaqueCornerRatio,
  );
  const spreadConfidence = clamp(1 - maximumCornerSpread / maximumAllowedSpread);
  const confidence = Number((opacityConfidence * spreadConfidence).toFixed(3));
  const detected = opaqueCornerRatio >= minimumOpaqueCornerRatio
    && maximumCornerSpread <= maximumAllowedSpread;

  return {
    schemaVersion: "evavo-logo-corner-matte-estimate-v1",
    detected,
    colour,
    confidence,
    maximumCornerSpread: Number(maximumCornerSpread.toFixed(3)),
    opaqueCornerRatio: Number(opaqueCornerRatio.toFixed(3)),
    sampledPixelCount,
  };
}

export function removeFlatMatteFromRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: LogoMatteRemovalOptions = {},
): LogoMatteRemovalResult {
  validateInput(rgba, width, height);
  const matte = options.matteColour ?? [0, 0, 0] as const;
  const transparentDistance = options.transparentDistance ?? 10;
  const opaqueDistance = options.opaqueDistance ?? 72;
  if (transparentDistance < 0 || opaqueDistance <= transparentDistance) {
    throw new Error("opaqueDistance must be greater than transparentDistance");
  }

  const output = new Uint8ClampedArray(rgba.length);
  let changedPixelCount = 0;
  let transparentPixelCount = 0;
  let semiTransparentPixelCount = 0;
  let opaquePixelCount = 0;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let index = 0; index < rgba.length; index += 4) {
    const red = rgba[index]!;
    const green = rgba[index + 1]!;
    const blue = rgba[index + 2]!;
    const sourceAlpha = rgba[index + 3]! / 255;
    const distance = colourDistance(red, green, blue, matte);
    const matteAlpha = clamp(
      (distance - transparentDistance) / (opaqueDistance - transparentDistance),
    );
    const combinedAlpha = sourceAlpha * matteAlpha;

    let outputRed = red;
    let outputGreen = green;
    let outputBlue = blue;
    if (combinedAlpha > 0.02 && combinedAlpha < 0.999) {
      outputRed = clampChannel((red - matte[0] * (1 - combinedAlpha)) / combinedAlpha);
      outputGreen = clampChannel((green - matte[1] * (1 - combinedAlpha)) / combinedAlpha);
      outputBlue = clampChannel((blue - matte[2] * (1 - combinedAlpha)) / combinedAlpha);
    }
    const outputAlpha = clampChannel(combinedAlpha * 255);
    output[index] = outputRed;
    output[index + 1] = outputGreen;
    output[index + 2] = outputBlue;
    output[index + 3] = outputAlpha;

    if (
      outputRed !== red
      || outputGreen !== green
      || outputBlue !== blue
      || outputAlpha !== rgba[index + 3]
    ) {
      changedPixelCount += 1;
    }
    if (outputAlpha === 0) transparentPixelCount += 1;
    else if (outputAlpha === 255) opaquePixelCount += 1;
    else semiTransparentPixelCount += 1;

    if (outputAlpha > 0) {
      const currentPixelIndex = index / 4;
      const x = currentPixelIndex % width;
      const y = Math.floor(currentPixelIndex / width);
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  const padding = Math.max(0, Math.floor(options.cropPadding ?? 0));
  const visibleBounds = right < left || bottom < top
    ? undefined
    : {
        left: Math.max(0, left - padding),
        top: Math.max(0, top - padding),
        right: Math.min(width - 1, right + padding),
        bottom: Math.min(height - 1, bottom + padding),
      };

  return {
    rgba: output,
    report: {
      schemaVersion: "evavo-logo-matte-removal-v1",
      width,
      height,
      matteColour: matte,
      changedPixelCount,
      transparentPixelCount,
      semiTransparentPixelCount,
      opaquePixelCount,
      ...(visibleBounds ? { visibleBounds } : {}),
    },
  };
}

export function removeDetectedMatteFromRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  detectionOptions: CornerMatteDetectionOptions = {},
  removalOptions: Omit<LogoMatteRemovalOptions, "matteColour"> = {},
): DetectedLogoMatteRemovalResult {
  const estimate = estimateCornerMatteColour(rgba, width, height, detectionOptions);
  if (!estimate.detected) {
    return {
      status: "not-detected",
      estimate,
      reason: "The corner samples do not form a sufficiently opaque and uniform matte.",
    };
  }
  return {
    status: "removed",
    estimate,
    result: removeFlatMatteFromRgba(rgba, width, height, {
      ...removalOptions,
      matteColour: estimate.colour,
    }),
  };
}

export function inspectLogoSurfaceProof(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): LogoSurfaceProof {
  validateInput(rgba, width, height);
  const corners = [
    pixelOffset(0, 0, width),
    pixelOffset(width - 1, 0, width),
    pixelOffset(0, height - 1, width),
    pixelOffset(width - 1, height - 1, width),
  ];
  const transparentCornerCount = corners.filter((offset) => (rgba[offset + 3] ?? 0) === 0).length;

  let visiblePixelCount = 0;
  let partiallyTransparentPixelCount = 0;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let index = 0; index < rgba.length; index += 4) {
    const alpha = rgba[index + 3] ?? 0;
    if (alpha === 0) continue;
    visiblePixelCount += 1;
    if (alpha < 255) partiallyTransparentPixelCount += 1;
    const currentPixelIndex = index / 4;
    const x = currentPixelIndex % width;
    const y = Math.floor(currentPixelIndex / width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }

  const hasVisibleBounds = right >= left && bottom >= top;
  const minimumPadding = hasVisibleBounds
    ? Math.min(left, top, width - 1 - right, height - 1 - bottom)
    : 0;
  const completeVisibleBounds = hasVisibleBounds
    && left > 0
    && top > 0
    && right < width - 1
    && bottom < height - 1;
  const ready = transparentCornerCount === 4
    && visiblePixelCount > 0
    && completeVisibleBounds;

  return {
    schemaVersion: "evavo-logo-surface-proof-v1",
    width,
    height,
    transparentCornerCount,
    visiblePixelCount,
    partiallyTransparentPixelCount,
    minimumPadding,
    completeVisibleBounds,
    readyForLightSurfaceReview: ready,
    readyForDarkSurfaceReview: ready,
  };
}

export function planLogoSurfaceVariants(sourceAssetId: string): LogoSurfaceVariantPlan {
  const assetId = sourceAssetId.trim();
  if (!assetId) throw new Error("sourceAssetId is required");
  return {
    schemaVersion: "evavo-logo-surface-variant-plan-v1",
    sourceAssetId: assetId,
    variants: [
      {
        id: `${assetId}-on-light`,
        surface: "light",
        wordmarkColour: [18, 21, 19],
        preserveAccentColour: true,
        transparentBackgroundRequired: true,
      },
      {
        id: `${assetId}-on-dark`,
        surface: "dark",
        wordmarkColour: [255, 255, 255],
        preserveAccentColour: true,
        transparentBackgroundRequired: true,
      },
    ],
    releaseChecks: [
      "All four corner pixels must be transparent.",
      "Visible bounds must include the complete mark and wordmark without cropping.",
      "No source matte may remain visible on either approved surface.",
      "Accent hue and internal negative spaces must remain unchanged.",
      "Both surface variants must be visually reviewed at final placement size.",
    ],
  };
}
