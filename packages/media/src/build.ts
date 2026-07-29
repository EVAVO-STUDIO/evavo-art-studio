import { createHash } from "node:crypto";
import path from "node:path";

import sharp from "sharp";

import {
  atomicWriteFile,
  readBoundedFile,
  resolveAllowedRoots,
  resolveInputPath,
  resolveOutputDirectory,
} from "./files.js";
import { createAtlasLayout } from "./maxrects.js";
import { stableStringify } from "./math.js";
import { prepareAtlasFrame } from "./prepare.js";
import { renderAtlasRgba } from "./render.js";
import { compileAtlasAnimation } from "./timing.js";
import {
  SPRITE_ATLAS_BUILDER_VERSION,
  SPRITE_ATLAS_SCHEMA_VERSION,
  SpriteAtlasInputError,
  type BuildSpriteAtlasPackageOptions,
  type DecodedAtlasSourceFrame,
  type SpriteAtlasPackageData,
  type SpriteAtlasPackageEvidence,
  type SpriteAtlasPackageWriteResult,
} from "./types.js";
import { validateSpriteAtlasManifest } from "./validation.js";

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");

function portableRelativePath(base: string, candidate: string): string {
  const relative = path.relative(base, candidate).split(path.sep).join("/");
  return relative || path.basename(candidate);
}

async function decodeSourceFrame(
  id: string,
  inputPath: string,
  sourceReference: string,
  pivot: Readonly<{ x: number; y: number }> | undefined,
  allowEmpty: boolean,
  tags: readonly string[],
  maximumInputBytes: number,
  maximumPixels: number,
): Promise<DecodedAtlasSourceFrame> {
  const input = await readBoundedFile(inputPath, maximumInputBytes);
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(input, {
      failOn: "error",
      limitInputPixels: maximumPixels,
      pages: 1,
      animated: false,
    }).metadata();
  } catch (error: unknown) {
    throw new SpriteAtlasInputError(
      "SPRITE_ATLAS_FRAME_DECODE_FAILED",
      `${id} could not be decoded: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const pages = metadata.pages ?? 1;
  if (pages !== 1) {
    throw new SpriteAtlasInputError(
      "SPRITE_ATLAS_FRAME_PAGE_COUNT_INVALID",
      `${id} must contain exactly one image page.`,
    );
  }
  if (!metadata.width || !metadata.height) {
    throw new SpriteAtlasInputError(
      "SPRITE_ATLAS_FRAME_DIMENSIONS_MISSING",
      `${id} has no decoded dimensions.`,
    );
  }
  if (metadata.width * metadata.height > maximumPixels) {
    throw new SpriteAtlasInputError(
      "SPRITE_ATLAS_FRAME_PIXEL_LIMIT_EXCEEDED",
      `${id} exceeds ${maximumPixels} decoded pixels.`,
    );
  }

  const { data, info } = await sharp(input, {
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
    id,
    sourcePath: sourceReference,
    data,
    width: info.width,
    height: info.height,
    sourceFormat: metadata.format ?? "unknown",
    sourceHasAlpha: metadata.hasAlpha ?? false,
    pivot: pivot ?? { x: info.width / 2, y: Math.max(0, info.height - 1) },
    allowEmpty,
    tags,
  };
}

export async function buildSpriteAtlasPackage(
  manifestPathInput: string,
  outputDirectoryInput: string,
  options: BuildSpriteAtlasPackageOptions = {},
): Promise<SpriteAtlasPackageWriteResult> {
  const defaultRoot = path.dirname(path.resolve(manifestPathInput));
  const allowedRoots = await resolveAllowedRoots(
    options.allowedRoots?.length ? options.allowedRoots : [defaultRoot],
  );
  const manifestPath = await resolveInputPath(manifestPathInput, allowedRoots);
  const outputDirectory = await resolveOutputDirectory(
    outputDirectoryInput,
    allowedRoots,
  );
  const maximumInputBytes = options.maximumInputBytes ?? 32 * 1024 * 1024;
  const maximumPixels = options.maximumPixels ?? 16_777_216;
  const manifestBytes = await readBoundedFile(manifestPath, 2 * 1024 * 1024);

  let manifestInput: unknown;
  try {
    manifestInput = JSON.parse(manifestBytes.toString("utf8")) as unknown;
  } catch {
    throw new SpriteAtlasInputError(
      "SPRITE_ATLAS_MANIFEST_JSON_INVALID",
      "Atlas manifest must contain valid JSON.",
    );
  }
  const manifest = validateSpriteAtlasManifest(manifestInput);
  const manifestDirectory = path.dirname(manifestPath);

  const decoded: DecodedAtlasSourceFrame[] = [];
  for (const frame of manifest.frames) {
    const sourcePath = await resolveInputPath(
      path.resolve(manifestDirectory, frame.path),
      allowedRoots,
    );
    decoded.push(
      await decodeSourceFrame(
        frame.id,
        sourcePath,
        portableRelativePath(manifestDirectory, sourcePath),
        frame.pivot,
        frame.allowEmpty ?? false,
        frame.tags ?? [],
        maximumInputBytes,
        maximumPixels,
      ),
    );
  }

  const prepared = decoded.map((frame) =>
    prepareAtlasFrame(
      frame,
      manifest.settings.trim,
      manifest.settings.alphaThreshold,
    ),
  );
  const inset = manifest.settings.padding + manifest.settings.extrusion;
  const layout = createAtlasLayout(
    prepared.map((frame) => ({
      id: frame.id,
      width: frame.trim.width + inset * 2,
      height: frame.trim.height + inset * 2,
    })),
    manifest.settings.maximumWidth,
    manifest.settings.maximumHeight,
    manifest.settings.powerOfTwo,
  );
  const rendered = renderAtlasRgba(
    prepared,
    layout,
    manifest.settings.padding,
    manifest.settings.extrusion,
  );
  const atlasImage = await sharp(rendered.data, {
    raw: {
      width: layout.width,
      height: layout.height,
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

  const packageData: SpriteAtlasPackageData = {
    schemaVersion: SPRITE_ATLAS_SCHEMA_VERSION,
    builderVersion: SPRITE_ATLAS_BUILDER_VERSION,
    atlasId: manifest.atlasId,
    width: layout.width,
    height: layout.height,
    sourceManifestSha256: sha256(manifestBytes),
    atlasImage: {
      fileName: manifest.output.imageFileName,
      format: "png",
      sha256: sha256(atlasImage),
      byteLength: atlasImage.byteLength,
      colourSpace: "srgb",
      alpha: true,
    },
    settings: manifest.settings,
    frames: rendered.frames,
    animations: manifest.animations.map(compileAtlasAnimation),
  };
  const dataJson = `${JSON.stringify(packageData, null, 2)}\n`;
  const atlasDataSha256 = sha256(dataJson);
  const evidence: SpriteAtlasPackageEvidence = {
    schemaVersion: "1.0",
    atlasId: manifest.atlasId,
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
  const evidenceJson = `${JSON.stringify(evidence, null, 2)}\n`;

  const imagePath = path.join(outputDirectory, manifest.output.imageFileName);
  const dataPath = path.join(outputDirectory, manifest.output.dataFileName);
  const evidencePath = path.join(
    outputDirectory,
    manifest.output.evidenceFileName,
  );
  await atomicWriteFile(imagePath, atlasImage);
  await atomicWriteFile(dataPath, dataJson);
  await atomicWriteFile(evidencePath, evidenceJson);

  return {
    packageData,
    imagePath,
    dataPath,
    evidencePath,
    atlasDataSha256,
  };
}

export function atlasPackageFingerprint(data: SpriteAtlasPackageData): string {
  return sha256(stableStringify(data));
}
