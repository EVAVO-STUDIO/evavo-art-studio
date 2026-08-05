import { createHash } from "node:crypto";
import path from "node:path";

import type { SpriteFrameQualityExpectations } from "@evavo/art-quality";

export const BRASS_ART_BATCH_REVIEW_SCHEMA =
  "evavo_brass_art_batch_review_v1" as const;

export const IMAGE_EXTENSIONS = new Set([
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
export const IGNORED_DIRECTORIES = new Set([
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
export const DEFAULT_MAXIMUM_FILES = 256;
export const HARD_MAXIMUM_FILES = 1_000;
export const DEFAULT_MAXIMUM_DEPTH = 12;
export const HARD_MAXIMUM_DEPTH = 32;
export const DEFAULT_MAXIMUM_TOTAL_BYTES = 512 * 1024 * 1024;
export const HARD_MAXIMUM_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
export const MAXIMUM_FILE_BYTES = 32 * 1024 * 1024;
export const MAXIMUM_PIXELS = 16_777_216;
export const HARD_MAXIMUM_DISCOVERED_ENTRIES = 100_000;

export type ArtBatchReviewDetail = "summary" | "failures" | "all";

export interface ArtBatchReviewInput {
  readonly directoryPath: string;
  readonly roleId: string;
  readonly allowedRoots: readonly string[];
  readonly expectations: SpriteFrameQualityExpectations | unknown;
  readonly relativePaths?: readonly string[];
  readonly recursive?: boolean;
  readonly maximumFiles?: number;
  readonly maximumDepth?: number;
  readonly maximumTotalBytes?: number;
  readonly detail?: ArtBatchReviewDetail;
}

export interface DiscoveredFile {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly sizeBytes: number;
}

export interface StableFile {
  readonly bytes: Buffer;
  readonly sizeBytes: number;
  readonly sha256: string;
}

export class ArtBatchReviewError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "ArtBatchReviewError";
    this.code = code;
  }
}

export function samePath(left: string, right: string): boolean {
  const normalize = (value: string) => {
    const candidate = path.normalize(value);
    return process.platform === "win32"
      ? candidate.toLocaleLowerCase("en-US")
      : candidate;
  };
  return normalize(left) === normalize(right);
}

export function portableRelative(root: string, value: string): string {
  const relative = path.relative(root, value).split(path.sep).join("/").normalize("NFC");
  if (
    !relative ||
    relative === "." ||
    relative.startsWith("../") ||
    relative.includes("/../") ||
    relative.includes("\\") ||
    relative.includes("\u0000")
  ) {
    throw new ArtBatchReviewError(
      "ART_BATCH_RELATIVE_PATH_INVALID",
      `Batch entry does not have a safe relative path: ${value}`,
    );
  }
  return relative;
}

export function portableSelectedPath(value: unknown, index: number): string {
  if (typeof value !== "string") {
    throw new ArtBatchReviewError(
      "ART_BATCH_SELECTION_PATH_INVALID",
      `relativePaths[${index}] must be a string.`,
    );
  }
  const candidate = value.normalize("NFC").trim();
  const normalized = path.posix.normalize(candidate);
  const parts = candidate.split("/");
  if (
    !candidate ||
    candidate !== value ||
    candidate !== normalized ||
    candidate.startsWith("/") ||
    /^[A-Za-z]:/u.test(candidate) ||
    candidate.includes("\\") ||
    /[\u0000-\u001f\u007f]/u.test(candidate) ||
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        part.endsWith(".") ||
        part.endsWith(" "),
    )
  ) {
    throw new ArtBatchReviewError(
      "ART_BATCH_SELECTION_PATH_INVALID",
      `relativePaths[${index}] must be one canonical portable repository-relative path.`,
    );
  }
  const extension = path.posix.extname(candidate).toLocaleLowerCase("en-US");
  if (!IMAGE_EXTENSIONS.has(extension)) {
    throw new ArtBatchReviewError(
      "ART_BATCH_SELECTION_FORMAT_UNSUPPORTED",
      `relativePaths[${index}] is not a supported image file: ${candidate}`,
    );
  }
  return candidate;
}

export function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  const candidate = value ?? fallback;
  if (!Number.isSafeInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new ArtBatchReviewError(
      "ART_BATCH_BOUND_INVALID",
      `${label} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return candidate;
}

export function normalizeExpectations(
  input: SpriteFrameQualityExpectations | unknown,
): Readonly<Record<string, unknown>> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ArtBatchReviewError(
      "ART_BATCH_EXPECTATIONS_INVALID",
      "Batch expectations must be one sprite-frame expectation object shared by the reviewed folder.",
    );
  }
  return Object.freeze({ ...(input as Readonly<Record<string, unknown>>) });
}

export function canonicalJsonValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new ArtBatchReviewError(
        "ART_BATCH_EXPECTATIONS_NONCANONICAL",
        "Batch expectations contain a non-canonical number.",
      );
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Readonly<Record<string, unknown>>)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, child]) => [key, canonicalJsonValue(child)] as const);
    return Object.fromEntries(entries);
  }
  throw new ArtBatchReviewError(
    "ART_BATCH_EXPECTATIONS_NONCANONICAL",
    "Batch expectations must contain JSON-compatible values only.",
  );
}

export function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}
