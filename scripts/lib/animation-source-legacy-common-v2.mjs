import { extname, isAbsolute } from "node:path";

export const MAX_LEGACY_SCAN_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_LEGACY_SCAN_TOTAL_BYTES = 128 * 1024 * 1024;

const CONTROL = /[\u0000-\u001f\u007f]/u;
const CODE_EXTENSIONS = new Set([
  ".astro", ".cjs", ".cts", ".js", ".jsx", ".mdx",
  ".mjs", ".mts", ".svelte", ".ts", ".tsx", ".vue",
]);

export function failLegacy(code, detail, report) {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  if (report !== undefined) error.report = report;
  throw error;
}

function bigintField(value, fallback = 0) {
  return typeof value === "bigint"
    ? value
    : BigInt(Math.trunc(Number(value ?? fallback)));
}

export function statFingerprint(value) {
  return Object.freeze({
    dev: bigintField(value.dev),
    ino: bigintField(value.ino),
    mode: bigintField(value.mode),
    nlink: bigintField(value.nlink),
    size: bigintField(value.size),
    mtimeNs: typeof value.mtimeNs === "bigint"
      ? value.mtimeNs
      : BigInt(Math.trunc(Number(value.mtimeMs ?? 0) * 1_000_000)),
    ctimeNs: typeof value.ctimeNs === "bigint"
      ? value.ctimeNs
      : BigInt(Math.trunc(Number(value.ctimeMs ?? 0) * 1_000_000)),
  });
}

export function sameFingerprint(left, right) {
  return left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs;
}

export function codePointCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function normalizeTrackedPath(value) {
  if (typeof value !== "string" || !value || CONTROL.test(value) ||
      value.includes("\\") || isAbsolute(value) ||
      value.normalize("NFC") !== value) {
    failLegacy("ANIMATION_SOURCE_LEGACY_V2_TRACKED_PATH_INVALID", String(value));
  }
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    failLegacy("ANIMATION_SOURCE_LEGACY_V2_TRACKED_PATH_INVALID", value);
  }
  return value;
}

export function portablePathKey(value) {
  return value.normalize("NFC").toLocaleLowerCase("en-US");
}

export function isCodePath(value) {
  return CODE_EXTENSIONS.has(extname(value).toLowerCase());
}

export function isNonProductionPath(value) {
  const name = value.split("/").at(-1) ?? value;
  return value === "scripts/lib/animation-source-bundle.mjs" ||
    value === "scripts/check-animation-source-bundle.mjs" ||
    value.startsWith("scripts/lib/animation-source-legacy-") ||
    value.startsWith("scripts/test-") ||
    value.startsWith("scripts/test_") ||
    value.startsWith("test/") ||
    value.startsWith("tests/") ||
    name.includes(".test.") ||
    name.includes(".spec.") ||
    value.includes("/test/") ||
    value.includes("/tests/") ||
    value.includes("/__tests__/");
}
