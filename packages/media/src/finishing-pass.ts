import sharp, { type ResizeOptions } from "sharp";

export type RasterFinishFormat = "png" | "webp" | "avif" | "jpeg";

export interface RasterFinishSpec {
  readonly ensureAlpha?: boolean;
  readonly trim?: Readonly<{ threshold?: number; padding?: number }>;
  readonly mask?: Buffer;
  readonly modulate?: Readonly<{
    brightness?: number;
    saturation?: number;
    hue?: number;
    lightness?: number;
  }>;
  readonly normalize?: boolean;
  readonly gamma?: number;
  readonly blur?: number;
  readonly sharpen?: Readonly<{ sigma?: number }>;
  readonly resize?: Readonly<{
    width?: number;
    height?: number;
    fit?: ResizeOptions["fit"];
    position?: ResizeOptions["position"];
    withoutEnlargement?: boolean;
  }>;
  readonly padding?: Readonly<{
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
    background?: string;
  }>;
  readonly flatten?: Readonly<{ background: string }>;
  readonly format?: RasterFinishFormat;
  readonly quality?: number;
}

export interface RasterFinishResult {
  readonly buffer: Buffer;
  readonly evidence: Readonly<{
    sourceWidth: number;
    sourceHeight: number;
    sourceHasAlpha: boolean;
    outputWidth: number;
    outputHeight: number;
    outputHasAlpha: boolean;
    format: RasterFinishFormat;
    operations: readonly string[];
  }>;
}

function positiveInteger(value: number | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1 || value > 32768) {
    throw new Error(`${label} must be an integer from 1 through 32768.`);
  }
  return value;
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

function paddingValue(value: number | undefined, label: string): number {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || value < 0 || value > 8192) {
    throw new Error(`${label} must be an integer from 0 through 8192.`);
  }
  return value;
}

function outputFormat(spec: RasterFinishSpec): RasterFinishFormat {
  return spec.format ?? "png";
}

/**
 * A deterministic final-art pass for raster assets. It intentionally accepts a
 * matte/mask from any upstream segmentation provider so background removal is
 * provider-agnostic while all cleanup, alpha, tone, resize and delivery work
 * stays local and repeatable.
 */
export async function finishRasterAsset(
  encoded: Buffer,
  spec: RasterFinishSpec = {},
): Promise<RasterFinishResult> {
  if (encoded.byteLength === 0) throw new Error("Raster finishing input is empty.");

  const source = await sharp(encoded).metadata();
  if (!source.width || !source.height) throw new Error("Raster finishing input has no dimensions.");

  const operations: string[] = [];
  let image = sharp(encoded, { failOn: "error" });

  if (spec.ensureAlpha ?? true) {
    image = image.ensureAlpha();
    operations.push("ensure-alpha");
  }

  if (spec.mask) {
    const maskMeta = await sharp(spec.mask).metadata();
    if (maskMeta.width !== source.width || maskMeta.height !== source.height) {
      throw new Error("Raster finishing mask dimensions must exactly match the source image.");
    }
    const mask = await sharp(spec.mask).ensureAlpha().extractChannel(3).png().toBuffer();
    image = image.composite([{ input: mask, blend: "dest-in" }]);
    operations.push("apply-alpha-mask");
  }

  if (spec.trim) {
    const threshold = finiteRange(spec.trim.threshold, "trim.threshold", 0, 255) ?? 10;
    image = image.trim({ threshold });
    operations.push(`trim:${threshold}`);
  }

  if (spec.modulate) {
    const brightness = finiteRange(spec.modulate.brightness, "modulate.brightness", 0.1, 10);
    const saturation = finiteRange(spec.modulate.saturation, "modulate.saturation", 0, 10);
    const hue = finiteRange(spec.modulate.hue, "modulate.hue", -360, 360);
    const lightness = finiteRange(spec.modulate.lightness, "modulate.lightness", -100, 100);
    image = image.modulate({
      ...(brightness === undefined ? {} : { brightness }),
      ...(saturation === undefined ? {} : { saturation }),
      ...(hue === undefined ? {} : { hue }),
      ...(lightness === undefined ? {} : { lightness }),
    });
    operations.push("modulate");
  }

  if (spec.normalize) {
    image = image.normalize();
    operations.push("normalize");
  }

  if (spec.gamma !== undefined) {
    const gamma = finiteRange(spec.gamma, "gamma", 1, 3)!;
    image = image.gamma(gamma);
    operations.push(`gamma:${gamma}`);
  }

  if (spec.blur !== undefined) {
    const blur = finiteRange(spec.blur, "blur", 0.3, 1000)!;
    image = image.blur(blur);
    operations.push(`blur:${blur}`);
  }

  if (spec.sharpen) {
    const sigma = finiteRange(spec.sharpen.sigma, "sharpen.sigma", 0.000001, 10000) ?? 1;
    image = image.sharpen({ sigma });
    operations.push(`sharpen:${sigma}`);
  }

  if (spec.resize) {
    const width = positiveInteger(spec.resize.width, "resize.width");
    const height = positiveInteger(spec.resize.height, "resize.height");
    if (width === undefined && height === undefined) {
      throw new Error("resize requires width or height.");
    }
    image = image.resize({
      ...(width === undefined ? {} : { width }),
      ...(height === undefined ? {} : { height }),
      ...(spec.resize.fit === undefined ? {} : { fit: spec.resize.fit }),
      ...(spec.resize.position === undefined ? {} : { position: spec.resize.position }),
      withoutEnlargement: spec.resize.withoutEnlargement ?? false,
    });
    operations.push("resize");
  }

  const trimPadding = spec.trim?.padding ?? 0;
  const top = paddingValue(spec.padding?.top ?? trimPadding, "padding.top");
  const right = paddingValue(spec.padding?.right ?? trimPadding, "padding.right");
  const bottom = paddingValue(spec.padding?.bottom ?? trimPadding, "padding.bottom");
  const left = paddingValue(spec.padding?.left ?? trimPadding, "padding.left");
  if (top || right || bottom || left) {
    image = image.extend({
      top,
      right,
      bottom,
      left,
      background: spec.padding?.background ?? "#00000000",
    });
    operations.push("pad");
  }

  if (spec.flatten) {
    image = image.flatten({ background: spec.flatten.background });
    operations.push("flatten");
  }

  const format = outputFormat(spec);
  const quality = finiteRange(spec.quality, "quality", 1, 100);
  if (format === "png") image = image.png({ compressionLevel: 9 });
  if (format === "webp") image = image.webp({ quality: quality ?? 90, smartSubsample: true });
  if (format === "avif") image = image.avif({ quality: quality ?? 85 });
  if (format === "jpeg") image = image.jpeg({ quality: quality ?? 92, mozjpeg: true });
  operations.push(`encode:${format}`);

  const finished = await image.toBuffer({ resolveWithObject: true });
  return {
    buffer: finished.data,
    evidence: {
      sourceWidth: source.width,
      sourceHeight: source.height,
      sourceHasAlpha: source.hasAlpha ?? false,
      outputWidth: finished.info.width,
      outputHeight: finished.info.height,
      outputHasAlpha: finished.info.channels === 4,
      format,
      operations: Object.freeze(operations),
    },
  };
}
