import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";

export const HMF_FRAME_BODY_MASTER_APPROVAL_DECISION_SCHEMA =
  "evavo.heavy-metal-fighting-frame-body-master-approval-decision.v1";
export const HMF_FRAME_BODY_MASTER_APPROVAL_RESULT_SCHEMA =
  "evavo.heavy-metal-fighting-frame-body-master-approval-result.v1";
export const HMF_FRAME_BODY_MASTER_APPROVAL_POLICY_SCHEMA =
  "evavo.heavy-metal-fighting-frame-body-master-approval-policy.v1";
export const HMF_FRAME_BODY_MASTER_APPROVAL_PROTOCOL_VERSION =
  "2026-08-14.1";
export const SHA256 = /^[0-9a-f]{64}$/u;

export const FORBIDDEN_MASTER_APPROVAL_AUTHORITY_KEYS = Object.freeze([
  "providerExecution",
  "providerRetry",
  "candidateMutation",
  "imageTransformation",
  "automaticSelection",
  "automaticApproval",
  "automaticDeliveryReadiness",
  "candidatePromotion",
  "gameRepositoryPromotion",
  "targetRepositoryMutation",
  "finalAtlasCompilation",
  "gitMutation",
  "deployment",
  "publication",
]);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const POLICY_PATH = path.join(
  ROOT,
  "config",
  "heavy-metal-fighting",
  "frame-body-master-approval-policy.v1.json",
);

export function fail(message) {
  throw new Error(`HEAVY_METAL_FIGHTING_FRAME_BODY_MASTER_APPROVAL_INVALID: ${message}`);
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
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, sorted(value[key])]),
    );
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
  return hashBytes(
    Buffer.from(typeof value === "string" ? value : canonical(value), "utf8"),
  );
}

export function decodeUtf8Strict(bytes, label) {
  assert(
    Buffer.isBuffer(bytes) || ArrayBuffer.isView(bytes),
    `${label} must be supplied as bytes.`,
  );
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (error) {
    fail(
      `${label} is not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  assert(!text.startsWith("\uFEFF"), `${label} may not contain a UTF-8 BOM.`);
  return text;
}

export function selfHashed(value, field, label) {
  assert(
    value && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object.`,
  );
  assert(SHA256.test(String(value[field] ?? "")), `${label}.${field} must be a SHA-256.`);
  const body = { ...value };
  delete body[field];
  assert(
    value[field] === hashValue(body),
    `${label}.${field} does not match canonical content.`,
  );
  return value;
}

export function boundedString(value, label, minimum, maximum) {
  assert(
    typeof value === "string" && value.trim() === value,
    `${label} must be a trimmed string.`,
  );
  assert(
    value.length >= minimum && value.length <= maximum,
    `${label} must contain ${minimum}-${maximum} characters.`,
  );
  return value;
}

export function safeActorId(value, label = "actorId") {
  const actorId = boundedString(value, label, 2, 160);
  assert(
    /^[A-Za-z0-9](?:[A-Za-z0-9._:@-]{0,158}[A-Za-z0-9])?$/u.test(actorId),
    `${label} must use a stable identifier containing only letters, numbers, dot, underscore, colon, at-sign or hyphen.`,
  );
  return actorId;
}

export function canonicalTimestamp(value, label) {
  assert(
    typeof value === "string" && value.trim() === value,
    `${label} must be a canonical UTC timestamp.`,
  );
  const milliseconds = Date.parse(value);
  assert(
    Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value,
    `${label} must be a canonical UTC timestamp.`,
  );
  return value;
}

export function assertForbiddenAuthorityFalse(
  authority,
  label,
  keys = FORBIDDEN_MASTER_APPROVAL_AUTHORITY_KEYS,
) {
  assert(
    authority && typeof authority === "object" && !Array.isArray(authority),
    `${label} authority must be an object.`,
  );
  for (const key of keys) {
    assert(authority[key] === false, `${label} gained forbidden authority: ${key}.`);
  }
  return authority;
}

export function safeRelativePath(value, label) {
  assert(
    typeof value === "string" && value.trim() === value && value.length > 0,
    `${label} must be a non-empty relative path.`,
  );
  assert(
    !value.includes("\\") && !path.posix.isAbsolute(value),
    `${label} must be a POSIX relative path.`,
  );
  const segments = value.split("/");
  assert(
    segments.every((segment) => segment && segment !== "." && segment !== ".."),
    `${label} contains an unsafe segment.`,
  );
  return value;
}

export function pathWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === ""
    || (
      relative !== ".."
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative)
    );
}

async function readStableJson(filePath, label) {
  const before = await lstat(filePath);
  assert(
    before.isFile() && !before.isSymbolicLink() && before.nlink === 1,
    `${label} must be a one-link regular non-symlink file.`,
  );
  const bytes = await readFile(filePath);
  const after = await lstat(filePath);
  assert(
    before.dev === after.dev
      && before.ino === after.ino
      && before.nlink === after.nlink
      && before.size === after.size
      && before.mtimeMs === after.mtimeMs,
    `${label} changed while it was being read.`,
  );
  try {
    return JSON.parse(decodeUtf8Strict(bytes, label));
  } catch (error) {
    if (
      error instanceof Error
      && error.message.startsWith("HEAVY_METAL_FIGHTING_FRAME_BODY_MASTER_APPROVAL_INVALID:")
    ) {
      throw error;
    }
    fail(
      `${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function validatePolicy(raw) {
  assert(
    raw?.schema === HMF_FRAME_BODY_MASTER_APPROVAL_POLICY_SCHEMA,
    "master approval policy schema drifted.",
  );
  assert(
    raw.protocolVersion === HMF_FRAME_BODY_MASTER_APPROVAL_PROTOCOL_VERSION,
    "master approval policy protocol drifted.",
  );
  assert(
    raw.projectId === "heavy-metal-fighting" && raw.assetKind === "frame-body-cel",
    "master approval policy identity drifted.",
  );
  const rules = raw.approvalRules ?? {};
  assert(
    rules.predecessorState === "mastered"
      && rules.receiptState === "named-human-approved"
      && rules.requiredDecision === "approved",
    "master approval lifecycle states drifted.",
  );
  assert(rules.requiredActorClass === "human", "master approval must use a human actor.");
  assert(
    rules.masterPathMustMatchWorkOrder === true
      && rules.masterBytesMustMatchMasteringRecord === true
      && rules.candidateSha256MustRemainStable === true,
    "master approval exact-master rules drifted.",
  );
  assert(
    rules.masteringRecordRequired === true
      && rules.masteredReceiptRequired === true
      && rules.explicitApprovalAttestationsRequired === true,
    "master approval evidence requirements drifted.",
  );
  assert(
    Number.isInteger(rules.maximumMasterBytes)
      && rules.maximumMasterBytes >= 1
      && rules.maximumMasterBytes <= 64 * 1024 * 1024,
    "master approval maximumMasterBytes is invalid.",
  );
  assert(
    Number.isInteger(rules.minimumRationaleCharacters)
      && Number.isInteger(rules.maximumRationaleCharacters)
      && rules.minimumRationaleCharacters >= 1
      && rules.maximumRationaleCharacters >= rules.minimumRationaleCharacters,
    "master approval rationale bounds are invalid.",
  );
  assert(
    rules.nextLegalAction === "compile-delivery-readiness",
    "master approval next legal action drifted.",
  );
  const authority = raw.authority ?? {};
  assert(
    authority.masterRead === true
      && authority.masteringRecordRead === true
      && authority.namedHumanDecisionRequired === true
      && authority.approvalDecisionPersistence === true
      && authority.receiptPersistence === true,
    "master approval policy lost its bounded approval authority.",
  );
  assertForbiddenAuthorityFalse(authority, "master approval policy");
  const body = structuredClone(raw);
  return freeze({ ...body, policySha256: hashValue(body) });
}

export async function loadApprovalPolicy() {
  return validatePolicy(
    await readStableJson(POLICY_PATH, "HMF Frame body master approval policy"),
  );
}

export async function workspaceRoot(value) {
  const resolved = path.resolve(String(value ?? ""));
  assert(
    resolved && resolved !== path.parse(resolved).root,
    "workspaceRoot must identify a specific persistent Artist Workspace.",
  );
  const info = await lstat(resolved).catch(() => null);
  assert(
    info?.isDirectory() && !info.isSymbolicLink(),
    "workspaceRoot must be an existing non-symlink directory.",
  );
  return realpath(resolved);
}

export async function safeWorkspacePath(
  root,
  relative,
  label,
  { optional = false, file = true } = {},
) {
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
    if (index < segments.length - 1) {
      assert(info.isDirectory(), `${label} parent component is not a directory: ${safe}.`);
    } else if (file) {
      assert(
        info.isFile() && info.nlink === 1,
        `${label} must be a one-link regular file: ${safe}.`,
      );
    } else {
      assert(info.isDirectory(), `${label} must be a directory: ${safe}.`);
    }
  }
  const resolved = await realpath(current);
  assert(pathWithin(root, resolved), `${label} escaped the persistent workspace: ${safe}.`);
  return resolved;
}

export async function stableWorkspaceFile(
  root,
  relative,
  label,
  maximumBytes = 16 * 1024 * 1024,
) {
  const absolute = await safeWorkspacePath(root, relative, label);
  const before = await lstat(absolute);
  assert(before.size >= 1 && before.size <= maximumBytes, `${label} exceeds its byte limit.`);
  const bytes = await readFile(absolute);
  const after = await lstat(absolute);
  assert(
    before.dev === after.dev
      && before.ino === after.ino
      && before.nlink === after.nlink
      && before.size === after.size
      && before.mtimeMs === after.mtimeMs,
    `${label} changed while it was being read.`,
  );
  return freeze({ path: absolute, bytes, size: bytes.length, sha256: hashBytes(bytes) });
}

export async function stableWorkspaceJson(
  root,
  relative,
  label,
  maximumBytes = 8 * 1024 * 1024,
) {
  const file = await stableWorkspaceFile(root, relative, label, maximumBytes);
  try {
    return freeze({ ...file, value: JSON.parse(decodeUtf8Strict(file.bytes, label)) });
  } catch (error) {
    if (
      error instanceof Error
      && error.message.startsWith("HEAVY_METAL_FIGHTING_FRAME_BODY_MASTER_APPROVAL_INVALID:")
    ) {
      throw error;
    }
    fail(
      `${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function approvalDecisionPath(order, attempt) {
  const base = safeRelativePath(
    order.executionPaths.reviewEvidencePath,
    "work-order review evidence path",
  );
  assert(base.endsWith(".json"), "work-order review evidence path must end in .json.");
  return `${base.slice(0, -5)}-attempt-${String(attempt).padStart(2, "0")}-master-approval-decision.json`;
}
