import { createHash } from "node:crypto";

const CLOUDINARY_HOST = "res.cloudinary.com";
const CLOUDINARY_CLOUD = "dntogqtey";
const MAX_REMOTE_TARGET_BYTES = 80 * 1024 * 1024;
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

function normalizeCloudinaryUrl(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("currentTargetRecheckUrl is required for Cloudinary publication targets.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hostname !== CLOUDINARY_HOST) throw new Error("Cloudinary current-target recheck URL must use the governed res.cloudinary.com HTTPS origin without credentials.");
  const decodedPath = decodeURIComponent(url.pathname);
  const prefix = `/${CLOUDINARY_CLOUD}/image/upload/`;
  if (!decodedPath.startsWith(prefix)) throw new Error(`Cloudinary current-target recheck URL must use the governed ${CLOUDINARY_CLOUD} image cloud.`);
  url.hash = "";
  return Object.freeze({ url, decodedPath, prefix });
}

function assertCloudinaryTargetIdentifier(decodedPath, targetIdentifier) {
  if (typeof targetIdentifier !== "string" || !targetIdentifier.trim()) throw new Error("Cloudinary publication targetIdentifier is required.");
  const identifier = targetIdentifier.replace(/^\/+|\/+$/gu, "");
  const marker = `/${identifier}`;
  const index = decodedPath.lastIndexOf(marker);
  if (index < 0) throw new Error("Cloudinary current-target recheck URL does not address the planned stable public ID.");
  const suffix = decodedPath.slice(index + marker.length);
  if (suffix && !/^\.[A-Za-z0-9]+$/u.test(suffix)) throw new Error("Cloudinary current-target recheck URL public-ID boundary is ambiguous or does not match the planned stable ID.");
}

async function fetchCloudinaryTarget(urlValue, targetIdentifier) {
  const normalized = normalizeCloudinaryUrl(urlValue);
  assertCloudinaryTargetIdentifier(normalized.decodedPath, targetIdentifier);
  const response = await fetch(normalized.url, {
    method: "GET",
    redirect: "follow",
    cache: "no-store",
    headers: { "cache-control": "no-cache", pragma: "no-cache", accept: "image/*,*/*;q=0.1" },
  });
  if (!response.ok) throw new Error(`Cloudinary current-target recheck failed with HTTP ${response.status}.`);
  const final = normalizeCloudinaryUrl(response.url || normalized.url.href);
  assertCloudinaryTargetIdentifier(final.decodedPath, targetIdentifier);
  const contentType = String(response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.startsWith("image/")) throw new Error("Cloudinary current-target recheck returned non-image content.");
  const advertisedLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(advertisedLength) && advertisedLength > MAX_REMOTE_TARGET_BYTES) throw new Error("Cloudinary current target exceeds the governed recheck byte limit.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_REMOTE_TARGET_BYTES) throw new Error("Cloudinary current-target bytes are empty or exceed the governed recheck byte limit.");
  return Object.freeze({
    mode: "live-remote-cloudinary",
    url: normalized.url.href,
    finalUrl: final.url.href,
    bytes,
    sha256: sha256(bytes),
    byteLength: bytes.length,
    contentType,
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
  });
}

async function recheckPublicationTarget({ targetKind, targetIdentifier, currentTargetRecheckPath, currentTargetRecheckUrl, readLocal }) {
  if (targetKind === "cloudinary-stable-id-replacement") {
    if (currentTargetRecheckPath !== undefined && currentTargetRecheckPath !== null && String(currentTargetRecheckPath).trim()) throw new Error("Cloudinary publication authorization must use currentTargetRecheckUrl, not a caller-supplied local recheck file.");
    return fetchCloudinaryTarget(currentTargetRecheckUrl, targetIdentifier);
  }
  if (targetKind === "website-header-source-update") {
    if (currentTargetRecheckUrl !== undefined && currentTargetRecheckUrl !== null && String(currentTargetRecheckUrl).trim()) throw new Error("Website source publication authorization must use currentTargetRecheckPath, not a remote URL.");
    if (typeof readLocal !== "function") throw new Error("Local current-target reader is required for website source publication targets.");
    const local = await readLocal(currentTargetRecheckPath);
    return Object.freeze({ mode: "governed-local-website-source", ...local });
  }
  throw new Error(`Unsupported publication target kind ${JSON.stringify(targetKind)}.`);
}

function assertRecheckMatchesSnapshot(recheck, snapshot, stageLabel) {
  if (!recheck || recheck.sha256 !== snapshot?.sha256 || recheck.byteLength !== snapshot?.byteLength) {
    throw new Error(`Current target changed after transaction planning; ${stageLabel} is stale and must not proceed.`);
  }
}

export {
  CLOUDINARY_CLOUD,
  CLOUDINARY_HOST,
  MAX_REMOTE_TARGET_BYTES,
  assertRecheckMatchesSnapshot,
  fetchCloudinaryTarget,
  normalizeCloudinaryUrl,
  recheckPublicationTarget,
};
