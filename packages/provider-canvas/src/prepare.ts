import { createHash } from "node:crypto";

import { preflightInpaintMask } from "@evavo/art-media";
import sharp from "sharp";

import { deriveProviderCanvasSize, normalizePixelArtProviderCanvasOptions } from "./options.js";
import {
  PROVIDER_CANVAS_PROTOCOL_VERSION,
  ProviderCanvasError,
  type PixelArtProviderCanvasOptions,
  type PreparedPixelArtProviderCanvas,
} from "./types.js";

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function protectedRgbaHash(
  base: Uint8Array,
  mask: Uint8Array,
): string {
  const hash = createHash("sha256");
  for (let pixel = 0; pixel < base.length / 4; pixel += 1) {
    const offset = pixel * 4;
    if (mask[offset + 3] === 255) {
      hash.update(base.subarray(offset, offset + 4));
    }
  }
  return hash.digest("hex");
}

function sourcePalette(
  rgba: Uint8Array,
  maximumColours: number,
): readonly Readonly<{ r: number; g: number; b: number; a: number }>[] {
  const colours = new Map<string, Readonly<{ r: number; g: number; b: number; a: number }>>();
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const a = rgba[offset + 3]!;
    if (a === 0) continue;
    const colour = {
      r: rgba[offset]!,
      g: rgba[offset + 1]!,
      b: rgba[offset + 2]!,
      a,
    };
    const key = `${colour.r},${colour.g},${colour.b},${colour.a}`;
    if (!colours.has(key)) {
      colours.set(key, colour);
      if (colours.size > maximumColours) {
        throw new ProviderCanvasError(
          "PROVIDER_CANVAS_PALETTE_TOO_LARGE",
          `Source contains more than ${maximumColours} visible RGBA colours. Use paletteMode=none or supply a more constrained pixel-art source.`,
        );
      }
    }
  }
  return [...colours.values()].sort(
    (left, right) =>
      left.r - right.r ||
      left.g - right.g ||
      left.b - right.b ||
      left.a - right.a,
  );
}

function encodePng(
  data: Uint8Array,
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
}

export async function preparePixelArtProviderCanvas(
  baseInput: Buffer | Uint8Array,
  maskInput: Buffer | Uint8Array,
  inputOptions: PixelArtProviderCanvasOptions,
): Promise<PreparedPixelArtProviderCanvas> {
  const options = normalizePixelArtProviderCanvasOptions(inputOptions);
  const preflight = await preflightInpaintMask(baseInput, maskInput, {
    maximumInputBytes: options.maximumInputBytes,
    maximumPixels: options.maximumSourcePixels,
  });
  const [baseDecoded, maskDecoded] = await Promise.all([
    sharp(Buffer.from(baseInput), {
      failOn: "error",
      limitInputPixels: options.maximumSourcePixels,
      sequentialRead: true,
    })
      .ensureAlpha()
      .toColourspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true }),
    sharp(Buffer.from(maskInput), {
      failOn: "error",
      limitInputPixels: options.maximumSourcePixels,
      sequentialRead: true,
    })
      .ensureAlpha()
      .toColourspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true }),
  ]);
  if (baseDecoded.info.channels !== 4 || maskDecoded.info.channels !== 4) {
    throw new ProviderCanvasError(
      "PROVIDER_CANVAS_CHANNELS_INVALID",
      "Base image and mask must decode to RGBA.",
    );
  }
  if (options.requireBinaryMask && preflight.mask.partiallyTransparentPixels > 0) {
    throw new ProviderCanvasError(
      "PROVIDER_CANVAS_MASK_NOT_BINARY",
      "Pixel-art provider preparation requires a binary mask: alpha must be exactly 0 for editable pixels or 255 for protected pixels.",
    );
  }
  const placement = deriveProviderCanvasSize(
    preflight.base.width,
    preflight.base.height,
    options,
  );
  const providerPixels = placement.width * placement.height;
  const providerBase = Buffer.alloc(providerPixels * 4);
  const providerMask = Buffer.alloc(providerPixels * 4);
  for (let pixel = 0; pixel < providerPixels; pixel += 1) {
    const offset = pixel * 4;
    providerBase[offset] = options.matteColour.r;
    providerBase[offset + 1] = options.matteColour.g;
    providerBase[offset + 2] = options.matteColour.b;
    providerBase[offset + 3] = 255;
    providerMask[offset] = 255;
    providerMask[offset + 1] = 255;
    providerMask[offset + 2] = 255;
    providerMask[offset + 3] = 255;
  }
  for (let sourceY = 0; sourceY < preflight.base.height; sourceY += 1) {
    for (let sourceX = 0; sourceX < preflight.base.width; sourceX += 1) {
      const sourceOffset = (sourceY * preflight.base.width + sourceX) * 4;
      const sourceAlpha = baseDecoded.data[sourceOffset + 3]! / 255;
      const composited = [
        Math.round(
          baseDecoded.data[sourceOffset]! * sourceAlpha +
            options.matteColour.r * (1 - sourceAlpha),
        ),
        Math.round(
          baseDecoded.data[sourceOffset + 1]! * sourceAlpha +
            options.matteColour.g * (1 - sourceAlpha),
        ),
        Math.round(
          baseDecoded.data[sourceOffset + 2]! * sourceAlpha +
            options.matteColour.b * (1 - sourceAlpha),
        ),
      ];
      const maskAlpha = maskDecoded.data[sourceOffset + 3]!;
      const targetStartX = placement.offsetX + sourceX * placement.scale;
      const targetStartY = placement.offsetY + sourceY * placement.scale;
      for (let blockY = 0; blockY < placement.scale; blockY += 1) {
        for (let blockX = 0; blockX < placement.scale; blockX += 1) {
          const targetX = targetStartX + blockX;
          const targetY = targetStartY + blockY;
          const targetOffset = (targetY * placement.width + targetX) * 4;
          providerBase[targetOffset] = composited[0]!;
          providerBase[targetOffset + 1] = composited[1]!;
          providerBase[targetOffset + 2] = composited[2]!;
          providerBase[targetOffset + 3] = 255;
          providerMask[targetOffset + 3] = maskAlpha;
        }
      }
    }
  }
  const [basePng, maskPng] = await Promise.all([
    encodePng(providerBase, placement.width, placement.height),
    encodePng(providerMask, placement.width, placement.height),
  ]);
  const palette =
    options.paletteMode === "source"
      ? sourcePalette(baseDecoded.data, options.maximumPaletteColours)
      : [];
  return {
    basePng,
    maskPng,
    manifest: {
      schemaVersion: "1.0",
      protocolVersion: PROVIDER_CANVAS_PROTOCOL_VERSION,
      source: {
        width: preflight.base.width,
        height: preflight.base.height,
        format: preflight.base.format,
        baseSha256: preflight.base.sha256,
        maskSha256: preflight.mask.sha256,
        sourceHasAlpha: preflight.base.hasAlpha,
      },
      provider: {
        width: placement.width,
        height: placement.height,
        size: `${placement.width}x${placement.height}`,
        scale: placement.scale,
        offsetX: placement.offsetX,
        offsetY: placement.offsetY,
        contentWidth: preflight.base.width * placement.scale,
        contentHeight: preflight.base.height * placement.scale,
        matteColour: options.matteColour.hex,
        baseSha256: sha256(basePng),
        maskSha256: sha256(maskPng),
      },
      mask: {
        editablePixels: preflight.mask.editablePixels,
        protectedPixels: preflight.mask.preservedPixels,
        partiallyEditablePixels: preflight.mask.partiallyTransparentPixels,
        editableFraction: preflight.mask.editableFraction,
        binary: preflight.mask.partiallyTransparentPixels === 0,
      },
      restoration: {
        sampling: options.restorationSampling,
        paletteMode: options.paletteMode,
        palette,
        protectedSourceRgbaSha256: protectedRgbaHash(
          baseDecoded.data,
          maskDecoded.data,
        ),
      },
    },
  };
}
