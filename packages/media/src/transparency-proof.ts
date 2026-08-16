import { createHash } from "node:crypto";

import sharp from "sharp";

const HEX = /^#[0-9a-f]{6}$/i;
const DEFAULT_BACKGROUNDS = Object.freeze([
  "#000000",
  "#ffffff",
  "#808080",
  "#00ff00",
  "#ff00ff",
]);

export interface TransparencyProofOptions {
  readonly backgrounds?: readonly string[];
  readonly nearest?: boolean;
  readonly maximumPreviewDimension?: number;
  readonly maximumInputBytes?: number;
  readonly maximumPixels?: number;
}

export interface TransparencyProofEvidence {
  readonly schemaVersion: "1.0";
  readonly inputSha256: string;
  readonly outputSha256: string;
  readonly backgrounds: readonly string[];
  readonly includesAlphaMask: true;
  readonly checkerboardUsed: false;
  readonly columns: number;
  readonly rows: number;
  readonly previewWidth: number;
  readonly previewHeight: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
}

export interface TransparencyProofResult {
  readonly png: Buffer;
  readonly evidence: TransparencyProofEvidence;
}

export class TransparencyProofError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "TransparencyProofError";
    this.code = code;
  }
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function integer(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < minimum || result > maximum) {
    throw new TransparencyProofError(
      "TRANSPARENCY_PROOF_OPTIONS_INVALID",
      `${label} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return result;
}

function rgb(value: string): Readonly<{ r: number; g: number; b: number }> {
  return {
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16),
  };
}

export async function createTransparencyProofSheet(
  input: Buffer | Uint8Array,
  options: TransparencyProofOptions = {},
): Promise<TransparencyProofResult> {
  const encoded = Buffer.from(input);
  const maximumInputBytes = integer(
    options.maximumInputBytes,
    64 * 1024 * 1024,
    1_024,
    512 * 1024 * 1024,
    "maximumInputBytes",
  );
  const maximumPixels = integer(
    options.maximumPixels,
    16_777_216,
    1,
    67_108_864,
    "maximumPixels",
  );
  const maximumPreviewDimension = integer(
    options.maximumPreviewDimension,
    256,
    32,
    2_048,
    "maximumPreviewDimension",
  );
  if (!encoded.byteLength || encoded.byteLength > maximumInputBytes) {
    throw new TransparencyProofError(
      "TRANSPARENCY_PROOF_INPUT_INVALID",
      `Proof input must contain 1 to ${maximumInputBytes} bytes.`,
    );
  }
  const backgrounds = [
    ...new Set((options.backgrounds ?? DEFAULT_BACKGROUNDS).map((value) => value.toLowerCase())),
  ];
  if (
    backgrounds.length < 1 ||
    backgrounds.length > 16 ||
    backgrounds.some((value) => !HEX.test(value))
  ) {
    throw new TransparencyProofError(
      "TRANSPARENCY_PROOF_BACKGROUNDS_INVALID",
      "Proof backgrounds must contain 1 to 16 unique #RRGGBB colours.",
    );
  }
  const decoded = await sharp(encoded, {
    failOn: "error",
    limitInputPixels: maximumPixels,
    pages: 1,
    animated: false,
  })
    .ensureAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = decoded.info;
  if (width < 1 || height < 1 || width * height > maximumPixels) {
    throw new TransparencyProofError(
      "TRANSPARENCY_PROOF_DIMENSIONS_INVALID",
      "Proof input has invalid or excessive decoded dimensions.",
    );
  }
  const scale = Math.min(1, maximumPreviewDimension / Math.max(width, height));
  const previewWidth = Math.max(1, Math.round(width * scale));
  const previewHeight = Math.max(1, Math.round(height * scale));
  const kernel = options.nearest === true ? sharp.kernel.nearest : sharp.kernel.lanczos3;
  const preview = await sharp(decoded.data, {
    raw: { width, height, channels: 4 },
  })
    .resize(previewWidth, previewHeight, { fit: "fill", kernel })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
  const alphaPixels = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const alpha = decoded.data[pixel * 4 + 3]!;
    alphaPixels[pixel * 4] = alpha;
    alphaPixels[pixel * 4 + 1] = alpha;
    alphaPixels[pixel * 4 + 2] = alpha;
    alphaPixels[pixel * 4 + 3] = 255;
  }
  const alphaPreview = await sharp(alphaPixels, {
    raw: { width, height, channels: 4 },
  })
    .resize(previewWidth, previewHeight, { fit: "fill", kernel })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
  const padding = 8;
  const cellWidth = previewWidth + padding * 2;
  const cellHeight = previewHeight + padding * 2;
  const columns = Math.min(3, backgrounds.length + 1);
  const rows = Math.ceil((backgrounds.length + 1) / columns);
  const tiles = await Promise.all([
    ...backgrounds.map(async (background, index) => ({
      input: await sharp({
        create: {
          width: cellWidth,
          height: cellHeight,
          channels: 4,
          background: { ...rgb(background), alpha: 1 },
        },
      })
        .composite([{ input: preview, left: padding, top: padding }])
        .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
        .toBuffer(),
      left: (index % columns) * cellWidth,
      top: Math.floor(index / columns) * cellHeight,
    })),
    Promise.resolve({
      input: alphaPreview,
      left: (backgrounds.length % columns) * cellWidth + padding,
      top: Math.floor(backgrounds.length / columns) * cellHeight + padding,
    }),
  ]);
  const png = await sharp({
    create: {
      width: columns * cellWidth,
      height: rows * cellHeight,
      channels: 4,
      background: { r: 24, g: 24, b: 24, alpha: 1 },
    },
  })
    .composite(tiles)
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
  return {
    png,
    evidence: {
      schemaVersion: "1.0",
      inputSha256: sha256(encoded),
      outputSha256: sha256(png),
      backgrounds,
      includesAlphaMask: true,
      checkerboardUsed: false,
      columns,
      rows,
      previewWidth,
      previewHeight,
      cellWidth,
      cellHeight,
    },
  };
}
