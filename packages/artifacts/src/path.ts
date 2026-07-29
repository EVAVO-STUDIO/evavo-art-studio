import { mkdir, realpath } from "node:fs/promises";
import path from "node:path";

import { ArtifactStoreError, type ArtifactId, type ContentHash } from "./types.js";

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export async function ensureArtifactRoot(input: string): Promise<string> {
  const resolved = path.resolve(input);
  await mkdir(resolved, { recursive: true });
  return realpath(resolved);
}

export function safeSegment(value: string, name: string): string {
  const segment = value.trim();
  if (!SAFE_SEGMENT.test(segment) || segment === "." || segment === "..") {
    throw new ArtifactStoreError(
      "ARTIFACT_PATH_INVALID",
      `${name} must be a safe path segment.`,
    );
  }
  return segment;
}

export function safeNamespace(value: string): readonly string[] {
  const parts = value
    .split(/[\\/]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (parts.length === 0 || parts.length > 16) {
    throw new ArtifactStoreError(
      "ARTIFACT_REFERENCE_INVALID",
      "Reference namespace must contain 1 to 16 safe segments.",
    );
  }
  return parts.map((part, index) =>
    safeSegment(part, `namespace[${index}]`),
  );
}

export function contentObjectRelativePath(hash: ContentHash): string {
  const hex = hash.slice("sha256:".length);
  return path.join("objects", "sha256", hex.slice(0, 2), hex.slice(2, 4), hex);
}

export function descriptorRelativePath(id: ArtifactId): string {
  const hex = id.slice("artifact_".length);
  return path.join(
    "descriptors",
    "sha256",
    hex.slice(0, 2),
    hex.slice(2, 4),
    `${id}.json`,
  );
}

export function referenceRelativePath(namespace: string, name: string): string {
  return path.join("refs", ...safeNamespace(namespace), `${safeSegment(name, "name")}.json`);
}

export function relativePortable(value: string): string {
  return value.split(path.sep).join("/");
}
