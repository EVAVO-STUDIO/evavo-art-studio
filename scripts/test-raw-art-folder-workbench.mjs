import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { deflateSync } from 'node:zlib';

import {
  DECISIONS_SCHEMA,
  compileRawArtSessionPlan,
  materializeRawArtSession,
  scanRawArtFolder,
  stableJson,
  verifyRawArtSession,
  writeJsonCreateOnly,
} from './raw-art-folder-workbench.mjs';
import {
  callTool,
  handleRequest,
  toolDefinitions,
} from '../tools/raw_art_folder_mcp.mjs';

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
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
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-raw-art-folder-'));
  const raw = path.join(root, 'RAW_ART');
  const workspace = path.join(root, 'workspace');
  const evidence = path.join(root, 'evidence');
  await mkdir(path.join(raw, 'characters'), { recursive: true });
  await mkdir(path.join(raw, 'UI'), { recursive: true });
  await mkdir(path.join(raw, 'ui'), { recursive: true });
  await mkdir(workspace, { recursive: true });
  await mkdir(evidence, { recursive: true });
  const a = png(4, 4, [255, 0, 0, 255]);
  const b = png(4, 4, [0, 255, 0, 255]);
  await writeFile(path.join(raw, 'characters', 'hero-frame-001.png'), a);
  await writeFile(path.join(raw, 'characters', 'hero-frame-002.png'), b);
  await copyFile(path.join(raw, 'characters', 'hero-frame-001.png'), path.join(raw, 'characters', 'hero-duplicate.png'));
  await writeFile(path.join(raw, 'UI', 'Icon.png'), png(8, 8, [0, 0, 255, 255]));
  await writeFile(path.join(raw, 'ui', 'icon.png'), png(8, 8, [255, 255, 0, 255]));
  await writeFile(path.join(raw, 'README.txt'), 'source notes\n');
  return { root, raw, workspace, evidence };
}

async function inventoryAndPlan(current) {
  const inventory = await scanRawArtFolder({
    rawArtRoot: current.raw,
    generatedAt: '2026-08-12T00:00:00.000Z',
  });
  const inventoryPath = path.join(current.evidence, 'inventory.json');
  await writeJsonCreateOnly(inventoryPath, inventory);
  const byPath = new Map(inventory.files.map((entry) => [entry.relativePath, entry]));
  const selection = (relativePath, action, extra = {}) => {
    const source = byPath.get(relativePath);
    return {
      relativePath,
      expectedSha256: source.sha256,
      expectedBytes: source.bytes,
      action,
      ...extra,
    };
  };
  const decisions = {
    schema: DECISIONS_SCHEMA,
    sessionId: 'brass-raw-review-001',
    inventorySha256: inventory.inventorySha256,
    workspaceParent: current.workspace,
    selections: [
      selection('characters/hero-frame-001.png', 'working-copy', {
        destination: 'characters/hero/idle-001.png',
        operations: ['trim-alpha', 'pixel-resize'],
        storageLogicalPath: 'brass/raw/characters/hero/idle-001.png',
      }),
      selection('characters/hero-frame-002.png', 'sequence-frame', {
        groupId: 'hero-idle',
        destination: 'frame-002.png',
      }),
      selection('characters/hero-duplicate.png', 'sequence-frame', {
        groupId: 'hero-idle',
        destination: 'frame-001-linked.png',
      }),
      selection('UI/Icon.png', 'atlas-frame', {
        groupId: 'ui-icons',
        destination: 'icon-blue.png',
        repositoryTarget: 'assets/ui/icons/icon-blue.png',
      }),
      selection('ui/icon.png', 'atlas-frame', {
        groupId: 'ui-icons',
        destination: 'icon-yellow.png',
        repositoryTarget: 'assets/ui/icons/icon-yellow.png',
      }),
      selection('README.txt', 'reference'),
    ],
  };
  const decisionsPath = path.join(current.evidence, 'decisions.json');
  await writeFile(decisionsPath, stableJson(decisions), { flag: 'wx', mode: 0o600 });
  const plan = await compileRawArtSessionPlan({
    inventoryPath,
    decisionsPath,
    compiledAt: '2026-08-12T00:01:00.000Z',
  });
  const planPath = path.join(current.evidence, 'plan.json');
  await writeJsonCreateOnly(planPath, plan);
  return { inventory, inventoryPath, decisions, decisionsPath, plan, planPath };
}

test('RAW_ART scan, reviewed plan, materialisation and independent verification pass', async () => {
  const current = await fixture();
  try {
    const { inventory, plan, planPath } = await inventoryAndPlan(current);
    assert.equal(inventory.totals.files, 6);
    assert.equal(inventory.totals.images, 5);
    assert.equal(inventory.exactDuplicates.length, 1);
    assert.deepEqual(
      inventory.exactDuplicates[0].paths,
      ['characters/hero-duplicate.png', 'characters/hero-frame-001.png'],
    );
    assert.equal(inventory.sequenceCandidates.some((group) => group.paths.includes('characters/hero-frame-001.png')), true);
    assert.equal(inventory.atlasCandidates.some((group) => group.paths.includes('UI/Icon.png')), true);
    assert.equal(inventory.caseCollisions.length, 1);
    assert.equal(plan.operations.length, 6);
    assert.equal(plan.downstream.sequenceGroups.length, 1);
    assert.equal(plan.downstream.atlasGroups.length, 1);
    assert.equal(plan.downstream.repositoryDeliveryItems.length, 2);
    assert.equal(plan.downstream.sandboxCandidates.length, 1);
    const materialized = await materializeRawArtSession({ planPath });
    assert.equal(materialized.status, 'materialized');
    assert.equal(materialized.filesCopied, 6);
    const verified = await verifyRawArtSession({ sessionRoot: materialized.sessionRoot });
    assert.equal(verified.status, 'passed');
    assert.equal(verified.verifiedFiles, 8);
    const copied = await readFile(path.join(materialized.sessionRoot, 'working', 'characters', 'hero', 'idle-001.png'));
    assert.equal(digest(copied), inventory.files.find((entry) => entry.relativePath === 'characters/hero-frame-001.png').sha256);
  } finally {
    await rm(current.root, { recursive: true, force: true });
  }
});

test('source drift after inventory is rejected before session planning', async () => {
  const current = await fixture();
  try {
    const inventory = await scanRawArtFolder({ rawArtRoot: current.raw, generatedAt: '2026-08-12T00:00:00.000Z' });
    const inventoryPath = path.join(current.evidence, 'inventory.json');
    await writeJsonCreateOnly(inventoryPath, inventory);
    const source = inventory.files.find((entry) => entry.relativePath === 'characters/hero-frame-001.png');
    const decisionsPath = path.join(current.evidence, 'decisions.json');
    await writeFile(decisionsPath, stableJson({
      schema: DECISIONS_SCHEMA,
      sessionId: 'drift-test',
      inventorySha256: inventory.inventorySha256,
      workspaceParent: current.workspace,
      selections: [{
        relativePath: source.relativePath,
        expectedSha256: source.sha256,
        expectedBytes: source.bytes,
        action: 'working-copy',
      }],
    }));
    await writeFile(path.join(current.raw, source.relativePath), png(4, 4, [10, 20, 30, 255]));
    await assert.rejects(
      compileRawArtSessionPlan({ inventoryPath, decisionsPath }),
      (error) => error?.code === 'RAW_ART_SOURCE_DRIFT',
    );
  } finally {
    await rm(current.root, { recursive: true, force: true });
  }
});

test('workspace overlap, target collisions and symbolic RAW_ART entries fail closed', async () => {
  const current = await fixture();
  try {
    const inventory = await scanRawArtFolder({ rawArtRoot: current.raw, generatedAt: '2026-08-12T00:00:00.000Z' });
    const inventoryPath = path.join(current.evidence, 'inventory.json');
    await writeJsonCreateOnly(inventoryPath, inventory);
    const first = inventory.files.find((entry) => entry.relativePath === 'characters/hero-frame-001.png');
    const second = inventory.files.find((entry) => entry.relativePath === 'characters/hero-frame-002.png');
    const base = {
      schema: DECISIONS_SCHEMA,
      inventorySha256: inventory.inventorySha256,
    };
    const overlapPath = path.join(current.evidence, 'overlap.json');
    await writeFile(overlapPath, stableJson({
      ...base,
      sessionId: 'overlap',
      workspaceParent: current.raw,
      selections: [{ relativePath: first.relativePath, expectedSha256: first.sha256, expectedBytes: first.bytes, action: 'working-copy' }],
    }));
    await assert.rejects(
      compileRawArtSessionPlan({ inventoryPath, decisionsPath: overlapPath }),
      (error) => error?.code === 'RAW_ART_WORKSPACE_OVERLAP',
    );
    const collisionPath = path.join(current.evidence, 'collision.json');
    await writeFile(collisionPath, stableJson({
      ...base,
      sessionId: 'collision',
      workspaceParent: current.workspace,
      selections: [
        { relativePath: first.relativePath, expectedSha256: first.sha256, expectedBytes: first.bytes, action: 'working-copy', destination: 'same.png' },
        { relativePath: second.relativePath, expectedSha256: second.sha256, expectedBytes: second.bytes, action: 'working-copy', destination: 'SAME.png' },
      ],
    }));
    await assert.rejects(
      compileRawArtSessionPlan({ inventoryPath, decisionsPath: collisionPath }),
      (error) => error?.code === 'RAW_ART_TARGET_COLLISION',
    );
    await symlink(path.join(current.raw, 'README.txt'), path.join(current.raw, 'bad-link.txt'));
    await assert.rejects(
      scanRawArtFolder({ rawArtRoot: current.raw }),
      (error) => error?.code === 'RAW_ART_SYMLINK_FORBIDDEN',
    );
  } finally {
    await rm(current.root, { recursive: true, force: true });
  }
});

test('session verification rejects tampered or undeclared bytes', async () => {
  const current = await fixture();
  try {
    const { planPath } = await inventoryAndPlan(current);
    const materialized = await materializeRawArtSession({ planPath });
    await writeFile(path.join(materialized.sessionRoot, 'working', 'characters', 'hero', 'idle-001.png'), 'tampered');
    await assert.rejects(
      verifyRawArtSession({ sessionRoot: materialized.sessionRoot }),
      (error) => error?.code === 'RAW_ART_SESSION_FILE_MISMATCH',
    );
  } finally {
    await rm(current.root, { recursive: true, force: true });
  }
});

test('MCP exposes three read-only tools and six explicitly write-gated tools', async () => {
  const current = await fixture();
  try {
    const roots = [{ lexical: current.root, real: current.root }];
    const readOnly = { value: 'read-only', writesEnabled: false };
    const readWrite = { value: 'read-write', writesEnabled: true };
    assert.deepEqual(toolDefinitions(readOnly).map((tool) => tool.name), [
      'evavo_raw_art_folder_capabilities',
      'evavo_raw_art_folder_inspect',
      'evavo_raw_art_folder_verify_session',
    ]);
    assert.equal(toolDefinitions(readWrite).length, 6);
    const initialized = await handleRequest({
      jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' },
    }, { mode: readOnly, roots });
    assert.equal(initialized.result.serverInfo.name, 'evavo-raw-art-folder-workbench');
    const inspected = await callTool('evavo_raw_art_folder_inspect', {
      rawArtRoot: current.raw,
      sampleLimit: 2,
    }, { mode: readOnly, roots });
    assert.equal(inspected.summary.totals.files, 6);
    assert.equal(inspected.summary.sampleFiles.length, 2);
    await assert.rejects(
      callTool('evavo_raw_art_folder_write_inventory', {
        rawArtRoot: current.raw,
        outputPath: path.join(current.evidence, 'blocked.json'),
        confirmWrite: true,
      }, { mode: readOnly, roots }),
      /Unknown or prohibited/u,
    );
    await assert.rejects(
      callTool('evavo_raw_art_folder_write_inventory', {
        rawArtRoot: current.raw,
        outputPath: path.join(current.evidence, 'blocked.json'),
        confirmWrite: false,
      }, { mode: readWrite, roots }),
      /confirmWrite=true/u,
    );
  } finally {
    await rm(current.root, { recursive: true, force: true });
  }
});
