#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const WEB_ASSET_CONTRACT = "evavo_web_asset_pipeline_v1";
export const WEB_ASSET_SCHEMA_VERSION = "1.0";
export const WEB_ASSET_PLAN_SCHEMA = "evavo_web_asset_publication_plan_v1";
export const WEB_ASSET_RECEIPT_SCHEMA = "evavo_web_asset_publication_receipt_v1";

const MAX_ASSETS = 64;
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const SOURCE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".tif",
  ".tiff",
  ".bmp",
]);
const SOURCE_SURFACES = new Set([
  "attachment",
  "chatgpt-conversation",
  "chatgpt-library",
  "cloudinary",
  "evavo-storage",
  "local-file",
  "workspace",
]);
const MANDATORY_TAGS = Object.freeze([
  "do-not-delete",
  "evavo",
  "metadata-complete",
  "production",
  "raster",
  "web-asset",
]);
const RESERVED_CONTEXT_KEYS = new Set([
  "accessibility_alt",
  "alt",
  "asset_id",
  "asset_role",
  "batch_id",
  "caption",
  "dimensions",
  "orientation",
  "project",
  "review_date",
  "review_status",
  "reviewed_by",
  "site_area",
  "source_original_name",
  "source_sha256",
  "source_surface",
  "status",
  "title",
  "usage",
  "usage_note",
  "variant",
]);

export class WebAssetPipelineError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "WebAssetPipelineError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new WebAssetPipelineError(code, message, details);
}

function assertPlainObject(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail("WEB_ASSET_MANIFEST_INVALID", `${label} must be an object.`);
  }
  return value;
}

function assertExactKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      fail(
        "WEB_ASSET_MANIFEST_INVALID",
        `${label} contains unsupported key ${JSON.stringify(key)}.`,
      );
    }
  }
}

function requiredString(value, label, minimum = 1, maximum = 1024) {
  if (typeof value !== "string") {
    fail("WEB_ASSET_MANIFEST_INVALID", `${label} must be a string.`);
  }
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    fail(
      "WEB_ASSET_MANIFEST_INVALID",
      `${label} must contain ${minimum}-${maximum} characters.`,
    );
  }
  if (/\p{Cc}/u.test(normalized)) {
    fail("WEB_ASSET_MANIFEST_INVALID", `${label} contains control characters.`);
  }
  return normalized;
}

function optionalString(value, label, maximum = 1024) {
  return value === undefined ? undefined : requiredString(value, label, 1, maximum);
}

function requiredInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(
      "WEB_ASSET_MANIFEST_INVALID",
      `${label} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return value;
}

function requiredBoolean(value, label) {
  if (typeof value !== "boolean") {
    fail("WEB_ASSET_MANIFEST_INVALID", `${label} must be a boolean.`);
  }
  return value;
}

function slug(value, label, maximum = 100) {
  const normalized = requiredString(value, label, 1, maximum).toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(normalized)) {
    fail(
      "WEB_ASSET_MANIFEST_INVALID",
      `${label} must be a lowercase ASCII slug using letters, numbers and hyphens.`,
    );
  }
  return normalized;
}

function cloudinaryPath(value, label) {
  const normalized = requiredString(value, label, 1, 255);
  if (
    normalized.startsWith("/") ||
    normalized.endsWith("/") ||
    normalized.includes("//") ||
    normalized.includes("..") ||
    !/^[a-z0-9][a-z0-9/_-]*[a-z0-9]$/u.test(normalized)
  ) {
    fail(
      "WEB_ASSET_MANIFEST_INVALID",
      `${label} must be a lowercase extension-free Cloudinary path.`,
    );
  }
  return normalized;
}

function sha256Hex(value, label) {
  const normalized = requiredString(value, label, 64, 64).toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(normalized)) {
    fail("WEB_ASSET_MANIFEST_INVALID", `${label} must be a SHA-256 hex digest.`);
  }
  return normalized;
}

function isoDate(value, label) {
  const normalized = requiredString(value, label, 10, 40);
  const instant = Date.parse(normalized);
  if (!Number.isFinite(instant) || new Date(instant).toISOString() !== normalized) {
    fail(
      "WEB_ASSET_MANIFEST_INVALID",
      `${label} must be an exact UTC ISO-8601 timestamp.`,
    );
  }
  return normalized;
}

function relativeRasterPath(value, label) {
  const normalized = requiredString(value, label, 1, 512).replaceAll("\\", "/");
  if (
    normalized !== path.posix.normalize(normalized) ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/u.test(normalized) ||
    normalized.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    fail(
      "WEB_ASSET_MANIFEST_INVALID",
      `${label} must be a normalized relative path inside the workspace.`,
    );
  }
  const extension = path.posix.extname(normalized).toLowerCase();
  if (extension === ".svg" || !SOURCE_EXTENSIONS.has(extension)) {
    fail(
      "WEB_ASSET_RASTER_REQUIRED",
      `${label} must reference a supported raster image; SVG is intentionally excluded.`,
    );
  }
  return normalized;
}

function normalizeStringRecord(value, label, reserved = new Set()) {
  if (value === undefined) return Object.freeze({});
  const record = assertPlainObject(value, label);
  const result = {};
  for (const [key, entry] of Object.entries(record)) {
    if (!/^[a-z][a-z0-9_]{0,63}$/u.test(key)) {
      fail(
        "WEB_ASSET_MANIFEST_INVALID",
        `${label} key ${JSON.stringify(key)} is not a safe metadata identifier.`,
      );
    }
    if (reserved.has(key)) {
      fail(
        "WEB_ASSET_MANIFEST_INVALID",
        `${label}.${key} is owned by the pipeline and cannot be overridden.`,
      );
    }
    result[key] = requiredString(entry, `${label}.${key}`, 1, 1024);
  }
  return Object.freeze(result);
}

function normalizeTags(value, label) {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > 100) {
    fail("WEB_ASSET_MANIFEST_INVALID", `${label} must be an array of at most 100 tags.`);
  }
  const tags = value.map((entry, index) => {
    const tag = requiredString(entry, `${label}[${index}]`, 1, 100).toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]*$/u.test(tag)) {
      fail(
        "WEB_ASSET_MANIFEST_INVALID",
        `${label}[${index}] must be a lowercase Cloudinary-safe tag.`,
      );
    }
    return tag;
  });
  return Object.freeze([...new Set(tags)].sort());
}

function normalizeSource(value, label) {
  const source = assertPlainObject(value, label);
  assertExactKeys(
    source,
    new Set([
      "bytes",
      "mediaType",
      "originRef",
      "originalName",
      "path",
      "sha256",
      "surface",
    ]),
    label,
  );
  const surface = requiredString(source.surface, `${label}.surface`, 1, 40);
  if (!SOURCE_SURFACES.has(surface)) {
    fail(
      "WEB_ASSET_MANIFEST_INVALID",
      `${label}.surface must be one of ${[...SOURCE_SURFACES].sort().join(", ")}.`,
    );
  }
  const mediaType = optionalString(source.mediaType, `${label}.mediaType`, 100);
  if (mediaType !== undefined && !/^image\/[a-z0-9.+-]+$/iu.test(mediaType)) {
    fail("WEB_ASSET_MANIFEST_INVALID", `${label}.mediaType must be an image media type.`);
  }
  return Object.freeze({
    surface,
    path: relativeRasterPath(source.path, `${label}.path`),
    originalName: requiredString(source.originalName, `${label}.originalName`, 1, 255),
    sha256: sha256Hex(source.sha256, `${label}.sha256`),
    bytes: requiredInteger(source.bytes, `${label}.bytes`, 1, MAX_SOURCE_BYTES),
    ...(mediaType === undefined ? {} : { mediaType }),
    ...(source.originRef === undefined
      ? {}
      : { originRef: requiredString(source.originRef, `${label}.originRef`, 1, 512) }),
  });
}

function normalizeNaming(value, label) {
  const naming = assertPlainObject(value, label);
  assertExactKeys(
    naming,
    new Set(["assetFolder", "displayName", "fileStem", "publicId"]),
    label,
  );
  const fileStem = slug(naming.fileStem, `${label}.fileStem`, 100);
  const assetFolder = cloudinaryPath(naming.assetFolder, `${label}.assetFolder`);
  const publicId = cloudinaryPath(naming.publicId, `${label}.publicId`);
  if (publicId !== `${assetFolder}/${fileStem}`) {
    fail(
      "WEB_ASSET_MANIFEST_INVALID",
      `${label}.publicId must equal assetFolder/fileStem for deterministic publication.`,
    );
  }
  return Object.freeze({
    fileStem,
    assetFolder,
    publicId,
    displayName: requiredString(naming.displayName, `${label}.displayName`, 1, 255),
  });
}

function normalizeContent(value, label) {
  const content = assertPlainObject(value, label);
  assertExactKeys(
    content,
    new Set([
      "accessibilityAlt",
      "alt",
      "assetRole",
      "caption",
      "project",
      "reviewDate",
      "reviewStatus",
      "reviewedBy",
      "siteArea",
      "title",
      "usage",
      "usageNote",
    ]),
    label,
  );
  const reviewDate = requiredString(content.reviewDate, `${label}.reviewDate`, 10, 10);
  const reviewInstant = new Date(`${reviewDate}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(reviewDate) ||
    Number.isNaN(reviewInstant.valueOf()) ||
    reviewInstant.toISOString().slice(0, 10) !== reviewDate
  ) {
    fail("WEB_ASSET_MANIFEST_INVALID", `${label}.reviewDate must be YYYY-MM-DD.`);
  }
  const reviewStatus = requiredString(
    content.reviewStatus,
    `${label}.reviewStatus`,
    1,
    32,
  );
  if (reviewStatus !== "approved" && reviewStatus !== "review-required") {
    fail(
      "WEB_ASSET_MANIFEST_INVALID",
      `${label}.reviewStatus must be approved or review-required.`,
    );
  }
  return Object.freeze({
    alt: requiredString(content.alt, `${label}.alt`, 1, 600),
    accessibilityAlt: requiredString(
      content.accessibilityAlt,
      `${label}.accessibilityAlt`,
      1,
      600,
    ),
    caption: requiredString(content.caption, `${label}.caption`, 1, 1000),
    title: requiredString(content.title, `${label}.title`, 1, 255),
    project: requiredString(content.project, `${label}.project`, 1, 255),
    assetRole: requiredString(content.assetRole, `${label}.assetRole`, 1, 255),
    usage: requiredString(content.usage, `${label}.usage`, 1, 255),
    usageNote: requiredString(content.usageNote, `${label}.usageNote`, 1, 1000),
    siteArea: requiredString(content.siteArea, `${label}.siteArea`, 1, 255),
    reviewDate,
    reviewStatus,
    reviewedBy: requiredString(content.reviewedBy, `${label}.reviewedBy`, 1, 255),
  });
}

function normalizeBackground(value, label) {
  const background = assertPlainObject(value, label);
  assertExactKeys(
    background,
    new Set([
      "allowCheckerboardRecovery",
      "allowHighChromaInference",
      "matteColour",
      "mode",
      "suppressChromaSpill",
    ]),
    label,
  );
  const mode = requiredString(background.mode, `${label}.mode`, 1, 32);
  if (mode !== "preserve" && mode !== "recover-alpha") {
    fail(
      "WEB_ASSET_MANIFEST_INVALID",
      `${label}.mode must be preserve or recover-alpha.`,
    );
  }
  if (mode === "preserve" && Object.keys(background).some((key) => key !== "mode")) {
    fail(
      "WEB_ASSET_MANIFEST_INVALID",
      `${label} cannot contain recovery options when mode is preserve.`,
    );
  }
  const matteColour = optionalString(background.matteColour, `${label}.matteColour`, 7);
  if (matteColour !== undefined && !/^#[0-9a-f]{6}$/u.test(matteColour.toLowerCase())) {
    fail("WEB_ASSET_MANIFEST_INVALID", `${label}.matteColour must use #RRGGBB.`);
  }
  return Object.freeze({
    mode,
    ...(matteColour === undefined ? {} : { matteColour: matteColour.toLowerCase() }),
    ...(background.allowCheckerboardRecovery === undefined
      ? {}
      : {
          allowCheckerboardRecovery: requiredBoolean(
            background.allowCheckerboardRecovery,
            `${label}.allowCheckerboardRecovery`,
          ),
        }),
    ...(background.allowHighChromaInference === undefined
      ? {}
      : {
          allowHighChromaInference: requiredBoolean(
            background.allowHighChromaInference,
            `${label}.allowHighChromaInference`,
          ),
        }),
    ...(background.suppressChromaSpill === undefined
      ? {}
      : {
          suppressChromaSpill: requiredBoolean(
            background.suppressChromaSpill,
            `${label}.suppressChromaSpill`,
          ),
        }),
  });
}

function normalizeDelivery(value, label) {
  const delivery = assertPlainObject(value, label);
  assertExactKeys(delivery, new Set(["objectFit", "publishVariants"]), label);
  const objectFit = requiredString(delivery.objectFit, `${label}.objectFit`, 1, 16);
  if (objectFit !== "contain" && objectFit !== "cover") {
    fail("WEB_ASSET_MANIFEST_INVALID", `${label}.objectFit must be contain or cover.`);
  }
  if (
    !Array.isArray(delivery.publishVariants) ||
    delivery.publishVariants.length < 1 ||
    delivery.publishVariants.length > 2
  ) {
    fail(
      "WEB_ASSET_MANIFEST_INVALID",
      `${label}.publishVariants must contain master, web, or both.`,
    );
  }
  const publishVariants = delivery.publishVariants.map((entry, index) => {
    if (entry !== "master" && entry !== "web") {
      fail(
        "WEB_ASSET_MANIFEST_INVALID",
        `${label}.publishVariants[${index}] must be master or web.`,
      );
    }
    return entry;
  });
  if (new Set(publishVariants).size !== publishVariants.length) {
    fail("WEB_ASSET_MANIFEST_INVALID", `${label}.publishVariants contains duplicates.`);
  }
  return Object.freeze({ objectFit, publishVariants: Object.freeze([...publishVariants].sort()) });
}

function normalizeCloudinary(value, label) {
  const cloudinary = assertPlainObject(value, label);
  assertExactKeys(
    cloudinary,
    new Set(["context", "indexForVisualSearch", "metadata", "tags"]),
    label,
  );
  return Object.freeze({
    tags: normalizeTags(cloudinary.tags, `${label}.tags`),
    context: normalizeStringRecord(
      cloudinary.context,
      `${label}.context`,
      RESERVED_CONTEXT_KEYS,
    ),
    metadata: normalizeStringRecord(cloudinary.metadata, `${label}.metadata`),
    indexForVisualSearch:
      cloudinary.indexForVisualSearch === undefined
        ? false
        : requiredBoolean(
            cloudinary.indexForVisualSearch,
            `${label}.indexForVisualSearch`,
          ),
  });
}

function normalizeAsset(value, index) {
  const label = `assets[${index}]`;
  const asset = assertPlainObject(value, label);
  assertExactKeys(
    asset,
    new Set([
      "background",
      "cloudinary",
      "content",
      "delivery",
      "id",
      "naming",
      "source",
    ]),
    label,
  );
  return Object.freeze({
    id: slug(asset.id, `${label}.id`, 100),
    source: normalizeSource(asset.source, `${label}.source`),
    naming: normalizeNaming(asset.naming, `${label}.naming`),
    content: normalizeContent(asset.content, `${label}.content`),
    background: normalizeBackground(asset.background, `${label}.background`),
    delivery: normalizeDelivery(asset.delivery, `${label}.delivery`),
    cloudinary: normalizeCloudinary(asset.cloudinary, `${label}.cloudinary`),
  });
}

export function validateWebAssetManifest(value) {
  const manifest = assertPlainObject(value, "manifest");
  assertExactKeys(
    manifest,
    new Set(["assets", "batchId", "contract", "createdAt", "schemaVersion"]),
    "manifest",
  );
  if (manifest.contract !== WEB_ASSET_CONTRACT) {
    fail(
      "WEB_ASSET_MANIFEST_INVALID",
      `manifest.contract must equal ${WEB_ASSET_CONTRACT}.`,
    );
  }
  if (manifest.schemaVersion !== WEB_ASSET_SCHEMA_VERSION) {
    fail(
      "WEB_ASSET_MANIFEST_INVALID",
      `manifest.schemaVersion must equal ${WEB_ASSET_SCHEMA_VERSION}.`,
    );
  }
  if (!Array.isArray(manifest.assets) || manifest.assets.length < 1 || manifest.assets.length > MAX_ASSETS) {
    fail(
      "WEB_ASSET_MANIFEST_INVALID",
      `manifest.assets must contain 1-${MAX_ASSETS} assets.`,
    );
  }
  const assets = manifest.assets.map(normalizeAsset);
  for (const [label, values] of [
    ["asset IDs", assets.map((asset) => asset.id)],
    ["file stems", assets.map((asset) => asset.naming.fileStem)],
    ["Cloudinary public IDs", assets.flatMap((asset) =>
      asset.delivery.publishVariants.map((variant) =>
        variant === "master" ? `${asset.naming.publicId}-master` : asset.naming.publicId,
      ),
    )],
  ]) {
    if (new Set(values).size !== values.length) {
      fail("WEB_ASSET_MANIFEST_INVALID", `manifest contains duplicate ${label}.`);
    }
  }
  return Object.freeze({
    contract: WEB_ASSET_CONTRACT,
    schemaVersion: WEB_ASSET_SCHEMA_VERSION,
    batchId: slug(manifest.batchId, "manifest.batchId", 100),
    createdAt: isoDate(manifest.createdAt, "manifest.createdAt"),
    assets: Object.freeze(assets),
  });
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function toPortableRelative(root, candidate) {
  return path.relative(root, candidate).split(path.sep).join("/");
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

async function canonicalDirectory(candidate, label) {
  let resolved;
  try {
    resolved = await realpath(path.resolve(candidate));
  } catch {
    fail("WEB_ASSET_PATH_INVALID", `${label} does not exist.`);
  }
  const details = await stat(resolved);
  if (!details.isDirectory()) {
    fail("WEB_ASSET_PATH_INVALID", `${label} must be a directory.`);
  }
  return resolved;
}

export function allowedRootsFromEnv(environment = process.env) {
  const configured = environment.EVAVO_WEB_ASSET_ALLOWED_ROOTS;
  if (!configured) {
    fail(
      "WEB_ASSET_ALLOWED_ROOTS_REQUIRED",
      "EVAVO_WEB_ASSET_ALLOWED_ROOTS must list at least one trusted workspace root.",
    );
  }
  const values = configured
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => path.resolve(entry));
  if (!values.length) {
    fail(
      "WEB_ASSET_ALLOWED_ROOTS_REQUIRED",
      "EVAVO_WEB_ASSET_ALLOWED_ROOTS must list at least one trusted workspace root.",
    );
  }
  return Object.freeze([...new Set(values)]);
}

async function resolveWorkspace(workspaceRoot, allowedRoots) {
  const workspace = await canonicalDirectory(workspaceRoot, "workspaceRoot");
  const canonicalAllowed = [];
  for (const root of allowedRoots) canonicalAllowed.push(await canonicalDirectory(root, "allowed root"));
  if (!canonicalAllowed.some((root) => isInside(root, workspace))) {
    fail(
      "WEB_ASSET_PATH_OUTSIDE_ALLOWED_ROOTS",
      "workspaceRoot is outside EVAVO_WEB_ASSET_ALLOWED_ROOTS.",
    );
  }
  return workspace;
}

async function assertNoSymlinkComponents(root, candidate, includeLeaf) {
  const relative = path.relative(root, candidate);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    if (relative === "") return;
    fail("WEB_ASSET_PATH_OUTSIDE_WORKSPACE", "Path escapes workspaceRoot.");
  }
  const parts = relative.split(path.sep);
  const count = includeLeaf ? parts.length : Math.max(0, parts.length - 1);
  let cursor = root;
  for (let index = 0; index < count; index += 1) {
    cursor = path.join(cursor, parts[index]);
    let details;
    try {
      details = await lstat(cursor);
    } catch {
      fail("WEB_ASSET_PATH_INVALID", `Path component does not exist: ${toPortableRelative(root, cursor)}.`);
    }
    if (details.isSymbolicLink()) {
      fail("WEB_ASSET_SYMLINK_FORBIDDEN", `Symbolic links are not accepted: ${toPortableRelative(root, cursor)}.`);
    }
  }
}

async function resolveExistingFile(workspace, relativePath, label) {
  const candidate = path.resolve(workspace, relativePath);
  if (!isInside(workspace, candidate) || candidate === workspace) {
    fail("WEB_ASSET_PATH_OUTSIDE_WORKSPACE", `${label} escapes workspaceRoot.`);
  }
  await assertNoSymlinkComponents(workspace, candidate, true);
  const details = await lstat(candidate);
  if (!details.isFile() || details.isSymbolicLink()) {
    fail("WEB_ASSET_PATH_INVALID", `${label} must be a regular non-symbolic file.`);
  }
  return candidate;
}

async function resolveOutputRoot(workspace, outputRoot) {
  const candidate = path.resolve(workspace, outputRoot);
  if (!isInside(workspace, candidate) || candidate === workspace) {
    fail("WEB_ASSET_OUTPUT_ROOT_INVALID", "outputRoot must be a new child of workspaceRoot.");
  }
  await assertNoSymlinkComponents(workspace, candidate, false);
  try {
    await lstat(candidate);
    fail("WEB_ASSET_OUTPUT_EXISTS", "outputRoot already exists; outputs are create-only.");
  } catch (error) {
    if (error instanceof WebAssetPipelineError) throw error;
    if (error?.code !== "ENOENT") throw error;
  }
  return candidate;
}

async function resolveNewFile(workspace, relativePath, label) {
  const normalized = relativeRasterPath(relativePath, label);
  const candidate = path.resolve(workspace, normalized);
  if (!isInside(workspace, candidate) || candidate === workspace) {
    fail("WEB_ASSET_PATH_OUTSIDE_WORKSPACE", `${label} escapes workspaceRoot.`);
  }
  await assertNoSymlinkComponents(workspace, candidate, false);
  const parent = path.dirname(candidate);
  const parentDetails = await lstat(parent);
  if (!parentDetails.isDirectory() || parentDetails.isSymbolicLink()) {
    fail("WEB_ASSET_PATH_INVALID", `${label} parent must be a regular directory.`);
  }
  try {
    await lstat(candidate);
    fail("WEB_ASSET_OUTPUT_EXISTS", `${label} already exists; staging is create-only.`);
  } catch (error) {
    if (error instanceof WebAssetPipelineError) throw error;
    if (error?.code !== "ENOENT") throw error;
  }
  return Object.freeze({ candidate, normalized });
}

async function readJsonFile(filePath, label) {
  let bytes;
  try {
    bytes = await readFile(filePath);
  } catch {
    fail("WEB_ASSET_FILE_READ_FAILED", `${label} could not be read.`);
  }
  if (bytes.byteLength > 2 * 1024 * 1024) {
    fail("WEB_ASSET_FILE_TOO_LARGE", `${label} exceeds 2 MiB.`);
  }
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("WEB_ASSET_JSON_INVALID", `${label} is not valid JSON.`);
  }
}

async function writeExclusive(filePath, bytes) {
  await writeFile(filePath, bytes, { flag: "wx", mode: 0o600 });
}

async function writeJsonExclusive(filePath, value) {
  await writeExclusive(filePath, canonicalJson(value));
}

async function loadArtStudioProcessors() {
  const optimizerUrl = new URL("../packages/delivery-optimizer/dist/index.js", import.meta.url);
  const mediaUrl = new URL("../packages/media/dist/index.js", import.meta.url);
  try {
    const [optimizer, media] = await Promise.all([import(optimizerUrl.href), import(mediaUrl.href)]);
    if (
      typeof optimizer.optimizeDeliveryImage !== "function" ||
      typeof media.recoverBackgroundAlpha !== "function" ||
      typeof media.suppressChromaSpill !== "function"
    ) {
      fail(
        "WEB_ASSET_PROCESSOR_INVALID",
        "Built Art Studio processors do not expose the required image functions.",
      );
    }
    return Object.freeze({
      optimizeDeliveryImage: optimizer.optimizeDeliveryImage,
      recoverBackgroundAlpha: media.recoverBackgroundAlpha,
      suppressChromaSpill: media.suppressChromaSpill,
    });
  } catch (error) {
    if (error instanceof WebAssetPipelineError) throw error;
    fail(
      "WEB_ASSET_PROCESSOR_NOT_BUILT",
      "Art Studio image processors are not built. Run pnpm run build:domain first.",
    );
  }
}

function mandatoryContext(manifest, asset, variant, prepared) {
  const orientation = prepared.width === prepared.height
    ? "square"
    : prepared.width > prepared.height
      ? "landscape"
      : "portrait";
  return Object.freeze({
    accessibility_alt: asset.content.accessibilityAlt,
    alt: asset.content.alt,
    asset_id: asset.id,
    asset_role: asset.content.assetRole,
    batch_id: manifest.batchId,
    caption: asset.content.caption,
    dimensions: `${prepared.width}x${prepared.height}`,
    orientation,
    project: asset.content.project,
    review_date: asset.content.reviewDate,
    review_status: asset.content.reviewStatus,
    reviewed_by: asset.content.reviewedBy,
    site_area: asset.content.siteArea,
    source_original_name: asset.source.originalName,
    source_sha256: asset.source.sha256,
    source_surface: asset.source.surface,
    status: "production",
    title: asset.content.title,
    usage: asset.content.usage,
    usage_note: asset.content.usageNote,
    variant,
  });
}

function tagsForAsset(asset, variant) {
  const projectTag = asset.content.project
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 100);
  return Object.freeze(
    [...new Set([
      ...MANDATORY_TAGS,
      ...asset.cloudinary.tags,
      asset.id,
      variant,
      ...(projectTag ? [projectTag] : []),
    ])].sort(),
  );
}

function variantPublicId(asset, variant) {
  return variant === "master" ? `${asset.naming.publicId}-master` : asset.naming.publicId;
}

function variantFileName(asset, variant) {
  return variant === "master"
    ? `${asset.naming.fileStem}.master.png`
    : `${asset.naming.fileStem}.web.webp`;
}

function variantMediaType(variant) {
  return variant === "master" ? "image/png" : "image/webp";
}

function codeReference(asset, publicIds) {
  const preferred = publicIds.web ?? publicIds.master;
  return Object.freeze({
    preferredPublicId: preferred,
    publicIds: Object.freeze(publicIds),
    alt: asset.content.alt,
    objectFit: asset.delivery.objectFit,
    dataExample: Object.freeze({
      src: preferred,
      alt: asset.content.alt,
      objectFit: asset.delivery.objectFit,
    }),
    genericReactExample: `<CustomImage src=${JSON.stringify(preferred)} alt=${JSON.stringify(asset.content.alt)} objectFit=${JSON.stringify(asset.delivery.objectFit)} />`,
  });
}

async function verifySource(workspace, asset) {
  const sourcePath = await resolveExistingFile(workspace, asset.source.path, `${asset.id}.source.path`);
  const details = await stat(sourcePath);
  if (details.size !== asset.source.bytes) {
    fail(
      "WEB_ASSET_SOURCE_MISMATCH",
      `${asset.id} source byte count changed: expected ${asset.source.bytes}, found ${details.size}.`,
    );
  }
  const bytes = await readFile(sourcePath);
  const digest = sha256(bytes);
  if (digest !== asset.source.sha256) {
    fail(
      "WEB_ASSET_SOURCE_MISMATCH",
      `${asset.id} source SHA-256 changed: expected ${asset.source.sha256}, found ${digest}.`,
    );
  }
  return Object.freeze({ sourcePath, bytes });
}

function inferredMediaType(relativePath) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  return Object.freeze({
    ".bmp": "image/bmp",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".webp": "image/webp",
  })[extension];
}

function detectedRasterMediaType(bytes) {
  if (
    bytes.byteLength >= 8 &&
    bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return "image/png";
  }
  if (
    bytes.byteLength >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.byteLength >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    bytes.byteLength >= 4 &&
    ((bytes[0] === 0x49 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x2a &&
      bytes[3] === 0x00) ||
      (bytes[0] === 0x4d &&
        bytes[1] === 0x4d &&
        bytes[2] === 0x00 &&
        bytes[3] === 0x2a))
  ) {
    return "image/tiff";
  }
  if (bytes.byteLength >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return "image/bmp";
  }
  return null;
}

export async function stageWebAssetSource({
  sourceRoot,
  sourcePath,
  workspaceRoot,
  destinationPath,
  surface,
  originalName,
  originRef,
  mediaType,
  allowedRoots,
  allowWrites = false,
  confirmLocalWrite = false,
}) {
  if (!allowWrites) {
    fail(
      "WEB_ASSET_WRITES_DISABLED",
      "Staging requires EVAVO_WEB_ASSET_ALLOW_WRITES=true.",
    );
  }
  if (confirmLocalWrite !== true) {
    fail(
      "WEB_ASSET_LOCAL_CONFIRMATION_REQUIRED",
      "Staging requires confirmLocalWrite=true for this exact call.",
    );
  }
  const normalizedSurface = requiredString(surface, "surface", 1, 40);
  if (!SOURCE_SURFACES.has(normalizedSurface)) {
    fail(
      "WEB_ASSET_STAGE_INVALID",
      `surface must be one of ${[...SOURCE_SURFACES].sort().join(", ")}.`,
    );
  }
  const sourceWorkspace = await resolveWorkspace(sourceRoot, allowedRoots);
  const destinationWorkspace = await resolveWorkspace(workspaceRoot, allowedRoots);
  const normalizedSourcePath = relativeRasterPath(sourcePath, "sourcePath");
  const exactSource = await resolveExistingFile(
    sourceWorkspace,
    normalizedSourcePath,
    "sourcePath",
  );
  const sourceDetails = await stat(exactSource);
  if (sourceDetails.size < 1 || sourceDetails.size > MAX_SOURCE_BYTES) {
    fail(
      "WEB_ASSET_SOURCE_SIZE_INVALID",
      `sourcePath must contain 1-${MAX_SOURCE_BYTES} bytes.`,
    );
  }
  const destination = await resolveNewFile(
    destinationWorkspace,
    destinationPath,
    "destinationPath",
  );
  const normalizedOriginalName = requiredString(originalName, "originalName", 1, 255);
  const normalizedOriginRef = optionalString(originRef, "originRef", 512);
  const bytes = await readFile(exactSource);
  const detectedMediaType = detectedRasterMediaType(bytes);
  const destinationMediaType = inferredMediaType(destination.normalized);
  const normalizedMediaType = mediaType === undefined
    ? destinationMediaType
    : requiredString(mediaType, "mediaType", 1, 100).toLowerCase();
  if (
    !detectedMediaType ||
    !destinationMediaType ||
    normalizedMediaType !== detectedMediaType ||
    destinationMediaType !== detectedMediaType
  ) {
    fail(
      "WEB_ASSET_STAGE_MEDIA_MISMATCH",
      "Source bytes, mediaType and destination extension must identify the same supported raster format.",
    );
  }
  const digest = sha256(bytes);
  let created = false;
  try {
    await writeExclusive(destination.candidate, bytes);
    created = true;
    const staged = await readFile(destination.candidate);
    if (staged.byteLength !== bytes.byteLength || sha256(staged) !== digest) {
      fail("WEB_ASSET_STAGE_VERIFY_FAILED", "Staged source did not preserve exact bytes.");
    }
  } catch (error) {
    if (created) await rm(destination.candidate, { force: true });
    throw error;
  }
  return Object.freeze({
    staged: true,
    source: Object.freeze({
      surface: normalizedSurface,
      path: destination.normalized,
      originalName: normalizedOriginalName,
      sha256: digest,
      bytes: bytes.byteLength,
      mediaType: normalizedMediaType,
      ...(normalizedOriginRef === undefined ? {} : { originRef: normalizedOriginRef }),
    }),
    destinationPath: destination.normalized,
    sourceMutated: false,
    sourceBytesReturned: false,
  });
}

async function prepareWorkingMaster(asset, sourceBytes, processors) {
  if (asset.background.mode === "preserve") {
    return Object.freeze({
      bytes: sourceBytes,
      recoveryEvidence: null,
      spillEvidence: null,
    });
  }
  const recovery = await processors.recoverBackgroundAlpha(sourceBytes, {
    ...(asset.background.matteColour === undefined
      ? {}
      : { matteColour: asset.background.matteColour }),
    ...(asset.background.allowCheckerboardRecovery === undefined
      ? {}
      : { allowCheckerboardRecovery: asset.background.allowCheckerboardRecovery }),
    ...(asset.background.allowHighChromaInference === undefined
      ? {}
      : { allowHighChromaInference: asset.background.allowHighChromaInference }),
    maximumInputBytes: MAX_SOURCE_BYTES,
  });
  if (asset.background.suppressChromaSpill !== true) {
    return Object.freeze({
      bytes: recovery.png,
      recoveryEvidence: recovery.evidence,
      spillEvidence: null,
    });
  }
  const inferred = recovery.evidence?.classification?.inferredMatte?.hex;
  const recovered = recovery.evidence?.matte?.hex;
  const matteColour = asset.background.matteColour ?? recovered ?? inferred;
  if (!matteColour) {
    fail(
      "WEB_ASSET_SPILL_MATTE_REQUIRED",
      `${asset.id} requested spill suppression but recovery did not identify a high-chroma matte.`,
    );
  }
  const spill = await processors.suppressChromaSpill(recovery.png, { matteColour });
  return Object.freeze({
    bytes: spill.png,
    recoveryEvidence: recovery.evidence,
    spillEvidence: spill.evidence,
  });
}

export async function validateManifestFile({ workspaceRoot, manifestPath, allowedRoots }) {
  const workspace = await resolveWorkspace(workspaceRoot, allowedRoots);
  const relativeManifest = path.isAbsolute(manifestPath)
    ? toPortableRelative(workspace, path.resolve(manifestPath))
    : manifestPath;
  const exactPath = await resolveExistingFile(workspace, relativeManifest, "manifestPath");
  const manifest = validateWebAssetManifest(await readJsonFile(exactPath, "manifest"));
  return Object.freeze({
    valid: true,
    manifest,
    workspace,
    manifestPath: toPortableRelative(workspace, exactPath),
  });
}

export async function prepareWebAssets({
  workspaceRoot,
  manifestPath,
  outputRoot,
  allowedRoots,
  allowWrites = false,
  processors: suppliedProcessors,
}) {
  if (!allowWrites) {
    fail(
      "WEB_ASSET_WRITES_DISABLED",
      "Preparation requires EVAVO_WEB_ASSET_ALLOW_WRITES=true.",
    );
  }
  const validated = await validateManifestFile({ workspaceRoot, manifestPath, allowedRoots });
  const { manifest, workspace } = validated;
  const exactOutputRoot = await resolveOutputRoot(workspace, outputRoot);
  const processors = suppliedProcessors ?? (await loadArtStudioProcessors());
  let outputCreated = false;
  try {
    await mkdir(exactOutputRoot, { recursive: false, mode: 0o700 });
    outputCreated = true;
    await mkdir(path.join(exactOutputRoot, "assets"), { recursive: false, mode: 0o700 });
    const plannedAssets = [];
    let sourceTotal = 0;
    let preparedTotal = 0;
    for (const asset of manifest.assets) {
      const verified = await verifySource(workspace, asset);
      sourceTotal += verified.bytes.byteLength;
      const working = await prepareWorkingMaster(asset, verified.bytes, processors);
      const [master, web] = await Promise.all([
        processors.optimizeDeliveryImage(working.bytes, {
          profileId: "source-master-lossless",
          background: { mode: "preserve" },
        }),
        processors.optimizeDeliveryImage(working.bytes, {
          profileId: "web-raster-1080p",
          background: { mode: "preserve" },
        }),
      ]);
      const assetDirectory = path.join(exactOutputRoot, "assets", asset.id);
      await mkdir(assetDirectory, { recursive: false, mode: 0o700 });
      const variants = {
        master: {
          variant: "master",
          path: `assets/${asset.id}/${variantFileName(asset, "master")}`,
          fileName: variantFileName(asset, "master"),
          mediaType: variantMediaType("master"),
          format: "png",
          sha256: sha256(master.bytes),
          bytes: master.bytes.byteLength,
          width: master.evidence.prepared.width,
          height: master.evidence.prepared.height,
          hasAlpha: master.evidence.prepared.hasAlpha,
          profileId: "source-master-lossless",
          publicId: variantPublicId(asset, "master"),
        },
        web: {
          variant: "web",
          path: `assets/${asset.id}/${variantFileName(asset, "web")}`,
          fileName: variantFileName(asset, "web"),
          mediaType: variantMediaType("web"),
          format: "webp",
          sha256: sha256(web.bytes),
          bytes: web.bytes.byteLength,
          width: web.evidence.prepared.width,
          height: web.evidence.prepared.height,
          hasAlpha: web.evidence.prepared.hasAlpha,
          profileId: "web-raster-1080p",
          publicId: variantPublicId(asset, "web"),
        },
      };
      preparedTotal += variants.master.bytes + variants.web.bytes;
      await writeExclusive(path.join(exactOutputRoot, variants.master.path), master.bytes);
      await writeExclusive(path.join(exactOutputRoot, variants.web.path), web.bytes);
      const evidencePath = `assets/${asset.id}/${asset.naming.fileStem}.evidence.json`;
      const descriptorPath = `assets/${asset.id}/${asset.naming.fileStem}.cloudinary.json`;
      const evidence = {
        schema: "evavo_web_asset_preparation_evidence_v1",
        assetId: asset.id,
        source: {
          ...asset.source,
          verified: true,
        },
        background: {
          requested: asset.background,
          recovery: working.recoveryEvidence,
          spillSuppression: working.spillEvidence,
        },
        variants: {
          master: master.evidence,
          web: web.evidence,
        },
        guarantees: {
          sourceMutated: false,
          sourceBytesPassedThroughMcp: false,
          svgAccepted: false,
          losslessMasterCreated: true,
          optimizedWebDerivativeCreated: true,
        },
      };
      const publicationDescriptors = Object.fromEntries(
        asset.delivery.publishVariants.map((variant) => {
          const prepared = variants[variant];
          return [
            variant,
            {
              ...prepared,
              assetFolder: asset.naming.assetFolder,
              displayName:
                variant === "master"
                  ? `${asset.naming.displayName} — lossless master`
                  : `${asset.naming.displayName} — web delivery`,
              tags: tagsForAsset(asset, variant),
              context: {
                ...asset.cloudinary.context,
                ...mandatoryContext(manifest, asset, variant, prepared),
              },
              metadata: asset.cloudinary.metadata,
              indexForVisualSearch: asset.cloudinary.indexForVisualSearch,
            },
          ];
        }),
      );
      const descriptor = {
        schema: "evavo_web_asset_cloudinary_descriptor_v1",
        assetId: asset.id,
        variants: publicationDescriptors,
        codeReference: codeReference(
          asset,
          Object.fromEntries(
            Object.entries(publicationDescriptors).map(([variant, entry]) => [variant, entry.publicId]),
          ),
        ),
      };
      await writeJsonExclusive(path.join(exactOutputRoot, evidencePath), evidence);
      await writeJsonExclusive(path.join(exactOutputRoot, descriptorPath), descriptor);
      plannedAssets.push({
        id: asset.id,
        source: asset.source,
        naming: asset.naming,
        content: asset.content,
        delivery: asset.delivery,
        variants,
        publish: publicationDescriptors,
        evidencePath,
        descriptorPath,
        codeReference: descriptor.codeReference,
      });
    }
    const planWithoutHash = {
      schema: WEB_ASSET_PLAN_SCHEMA,
      schemaVersion: WEB_ASSET_SCHEMA_VERSION,
      batchId: manifest.batchId,
      manifestCreatedAt: manifest.createdAt,
      manifestPath: validated.manifestPath,
      outputRoot: toPortableRelative(workspace, exactOutputRoot),
      assets: plannedAssets,
      totals: {
        assets: plannedAssets.length,
        sourceBytes: sourceTotal,
        preparedBytes: preparedTotal,
      },
      guarantees: {
        createOnly: true,
        cloudinaryMutationPerformed: false,
        credentialsEmbedded: false,
        originalsMutated: false,
        publicationRequiresSeparateGate: true,
      },
    };
    const planSha256 = sha256(canonicalJson(planWithoutHash));
    const plan = { ...planWithoutHash, planSha256 };
    const planPath = path.join(exactOutputRoot, "publication-plan.json");
    await writeJsonExclusive(planPath, plan);
    const receiptWithoutHash = {
      schema: "evavo_web_asset_preparation_receipt_v1",
      batchId: manifest.batchId,
      planSha256,
      planPath: toPortableRelative(workspace, planPath),
      outputRoot: toPortableRelative(workspace, exactOutputRoot),
      assets: plannedAssets.map((asset) => ({
        id: asset.id,
        variants: Object.fromEntries(
          Object.entries(asset.variants).map(([variant, entry]) => [
            variant,
            {
              path: entry.path,
              sha256: entry.sha256,
              bytes: entry.bytes,
              width: entry.width,
              height: entry.height,
            },
          ]),
        ),
      })),
      mutation: {
        localFilesCreated: true,
        cloudinaryMutationPerformed: false,
        sourceMutated: false,
      },
    };
    const receipt = {
      ...receiptWithoutHash,
      receiptSha256: sha256(canonicalJson(receiptWithoutHash)),
    };
    await writeJsonExclusive(path.join(exactOutputRoot, "preparation-receipt.json"), receipt);
    return Object.freeze({
      prepared: true,
      batchId: manifest.batchId,
      assets: plannedAssets.length,
      planSha256,
      planPath: toPortableRelative(workspace, planPath),
      outputRoot: toPortableRelative(workspace, exactOutputRoot),
      cloudinaryMutationPerformed: false,
    });
  } catch (error) {
    if (outputCreated) {
      await rm(exactOutputRoot, { recursive: true, force: true });
    }
    throw error;
  }
}

function escapeCloudinaryValue(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("=", "\\=")
    .replaceAll("|", "\\|");
}

export function cloudinaryContextString(record) {
  return Object.entries(record)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${escapeCloudinaryValue(value)}`)
    .join("|");
}

export function cloudinaryMetadataString(record) {
  return Object.entries(record)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) =>
      `${key}=${escapeCloudinaryValue(value).replaceAll('"', '\\"')}`,
    )
    .join("|");
}

export function parseCloudinaryUrl(value) {
  if (typeof value !== "string" || !value) {
    fail("WEB_ASSET_CLOUDINARY_URL_REQUIRED", "CLOUDINARY_URL is required for publication.");
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("WEB_ASSET_CLOUDINARY_URL_INVALID", "CLOUDINARY_URL is invalid.");
  }
  if (
    parsed.protocol !== "cloudinary:" ||
    !parsed.username ||
    !parsed.password ||
    !parsed.hostname ||
    (parsed.pathname !== "" && parsed.pathname !== "/") ||
    parsed.search ||
    parsed.hash
  ) {
    fail(
      "WEB_ASSET_CLOUDINARY_URL_INVALID",
      "CLOUDINARY_URL must use cloudinary://api_key:api_secret@cloud_name with no path, query or fragment.",
    );
  }
  const apiKey = decodeURIComponent(parsed.username);
  const apiSecret = decodeURIComponent(parsed.password);
  const cloudName = parsed.hostname;
  if (!/^[a-zA-Z0-9_-]+$/u.test(cloudName) || !apiKey || !apiSecret) {
    fail("WEB_ASSET_CLOUDINARY_URL_INVALID", "CLOUDINARY_URL contains invalid credentials or cloud name.");
  }
  return Object.freeze({ apiKey, apiSecret, cloudName });
}

function sanitizedProviderMessage(value, credentials) {
  let message = String(value).slice(0, 500);
  const authorization = Buffer.from(
    `${credentials.apiKey}:${credentials.apiSecret}`,
  ).toString("base64");
  for (const secret of [
    credentials.apiSecret,
    credentials.apiKey,
    authorization,
    encodeURIComponent(credentials.apiSecret),
    encodeURIComponent(credentials.apiKey),
  ]) {
    if (secret) message = message.replaceAll(secret, "[redacted]");
  }
  return message;
}

export async function searchCloudinaryAssets({
  cloudinaryUrl,
  expression,
  maxResults = 20,
  nextCursor,
  includeTier2Fields = false,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== "function") {
    fail("WEB_ASSET_FETCH_UNAVAILABLE", "A Fetch API implementation is required.");
  }
  if (
    typeof expression !== "string" ||
    !expression.trim() ||
    expression.length > 500 ||
    /\p{Cc}/u.test(expression)
  ) {
    fail(
      "WEB_ASSET_CLOUDINARY_SEARCH_INVALID",
      "Cloudinary search expression must contain 1-500 characters and no control characters.",
    );
  }
  if (typeof includeTier2Fields !== "boolean") {
    fail(
      "WEB_ASSET_CLOUDINARY_SEARCH_INVALID",
      "Cloudinary search includeTier2Fields must be a boolean.",
    );
  }
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 100) {
    fail(
      "WEB_ASSET_CLOUDINARY_SEARCH_INVALID",
      "Cloudinary search maxResults must be an integer between 1 and 100.",
    );
  }
  if (
    nextCursor !== undefined &&
    (typeof nextCursor !== "string" ||
      !nextCursor ||
      nextCursor.length > 1024 ||
      /\p{Cc}/u.test(nextCursor))
  ) {
    fail(
      "WEB_ASSET_CLOUDINARY_SEARCH_INVALID",
      "Cloudinary search nextCursor is invalid.",
    );
  }
  const credentials = parseCloudinaryUrl(cloudinaryUrl);
  const endpoint = new URL(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(credentials.cloudName)}/resources/search`,
  );
  endpoint.searchParams.set("expression", expression.trim());
  endpoint.searchParams.set("max_results", String(maxResults));
  endpoint.searchParams.set(
    "fields",
    [
      "asset_folder",
      "asset_id",
      "bytes",
      "colors",
      "context",
      "created_at",
      "display_name",
      "filename",
      "format",
      "height",
      "public_id",
      "resource_type",
      "secure_url",
      "status",
      "tags",
      "type",
      "width",
      ...(includeTier2Fields ? ["image_analysis", "metadata"] : []),
    ].join(","),
  );
  if (nextCursor !== undefined) endpoint.searchParams.set("next_cursor", nextCursor);
  const authorization = Buffer.from(
    `${credentials.apiKey}:${credentials.apiSecret}`,
  ).toString("base64");
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${authorization}`,
      },
      redirect: "error",
    });
  } catch {
    fail("WEB_ASSET_CLOUDINARY_REQUEST_FAILED", "Cloudinary search request failed.");
  }
  const responseText = await response.text();
  if (Buffer.byteLength(responseText) > MAX_RESPONSE_BYTES) {
    fail("WEB_ASSET_CLOUDINARY_RESPONSE_TOO_LARGE", "Cloudinary response exceeded 2 MiB.");
  }
  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch {
    fail("WEB_ASSET_CLOUDINARY_RESPONSE_INVALID", "Cloudinary returned a non-JSON response.");
  }
  if (!response.ok) {
    const providerMessage = sanitizedProviderMessage(
      typeof payload?.error?.message === "string"
        ? payload.error.message.slice(0, 500)
        : `HTTP ${response.status}`,
      credentials,
    );
    fail(
      "WEB_ASSET_CLOUDINARY_SEARCH_REJECTED",
      `Cloudinary rejected the asset search: ${providerMessage}.`,
      { status: response.status },
    );
  }
  const resources = Array.isArray(payload.resources) ? payload.resources : [];
  if (resources.length > maxResults) {
    fail(
      "WEB_ASSET_CLOUDINARY_RESPONSE_INVALID",
      "Cloudinary returned more search results than requested.",
    );
  }
  return Object.freeze({
    cloudName: credentials.cloudName,
    expression: expression.trim(),
    maxResults,
    includeTier2Fields,
    totalCount: Number.isSafeInteger(payload.total_count) ? payload.total_count : null,
    nextCursor:
      typeof payload.next_cursor === "string" ? payload.next_cursor : null,
    assets: Object.freeze(
      resources.map((asset) =>
        Object.freeze({
          assetId: asset.asset_id,
          publicId: asset.public_id,
          assetFolder: asset.asset_folder,
          displayName: asset.display_name,
          filename: asset.filename,
          format: asset.format,
          resourceType: asset.resource_type,
          deliveryType: asset.type,
          bytes: asset.bytes,
          width: asset.width,
          height: asset.height,
          createdAt: asset.created_at,
          secureUrl: asset.secure_url,
          status: asset.status,
          tags: Array.isArray(asset.tags) ? asset.tags : [],
          context: asset.context ?? {},
          metadata: asset.metadata ?? {},
          imageAnalysis: asset.image_analysis ?? null,
          colors: Array.isArray(asset.colors) ? asset.colors : [],
        }),
      ),
    ),
    readOnly: true,
    credentialsReturned: false,
  });
}

function appendBoolean(form, name, value) {
  form.append(name, value ? "true" : "false");
}

export async function uploadCloudinaryAsset({
  credentials,
  descriptor,
  bytes,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== "function") {
    fail("WEB_ASSET_FETCH_UNAVAILABLE", "A Fetch API implementation is required.");
  }
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: descriptor.mediaType }), descriptor.fileName);
  form.append("public_id", descriptor.publicId);
  form.append("asset_folder", descriptor.assetFolder);
  form.append("display_name", descriptor.displayName);
  form.append("filename_override", descriptor.fileName);
  appendBoolean(form, "unique_filename", false);
  appendBoolean(form, "use_filename", false);
  appendBoolean(form, "overwrite", false);
  appendBoolean(form, "backup", true);
  appendBoolean(form, "use_asset_folder_as_public_id_prefix", false);
  if (descriptor.indexForVisualSearch === true) {
    appendBoolean(form, "visual_search", true);
  }
  appendBoolean(form, "phash", true);
  appendBoolean(form, "colors", true);
  appendBoolean(form, "quality_analysis", true);
  appendBoolean(form, "accessibility_analysis", true);
  form.append("tags", descriptor.tags.join(","));
  form.append("context", cloudinaryContextString(descriptor.context));
  if (Object.keys(descriptor.metadata).length) {
    form.append("metadata", cloudinaryMetadataString(descriptor.metadata));
  }
  const authorization = Buffer.from(`${credentials.apiKey}:${credentials.apiSecret}`).toString("base64");
  let response;
  try {
    response = await fetchImpl(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(credentials.cloudName)}/image/upload`,
      {
        method: "POST",
        headers: { Authorization: `Basic ${authorization}` },
        body: form,
        redirect: "error",
      },
    );
  } catch {
    fail("WEB_ASSET_CLOUDINARY_REQUEST_FAILED", "Cloudinary upload request failed.");
  }
  const responseText = await response.text();
  if (Buffer.byteLength(responseText) > MAX_RESPONSE_BYTES) {
    fail("WEB_ASSET_CLOUDINARY_RESPONSE_TOO_LARGE", "Cloudinary response exceeded 2 MiB.");
  }
  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch {
    fail("WEB_ASSET_CLOUDINARY_RESPONSE_INVALID", "Cloudinary returned a non-JSON response.");
  }
  if (!response.ok) {
    const providerMessage = sanitizedProviderMessage(
      typeof payload?.error?.message === "string"
        ? payload.error.message.slice(0, 500)
        : `HTTP ${response.status}`,
      credentials,
    );
    fail(
      "WEB_ASSET_CLOUDINARY_UPLOAD_REJECTED",
      `Cloudinary rejected ${descriptor.publicId}: ${providerMessage}.`,
      { status: response.status, publicId: descriptor.publicId },
    );
  }
  if (payload.existing === true) {
    fail(
      "WEB_ASSET_CLOUDINARY_ASSET_EXISTS",
      `Cloudinary public ID ${descriptor.publicId} already exists; create-only publication stopped.`,
    );
  }
  const expectedFormat = descriptor.format;
  if (
    payload.public_id !== descriptor.publicId ||
    payload.bytes !== bytes.byteLength ||
    payload.width !== descriptor.width ||
    payload.height !== descriptor.height ||
    payload.format !== expectedFormat
  ) {
    fail(
      "WEB_ASSET_CLOUDINARY_RESPONSE_MISMATCH",
      `Cloudinary response did not match the exact prepared asset ${descriptor.publicId}.`,
      {
        expected: {
          publicId: descriptor.publicId,
          bytes: bytes.byteLength,
          width: descriptor.width,
          height: descriptor.height,
          format: expectedFormat,
        },
        received: {
          publicId: payload.public_id,
          bytes: payload.bytes,
          width: payload.width,
          height: payload.height,
          format: payload.format,
        },
      },
    );
  }
  return Object.freeze({
    assetId: payload.asset_id,
    publicId: payload.public_id,
    version: payload.version,
    versionId: payload.version_id,
    format: payload.format,
    resourceType: payload.resource_type,
    bytes: payload.bytes,
    width: payload.width,
    height: payload.height,
    secureUrl: payload.secure_url,
    createdAt: payload.created_at,
    etag: payload.etag,
    tags: Array.isArray(payload.tags) ? payload.tags : descriptor.tags,
    context: payload.context ?? descriptor.context,
    metadata: payload.metadata ?? descriptor.metadata,
    originalFilename: payload.original_filename,
    existing: false,
  });
}

function planWithoutHash(plan) {
  const { planSha256: _ignored, ...rest } = plan;
  return rest;
}

async function writePublicationReceipt(outputDirectory, receipt) {
  const fileName = receipt.status === "published"
    ? "publication-receipt.json"
    : "publication-receipt.partial.json";
  const target = path.join(outputDirectory, fileName);
  await writeJsonExclusive(target, receipt);
  return target;
}

function sanitizedError(error) {
  return Object.freeze({
    code: error instanceof WebAssetPipelineError ? error.code : "WEB_ASSET_PUBLICATION_FAILED",
    message: error instanceof Error ? error.message.slice(0, 1000) : "Publication failed.",
  });
}

export async function publishWebAssets({
  workspaceRoot,
  planPath,
  allowedRoots,
  allowWrites = false,
  allowCloudinaryWrites = false,
  confirmCloudinaryWrite = false,
  cloudinaryUrl,
  fetchImpl = globalThis.fetch,
}) {
  if (!allowWrites) {
    fail("WEB_ASSET_WRITES_DISABLED", "Publication requires EVAVO_WEB_ASSET_ALLOW_WRITES=true.");
  }
  if (!allowCloudinaryWrites) {
    fail(
      "WEB_ASSET_CLOUDINARY_WRITES_DISABLED",
      "Publication requires EVAVO_WEB_ASSET_ALLOW_CLOUDINARY_WRITES=true.",
    );
  }
  if (confirmCloudinaryWrite !== true) {
    fail(
      "WEB_ASSET_CLOUDINARY_CONFIRMATION_REQUIRED",
      "Publication requires confirmCloudinaryWrite=true for this exact call.",
    );
  }
  const workspace = await resolveWorkspace(workspaceRoot, allowedRoots);
  const relativePlan = path.isAbsolute(planPath)
    ? toPortableRelative(workspace, path.resolve(planPath))
    : planPath;
  const exactPlanPath = await resolveExistingFile(workspace, relativePlan, "planPath");
  const plan = assertPlainObject(await readJsonFile(exactPlanPath, "publication plan"), "plan");
  if (plan.schema !== WEB_ASSET_PLAN_SCHEMA || plan.schemaVersion !== WEB_ASSET_SCHEMA_VERSION) {
    fail("WEB_ASSET_PLAN_INVALID", "Publication plan schema is unsupported.");
  }
  const expectedPlanSha = sha256(canonicalJson(planWithoutHash(plan)));
  if (plan.planSha256 !== expectedPlanSha) {
    fail("WEB_ASSET_PLAN_HASH_MISMATCH", "Publication plan self-hash does not match its content.");
  }
  const outputDirectory = path.dirname(exactPlanPath);
  if (toPortableRelative(workspace, outputDirectory) !== plan.outputRoot) {
    fail("WEB_ASSET_PLAN_INVALID", "Publication plan outputRoot does not match its location.");
  }
  for (const receiptName of ["publication-receipt.json", "publication-receipt.partial.json"]) {
    try {
      await lstat(path.join(outputDirectory, receiptName));
      fail(
        "WEB_ASSET_PUBLICATION_ALREADY_ATTEMPTED",
        "A publication receipt already exists; automatic replay is forbidden.",
      );
    } catch (error) {
      if (error instanceof WebAssetPipelineError) throw error;
      if (error?.code !== "ENOENT") throw error;
    }
  }
  if (!Array.isArray(plan.assets) || !plan.assets.length) {
    fail("WEB_ASSET_PLAN_INVALID", "Publication plan contains no assets.");
  }
  const uploadQueue = [];
  for (const asset of plan.assets) {
    if (asset.content?.reviewStatus !== "approved") {
      fail(
        "WEB_ASSET_REVIEW_REQUIRED",
        `${asset.id} is not approved; update the manifest and prepare a new exact plan after visual review.`,
      );
    }
    for (const variant of asset.delivery.publishVariants) {
      const descriptor = asset.publish[variant];
      const relativeAssetPath = descriptor.path;
      const exactAssetPath = await resolveExistingFile(
        outputDirectory,
        relativeAssetPath,
        `${asset.id}.${variant}.path`,
      );
      const details = await stat(exactAssetPath);
      if (details.size !== descriptor.bytes) {
        fail(
          "WEB_ASSET_PREPARED_FILE_MISMATCH",
          `${asset.id}.${variant} byte count changed after preparation.`,
        );
      }
      const bytes = await readFile(exactAssetPath);
      if (sha256(bytes) !== descriptor.sha256) {
        fail(
          "WEB_ASSET_PREPARED_FILE_MISMATCH",
          `${asset.id}.${variant} SHA-256 changed after preparation.`,
        );
      }
      uploadQueue.push({ asset, variant, descriptor, bytes });
    }
  }
  const credentials = parseCloudinaryUrl(cloudinaryUrl);
  const publications = [];
  try {
    for (const item of uploadQueue) {
      const provider = await uploadCloudinaryAsset({
        credentials,
        descriptor: item.descriptor,
        bytes: item.bytes,
        fetchImpl,
      });
      publications.push({
        assetId: item.asset.id,
        variant: item.variant,
        preparedSha256: item.descriptor.sha256,
        preparedBytes: item.descriptor.bytes,
        publicId: item.descriptor.publicId,
        provider,
        codeReference: item.asset.codeReference,
      });
    }
  } catch (error) {
    if (publications.length) {
      const partialWithoutHash = {
        schema: WEB_ASSET_RECEIPT_SCHEMA,
        schemaVersion: WEB_ASSET_SCHEMA_VERSION,
        status: "partial-failure",
        batchId: plan.batchId,
        planSha256: plan.planSha256,
        cloudName: credentials.cloudName,
        publications,
        error: sanitizedError(error),
        mutation: {
          cloudinaryAssetsCreated: publications.length,
          automaticRollbackAttempted: false,
          manualReconciliationRequired: true,
        },
      };
      const partial = {
        ...partialWithoutHash,
        receiptSha256: sha256(canonicalJson(partialWithoutHash)),
      };
      const receiptPath = await writePublicationReceipt(outputDirectory, partial);
      fail(
        "WEB_ASSET_CLOUDINARY_PARTIAL_FAILURE",
        `Cloudinary publication stopped after ${publications.length} upload(s); reconcile the partial receipt before retrying.`,
        { receiptPath: toPortableRelative(workspace, receiptPath), cause: sanitizedError(error) },
      );
    }
    throw error;
  }
  const receiptWithoutHash = {
    schema: WEB_ASSET_RECEIPT_SCHEMA,
    schemaVersion: WEB_ASSET_SCHEMA_VERSION,
    status: "published",
    batchId: plan.batchId,
    planSha256: plan.planSha256,
    cloudName: credentials.cloudName,
    publications,
    mutation: {
      cloudinaryAssetsCreated: publications.length,
      automaticRollbackAttempted: false,
      sourceMutated: false,
    },
  };
  const receipt = {
    ...receiptWithoutHash,
    receiptSha256: sha256(canonicalJson(receiptWithoutHash)),
  };
  const receiptPath = await writePublicationReceipt(outputDirectory, receipt);
  return Object.freeze({
    published: true,
    batchId: plan.batchId,
    planSha256: plan.planSha256,
    receiptSha256: receipt.receiptSha256,
    receiptPath: toPortableRelative(workspace, receiptPath),
    cloudName: credentials.cloudName,
    uploads: publications.length,
    assets: publications.map((entry) => ({
      assetId: entry.assetId,
      variant: entry.variant,
      publicId: entry.publicId,
      secureUrl: entry.provider.secureUrl,
      codeReference: entry.codeReference,
    })),
    credentialsReturned: false,
  });
}

export function pipelineCapabilities() {
  return Object.freeze({
    contract: WEB_ASSET_CONTRACT,
    schemaVersion: WEB_ASSET_SCHEMA_VERSION,
    intakeSurfaces: Object.freeze([...SOURCE_SURFACES].sort()),
    sourceFormats: Object.freeze([...SOURCE_EXTENSIONS].sort()),
    sourceFormatsRejected: Object.freeze([".svg"]),
    preparedVariants: Object.freeze([
      { id: "master", format: "png", profileId: "source-master-lossless" },
      { id: "web", format: "webp", profileId: "web-raster-1080p" },
    ]),
    backgroundModes: Object.freeze(["preserve", "recover-alpha"]),
    sourceBytesFlowThroughMcp: false,
    credentialsAcceptedInToolArguments: false,
    credentialsReturned: false,
    originalsMutable: false,
    svgAccepted: false,
    staging: Object.freeze({
      createOnly: true,
      exactByteCopy: true,
      sourceAndDestinationMustBeAllowed: true,
      returnsManifestSourceBlock: true,
      sourceBytesReturned: false,
    }),
    publication: Object.freeze({
      provider: "cloudinary",
      createOnly: true,
      overwritesAllowed: false,
      requiresPreparedPlanHash: true,
      requiresWorkspaceWriteGate: true,
      requiresCloudinaryWriteGate: true,
      requiresPerCallConfirmation: true,
      credentialEnvironment: "CLOUDINARY_URL",
    }),
    inventorySearch: Object.freeze({
      provider: "cloudinary",
      readOnly: true,
      maximumResultsPerCall: 100,
      returnsContext: true,
      returnsMetadata: true,
      tier2FieldsOptIn: true,
      returnsCredentials: false,
    }),
  });
}

function parseArguments(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (!name?.startsWith("--") || value === undefined) {
      fail("WEB_ASSET_CLI_ARGUMENT_INVALID", "CLI arguments must use exact --name value pairs.");
    }
    const key = name.slice(2);
    if (Object.hasOwn(result, key)) {
      fail("WEB_ASSET_CLI_ARGUMENT_INVALID", `Duplicate CLI argument --${key}.`);
    }
    result[key] = value;
  }
  return result;
}

function environmentBoolean(name) {
  return process.env[name] === "true";
}

async function runCli() {
  const command = process.argv[2];
  if (command === "capabilities") {
    console.log(canonicalJson(pipelineCapabilities()).trimEnd());
    return;
  }
  const args = parseArguments(process.argv.slice(3));
  if (command === "search") {
    const maxResults = args["max-results"] === undefined
      ? 20
      : /^[1-9]\d*$/u.test(args["max-results"])
        ? Number.parseInt(args["max-results"], 10)
        : Number.NaN;
    const result = await searchCloudinaryAssets({
      cloudinaryUrl: process.env.CLOUDINARY_URL,
      expression: args.expression,
      maxResults,
      includeTier2Fields: args["include-tier2-fields"] === "true",
      ...(args["next-cursor"] === undefined
        ? {}
        : { nextCursor: args["next-cursor"] }),
    });
    console.log(canonicalJson(result).trimEnd());
    return;
  }
  const allowedRoots = allowedRootsFromEnv();
  if (command === "stage") {
    const result = await stageWebAssetSource({
      sourceRoot: args["source-root"],
      sourcePath: args["source-path"],
      workspaceRoot: args["workspace-root"],
      destinationPath: args["destination-path"],
      surface: args.surface,
      originalName: args["original-name"],
      ...(args["origin-ref"] === undefined ? {} : { originRef: args["origin-ref"] }),
      ...(args["media-type"] === undefined ? {} : { mediaType: args["media-type"] }),
      allowedRoots,
      allowWrites: environmentBoolean("EVAVO_WEB_ASSET_ALLOW_WRITES"),
      confirmLocalWrite: args["confirm-local-write"] === "true",
    });
    console.log(canonicalJson(result).trimEnd());
    return;
  }
  if (command === "validate") {
    const result = await validateManifestFile({
      workspaceRoot: args["workspace-root"],
      manifestPath: args.manifest,
      allowedRoots,
    });
    console.log(
      canonicalJson({
        valid: true,
        batchId: result.manifest.batchId,
        assets: result.manifest.assets.length,
        manifestPath: result.manifestPath,
      }).trimEnd(),
    );
    return;
  }
  if (command === "prepare") {
    const result = await prepareWebAssets({
      workspaceRoot: args["workspace-root"],
      manifestPath: args.manifest,
      outputRoot: args["output-root"],
      allowedRoots,
      allowWrites: environmentBoolean("EVAVO_WEB_ASSET_ALLOW_WRITES"),
    });
    console.log(canonicalJson(result).trimEnd());
    return;
  }
  if (command === "publish") {
    const result = await publishWebAssets({
      workspaceRoot: args["workspace-root"],
      planPath: args.plan,
      allowedRoots,
      allowWrites: environmentBoolean("EVAVO_WEB_ASSET_ALLOW_WRITES"),
      allowCloudinaryWrites: environmentBoolean(
        "EVAVO_WEB_ASSET_ALLOW_CLOUDINARY_WRITES",
      ),
      confirmCloudinaryWrite: args["confirm-cloudinary-write"] === "true",
      cloudinaryUrl: process.env.CLOUDINARY_URL,
    });
    console.log(canonicalJson(result).trimEnd());
    return;
  }
  fail(
    "WEB_ASSET_CLI_COMMAND_INVALID",
    "Command must be capabilities, search, stage, validate, prepare or publish.",
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  runCli().catch((error) => {
    const payload = sanitizedError(error);
    process.stderr.write(`${JSON.stringify(payload)}\n`);
    process.exitCode = 1;
  });
}
