import crypto from "node:crypto";
import path from "node:path";

export const SHA256 = /^[0-9a-f]{64}$/u;
export const PART_NAME = /^runtime\.part-[0-9]{3}\.base64$/u;
export const CHECKSUM_LINE = /^([0-9a-f]{64})  \.\/(.+)$/u;
export const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
export const EXPECTED_CONTRACT = "evavo.creative-asset-publisher-sealed-distribution.v2";
export const EXPECTED_PACKAGE = "@evavo/creative-asset-publisher";
export const EXPECTED_VERSION = "0.4.1";

export function plainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

export function cleanText(value, label) {
  const text = String(value ?? "").trim();
  if (!text || /[\u0000\r\n]/u.test(text)) throw new Error(`${label} is invalid.`);
  return text;
}

export function exactSha(value, label) {
  const text = cleanText(value, label);
  if (!SHA256.test(text)) throw new Error(`${label} must be lowercase SHA-256.`);
  return text;
}

export function safeInteger(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

export function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function safeRelative(name, label = "path") {
  const original = String(name ?? "");
  const normalized = original.replaceAll("\\", "/").replace(/^\.\//u, "");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:/u.test(normalized) || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new Error(`${label} is absolute or invalid.`);
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`${label} contains traversal or a non-canonical segment.`);
  }
  return segments.join("/");
}

export function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
