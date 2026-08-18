#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AUDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'audit-pixel-art-candidate.mjs');

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([length, t, data, crc]);
}

function rgbaPng(width, height, pixels, interlace = 0) {
  assert.equal(pixels.length, width * height * 4);
  const signature = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = interlace;
  const rawRows = [];
  for (let y = 0; y < height; y += 1) {
    rawRows.push(Buffer.from([0]));
    rawRows.push(Buffer.from(pixels.slice(y * width * 4, (y + 1) * width * 4)));
  }
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rawRows))), chunk('IEND', Buffer.alloc(0))]);
}

function run(file, args = []) {
  return spawnSync(process.execPath, [AUDITOR, '--input', file, '--require-alpha', '--json', ...args], {
    encoding: 'utf8', shell: false, windowsHide: true, timeout: 30_000
  });
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evavo-pixel-audit-'));
try {
  const crisp = path.join(root, 'crisp.png');
  fs.writeFileSync(crisp, rgbaPng(2, 2, [
    255,0,0,255, 0,0,0,0,
    0,0,255,255, 255,255,0,255
  ]));
  const crispRun = run(crisp, ['--max-colors', '8']);
  assert.equal(crispRun.status, 0, crispRun.stderr);
  const crispReport = JSON.parse(crispRun.stdout);
  assert.equal(crispReport.status, 'technical-pass');
  assert.equal(crispReport.metrics.partialAlphaPixels, 0);
  assert.equal(crispReport.automaticApproval, false);
  assert.equal(crispReport.repositoryMutationAuthorized, false);

  const halo = path.join(root, 'halo.png');
  fs.writeFileSync(halo, rgbaPng(2, 1, [255,0,0,255, 255,0,0,128]));
  const haloRun = run(halo, ['--max-colors', '8']);
  assert.equal(haloRun.status, 2);
  const haloReport = JSON.parse(haloRun.stdout);
  assert.equal(haloReport.status, 'review-required');
  assert.ok(haloReport.findings.some((item) => item.code === 'partial_alpha_halo'));

  const palette = path.join(root, 'palette.png');
  fs.writeFileSync(palette, rgbaPng(3, 1, [255,0,0,255, 0,255,0,255, 0,0,255,255]));
  const paletteRun = run(palette, ['--max-colors', '2']);
  assert.equal(paletteRun.status, 2);
  const paletteReport = JSON.parse(paletteRun.stdout);
  assert.ok(paletteReport.findings.some((item) => item.code === 'palette_too_large'));

  const wrongDimensions = run(crisp, ['--max-colors', '8', '--expected-width', '64', '--expected-height', '64']);
  assert.equal(wrongDimensions.status, 2);
  const dimensionReport = JSON.parse(wrongDimensions.stdout);
  assert.ok(dimensionReport.findings.some((item) => item.code === 'wrong_width'));
  assert.ok(dimensionReport.findings.some((item) => item.code === 'wrong_height'));

  console.log(JSON.stringify({
    contract: 'evavo.pixel-art-candidate-audit-test.v1',
    status: 'passed',
    tests: 4,
    mutationAuthority: false,
    automaticApproval: false
  }, null, 2));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
