import path from "node:path";

import {
  PORTABLE_VAULT_PATTERN,
  type ArtWorkspaceStorageArchiveRequest,
} from "./workspace-writer-types.js";
import {
  fail,
  isRecord,
  requiredString,
  validateIdentifier,
} from "./workspace-writer-foundation.js";

function validateLogicalStoragePath(value: string): string {
  if (
    value.length > 1024 ||
    value.includes("\\") ||
    value.startsWith("/") ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    fail("ART_WORKSPACE_STORAGE_PATH_INVALID", "logicalPath is invalid.");
  }
  const normalized = path.posix.normalize(value);
  if (!value || normalized !== value || value === "." || value.startsWith("../")) {
    fail("ART_WORKSPACE_STORAGE_PATH_INVALID", "logicalPath is not canonical.");
  }
  return value.normalize("NFC");
}

export function parseStorageRequest(value: unknown): ArtWorkspaceStorageArchiveRequest {
  if (!isRecord(value)) {
    fail("ART_WORKSPACE_STORAGE_REQUEST_INVALID", "Storage request is invalid.");
  }
  const vault = requiredString(value.vault, "vault").trim();
  if (!PORTABLE_VAULT_PATTERN.test(vault)) {
    fail("ART_WORKSPACE_STORAGE_VAULT_INVALID", "vault is not portable.");
  }
  const mode = value.mode ?? "put";
  if (mode !== "put" && mode !== "upload") {
    fail("ART_WORKSPACE_STORAGE_MODE_INVALID", "mode must be put or upload.");
  }
  const title = requiredString(value.title, "title").normalize("NFC").trim();
  if (title.length > 256 || /[\u0000-\u001f\u007f]/u.test(title)) {
    fail("ART_WORKSPACE_STORAGE_TITLE_INVALID", "title is invalid.");
  }
  return {
    workspaceRoot: requiredString(value.workspaceRoot, "workspaceRoot"),
    source: requiredString(value.source, "source"),
    vault,
    logicalPath: validateLogicalStoragePath(requiredString(value.logicalPath, "logicalPath")),
    title,
    idempotencyKey: validateIdentifier(
      requiredString(value.idempotencyKey, "idempotencyKey"),
      "idempotencyKey",
    ),
    mode,
  };
}
