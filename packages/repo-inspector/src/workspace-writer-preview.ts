import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  ArtWorkspaceMediaPreview,
  ArtWorkspaceWriterPolicy,
} from "./workspace-writer-types.js";
import { assertUserSourcePath, fail, sha256Bytes } from "./workspace-writer-foundation.js";
import { assertMediaExtensionMatches, mediaProbe } from "./workspace-writer-media.js";
import { existingFile, resolveWorkspaceRoot } from "./workspace-writer-filesystem.js";
import { parsePreviewRequest } from "./workspace-writer-requests.js";

export async function readArtWorkspaceMediaPreview(
  requestValue: unknown,
  policy: ArtWorkspaceWriterPolicy,
): Promise<ArtWorkspaceMediaPreview> {
  const request = parsePreviewRequest(requestValue);
  const workspaceRoot = await resolveWorkspaceRoot(request.workspaceRoot, policy);
  const sourcePath = assertUserSourcePath(request.path);
  const maximumBytes = request.maximumBytes ?? 8 * 1024 * 1024;
  const source = await existingFile(workspaceRoot, sourcePath, maximumBytes);
  const bytes = await readFile(source.absolutePath);
  const media = mediaProbe(path.basename(source.relativePath), bytes.subarray(0, 64 * 1024));
  assertMediaExtensionMatches(source.relativePath, media);
  if (!media.mimeType.startsWith("image/")) {
    fail(
      "ART_WORKSPACE_PREVIEW_TYPE_UNSUPPORTED",
      "Only image media can be returned as an MCP preview.",
    );
  }
  if (sha256Bytes(bytes) !== source.sha256) {
    fail(
      "ART_WORKSPACE_PREVIEW_DRIFTED",
      "Preview source changed between inspection and read.",
    );
  }
  return {
    schema: "evavo_art_workspace_media_preview_v1",
    path: source.relativePath,
    sha256: source.sha256,
    sizeBytes: source.sizeBytes,
    media,
    dataBase64: bytes.toString("base64"),
    repositoryMutationPerformed: false,
    publicationAuthority: false,
  };
}
