import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";

import {
  IDENTIFIER_PATTERN,
  PRIVATE_SOURCE_PREFIXES,
  SHA256_PATTERN,
  SUPPORTED_ART_EXTENSIONS,
  WINDOWS_RESERVED,
  ArtWorkspaceWriterError,
} from "./workspace-writer-types.js";

export function fail(code: string, message: string): never {
  throw new ArtWorkspaceWriterError(code, message);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    fail("ART_WORKSPACE_REQUEST_INVALID", `${label} must be a non-empty string.`);
  }
  return value;
}

export function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, label);
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function sha256Bytes(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

export function validateSha256(value: string | undefined, label: string): void {
  if (value !== undefined && !SHA256_PATTERN.test(value)) {
    fail("ART_WORKSPACE_SHA256_INVALID", `${label} must be lowercase SHA-256.`);
  }
}

export function validateIdentifier(value: string, label: string): string {
  const normalized = value.normalize("NFC").trim();
  if (!IDENTIFIER_PATTERN.test(normalized)) {
    fail(
      "ART_WORKSPACE_IDENTIFIER_INVALID",
      `${label} must use 1-128 portable identifier characters.`,
    );
  }
  return normalized;
}

export function validatedLimit(
  value: number | undefined,
  fallback: number,
  label: string,
): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1) {
    fail("ART_WORKSPACE_LIMIT_INVALID", `${label} must be a positive integer.`);
  }
  return result;
}

export function safeFilename(value: string): string {
  const base = path.basename(value).normalize("NFC").trim();
  const replaced = base
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]+/gu, "_")
    .replace(/\s+/gu, " ")
    .replace(/[ .]+$/gu, "")
    .slice(0, 180);
  if (!replaced) fail("ART_WORKSPACE_FILENAME_INVALID", "File name is empty.");
  const stem = replaced.split(".", 1)[0]?.toUpperCase() ?? "";
  const result = WINDOWS_RESERVED.has(stem) ? `_${replaced}` : replaced;
  const extension = path.extname(result).toLowerCase();
  if (!SUPPORTED_ART_EXTENSIONS.has(extension)) {
    fail(
      "ART_WORKSPACE_FILE_TYPE_UNSUPPORTED",
      `Unsupported art file extension: ${extension || "(none)"}.`,
    );
  }
  return result;
}

export function assertArtWorkspaceRelativePath(
  value: string,
  label = "path",
): string {
  if (!value) fail("ART_WORKSPACE_PATH_INVALID", `${label} is required.`);
  const normalizedUnicode = value.normalize("NFC");
  if (
    normalizedUnicode !== value ||
    value.includes("\\") ||
    path.posix.isAbsolute(value) ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    fail(
      "ART_WORKSPACE_PATH_INVALID",
      `${label} must be an NFC forward-slash relative path.`,
    );
  }
  const normalized = path.posix.normalize(value);
  if (
    normalized !== value ||
    value === "." ||
    value === ".." ||
    value.startsWith("../")
  ) {
    fail("ART_WORKSPACE_PATH_INVALID", `${label} is not canonical.`);
  }
  for (const part of value.split("/")) {
    if (!part || part.endsWith(" ") || part.endsWith(".")) {
      fail("ART_WORKSPACE_PATH_INVALID", `${label} contains an invalid component.`);
    }
    if (/[<>:"|?*]/u.test(part)) {
      fail("ART_WORKSPACE_PATH_INVALID", `${label} is not portable on Windows.`);
    }
    const stem = part.split(".", 1)[0]?.toUpperCase() ?? "";
    if (WINDOWS_RESERVED.has(stem)) {
      fail("ART_WORKSPACE_PATH_INVALID", `${label} contains a reserved name.`);
    }
  }
  if (value.split("/")[0]?.toLowerCase() === ".git") {
    fail("ART_WORKSPACE_GIT_PATH_FORBIDDEN", `${label} may not target .git.`);
  }
  return value;
}

function assertSupportedWorkspaceFilePath(value: string, label: string): string {
  const safe = assertArtWorkspaceRelativePath(value, label);
  const extension = path.posix.extname(safe).toLowerCase();
  if (!SUPPORTED_ART_EXTENSIONS.has(extension)) {
    fail(
      "ART_WORKSPACE_FILE_TYPE_UNSUPPORTED",
      `${label} does not name a supported art or art-metadata file: ${extension || "(none)"}.`,
    );
  }
  return safe;
}

function assertNotProtectedRepositoryControlPath(value: string, label: string): void {
  const lower = value.toLowerCase();
  const base = path.posix.basename(lower);
  if (
    lower.startsWith(".github/") ||
    lower.startsWith(".gitlab/") ||
    lower.startsWith(".circleci/") ||
    base === "package.json" ||
    base === "package-lock.json" ||
    base === "pnpm-lock.yaml" ||
    base === "yarn.lock" ||
    /^tsconfig(?:\..+)?\.json$/u.test(base) ||
    base === "turbo.json" ||
    base === "vercel.json" ||
    /next\.config\./u.test(base) ||
    /^wrangler(?:\..+)?\.(?:json|toml)$/u.test(base) ||
    base.startsWith(".env")
  ) {
    fail(
      "ART_WORKSPACE_REPOSITORY_CONTROL_PATH_FORBIDDEN",
      `${label} may not address repository code, package, secret or deployment control files.`,
    );
  }
}

export function assertUserSourcePath(value: string): string {
  const safe = assertSupportedWorkspaceFilePath(value, "source");
  assertNotProtectedRepositoryControlPath(safe, "source");
  if (
    PRIVATE_SOURCE_PREFIXES.some((prefix) => safe.startsWith(prefix)) ||
    (safe.startsWith(".art-studio/intake/") && safe.endsWith("/receipt.json"))
  ) {
    fail(
      "ART_WORKSPACE_PRIVATE_PATH_FORBIDDEN",
      "Source may not address Art Studio receipts, trash or pending journals.",
    );
  }
  return safe;
}

export function assertRestoreSourcePath(value: string): string {
  const safe = assertSupportedWorkspaceFilePath(value, "source");
  assertNotProtectedRepositoryControlPath(safe, "source");
  if (!/^\.art-studio\/trash\/fileplan_[0-9a-f]{24}\/.+/u.test(safe)) {
    fail(
      "ART_WORKSPACE_RESTORE_SOURCE_INVALID",
      "Restore source must be an exact file-plan trash path.",
    );
  }
  return safe;
}

export function assertUserTargetPath(value: string): string {
  const safe = assertSupportedWorkspaceFilePath(value, "target");
  assertNotProtectedRepositoryControlPath(safe, "target");
  if (safe === ".art-studio" || safe.startsWith(".art-studio/")) {
    fail(
      "ART_WORKSPACE_PRIVATE_PATH_FORBIDDEN",
      "User targets may not address Art Studio's private workspace namespace.",
    );
  }
  return safe;
}

export function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
