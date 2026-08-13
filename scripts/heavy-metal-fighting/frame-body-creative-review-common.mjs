import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HMF_FRAME_BODY_CREATIVE_REVIEW_PACKET_SCHEMA = "evavo.heavy-metal-fighting-frame-body-creative-review-packet.v1";
export const HMF_FRAME_BODY_CREATIVE_REVIEW_DECISION_SCHEMA = "evavo.heavy-metal-fighting-frame-body-creative-review-decision.v1";
export const HMF_FRAME_BODY_CREATIVE_REVIEW_RESULT_SCHEMA = "evavo.heavy-metal-fighting-frame-body-creative-review-result.v1";
export const HMF_FRAME_BODY_CREATIVE_REVIEW_SELECTION_TEMPLATE_SCHEMA = "evavo.heavy-metal-fighting-frame-body-selection-decision-template.v1";
export const HMF_FRAME_BODY_CREATIVE_REVIEW_PROTOCOL_VERSION = "2026-08-13.1";
export const HMF_FRAME_BODY_DETERMINISTIC_QA_REPORT_SCHEMA = "evavo.heavy-metal-fighting-frame-body-deterministic-qa-report.v1";
export const HMF_FRAME_BODY_DETERMINISTIC_QA_PROTOCOL_VERSION = "2026-08-13.1";
export const HMF_CANDIDATE_ADMISSION_RECORD_SCHEMA = "evavo.heavy-metal-fighting-candidate-admission-record.v1";
export const HMF_CANDIDATE_ADMISSION_PROTOCOL_VERSION = "2026-08-13.1";
export const SHA256 = /^[0-9a-f]{64}$/u;

export const FORBIDDEN_CREATIVE_REVIEW_AUTHORITY_KEYS = Object.freeze([
  "providerExecution",
  "providerRetry",
  "candidateMutation",
  "automaticCreativeApproval",
  "selection",
  "repairAuthorization",
  "candidatePromotion",
  "targetRepositoryMutation",
  "gitMutation",
  "deployment",
  "publication",
]);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const POLICY_PATH = path.join(ROOT, "config", "heavy-metal-fighting", "frame-body-creative-review-policy.v1.json");

export function fail(message) {
  throw new Error(`HEAVY_METAL_FIGHTING_FRAME_BODY_CREATIVE_REVIEW_INVALID: ${message}`);
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
export function assertForbiddenAuthorityFalse(authority, label, keys = FORBIDDEN_CREATIVE_REVIEW_AUTHORITY_KEYS) {
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
export function exactStringArray(values, label) {
  assert(Array.isArray(values), `${label} must be an array.`);
  assert(values.every((value) => typeof value === "string" && value.trim() === value && value.length > 0), `${label} must contain non-empty trimmed strings.`);
  assert(new Set(values).size === values.length, `${label} contains duplicates.`);
  return freeze([...values]);
}
export function sameStringSet(actual, expected, label) {
  assert(Array.isArray(actual), `${label} must be an array.`);
  const normalized = exactStringArray(actual, label);
  assert(normalized.length === expected.length, `${label} must contain exactly ${expected.length} entries.`);
  assert([...normalized].sort().join("|") === [...expected].sort().join("|"), `${label} differs from the governed set.`);
  return freeze([...expected]);
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
  assert(raw?.schema === "evavo.heavy-metal-fighting-frame-body-creative-review-policy.v1", "creative review policy schema drifted.");
  assert(raw.protocolVersion === HMF_FRAME_BODY_CREATIVE_REVIEW_PROTOCOL_VERSION, "creative review policy protocol drifted.");
  assert(raw.projectId === "heavy-metal-fighting" && raw.assetKind === "frame-body-cel", "creative review policy identity drifted.");
  assert(Array.isArray(raw.reviewModes) && raw.reviewModes.length >= 5, "creative review policy requires at least five review modes.");
  const modeIds = raw.reviewModes.map((mode, index) => {
    assert(mode && typeof mode === "object" && !Array.isArray(mode), `reviewModes[${index}] must be an object.`);
    const id = boundedString(mode.id, `reviewModes[${index}].id`, 3, 80);
    assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id), `reviewModes[${index}].id must be lowercase kebab-case.`);
    boundedString(mode.label, `reviewModes[${index}].label`, 3, 120);
    boundedString(mode.purpose, `reviewModes[${index}].purpose`, 10, 400);
    return id;
  });
  assert(new Set(modeIds).size === modeIds.length, "creative review mode ids must be unique.");
  assert(Array.isArray(raw.criteria) && raw.criteria.length >= 6, "creative review policy requires at least six criteria.");
  const criterionIds = raw.criteria.map((criterion, index) => {
    assert(criterion && typeof criterion === "object" && !Array.isArray(criterion), `criteria[${index}] must be an object.`);
    const id = boundedString(criterion.id, `criteria[${index}].id`, 3, 100);
    assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id), `criteria[${index}].id must be lowercase kebab-case.`);
    boundedString(criterion.label, `criteria[${index}].label`, 3, 160);
    boundedString(criterion.instruction, `criteria[${index}].instruction`, 20, 800);
    const failureCodes = exactStringArray(criterion.failureCodes, `criteria[${index}].failureCodes`);
    assert(failureCodes.length >= 1, `criteria[${index}] requires at least one failure code.`);
    return id;
  });
  assert(new Set(criterionIds).size === criterionIds.length, "creative review criterion ids must be unique.");
  const rules = raw.decisionRules ?? {};
  assert(rules.reviewCompletionReceiptState === "creative-review-passed", "creative review completion state drifted.");
  assert(Array.isArray(rules.criterionStatuses) && rules.criterionStatuses.join("|") === "pass|fail", "creative review criterion statuses must remain pass and fail.");
  assert(rules.allCriteriaRequired === true && rules.allReviewModesRequired === true, "creative review must remain complete and fail closed.");
  assert(rules.namedHumanReviewerRequired === true && rules.selectionRemainsSeparate === true, "creative review must require a named human and preserve the selection boundary.");
  assert(rules.recommendedOutcomeWhenAllPass === "selected" && rules.recommendedOutcomeWhenAnyFail === "repair-requested", "creative review recommendations drifted.");
  assert(Number.isInteger(rules.minimumObservationCharacters) && rules.minimumObservationCharacters >= 1, "minimumObservationCharacters must be positive.");
  assert(Number.isInteger(rules.maximumObservationCharacters) && rules.maximumObservationCharacters >= rules.minimumObservationCharacters, "maximumObservationCharacters is invalid.");
  assert(Number.isInteger(rules.maximumSummaryCharacters) && rules.maximumSummaryCharacters >= 100, "maximumSummaryCharacters is invalid.");
  const authority = raw.authority ?? {};
  assert(authority.namedHumanReviewerRequired === true, "creative review policy must require a named human reviewer.");
  assertForbiddenAuthorityFalse(authority, "creative review policy");
  const body = structuredClone(raw);
  return freeze({ ...body, policySha256: hashValue(body) });
}
export async function loadPolicy() {
  return validatePolicy(await readStableJson(POLICY_PATH, "HMF Frame body creative review policy"));
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
export function creativeReviewPath(order, attempt) {
  const base = safeRelativePath(order.executionPaths.reviewEvidencePath, "work-order review evidence path");
  assert(base.endsWith(".json"), "work-order review evidence path must end in .json.");
  return `${base.slice(0, -5)}-attempt-${String(attempt).padStart(2, "0")}-creative-review.json`;
}
