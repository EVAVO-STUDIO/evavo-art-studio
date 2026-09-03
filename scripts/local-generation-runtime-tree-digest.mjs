#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

const EXCLUDED_DIRECTORIES = new Set(['.git', '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache']);
const EXCLUDED_FILES = new Set(['.DS_Store', 'Thumbs.db']);
const EXCLUDED_EXTENSIONS = new Set(['.pyc', '.pyo']);

function fail(message) { throw new Error(message); }
function compareText(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function posixRelative(root, file) { return path.relative(root, file).split(path.sep).join('/'); }
function excludedFile(name) { return EXCLUDED_FILES.has(name) || EXCLUDED_EXTENSIONS.has(path.extname(name).toLowerCase()); }

async function collectFiles(root, current, output) {
  const entries = await readdir(current, { withFileTypes: true });
  entries.sort((left, right) => compareText(left.name, right.name));
  for (const entry of entries) {
    if (entry.isSymbolicLink()) fail(`runtime tree may not contain symlink ${posixRelative(root, path.join(current, entry.name))}`);
    const candidate = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      await collectFiles(root, candidate, output);
      continue;
    }
    if (!entry.isFile()) fail(`runtime tree contains unsupported entry ${posixRelative(root, candidate)}`);
    if (excludedFile(entry.name)) continue;
    output.push(candidate);
  }
}

export async function digestRuntimeTree(rootPath) {
  const candidate = path.resolve(rootPath);
  const state = await lstat(candidate);
  if (!state.isDirectory() || state.isSymbolicLink()) fail('runtime tree root must be a regular non-symlink directory');
  const root = await realpath(candidate);
  const files = [];
  await collectFiles(root, root, files);
  files.sort((left, right) => compareText(posixRelative(root, left), posixRelative(root, right)));
  const digest = createHash('sha256');
  const entries = [];
  for (const file of files) {
    const state = await lstat(file);
    if (!state.isFile() || state.isSymbolicLink()) fail(`runtime tree file is not regular: ${posixRelative(root, file)}`);
    const bytes = await readFile(file);
    const fileSha256 = createHash('sha256').update(bytes).digest('hex');
    const relative = posixRelative(root, file);
    digest.update(relative, 'utf8');
    digest.update('\0', 'utf8');
    digest.update(String(bytes.length), 'utf8');
    digest.update('\0', 'utf8');
    digest.update(fileSha256, 'utf8');
    digest.update('\n', 'utf8');
    entries.push(Object.freeze({ path: relative, bytes: bytes.length, sha256: fileSha256 }));
  }
  return Object.freeze({
    schema: 'evavo.local-generation-runtime-tree-digest.v1',
    root,
    sha256: digest.digest('hex'),
    fileCount: entries.length,
    entries: Object.freeze(entries),
  });
}
