import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assert,
  canonical,
  freeze,
  hashBytes,
  pathWithin,
  safeRelativePath,
} from "./frame-body-selection-decision-common.mjs";

export async function ensureSelectionDirectory(root, relativeDirectory) {
  const safe = safeRelativePath(relativeDirectory, "workspace directory path");
  let current = root;
  for (const segment of safe.split("/")) {
    current = path.join(current, segment);
    const info = await lstat(current).catch(() => null);
    if (!info) {
      await mkdir(current, { mode: 0o700 });
      continue;
    }
    assert(info.isDirectory() && !info.isSymbolicLink(), `workspace directory component is not a real directory: ${current}`);
  }
  const resolved = await realpath(current);
  assert(pathWithin(root, resolved), `workspace directory escaped the persistent workspace: ${resolved}`);
  return resolved;
}
async function inspectExisting(filePath) {
  const info = await lstat(filePath).catch(() => null);
  if (!info) return null;
  assert(info.isFile() && !info.isSymbolicLink(), `existing output is not a regular non-symlink file: ${filePath}`);
  const bytes = await readFile(filePath);
  return freeze({ bytes, sha256: hashBytes(bytes), size: bytes.length });
}
export async function writeSelectionExactOrReuse(filePath, bytes, expectedSha256) {
  const existing = await inspectExisting(filePath);
  if (existing) {
    assert(existing.sha256 === expectedSha256 && existing.size === bytes.length, `existing output conflicts with the governed selection decision: ${filePath}`);
    return "reused";
  }
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
  try {
    await rename(temporary, filePath);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return "created";
}
export async function writeSelectionReceiptChain(filePath, previousReceipts, receipt) {
  const expectedPrevious = canonical(previousReceipts);
  const nextChain = freeze([...previousReceipts, receipt]);
  const expectedNext = canonical(nextChain);
  const existing = await inspectExisting(filePath);
  assert(existing, "persisted receipt chain disappeared before selection materialization.");
  const text = existing.bytes.toString("utf8");
  if (text === expectedNext) return freeze({ status: "reused", chain: nextChain });
  assert(text === expectedPrevious, "persisted receipt chain differs from the validated creative-review-passed predecessor chain.");
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await writeFile(temporary, expectedNext, { flag: "wx", mode: 0o600 });
  try {
    await rename(temporary, filePath);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return freeze({ status: "advanced", chain: nextChain });
}
