import { createHash } from "node:crypto";
import path from "node:path";

export const REQUEST_SCHEMA = "evavo.pixel-font-family-request.v1";
export const PLAN_SCHEMA = "evavo.pixel-font-family-plan.v1";
export const FACE_SCHEMA = "evavo.pixel-font-face.v1";
export const FAMILY_SCHEMA = "evavo.pixel-font-family.v1";
export const VALIDATION_SCHEMA = "evavo.pixel-font-validation.v1";
export const RECEIPT_SCHEMA = "evavo.pixel-font-build-receipt.v1";

export const AUTHORITY = Object.freeze({
  providerExecution: false,
  creativeApproval: false,
  historicalApproval: false,
  nativeGodotApproval: false,
  candidatePromotion: false,
  sourceMutation: false,
  sourceDeletion: false,
  targetRepositoryMutation: false,
  gitCommit: false,
  gitPush: false,
  publication: false,
  forcePush: false,
});

const CONTROL = /[\u0000-\u001f\u007f]/u;
const HASH = /^[0-9a-f]{64}$/u;

export function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export const sha256 = (value) =>
  createHash("sha256").update(Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8")).digest("hex");
export const hashObject = (value) => sha256(stable(value));
export const isHash = (value) => HASH.test(String(value ?? ""));

export function objectValue(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

export function text(value, label, minimum = 1, maximum = 4096) {
  if (typeof value !== "string" || value.trim() !== value || value.length < minimum || value.length > maximum || CONTROL.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

export function integer(value, label, minimum, maximum) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

export function booleanValue(value, label) {
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean.`);
  return value;
}

export function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value) || ArrayBuffer.isView(value)) return value;
  seen.add(value);
  for (const entry of Object.values(value)) deepFreeze(entry, seen);
  return Object.freeze(value);
}

export const normalizedPath = (value) =>
  process.platform === "win32" ? path.resolve(value).toLocaleLowerCase("en-US") : path.resolve(value);

export function pathInside(candidate, root) {
  const relative = path.relative(normalizedPath(root), normalizedPath(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
