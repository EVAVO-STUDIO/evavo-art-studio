import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function run(args, cwd) {
  const result = spawnSync(process.execPath, ['scripts/fx-decal-svg-cli.mjs', ...args], { cwd, encoding: 'utf8', shell: false, windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'FX decal CLI failed');
  return JSON.parse(result.stdout.trim());
}

test('FX decal CLI writes create-only candidate bundle', async () => {
  const root = process.cwd();
  const parent = await mkdtemp(path.join(root, '.tmp-fx-decal-cli-'));
  const relativeOut = path.relative(root, path.join(parent, 'candidate'));
  try {
    const result = run(['render','bullet-hole','--id','plaster-impact','--substrate','plaster','--seed','99','--amount','0.7','--out',relativeOut], root);
    assert.equal(result.ok, true);
    assert.match(result.candidateSha256, /^[a-f0-9]{64}$/);
    const manifest = JSON.parse(await readFile(path.join(root, relativeOut, 'manifest.json'), 'utf8'));
    assert.equal(manifest.format, 'evavo.fx-decal-svg-bundle/v1');
    assert.equal(manifest.automaticApproval, false);
    await stat(path.join(root, relativeOut, 'plaster-impact.mask.svg'));
    await stat(path.join(root, relativeOut, 'plaster-impact.candidate.json'));
    const second = spawnSync(process.execPath, ['scripts/fx-decal-svg-cli.mjs','render','bullet-hole','--id','plaster-impact','--substrate','plaster','--out',relativeOut], { cwd: root, encoding: 'utf8', shell: false, windowsHide: true });
    assert.notEqual(second.status, 0);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
