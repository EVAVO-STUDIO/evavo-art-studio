import { lstat } from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_MAXIMUM_BASE64_BYTES,
  DEFAULT_MAXIMUM_FILE_BYTES,
  type ArtWorkspaceIntakeSource,
  type ArtWorkspaceMediaProbe,
  type ArtWorkspaceWriterPolicy,
} from "./workspace-writer-types.js";
import {
  fail,
  safeFilename,
  sha256Bytes,
  sha256File,
  validatedLimit,
} from "./workspace-writer-foundation.js";
import { assertMediaExtensionMatches, mediaProbe } from "./workspace-writer-media.js";
import {
  readHeader,
  resolveImportFile,
  strictBase64,
} from "./workspace-writer-filesystem.js";

export interface PreparedIntakeSource {
  readonly sourceKind: ArtWorkspaceIntakeSource["kind"];
  readonly originalName: string;
  readonly safeName: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly media: ArtWorkspaceMediaProbe;
  readonly sourcePath?: string;
  readonly bytes?: Buffer;
}

export async function prepareIntakeSource(
  source: ArtWorkspaceIntakeSource,
  policy: ArtWorkspaceWriterPolicy,
): Promise<PreparedIntakeSource> {
  const maximumFileBytes = validatedLimit(
    policy.maximumFileBytes,
    DEFAULT_MAXIMUM_FILE_BYTES,
    "maximumFileBytes",
  );
  if (source.kind === "base64") {
    const safeName = safeFilename(source.name);
    const bytes = strictBase64(
      source.dataBase64,
      validatedLimit(
        policy.maximumBase64Bytes,
        DEFAULT_MAXIMUM_BASE64_BYTES,
        "maximumBase64Bytes",
      ),
    );
    const sha256 = sha256Bytes(bytes);
    if (source.expectedSha256 !== undefined && source.expectedSha256 !== sha256) {
      fail("ART_WORKSPACE_SOURCE_SHA256_MISMATCH", `${safeName} SHA-256 did not match.`);
    }
    const media = mediaProbe(safeName, bytes.subarray(0, Math.min(bytes.length, 64 * 1024)));
    assertMediaExtensionMatches(safeName, media);
    return {
      sourceKind: source.kind,
      originalName: source.name,
      safeName,
      sha256,
      sizeBytes: bytes.length,
      media,
      bytes,
    };
  }

  const sourcePath = await resolveImportFile(source.path, policy);
  const evidence = await lstat(sourcePath);
  if (evidence.size > maximumFileBytes) {
    fail(
      "ART_WORKSPACE_FILE_TOO_LARGE",
      `${source.path} exceeds the configured ${maximumFileBytes}-byte limit.`,
    );
  }
  const originalName = source.name ?? path.basename(sourcePath);
  const safeName = safeFilename(originalName);
  const [sha256, header] = await Promise.all([sha256File(sourcePath), readHeader(sourcePath)]);
  if (source.expectedSha256 !== undefined && source.expectedSha256 !== sha256) {
    fail("ART_WORKSPACE_SOURCE_SHA256_MISMATCH", `${safeName} SHA-256 did not match.`);
  }
  const media = mediaProbe(safeName, header);
  assertMediaExtensionMatches(safeName, media);
  return {
    sourceKind: source.kind,
    originalName,
    safeName,
    sha256,
    sizeBytes: evidence.size,
    media,
    sourcePath,
  };
}
