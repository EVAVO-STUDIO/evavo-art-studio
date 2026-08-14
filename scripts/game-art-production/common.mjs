import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const GAME_ART_PRODUCTION_PROFILE_SCHEMA = "evavo.game-art-production-profile.v1";
export const GAME_ART_PRODUCTION_PROJECT_SCHEMA = "evavo.game-art-production-project.v1";
export const GAME_ART_PRODUCTION_RESOLVED_PROJECT_SCHEMA = "evavo.game-art-production-resolved-project.v1";
export const GAME_ART_PRODUCTION_WORK_ORDER_SCHEMA = "evavo.game-art-production-work-order.v1";
export const GAME_ART_PRODUCTION_PROTOCOL_VERSION = "2026-08-14.1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "../..");
export const CONFIG_ROOT = path.join(ROOT, "config", "game-art-production");
export const PROFILE_ROOT = path.join(CONFIG_ROOT, "profiles");
export const PROJECT_ROOT = path.join(CONFIG_ROOT, "projects");
export const ID_PATTERN = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/u;
export const PATH_TOKEN_PATTERN = /\{([A-Za-z][A-Za-z0-9]*)(?::(\d{2}))?\}/gu;
export const ALPHA_MODES = new Set(["transparent", "opaque", "mixed"]);
export const FORBIDDEN_AUTHORITY_KEYS = Object.freeze([
  "providerExecution",
  "automaticGenerationAuthorization",
  "automaticApproval",
  "automaticPromotion",
  "targetRepositoryMutation",
  "gitMutation",
  "deployment",
  "publication",
]);
export const ALLOWED_ASSET_OVERRIDE_KEYS = new Set([
  "nativeDimensions",
  "authoringCanvas",
  "alpha",
  "pivot",
  "groundLineY",
  "reviewPreset",
  "pathTemplate",
  "masterPathTemplate",
  "qaChecks",
  "failureCodes",
  "promptFragments",
]);
export const ALLOWED_PRODUCTION_DEFAULT_KEYS = new Set([
  "batchSize",
  "candidateFanout",
  "maximumRepairAttempts",
]);

export function fail(message) {
  throw new Error(`GAME_ART_PRODUCTION_PROFILE_INVALID: ${message}`);
}

export function assert(condition, message) {
  if (!condition) fail(message);
}

export function object(value, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  return value;
}

export function array(value, label, minimum = 0) {
  assert(Array.isArray(value), `${label} must be an array.`);
  assert(value.length >= minimum, `${label} must contain at least ${minimum} item(s).`);
  return value;
}

export function string(value, label, minimum = 1, maximum = 8192) {
  assert(typeof value === "string" && value.trim() === value, `${label} must be a trimmed string.`);
  assert(value.length >= minimum && value.length <= maximum, `${label} must contain ${minimum}-${maximum} characters.`);
  return value;
}

export function integer(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  assert(Number.isInteger(value), `${label} must be an integer.`);
  assert(value >= minimum && value <= maximum, `${label} must be between ${minimum} and ${maximum}.`);
  return value;
}

export function id(value, label) {
  const result = string(value, label, 1, 160);
  assert(ID_PATTERN.test(result), `${label} must be a lowercase kebab-case identifier.`);
  return result;
}

export function uniqueStrings(values, label, { identifiers = false } = {}) {
  const normalized = array(values, label, 1).map((value, index) => identifiers
    ? id(value, `${label}[${index}]`)
    : string(value, `${label}[${index}]`, 1, 1200));
  assert(new Set(normalized).size === normalized.length, `${label} contains duplicates.`);
  return normalized;
}

export function dimensions(value, label) {
  const input = object(value, label);
  return freeze({
    width: integer(input.width, `${label}.width`, 1, 16384),
    height: integer(input.height, `${label}.height`, 1, 16384),
  });
}

export function validateIntegerScale(nativeDimensions, authoringCanvas, label) {
  assert(authoringCanvas.width >= nativeDimensions.width && authoringCanvas.height >= nativeDimensions.height, `${label} must not be smaller than native dimensions.`);
  assert(authoringCanvas.width % nativeDimensions.width === 0 && authoringCanvas.height % nativeDimensions.height === 0, `${label} must be an integer multiple of native dimensions.`);
  const scaleX = authoringCanvas.width / nativeDimensions.width;
  const scaleY = authoringCanvas.height / nativeDimensions.height;
  assert(scaleX === scaleY, `${label} must use one uniform integer scale.`);
  return scaleX;
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return `${JSON.stringify(sorted(value), null, 2)}\n`;
}

export function sha256(value) {
  return createHash("sha256")
    .update(typeof value === "string" || Buffer.isBuffer(value) ? value : canonicalJson(value))
    .digest("hex");
}

export function freeze(value) {
  if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) return value;
  if (Array.isArray(value)) value.forEach(freeze);
  else if (value && typeof value === "object") Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

export function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function assertKnownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) assert(allowed.has(key), `${label} contains unsupported key ${key}.`);
}

export function validateAuthority(input, label) {
  const authority = object(input, label);
  for (const key of FORBIDDEN_AUTHORITY_KEYS) {
    assert(authority[key] === false, `${label}.${key} must remain false.`);
  }
  assert(authority.namedHumanApprovalRequired === true, `${label}.namedHumanApprovalRequired must remain true.`);
  return freeze({
    providerExecution: false,
    automaticGenerationAuthorization: false,
    automaticApproval: false,
    automaticPromotion: false,
    targetRepositoryMutation: false,
    gitMutation: false,
    deployment: false,
    publication: false,
    namedHumanApprovalRequired: true,
  });
}

export function safeTemplate(value, label, requiredRoot) {
  const template = string(value, label, 1, 1600);
  assert(!template.includes("\\") && !path.posix.isAbsolute(template), `${label} must be a POSIX relative path template.`);
  const segments = template.split("/");
  assert(segments.every((segment) => segment && segment !== "." && segment !== ".."), `${label} contains an unsafe path segment.`);
  assert(template.startsWith(`${requiredRoot}/`), `${label} must remain beneath ${requiredRoot}/.`);
  for (const match of template.matchAll(/\{([^}]+)\}/gu)) {
    assert(/^[A-Za-z][A-Za-z0-9]*(?::\d{2})?$/u.test(match[1]), `${label} contains invalid token {${match[1]}}.`);
  }
  return template;
}

export async function readStableJson(filePath, label) {
  const before = await lstat(filePath);
  assert(before.isFile() && !before.isSymbolicLink(), `${label} must be a regular non-symlink file.`);
  const bytes = await readFile(filePath);
  const after = await lstat(filePath);
  assert(before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs, `${label} changed while it was being read.`);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    fail(`${label} is invalid UTF-8 JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function safeConfigFile(root, identifier, label) {
  const safeId = id(identifier, label);
  const rootReal = await realpath(root);
  const filePath = path.join(rootReal, `${safeId}.v1.json`);
  const fileReal = await realpath(filePath);
  const relative = path.relative(rootReal, fileReal);
  assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative), `${label} escaped its config root.`);
  return fileReal;
}
