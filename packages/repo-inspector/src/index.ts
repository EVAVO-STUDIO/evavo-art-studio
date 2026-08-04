import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { inflateSync } from "node:zlib";

import type { RepositoryArtFile, RepositoryArtSnapshot } from "@evavo/art-contracts";

export interface RepositoryInspectionOptions {
  readonly maximumFiles?: number;
  readonly maximumDepth?: number;
  readonly maximumRecordedArtFiles?: number;
  readonly maximumImageProbeBytes?: number;
  readonly maximumReferenceFileBytes?: number;
  readonly maximumReferencesPerAsset?: number;
  readonly hashConcurrency?: number;
}

export type RepositoryAssetRole =
  | "dialogue-portrait"
  | "standing-character"
  | "crew-portrait"
  | "ui-icon"
  | "weather-overlay"
  | "port-map"
  | "ship-profile"
  | "document-plate"
  | "location-background"
  | "animation-frame"
  | "editable-source"
  | "metadata"
  | "unknown";

export type RepositoryAlphaUsage =
  | "none"
  | "opaque-channel"
  | "meaningful"
  | "fully-transparent"
  | "unknown";

export type RepositoryTransparencyPolicy =
  | "preserve-authored-opaque"
  | "preserve-authored-black-stage"
  | "require-meaningful-alpha"
  | "review-required";

export interface RepositoryImageEvidence {
  readonly format: string;
  readonly width?: number;
  readonly height?: number;
  readonly bitDepth?: number;
  readonly colourModel?: string;
  readonly hasAlphaChannel: boolean;
  readonly alphaUsage: RepositoryAlphaUsage;
  readonly probeComplete: boolean;
  readonly warnings: readonly string[];
}

export interface RepositoryOptimizationRecommendation {
  readonly masterFormat: string;
  readonly runtimeFormat: string;
  readonly compression: "lossless" | "visually-lossless" | "source-only";
  readonly allowUpscale: false;
  readonly recommendedRuntimePath?: string;
  readonly notes: readonly string[];
}

export interface RepositoryAuditedArtFile extends RepositoryArtFile {
  readonly sha256: string;
  readonly role: RepositoryAssetRole;
  readonly transparencyPolicy: RepositoryTransparencyPolicy;
  readonly image?: RepositoryImageEvidence;
  readonly referencedBy: readonly string[];
  readonly referenceCount: number;
  readonly animationFamilyId?: string;
  readonly animationFrameIndex?: number;
  readonly optimization: RepositoryOptimizationRecommendation;
  readonly findings: readonly string[];
}

export interface RepositoryDuplicateGroup {
  readonly sha256: string;
  readonly canonicalPath: string;
  readonly paths: readonly string[];
  readonly totalBytes: number;
}

export interface RepositoryAnimationFamily {
  readonly id: string;
  readonly role: RepositoryAssetRole;
  readonly frames: readonly {
    readonly path: string;
    readonly frameIndex: number;
  }[];
  readonly missingFrameIndices: readonly number[];
  readonly consistentDimensions: boolean | "unknown";
  readonly recommendedFramesPerSecond: number;
  readonly loopMode: "linear" | "ping-pong" | "none";
  readonly timingNotes: readonly string[];
}

export interface RepositoryMissingAssetReference {
  readonly requestedPath: string;
  readonly referencedBy: readonly string[];
}

export interface RepositoryCleanupCandidate {
  readonly path: string;
  readonly action: "review-exact-duplicate" | "review-unreferenced-runtime";
  readonly reason: string;
  readonly requiresHumanApproval: true;
}

export interface RepositoryAssetAuditSummary {
  readonly auditedFiles: number;
  readonly exactDuplicateGroups: number;
  readonly animationFamilies: number;
  readonly missingReferences: number;
  readonly blockingFindings: number;
  readonly reviewFindings: number;
  readonly roleCounts: Readonly<Record<RepositoryAssetRole, number>>;
  readonly transparencyPolicyCounts: Readonly<Record<RepositoryTransparencyPolicy, number>>;
}

export interface RepositoryAssetAuditSnapshot extends RepositoryArtSnapshot {
  readonly analysisVersion: "1.0";
  readonly artFiles: readonly RepositoryAuditedArtFile[];
  readonly duplicateGroups: readonly RepositoryDuplicateGroup[];
  readonly animationFamilies: readonly RepositoryAnimationFamily[];
  readonly missingAssetReferences: readonly RepositoryMissingAssetReference[];
  readonly cleanupCandidates: readonly RepositoryCleanupCandidate[];
  readonly auditSummary: RepositoryAssetAuditSummary;
  readonly auditRules: readonly string[];
}

interface ScannedArtFile extends RepositoryArtFile {
  readonly absolutePath: string;
}

interface ScannedReferenceFile {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly sizeBytes: number;
}

interface ParsedImageEvidence extends RepositoryImageEvidence {
  readonly extension: string;
}

interface AssetReferenceIndex {
  readonly found: ReadonlyMap<string, readonly string[]>;
  readonly missing: readonly RepositoryMissingAssetReference[];
}

const ignoredDirectories = new Set([
  ".git",
  ".godot",
  ".next",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".cache",
  ".turbo",
]);
const imageExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
  ".gif",
  ".bmp",
  ".tga",
  ".tif",
  ".tiff",
  ".svg",
  ".exr",
  ".hdr",
]);
const animationExtensions = new Set([".apng", ".mp4", ".webm", ".mov", ".mkv"]);
const fontExtensions = new Set([".ttf", ".otf", ".woff", ".woff2"]);
const engineExtensions = new Set([".tres", ".res", ".tscn", ".scn", ".import", ".godot"]);
const sourceExtensions = new Set([".psd", ".ase", ".aseprite", ".kra", ".xcf", ".ai", ".afdesign", ".blend"]);
const metadataExtensions = new Set([".json", ".yaml", ".yml", ".toml", ".xml", ".atlas"]);
const referenceExtensions = new Set([
  ".gd",
  ".cs",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".xml",
  ".tscn",
  ".tres",
  ".godot",
  ".import",
  ".md",
]);
const referenceAssetExtensionPattern =
  "(?:png|jpe?g|webp|avif|gif|bmp|tga|tiff?|svg|exr|hdr|apng|mp4|webm|mov|mkv|tres|res)";
const runtimePrefixPattern = /^(?:assets|art|content|game|src\/assets|public\/assets)\//i;
const rawSourcePrefixPattern = /^(?:raw_art|art_drop_lfs|source_art|references?|concepts?)\//i;

function categoryFor(extension: string): RepositoryArtFile["category"] {
  if (imageExtensions.has(extension)) return "image";
  if (animationExtensions.has(extension)) return "animation";
  if (fontExtensions.has(extension)) return "font";
  if (engineExtensions.has(extension)) return "engine-resource";
  if (sourceExtensions.has(extension)) return "source-art";
  if (metadataExtensions.has(extension)) return "metadata";
  return "other";
}

function parseGodotVersion(content: string): string | undefined {
  const match = content.match(/config\/features\s*=\s*PackedStringArray\(([^)]+)\)/);
  if (!match?.[1]) return undefined;
  const versions = [...match[1].matchAll(/"([0-9]+(?:\.[0-9]+){1,2})"/g)]
    .map((entry) => entry[1])
    .filter((entry): entry is string => Boolean(entry));
  return versions[0];
}

function parseGodotViewport(content: string): { width: number; height: number } | undefined {
  const width =
    content.match(/display\/window\/size\/viewport_width\s*=\s*(\d+)/)?.[1] ??
    content.match(/display\/window\/size\/window_width_override\s*=\s*(\d+)/)?.[1];
  const height =
    content.match(/display\/window\/size\/viewport_height\s*=\s*(\d+)/)?.[1] ??
    content.match(/display\/window\/size\/window_height_override\s*=\s*(\d+)/)?.[1];
  if (!width || !height) return undefined;
  return { width: Number(width), height: Number(height) };
}

function inferGaps(files: readonly RepositoryArtFile[], engine: RepositoryArtSnapshot["engine"]): string[] {
  const names = files.map((file) => file.path.toLowerCase());
  const gaps: string[] = [];
  if (!names.some((name) => /(?:^|\/)(?:icon|app-icon|favicon)(?:[._-]|$)/.test(name))) {
    gaps.push("No clearly named application or game icon was found.");
  }
  if (!names.some((name) => /(?:splash|title|menu|main-menu)/.test(name))) {
    gaps.push("No clearly named splash, title or main-menu artwork was found.");
  }
  if (!names.some((name) => /(?:ui|hud|interface)/.test(name))) {
    gaps.push("No clearly named UI or HUD asset area was found.");
  }
  if (
    engine === "godot" &&
    !files.some((file) => file.extension === ".tres" && /sprite|frame|atlas/i.test(file.path))
  ) {
    gaps.push("No clearly named Godot SpriteFrames or atlas resource was found.");
  }
  if (!files.some((file) => file.category === "source-art")) {
    gaps.push("No editable source-art files were found; masters may not be revision-safe.");
  }
  return gaps;
}

function normalizeRepositoryPath(value: string): string {
  const normalized = value
    .replaceAll("\\", "/")
    .replace(/^res:\/\//i, "")
    .replace(/^\.\//, "")
    .replace(/\/{2,}/g, "/");
  try {
    return decodeURIComponent(normalized).normalize("NFC");
  } catch {
    return normalized.normalize("NFC");
  }
}

function canonicalLookupKey(value: string): string {
  return normalizeRepositoryPath(value).toLocaleLowerCase("en-US");
}

async function sha256File(filePath: string): Promise<string> {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) digest.update(chunk as Buffer);
  return digest.digest("hex");
}

function pngPaeth(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function analysePngAlpha(input: {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: number;
  readonly colourType: number;
  readonly interlace: number;
  readonly idat: readonly Buffer[];
}): { alphaUsage: RepositoryAlphaUsage; probeComplete: boolean; warning?: string } {
  const channels = input.colourType === 6 ? 4 : input.colourType === 4 ? 2 : 0;
  if (
    channels === 0 ||
    input.interlace !== 0 ||
    ![8, 16].includes(input.bitDepth) ||
    input.width <= 0 ||
    input.height <= 0
  ) {
    return {
      alphaUsage: "unknown",
      probeComplete: false,
      warning: "PNG alpha pixels require a supported non-interlaced greyscale-alpha or RGBA layout.",
    };
  }
  const bytesPerSample = input.bitDepth / 8;
  const bytesPerPixel = channels * bytesPerSample;
  const rowBytes = input.width * bytesPerPixel;
  const expectedBytes = input.height * (rowBytes + 1);
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes > 256 * 1024 * 1024) {
    return {
      alphaUsage: "unknown",
      probeComplete: false,
      warning: "PNG decoded canvas exceeds the bounded 256 MiB alpha-probe limit.",
    };
  }
  let inflated: Buffer;
  try {
    inflated = inflateSync(Buffer.concat(input.idat), { maxOutputLength: expectedBytes });
  } catch {
    return {
      alphaUsage: "unknown",
      probeComplete: false,
      warning: "PNG IDAT data could not be decompressed for alpha inspection.",
    };
  }
  if (inflated.length < expectedBytes) {
    return {
      alphaUsage: "unknown",
      probeComplete: false,
      warning: "PNG scanline data is shorter than the declared canvas.",
    };
  }

  const previous = Buffer.alloc(rowBytes);
  const current = Buffer.alloc(rowBytes);
  const maximumAlpha = input.bitDepth === 16 ? 65_535 : 255;
  const alphaOffset = (input.colourType === 6 ? 3 : 1) * bytesPerSample;
  let cursor = 0;
  let hasVisiblePixel = false;
  let hasNonOpaquePixel = false;
  let hasOpaquePixel = false;

  for (let rowIndex = 0; rowIndex < input.height; rowIndex += 1) {
    const filter = inflated[cursor] ?? 0;
    cursor += 1;
    for (let index = 0; index < rowBytes; index += 1) {
      const encoded = inflated[cursor + index] ?? 0;
      const left = index >= bytesPerPixel ? current[index - bytesPerPixel] ?? 0 : 0;
      const above = previous[index] ?? 0;
      const upperLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] ?? 0 : 0;
      let decoded: number;
      switch (filter) {
        case 0:
          decoded = encoded;
          break;
        case 1:
          decoded = encoded + left;
          break;
        case 2:
          decoded = encoded + above;
          break;
        case 3:
          decoded = encoded + Math.floor((left + above) / 2);
          break;
        case 4:
          decoded = encoded + pngPaeth(left, above, upperLeft);
          break;
        default:
          return {
            alphaUsage: "unknown",
            probeComplete: false,
            warning: `PNG uses unsupported scanline filter ${filter}.`,
          };
      }
      current[index] = decoded & 0xff;
    }
    cursor += rowBytes;

    for (let pixel = 0; pixel < input.width; pixel += 1) {
      const offset = pixel * bytesPerPixel + alphaOffset;
      const alpha =
        input.bitDepth === 16
          ? ((current[offset] ?? 0) << 8) | (current[offset + 1] ?? 0)
          : current[offset] ?? 0;
      if (alpha > 0) hasVisiblePixel = true;
      if (alpha < maximumAlpha) hasNonOpaquePixel = true;
      if (alpha === maximumAlpha) hasOpaquePixel = true;
    }
    previous.set(current);
  }

  if (!hasVisiblePixel) return { alphaUsage: "fully-transparent", probeComplete: true };
  if (hasNonOpaquePixel) return { alphaUsage: "meaningful", probeComplete: true };
  if (hasOpaquePixel) return { alphaUsage: "opaque-channel", probeComplete: true };
  return { alphaUsage: "unknown", probeComplete: false };
}

function parsePng(buffer: Buffer): ParsedImageEvidence | undefined {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(signature)) return undefined;
  let offset = 8;
  let width: number | undefined;
  let height: number | undefined;
  let bitDepth: number | undefined;
  let colourType: number | undefined;
  let interlace = 0;
  let transparentChunk = false;
  const idat: Buffer[] = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) break;
    if (type === "IHDR" && length >= 13) {
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer[dataStart + 8];
      colourType = buffer[dataStart + 9];
      interlace = buffer[dataStart + 12] ?? 0;
    } else if (type === "IDAT") {
      idat.push(buffer.subarray(dataStart, dataEnd));
    } else if (type === "tRNS") {
      transparentChunk = true;
    }
    offset = dataEnd + 4;
    if (type === "IEND") break;
  }
  if (!width || !height || bitDepth === undefined || colourType === undefined) return undefined;
  const colourModels: Readonly<Record<number, string>> = {
    0: "greyscale",
    2: "rgb",
    3: "indexed",
    4: "greyscale-alpha",
    6: "rgba",
  };
  const hasAlphaChannel = colourType === 4 || colourType === 6 || transparentChunk;
  const warnings: string[] = [];
  let alphaUsage: RepositoryAlphaUsage = "none";
  let probeComplete = true;
  if (colourType === 4 || colourType === 6) {
    const alpha = analysePngAlpha({ width, height, bitDepth, colourType, interlace, idat });
    alphaUsage = alpha.alphaUsage;
    probeComplete = alpha.probeComplete;
    if (alpha.warning) warnings.push(alpha.warning);
  } else if (transparentChunk) {
    alphaUsage = "unknown";
    probeComplete = false;
    warnings.push("PNG tRNS transparency is present but indexed pixel use was not decoded.");
  }
  return {
    extension: ".png",
    format: "png",
    width,
    height,
    bitDepth,
    colourModel: colourModels[colourType] ?? `png-colour-type-${colourType}`,
    hasAlphaChannel,
    alphaUsage,
    probeComplete,
    warnings,
  };
}

function parseJpeg(buffer: Buffer): ParsedImageEvidence | undefined {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return undefined;
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    while (offset < buffer.length && buffer[offset] !== 0xff) offset += 1;
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    if (startOfFrame.has(marker) && length >= 8) {
      return {
        extension: ".jpg",
        format: "jpeg",
        width: buffer.readUInt16BE(offset + 5),
        height: buffer.readUInt16BE(offset + 3),
        bitDepth: buffer[offset + 2] ?? 8,
        colourModel: "jpeg",
        hasAlphaChannel: false,
        alphaUsage: "none",
        probeComplete: true,
        warnings: [],
      };
    }
    offset += length;
  }
  return undefined;
}

function readUInt24LE(buffer: Buffer, offset: number): number {
  return (buffer[offset] ?? 0) | ((buffer[offset + 1] ?? 0) << 8) | ((buffer[offset + 2] ?? 0) << 16);
}

function parseWebp(buffer: Buffer): ParsedImageEvidence | undefined {
  if (
    buffer.length < 16 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return undefined;
  }
  let offset = 12;
  let width: number | undefined;
  let height: number | undefined;
  let hasAlphaChannel = false;
  let alphaDeclaredUsed = false;
  const warnings: string[] = [];
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    if (dataEnd > buffer.length) break;
    if (type === "VP8X" && size >= 10) {
      const flags = buffer[dataStart] ?? 0;
      hasAlphaChannel ||= (flags & 0x10) !== 0;
      width = readUInt24LE(buffer, dataStart + 4) + 1;
      height = readUInt24LE(buffer, dataStart + 7) + 1;
    } else if (type === "ALPH") {
      hasAlphaChannel = true;
      alphaDeclaredUsed = true;
    } else if (type === "VP8L" && size >= 5 && buffer[dataStart] === 0x2f) {
      const bits = buffer.readUInt32LE(dataStart + 1);
      width ??= (bits & 0x3fff) + 1;
      height ??= ((bits >>> 14) & 0x3fff) + 1;
      alphaDeclaredUsed ||= ((bits >>> 28) & 1) === 1;
      hasAlphaChannel ||= alphaDeclaredUsed;
    } else if (
      type === "VP8 " &&
      size >= 10 &&
      buffer[dataStart + 3] === 0x9d &&
      buffer[dataStart + 4] === 0x01 &&
      buffer[dataStart + 5] === 0x2a
    ) {
      width ??= buffer.readUInt16LE(dataStart + 6) & 0x3fff;
      height ??= buffer.readUInt16LE(dataStart + 8) & 0x3fff;
    }
    offset = dataEnd + (size % 2);
  }
  if (hasAlphaChannel) {
    warnings.push("WebP alpha is declared, but compressed pixel alpha requires decoded-image QA for final approval.");
  }
  return {
    extension: ".webp",
    format: "webp",
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    colourModel: "webp",
    hasAlphaChannel,
    alphaUsage: hasAlphaChannel || alphaDeclaredUsed ? "unknown" : "none",
    probeComplete: !hasAlphaChannel,
    warnings,
  };
}

function parseGif(buffer: Buffer): ParsedImageEvidence | undefined {
  const header = buffer.toString("ascii", 0, 6);
  if (buffer.length < 13 || (header !== "GIF87a" && header !== "GIF89a")) return undefined;
  let transparent = false;
  for (let offset = 13; offset + 7 <= buffer.length; offset += 1) {
    if (
      buffer[offset] === 0x21 &&
      buffer[offset + 1] === 0xf9 &&
      buffer[offset + 2] === 0x04 &&
      ((buffer[offset + 3] ?? 0) & 0x01) !== 0
    ) {
      transparent = true;
      break;
    }
  }
  return {
    extension: ".gif",
    format: "gif",
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8),
    bitDepth: ((buffer[10] ?? 0) & 0x07) + 1,
    colourModel: "indexed",
    hasAlphaChannel: transparent,
    alphaUsage: transparent ? "unknown" : "none",
    probeComplete: !transparent,
    warnings: transparent
      ? ["GIF transparency is declared; decode animated frames before promotion."]
      : [],
  };
}

function parseBmp(buffer: Buffer): ParsedImageEvidence | undefined {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 2) !== "BM") return undefined;
  const bitDepth = buffer.readUInt16LE(28);
  const hasAlphaChannel = bitDepth === 32;
  return {
    extension: ".bmp",
    format: "bmp",
    width: Math.abs(buffer.readInt32LE(18)),
    height: Math.abs(buffer.readInt32LE(22)),
    bitDepth,
    colourModel: "bmp",
    hasAlphaChannel,
    alphaUsage: hasAlphaChannel ? "unknown" : "none",
    probeComplete: !hasAlphaChannel,
    warnings: hasAlphaChannel
      ? ["BMP contains 32-bit pixels; decode alpha before deciding whether transparency is meaningful."]
      : [],
  };
}

function parseTga(buffer: Buffer): ParsedImageEvidence | undefined {
  if (buffer.length < 18) return undefined;
  const imageType = buffer[2] ?? 0;
  if (![1, 2, 3, 9, 10, 11].includes(imageType)) return undefined;
  const width = buffer.readUInt16LE(12);
  const height = buffer.readUInt16LE(14);
  if (!width || !height) return undefined;
  const bitDepth = buffer[16] ?? 0;
  const alphaBits = (buffer[17] ?? 0) & 0x0f;
  const hasAlphaChannel = alphaBits > 0 || bitDepth === 32;
  return {
    extension: ".tga",
    format: "tga",
    width,
    height,
    bitDepth,
    colourModel: "tga",
    hasAlphaChannel,
    alphaUsage: hasAlphaChannel ? "unknown" : "none",
    probeComplete: !hasAlphaChannel,
    warnings: hasAlphaChannel
      ? ["TGA declares alpha bits; decode pixel alpha before promotion."]
      : [],
  };
}

function parseSvg(buffer: Buffer): ParsedImageEvidence | undefined {
  const content = buffer.subarray(0, Math.min(buffer.length, 256 * 1024)).toString("utf8");
  if (!/<svg\b/i.test(content)) return undefined;
  const numeric = (value: string | undefined): number | undefined => {
    if (!value) return undefined;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };
  let width = numeric(content.match(/<svg\b[^>]*\bwidth=["']\s*([0-9.]+)/i)?.[1]);
  let height = numeric(content.match(/<svg\b[^>]*\bheight=["']\s*([0-9.]+)/i)?.[1]);
  const viewBox = content
    .match(/<svg\b[^>]*\bviewBox=["']\s*([-.0-9]+)[ ,]+([-.0-9]+)[ ,]+([0-9.]+)[ ,]+([0-9.]+)/i)
    ?.slice(1)
    .map(Number);
  if ((!width || !height) && viewBox?.length === 4) {
    width ??= viewBox[2];
    height ??= viewBox[3];
  }
  return {
    extension: ".svg",
    format: "svg",
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    colourModel: "vector",
    hasAlphaChannel: true,
    alphaUsage: "unknown",
    probeComplete: false,
    warnings: ["SVG transparency and filters require rendered-pixel QA for final approval."],
  };
}

function parseImageEvidence(buffer: Buffer, extension: string): RepositoryImageEvidence {
  const parsed =
    parsePng(buffer) ??
    parseJpeg(buffer) ??
    parseWebp(buffer) ??
    parseGif(buffer) ??
    parseBmp(buffer) ??
    (extension === ".tga" ? parseTga(buffer) : undefined) ??
    (extension === ".svg" ? parseSvg(buffer) : undefined);
  if (parsed) {
    const { extension: _ignored, ...evidence } = parsed;
    return evidence;
  }
  return {
    format: extension.replace(/^\./, "") || "unknown",
    hasAlphaChannel: false,
    alphaUsage: "unknown",
    probeComplete: false,
    warnings: ["Image format was inventoried but not decoded by the bounded repository probe."],
  };
}

function inferRole(file: RepositoryArtFile): RepositoryAssetRole {
  if (file.category === "source-art") return "editable-source";
  if (file.category === "metadata" || file.category === "engine-resource") return "metadata";
  const value = file.path.toLowerCase().replaceAll("\\", "/");
  if (/(?:dialogue|dialog|conversation|close[-_ ]?up|talking[-_ ]?head)/.test(value)) {
    return "dialogue-portrait";
  }
  if (/(?:standing|full[-_ ]?body|room[-_ ]?sprite|character[-_ ]?spot)/.test(value)) {
    return "standing-character";
  }
  if (/(?:crew[-_/ ]?hiring|crew[-_/ ]?portrait|portraits?\/crew|captain|first[-_ ]?mate|boatswain)/.test(value)) {
    return "crew-portrait";
  }
  if (/(?:weather|rain|snow|fog|storm|spray|foam|glint|reflection|lightning|cloud)/.test(value)) {
    return "weather-overlay";
  }
  if (/(?:port[-_ ]?map|maps?\/ports?|regional[-_ ]?map|world[-_ ]?map)/.test(value)) {
    return "port-map";
  }
  if (/(?:ship|vessel|schooner|brig|barque|steamer).*(?:profile|preview|silhouette|icon)|(?:profiles?|previews?)\/.*(?:ship|vessel)/.test(value)) {
    return "ship-profile";
  }
  if (/(?:document|paper|bill[-_ ]?of[-_ ]?sale|contract|permit|certificate|ledger[-_ ]?page|cheque|draft)/.test(value)) {
    return "document-plate";
  }
  if (/(?:icon|icons\/|ui\/|hud|interface|button|cursor|badge|marker)/.test(value)) {
    return "ui-icon";
  }
  if (/(?:background|locations?\/|room|interior|exterior|docks?|wharf|shipyard|tavern|warehouse|house|street|alley|harbou?r)/.test(value)) {
    return "location-background";
  }
  if (/(?:frame|frames\/|sprite|animation|anim\/)/.test(value)) return "animation-frame";
  return "unknown";
}

function transparencyPolicyFor(role: RepositoryAssetRole): RepositoryTransparencyPolicy {
  switch (role) {
    case "dialogue-portrait":
      return "preserve-authored-black-stage";
    case "standing-character":
    case "crew-portrait":
    case "ui-icon":
    case "weather-overlay":
    case "ship-profile":
    case "animation-frame":
      return "require-meaningful-alpha";
    case "port-map":
    case "document-plate":
    case "location-background":
      return "preserve-authored-opaque";
    default:
      return "review-required";
  }
}

function cleanAssetStem(filePath: string): string {
  const parsed = path.posix.parse(filePath.replaceAll("\\", "/"));
  const stem = parsed.name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return stem || "asset";
}

function recommendedRuntimePath(file: RepositoryArtFile, role: RepositoryAssetRole): string | undefined {
  if (!["image", "animation"].includes(file.category)) return undefined;
  const stem = cleanAssetStem(file.path);
  const folder: Readonly<Record<RepositoryAssetRole, string>> = {
    "dialogue-portrait": "assets/art/portraits/dialogue",
    "standing-character": "assets/art/characters/standing",
    "crew-portrait": "assets/art/portraits/crew",
    "ui-icon": "assets/art/ui/icons",
    "weather-overlay": "assets/art/fx/weather",
    "port-map": "assets/art/maps/ports",
    "ship-profile": "assets/art/ships/profiles",
    "document-plate": "assets/art/ui/documents",
    "location-background": "assets/art/locations",
    "animation-frame": "assets/art/animations",
    "editable-source": "source/art",
    metadata: "assets/art/metadata",
    unknown: "assets/art/review",
  };
  return `${folder[role]}/${stem}.webp`;
}

function optimizationFor(
  file: RepositoryArtFile,
  role: RepositoryAssetRole,
  policy: RepositoryTransparencyPolicy,
): RepositoryOptimizationRecommendation {
  if (file.category === "source-art") {
    return {
      masterFormat: file.extension.replace(/^\./, "") || "editable-source",
      runtimeFormat: "none",
      compression: "source-only",
      allowUpscale: false,
      notes: ["Retain editable source as a revision master; produce governed runtime derivatives separately."],
    };
  }
  if (!["image", "animation"].includes(file.category)) {
    return {
      masterFormat: file.extension.replace(/^\./, "") || "source",
      runtimeFormat: "preserve",
      compression: "source-only",
      allowUpscale: false,
      notes: ["This file is supporting metadata or an engine resource, not a raster derivative."],
    };
  }
  const lossless =
    policy === "require-meaningful-alpha" ||
    role === "dialogue-portrait" ||
    role === "document-plate" ||
    role === "ui-icon";
  const runtimePath = recommendedRuntimePath(file, role);
  return {
    masterFormat: "png-or-editable-source",
    runtimeFormat: "webp",
    compression: lossless ? "lossless" : "visually-lossless",
    allowUpscale: false,
    ...(runtimePath ? { recommendedRuntimePath: runtimePath } : {}),
    notes: [
      lossless
        ? "Use a lossless WebP runtime derivative and retain a lossless or editable master."
        : "Use a visually lossless WebP derivative after side-by-side visual approval.",
      "Never recursively compress a runtime derivative or silently upscale a smaller source.",
    ],
  };
}

function findingsFor(input: {
  readonly file: RepositoryArtFile;
  readonly role: RepositoryAssetRole;
  readonly policy: RepositoryTransparencyPolicy;
  readonly image?: RepositoryImageEvidence;
  readonly viewport?: { width: number; height: number };
  readonly referenceCount: number;
}): string[] {
  const findings: string[] = [];
  const { file, role, policy, image, viewport, referenceCount } = input;
  if (image) {
    for (const warning of image.warnings) findings.push(`review: ${warning}`);
    if (policy === "require-meaningful-alpha") {
      if (image.alphaUsage === "none" || image.alphaUsage === "opaque-channel") {
        findings.push("blocking: this role requires meaningful transparency, but the encoded image is fully opaque.");
      } else if (image.alphaUsage === "fully-transparent") {
        findings.push("blocking: the image is entirely transparent and contains no visible subject pixels.");
      } else if (image.alphaUsage === "unknown") {
        findings.push("review: meaningful alpha must be proven with decoded-pixel QA before promotion.");
      }
    }
    if (
      policy === "preserve-authored-opaque" &&
      ["meaningful", "fully-transparent"].includes(image.alphaUsage)
    ) {
      findings.push("review: this full-plate role normally remains opaque; confirm that transparent pixels are intentional.");
    }
    if (policy === "preserve-authored-black-stage" && image.alphaUsage === "meaningful") {
      findings.push("review: dialogue close-ups normally retain their authored black presentation stage; do not remove black by threshold.");
    }
    if (image.width && image.height) {
      if (image.width > 8192 || image.height > 8192) {
        findings.push("review: canvas exceeds 8192 pixels on one axis; confirm target texture limits and derivative strategy.");
      }
      if (
        viewport &&
        ["location-background", "port-map"].includes(role) &&
        (image.width < viewport.width || image.height < viewport.height)
      ) {
        findings.push(
          `review: ${image.width}×${image.height} is below the configured ${viewport.width}×${viewport.height} viewport; do not upscale silently.`,
        );
      }
      if (role === "ui-icon" && image.width !== image.height) {
        findings.push("review: UI icon canvas is not square; confirm the authored hitbox and visual centring contract.");
      }
    } else if (file.category === "image") {
      findings.push("review: image dimensions were not resolved by the bounded probe.");
    }
  }
  if (file.sizeBytes > 25 * 1024 * 1024) {
    findings.push("review: source exceeds 25 MiB; keep it out of ordinary runtime delivery and use governed large-file transport.");
  }
  if (/\s|[A-Z]/.test(file.path) && ["image", "animation"].includes(file.category)) {
    findings.push("review: normalize runtime names to lowercase snake_case while retaining immutable source provenance.");
  }
  if (runtimePrefixPattern.test(file.path) && referenceCount === 0 && ["image", "animation"].includes(file.category)) {
    findings.push("review: no static code or resource reference was found; dynamic lookup may still own this asset.");
  }
  return findings;
}

function animationIdentity(filePath: string): { familyId: string; frameIndex: number } | undefined {
  const normalized = filePath.replaceAll("\\", "/");
  const parsed = path.posix.parse(normalized);
  const match = parsed.name.match(/^(.*?)(?:[_ .-](?:frame[_ .-]?)?)?(\d{1,4})$/i);
  if (!match?.[1] || !match[2]) return undefined;
  const frameIndex = Number(match[2]);
  if (!Number.isSafeInteger(frameIndex)) return undefined;
  const familyStem = match[1].replace(/[_ .-]+$/g, "").toLowerCase();
  if (!familyStem) return undefined;
  return {
    familyId: `${parsed.dir.toLowerCase()}/${familyStem}`.replace(/^\//, ""),
    frameIndex,
  };
}

function animationTiming(familyId: string): {
  fps: number;
  loopMode: RepositoryAnimationFamily["loopMode"];
  notes: string[];
} {
  if (/(?:water|glint|reflection|fog|mist|smoke)/.test(familyId)) {
    return {
      fps: 4,
      loopMode: "linear",
      notes: ["Use slow playback or cross-fades so horizon and fog silhouettes do not jump."],
    };
  }
  if (/(?:rain|snow)/.test(familyId)) {
    return {
      fps: 10,
      loopMode: "linear",
      notes: ["Offset starting phases when multiple overlays are visible to avoid mechanical synchronisation."],
    };
  }
  if (/(?:storm|spray|foam|lightning)/.test(familyId)) {
    return {
      fps: 8,
      loopMode: "linear",
      notes: ["Review the loop seam at gameplay speed and retain soft alpha edges."],
    };
  }
  if (/(?:run|sprint)/.test(familyId)) {
    return { fps: 12, loopMode: "linear", notes: ["Verify foot plant, baseline and contact timing."] };
  }
  if (/(?:walk|talk)/.test(familyId)) {
    return { fps: 8, loopMode: "linear", notes: ["Use exact per-frame durations when holds differ."] };
  }
  if (/(?:idle|breathe|blink)/.test(familyId)) {
    return { fps: 4, loopMode: "ping-pong", notes: ["Prefer held key poses over duplicating unrelated generated frames."] };
  }
  return { fps: 8, loopMode: "linear", notes: ["Treat this as a starting point; approve exact frame durations in the sequence manifest."] };
}

function buildAnimationFamilies(files: readonly RepositoryAuditedArtFile[]): RepositoryAnimationFamily[] {
  const groups = new Map<string, RepositoryAuditedArtFile[]>();
  for (const file of files) {
    if (!file.animationFamilyId || file.animationFrameIndex === undefined) continue;
    const group = groups.get(file.animationFamilyId) ?? [];
    group.push(file);
    groups.set(file.animationFamilyId, group);
  }
  return [...groups.entries()]
    .filter(([, frames]) => frames.length >= 2)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, sourceFrames]) => {
      const frames = [...sourceFrames].sort(
        (left, right) =>
          (left.animationFrameIndex ?? 0) - (right.animationFrameIndex ?? 0) ||
          left.path.localeCompare(right.path),
      );
      const indices = frames.map((frame) => frame.animationFrameIndex ?? 0);
      const minimum = Math.min(...indices);
      const maximum = Math.max(...indices);
      const available = new Set(indices);
      const missingFrameIndices: number[] = [];
      for (let index = minimum; index <= maximum; index += 1) {
        if (!available.has(index)) missingFrameIndices.push(index);
      }
      const dimensions = frames
        .map((frame) => frame.image)
        .filter((image): image is RepositoryImageEvidence => Boolean(image?.width && image?.height))
        .map((image) => `${image.width}x${image.height}`);
      const consistentDimensions: boolean | "unknown" =
        dimensions.length !== frames.length ? "unknown" : new Set(dimensions).size === 1;
      const timing = animationTiming(id);
      return {
        id,
        role: frames[0]?.role ?? "animation-frame",
        frames: frames.map((frame) => ({
          path: frame.path,
          frameIndex: frame.animationFrameIndex ?? 0,
        })),
        missingFrameIndices,
        consistentDimensions,
        recommendedFramesPerSecond: timing.fps,
        loopMode: timing.loopMode,
        timingNotes: timing.notes,
      };
    });
}

function canonicalDuplicatePath(paths: readonly string[]): string {
  return [...paths].sort((left, right) => {
    const score = (value: string): number => {
      const normalized = value.toLowerCase();
      if (/^assets\//.test(normalized)) return 0;
      if (/^(?:source|art)\//.test(normalized) && !rawSourcePrefixPattern.test(normalized)) return 1;
      if (rawSourcePrefixPattern.test(normalized)) return 3;
      return 2;
    };
    return score(left) - score(right) || left.length - right.length || left.localeCompare(right);
  })[0] ?? paths[0] ?? "";
}

function buildDuplicateGroups(files: readonly RepositoryAuditedArtFile[]): RepositoryDuplicateGroup[] {
  const groups = new Map<string, RepositoryAuditedArtFile[]>();
  for (const file of files) {
    const group = groups.get(file.sha256) ?? [];
    group.push(file);
    groups.set(file.sha256, group);
  }
  return [...groups.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([sha256, entries]) => {
      const paths = entries.map((entry) => entry.path).sort();
      return {
        sha256,
        canonicalPath: canonicalDuplicatePath(paths),
        paths,
        totalBytes: entries.reduce((sum, entry) => sum + entry.sizeBytes, 0),
      };
    })
    .sort((left, right) => left.canonicalPath.localeCompare(right.canonicalPath));
}

function buildCleanupCandidates(
  files: readonly RepositoryAuditedArtFile[],
  duplicateGroups: readonly RepositoryDuplicateGroup[],
): RepositoryCleanupCandidate[] {
  const candidates: RepositoryCleanupCandidate[] = [];
  for (const group of duplicateGroups) {
    for (const duplicate of group.paths) {
      if (duplicate === group.canonicalPath) continue;
      candidates.push({
        path: duplicate,
        action: "review-exact-duplicate",
        reason: `Exact SHA-256 duplicate of ${group.canonicalPath}; remove only after runtime and provenance review.`,
        requiresHumanApproval: true,
      });
    }
  }
  for (const file of files) {
    if (
      runtimePrefixPattern.test(file.path) &&
      file.referenceCount === 0 &&
      ["image", "animation"].includes(file.category) &&
      !candidates.some((candidate) => candidate.path === file.path)
    ) {
      candidates.push({
        path: file.path,
        action: "review-unreferenced-runtime",
        reason: "No static reference was found; dynamic paths, editor assignment and release manifests must be checked before deletion.",
        requiresHumanApproval: true,
      });
    }
  }
  return candidates.sort((left, right) => left.path.localeCompare(right.path));
}

async function mapLimit<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, values.length || 1)) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) return;
      output[index] = await mapper(values[index] as T, index);
    }
  });
  await Promise.all(workers);
  return output;
}

function extractAssetReferences(content: string): string[] {
  const references = new Set<string>();
  const patterns = [
    new RegExp(`res:\\/\\/([^"'\\s)\\]}]+\\.${referenceAssetExtensionPattern})`, "gi"),
    new RegExp(`(?:^|["'\\s(])((?:assets|art|content|game|public|RAW_ART|ART_DROP_LFS|source_art)\\/[^"'\\s)\\]}]+\\.${referenceAssetExtensionPattern})`, "gim"),
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const value = match[1];
      if (value) references.add(normalizeRepositoryPath(value.replace(/[;,]+$/g, "")));
    }
  }
  return [...references].sort();
}

async function buildReferenceIndex(
  artFiles: readonly ScannedArtFile[],
  referenceFiles: readonly ScannedReferenceFile[],
  maximumReferencesPerAsset: number,
): Promise<AssetReferenceIndex> {
  const artByKey = new Map(artFiles.map((file) => [canonicalLookupKey(file.path), file.path]));
  const foundMutable = new Map<string, Set<string>>();
  const missingMutable = new Map<string, Set<string>>();
  for (const source of referenceFiles) {
    let content: string;
    try {
      content = await readFile(source.absolutePath, "utf8");
    } catch {
      continue;
    }
    for (const requestedPath of extractAssetReferences(content)) {
      const key = canonicalLookupKey(requestedPath);
      const actual = artByKey.get(key);
      const target = actual ? foundMutable : missingMutable;
      const targetKey = actual ?? requestedPath;
      const sources = target.get(targetKey) ?? new Set<string>();
      if (sources.size < maximumReferencesPerAsset) sources.add(source.relativePath);
      target.set(targetKey, sources);
    }
  }
  return {
    found: new Map(
      [...foundMutable.entries()].map(([asset, sources]) => [asset, [...sources].sort()] as const),
    ),
    missing: [...missingMutable.entries()]
      .map(([requestedPath, sources]) => ({
        requestedPath,
        referencedBy: [...sources].sort(),
      }))
      .sort((left, right) => left.requestedPath.localeCompare(right.requestedPath)),
  };
}

function roleCounts(files: readonly RepositoryAuditedArtFile[]): Record<RepositoryAssetRole, number> {
  const counts: Record<RepositoryAssetRole, number> = {
    "dialogue-portrait": 0,
    "standing-character": 0,
    "crew-portrait": 0,
    "ui-icon": 0,
    "weather-overlay": 0,
    "port-map": 0,
    "ship-profile": 0,
    "document-plate": 0,
    "location-background": 0,
    "animation-frame": 0,
    "editable-source": 0,
    metadata: 0,
    unknown: 0,
  };
  for (const file of files) counts[file.role] += 1;
  return counts;
}

function policyCounts(
  files: readonly RepositoryAuditedArtFile[],
): Record<RepositoryTransparencyPolicy, number> {
  const counts: Record<RepositoryTransparencyPolicy, number> = {
    "preserve-authored-opaque": 0,
    "preserve-authored-black-stage": 0,
    "require-meaningful-alpha": 0,
    "review-required": 0,
  };
  for (const file of files) counts[file.transparencyPolicy] += 1;
  return counts;
}

export async function inspectRepository(
  rootInput: string,
  options: RepositoryInspectionOptions = {},
): Promise<RepositoryAssetAuditSnapshot> {
  const root = await realpath(rootInput);
  const maximumFiles = options.maximumFiles ?? 25_000;
  const maximumDepth = options.maximumDepth ?? 14;
  const maximumRecordedArtFiles = options.maximumRecordedArtFiles ?? 5_000;
  const maximumImageProbeBytes = options.maximumImageProbeBytes ?? 64 * 1024 * 1024;
  const maximumReferenceFileBytes = options.maximumReferenceFileBytes ?? 2 * 1024 * 1024;
  const maximumReferencesPerAsset = options.maximumReferencesPerAsset ?? 20;
  const hashConcurrency = options.hashConcurrency ?? 8;
  const queue: Array<{ absolute: string; depth: number }> = [{ absolute: root, depth: 0 }];
  const scannedArtFiles: ScannedArtFile[] = [];
  const referenceFiles: ScannedReferenceFile[] = [];
  const extensionCounts: Record<string, number> = {};
  const categoryCounts: Record<RepositoryArtFile["category"], number> = {
    image: 0,
    animation: 0,
    font: 0,
    "engine-resource": 0,
    "source-art": 0,
    metadata: 0,
    other: 0,
  };
  let filesScanned = 0;
  let truncated = false;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (current.depth > maximumDepth) {
      truncated = true;
      continue;
    }
    const entries = await readdir(current.absolute, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (filesScanned >= maximumFiles) {
        truncated = true;
        queue.length = 0;
        break;
      }
      const absolute = path.join(current.absolute, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) queue.push({ absolute, depth: current.depth + 1 });
        continue;
      }
      if (!entry.isFile()) continue;
      const stats = await lstat(absolute);
      if (stats.isSymbolicLink()) continue;
      filesScanned += 1;
      const relativePath = path.relative(root, absolute).split(path.sep).join("/").normalize("NFC");
      const extension = path.extname(entry.name).toLowerCase();
      extensionCounts[extension || "<none>"] = (extensionCounts[extension || "<none>"] ?? 0) + 1;
      const category = categoryFor(extension);
      categoryCounts[category] += 1;
      if (category !== "other") {
        if (scannedArtFiles.length < maximumRecordedArtFiles) {
          scannedArtFiles.push({
            absolutePath: absolute,
            path: relativePath,
            extension,
            sizeBytes: stats.size,
            category,
          });
        } else {
          truncated = true;
        }
      }
      if (referenceExtensions.has(extension) && stats.size <= maximumReferenceFileBytes) {
        referenceFiles.push({ absolutePath: absolute, relativePath, sizeBytes: stats.size });
      }
    }
  }

  let engine: RepositoryArtSnapshot["engine"] = "unknown";
  let engineVersionHint: string | undefined;
  let viewport: { width: number; height: number } | undefined;
  let projectName = path.basename(root);
  const signals: string[] = [];

  try {
    const godot = await readFile(path.join(root, "project.godot"), "utf8");
    engine = "godot";
    engineVersionHint = parseGodotVersion(godot);
    viewport = parseGodotViewport(godot);
    const name = godot.match(/config\/name\s*=\s*"([^"]+)"/)?.[1];
    if (name) projectName = name;
    signals.push("Found project.godot at repository root.");
    if (engineVersionHint) signals.push(`Godot feature version hint: ${engineVersionHint}.`);
    if (viewport) signals.push(`Configured viewport: ${viewport.width}×${viewport.height}.`);
  } catch {
    try {
      const unityVersion = await readFile(path.join(root, "ProjectSettings", "ProjectVersion.txt"), "utf8");
      engine = "unity";
      const version = unityVersion.match(/m_EditorVersion:\s*([^\r\n]+)/)?.[1]?.trim();
      if (version) engineVersionHint = version;
      signals.push("Found Unity ProjectSettings/ProjectVersion.txt.");
    } catch {
      try {
        const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
          name?: unknown;
        };
        engine = "web";
        if (typeof packageJson.name === "string" && packageJson.name.length > 0) {
          projectName = packageJson.name;
        }
        signals.push("Found a web package.json at repository root.");
      } catch {
        signals.push("No supported engine marker was found at repository root.");
      }
    }
  }

  const referenceIndex = await buildReferenceIndex(
    scannedArtFiles,
    referenceFiles,
    maximumReferencesPerAsset,
  );
  const artFiles = await mapLimit(scannedArtFiles, hashConcurrency, async (source) => {
    const base: RepositoryArtFile = {
      path: source.path,
      extension: source.extension,
      sizeBytes: source.sizeBytes,
      category: source.category,
    };
    const sha256 = await sha256File(source.absolutePath);
    const role = inferRole(base);
    const transparencyPolicy = transparencyPolicyFor(role);
    let image: RepositoryImageEvidence | undefined;
    if (source.category === "image") {
      if (source.sizeBytes <= maximumImageProbeBytes) {
        try {
          image = parseImageEvidence(await readFile(source.absolutePath), source.extension);
        } catch (error: unknown) {
          image = {
            format: source.extension.replace(/^\./, "") || "unknown",
            hasAlphaChannel: false,
            alphaUsage: "unknown",
            probeComplete: false,
            warnings: [
              `Image probe failed: ${error instanceof Error ? error.message : String(error)}`,
            ],
          };
        }
      } else {
        image = {
          format: source.extension.replace(/^\./, "") || "unknown",
          hasAlphaChannel: false,
          alphaUsage: "unknown",
          probeComplete: false,
          warnings: [
            `Image exceeds the bounded ${maximumImageProbeBytes}-byte probe limit; use the decoded-pixel quality tool.`,
          ],
        };
      }
    }
    const referencedBy = referenceIndex.found.get(source.path) ?? [];
    const animation = animationIdentity(source.path);
    const optimization = optimizationFor(base, role, transparencyPolicy);
    return {
      ...base,
      sha256,
      role,
      transparencyPolicy,
      ...(image ? { image } : {}),
      referencedBy,
      referenceCount: referencedBy.length,
      ...(animation
        ? {
            animationFamilyId: animation.familyId,
            animationFrameIndex: animation.frameIndex,
          }
        : {}),
      optimization,
      findings: findingsFor({
        file: base,
        role,
        policy: transparencyPolicy,
        ...(image ? { image } : {}),
        ...(viewport ? { viewport } : {}),
        referenceCount: referencedBy.length,
      }),
    } satisfies RepositoryAuditedArtFile;
  });

  artFiles.sort((left, right) => left.path.localeCompare(right.path));
  const duplicateGroups = buildDuplicateGroups(artFiles);
  const animationFamilies = buildAnimationFamilies(artFiles);
  const cleanupCandidates = buildCleanupCandidates(artFiles, duplicateGroups);
  const blockingFindings = artFiles.reduce(
    (count, file) => count + file.findings.filter((finding) => finding.startsWith("blocking:")).length,
    0,
  );
  const reviewFindings = artFiles.reduce(
    (count, file) => count + file.findings.filter((finding) => finding.startsWith("review:")).length,
    0,
  );

  return {
    schemaVersion: "1.0",
    analysisVersion: "1.0",
    root,
    projectName,
    engine,
    filesScanned,
    artFiles,
    extensionCounts,
    categoryCounts,
    signals: [
      ...signals,
      `Computed SHA-256 identity for ${artFiles.length} recorded art files.`,
      `Scanned ${referenceFiles.length} bounded source and resource files for asset demand.`,
      "Cleanup candidates are advisory and never delete files automatically.",
    ],
    gaps: inferGaps(artFiles, engine),
    truncated,
    duplicateGroups,
    animationFamilies,
    missingAssetReferences: referenceIndex.missing,
    cleanupCandidates,
    auditSummary: {
      auditedFiles: artFiles.length,
      exactDuplicateGroups: duplicateGroups.length,
      animationFamilies: animationFamilies.length,
      missingReferences: referenceIndex.missing.length,
      blockingFindings,
      reviewFindings,
      roleCounts: roleCounts(artFiles),
      transparencyPolicyCounts: policyCounts(artFiles),
    },
    auditRules: [
      "Dialogue close-ups preserve an authored opaque or black presentation stage unless an explicit role contract says otherwise.",
      "Standing characters, crew cut-outs, UI icons, ship profiles and weather overlays require meaningful transparency rather than a merely present alpha channel.",
      "Exact duplicates and apparently unreferenced runtime files are review candidates only; static analysis cannot prove deletion safety.",
      "Runtime recommendations never upscale, never recursively compress and retain a lossless or editable source master.",
      "Animation timing is a deterministic starting recommendation; approved sequence manifests own exact frame durations, pivots, baselines and loop modes.",
    ],
    ...(engineVersionHint ? { engineVersionHint } : {}),
    ...(viewport ? { viewport } : {}),
  };
}

export function assertPathWithinAllowedRoots(candidate: string, allowedRoots: readonly string[]): string {
  const resolved = path.resolve(candidate);
  const allowed = allowedRoots.some((root) => {
    const base = path.resolve(root);
    const relative = path.relative(base, resolved);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
  if (!allowed) throw new Error("Repository path is outside EVAVO_ART_ALLOWED_ROOTS.");
  return resolved;
}
