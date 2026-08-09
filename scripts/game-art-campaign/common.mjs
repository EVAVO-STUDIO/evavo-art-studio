import { createHash } from "node:crypto";
import { lstat, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function asObject(value, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  return value;
}

export function asArray(value, label, { minimum = 0 } = {}) {
  assert(Array.isArray(value), `${label} must be an array.`);
  assert(value.length >= minimum, `${label} must contain at least ${minimum} item(s).`);
  return value;
}

export function asString(value, label, { pattern, maximum = 4096 } = {}) {
  assert(typeof value === "string" && value.trim().length > 0, `${label} must be a non-empty string.`);
  const result = value.trim();
  assert(result.length <= maximum, `${label} must be no longer than ${maximum} characters.`);
  if (pattern) assert(pattern.test(result), `${label} has an invalid format.`);
  return result;
}

export function asText(value, label, { maximum = 4096 } = {}) {
  assert(typeof value === "string" && value.length > 0, `${label} must be a non-empty string.`);
  assert(value.length <= maximum, `${label} must be no longer than ${maximum} characters.`);
  return value;
}

export function asInteger(value, label, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  assert(Number.isInteger(value), `${label} must be an integer.`);
  assert(value >= minimum && value <= maximum, `${label} must be between ${minimum} and ${maximum}.`);
  return value;
}

export function optionalString(value, label, options) {
  if (value === undefined || value === null || value === "") return undefined;
  return asString(value, label, options);
}

export function unique(values, label) {
  const seen = new Set();
  for (const value of values) {
    assert(!seen.has(value), `${label} contains duplicate value ${value}.`);
    seen.add(value);
  }
  return values;
}

export function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, sortObject(value[key])]),
  );
}

export function canonicalJson(value) {
  return `${JSON.stringify(sortObject(value), null, 2)}\n`;
}

export function sha256(value) {
  const bytes = typeof value === "string" || Buffer.isBuffer(value)
    ? value
    : canonicalJson(value);
  return createHash("sha256").update(bytes).digest("hex");
}

export async function readJson(filePath) {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text);
}

export async function writeTextCreateOnly(filePath, value) {
  await writeFile(filePath, value, { encoding: "utf8", flag: "wx" });
}

export async function writeTextFilesCreateOnly(entries) {
  const files = asArray(entries, "entries", { minimum: 1 }).map((entry, index) => {
    const value = asObject(entry, `entries[${index}]`);
    return {
      filePath: path.resolve(asString(value.filePath, `entries[${index}].filePath`, { maximum: 4096 })),
      text: asText(value.text, `entries[${index}].text`, { maximum: 64 * 1024 * 1024 }),
    };
  });
  unique(files.map((entry) => entry.filePath), "create-only output paths");
  for (const entry of files) {
    try {
      await lstat(entry.filePath);
      throw new Error(`Create-only output already exists: ${entry.filePath}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  const created = [];
  try {
    for (const entry of files) {
      await writeTextCreateOnly(entry.filePath, entry.text);
      created.push(entry.filePath);
    }
  } catch (error) {
    for (const createdPath of created.reverse()) {
      try {
        await unlink(createdPath);
      } catch (cleanupError) {
        if (cleanupError?.code !== "ENOENT") {
          error.cleanupError = cleanupError;
        }
      }
    }
    throw error;
  }
}

export async function writeJsonCreateOnly(filePath, value) {
  await writeTextCreateOnly(filePath, canonicalJson(value));
}

export function slug(value, label = "id") {
  const result = asString(value, label, { pattern: /^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$/ });
  assert(!result.includes(".."), `${label} must not contain consecutive dots.`);
  return result;
}

export function safeFileSegment(value, label = "file segment") {
  return slug(value.replaceAll("_", "-"), label).replaceAll("-", "_");
}

export function pathInside(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function freeze(value) {
  if (Array.isArray(value)) {
    value.forEach(freeze);
    return Object.freeze(value);
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    return Object.freeze(value);
  }
  return value;
}
