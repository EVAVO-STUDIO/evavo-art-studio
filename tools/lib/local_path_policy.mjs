import { realpath } from "node:fs/promises";
import path from "node:path";

function configuredRoots(envName) {
  return (process.env[envName] ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => path.resolve(entry));
}

function isMissingPathError(error) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR"),
  );
}

/**
 * Resolve every existing path component through realpath while allowing a
 * not-yet-created suffix. This makes future output directories safe against a
 * symlinked existing ancestor without requiring the final directory to exist.
 */
export async function canonicalizeProspectivePath(filePath) {
  const absolute = path.resolve(filePath);
  const missingSegments = [];
  let cursor = absolute;

  while (true) {
    try {
      const existing = await realpath(cursor);
      return path.resolve(existing, ...missingSegments.reverse());
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) {
        throw new Error(`Unable to resolve an existing ancestor for ${absolute}.`);
      }
      missingSegments.push(path.basename(cursor));
      cursor = parent;
    }
  }
}

function isWithinRoot(candidate, root) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  );
}

export async function assertAllowedLocalPath(
  filePath,
  {
    envName,
    output = false,
    label = "local file",
  },
) {
  if (typeof filePath !== "string" || !filePath.trim()) {
    throw new Error(`${label} path must be a non-empty string.`);
  }
  if (typeof envName !== "string" || !envName) {
    throw new Error("Local path policy requires an environment variable name.");
  }

  const roots = configuredRoots(envName);
  if (roots.length === 0) throw new Error(`${envName} is not configured.`);

  const resolved = path.resolve(filePath);
  const candidate = output
    ? await canonicalizeProspectivePath(path.dirname(resolved))
    : await realpath(resolved);
  const canonicalRoots = await Promise.all(
    roots.map((root) => canonicalizeProspectivePath(root)),
  );

  const allowed = canonicalRoots.some((root) => isWithinRoot(candidate, root));
  if (!allowed) {
    throw new Error(`Path is outside configured ${label} roots: ${resolved}`);
  }
  return resolved;
}

export function configuredLocalRootCount(envName) {
  return configuredRoots(envName).length;
}
