import { createHash } from "node:crypto";

import sharp from "sharp";

import {
  PROVIDER_CANVAS_PROTOCOL_VERSION,
  ProviderCanvasError,
  type PixelArtProviderCanvasManifest,
  type PixelArtProviderCanvasRestorationEvidence,
  type RestorePixelArtProviderCanvasOptions,
  type RestoredPixelArtProviderCanvas,
} from "./types.js";

const DEFAULT_MAXIMUM_INPUT_BYTES = 128 * 1024 * 1024;
const DEFAULT_MAXIMUM_PROVIDER_PIXELS = 8_294_400;

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < minimum || result > maximum) {
    throw new ProviderCanvasError(
      "PROVIDER_CANVAS_RESTORE_OPTIONS_INVALID",
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return result;
}

function validateManifest(input: PixelArtProviderCanvasManifest): void {
  if (
    !input ||
    input.schemaVersion !== "1.0" ||
    input.protocolVersion !== PROVIDER_CANVAS_PROTOCOL_VERSION
  ) {
    throw new ProviderCanvasError(
      "PROVIDER_CANVAS_MANIFEST_INVALID",
      "Provider canvas manifest has an unsupported schema or protocol version.",
    );
  }
  const integers = [
    input.source.width,
    input.source.height,
    input.provider.width,
    input.provider.height,
    input.provider.scale,
    input.provider.offsetX,
    input.provider.offsetY,
    input.provider.contentWidth,
    input.provider.contentHeight,
  ];
  if (integers.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new ProviderCanvasError(
      "PROVIDER_CANVAS_MANIFEST_INVALID",
      "Provider canvas geometry must contain non-negative integers.",
    );
  }
  if (
    input.source.width <= 0 ||
    input.source.height <= 0 ||
    input.provider.width <= 0 ||
    input.provider.height <= 0 ||
    input.provider.scale <= 0 ||
    input.provider.contentWidth !== input.source.width * input.provider.scale ||
    input.provider.contentHeight !==
      input.source.height * input.provider.scale ||
    input.provider.offsetX + input.provider.contentWidth > input.provider.width ||
    input.provider.offsetY + input.provider.contentHeight > input.provider.height
  ) {
    throw new ProviderCanvasError(
      "PROVIDER_CANVAS_MANIFEST_INVALID",
      "Provider canvas geometry is internally inconsistent.",
    );
  }
  if (!input.mask.binary || input.mask.partiallyEditablePixels !== 0) {
    throw new ProviderCanvasError(
      "PROVIDER_CANVAS_MASK_NOT_BINARY",
      "Pixel-art restoration requires the binary mask recorded during preparation.",
    );
  }
  if (
    input.restoration.alphaMode !== "source" &&
    input.restoration.alphaMode !== "candidate"
  ) {
    throw new ProviderCanvasError(
      "PROVIDER_CANVAS_MANIFEST_INVALID",
      "Provider canvas restoration alpha mode is invalid.",
    );
  }
}

async function decodeRgba(
  input: Buffer | Uint8Array,
  maximumInputBytes: number,
  maximumPixels: number,
  role: string,
): Promise<
  Readonly<{
    data: Buffer;
    width: number;
    height: number;
    format: string;
    pages: number;
    hasAlpha: boolean;
  }>
> {
  const bytes = Buffer.from(input);
  if (!bytes.byteLength || bytes.byteLength > maximumInputBytes) {
    throw new ProviderCanvasError(
      "PROVIDER_CANVAS_INPUT_SIZE_INVALID",
      `${role} must contain 1 to ${maximumInputBytes} bytes.`,
    );
  }
  const decoderOptions = {
    failOn: "error" as const,
    limitInputPixels: maximumPixels,
    sequentialRead: true,
  };
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(bytes, decoderOptions).metadata();
  } catch {
    throw new ProviderCanvasError(
      "PROVIDER_CANVAS_DECODE_FAILED",
      `${role} could not be decoded as a supported raster image.`,
    );
  }
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const pages = metadata.pages ?? 1;
  if (
    width <= 0 ||
    height <= 0 ||
    width * height > maximumPixels ||
    pages !== 1
  ) {
    throw new ProviderCanvasError(
      "PROVIDER_CANVAS_DIMENSIONS_INVALID",
      `${role} has invalid, excessive, or multipage dimensions.`,
    );
  }
  const result = await sharp(bytes, decoderOptions)
    .ensureAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (result.info.channels !== 4) {
    throw new ProviderCanvasError(
      "PROVIDER_CANVAS_CHANNELS_INVALID",
      `${role} did not decode to RGBA.`,
    );
  }
  return {
    data: result.data,
    width: result.info.width,
    height: result.info.height,
    format: metadata.format ?? "unknown",
    pages,
    hasAlpha: metadata.hasAlpha ?? false,
  };
}

function protectedRgbaHash(base: Uint8Array, mask: Uint8Array): string {
  const hash = createHash("sha256");
  for (let pixel = 0; pixel < base.length / 4; pixel += 1) {
    const offset = pixel * 4;
    if (mask[offset + 3] === 255) {
      hash.update(base.subarray(offset, offset + 4));
    }
  }
  return hash.digest("hex");
}

function nearestPalette(
  rgba: readonly number[],
  palette: PixelArtProviderCanvasManifest["restoration"]["palette"],
): readonly [number, number, number, number] {
  if (!palette.length) return [rgba[0]!, rgba[1]!, rgba[2]!, rgba[3]!];
  let best = palette[0]!;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const colour of palette) {
    const dr = rgba[0]! - colour.r;
    const dg = rgba[1]! - colour.g;
    const db = rgba[2]! - colour.b;
    const distance = dr * dr + dg * dg + db * db;
    if (
      distance < bestDistance ||
      (distance === bestDistance &&
        (colour.r < best.r ||
          (colour.r === best.r &&
            (colour.g < best.g ||
              (colour.g === best.g && colour.b < best.b)))))
    ) {
      best = colour;
      bestDistance = distance;
    }
  }
  return [best.r, best.g, best.b, rgba[3]!];
}

function blockReading(
  candidate: Uint8Array,
  providerWidth: number,
  startX: number,
  startY: number,
  scale: number,
  sampling: "nearest-center" | "block-average",
): Readonly<{
  rgba: readonly [number, number, number, number];
  averageDeviation: number;
  maximumDeviation: number;
}> {
  const sums = [0, 0, 0, 0];
  const values: number[][] = [];
  for (let y = 0; y < scale; y += 1) {
    for (let x = 0; x < scale; x += 1) {
      const offset = ((startY + y) * providerWidth + startX + x) * 4;
      const pixel = [
        candidate[offset]!,
        candidate[offset + 1]!,
        candidate[offset + 2]!,
        candidate[offset + 3]!,
      ];
      values.push(pixel);
      for (let channel = 0; channel < 4; channel += 1) {
        sums[channel] = sums[channel]! + pixel[channel]!;
      }
    }
  }
  const count = scale * scale;
  const averages = sums.map((sum) => sum / count);
  const centerX = startX + Math.floor(scale / 2);
  const centerY = startY + Math.floor(scale / 2);
  const centerOffset = (centerY * providerWidth + centerX) * 4;
  const rgba: [number, number, number, number] =
    sampling === "nearest-center"
      ? [
          candidate[centerOffset]!,
          candidate[centerOffset + 1]!,
          candidate[centerOffset + 2]!,
          candidate[centerOffset + 3]!,
        ]
      : [
          Math.round(averages[0]!),
          Math.round(averages[1]!),
          Math.round(averages[2]!),
          Math.round(averages[3]!),
        ];
  let totalDeviation = 0;
  let maximumDeviation = 0;
  for (const pixel of values) {
    for (let channel = 0; channel < 4; channel += 1) {
      const deviation = Math.abs(pixel[channel]! - averages[channel]!);
      totalDeviation += deviation;
      maximumDeviation = Math.max(maximumDeviation, deviation);
    }
  }
  return {
    rgba,
    averageDeviation: totalDeviation / (count * 4),
    maximumDeviation,
  };
}

export async function restorePixelArtProviderCanvas(
  sourceBaseInput: Buffer | Uint8Array,
  sourceMaskInput: Buffer | Uint8Array,
  providerCandidateInput: Buffer | Uint8Array,
  manifest: PixelArtProviderCanvasManifest,
  options: RestorePixelArtProviderCanvasOptions = {},
): Promise<RestoredPixelArtProviderCanvas> {
  validateManifest(manifest);
  const maximumInputBytes = boundedInteger(
    options.maximumInputBytes,
    DEFAULT_MAXIMUM_INPUT_BYTES,
    1_024,
    512 * 1024 * 1024,
    "maximumInputBytes",
  );
  const maximumProviderPixels = boundedInteger(
    options.maximumProviderPixels,
    DEFAULT_MAXIMUM_PROVIDER_PIXELS,
    655_360,
    8_294_400,
    "maximumProviderPixels",
  );
  const [base, mask, candidate] = await Promise.all([
    decodeRgba(
      sourceBaseInput,
      maximumInputBytes,
      manifest.source.width * manifest.source.height,
      "Source base",
    ),
    decodeRgba(
      sourceMaskInput,
      maximumInputBytes,
      manifest.source.width * manifest.source.height,
      "Source mask",
    ),
    decodeRgba(
      providerCandidateInput,
      maximumInputBytes,
      maximumProviderPixels,
      "Provider candidate",
    ),
  ]);
  if (
    base.width !== manifest.source.width ||
    base.height !== manifest.source.height ||
    mask.width !== manifest.source.width ||
    mask.height !== manifest.source.height ||
    candidate.width !== manifest.provider.width ||
    candidate.height !== manifest.provider.height
  ) {
    throw new ProviderCanvasError(
      "PROVIDER_CANVAS_DIMENSIONS_MISMATCH",
      "Source base, source mask, or provider candidate dimensions do not match the preparation manifest.",
    );
  }
  if (
    sha256(Buffer.from(sourceBaseInput)) !== manifest.source.baseSha256 ||
    sha256(Buffer.from(sourceMaskInput)) !== manifest.source.maskSha256
  ) {
    throw new ProviderCanvasError(
      "PROVIDER_CANVAS_SOURCE_HASH_MISMATCH",
      "Source base or mask bytes do not match the preparation manifest.",
    );
  }
  if (
    protectedRgbaHash(base.data, mask.data) !==
    manifest.restoration.protectedSourceRgbaSha256
  ) {
    throw new ProviderCanvasError(
      "PROVIDER_CANVAS_PROTECTED_HASH_MISMATCH",
      "Protected source pixels do not match the preparation evidence.",
    );
  }
  const output = Buffer.from(base.data);
  let protectedPixels = 0;
  let editablePixels = 0;
  let paletteMapped = 0;
  let editableAlphaChangesFromSource = 0;
  let totalBlockDeviation = 0;
  let maximumBlockDeviation = 0;
  for (let sourceY = 0; sourceY < manifest.source.height; sourceY += 1) {
    for (let sourceX = 0; sourceX < manifest.source.width; sourceX += 1) {
      const sourceOffset = (sourceY * manifest.source.width + sourceX) * 4;
      const maskAlpha = mask.data[sourceOffset + 3]!;
      if (maskAlpha === 255) {
        protectedPixels += 1;
        continue;
      }
      if (maskAlpha !== 0) {
        throw new ProviderCanvasError(
          "PROVIDER_CANVAS_MASK_NOT_BINARY",
          "Source mask changed after preparation or contains partial alpha.",
        );
      }
      editablePixels += 1;
      const reading = blockReading(
        candidate.data,
        manifest.provider.width,
        manifest.provider.offsetX + sourceX * manifest.provider.scale,
        manifest.provider.offsetY + sourceY * manifest.provider.scale,
        manifest.provider.scale,
        manifest.restoration.sampling,
      );
      totalBlockDeviation += reading.averageDeviation;
      maximumBlockDeviation = Math.max(
        maximumBlockDeviation,
        reading.maximumDeviation,
      );
      const restored =
        manifest.restoration.paletteMode === "source"
          ? nearestPalette(reading.rgba, manifest.restoration.palette)
          : reading.rgba;
      if (
        manifest.restoration.paletteMode === "source" &&
        (restored[0] !== reading.rgba[0] ||
          restored[1] !== reading.rgba[1] ||
          restored[2] !== reading.rgba[2])
      ) {
        paletteMapped += 1;
      }
      const sourceAlpha = base.data[sourceOffset + 3]!;
      const restoredAlpha =
        manifest.restoration.alphaMode === "source"
          ? sourceAlpha
          : restored[3];
      if (restoredAlpha !== sourceAlpha) editableAlphaChangesFromSource += 1;
      output[sourceOffset] = restored[0];
      output[sourceOffset + 1] = restored[1];
      output[sourceOffset + 2] = restored[2];
      output[sourceOffset + 3] = restoredAlpha;
    }
  }
  let protectedChannelComparisons = 0;
  let protectedChannelMismatches = 0;
  for (
    let pixel = 0;
    pixel < manifest.source.width * manifest.source.height;
    pixel += 1
  ) {
    const offset = pixel * 4;
    if (mask.data[offset + 3] !== 255) continue;
    for (let channel = 0; channel < 4; channel += 1) {
      protectedChannelComparisons += 1;
      if (output[offset + channel] !== base.data[offset + channel]) {
        protectedChannelMismatches += 1;
      }
    }
  }
  if (protectedChannelMismatches !== 0) {
    throw new ProviderCanvasError(
      "PROVIDER_CANVAS_PROTECTED_PIXELS_CHANGED",
      "Restoration changed one or more channels outside the editable mask.",
    );
  }
  const png = await sharp(output, {
    raw: {
      width: manifest.source.width,
      height: manifest.source.height,
      channels: 4,
    },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
  const evidence: PixelArtProviderCanvasRestorationEvidence = {
    schemaVersion: "1.0",
    protocolVersion: PROVIDER_CANVAS_PROTOCOL_VERSION,
    sourceBaseSha256: manifest.source.baseSha256,
    sourceMaskSha256: manifest.source.maskSha256,
    providerCandidateSha256: sha256(Buffer.from(providerCandidateInput)),
    restoredPngSha256: sha256(png),
    sourceWidth: manifest.source.width,
    sourceHeight: manifest.source.height,
    providerWidth: manifest.provider.width,
    providerHeight: manifest.provider.height,
    scale: manifest.provider.scale,
    sampling: manifest.restoration.sampling,
    paletteMode: manifest.restoration.paletteMode,
    alphaMode: manifest.restoration.alphaMode,
    paletteColours: manifest.restoration.palette.length,
    protectedPixels,
    editablePixels,
    protectedChannelComparisons,
    protectedChannelMismatches,
    protectedExact: protectedChannelMismatches === 0,
    editablePixelsPaletteMapped: paletteMapped,
    editableAlphaChangesFromSource,
    averageEditableBlockDeviation:
      editablePixels > 0 ? totalBlockDeviation / editablePixels : 0,
    maximumEditableBlockDeviation: maximumBlockDeviation,
  };
  return { png, evidence };
}
