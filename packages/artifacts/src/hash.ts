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

export function normalizeJson(value: unknown, path = "$"): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ArtifactStoreError(
        "ARTIFACT_METADATA_INVALID",
        `${path} must contain only finite JSON numbers.`,
      );
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => normalizeJson(entry, `${path}[${index}]`));
  }
  if (typeof value === "object" && value !== null) {
    const source = value as Record<string, unknown>;
    const result: Record<string, JsonValue> = {};
    for (const key of Object.keys(source).sort()) {
      if (!key || key.includes("\0")) {
        throw new ArtifactStoreError(
          "ARTIFACT_METADATA_INVALID",
          `${path} contains an invalid object key.`,
        );
      }
      if (source[key] === undefined) {
        throw new ArtifactStoreError(
          "ARTIFACT_METADATA_INVALID",
          `${path}.${key} may not be undefined.`,
        );
      }
      result[key] = normalizeJson(source[key], `${path}.${key}`);
    }
    return result;
  }
  throw new ArtifactStoreError(
    "ARTIFACT_METADATA_INVALID",
    `${path} must contain JSON-compatible data.`,
  );
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
