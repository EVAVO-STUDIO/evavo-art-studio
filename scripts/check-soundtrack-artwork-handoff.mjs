#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  path.join(ROOT, 'scripts', 'validate-soundtrack-artwork-brief.mjs'),
  path.join(ROOT, 'scripts', 'test-soundtrack-artwork-brief.mjs'),
];
for (const file of files) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`missing ordinary artwork-handoff file: ${file}`);
}
const validator = fs.readFileSync(files[0], 'utf8');
for (const marker of [
  "const SCHEMA = 'evavo_soundtrack_artwork_brief_v1'",
  "const AUDIO_REPO = 'EVAVO-STUDIO/evavo-audio-studio'",
  "const ART_REPO = 'EVAVO-STUDIO/evavo-art-studio'",
  "document?.master?.aspectRatio === '1:1'",
  "document?.master?.retainLayeredEditableSource === true",
  "document?.authority?.finalArtworkApproval === false",
  "document?.authority?.publicationAuthority === false",
]) {
  if (!validator.includes(marker)) throw new Error(`soundtrack artwork receiver marker missing: ${marker}`);
}
const test = spawnSync(process.execPath, [files[1]], { cwd: ROOT, encoding: 'utf8' });
if (test.status !== 0) throw new Error(test.stderr || test.stdout || 'soundtrack artwork receiver test failed');
process.stdout.write(test.stdout);
console.log('soundtrack artwork handoff gate: OK');
