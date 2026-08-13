import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HMF_FRAME_BODY_SELECTION_DECISION_SCHEMA = "evavo.heavy-metal-fighting-frame-body-selection-decision.v1";
export const HMF_FRAME_BODY_SELECTION_RESULT_SCHEMA = "evavo.heavy-metal-fighting-frame-body-selection-result.v1";
export const HMF_FRAME_BODY_SELECTION_POLICY_SCHEMA = "evavo.heavy-metal-fighting-frame-body-selection-decision-policy.v1";
export const HMF_FRAME_BODY_SELECTION_PROTOCOL_VERSION = "2026-08-13.1";
export const HMF_FRAME_BODY_CREATIVE_REVIEW_DECISION_SCHEMA = "evavo.heavy-metal-fighting-frame-body-creative-review-decision.v1";
export const HMF_FRAME_BODY_CREATIVE_REVIEW_PACKET_SCHEMA = "evavo.heavy-metal-fighting-frame-body-creative-review-packet.v1";
export const HMF_FRAME_BODY_CREATIVE_REVIEW_SELECTION_TEMPLATE_SCHEMA = "evavo.heavy-metal-fighting-frame-body-selection-decision-template.v1";
export const HMF_FRAME_BODY_CREATIVE_REVIEW_PROTOCOL_VERSION = "2026-08-13.1";
export const SHA256 = /^[0-9a-f]{64}$/u;

export const FORBIDDEN_SELECTION_AUTHORITY_KEYS = Object.freeze([
  "providerExecution",
  "providerRetry",
  "candidateMutation",
  "automaticSelection",
  "automaticRepairAuthorization",
  "mastering",
  "candidatePromotion",
  "targetRepositoryMutation",
  "gitMutation",
  "deployment",
  "publication",
]);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const POLICY_PATH = path.join(ROOT, "config", "heavy-metal-fighting", "frame-body-selection-decision-policy.v1.json");

export function fail(message) {
  throw new Error(`HEAVY_METAL_FIGHTING_FRAME_BODY_SELECTION_INVALID: ${message}`);
}
export function assert(condition, message) {
  if (!condition) fail(message);
}
export function freeze(value) {
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
export function canonical(value) {
  return `${JSON.stringify(sorted(value), null, 2)}\n`;
}
export function hashBytes(value) {
  return createHash("sha256").update(value).digest("hex");
}
export function hashValue(value) {
  return hashBytes(Buffer.from(typeof value === "string" ? value : canonical(value), "utf8"));
}
export function canonicalTimestamp(value, label) {
  assert(typeof value === "string" && value.trim() === value, `${label} must be a canonical UTC timestamp.`);
  const milliseconds = Date.parse(value);
  assert(Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value, `${label} must be a canonical UTC timestamp.`);
  return value;
}
export function boundedString(value, label, minimum, maximum) {
  assert(typeof value === "string" && value.trim() === value, `${label} must be a trimmed string.`);
  assert(value.length >= minimum && value.length <= maximum, `${label} must contain ${minimum}-${maximum} characters.`);
  return value;
}
export function safeActorId(value, label = "actorId") {
  const actorId = boundedString(value, label, 2, 160);
  assert(/^[A-Za-z0-9](?:[A-Za-z0-9._:@-]{0,158}[A-Za-z0-9])?$/u.test(actorId), `${label} must use a stable identifier containing only letters, numbers, dot, underscore, colon, at-sign or hyphen.`);
  return actorId;
}
export function assertForbiddenAuthorityFalse(authority, label, keys = FORBIDDEN_SELECTION_AUTHORITY_KEYS) {
  assert(authority && typeof authority === "object" && !Array.isArray(authority), `${label} authority must be an object.`);
  for (const key of keys) assert(authority[key] === false, `${label} gained forbidden authority: ${key}.`);
  return authority;
}
export function selfHashed(value, field, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  assert(SHA256.test(String(value[field] ?? "")), `${label}.${field} must be a SHA-256.`);
  const body = { ...value };
  delete body[field];
  assert(value[field] === hashValue(body), `${label}.${field} does not match canonical content.`);
  return value;
}
export function safeRelativePath(value, label) {
  assert(typeof value === "string" && value.trim() === value && value.length > 0, `${label} must be a non-empty relative path.`);
  assert(!value.includes("\\") && !path.posix.isAbsolute(value), `${label} must be a POSIX relative path.`);
  const segments = value.split("/");
  assert(segments.every((segment) => segment && segment !== "." && segment !== ".."), `${label} contains an unsafe segment.`);
  return value;
}
export function pathWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
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
function validatePolicy(raw) {
  assert(raw?.schema === HMF_FRAME_BODY_SELECTION_POLICY_SCHEMA, "selection policy schema drifted.");
  assert(raw.protocolVersion === HMF_FRAME_BODY_SELECTION_PROTOCOL_VERSION, "selection policy protocol drifted.");
  assert(raw.projectId === "heavy-metal-fighting" && raw.assetKind === "frame-body-cel", "selection policy identity drifted.");
  const rules = raw.decisionRules ?? {};
  assert(rules.receiptState === "selected-or-repair-requested", "selection receipt state drifted.");
  assert(Array.isArray(rules.allowedOutcomes) && rules.allowedOutcomes.join("|") === "selected|repair-requested", "selection outcomes must remain selected and repair-requested.");
  assert(rules.outcomeMustMatchCreativeRecommendation === true, "selection must remain bound to the completed creative recommendation.");
  assert(rules.selectedRequiresZeroFailureCodes === true && rules.repairRequiresAtLeastOneFailureCode === true, "selection failure-code rules drifted.");
  assert(rules.selectedNextAction === "master-selected-candidate" && rules.repairRequestedNextAction === "authorize-bounded-repair", "selection next actions drifted.");
  assert(rules.namedHumanDecisionRequired === true, "selection must require a named human decision.");
  assert(Number.isInteger(rules.minimumRationaleCharacters) && rules.minimumRationaleCharacters >= 1, "minimumRationaleCharacters must be positive.");
  assert(Number.isInteger(rules.maximumRationaleCharacters) && rules.maximumRationaleCharacters >= rules.minimumRationaleCharacters, "maximumRationaleCharacters is invalid.");
  const authority = raw.authority ?? {};
  assert(authority.namedHumanDecisionRequired === true, "selection policy must require a named human decision.");
  assertForbiddenAuthorityFalse(authority, "selection policy");
  const body = structuredClone(raw);
  return freeze({ ...body, policySha256: hashValue(body) });
}
export async function loadPolicy() {
  return validatePolicy(await readStableJson(POLICY_PATH, "HMF Frame body selection policy"));
}
export async function workspaceRoot(value) {
  const resolved = path.resolve(String(value ?? ""));
  assert(resolved && resolved !== path.parse(resolved).root, "workspaceRoot must identify a specific persistent Artist Workspace.");
  const info = await lstat(resolved).catch(() => null);
  assert(info?.isDirectory() && !info.isSymbolicLink(), "workspaceRoot must be an existing non-symlink directory.");
  return realpath(resolved);
}
export async function safeWorkspacePath(root, relative, label, { optional = false, file = true } = {}) {
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
export async function stableWorkspaceFile(root, relative, label, maximumBytes = 16 * 1024 * 1024) {
  const absolute = await safeWorkspacePath(root, relative, label);
  const before = await lstat(absolute);
  assert(before.size >= 1 && before.size <= maximumBytes, `${label} exceeds its byte limit.`);
  const bytes = await readFile(absolute);
  const after = await lstat(absolute);
  assert(before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs, `${label} changed while it was being read.`);
  return freeze({ path: absolute, bytes, size: bytes.length, sha256: hashBytes(bytes) });
}
export async function stableWorkspaceJson(root, relative, label, maximumBytes = 8 * 1024 * 1024) {
  const file = await stableWorkspaceFile(root, relative, label, maximumBytes);
  try {
    return freeze({ ...file, value: JSON.parse(file.bytes.toString("utf8")) });
  } catch (error) {
    fail(`${label} is invalid UTF-8 JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}
export function selectionDecisionPath(order, attempt) {
  const base = safeRelativePath(order.executionPaths.reviewEvidencePath, "work-order review evidence path");
  assert(base.endsWith(".json"), "work-order review evidence path must end in .json.");
  return `${base.slice(0, -5)}-attempt-${String(attempt).padStart(2, "0")}-selection-decision.json`;
}
