import sharp from "sharp";

export type RasterEffectKind = "drop-shadow" | "outer-glow";

export interface RasterEffectSpec {
  readonly kind: RasterEffectKind;
  readonly color?: string;
  readonly opacity?: number;
  readonly blurSigma?: number;
  readonly spread?: number;
  readonly offsetX?: number;
  readonly offsetY?: number;
  readonly padding?: number;
}

export interface RasterEffectResult {
  readonly buffer: Buffer;
  readonly evidence: Readonly<{
    kind: RasterEffectKind;
    sourceWidth: number;
    sourceHeight: number;
    outputWidth: number;
    outputHeight: number;
    subjectAnchorLeft: number;
    subjectAnchorTop: number;
    color: string;
    opacity: number;
    blurSigma: number;
    spread: number;
    offsetX: number;
    offsetY: number;
    padding: number;
    operations: readonly string[];
  }>;
}

function finiteRange(
  value: number | undefined,
  label: string,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

function integerRange(
  value: number | undefined,
  label: string,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function defaultPadding(blurSigma: number, spread: number, offsetX: number, offsetY: number): number {
  return Math.max(
    1,
    Math.ceil(blurSigma * 3 + spread + Math.max(Math.abs(offsetX), Math.abs(offsetY))),
  );
}

/**
 * Build a transparent effect layer from the source alpha without changing the
 * source pixels. The result is intentionally separate from the subject so it
 * can be ordered behind the subject through composeRasterLayers.
 */
export async function createRasterEffectLayer(
  encoded: Buffer,
  spec: RasterEffectSpec,
): Promise<RasterEffectResult> {
  if (encoded.byteLength === 0) throw new Error("Raster effect input is empty.");
  if (!spec || (spec.kind !== "drop-shadow" && spec.kind !== "outer-glow")) {
    throw new Error("Raster effect kind must be drop-shadow or outer-glow.");
  }

  const source = await sharp(encoded).metadata();
  if (!source.width || !source.height) throw new Error("Raster effect input has no dimensions.");

  const opacity = finiteRange(spec.opacity, "opacity", 0, 1) ??
    (spec.kind === "drop-shadow" ? 0.5 : 0.7);
  const blurSigma = finiteRange(spec.blurSigma, "blurSigma", 0, 100) ??
    (spec.kind === "drop-shadow" ? 14 : 18);
  const spread = integerRange(spec.spread, "spread", 0, 256) ??
    (spec.kind === "drop-shadow" ? 1 : 2);
  const offsetX = integerRange(
    spec.kind === "outer-glow" ? 0 : spec.offsetX,
    "offsetX",
    -4096,
    4096,
  ) ?? (spec.kind === "drop-shadow" ? 12 : 0);
  const offsetY = integerRange(
    spec.kind === "outer-glow" ? 0 : spec.offsetY,
    "offsetY",
    -4096,
    4096,
  ) ?? (spec.kind === "drop-shadow" ? 14 : 0);
  const minimumPadding = defaultPadding(blurSigma, spread, offsetX, offsetY);
  const padding = integerRange(spec.padding, "padding", 0, 8192) ?? minimumPadding;
  if (padding < minimumPadding) {
    throw new Error(
      `padding ${padding} is too small for the requested effect; minimum safe padding is ${minimumPadding}.`,
    );
  }

  const outputWidth = source.width + padding * 2;
  const outputHeight = source.height + padding * 2;
  if (outputWidth > 32768 || outputHeight > 32768) {
    throw new Error("Raster effect output dimensions exceed the 32768 pixel safety limit.");
  }

  const anchorLeft = padding;
  const anchorTop = padding;
  const effectLeft = anchorLeft + offsetX;
  const effectTop = anchorTop + offsetY;
  if (
    effectLeft < 0 ||
    effectTop < 0 ||
    effectLeft + source.width > outputWidth ||
    effectTop + source.height > outputHeight
  ) {
    throw new Error("Raster effect offset exceeds the padded output canvas.");
  }

  const operations: string[] = ["extract-source-alpha", "create-padded-effect-canvas"];
  const sourcePng = await sharp(encoded, { failOn: "error" }).ensureAlpha().png().toBuffer();
  let mask = sharp({
    create: {
      width: outputWidth,
      height: outputHeight,
      channels: 4,
      background: "#00000000",
    },
  })
    .composite([{ input: sourcePng, left: effectLeft, top: effectTop, blend: "over" }])
    .ensureAlpha()
    .extractChannel(3);

  if (spread > 0) {
    mask = mask.dilate(spread);
    operations.push(`spread:${spread}`);
  }
  if (blurSigma > 0) {
    mask = mask.blur(blurSigma);
    operations.push(`blur:${blurSigma}`);
  }
  if (opacity < 1) {
    mask = mask.linear(opacity, 0);
    operations.push(`opacity:${opacity}`);
  }

  const alpha = await mask.png().toBuffer();
  const color = spec.color?.trim() ||
    (spec.kind === "drop-shadow" ? "#000000" : "#ff244e");
  const effect = await sharp({
    create: {
      width: outputWidth,
      height: outputHeight,
      channels: 3,
      background: color,
    },
  })
    .joinChannel(alpha)
    .png({ compressionLevel: 9 })
    .toBuffer();
  operations.push(`colorize:${color}`, "encode:png");

  return {
    buffer: effect,
    evidence: {
      kind: spec.kind,
      sourceWidth: source.width,
      sourceHeight: source.height,
      outputWidth,
      outputHeight,
      subjectAnchorLeft: anchorLeft,
      subjectAnchorTop: anchorTop,
      color,
      opacity,
      blurSigma,
      spread,
      offsetX,
      offsetY,
      padding,
      operations: Object.freeze(operations),
    },
  };
}
