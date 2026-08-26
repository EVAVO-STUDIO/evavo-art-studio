#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const root = process.cwd();
const temp = await mkdtemp(path.join(os.tmpdir(), 'evavo-project-local-web-asset-'));
try {
  const sourceSha256 = 'a'.repeat(64);
  const manifest = {
    contractVersion: 'evavo.project-local-web-asset-handoff.v1',
    workspaceRoot: path.join(temp, 'client-site'),
    evidenceRoot: path.join(temp, 'evidence'),
    publicRoot: 'public/media',
    stagingOnly: true,
    assets: [
      {
        id: 'hero-desktop',
        variant: 'web',
        source: '.evavo/prepared/hero.web.webp',
        sourceSha256,
        filename: 'hero.webp',
        reviewStatus: 'approved'
      }
    ]
  };
  const manifestPath = path.join(temp, 'handoff.json');
  const deliveryPath = path.join(temp, 'delivery.json');
  const jobPath = path.join(temp, 'job.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const compile = spawnSync(process.execPath, ['scripts/compile-project-local-web-asset-delivery.mjs', manifestPath, deliveryPath], { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.equal(compile.status, 0, compile.stderr || compile.stdout);
  const delivery = JSON.parse(await readFile(deliveryPath, 'utf8'));
  assert.equal(delivery.schema, 'evavo.art-studio.delivery.v2');
  assert.equal(delivery.provenance.deliveryMode, 'project-local');
  assert.equal(delivery.provenance.cloudinaryRequired, false);
  assert.equal(delivery.provenance.sourceMastersPublished, false);
  assert.equal(delivery.items[0].source, '.evavo/prepared/hero.web.webp');
  assert.equal(delivery.items[0].destination, 'public/media/hero.webp');
  assert.equal(delivery.items[0].sourceSha256, sourceSha256);

  const jobBuild = spawnSync(process.execPath, ['scripts/build-governed-workspace-job.mjs', deliveryPath, jobPath], { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.equal(jobBuild.status, 0, jobBuild.stderr || jobBuild.stdout);
  const job = JSON.parse(await readFile(jobPath, 'utf8'));
  assert.equal(job.schema, 'evavo.governed-workspace-job.v1');
  assert.equal(job.stagingOnly, true);
  assert.deepEqual(job.operations.map((operation) => operation.type), ['copy','move']);
  assert.equal(job.operations[0].expectedSha256, sourceSha256);
  assert.equal(job.operations[1].to, 'public/media/hero.webp');

  const rejected = { ...manifest, assets: [{ ...manifest.assets[0], reviewStatus: 'review-required' }] };
  const rejectedPath = path.join(temp, 'rejected.json');
  await writeFile(rejectedPath, `${JSON.stringify(rejected, null, 2)}\n`);
  const rejectedRun = spawnSync(process.execPath, ['scripts/compile-project-local-web-asset-delivery.mjs', rejectedPath, path.join(temp, 'rejected-delivery.json')], { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.notEqual(rejectedRun.status, 0, 'review-required asset was incorrectly admitted');

  const master = { ...manifest, assets: [{ ...manifest.assets[0], variant: 'master', filename: 'hero.png' }] };
  const masterPath = path.join(temp, 'master.json');
  await writeFile(masterPath, `${JSON.stringify(master, null, 2)}\n`);
  const masterRun = spawnSync(process.execPath, ['scripts/compile-project-local-web-asset-delivery.mjs', masterPath, path.join(temp, 'master-delivery.json')], { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.notEqual(masterRun.status, 0, 'source master was incorrectly admitted to public media');

  console.log('EVAVO project-local web asset handoff test passed');
} finally {
  await rm(temp, { recursive: true, force: true });
}
