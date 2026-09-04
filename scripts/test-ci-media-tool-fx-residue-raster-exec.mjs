import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { compileFxDecalSvgCandidate } from './fx-decal-svg-candidate.mjs';

const runner = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function buildMedia() {
  const result = spawnSync(runner, ['--filter', '@evavo/art-media', 'build'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) throw new Error(`Art media build failed: ${result.stderr || result.stdout}`);
}

test('approved Sharp runtime produces exact true-alpha residue candidate and proof sheet', async () => {
  buildMedia();
  const mediaPath = path.resolve('packages/media/dist/index.js');
  const { rasterizeFxResidueSvgCandidate } = await import(`${pathToFileURL(mediaPath).href}?ci=${Date.now()}`);
  assert.equal(typeof rasterizeFxResidueSvgCandidate, 'function');
  const candidate = compileFxDecalSvgCandidate({ id: 'ci-plaster-hole', kind: 'bullet-hole', substrate: 'plaster', seed: 8812, amount: 0.63 });
  const result = await rasterizeFxResidueSvgCandidate(candidate.svg, 1024, 1024, 12);
  assert.equal(result.evidence.processorId, 'sharp-exact-canvas-runtime');
  assert.equal(result.evidence.outputWidth, 1024);
  assert.equal(result.evidence.outputHeight, 1024);
  assert.equal(result.evidence.alphaMode, 'straight');
  assert.equal(result.evidence.meaningfulTransparency, true);
  assert.equal(result.evidence.paintedCheckerboardDetected, false);
  assert.ok(result.evidence.transparentPixels > 0);
  assert.ok(result.evidence.visiblePixels > 0);
  assert.match(result.evidence.pngSha256, /^[a-f0-9]{64}$/);
  assert.match(result.evidence.proofSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(result.transparencyProofPng.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
});
