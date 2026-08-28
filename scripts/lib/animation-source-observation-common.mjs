import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { assertAnimationSourceBundleRelativePath } from "./animation-source-bundle.mjs";

export const ANIMATION_SOURCE_OBSERVATION_SCHEMA =
  "evavo.animation-source-stable-observation.v1";
export const DEFAULT_ANIMATION_SOURCE_OBSERVATION_CONCURRENCY = 4;
export const DEFAULT_ANIMATION_SOURCE_OBSERVATION_CHUNK_BYTES = 1024 * 1024;
export const MAX_ANIMATION_SOURCE_ASSET_COUNT = 4096;

const MIN_CHUNK_BYTES = 64 * 1024;
const MAX_CHUNK_BYTES = 8 * 1024 * 1024;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const MEDIA_TYPE =
  /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/u;

export class AnimationSourceObservationError extends Error {
  constructor(code, detail, options = {}) {
    super(detail ? `${code}:${detail}` : code, options);
    this.name = "AnimationSourceObservationError";
    this.code = code;
  }
}

export function failObservation(code, detail, options = {}) {
  throw new AnimationSourceObservationError(code, detail, options);
}

export function abortObservationIfRequested(signal) {
  if (signal?.aborted) {
    failObservation("ANIMATION_SOURCE_BUNDLE_OBSERVATION_CANCELLED");
  }
}

function boundedInteger(value, fallback, minimum, maximum, code) {
  const resolved = value ?? fallback;
  if (
    typeof resolved !== "number" ||
    !Number.isSafeInteger(resolved) ||
    resolved < minimum ||
    resolved > maximum
  ) {
    failObservation(code);
  }
  return resolved;
}

export function normalizeObservationOptions(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    failObservation("ANIMATION_SOURCE_BUNDLE_OBSERVATION_OPTIONS_INVALID");
  }
  const allowed = new Set([
    "concurrency",
    "chunkBytes",
    "signal",
    "onProgress",
    "onPhase",
  ]);
  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) {
      failObservation(
        "ANIMATION_SOURCE_BUNDLE_OBSERVATION_OPTION_UNKNOWN",
        key,
      );
    }
  }
  return Object.freeze({
    concurrency: boundedInteger(
      options.concurrency,
      DEFAULT_ANIMATION_SOURCE_OBSERVATION_CONCURRENCY,
      1,
      16,
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_CONCURRENCY_INVALID",
    ),
    chunkBytes: boundedInteger(
      options.chunkBytes,
      DEFAULT_ANIMATION_SOURCE_OBSERVATION_CHUNK_BYTES,
      MIN_CHUNK_BYTES,
      MAX_CHUNK_BYTES,
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_CHUNK_SIZE_INVALID",
    ),
    signal: options.signal,
    onProgress:
      options.onProgress === undefined
        ? undefined
        : typeof options.onProgress === "function"
          ? options.onProgress
          : failObservation(
              "ANIMATION_SOURCE_BUNDLE_OBSERVATION_PROGRESS_INVALID",
            ),
    onPhase:
      options.onPhase === undefined
        ? undefined
        : typeof options.onPhase === "function"
          ? options.onPhase
          : failObservation(
              "ANIMATION_SOURCE_BUNDLE_OBSERVATION_PHASE_INVALID",
            ),
  });
}

export function canonicalObservationJson(value) {
  function normalize(entry) {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (entry && typeof entry === "object") {
      const output = {};
      for (const key of Object.keys(entry).sort()) {
        if (entry[key] !== undefined) output[key] = normalize(entry[key]);
      }
      return output;
    }
    return entry;
  }
  return JSON.stringify(normalize(value));
}

export function sha256ObservationJson(value) {
  return `sha256:${createHash("sha256")
    .update(canonicalObservationJson(value))
    .digest("hex")}`;
}

export function resolveContainedObservationPath(rootReal, relativePath) {
  const portable = assertAnimationSourceBundleRelativePath(relativePath);
  const candidate = resolve(rootReal, ...portable.split("/"));
  const relation = relative(rootReal, candidate);
  if (
    relation === "" ||
    relation === ".." ||
    relation.startsWith(`..${sep}`) ||
    isAbsolute(relation)
  ) {
    failObservation(
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_PATH_ESCAPES_ROOT",
      portable,
    );
  }
  return Object.freeze({ portable, candidate });
}

function bigintText(value) {
  return typeof value === "bigint" ? value.toString() : String(value);
}

export function observationStatFingerprint(stats) {
  return Object.freeze({
    dev: bigintText(stats.dev),
    ino: bigintText(stats.ino),
    mode: bigintText(stats.mode),
    nlink: bigintText(stats.nlink),
    size: bigintText(stats.size),
    mtimeNs: bigintText(stats.mtimeNs),
    ctimeNs: bigintText(stats.ctimeNs),
    birthtimeNs: bigintText(stats.birthtimeNs),
  });
}

export function sameObservationFingerprint(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs &&
    left.birthtimeNs === right.birthtimeNs
  );
}

export function safeObservationFileSize(stats, relativePath) {
  if (stats.size < 1n || stats.size > BigInt(Number.MAX_SAFE_INTEGER)) {
    failObservation(
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_FILE_SIZE_INVALID",
      relativePath,
    );
  }
  return Number(stats.size);
}

export async function readObservationExact(
  handle,
  position,
  length,
  code,
  detail,
) {
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const { bytesRead } = await handle.read(
      buffer,
      offset,
      length - offset,
      position + offset,
    );
    if (bytesRead <= 0) failObservation(code, detail);
    offset += bytesRead;
  }
  return buffer;
}

export function validObservationDimensions(width, height, detail) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 16_384 ||
    height > 16_384
  ) {
    failObservation(
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_DIMENSIONS_INVALID",
      detail,
    );
  }
  return Object.freeze({ width, height });
}

export function normalizeObservationDescriptor(value, index) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    failObservation(
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_DESCRIPTOR_INVALID",
      String(index),
    );
  }
  const assetId = value.assetId;
  const mediaType = value.mediaType;
  if (typeof assetId !== "string" || !IDENTIFIER.test(assetId)) {
    failObservation(
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_ASSET_ID_INVALID",
      String(index),
    );
  }
  if (
    typeof mediaType !== "string" ||
    !mediaType ||
    mediaType !== mediaType.toLowerCase() ||
    !MEDIA_TYPE.test(mediaType)
  ) {
    failObservation(
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_MEDIA_TYPE_INVALID",
      assetId,
    );
  }
  const normalized = {
    assetId,
    relativePath: assertAnimationSourceBundleRelativePath(value.relativePath),
    mediaType,
  };
  if (value.width !== undefined || value.height !== undefined) {
    normalized.width = boundedInteger(
      value.width,
      undefined,
      1,
      16_384,
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_DECLARED_DIMENSIONS_INVALID",
    );
    normalized.height = boundedInteger(
      value.height,
      undefined,
      1,
      16_384,
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_DECLARED_DIMENSIONS_INVALID",
    );
  }
  return Object.freeze(normalized);
}

export async function mapObservationBounded(values, concurrency, worker) {
  const output = new Array(values.length);
  let cursor = 0;
  let stopped = false;
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, values.length) },
      async () => {
        while (!stopped) {
          const index = cursor;
          cursor += 1;
          if (index >= values.length) return;
          try {
            output[index] = await worker(values[index], index);
          } catch (error) {
            stopped = true;
            throw error;
          }
        }
      },
    ),
  );
  return output;
}
