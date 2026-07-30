import {
  ProviderCanvasError,
  type NormalizedPixelArtProviderCanvasOptions,
  type PixelArtProviderCanvasOptions,
} from "./types.js";

const DEFAULT_MAXIMUM_INPUT_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAXIMUM_SOURCE_PIXELS = 16_777_216;
const DEFAULT_MAXIMUM_PROVIDER_PIXELS = 8_294_400;

function integer(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < minimum || result > maximum) {
    throw new ProviderCanvasError(
      "PROVIDER_CANVAS_OPTIONS_INVALID",
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return result;
}

function matteColour(value: string): Readonly<{
  r: number;
  g: number;
  b: number;
  hex: string;
}> {
  const normalized = value.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(normalized)) {
    throw new ProviderCanvasError(
      "PROVIDER_CANVAS_MATTE_INVALID",
      "matteColour must use #RRGGBB format.",
    );
  }
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
    hex: normalized,
  };
}

function optionalProviderEdge(
  value: number | undefined,
  name: string,
): number | undefined {
  if (value === undefined) return undefined;
  if (
    !Number.isInteger(value) ||
    value < 16 ||
    value > 3_840 ||
    value % 16 !== 0
  ) {
    throw new ProviderCanvasError(
      "PROVIDER_CANVAS_SIZE_INVALID",
      `${name} must be a multiple of 16 between 16 and 3840.`,
    );
  }
  return value;
}

export function normalizePixelArtProviderCanvasOptions(
  input: PixelArtProviderCanvasOptions,
): NormalizedPixelArtProviderCanvasOptions {
  const providerWidth = optionalProviderEdge(input.providerWidth, "providerWidth");
  const providerHeight = optionalProviderEdge(
    input.providerHeight,
    "providerHeight",
  );
  if ((providerWidth === undefined) !== (providerHeight === undefined)) {
    throw new ProviderCanvasError(
      "PROVIDER_CANVAS_SIZE_INVALID",
      "providerWidth and providerHeight must be supplied together.",
    );
  }
  if (providerWidth !== undefined && providerHeight !== undefined) {
    const pixels = providerWidth * providerHeight;
    const ratio =
      Math.max(providerWidth, providerHeight) /
      Math.min(providerWidth, providerHeight);
    if (ratio > 3 || pixels < 655_360 || pixels > 8_294_400) {
      throw new ProviderCanvasError(
        "PROVIDER_CANVAS_SIZE_INVALID",
        "Provider canvas must stay within 3:1 and contain 655360 to 8294400 pixels.",
      );
    }
  }
  const sampling = input.restorationSampling ?? "nearest-center";
  if (sampling !== "nearest-center" && sampling !== "block-average") {
    throw new ProviderCanvasError(
      "PROVIDER_CANVAS_OPTIONS_INVALID",
      "restorationSampling must be nearest-center or block-average.",
    );
  }
  const paletteMode = input.paletteMode ?? "source";
  if (paletteMode !== "source" && paletteMode !== "none") {
    throw new ProviderCanvasError(
      "PROVIDER_CANVAS_OPTIONS_INVALID",
      "paletteMode must be source or none.",
    );
  }
  const alphaMode = input.alphaMode ?? "source";
  if (alphaMode !== "source" && alphaMode !== "candidate") {
    throw new ProviderCanvasError(
      "PROVIDER_CANVAS_OPTIONS_INVALID",
      "alphaMode must be source or candidate.",
    );
  }
  return {
    matteColour: matteColour(input.matteColour),
    ...(providerWidth === undefined ? {} : { providerWidth }),
    ...(providerHeight === undefined ? {} : { providerHeight }),
    contentMarginPixels: integer(
      input.contentMarginPixels,
      64,
      0,
      1_024,
      "contentMarginPixels",
    ),
    requireBinaryMask: input.requireBinaryMask !== false,
    restorationSampling: sampling,
    paletteMode,
    alphaMode,
    maximumPaletteColours: integer(
      input.maximumPaletteColours,
      256,
      1,
      4_096,
      "maximumPaletteColours",
    ),
    maximumInputBytes: integer(
      input.maximumInputBytes,
      DEFAULT_MAXIMUM_INPUT_BYTES,
      1_024,
      512 * 1024 * 1024,
      "maximumInputBytes",
    ),
    maximumSourcePixels: integer(
      input.maximumSourcePixels,
      DEFAULT_MAXIMUM_SOURCE_PIXELS,
      1,
      67_108_864,
      "maximumSourcePixels",
    ),
    maximumProviderPixels: integer(
      input.maximumProviderPixels,
      DEFAULT_MAXIMUM_PROVIDER_PIXELS,
      655_360,
      8_294_400,
      "maximumProviderPixels",
    ),
  };
}

function round16(value: number): number {
  return Math.max(16, Math.ceil(value / 16) * 16);
}

function validProviderSize(
  width: number,
  height: number,
  maximumPixels: number,
): boolean {
  const pixels = width * height;
  const ratio = Math.max(width, height) / Math.min(width, height);
  return (
    width <= 3_840 &&
    height <= 3_840 &&
    width % 16 === 0 &&
    height % 16 === 0 &&
    ratio <= 3 &&
    pixels >= 655_360 &&
    pixels <= maximumPixels
  );
}

export function deriveProviderCanvasSize(
  sourceWidth: number,
  sourceHeight: number,
  options: NormalizedPixelArtProviderCanvasOptions,
): Readonly<{
  width: number;
  height: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}> {
  let width = options.providerWidth;
  let height = options.providerHeight;
  if (width === undefined || height === undefined) {
    const ratio = sourceWidth / sourceHeight;
    const targetPixels = Math.min(options.maximumProviderPixels, 1_048_576);
    width = round16(Math.sqrt(targetPixels * ratio));
    height = round16(Math.sqrt(targetPixels / ratio));
    if (width * height < 655_360) {
      const factor = Math.sqrt(655_360 / (width * height));
      width = round16(width * factor);
      height = round16(height * factor);
    }
    while (!validProviderSize(width, height, options.maximumProviderPixels)) {
      if (
        width > 3_840 ||
        height > 3_840 ||
        width * height > options.maximumProviderPixels
      ) {
        const factor = Math.sqrt(
          options.maximumProviderPixels / (width * height),
        );
        width = Math.max(16, Math.floor((width * factor) / 16) * 16);
        height = Math.max(16, Math.floor((height * factor) / 16) * 16);
      } else {
        width = round16(width + 16);
        height = round16(height + 16);
      }
      if (width <= 0 || height <= 0) break;
    }
  }
  if (!validProviderSize(width, height, options.maximumProviderPixels)) {
    throw new ProviderCanvasError(
      "PROVIDER_CANVAS_SIZE_INVALID",
      `Derived provider canvas ${width}x${height} does not satisfy GPT Image 2 size constraints.`,
    );
  }
  const availableWidth = width - options.contentMarginPixels * 2;
  const availableHeight = height - options.contentMarginPixels * 2;
  const scale = Math.floor(
    Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight),
  );
  if (scale < 1) {
    throw new ProviderCanvasError(
      "PROVIDER_CANVAS_SOURCE_TOO_LARGE",
      `Source ${sourceWidth}x${sourceHeight} cannot fit ${width}x${height} with ${options.contentMarginPixels}px margins at an integer scale.`,
    );
  }
  const contentWidth = sourceWidth * scale;
  const contentHeight = sourceHeight * scale;
  return {
    width,
    height,
    scale,
    offsetX: Math.floor((width - contentWidth) / 2),
    offsetY: Math.floor((height - contentHeight) / 2),
  };
}
