import path from "node:path";

import {
  HASH64,
  HEAD40,
  arrayValue,
  booleanValue,
  hashObject,
  integer,
  objectValue,
  posixRelative,
  stable,
  text,
  verifyFalseAuthority,
  verifySelfHash,
} from "./common.mjs";

export const REQUEST_SCHEMA = "evavo.game-asset-delivery-request.v2";
export const BUNDLE_SCHEMA = "evavo.game-asset-delivery-bundle.v2";
export const APPROVAL_SCHEMA = "evavo.game-asset-delivery-approval.v1";
export const CAMPAIGN_SCHEMA = "evavo.game-art-campaign-plan.v1";
export const STYLE_SCHEMA = "evavo.approved-style-reference-profile.v2";

export const AUTHORITY_KEYS = Object.freeze([
  "automaticApproval",
  "candidatePromotion",
  "gameRepositoryMutation",
  "gitCommit",
  "gitPush",
  "providerExecution",
  "publication",
  "sourceDeletion",
  "storageWrite",
  "forcePush",
]);

export const FALSE_AUTHORITY = Object.freeze(Object.fromEntries(AUTHORITY_KEYS.map((key) => [key, false])));

const ALLOWED_KINDS = new Set([
  "sprite",
  "animation-frame",
  "sprite-sheet",
  "atlas",
  "pixel-font-atlas",
  "pixel-font-descriptor",
  "godot-resource",
  "metadata",
  "editable-source",
  "shader",
  "audio",
]);
const ALLOWED_EXTENSIONS = new Set([
  ".png",
  ".webp",
  ".svg",
  ".fnt",
  ".tres",
  ".res",
  ".tscn",
  ".json",
  ".aseprite",
  ".psd",
  ".kra",
  ".gdshader",
  ".shader",
  ".wav",
  ".ogg",
]);
const DENIED_TARGET_PARTS = [".git", ".github", ".env", "node_modules", "credentials", "secrets"];
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;

function verifyHashOnly(value, key) {
  const stored = text(value[key], key, { pattern: HASH64, maximum: 64 });
  const unsigned = { ...value };
  delete unsigned[key];
  if (hashObject(unsigned) !== stored) throw new Error(`${key} does not match canonical content.`);
  return stored;
}

function normalizeAuthority(value) {
  verifyFalseAuthority(value, AUTHORITY_KEYS, "request.authority");
  return { ...FALSE_AUTHORITY };
}

function normalizeSequence(value, label) {
  if (value === undefined || value === null) return null;
  const input = objectValue(value, label);
  const loop = text(input.loop, `${label}.loop`, { maximum: 32 });
  if (!new Set(["none", "linear", "ping-pong", "hold"]).has(loop)) {
    throw new Error(`${label}.loop is unsupported.`);
  }
  return Object.freeze({
    clipId: text(input.clipId, `${label}.clipId`, { pattern: SAFE_ID, maximum: 160 }),
    frameIndex: integer(input.frameIndex, `${label}.frameIndex`, 0, 4095),
    frameCount: integer(input.frameCount, `${label}.frameCount`, 1, 4096),
    fps: integer(input.fps, `${label}.fps`, 1, 120),
    loop,
  });
}

function normalizeExpected(value, label) {
  const input = objectValue(value, label);
  const result = {
    sha256: text(input.sha256, `${label}.sha256`, { pattern: HASH64, maximum: 64 }),
    bytes: integer(input.bytes, `${label}.bytes`, 1, 2 * 1024 * 1024 * 1024),
  };
  if (input.width !== undefined) result.width = integer(input.width, `${label}.width`, 1, 16384);
  if (input.height !== undefined) result.height = integer(input.height, `${label}.height`, 1, 16384);
  if (input.hasAlpha !== undefined) result.hasAlpha = booleanValue(input.hasAlpha, `${label}.hasAlpha`);
  return Object.freeze(result);
}

export function normalizeItem(value, index) {
  const label = `request.items[${index}]`;
  const input = objectValue(value, label);
  const kind = text(input.kind, `${label}.kind`, { maximum: 64 });
  if (!ALLOWED_KINDS.has(kind)) throw new Error(`${label}.kind is unsupported.`);
  const installationMode = input.installationMode ?? "replace-or-create";
  if (!new Set(["create-only", "replace-exact", "replace-or-create"]).has(installationMode)) {
    throw new Error(`${label}.installationMode is unsupported.`);
  }
  const expectedTargetSha256 = input.expectedTargetSha256 === null || input.expectedTargetSha256 === undefined
    ? null
    : text(input.expectedTargetSha256, `${label}.expectedTargetSha256`, { pattern: HASH64, maximum: 64 });
  if (installationMode === "replace-exact" && !expectedTargetSha256) {
    throw new Error(`${label}.replace-exact requires expectedTargetSha256.`);
  }
  return Object.freeze({
    assetId: text(input.assetId, `${label}.assetId`, { pattern: SAFE_ID, maximum: 160 }),
    kind,
    role: text(input.role, `${label}.role`, { pattern: SAFE_ID, maximum: 160 }),
    sourcePath: path.resolve(text(input.sourcePath, `${label}.sourcePath`, { maximum: 8192 })),
    targetPath: posixRelative(input.targetPath, `${label}.targetPath`, {
      allowedExtensions: ALLOWED_EXTENSIONS,
      deniedParts: DENIED_TARGET_PARTS,
    }),
    mediaType: text(input.mediaType, `${label}.mediaType`, { maximum: 256 }),
    installationMode,
    expectedTargetSha256,
    expected: normalizeExpected(input.expected, `${label}.expected`),
    sequence: normalizeSequence(input.sequence, `${label}.sequence`),
    tags: Object.freeze(
      [...new Set(arrayValue(input.tags ?? [], `${label}.tags`, { maximum: 64 }).map((tag, tagIndex) =>
        text(tag, `${label}.tags[${tagIndex}]`, { maximum: 128 })))]
        .sort((left, right) => left.localeCompare(right)),
    ),
  });
}

export function prepareDeliveryRequest(input) {
  const value = objectValue(input, "request");
  if (value.schema !== REQUEST_SCHEMA) throw new Error(`request.schema must be ${REQUEST_SCHEMA}.`);
  const allowedSourceRoots = arrayValue(value.allowedSourceRoots, "request.allowedSourceRoots", { minimum: 1, maximum: 64 })
    .map((entry, index) => path.resolve(text(entry, `request.allowedSourceRoots[${index}]`, { maximum: 8192 })));
  const items = arrayValue(value.items, "request.items", { minimum: 1, maximum: 10000 }).map(normalizeItem);
  const assetIds = items.map((item) => item.assetId);
  const targets = items.map((item) => item.targetPath.toLowerCase());
  if (new Set(assetIds).size !== assetIds.length) throw new Error("request.items contains duplicate assetId values.");
  if (new Set(targets).size !== targets.length) throw new Error("request.items contains duplicate target paths.");
  const requiredRoles = [...new Set(arrayValue(value.requiredRoles, "request.requiredRoles", { minimum: 1, maximum: 256 })
    .map((role, index) => text(role, `request.requiredRoles[${index}]`, { pattern: SAFE_ID, maximum: 160 })))]
    .sort((left, right) => left.localeCompare(right));
  const observedRoles = new Set(items.map((item) => item.role));
  for (const role of requiredRoles) if (!observedRoles.has(role)) throw new Error(`Required role ${role} has no delivery item.`);
  const prepared = {
    schema: REQUEST_SCHEMA,
    projectId: text(value.projectId, "request.projectId", { pattern: SAFE_ID, maximum: 160 }),
    gameRepository: text(value.gameRepository, "request.gameRepository", {
      pattern: /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u,
      maximum: 256,
    }),
    gameHead: text(value.gameHead, "request.gameHead", { pattern: HEAD40, maximum: 40 }),
    campaignPlanPath: path.resolve(text(value.campaignPlanPath, "request.campaignPlanPath", { maximum: 8192 })),
    styleProfilePath: path.resolve(text(value.styleProfilePath, "request.styleProfilePath", { maximum: 8192 })),
    approvalPath:
      value.approvalPath === null || value.approvalPath === undefined
        ? null
        : path.resolve(text(value.approvalPath, "request.approvalPath", { maximum: 8192 })),
    allowedSourceRoots: Object.freeze([...new Set(allowedSourceRoots)].sort((left, right) => left.localeCompare(right))),
    requiredRoles: Object.freeze(requiredRoles),
    items: Object.freeze([...items].sort((left, right) => left.assetId.localeCompare(right.assetId))),
    authority: normalizeAuthority(value.authority),
  };
  prepared.requestSha256 = hashObject(prepared);
  prepared.runId = prepared.requestSha256.slice(0, 20);
  return Object.freeze(prepared);
}

export function verifyPreparedRequest(value) {
  if (value.schema !== REQUEST_SCHEMA) throw new Error(`request.schema must be ${REQUEST_SCHEMA}.`);
  verifySelfHash(value, "requestSha256");
  const unsigned = { ...value };
  delete unsigned.requestSha256;
  delete unsigned.runId;
  const normalized = prepareDeliveryRequest(unsigned);
  if (stable(normalized) !== stable(value)) throw new Error("Prepared request differs from normalized request content.");
  return value;
}

function verifyReferenceHash(value, label, expectedSchema, hashKey) {
  if (value.schema !== expectedSchema) throw new Error(`${label}.schema must be ${expectedSchema}.`);
  const stored = verifyHashOnly(value, hashKey);
  return stored;
}

export function verifyCampaign(value) {
  return verifyReferenceHash(value, "campaign plan", CAMPAIGN_SCHEMA, "planSha256");
}

export function verifyStyle(value) {
  const profileSha256 = verifyReferenceHash(value, "style profile", STYLE_SCHEMA, "profileSha256");
  if (!Number.isSafeInteger(value.approvedProfiles) || value.approvedProfiles < 1) {
    throw new Error("Style profile has no approved profiles.");
  }
  const profiles = arrayValue(value.profiles, "style profile.profiles", { minimum: 1, maximum: 10000 });
  if (!profiles.some((profile) => profile?.status === "approved")) {
    throw new Error("Style profile lacks an approved scope.");
  }
  return profileSha256;
}
