import path from "node:path";

import { fail } from "../../layered-godot-workspace-writer.mjs";

export const MAXIMUM_INPUT_BYTES = 32 * 1024 * 1024;
const SHA256 = /^[0-9a-f]{64}$/u;
const DECIMAL = /^(?:0|[1-9][0-9]*)$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

export const AUDIT_AUTHORITY_KEYS = [
  "fileWritePerformed",
  "targetRepositoryMutationPerformed",
  "godotExecutionPerformed",
  "runtimeActivationPerformed",
  "gitCommitCreated",
  "gitPushPerformed",
  "deploymentPerformed",
  "publicationPerformed",
  "forcePushPerformed",
];

export const RUNTIME_AUTHORITY_KEYS = [
  "godotExecutionPerformed",
  "sandboxFileWritePerformed",
  "targetRepositoryReadPerformed",
  "targetRepositoryMutationPerformed",
  "targetRuntimeActivationPerformed",
  "gitCommitCreated",
  "gitPushPerformed",
  "deploymentPerformed",
  "publicationPerformed",
  "forcePushPerformed",
];

export const gateFail = (code, message, details = undefined) =>
  fail(`LAYERED_GODOT_HANDOFF_${code}`, message, details);

export function exactObject(value, keys, label, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    gateFail(code, `${label} must be an object.`);
  }
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      gateFail(code, `${label} contains unsupported field ${key}.`);
    }
  }
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      gateFail(code, `${label} is missing required field ${key}.`);
    }
  }
  return value;
}

export function sha(value, label, code) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    gateFail(code, `${label} must be lowercase SHA-256.`);
  }
  return value;
}

export function utc(value, label, code) {
  if (typeof value !== "string" || value.length > 64) {
    gateFail(code, `${label} must be canonical UTC ISO-8601.`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    gateFail(code, `${label} must be canonical UTC ISO-8601.`);
  }
  return value;
}

export function boundedText(value, label, maximum, code) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    value.includes("\0")
  ) {
    gateFail(code, `${label} must be a bounded non-empty string.`);
  }
  return value;
}

export function repository(value, label, code) {
  boundedText(value, label, 240, code);
  if (!REPOSITORY.test(value)) {
    gateFail(code, `${label} must be OWNER/REPOSITORY.`);
  }
  return value;
}

export function absolutePath(value, label, code) {
  boundedText(value, label, 8192, code);
  if (!path.isAbsolute(value) || path.resolve(value) !== value) {
    gateFail(code, `${label} must be an absolute normalized path.`);
  }
  return value;
}

export function relativeResourcePath(value, label, code) {
  boundedText(value, label, 8192, code);
  if (
    value.includes("\\") ||
    value.startsWith("/") ||
    /^[A-Za-z]:\//u.test(value) ||
    path.posix.normalize(value) !== value ||
    value.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    gateFail(code, `${label} must be a canonical workspace-relative resource path.`);
  }
  return value;
}

export function safeBytes(value, label, code, { positive = false } = {}) {
  if (
    !Number.isSafeInteger(value) ||
    value < (positive ? 1 : 0)
  ) {
    gateFail(code, `${label} must be a ${positive ? "positive" : "non-negative"} safe integer.`);
  }
  return value;
}

export function decimalString(value, label, code) {
  if (typeof value !== "string" || value.length > 80 || !DECIMAL.test(value)) {
    gateFail(code, `${label} must be canonical non-negative decimal text.`);
  }
  return value;
}

export function validateFilesystemIdentity(value, label, code, expectedBytes) {
  const identity = exactObject(
    value,
    ["dev", "ino", "size", "mtimeNs"],
    label,
    code,
  );
  decimalString(identity.dev, `${label}.dev`, code);
  decimalString(identity.ino, `${label}.ino`, code);
  decimalString(identity.size, `${label}.size`, code);
  decimalString(identity.mtimeNs, `${label}.mtimeNs`, code);
  if (expectedBytes !== undefined && identity.size !== String(expectedBytes)) {
    gateFail(code, `${label}.size must bind the recorded byte length.`);
  }
  return identity;
}
