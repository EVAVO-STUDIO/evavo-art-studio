import { lstat, realpath, stat } from "node:fs/promises";
import path from "node:path";

import {
  MEDIA_TYPES,
  PROJECT_ART_INTAKE_PLAN_SCHEMA,
  SHA256,
  canonicalJson,
  fail,
  isObject,
  normalizeTags,
  portableRelative,
  requiredString,
  safeId,
  sha256,
} from "./intake-contract.mjs";

export function absolutePath(value, label) {
  const raw = requiredString(value, label, 32_768);
  if (!path.isAbsolute(raw)) fail(`${label} must be absolute.`);
  return path.resolve(raw);
}

function pathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

export async function secureRegularFile(candidate, allowedRoots, label) {
  const lexical = path.resolve(candidate);
  const matchingRoot = allowedRoots.find((root) => pathInside(root, lexical));
  if (!matchingRoot) fail(`${label} is outside every allowed source root.`);

  const rootReal = await realpath(matchingRoot);
  let current = matchingRoot;
  const relativeParts = path.relative(matchingRoot, lexical).split(path.sep).filter(Boolean);
  for (const part of relativeParts) {
    current = path.join(current, part);
    const info = await lstat(current).catch(() => null);
    if (!info) fail(`${label} does not exist: ${lexical}`);
    if (info.isSymbolicLink()) fail(`${label} contains a symbolic-link component.`);
  }
  const info = await stat(lexical);
  if (!info.isFile()) fail(`${label} must be a regular file.`);
  const resolved = await realpath(lexical);
  if (!pathInside(rootReal, resolved)) fail(`${label} escaped its allowed source root.`);
  return { lexical, resolved, size: info.size, allowedRoot: rootReal };
}

export function detectMediaType(fileName) {
  return MEDIA_TYPES.get(path.extname(fileName).toLowerCase()) ??
    "application/octet-stream";
}

export function normalizeStorage(value, projectId) {
  if (value === undefined) {
    return {
      enabled: false,
      vaultId: "art",
      logicalPrefix: `Art/${projectId}`,
      tags: ["art-studio", projectId],
    };
  }
  if (!isObject(value)) fail("storage must be an object.");
  const enabled = value.enabled === true;
  const vaultId = safeId(value.vaultId ?? "art", "storage.vaultId");
  const logicalPrefix = portableRelative(
    value.logicalPrefix ?? `Art/${projectId}`,
    "storage.logicalPrefix",
  );
  const tags = normalizeTags(
    value.tags ?? ["art-studio", projectId],
    "storage.tags",
  );
  return { enabled, vaultId, logicalPrefix, tags };
}

export function withoutUndefined(value) {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, withoutUndefined(entry)]),
  );
}

export function validatePlanHash(plan) {
  if (!isObject(plan) || plan.schema !== PROJECT_ART_INTAKE_PLAN_SCHEMA) {
    fail(`Plan must use ${PROJECT_ART_INTAKE_PLAN_SCHEMA}.`);
  }
  if (typeof plan.planSha256 !== "string" || !SHA256.test(plan.planSha256)) {
    fail("Plan self hash is missing or invalid.");
  }
  const unhashed = structuredClone(plan);
  delete unhashed.planSha256;
  const observed = sha256(canonicalJson(unhashed));
  if (observed !== plan.planSha256) fail("Plan self hash mismatch.");
  return plan;
}
