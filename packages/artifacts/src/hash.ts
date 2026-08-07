import { createHash } from "node:crypto";

import {
  ArtifactStoreError,
  type ArtifactId,
  type ContentHash,
  type JsonValue,
} from "./types.js";

export function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function contentHash(value: Uint8Array | string): ContentHash {
  return `sha256:${sha256(value)}`;
}

function invalidJson(path: string, message: string): never {
  throw new ArtifactStoreError(
    "ARTIFACT_METADATA_INVALID",
    `${path} ${message}`,
  );
}

function readArrayLength(value: readonly unknown[], path: string): number {
  try {
    const length = value.length;
    if (!Number.isSafeInteger(length) || length < 0) {
      invalidJson(path, "must expose one valid JSON array length.");
    }
    return length;
  } catch (error: unknown) {
    if (error instanceof ArtifactStoreError) throw error;
    invalidJson(path, "array length could not be read safely.");
  }
}

function readArrayEntry(
  value: readonly unknown[],
  index: number,
  path: string,
): unknown {
  try {
    return value[index];
  } catch {
    invalidJson(path, "could not be read safely.");
  }
}

function readObjectKeys(
  value: Readonly<Record<string, unknown>>,
  path: string,
): readonly string[] {
  try {
    return Object.keys(value).sort();
  } catch {
    invalidJson(path, "object keys could not be read safely.");
  }
}

function readObjectEntry(
  value: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
): unknown {
  try {
    return value[key];
  } catch {
    invalidJson(path, "could not be read safely.");
  }
}

function normalizeJsonValue(
  value: unknown,
  path: string,
  ancestors: WeakSet<object>,
): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      invalidJson(path, "must contain only finite JSON numbers.");
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      invalidJson(path, "contains a circular JSON reference.");
    }
    ancestors.add(value);
    try {
      const length = readArrayLength(value, path);
      const result: JsonValue[] = [];
      for (let index = 0; index < length; index += 1) {
        const entryPath = `${path}[${index}]`;
        const entry = readArrayEntry(value, index, entryPath);
        if (entry === undefined) {
          invalidJson(entryPath, "may not be undefined or sparse.");
        }
        result.push(normalizeJsonValue(entry, entryPath, ancestors));
      }
      return result;
    } finally {
      ancestors.delete(value);
    }
  }
  if (typeof value === "object" && value !== null) {
    if (ancestors.has(value)) {
      invalidJson(path, "contains a circular JSON reference.");
    }
    ancestors.add(value);
    try {
      const source = value as Readonly<Record<string, unknown>>;
      const result: Record<string, JsonValue> = {};
      for (const key of readObjectKeys(source, path)) {
        if (!key || key.includes("\0")) {
          invalidJson(path, "contains an invalid object key.");
        }
        const entryPath = `${path}.${key}`;
        const entry = readObjectEntry(source, key, entryPath);
        if (entry === undefined) {
          invalidJson(entryPath, "may not be undefined.");
        }
        const normalized = normalizeJsonValue(entry, entryPath, ancestors);
        Object.defineProperty(result, key, {
          value: normalized,
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      return result;
    } finally {
      ancestors.delete(value);
    }
  }
  invalidJson(path, "must contain JSON-compatible data.");
}

export function normalizeJson(value: unknown, path = "$"): JsonValue {
  return normalizeJsonValue(value, path, new WeakSet<object>());
}

export function stableStringify(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Readonly<Record<string, JsonValue>>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key]!)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function artifactId(descriptorBody: JsonValue): ArtifactId {
  return `artifact_${sha256(stableStringify(descriptorBody))}`;
}
