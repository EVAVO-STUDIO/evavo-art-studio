import fs from "node:fs";
import path from "node:path";
import { CHECKSUM_LINE, EXPECTED_PACKAGE, EXPECTED_VERSION, exactSha, inside, plainObject, safeInteger, safeRelative, sha256 } from "./runtime-common.mjs";

function enumerateRuntimeFiles(root) {
  const rows = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const metadata = fs.lstatSync(absolute);
      if (metadata.isSymbolicLink()) throw new Error(`Extracted runtime contains a symbolic link: ${absolute}`);
      if (metadata.isDirectory()) visit(absolute);
      else if (metadata.isFile()) rows.push(safeRelative(path.relative(root, absolute), "runtime file"));
      else throw new Error(`Extracted runtime contains an unsupported entry: ${absolute}`);
    }
  };
  visit(root);
  return rows.sort();
}

function parseRuntimeChecksums(root, expectedChecksumHash) {
  const checksumPath = path.join(root, "checksums.sha256");
  const metadata = fs.lstatSync(checksumPath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Extracted runtime checksum inventory is not an ordinary file.");
  const checksumBytes = fs.readFileSync(checksumPath);
  if (sha256(checksumBytes) !== expectedChecksumHash) throw new Error("Extracted checksums.sha256 does not match the distribution descriptor.");
  const records = new Map();
  const lines = checksumBytes.toString("utf8").split(/\r?\n/u).filter(Boolean);
  if (lines.length < 1) throw new Error("Extracted runtime checksum inventory is empty.");
  for (const [index, line] of lines.entries()) {
    const match = line.match(CHECKSUM_LINE);
    if (!match) throw new Error(`Runtime checksum line ${index + 1} is malformed.`);
    const relative = safeRelative(match[2], `runtime checksum line ${index + 1}`);
    if (relative === "checksums.sha256" || relative === ".bundle-sha256" || records.has(relative)) {
      throw new Error(`Runtime checksum inventory repeats or self-addresses ${relative}.`);
    }
    records.set(relative, match[1]);
  }
  return records;
}

export function descriptorRuntimeFiles(value) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 10000) throw new Error("runtimeFiles must be a bounded non-empty array.");
  const files = new Map();
  for (const [index, raw] of value.entries()) {
    const item = plainObject(raw, `runtimeFiles[${index}]`);
    const relative = safeRelative(item.path, `runtimeFiles[${index}].path`);
    if (relative === ".bundle-sha256" || files.has(relative)) throw new Error(`runtimeFiles repeats or reserves ${relative}.`);
    files.set(relative, Object.freeze({ sha256: exactSha(item.sha256, `runtimeFiles[${index}].sha256`), bytes: safeInteger(item.bytes, `runtimeFiles[${index}].bytes`, 0) }));
  }
  if (!files.has("checksums.sha256")) throw new Error("runtimeFiles must include checksums.sha256.");
  return files;
}

export function verifyExtractedRuntime(root, expected) {
  const rootMetadata = fs.lstatSync(root);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) throw new Error("Runtime root must be an ordinary directory.");
  const records = parseRuntimeChecksums(root, expected.checksumsSha256);
  const actual = enumerateRuntimeFiles(root).filter((relative) => relative !== ".bundle-sha256");
  const expectedAll = [...expected.runtimeFiles.keys()].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expectedAll)) throw new Error("Extracted runtime file inventory differs from the descriptor.");
  const checksummed = actual.filter((relative) => relative !== "checksums.sha256");
  if (JSON.stringify(checksummed) !== JSON.stringify([...records.keys()].sort())) throw new Error("Extracted runtime file inventory differs from checksums.sha256.");
  let totalFileBytes = 0;
  for (const relative of actual) {
    const absolute = path.resolve(root, ...relative.split("/"));
    if (!inside(path.resolve(root), absolute)) throw new Error(`Runtime checksum path escaped its root: ${relative}`);
    const metadata = fs.lstatSync(absolute);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`Runtime path is not an ordinary file: ${relative}`);
    const bytes = fs.readFileSync(absolute);
    const actualHash = sha256(bytes);
    const descriptorRecord = expected.runtimeFiles.get(relative);
    if (actualHash !== descriptorRecord.sha256 || bytes.length !== descriptorRecord.bytes) {
      throw new Error(`Extracted runtime descriptor verification failed for ${relative}.`);
    }
    if (relative !== "checksums.sha256" && actualHash !== records.get(relative)) throw new Error(`Extracted runtime SHA-256 verification failed for ${relative}.`);
    totalFileBytes += bytes.length;
  }
  if (totalFileBytes !== expected.totalFileBytes) throw new Error("Installed runtime byte total does not match the descriptor.");
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  if (packageJson.name !== EXPECTED_PACKAGE || packageJson.version !== EXPECTED_VERSION) throw new Error("Installed runtime package identity is invalid.");
  return Object.freeze({ fileCount: actual.length, checksumEntryCount: records.size, totalFileBytes });
}
