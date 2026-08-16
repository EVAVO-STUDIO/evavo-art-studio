import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const REQUEST_CONTRACT = "evavo_art_asset_fabricator_reference_request_v1";
export const HANDOFF_SCHEMA = "evavo.art.asset-fabricator-reference-handoff.v1";
export const PROTOCOL_VERSION = "2026-08-16.8";
export const ID = /^[a-z0-9][a-z0-9-]{1,127}$/u;
export const SHA = /^[0-9a-f]{64}$/u;
export const ASSET_CLASSES = new Set([
  "prop", "hero-prop", "character", "creature", "vehicle", "architecture",
  "environment-piece", "environment-kit", "terrain", "abstract",
]);
export const STYLE_FAMILIES = new Set([
  "stylised-realism", "painterly-realism", "feature-animation", "graphic-toon",
  "realistic", "hand-painted", "custom",
]);
export const VIEWS = new Set([
  "front", "back", "left", "right", "top", "bottom", "three-quarter",
  "detail", "concept", "turntable",
]);
export const ROLES = new Set([
  "geometry", "appearance", "silhouette", "proportion", "material",
  "environment", "turntable",
]);
export const RIGHTS = new Set(["owned", "licensed", "public-domain", "review-required"]);
export const TOPOLOGY = new Set(["preserve", "repair", "quadriflow", "voxel-remesh", "manual-review"]);
export const MATERIAL_WORKFLOWS = new Set(["metallic-roughness", "openpbr-surface", "unlit"]);
export const RIG_TYPES = new Set(["none", "humanoid", "quadruped", "mechanical", "custom"]);
export const DELIVERY_TARGETS = new Set(["threejs", "godot", "unity", "unreal", "blender"]);
export const REQUIRED_TEXTURE_ROLES = Object.freeze([
  "base-color", "normal", "roughness", "metalness", "ao", "mask",
]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export function fail(message) {
  throw new Error(`EVAVO_ART_REFERENCE_HANDOFF_INVALID:${message}`);
}
export function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label}:object-required`);
  return value;
}
export function exact(value, keys, label) {
  const actual = Object.keys(object(value, label)).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label}:field-closure`);
}
export function id(value, label) {
  if (typeof value !== "string" || !ID.test(value)) fail(`${label}:invalid-id`);
  return value;
}
export function text(value, label, maximum = 12000) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) fail(`${label}:invalid-text`);
  return value;
}
export function finite(value, label, { minimum = -Infinity, maximum = Infinity } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    fail(`${label}:invalid-number`);
  }
  return value;
}
export function boolean(value, label) {
  if (typeof value !== "boolean") fail(`${label}:boolean-required`);
  return value;
}
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}
export function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
export function sha256(value) { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }
export function sha256Bytes(value) { return createHash("sha256").update(value).digest("hex"); }

export async function jsonEvidence(filePath, baseDirectory, label) {
  if (typeof filePath !== "string" || !filePath || filePath.includes("\0")) fail(`${label}:invalid-path`);
  const absolute = path.resolve(baseDirectory, filePath);
  const bytes = await readFile(absolute);
  if (bytes.length < 1 || bytes.length > 64 * 1024 * 1024) fail(`${label}:unsafe-size`);
  let document;
  try { document = JSON.parse(bytes.toString("utf8")); } catch { fail(`${label}:json-required`); }
  const contractVersion = document.contractVersion ?? document.schema;
  if (typeof contractVersion !== "string" || contractVersion.length < 3) fail(`${label}:contract-version-required`);
  return { path: absolute, sha256: sha256Bytes(bytes), bytes: bytes.length, contractVersion };
}
export async function imageEvidence(filePath, baseDirectory, label) {
  if (typeof filePath !== "string" || !filePath || filePath.includes("\0")) fail(`${label}:invalid-path`);
  const absolute = path.resolve(baseDirectory, filePath);
  const extension = path.extname(absolute).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) fail(`${label}:unsupported-image-format`);
  const bytes = await readFile(absolute);
  if (bytes.length < 16 || bytes.length > 64 * 1024 * 1024) fail(`${label}:unsafe-size`);
  const mediaType = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
  return { path: absolute, sha256: sha256Bytes(bytes), bytes: bytes.length, mediaType };
}
export function requiredViews(assetClass) {
  const base = ["front", "back", "left", "right", "three-quarter"];
  return ["vehicle", "architecture", "environment-piece", "environment-kit", "terrain"].includes(assetClass)
    ? [...base, "top"] : base;
}
export function authority() {
  return {
    providerExecution: false,
    automaticCreativeApproval: false,
    imageMutation: false,
    automatic3dGeneration: false,
    automaticTextureBake: false,
    automaticMaterialAssembly: false,
    targetRepositoryMutation: false,
    gitMutation: false,
    deployment: false,
    publication: false,
    namedHumanApprovalRequired: true,
  };
}
