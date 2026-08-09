import path from "node:path";

import {
  SIGNATURE_REQUIRED_EXTENSIONS,
  type ArtWorkspaceMediaProbe,
} from "./workspace-writer-types.js";
import { fail } from "./workspace-writer-foundation.js";

function readJpegDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === undefined) return undefined;
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > bytes.length) return undefined;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return undefined;
    if (
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
        marker,
      )
    ) {
      return {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      };
    }
    offset += length;
  }
  return undefined;
}

export function mediaProbe(name: string, bytes: Buffer): ArtWorkspaceMediaProbe {
  const extension = path.extname(name).toLowerCase();
  if (
    bytes.length >= 26 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    const colourType = bytes[25];
    return {
      extension,
      format: "png",
      mimeType: "image/png",
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
      hasAlphaChannel: colourType === 4 || colourType === 6,
      signatureVerified: true,
    };
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    const chunk = bytes.toString("ascii", 12, 16);
    let dimensions: { width: number; height: number } | undefined;
    let hasAlphaChannel: boolean | undefined;
    if (chunk === "VP8X" && bytes.length >= 30) {
      dimensions = {
        width: 1 + bytes.readUIntLE(24, 3),
        height: 1 + bytes.readUIntLE(27, 3),
      };
      hasAlphaChannel = Boolean((bytes[20] ?? 0) & 0x10);
    }
    return {
      extension,
      format: "webp",
      mimeType: "image/webp",
      ...(dimensions ?? {}),
      ...(hasAlphaChannel === undefined ? {} : { hasAlphaChannel }),
      signatureVerified: true,
    };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const dimensions = readJpegDimensions(bytes);
    return {
      extension,
      format: "jpeg",
      mimeType: "image/jpeg",
      ...(dimensions ?? {}),
      hasAlphaChannel: false,
      signatureVerified: true,
    };
  }
  if (bytes.length >= 10 && bytes.toString("ascii", 0, 3) === "GIF") {
    return {
      extension,
      format: "gif",
      mimeType: "image/gif",
      width: bytes.readUInt16LE(6),
      height: bytes.readUInt16LE(8),
      signatureVerified: true,
    };
  }
  if (bytes.length >= 26 && bytes.toString("ascii", 0, 2) === "BM") {
    return {
      extension,
      format: "bmp",
      mimeType: "image/bmp",
      width: Math.abs(bytes.readInt32LE(18)),
      height: Math.abs(bytes.readInt32LE(22)),
      signatureVerified: true,
    };
  }
  if (
    bytes.length >= 4 &&
    (bytes.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) ||
      bytes.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a])))
  ) {
    return {
      extension,
      format: "tiff",
      mimeType: "image/tiff",
      signatureVerified: true,
    };
  }
  if (bytes.length >= 22 && bytes.toString("ascii", 0, 4) === "8BPS") {
    return {
      extension,
      format: "psd",
      mimeType: "image/vnd.adobe.photoshop",
      width: bytes.readUInt32BE(18),
      height: bytes.readUInt32BE(14),
      hasAlphaChannel: bytes.readUInt16BE(12) > 3,
      signatureVerified: true,
    };
  }
  if (
    bytes.length >= 4 &&
    bytes.subarray(0, 4).equals(Buffer.from([0x76, 0x2f, 0x31, 0x01]))
  ) {
    return {
      extension,
      format: "exr",
      mimeType: "image/x-exr",
      hasAlphaChannel: true,
      signatureVerified: true,
    };
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 4, 8) === "ftyp" &&
    ["avif", "avis"].includes(bytes.toString("ascii", 8, 12))
  ) {
    return {
      extension,
      format: "avif",
      mimeType: "image/avif",
      signatureVerified: true,
    };
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    [0x03, 0x05, 0x07].includes(bytes[2] ?? -1) &&
    [0x04, 0x06, 0x08].includes(bytes[3] ?? -1)
  ) {
    return {
      extension,
      format: "zip",
      mimeType: "application/zip",
      signatureVerified: true,
    };
  }
  const prefix = bytes.toString("utf8").replace(/^\uFEFF/u, "").trimStart();
  if (prefix.startsWith("<svg") || /^<\?xml[s\S]*?<svg[\s>]/u.test(prefix)) {
    const width = prefix.match(/\bwidth=["'](\d+(?:\.\d+)?)/u)?.[1];
    const height = prefix.match(/\bheight=["'](\d+(?:\.\d+)?)/u)?.[1];
    return {
      extension,
      format: "svg",
      mimeType: "image/svg+xml",
      ...(width ? { width: Math.round(Number(width)) } : {}),
      ...(height ? { height: Math.round(Number(height)) } : {}),
      hasAlphaChannel: true,
      signatureVerified: true,
    };
  }
  if (prefix.startsWith("#?RADIANCE") || prefix.startsWith("#?RGBE")) {
    return {
      extension,
      format: "hdr",
      mimeType: "image/vnd.radiance",
      signatureVerified: true,
    };
  }
  const textMime =
    extension === ".json"
      ? "application/json"
      : [".yaml", ".yml", ".toml", ".xml", ".atlas", ".tres", ".tscn"].includes(
            extension,
          )
        ? "text/plain"
        : "application/octet-stream";
  return {
    extension,
    format: extension.slice(1) || "unknown",
    mimeType: textMime,
    signatureVerified: !SIGNATURE_REQUIRED_EXTENSIONS.has(extension),
  };
}

export function assertMediaExtensionMatches(name: string, media: ArtWorkspaceMediaProbe): void {
  const extension = path.extname(name).toLowerCase();
  if (SIGNATURE_REQUIRED_EXTENSIONS.has(extension) && !media.signatureVerified) {
    fail(
      "ART_WORKSPACE_MEDIA_SIGNATURE_INVALID",
      `${name} does not contain the expected ${extension} signature.`,
    );
  }
  const accepted =
    media.format === "png"
      ? new Set([".png", ".apng"])
      : media.format === "jpeg"
        ? new Set([".jpg", ".jpeg"])
        : media.format === "webp"
          ? new Set([".webp"])
          : media.format === "gif"
            ? new Set([".gif"])
            : media.format === "bmp"
              ? new Set([".bmp"])
              : media.format === "tiff"
                ? new Set([".tif", ".tiff"])
                : media.format === "psd"
                  ? new Set([".psd", ".psb"])
                  : media.format === "exr"
                    ? new Set([".exr"])
                    : media.format === "avif"
                      ? new Set([".avif"])
                      : media.format === "svg"
                        ? new Set([".svg"])
                        : media.format === "hdr"
                          ? new Set([".hdr"])
                          : media.format === "zip"
                            ? new Set([".zip"])
                            : undefined;
  if (accepted && !accepted.has(extension)) {
    fail(
      "ART_WORKSPACE_MEDIA_EXTENSION_MISMATCH",
      `${name} contains ${media.format} bytes but uses the ${extension} extension.`,
    );
  }
}
