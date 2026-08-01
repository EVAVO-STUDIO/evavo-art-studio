import { createHash } from "node:crypto";

import sharp from "sharp";

import {
  createAtlasLayout,
  sortPackItems,
  type AtlasLayout,
} from "./maxrects.js";
import { stableStringify } from "./math.js";
import { prepareAtlasFrame } from "./prepare.js";
import { renderAtlasRgba } from "./render.js";
import { compileAtlasAnimation } from "./timing.js";
import {
  SPRITE_ATLAS_BUILDER_VERSION,
  SPRITE_ATLAS_SCHEMA_VERSION,
  SpriteAtlasInputError,
  type DecodedAtlasSourceFrame,
  type NormalizedSpriteAtlasManifest,
  type PackedAtlasAnimation,
  type PreparedAtlasFrame,
  type SpriteAtlasManifest,
  type SpriteAtlasPackageData,
  type SpriteAtlasPackageEvidence,
} from "./types.js";
import { validateSpriteAtlasManifest } from "./validation.js";

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");

export interface EncodedAtlasSourceFrame {
  readonly id: string;
  readonly bytes: Uint8Array;
  readonly sourceReference: string;
}

export interface BuildSpriteAtlasBufferOptions {
  readonly maximumInputBytes?: number;
  readonly maximumTotalInputBytes?: number;
  readonly maximumPixels?: number;
  readonly decodeConcurrency?: number;
  readonly maximumPages?: number;
}

export interface SpriteAtlasPageBuffer {
  readonly pageIndex: number;
  readonly pageCount: number;
  readonly frameIds: readonly string[];
  readonly packageData: SpriteAtlasPackageData;
  readonly atlasImage: Uint8Array;
  readonly dataJson: string;
  readonly evidence: SpriteAtlasPackageEvidence;
  readonly evidenceJson: string;
  readonly atlasDataSha256: string;
}

export interface SpriteAtlasPagesBufferResult {
  readonly schemaVersion: "1.0";
  readonly builderVersion: typeof SPRITE_ATLAS_BUILDER_VERSION;
  readonly atlasId: string;
  readonly sourceManifestSha256: string;
  readonly animations: readonly PackedAtlasAnimation[];
  readonly pages: readonly SpriteAtlasPageBuffer[];
  readonly framePageById: Readonly<Record<string, number>>;
}

export interface SpriteAtlasPackageBufferResult {
  readonly packageData: SpriteAtlasPackageData;
  readonly atlasImage: Uint8Array;
  readonly dataJson: string;
  readonly evidence: SpriteAtlasPackageEvidence;
  readonly evidenceJson: string;
  readonly atlasDataSha256: string;
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
    throw new SpriteAtlasInputError(
      "SPRITE_ATLAS_BUFFER_OPTION_INVALID",
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return result;
}

function safeReference(value: string, frameId: string): string {
  const result = value.trim();
  if (!result || result.length > 2_048 || result.includes("\0")) {
    throw new SpriteAtlasInputError(
      "SPRITE_ATLAS_FRAME_REFERENCE_INVALID",
      `${frameId} sourceReference must contain 1 to 2048 safe characters.`,
    );
  }
  return result;
}

async function mapLimit<T, R>(
  values: readonly T[],
  limit: number,
  operation: (value: T, index: number) => Promise<R>,
): Promise<readonly R[]> {
  const output = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(values.length, limit) },
    async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= values.length) return;
        output[index] = await operation(values[index]!, index);
      }
    },
  );
  await Promise.all(workers);
  return output;
}

async function decodeFrame(
  manifest: NormalizedSpriteAtlasManifest,
  encoded: EncodedAtlasSourceFrame,
  maximumInputBytes: number,
  maximumPixels: number,
): Promise<DecodedAtlasSourceFrame> {
  const frame = manifest.frames.find((entry) => entry.id === encoded.id);
  if (!frame) {
    throw new SpriteAtlasInputError(
      "SPRITE_ATLAS_FRAME_UNDECLARED",
      `Encoded frame is not declared by the atlas manifest: ${encoded.id}`,
    );
  }
  if (
    encoded.bytes.byteLength < 1 ||
    encoded.bytes.byteLength > maximumInputBytes
  ) {
    throw new SpriteAtlasInputError(
      "SPRITE_ATLAS_FRAME_BYTE_LIMIT_EXCEEDED",
      `${encoded.id} contains ${encoded.bytes.byteLength} bytes; limit is ${maximumInputBytes}.`,
    );
  }
  const bytes = Buffer.from(encoded.bytes);
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(bytes, {
      failOn: "error",
      limitInputPixels: maximumPixels,
      pages: 1,
      animated: false,
    }).metadata();
  } catch (error: unknown) {
    throw new SpriteAtlasInputError(
      "SPRITE_ATLAS_FRAME_DECODE_FAILED",
      `${encoded.id} could not be decoded: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if ((metadata.pages ?? 1) !== 1) {
    throw new SpriteAtlasInputError(
      "SPRITE_ATLAS_FRAME_PAGE_COUNT_INVALID",
      `${encoded.id} must contain exactly one image page.`,
    );
  }
  if (!metadata.width || !metadata.height) {
    throw new SpriteAtlasInputError(
      "SPRITE_ATLAS_FRAME_DIMENSIONS_MISSING",
      `${encoded.id} has no decoded dimensions.`,
    );
  }
  if (metadata.width * metadata.height > maximumPixels) {
    throw new SpriteAtlasInputError(
      "SPRITE_ATLAS_FRAME_PIXEL_LIMIT_EXCEEDED",
      `${encoded.id} exceeds ${maximumPixels} decoded pixels.`,
    );
  }
  const { data, info } = await sharp(bytes, {
    failOn: "error",
    limitInputPixels: maximumPixels,
    pages: 1,
    animated: false,
  })
    .ensureAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    id: encoded.id,
    sourcePath: safeReference(encoded.sourceReference, encoded.id),
    data,
    width: info.width,
    height: info.height,
    sourceFormat: metadata.format ?? "unknown",
    sourceHasAlpha: metadata.hasAlpha ?? false,
    pivot: frame.pivot ?? {
      x: info.width / 2,
      y: Math.max(0, info.height - 1),
    },
    allowEmpty: frame.allowEmpty ?? false,
    tags: frame.tags ?? [],
  };
}

function exactFrameSet(
  manifest: NormalizedSpriteAtlasManifest,
  encoded: readonly EncodedAtlasSourceFrame[],
): void {
  const supplied = new Map<string, number>();
  for (const frame of encoded) {
    supplied.set(frame.id, (supplied.get(frame.id) ?? 0) + 1);
  }
  const duplicates = [...supplied.entries()]
    .filter(([, count]) => count !== 1)
    .map(([id]) => id)
    .sort();
  const declared = new Set(manifest.frames.map((frame) => frame.id));
  const missing = [...declared].filter((id) => !supplied.has(id)).sort();
  const extra = [...supplied.keys()]
    .filter((id) => !declared.has(id))
    .sort();
  if (duplicates.length || missing.length || extra.length) {
    throw new SpriteAtlasInputError(
      "SPRITE_ATLAS_FRAME_SET_INVALID",
      `Encoded frames must match the manifest exactly. Duplicates: ${duplicates.join(", ") || "none"}; missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}.`,
    );
  }
}

function pageFileName(
  fileName: string,
  pageIndex: number,
  pageCount: number,
): string {
  if (pageCount === 1) return fileName;
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const extension = dot > 0 ? fileName.slice(dot) : "";
  return `${base}.page-${String(pageIndex + 1).padStart(3, "0")}${extension}`;
}

function packItems(
  frames: readonly PreparedAtlasFrame[],
  manifest: NormalizedSpriteAtlasManifest,
) {
  const inset = manifest.settings.padding + manifest.settings.extrusion;
  return frames.map((frame) => ({
    id: frame.id,
    width: frame.trim.width + inset * 2,
    height: frame.trim.height + inset * 2,
  }));
}

function largestPage(
  remaining: readonly PreparedAtlasFrame[],
  manifest: NormalizedSpriteAtlasManifest,
): Readonly<{ frames: readonly PreparedAtlasFrame[]; layout: AtlasLayout }> {
  let lower = 1;
  let upper = remaining.length;
  let bestCount = 0;
  let bestLayout: AtlasLayout | undefined;
  while (lower <= upper) {
    const candidate = Math.floor((lower + upper) / 2);
    try {
      const layout = createAtlasLayout(
        packItems(remaining.slice(0, candidate), manifest),
        manifest.settings.maximumWidth,
        manifest.settings.maximumHeight,
        manifest.settings.powerOfTwo,
      );
      bestCount = candidate;
      bestLayout = layout;
      lower = candidate + 1;
    } catch (error: unknown) {
      if (
        error instanceof SpriteAtlasInputError &&
        error.code === "SPRITE_ATLAS_PACK_FAILED"
      ) {
        upper = candidate - 1;
        continue;
      }
      throw error;
    }
  }
  if (!bestLayout || bestCount < 1) {
    createAtlasLayout(
      packItems(remaining.slice(0, 1), manifest),
      manifest.settings.maximumWidth,
      manifest.settings.maximumHeight,
      manifest.settings.powerOfTwo,
    );
    throw new SpriteAtlasInputError(
      "SPRITE_ATLAS_PACK_FAILED",
      "The first remaining frame could not be packed.",
    );
  }
  return {
    frames: remaining.slice(0, bestCount),
    layout: bestLayout,
  };
}

function partitionPages(
  prepared: readonly PreparedAtlasFrame[],
  manifest: NormalizedSpriteAtlasManifest,
  maximumPages: number,
): readonly Readonly<{
  frames: readonly PreparedAtlasFrame[];
  layout: AtlasLayout;
}>[] {
  const byId = new Map(prepared.map((frame) => [frame.id, frame]));
  let remaining = sortPackItems(packItems(prepared, manifest)).map((item) =>
    byId.get(item.id)!,
  );
  const pages: Array<
    Readonly<{ frames: readonly PreparedAtlasFrame[]; layout: AtlasLayout }>
  > = [];
  while (remaining.length) {
    if (pages.length >= maximumPages) {
      throw new SpriteAtlasInputError(
        "SPRITE_ATLAS_PAGE_LIMIT_EXCEEDED",
        `Atlas requires more than ${maximumPages} pages.`,
      );
    }
    const page = largestPage(remaining, manifest);
    pages.push(page);
    const packedIds = new Set(page.frames.map((frame) => frame.id));
    remaining = remaining.filter((frame) => !packedIds.has(frame.id));
  }
  return pages;
}

function packageEvidence(
  packageData: SpriteAtlasPackageData,
  atlasDataSha256: string,
): SpriteAtlasPackageEvidence {
  return {
    schemaVersion: "1.0",
    atlasId: packageData.atlasId,
    sourceManifestSha256: packageData.sourceManifestSha256,
    atlasImageSha256: packageData.atlasImage.sha256,
    atlasDataSha256,
    frameSourceHashes: Object.fromEntries(
      packageData.frames.map((frame) => [frame.id, frame.sourceRgbaSha256]),
    ),
    deterministicTool: {
      name: "@evavo/art-media",
      version: SPRITE_ATLAS_BUILDER_VERSION,
    },
  };
}

async function renderPage(
  page: Readonly<{ frames: readonly PreparedAtlasFrame[]; layout: AtlasLayout }>,
  manifest: NormalizedSpriteAtlasManifest,
  sourceManifestSha256: string,
  pageIndex: number,
  pageCount: number,
): Promise<SpriteAtlasPageBuffer> {
  const rendered = renderAtlasRgba(
    page.frames,
    page.layout,
    manifest.settings.padding,
    manifest.settings.extrusion,
  );
  const atlasImage = await sharp(rendered.data, {
    raw: {
      width: page.layout.width,
      height: page.layout.height,
      channels: 4,
    },
  })
    .png({
      compressionLevel: manifest.settings.pngCompressionLevel,
      adaptiveFiltering: false,
      palette: false,
      progressive: false,
    })
    .toBuffer();
  const pageAtlasId =
    pageCount === 1
      ? manifest.atlasId
      : `${manifest.atlasId}.page-${String(pageIndex + 1).padStart(3, "0")}`;
  const packageData: SpriteAtlasPackageData = {
    schemaVersion: SPRITE_ATLAS_SCHEMA_VERSION,
    builderVersion: SPRITE_ATLAS_BUILDER_VERSION,
    atlasId: pageAtlasId,
    width: page.layout.width,
    height: page.layout.height,
    sourceManifestSha256,
    atlasImage: {
      fileName: pageFileName(
        manifest.output.imageFileName,
        pageIndex,
        pageCount,
      ),
      format: "png",
      sha256: sha256(atlasImage),
      byteLength: atlasImage.byteLength,
      colourSpace: "srgb",
      alpha: true,
    },
    settings: manifest.settings,
    frames: rendered.frames,
    animations: [],
  };
  const dataJson = `${JSON.stringify(packageData, null, 2)}\n`;
  const atlasDataSha256 = sha256(dataJson);
  const evidence = packageEvidence(packageData, atlasDataSha256);
  return {
    pageIndex,
    pageCount,
    frameIds: packageData.frames.map((frame) => frame.id).sort(),
    packageData,
    atlasImage,
    dataJson,
    evidence,
    evidenceJson: `${JSON.stringify(evidence, null, 2)}\n`,
    atlasDataSha256,
  };
}

export async function buildSpriteAtlasPagesFromEncodedFrames(
  manifestInput: SpriteAtlasManifest | unknown,
  encodedFrames: readonly EncodedAtlasSourceFrame[],
  options: BuildSpriteAtlasBufferOptions = {},
): Promise<SpriteAtlasPagesBufferResult> {
  const manifest = validateSpriteAtlasManifest(manifestInput);
  exactFrameSet(manifest, encodedFrames);
  const maximumInputBytes = boundedInteger(
    options.maximumInputBytes,
    32 * 1024 * 1024,
    1,
    512 * 1024 * 1024,
    "maximumInputBytes",
  );
  const maximumTotalInputBytes = boundedInteger(
    options.maximumTotalInputBytes,
    512 * 1024 * 1024,
    maximumInputBytes,
    4 * 1024 * 1024 * 1024,
    "maximumTotalInputBytes",
  );
  const maximumPixels = boundedInteger(
    options.maximumPixels,
    16_777_216,
    1,
    268_435_456,
    "maximumPixels",
  );
  const decodeConcurrency = boundedInteger(
    options.decodeConcurrency,
    4,
    1,
    32,
    "decodeConcurrency",
  );
  const maximumPages = boundedInteger(
    options.maximumPages,
    256,
    1,
    1_024,
    "maximumPages",
  );
  const totalBytes = encodedFrames.reduce(
    (total, frame) => total + frame.bytes.byteLength,
    0,
  );
  if (totalBytes > maximumTotalInputBytes) {
    throw new SpriteAtlasInputError(
      "SPRITE_ATLAS_TOTAL_BYTE_LIMIT_EXCEEDED",
      `Encoded frames contain ${totalBytes} bytes; limit is ${maximumTotalInputBytes}.`,
    );
  }
  const decoded = await mapLimit(
    encodedFrames,
    decodeConcurrency,
    (frame) =>
      decodeFrame(manifest, frame, maximumInputBytes, maximumPixels),
  );
  const prepared = decoded.map((frame) =>
    prepareAtlasFrame(
      frame,
      manifest.settings.trim,
      manifest.settings.alphaThreshold,
    ),
  );
  const canonicalManifest = `${stableStringify(manifest)}\n`;
  const sourceManifestSha256 = sha256(canonicalManifest);
  const pageLayouts = partitionPages(prepared, manifest, maximumPages);
  const pages = await mapLimit(
    pageLayouts,
    Math.min(4, decodeConcurrency),
    (page, pageIndex) =>
      renderPage(
        page,
        manifest,
        sourceManifestSha256,
        pageIndex,
        pageLayouts.length,
      ),
  );
  const framePageById: Record<string, number> = {};
  for (const page of pages) {
    for (const frameId of page.frameIds) {
      framePageById[frameId] = page.pageIndex;
    }
  }
  return {
    schemaVersion: "1.0",
    builderVersion: SPRITE_ATLAS_BUILDER_VERSION,
    atlasId: manifest.atlasId,
    sourceManifestSha256,
    animations: manifest.animations.map(compileAtlasAnimation),
    pages,
    framePageById,
  };
}

export async function buildSpriteAtlasPackageFromEncodedFrames(
  manifestInput: SpriteAtlasManifest | unknown,
  encodedFrames: readonly EncodedAtlasSourceFrame[],
  options: BuildSpriteAtlasBufferOptions = {},
): Promise<SpriteAtlasPackageBufferResult> {
  const result = await buildSpriteAtlasPagesFromEncodedFrames(
    manifestInput,
    encodedFrames,
    { ...options, maximumPages: 1_024 },
  );
  const page = result.pages[0];
  if (!page || result.pages.length !== 1) {
    throw new SpriteAtlasInputError(
      "SPRITE_ATLAS_MULTIPAGE_REQUIRED",
      "Frames require multiple atlas pages; use buildSpriteAtlasPagesFromEncodedFrames().",
    );
  }
  const packageData: SpriteAtlasPackageData = {
    ...page.packageData,
    animations: result.animations,
  };
  const dataJson = `${JSON.stringify(packageData, null, 2)}\n`;
  const atlasDataSha256 = sha256(dataJson);
  const evidence = packageEvidence(packageData, atlasDataSha256);
  return {
    packageData,
    atlasImage: page.atlasImage,
    dataJson,
    evidence,
    evidenceJson: `${JSON.stringify(evidence, null, 2)}\n`,
    atlasDataSha256,
  };
}
