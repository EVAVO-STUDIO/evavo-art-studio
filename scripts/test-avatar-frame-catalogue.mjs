import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { stableJson, writeJsonCreateOnly } from './raw-art-folder/lib.mjs';
import { scanRawArtFolder } from './raw-art-folder/scan.mjs';
import {
  AVATAR_DECISIONS_SCHEMA,
  AVATAR_PLAN_SCHEMA,
  AVATAR_REVIEW_SCHEMA,
  buildAvatarFrameReviewPackets,
  compileAvatarFrameSequencePlan,
  compileAvatarFrameSequencePlanFromValues,
  verifyAvatarFrameReviewPackets,
  verifyAvatarFrameSequencePlan,
} from './avatar-frame-catalogue.mjs';

function pngHeader(width, height, colourType = 6) {
  const value = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(value, 0);
  value.writeUInt32BE(13, 8);
  value.write('IHDR', 12, 'ascii');
  value.writeUInt32BE(width, 16);
  value.writeUInt32BE(height, 20);
  value[24] = 8;
  value[25] = colourType;
  return value;
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-avatar-frame-'));
  const raw = path.join(root, 'assets', 'eva-female');
  const evidence = path.join(root, 'evidence');
  await mkdir(raw, { recursive: true });
  await mkdir(evidence, { recursive: true });
  await writeFile(path.join(raw, 'eva-chat-frame-001.png'), pngHeader(1024, 1024));
  await writeFile(path.join(raw, 'eva-chat-frame-002.png'), Buffer.concat([pngHeader(1024, 1024), Buffer.from('two')]));
  await writeFile(path.join(raw, 'eva-chat-frame-003.png'), Buffer.concat([pngHeader(1024, 1024), Buffer.from('three')]));
  await writeFile(path.join(raw, 'unassigned.png'), Buffer.concat([pngHeader(512, 512), Buffer.from('other')]));
  return { root, raw, evidence };
}

function decisionsFor(inventory, overrides = {}) {
  const byPath = new Map(inventory.files.map((file) => [file.relativePath, file]));
  const frame = (relativePath, hold = 1) => ({
    relativePath,
    expectedSha256: byPath.get(relativePath).sha256,
    hold,
  });
  return {
    schema: AVATAR_DECISIONS_SCHEMA,
    characterId: 'eva-female',
    sequenceSetId: 'eva-chat-reviewed-v1',
    inventorySha256: inventory.inventorySha256,
    repositoryTargetPrefix: 'assets/avatar-runtime',
    storageLogicalPathPrefix: 'avatars/eva-female',
    sequences: [{
      sequenceId: 'idle',
      loopMode: 'loop',
      fps: 10,
      allowVariableCanvas: false,
      allowDuplicateBytes: false,
      frames: [
        frame('eva-chat-frame-001.png', 2),
        frame('eva-chat-frame-002.png', 1),
        frame('eva-chat-frame-003.png', 2),
      ],
    }],
    ...overrides,
  };
}

test('review packets preserve numeric candidate order but refuse semantic authority', async () => {
  const current = await fixture();
  try {
    const inventory = await scanRawArtFolder({ rawArtRoot: current.raw, generatedAt: '2026-08-12T00:00:00.000Z' });
    const review = buildAvatarFrameReviewPackets(inventory, { characterId: 'eva-female', packetSize: 2, generatedAt: '2026-08-12T00:01:00.000Z' });
    assert.equal(review.schema, AVATAR_REVIEW_SCHEMA);
    assert.equal(review.totals.images, 4);
    assert.equal(review.semanticPolicy.filenameOrderIsMeaning, false);
    assert.equal(review.semanticPolicy.timestampOrderIsMeaning, false);
    assert.equal(review.semanticPolicy.semanticLabelsRequireExplicitReview, true);
    assert.equal(review.packets[0].orderAuthoritative, false);
    assert.equal(review.packets[0].semanticLabel, null);
    assert.deepEqual(review.packets[0].frames.map((frame) => frame.sequenceHint.index), [1, 2]);
    assert.equal(verifyAvatarFrameReviewPackets(review), review);
  } finally {
    await rm(current.root, { recursive: true, force: true });
  }
});

test('explicit reviewed sequence plan derives deterministic targets and timing', async () => {
  const current = await fixture();
  try {
    const inventory = await scanRawArtFolder({ rawArtRoot: current.raw, generatedAt: '2026-08-12T00:00:00.000Z' });
    const inventoryPath = path.join(current.evidence, 'inventory.json');
    const decisionsPath = path.join(current.evidence, 'decisions.json');
    await writeJsonCreateOnly(inventoryPath, inventory);
    await writeFile(decisionsPath, stableJson(decisionsFor(inventory)), { flag: 'wx', mode: 0o600 });
    const plan = await compileAvatarFrameSequencePlan({ inventoryPath, decisionsPath, compiledAt: '2026-08-12T00:02:00.000Z' });
    assert.equal(plan.schema, AVATAR_PLAN_SCHEMA);
    assert.equal(plan.sequences.length, 1);
    assert.equal(plan.sequences[0].frameCount, 3);
    assert.equal(plan.sequences[0].playbackTicks, 5);
    assert.equal(plan.sequences[0].durationMs, 500);
    assert.equal(plan.sequences[0].sourceOrderAuthority, 'explicit-owner-reviewed-order');
    assert.equal(plan.sequences[0].semanticInferenceFromFilename, false);
    assert.equal(plan.sequences[0].frames[0].destination, 'characters/eva-female/sequences/idle/frame-0001.png');
    assert.equal(plan.sequences[0].frames[0].repositoryTarget, 'assets/avatar-runtime/characters/eva-female/sequences/idle/frame-0001.png');
    assert.equal(plan.sequences[0].frames[0].storageLogicalPath, 'avatars/eva-female/characters/eva-female/sequences/idle/frame-0001.png');
    assert.equal(plan.downstream.normalNonForcePublicationOnly, true);
    assert.equal(plan.authority.storageWrite, false);
    assert.equal(plan.authority.gitPush, false);
    assert.equal(plan.authority.forcePush, false);
    assert.equal(verifyAvatarFrameSequencePlan(plan), plan);
  } finally {
    await rm(current.root, { recursive: true, force: true });
  }
});

test('stale hashes, repeated paths and canvas drift fail closed', async () => {
  const current = await fixture();
  try {
    const inventory = await scanRawArtFolder({ rawArtRoot: current.raw, generatedAt: '2026-08-12T00:00:00.000Z' });
    const stale = decisionsFor(inventory);
    stale.sequences[0].frames[1].expectedSha256 = '0'.repeat(64);
    assert.throws(() => compileAvatarFrameSequencePlanFromValues(inventory, stale, { compiledAt: '2026-08-12T00:02:00.000Z' }), (error) => error?.code === 'AVATAR_FRAME_SOURCE_DRIFT');

    const repeated = decisionsFor(inventory);
    repeated.sequences[0].frames[2] = { ...repeated.sequences[0].frames[0] };
    assert.throws(() => compileAvatarFrameSequencePlanFromValues(inventory, repeated, { compiledAt: '2026-08-12T00:02:00.000Z' }), (error) => error?.code === 'AVATAR_FRAME_PATH_REPEATED');

    const byPath = new Map(inventory.files.map((file) => [file.relativePath, file]));
    const drift = decisionsFor(inventory);
    drift.sequences[0].frames[2] = {
      relativePath: 'unassigned.png',
      expectedSha256: byPath.get('unassigned.png').sha256,
      hold: 1,
    };
    assert.throws(() => compileAvatarFrameSequencePlanFromValues(inventory, drift, { compiledAt: '2026-08-12T00:02:00.000Z' }), (error) => error?.code === 'AVATAR_FRAME_CANVAS_DRIFT');
  } finally {
    await rm(current.root, { recursive: true, force: true });
  }
});

test('authority escalation and plan tampering are rejected', async () => {
  const current = await fixture();
  try {
    const inventory = await scanRawArtFolder({ rawArtRoot: current.raw, generatedAt: '2026-08-12T00:00:00.000Z' });
    const plan = compileAvatarFrameSequencePlanFromValues(inventory, decisionsFor(inventory), { compiledAt: '2026-08-12T00:02:00.000Z' });
    const tampered = JSON.parse(JSON.stringify(plan));
    tampered.authority.gitPush = true;
    assert.throws(() => verifyAvatarFrameSequencePlan(tampered), (error) => ['AVATAR_FRAME_PLAN_HASH_MISMATCH', 'AVATAR_FRAME_AUTHORITY_ESCALATION'].includes(error?.code));
    const semantic = JSON.parse(JSON.stringify(plan));
    semantic.sequences[0].semanticInferenceFromFilename = true;
    assert.throws(() => verifyAvatarFrameSequencePlan(semantic), (error) => error?.code === 'AVATAR_FRAME_PLAN_HASH_MISMATCH');
  } finally {
    await rm(current.root, { recursive: true, force: true });
  }
});
