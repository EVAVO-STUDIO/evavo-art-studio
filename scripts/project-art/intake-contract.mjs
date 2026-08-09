import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import path from "node:path";

export const PROJECT_ART_INTAKE_REQUEST_SCHEMA =
  "evavo.project-art-intake-request.v1";
export const PROJECT_ART_INTAKE_PLAN_SCHEMA =
  "evavo.project-art-intake-plan.v1";
export const PROJECT_ART_INTAKE_RECEIPT_SCHEMA =
  "evavo.project-art-intake-receipt.v1";
export const STORAGE_ART_INGEST_REQUEST_SCHEMA =
  "evavo.storage-art-ingest-request.v1";

export const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SAFE_EXTENSION = /^[.][A-Za-z0-9]{1,12}$/u;
export const ORIGINS = new Set([
  "chat-upload",
  "chat-generated",
  "claude-upload",
  "claude-generated",
  "human-upload",
  "local-file",
  "evavo-storage",
  "provider-output",
  "repository-file",
]);
export const SUPPORTED_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
  ".tif",
  ".tiff",
  ".svg",
  ".psd",
  ".psb",
  ".xcf",
  ".kra",
  ".ase",
  ".aseprite",
  ".tga",
  ".dds",
  ".ktx",
  ".ktx2",
]);
export const MEDIA_TYPES = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".bmp", "image/bmp"],
  [".tif", "image/tiff"],
  [".tiff", "image/tiff"],
  [".svg", "image/svg+xml"],
  [".psd", "image/vnd.adobe.photoshop"],
  [".psb", "image/vnd.adobe.photoshop"],
  [".xcf", "image/x-xcf"],
  [".kra", "application/x-krita"],
  [".ase", "application/x-aseprite"],
  [".aseprite", "application/x-aseprite"],
  [".tga", "image/x-tga"],
  [".dds", "image/vnd-ms.dds"],
  [".ktx", "image/ktx"],
  [".ktx2", "image/ktx2"],
]);

export function fail(message) {
  throw new Error(message);
}

export function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) fail("Value is not canonical JSON compatible.");
    return encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function sha256File(filePath) {
  const digest = createHash("sha256");
  const handle = await open(filePath, "r");
  try {
    for await (const chunk of handle.createReadStream()) digest.update(chunk);
  } finally {
    await handle.close();
  }
  return digest.digest("hex");
}

export function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requiredString(value, label, maximum = 32_768) {
  if (typeof value !== "string") fail(`${label} must be a string.`);
  const normalized = value.trim();
  if (
    normalized.length < 1 ||
    normalized.length > maximum ||
    normalized.includes("\0")
  ) {
    fail(`${label} must contain 1 to ${maximum} safe characters.`);
  }
  return normalized;
}

export function optionalString(value, label, maximum = 32_768) {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredString(value, label, maximum);
}

export function safeId(value, label) {
  const normalized = requiredString(value, label, 128);
  if (!SAFE_ID.test(normalized)) {
    fail(
      `${label} must use 1 to 128 letters, digits, dots, underscores, colons or hyphens.`,
    );
  }
  return normalized;
}

export function safeFileName(value, label) {
  const input = requiredString(value, label, 255);
  if (
    path.basename(input) !== input ||
    input === "." ||
    input === ".." ||
    /[<>:"/\\|?*\u0000-\u001f]/u.test(input)
  ) {
    fail(`${label} must be one portable file name.`);
  }
  const extension = path.extname(input).toLowerCase();
  if (!SAFE_EXTENSION.test(extension) || !SUPPORTED_EXTENSIONS.has(extension)) {
    fail(`${label} uses an unsupported image or editable-art extension.`);
  }
  return input;
}

export function portableRelative(value, label, { allowEmpty = false } = {}) {
  if (typeof value !== "string") fail(`${label} must be a string.`);
  const normalized = value.replaceAll("\\", "/").trim();
  if (!normalized && allowEmpty) return "";
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/u.test(normalized) ||
    normalized.includes("\0")
  ) {
    fail(`${label} must be a non-empty relative path.`);
  }
  const parts = normalized.split("/");
  if (
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        /[<>:"|?*\u0000-\u001f]/u.test(part),
    )
  ) {
    fail(`${label} contains an unsafe path segment.`);
  }
  return parts.join("/");
}

export function normalizeTags(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 64) {
    fail(`${label} must contain at most 64 strings.`);
  }
  return [
    ...new Set(
      value.map((item, index) =>
        requiredString(item, `${label}[${index}]`, 256),
      ),
    ),
  ].sort();
}

export function normalizeTimestamp(value, label) {
  const raw = requiredString(value, label, 64);
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== raw) {
    fail(`${label} must be a canonical UTC ISO-8601 timestamp.`);
  }
  return raw;
}
