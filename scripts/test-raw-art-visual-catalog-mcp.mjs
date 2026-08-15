import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { deflateSync } from 'node:zlib';

import { callTool, toolDefinitions } from '../tools/raw_art_visual_catalog_mcp.mjs';

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, check]);
}

function png(width, height, pixel) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const row = Buffer.alloc(width * 4);
  for (let x = 0; x < width; x += 1) Buffer.from(pixel).copy(row, x * 4);
  const raw = Buffer.concat(Array.from({ length: height }, () => Buffer.concat([Buffer.from([0]), row])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

test('visual catalog MCP is explicit, confined and returns inspectable artifact paths', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-raw-art-visual-mcp-'));
  try {
    const raw = path.join(root, 'raw_Art');
    const evidence = path.join(root, 'evidence');
    await mkdir(raw);
    await mkdir(evidence);
    await writeFile(path.join(raw, 'fighter.png'), png(16, 16, [220, 30, 40, 255]));
    const roots = [{ lexical: root, real: root }];
    const readOnly = { value: 'read-only', writesEnabled: false };
    const readWrite = { value: 'read-write', writesEnabled: true };
    assert.deepEqual(toolDefinitions(readOnly).map((tool) => tool.name), [
      'evavo_raw_art_visual_capabilities',
      'evavo_raw_art_visual_verify_catalog',
    ]);
    assert.equal(toolDefinitions(readWrite).length, 3);
    const outputRoot = path.join(evidence, 'catalog-001');
    const built = await callTool('evavo_raw_art_visual_build_catalog', {
      rawArtRoot: raw,
      outputRoot,
      projectId: 'battle-chess',
      packetSize: 4,
      confirmWrite: true,
    }, { mode: readWrite, roots, environment: process.env });
    assert.equal(built.summary.status, 'built');
    assert.equal(built.summary.contactSheetPaths.length, 1);
    assert.equal(built.effects.visualCatalogWrite, true);
    assert.equal(built.effects.sourceMutation, false);
    const verified = await callTool('evavo_raw_art_visual_verify_catalog', { outputRoot, rawArtRoot: raw }, { mode: readOnly, roots, environment: process.env });
    assert.equal(verified.summary.status, 'passed');
    assert.equal(verified.summary.sourcesVerified, 1);
    await assert.rejects(callTool('evavo_raw_art_visual_build_catalog', { rawArtRoot: raw, outputRoot: path.join(evidence, 'blocked'), confirmWrite: false }, { mode: readWrite, roots, environment: process.env }), /confirmWrite=true/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
