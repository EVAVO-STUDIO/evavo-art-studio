import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HMF_FRAME_BODY_DETERMINISTIC_QA_PLAN_SCHEMA = "evavo.heavy-metal-fighting-frame-body-deterministic-qa-plan.v1";
export const HMF_FRAME_BODY_DETERMINISTIC_QA_REPORT_SCHEMA = "evavo.heavy-metal-fighting-frame-body-deterministic-qa-report.v1";
export const HMF_FRAME_BODY_DETERMINISTIC_QA_RESULT_SCHEMA = "evavo.heavy-metal-fighting-frame-body-deterministic-qa-result.v1";
export const HMF_FRAME_BODY_DETERMINISTIC_QA_PROTOCOL_VERSION = "2026-08-13.1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const POLICY_PATH = path.join(ROOT, "config", "heavy-metal-fighting", "frame-body-deterministic-qa-policy.v1.json");
const SHA256 = /^[0-9a-f]{64}$/u;
const AIRBORNE_BANKS = new Set(["jump-rise", "jump-apex", "jump-fall", "air-hit", "jumping-light", "jumping-heavy"]);
const GROUNDED_PHASES = new Set(["hold", "loop", "locomotion", "guard", "entrance", "system", "result"]);
const QA_ACTOR = Object.freeze({ actorClass: "system", actorId: "hmf-frame-body-deterministic-qa" });

function fail(message) {
  throw new Error(`HEAVY_METAL_FIGHTING_FRAME_BODY_DETERMINISTIC_QA_INVALID: ${message}`);
}
function assert(condition, message) {
  if (!condition) fail(message);
}
function freeze(value) {
  if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) return value;
  if (Array.isArray(value)) value.forEach(freeze);
  else if (value && typeof value === "object") Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
  }
  return value;
}
function canonical(value) {
  return `${JSON.stringify(sorted(value), null, 2)}\n`;
}
function hashBytes(value) {
  return createHash("sha256").update(value).digest("hex");
}
function hashValue(value) {
  return hashBytes(Buffer.from(typeof value === "string" ? value : canonical(value), "utf8"));
}
function canonicalTimestamp(value, label) {
  assert(typeof value === "string" && value.trim() === value, `${label} must be a canonical UTC timestamp.`);
  const milliseconds = Date.parse(value);
  assert(Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value, `${label} must be a canonical UTC timestamp.`);
  return value;
}
function selfHashed(value, field, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  assert(SHA256.test(String(value[field] ?? "")), `${label}.${field} must be a SHA-256.`);
  const body = { ...value };
  delete body[field];
  assert(value[field] === hashValue(body), `${label}.${field} does not match canonical content.`);
  return value;
}
function safeRelativePath(value, label) {
  assert(typeof value === "string" && value.trim() === value && value.length > 0, `${label} must be a non-empty relative path.`);
  assert(!value.includes("\\") && !path.posix.isAbsolute(value), `${label} must be a POSIX relative path.`);
  const segments = value.split("/");
  assert(segments.every((segment) => segment && segment !== "." && segment !== ".."), `${label} contains an unsafe segment.`);
  return value;
}
function pathWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
function sidecarPath(candidatePath, suffix) {
  assert(candidatePath.endsWith(".png"), "candidate path must end in .png.");
  return `${candidatePath.slice(0, -4)}${suffix}`;
}
function reviewReportPath(order, attempt) {
  const base = safeRelativePath(order.executionPaths.reviewEvidencePath, "work-order review evidence path");
  assert(base.endsWith(".json"), "work-order review evidence path must end in .json.");
  return `${base.slice(0, -5)}-attempt-${String(attempt).padStart(2, "0")}-deterministic-qa.json`;
}
async function readStableJson(filePath, label) {
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
function integer(value, label, minimum = 0) {
  assert(Number.isInteger(value) && value >= minimum, `${label} must be an integer >= ${minimum}.`);
  return value;
}
function number(value, label, minimum = 0, maximum = Number.POSITIVE_INFINITY) {
  assert(Number.isFinite(value) && value >= minimum && value <= maximum, `${label} must be a finite number from ${minimum} through ${maximum}.`);
  return value;
}
function exactStringArray(values, label) {
  assert(Array.isArray(values) && values.every((value) => typeof value === "string" && value.trim() === value && value.length > 0), `${label} must be an array of non-empty strings.`);
  assert(new Set(values).size === values.length, `${label} contains duplicates.`);
  return freeze([...values]);
}
function validatePolicy(raw) {
  assert(raw?.schema === "evavo.heavy-metal-fighting-frame-body-deterministic-qa-policy.v1", "deterministic QA policy schema drifted.");
  assert(raw.protocolVersion === HMF_FRAME_BODY_DETERMINISTIC_QA_PROTOCOL_VERSION, "deterministic QA policy protocol drifted.");
  assert(raw.projectId === "heavy-metal-fighting" && raw.assetKind === "frame-body-cel", "deterministic QA policy identity drifted.");
  const candidate = raw.candidate ?? {};
  integer(candidate.maximumBytes, "candidate.maximumBytes", 1);
  integer(candidate.width, "candidate.width", 1);
  integer(candidate.height, "candidate.height", 1);
  integer(candidate.bitDepth, "candidate.bitDepth", 1);
  integer(candidate.colorType, "candidate.colorType");
  integer(candidate.compression, "candidate.compression");
  integer(candidate.filter, "candidate.filter");
  integer(candidate.interlace, "candidate.interlace");
  const alpha = raw.alpha ?? {};
  assert(alpha.binaryOnly === true && alpha.transparentRgbMustBeZero === true && alpha.transparentCornersRequired === true, "deterministic QA alpha policy must remain strict and transparent.");
  integer(alpha.minimumOpaquePixels, "alpha.minimumOpaquePixels", 1);
  number(alpha.maximumCoverageRatio, "alpha.maximumCoverageRatio", 0.01, 0.99);
  const geometry = raw.geometry ?? {};
  integer(geometry.pivot?.x, "geometry.pivot.x");
  integer(geometry.pivot?.y, "geometry.pivot.y");
  integer(geometry.groundLineY, "geometry.groundLineY");
  integer(geometry.minimumTopMargin, "geometry.minimumTopMargin");
  integer(geometry.minimumLeftMargin, "geometry.minimumLeftMargin");
  integer(geometry.minimumRightMargin, "geometry.minimumRightMargin");
  integer(geometry.maximumPivotGap, "geometry.maximumPivotGap");
  integer(geometry.groundedBottomTolerance, "geometry.groundedBottomTolerance");
  const cluster = raw.cluster ?? {};
  number(cluster.minimumLargestComponentRatio, "cluster.minimumLargestComponentRatio", 0, 1);
  integer(cluster.tinyComponentMaximumPixels, "cluster.tinyComponentMaximumPixels", 1);
  integer(cluster.maximumTinyComponents, "cluster.maximumTinyComponents");
  integer(raw.palette?.maximumOpaqueRgbColors, "palette.maximumOpaqueRgbColors", 1);
  assert(raw.duplicateScope?.sameBatch === true && raw.duplicateScope?.crossBatchComparisonsOptional === true, "deterministic QA duplicate scope drifted.");
  exactStringArray(raw.automatedFailureCodes, "automatedFailureCodes");
  exactStringArray(raw.deferredFailureCodes, "deferredFailureCodes");
  assert(raw.authority?.providerExecution === false && raw.authority?.providerRetry === false, "deterministic QA policy gained provider authority.");
  assert(raw.authority?.creativeReview === false && raw.authority?.candidateApproval === false && raw.authority?.candidatePromotion === false, "deterministic QA policy gained review or promotion authority.");
  assert(raw.authority?.targetRepositoryMutation === false && raw.authority?.gitMutation === false && raw.authority?.publication === false, "deterministic QA policy gained repository or publication authority.");
  assert(raw.authority?.namedHumanRepairAuthorizationRequired === true, "deterministic QA failures must require named-human repair authorization.");
  const body = structuredClone(raw);
  return freeze({ ...body, policySha256: hashValue(body) });
}
async function loadPolicy() {
  return validatePolicy(await readStableJson(POLICY_PATH, "HMF Frame body deterministic QA policy"));
}
async function workspaceRoot(value) {
  const resolved = path.resolve(String(value ?? ""));
  assert(resolved && resolved !== path.parse(resolved).root, "workspaceRoot must identify a specific persistent Artist Workspace.");
  const info = await lstat(resolved).catch(() => null);
  assert(info?.isDirectory() && !info.isSymbolicLink(), "workspaceRoot must be an existing non-symlink directory.");
  return realpath(resolved);
}
async function safeWorkspacePath(root, relative, label, { optional = false, file = true } = {}) {
  const safe = safeRelativePath(relative, label);
  let current = root;
  const segments = safe.split("/");
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    const info = await lstat(current).catch(() => null);
    if (!info) {
      if (optional) return null;
      fail(`${label} does not exist: ${safe}.`);
    }
    assert(!info.isSymbolicLink(), `${label} contains a symlinked component: ${safe}.`);
    if (index < segments.length - 1) assert(info.isDirectory(), `${label} parent component is not a directory: ${safe}.`);
    else if (file) assert(info.isFile(), `${label} must be a regular file: ${safe}.`);
    else assert(info.isDirectory(), `${label} must be a directory: ${safe}.`);
  }
  const resolved = await realpath(current);
  assert(pathWithin(root, resolved), `${label} escaped the persistent workspace: ${safe}.`);
  return resolved;
}
async function stableWorkspaceFile(root, relative, label, maximumBytes) {
  const absolute = await safeWorkspacePath(root, relative, label);
  const before = await lstat(absolute);
  assert(before.size >= 1 && before.size <= maximumBytes, `${label} exceeds its byte limit.`);
  const bytes = await readFile(absolute);
  const after = await lstat(absolute);
  assert(before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs, `${label} changed while it was being read.`);
  return freeze({ path: absolute, bytes, size: bytes.length, sha256: hashBytes(bytes) });
}
async function stableWorkspaceJson(root, relative, label, maximumBytes = 4 * 1024 * 1024) {
  const file = await stableWorkspaceFile(root, relative, label, maximumBytes);
  try {
    return freeze({ ...file, value: JSON.parse(file.bytes.toString("utf8")) });
  } catch (error) {
    fail(`${label} is invalid UTF-8 JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export {
  AIRBORNE_BANKS,
  GROUNDED_PHASES,
  QA_ACTOR,
  SHA256,
  assert,
  canonical,
  canonicalTimestamp,
  fail,
  freeze,
  hashBytes,
  hashValue,
  loadPolicy,
  pathWithin,
  reviewReportPath,
  safeRelativePath,
  safeWorkspacePath,
  selfHashed,
  sidecarPath,
  stableWorkspaceFile,
  stableWorkspaceJson,
  workspaceRoot,
};
