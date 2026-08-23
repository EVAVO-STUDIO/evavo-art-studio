import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../scripts/probe-eva-production-transaction.mjs', import.meta.url), 'utf8');

test('retained EVA production transaction probe is fixed-root and read-only', () => {
  for (const marker of [
    "const TRANSACTION_RELATIVE = '.evavo/project-art-production/eva-female-v2';",
    "const MAX_FILES = 5000;",
    "const MAX_DEPTH = 16;",
    "'sequence-release.json'",
    "'atlas-manifest.json'",
    "'cross-clip-transition-evidence.json'",
    "'sequence-pack.json'",
    "exactMasterCountCandidate: state.webp.length === 180",
    "runtimeActivation: false",
    "websiteActivation: false",
    "publication: false",
    "forcePush: false",
  ]) assert.ok(source.includes(marker), `missing probe contract marker: ${marker}`);

  for (const forbidden of [
    'child_process',
    'execSync(',
    'spawnSync(',
    'fetch(',
    'https.request',
    'http.request',
    'writeFileSync(',
    'renameSync(',
    'rmSync(',
    'unlinkSync(',
    'git commit',
    'git push',
  ]) assert.equal(source.includes(forbidden), false, `probe must not contain: ${forbidden}`);
});
