export type RgbColour = readonly [red: number, green: number, blue: number];

export type LogoMatteRemovalOptions = Readonly<{
  matteColour?: RgbColour;
  transparentDistance?: number;
  opaqueDistance?: number;
  cropPadding?: number;
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
      const pixelIndex = index / 4;
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
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
      visibleBounds,
    },
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
