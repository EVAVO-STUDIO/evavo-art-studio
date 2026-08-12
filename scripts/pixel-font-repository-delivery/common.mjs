import crypto from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const HASH64 = /^[0-9a-f]{64}$/u;
export const HEAD40 = /^[0-9a-f]{40}$/u;
export const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
export const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

export function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function hashObject(value) {
  return sha256(Buffer.from(stable(value), "utf8"));
}

export function hashJsonLine(value) {
  return sha256(Buffer.from(`${stable(value)}\n`, "utf8"));
}

export function objectValue(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

export function arrayValue(value, label, { minimum = 0, maximum = 4096 } = {}) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new Error(`${label} must contain ${minimum}..${maximum} entries.`);
  }
  return value;
}

export function text(value, label, { minimum = 1, maximum = 4096, pattern } = {}) {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum || (pattern && !pattern.test(value))) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

export function booleanValue(value, label) {
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean.`);
  return value;
}

export function integer(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} through ${maximum}.`);
  }
  return value;
}

export function exactKeys(value, allowed, label) {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length) throw new Error(`${label} contains unknown fields: ${extras.join(", ")}.`);
}

export function posixRelative(value, label, { deniedParts = [".git", ".env", "node_modules", "credentials", "secrets"] } = {}) {
  const source = text(value, label, { maximum: 4096 }).replaceAll("\\", "/");
  if (source.startsWith("/") || /^[A-Za-z]:/u.test(source) || source.includes("\0")) throw new Error(`${label} must be relative.`);
  const normalized = path.posix.normalize(source);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) throw new Error(`${label} escapes its root.`);
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || deniedParts.includes(part.toLowerCase()))) {
    throw new Error(`${label} contains a denied path component.`);
  }
  return normalized;
}

export function pathInside(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function canonicalDirectory(value, label, { create = false } = {}) {
  const target = path.resolve(text(value, label, { maximum: 8192 }));
  if (create) await mkdir(target, { recursive: true });
  const metadata = await lstat(target);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || await realpath(target) !== target) {
    throw new Error(`${label} must be a canonical non-symlink directory.`);
  }
  return target;
}

export async function canonicalFile(value, label) {
  const target = path.resolve(text(value, label, { maximum: 8192 }));
  const metadata = await lstat(target);
  if (!metadata.isFile() || metadata.isSymbolicLink() || await realpath(target) !== target) {
    throw new Error(`${label} must be a canonical non-symlink file.`);
  }
  return target;
}

export async function readJson(filePath, label = "JSON file") {
  const target = await canonicalFile(filePath, label);
  const bytes = await readFile(target);
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8 JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return Object.freeze({ path: target, value, bytes, sha256: sha256(bytes) });
}

export async function writeCreateOnly(target, bytes, allowedRoot) {
  const absolute = path.resolve(target);
  if (!pathInside(absolute, allowedRoot)) throw new Error(`Output escapes allowed root: ${absolute}.`);
  await mkdir(path.dirname(absolute), { recursive: true });
  const handle = await open(absolute, "wx");
  try {
    await handle.writeFile(bytes);
  } finally {
    await handle.close();
  }
}

export async function writeJsonCreateOnly(target, value, allowedRoot) {
  await writeCreateOnly(target, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"), allowedRoot);
}

export async function fileIdentity(filePath) {
  const bytes = await readFile(filePath);
  return Object.freeze({ sha256: sha256(bytes), bytes: bytes.length });
}

export function runFixed(executable, args, { cwd, env = {}, timeout = 600_000, label = executable, allowFailure = false } = {}) {
  const result = spawnSync(executable, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout,
    shell: false,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${label} failed with exit ${result.status}.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return Object.freeze({ status: result.status, stdout: result.stdout, stderr: result.stderr });
}

export function runGit(root, args, options = {}) {
  return runFixed("git", ["-C", root, ...args], { ...options, label: options.label ?? `git ${args.join(" ")}` });
}

export function normalizeRemoteRepository(value) {
  const source = text(value, "remote URL", { maximum: 4096 }).trim().replace(/\/$/u, "");
  const patterns = [
    /^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/iu,
    /^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/iu,
    /^ssh:\/\/git@github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/iu,
  ];
  for (const expression of patterns) {
    const match = expression.exec(source);
    if (match) return match[1];
  }
  throw new Error(`Unsupported GitHub remote URL: ${source}.`);
}

export function safeStem(value, mode = "preserve") {
  const source = text(value, "target stem", { maximum: 160 });
  const words = source.replace(/([a-z0-9])([A-Z])/gu, "$1 $2").split(/[^A-Za-z0-9]+/u).filter(Boolean);
  if (!words.length) throw new Error("target stem has no safe characters.");
  if (mode === "preserve") {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/u.test(source)) throw new Error("preserved target stem is invalid.");
    return source;
  }
  if (mode === "pascal") return words.map((word) => word[0].toUpperCase() + word.slice(1)).join("");
  if (mode === "kebab") return words.map((word) => word.toLowerCase()).join("-");
  if (mode === "snake") return words.map((word) => word.toLowerCase()).join("_");
  throw new Error(`Unsupported filename case ${mode}.`);
}

export async function removeIfExists(target) {
  await rm(target, { recursive: true, force: true });
}

export async function regularFileState(target) {
  try {
    const metadata = await lstat(target);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`${target} must be a regular non-symlink file.`);
    const bytes = await readFile(target);
    return Object.freeze({ exists: true, bytes, sha256: sha256(bytes), size: metadata.size });
  } catch (error) {
    if (error?.code === "ENOENT") return Object.freeze({ exists: false, bytes: null, sha256: null, size: 0 });
    throw error;
  }
}

export function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument ${token}.`);
    const key = token.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) result[key] = true;
    else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}
