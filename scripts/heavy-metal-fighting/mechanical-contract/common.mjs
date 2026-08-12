import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";

export const MECHANICAL_CONTRACT_SCHEMA = "evavo.mechanical-sprite-contract.v1";
export const MECHANICAL_CONTRACT_PROTOCOL_VERSION = "2026-08-12.1";
export const REQUIRED_FRAME_IDS = Object.freeze(["bastion", "viper", "citadel", "mirage"]);

export function fail(message) {
  throw new Error(`HEAVY_METAL_FIGHTING_MECHANICAL_CONTRACT_INVALID: ${message}`);
}

export function assert(condition, message) {
  if (!condition) fail(message);
}

export function asObject(value, label) {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  return value;
}

export function asArray(value, label, minimum = 0) {
  assert(Array.isArray(value), `${label} must be an array.`);
  assert(value.length >= minimum, `${label} must contain at least ${minimum} item(s).`);
  return value;
}

export function asString(value, label, pattern) {
  assert(typeof value === "string" && value.trim().length > 0, `${label} must be a non-empty string.`);
  const result = value.trim();
  if (pattern) assert(pattern.test(result), `${label} has an invalid format.`);
  return result;
}

export function asInteger(value, label, minimum = 0) {
  assert(Number.isInteger(value) && value >= minimum, `${label} must be an integer greater than or equal to ${minimum}.`);
  return value;
}

export function asPositiveNumber(value, label) {
  assert(typeof value === "number" && Number.isFinite(value) && value > 0, `${label} must be a positive finite number.`);
  return value;
}

export function asTrue(value, label) {
  assert(value === true, `${label} must remain true.`);
  return true;
}

export function unique(values, label) {
  const seen = new Set();
  for (const value of values) {
    assert(!seen.has(value), `${label} contains duplicate value ${value}.`);
    seen.add(value);
  }
  return values;
}

export function deepFreeze(value) {
  if (Array.isArray(value)) {
    value.forEach(deepFreeze);
    return Object.freeze(value);
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }
  return value;
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, sortObject(value[key])]),
  );
}

export function canonicalJson(value) {
  return `${JSON.stringify(sortObject(value), null, 2)}\n`;
}

export function sha256(value) {
  const bytes = typeof value === "string" || Buffer.isBuffer(value) ? value : canonicalJson(value);
  return createHash("sha256").update(bytes).digest("hex");
}

export function normalizePoint(value, label) {
  const point = asObject(value, label);
  return deepFreeze({
    x: asInteger(point.x, `${label}.x`),
    y: asInteger(point.y, `${label}.y`),
  });
}

export function normalizeStringArray(value, label, minimum = 1) {
  return deepFreeze(unique(
    asArray(value, label, minimum).map((item, index) => asString(item, `${label}[${index}]`)),
    label,
  ));
}

