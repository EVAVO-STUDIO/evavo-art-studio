import { constants } from "node:fs";
import { access, link, lstat, mkdir, open, readFile, realpath, rm } from "node:fs/promises";
import path from "node:path";

import { normalizedPath, pathInside } from "./contracts.mjs";

export async function canonicalRegularFile(filePath, label, root) {
  const target = path.resolve(filePath);
  if (root && !pathInside(target, root)) throw new Error(`${label} must remain inside its allowed root.`);
  const state = await lstat(target);
  if (!state.isFile() || state.isSymbolicLink() || state.size < 1) throw new Error(`${label} must be a non-empty regular non-symlink file.`);
  const canonical = await realpath(target);
  if (normalizedPath(canonical) !== normalizedPath(target)) throw new Error(`${label} must use its canonical path.`);
  if (root && !pathInside(canonical, await realpath(root))) throw new Error(`${label} escapes its allowed root.`);
  return { path: canonical, state };
}

export async function readJson(filePath, label, maximumBytes = 10 * 1024 * 1024) {
  const { path: canonical, state } = await canonicalRegularFile(filePath, label);
  if (state.size > maximumBytes) throw new Error(`${label} is too large.`);
  const bytes = await readFile(canonical);
  let value;
  try { value = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/u, "")); }
  catch (error) { throw new Error(`${label} is invalid JSON: ${error.message}`); }
  return { path: canonical, bytes, value };
}

async function ensureCreateOnlyTarget(target, allowedRoot) {
  const resolved = path.resolve(target);
  const root = path.resolve(allowedRoot);
  if (!pathInside(resolved, root)) throw new Error(`Output escapes allowed root: ${resolved}`);
  await mkdir(path.dirname(resolved), { recursive: true });
  const canonicalRoot = await realpath(root);
  const canonicalParent = await realpath(path.dirname(resolved));
  if (!pathInside(canonicalParent, canonicalRoot)) throw new Error(`Output parent escapes allowed root: ${resolved}`);
  try {
    await access(resolved, constants.F_OK);
    throw new Error(`Output already exists: ${resolved}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return resolved;
}

export async function writeCreateOnly(target, bytes, allowedRoot, mode = 0o600) {
  const resolved = await ensureCreateOnlyTarget(target, allowedRoot);
  const temporary = path.join(path.dirname(resolved), `.${path.basename(resolved)}.${process.pid}.${Date.now()}.tmp`);
  try {
    const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, mode);
    try { await handle.writeFile(bytes); await handle.sync(); }
    finally { await handle.close(); }
    await link(temporary, resolved);
  } finally { await rm(temporary, { force: true }); }
  return resolved;
}

export const writeJsonCreateOnly = (target, value, root) =>
  writeCreateOnly(target, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"), root);

export function parseCsvRoots(value) {
  if (!value) return [];
  const delimiter = process.platform === "win32" ? ";" : ":";
  return String(value).split(delimiter).map((entry) => entry.trim()).filter(Boolean).map((entry) => path.resolve(entry));
}
