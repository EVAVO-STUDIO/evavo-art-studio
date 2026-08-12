import { createHash } from "node:crypto";
import path from "node:path";

export const LAYERED_GODOT_WORKSPACE_WRITER_PROTOCOL_VERSION =
  "2026-08-12.2";
export const LAYERED_GODOT_INTEGRATION_PROTOCOL_VERSION = "2026-08-11.1";
export const LAYERED_GODOT_INTEGRATION_PLAN_KIND =
  "evavo.layered-production.godot-integration-plan";
export const LAYERED_GODOT_WORKSPACE_WRITE_REQUEST_KIND =
  "evavo.layered-production.godot-workspace-write-request";
export const LAYERED_GODOT_WORKSPACE_WRITE_RECEIPT_KIND =
  "evavo.layered-production.godot-workspace-write-receipt";
export const LAYERED_GODOT_WORKSPACE_RECOVERY_RECEIPT_KIND =
  "evavo.layered-production.godot-workspace-recovery-receipt";
export const LAYERED_GODOT_TRANSACTION_ROOT = ".evavo-godot-transactions";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
export const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/u;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const WINDOWS_RESERVED_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  ...Array.from({ length: 9 }, (_, index) => `COM${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `LPT${index + 1}`),
]);
const REPOSITORY_CONTROL_SEGMENTS = new Set([
  ".git",
  ".github",
  ".hg",
  ".svn",
  ".art-studio",
  ".godot",
  ".evavo-godot-transactions",
  "node_modules",
]);
export const EXPECTED_RESOURCE_KINDS = new Set([
  "scene-draft",
  "route-graph",
  "placements",
  "animations",
  "cameras",
  "import-policy",
  "integration-manifest",
]);
export const MAXIMUM_PLAN_BYTES = 32 * 1024 * 1024;
export const MAXIMUM_RESOURCE_BYTES = 8 * 1024 * 1024;
export const MAXIMUM_TOTAL_BYTES = 32 * 1024 * 1024;
export const MAXIMUM_JOURNAL_BYTES = 4 * 1024 * 1024;

export class LayeredGodotWorkspaceWriterError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "LayeredGodotWorkspaceWriterError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function fail(code, message, details = undefined) {
  throw new LayeredGodotWorkspaceWriterError(code, message, details);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function record(value, label) {
  if (!isRecord(value)) {
    fail("LAYERED_GODOT_WRITE_INPUT_INVALID", `${label} must be an object.`);
  }
  return value;
}

export function text(value, label, maximum = 1024) {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    fail(
      "LAYERED_GODOT_WRITE_INPUT_INVALID",
      `${label} must be a non-empty string no longer than ${maximum} characters.`,
    );
  }
  return value;
}

export function literal(value, expected, label) {
  if (value !== expected) {
    fail(
      "LAYERED_GODOT_WRITE_INPUT_INVALID",
      `${label} must equal ${String(expected)}.`,
    );
  }
  return expected;
}

export function identifier(value, label) {
  const output = text(value, label, 128);
  if (!IDENTIFIER_PATTERN.test(output)) {
    fail(
      "LAYERED_GODOT_WRITE_INPUT_INVALID",
      `${label} is not a portable identifier.`,
    );
  }
  return output;
}

export function sha256Value(value, label) {
  const output = text(value, label, 64);
  if (!SHA256_PATTERN.test(output)) {
    fail("LAYERED_GODOT_WRITE_INPUT_INVALID", `${label} must be lowercase SHA-256.`);
  }
  return output;
}

export function repositoryName(value, label) {
  const output = text(value, label, 256);
  if (!REPOSITORY_PATTERN.test(output)) {
    fail(
      "LAYERED_GODOT_WRITE_INPUT_INVALID",
      `${label} must be an owner/repository identifier.`,
    );
  }
  return output;
}

function canonicalize(value, seen = new Set()) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      fail(
        "LAYERED_GODOT_WRITE_INPUT_INVALID",
        "Canonical payload contains a non-finite number.",
      );
    }
    return value;
  }
  if (typeof value !== "object" || value === undefined) {
    fail(
      "LAYERED_GODOT_WRITE_INPUT_INVALID",
      "Canonical payload contains a non-JSON value.",
    );
  }
  if (seen.has(value)) {
    fail("LAYERED_GODOT_WRITE_INPUT_INVALID", "Canonical payload contains a cycle.");
  }
  seen.add(value);
  let output;
  if (Array.isArray(value)) {
    output = value.map((entry) => canonicalize(entry, seen));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      fail(
        "LAYERED_GODOT_WRITE_INPUT_INVALID",
        "Canonical payload contains a non-plain object.",
      );
    }
    output = Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => {
          if (value[key] === undefined) {
            fail(
              "LAYERED_GODOT_WRITE_INPUT_INVALID",
              `Canonical payload property ${key} is undefined.`,
            );
          }
          return [key, canonicalize(value[key], seen)];
        }),
    );
  }
  seen.delete(value);
  return output;
}

export function canonicalSha256(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex");
}

export function bytesSha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function portableRelativePath(value, label) {
  const output = text(value, label, 2048);
  if (
    output.includes("\\") ||
    output.includes("\0") ||
    output.includes(":") ||
    output.startsWith("/") ||
    output.endsWith("/") ||
    path.posix.normalize(output) !== output
  ) {
    fail(
      "LAYERED_GODOT_WRITE_PATH_INVALID",
      `${label} must be one canonical portable repository-relative path.`,
    );
  }
  const parts = output.split("/");
  if (
    parts.some(
      (part) =>
        part.length === 0 ||
        part === "." ||
        part === ".." ||
        part.length > 120 ||
        /[<>"|?*\u0000-\u001f]/u.test(part) ||
        part.endsWith(".") ||
        part.endsWith(" ") ||
        WINDOWS_RESERVED_NAMES.has(part.split(".")[0].toUpperCase()) ||
        REPOSITORY_CONTROL_SEGMENTS.has(part.toLowerCase()),
    )
  ) {
    fail(
      "LAYERED_GODOT_WRITE_PATH_INVALID",
      `${label} contains an unsafe path component.`,
    );
  }
  return output;
}

export function absoluteWorkspaceRoot(value) {
  const output = text(value, "workspaceRoot", 4096);
  if (!path.isAbsolute(output) || path.normalize(output) !== output) {
    fail(
      "LAYERED_GODOT_WRITE_ROOT_INVALID",
      "workspaceRoot must be an absolute normalized filesystem path.",
    );
  }
  return output;
}
