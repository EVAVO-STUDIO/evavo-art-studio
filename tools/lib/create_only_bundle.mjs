import { randomUUID } from "node:crypto";
import { link, lstat, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

async function mustNotExist(target) {
  try {
    await lstat(target);
    throw new Error(`refusing to overwrite existing evidence output: ${target}`);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
}

/**
 * Write a group of evidence outputs with create-only semantics and rollback.
 * Temporary files are created beside their final targets, then hard-linked into
 * place so an existing destination can never be overwritten. If any publish
 * step fails, every final path created by this call is removed again.
 */
export async function writeCreateOnlyBundle(entries) {
  if (!Array.isArray(entries) || entries.length < 1) throw new Error("create-only bundle requires at least one output.");
  const normalized = entries.map((entry, index) => {
    if (!entry || typeof entry.path !== "string" || !entry.path.trim()) throw new Error(`bundle entry ${index} path is required.`);
    if (!(Buffer.isBuffer(entry.data) || typeof entry.data === "string")) throw new Error(`bundle entry ${index} data must be Buffer or string.`);
    return { path: path.resolve(entry.path), data: entry.data, encoding: entry.encoding };
  });
  if (new Set(normalized.map((entry) => entry.path)).size !== normalized.length) throw new Error("create-only bundle contains duplicate output paths.");

  for (const entry of normalized) {
    await mkdir(path.dirname(entry.path), { recursive: true });
    await mustNotExist(entry.path);
  }

  const token = `${process.pid}-${randomUUID()}`;
  const temps = [];
  const published = [];
  try {
    for (let index = 0; index < normalized.length; index += 1) {
      const entry = normalized[index];
      const temporary = path.join(path.dirname(entry.path), `.${path.basename(entry.path)}.${token}.${index}.tmp`);
      await writeFile(temporary, entry.data, { flag: "wx", ...(entry.encoding ? { encoding: entry.encoding } : {}) });
      temps.push(temporary);
    }
    for (let index = 0; index < normalized.length; index += 1) {
      await link(temps[index], normalized[index].path);
      published.push(normalized[index].path);
    }
    return Object.freeze({ paths: Object.freeze(normalized.map((entry) => entry.path)), createOnly: true, rollbackSafe: true });
  } catch (error) {
    await Promise.allSettled(published.map((target) => unlink(target)));
    throw error;
  } finally {
    await Promise.allSettled(temps.map((temporary) => unlink(temporary)));
  }
}
