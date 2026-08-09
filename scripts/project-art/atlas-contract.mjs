import { createHash } from "node:crypto";
import { lstat, open, realpath, stat } from "node:fs/promises";
import path from "node:path";

export const PROJECT_ART_ATLAS_REQUEST_SCHEMA =
  "evavo.project-art-atlas-request.v1";
export const PROJECT_ART_ATLAS_PLAN_SCHEMA =
  "evavo.project-art-atlas-plan.v1";
export const PROJECT_ART_ATLAS_RECEIPT_SCHEMA =
  "evavo.project-art-atlas-receipt.v1";

export const SHA256 = /^[a-f0-9]{64}$/u;
export const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
export const IMAGE_EXTENSIONS = new Set([".png", ".webp", ".jpg", ".jpeg"]);

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
  if (!normalized || normalized.length > maximum || normalized.includes("\0")) {
    fail(`${label} must contain 1 to ${maximum} safe characters.`);
  }
  return normalized;
}

export function safeId(value, label) {
  const normalized = requiredString(value, label, 256);
  if (!SAFE_ID.test(normalized) || normalized.includes("..")) {
    fail(`${label} uses an unsafe identifier.`);
  }
  return normalized;
}

export function integer(value, fallback, minimum, maximum, label) {
  const selected = value === undefined ? fallback : value;
  if (
    !Number.isSafeInteger(selected) ||
    selected < minimum ||
    selected > maximum
  ) {
    fail(`${label} must be an integer between ${minimum} and ${maximum}.`);
  }
  return selected;
}

export function booleanValue(value, fallback, label) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") fail(`${label} must be boolean.`);
  return value;
}

export function absolutePath(value, label) {
  const raw = requiredString(value, label);
  if (!path.isAbsolute(raw)) fail(`${label} must be absolute.`);
  return path.resolve(raw);
}

function pathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

export async function secureFile(candidate, allowedRoots, label) {
  const lexical = path.resolve(candidate);
  const matching = allowedRoots.find((root) => pathInside(root, lexical));
  if (!matching) fail(`${label} is outside every allowed source root.`);
  let current = matching;
  for (const part of path.relative(matching, lexical).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const info = await lstat(current).catch(() => null);
    if (!info) fail(`${label} does not exist.`);
    if (info.isSymbolicLink()) fail(`${label} contains a symbolic-link component.`);
  }
  const info = await stat(lexical);
  if (!info.isFile()) fail(`${label} must be a regular file.`);
  const resolved = await realpath(lexical);
  if (!pathInside(await realpath(matching), resolved)) fail(`${label} escaped its root.`);
  const extension = path.extname(resolved).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) {
    fail(`${label} must be PNG, WebP, JPEG or JPG.`);
  }
  return { resolved, size: info.size };
}

export function validateTimestamp(value, label) {
  const raw = requiredString(value, label, 64);
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== raw) {
    fail(`${label} must be a canonical UTC ISO-8601 timestamp.`);
  }
  return raw;
}
