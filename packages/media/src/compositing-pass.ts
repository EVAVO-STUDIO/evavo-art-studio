import sharp, {
  type OverlayOptions,
  type ResizeOptions,
} from "sharp";

export type RasterCompositeFormat = "png" | "webp" | "avif" | "jpeg";

export interface RasterCompositeLayerSpec {
  readonly input: Buffer;
  readonly name?: string;
  readonly mask?: Buffer;
  readonly opacity?: number;
  readonly blend?: OverlayOptions["blend"];
  readonly left?: number;
  readonly top?: number;
  readonly gravity?: OverlayOptions["gravity"];
  readonly rotate?: number;
  readonly resize?: Readonly<{
    width?: number;
    height?: number;
    fit?: ResizeOptions["fit"];
    position?: ResizeOptions["position"];
    withoutEnlargement?: boolean;
  }>;
}

export interface RasterCompositeSpec {
  readonly canvas?: Readonly<{
    width: number;
    height: number;
    background?: string;
  }>;
  readonly baseFit?: ResizeOptions["fit"];
  readonly basePosition?: ResizeOptions["position"];
  readonly layers: readonly RasterCompositeLayerSpec[];
  readonly format?: RasterCompositeFormat;
  readonly quality?: number;
}

export interface RasterCompositeResult {
  readonly buffer: Buffer;
  readonly evidence: Readonly<{
    canvasWidth: number;
    canvasHeight: number;
    baseProvided: boolean;
    format: RasterCompositeFormat;
    layers: readonly Readonly<{
      index: number;
      name: string;
      width: number;
      height: number;
      opacity: number;
      blend: OverlayOptions["blend"];
      placement: string;
      masked: boolean;
      operations: readonly string[];
    }>[];
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

function integerCoordinate(value: number | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || Math.abs(value) > 32768) {
    throw new Error(`${label} must be an integer between -32768 and 32768.`);
  }
  return value;
}

async function prepareLayer(
  layer: RasterCompositeLayerSpec,
  index: number,
): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
  opacity: number;
  blend: OverlayOptions["blend"];
  placement: string;
  masked: boolean;
  operations: string[];
}> {
  if (layer.input.byteLength === 0) {
    throw new Error(`Composite layer ${index} input is empty.`);
  }

  const operations: string[] = ["ensure-alpha"];
  let image = sharp(layer.input, { failOn: "error" }).ensureAlpha();

  if (layer.resize) {
    const width = positiveInteger(layer.resize.width, `layers[${index}].resize.width`);
    const height = positiveInteger(layer.resize.height, `layers[${index}].resize.height`);
    if (width === undefined && height === undefined) {
      throw new Error(`Composite layer ${index} resize requires width or height.`);
    }
    image = image.resize({
      ...(width === undefined ? {} : { width }),
      ...(height === undefined ? {} : { height }),
      ...(layer.resize.fit === undefined ? {} : { fit: layer.resize.fit }),
      ...(layer.resize.position === undefined ? {} : { position: layer.resize.position }),
      withoutEnlargement: layer.resize.withoutEnlargement ?? false,
      background: "#00000000",
    });
    operations.push("resize");
  }

  if (layer.rotate !== undefined) {
    const angle = finiteRange(layer.rotate, `layers[${index}].rotate`, -3600, 3600)!;
    image = image.rotate(angle, { background: "#00000000" });
    operations.push(`rotate:${angle}`);
  }

  let prepared = await image.png().toBuffer({ resolveWithObject: true });

  if (layer.mask) {
    if (layer.mask.byteLength === 0) {
      throw new Error(`Composite layer ${index} mask is empty.`);
    }
    const maskMeta = await sharp(layer.mask).metadata();
    if (maskMeta.width !== prepared.info.width || maskMeta.height !== prepared.info.height) {
      throw new Error(
        `Composite layer ${index} mask dimensions must exactly match the transformed layer.`,
      );
    }
    const mask = await sharp(layer.mask).ensureAlpha().extractChannel(3).png().toBuffer();
    prepared = await sharp(prepared.data)
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer({ resolveWithObject: true });
    operations.push("apply-alpha-mask");
  }

  const opacity = finiteRange(layer.opacity, `layers[${index}].opacity`, 0, 1) ?? 1;
  if (opacity < 1) {
    const opacityMask = await sharp({
      create: {
        width: prepared.info.width,
        height: prepared.info.height,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: opacity },
      },
    })
      .png()
      .toBuffer();
    prepared = await sharp(prepared.data)
      .composite([{ input: opacityMask, blend: "dest-in" }])
      .png()
      .toBuffer({ resolveWithObject: true });
    operations.push(`opacity:${opacity}`);
  }

  const left = integerCoordinate(layer.left, `layers[${index}].left`);
  const top = integerCoordinate(layer.top, `layers[${index}].top`);
  if ((left === undefined) !== (top === undefined)) {
    throw new Error(`Composite layer ${index} must provide both left and top, or neither.`);
  }
  if (left !== undefined && layer.gravity !== undefined) {
    throw new Error(`Composite layer ${index} cannot combine explicit coordinates with gravity.`);
  }

  const blend = layer.blend ?? "over";
  const placement =
    left !== undefined && top !== undefined
      ? `left:${left},top:${top}`
      : `gravity:${layer.gravity ?? "centre"}`;

  return {
    buffer: prepared.data,
    width: prepared.info.width,
    height: prepared.info.height,
    opacity,
    blend,
    placement,
    masked: Boolean(layer.mask),
    operations,
  };
}

/**
 * Ordered, deterministic raster layer compositing for local finishing workflows.
 * Layers may be resized, rotated, masked, faded and blended before being placed
 * with exact coordinates or gravity. It intentionally does not perform semantic
 * segmentation; upstream local or cloud providers can supply mattes while this
 * pass remains provider-agnostic and reproducible.
 */
export async function composeRasterLayers(
  base: Buffer | null,
  spec: RasterCompositeSpec,
): Promise<RasterCompositeResult> {
  if (!spec || !Array.isArray(spec.layers)) {
    throw new Error("Raster compositing requires a layers array.");
  }

  let canvasWidth: number;
  let canvasHeight: number;
  let composition: sharp.Sharp;
  const operations: string[] = [];

  if (spec.canvas) {
    canvasWidth = positiveInteger(spec.canvas.width, "canvas.width")!;
    canvasHeight = positiveInteger(spec.canvas.height, "canvas.height")!;
    composition = sharp({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 4,
        background: spec.canvas.background ?? "#00000000",
      },
    });
    operations.push("create-canvas");

    if (base) {
      if (base.byteLength === 0) throw new Error("Raster compositing base input is empty.");
      const fittedBase = await sharp(base, { failOn: "error" })
        .ensureAlpha()
        .resize({
          width: canvasWidth,
          height: canvasHeight,
          fit: spec.baseFit ?? "contain",
          position: spec.basePosition ?? "centre",
          background: "#00000000",
        })
        .png()
        .toBuffer();
      composition = composition.composite([{ input: fittedBase, blend: "over" }]);
      operations.push("fit-base-to-canvas");
    }
  } else {
    if (!base || base.byteLength === 0) {
      throw new Error("Raster compositing requires a base image when canvas is omitted.");
    }
    const baseMeta = await sharp(base).metadata();
    if (!baseMeta.width || !baseMeta.height) {
      throw new Error("Raster compositing base image has no dimensions.");
    }
    canvasWidth = baseMeta.width;
    canvasHeight = baseMeta.height;
    composition = sharp(base, { failOn: "error" }).ensureAlpha();
    operations.push("use-base-canvas");
  }

  const layerEvidence: Array<{
    index: number;
    name: string;
    width: number;
    height: number;
    opacity: number;
    blend: OverlayOptions["blend"];
    placement: string;
    masked: boolean;
    operations: readonly string[];
  }> = [];

  for (let index = 0; index < spec.layers.length; index += 1) {
    const layer = spec.layers[index]!;
    const prepared = await prepareLayer(layer, index);
    const explicit = prepared.placement.startsWith("left:");
    const overlay: OverlayOptions = explicit
      ? {
          input: prepared.buffer,
          left: layer.left!,
          top: layer.top!,
          blend: prepared.blend,
        }
      : {
          input: prepared.buffer,
          gravity: layer.gravity ?? "centre",
          blend: prepared.blend,
        };
    composition = composition.composite([overlay]);
    operations.push(`composite-layer:${index}`);
    layerEvidence.push({
      index,
      name: layer.name?.trim() || `layer-${index + 1}`,
      width: prepared.width,
      height: prepared.height,
      opacity: prepared.opacity,
      blend: prepared.blend,
      placement: prepared.placement,
      masked: prepared.masked,
      operations: Object.freeze([...prepared.operations]),
    });
  }

  const format = spec.format ?? "png";
  const quality = finiteRange(spec.quality, "quality", 1, 100);
  if (format === "png") composition = composition.png({ compressionLevel: 9 });
  if (format === "webp") composition = composition.webp({ quality: quality ?? 90, smartSubsample: true });
  if (format === "avif") composition = composition.avif({ quality: quality ?? 85 });
  if (format === "jpeg") composition = composition.flatten({ background: "#000000" }).jpeg({ quality: quality ?? 92, mozjpeg: true });
  operations.push(`encode:${format}`);

  const output = await composition.toBuffer();
  return {
    buffer: output,
    evidence: {
      canvasWidth,
      canvasHeight,
      baseProvided: Boolean(base),
      format,
      layers: Object.freeze(layerEvidence),
      operations: Object.freeze(operations),
    },
  };
}
