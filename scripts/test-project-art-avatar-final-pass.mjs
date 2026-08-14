#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { deflateSync } from 'node:zlib';

import {
  AVATAR_FINAL_PASS_REQUEST_SCHEMA,
  ProjectArtAvatarFinalPassError,
  canonicalAvatarFinalPassJson,
  compileProjectArtAvatarFinalPass,
  compileProjectArtAvatarFinalPassFile,
  createAvatarFinalPassAuthority,
  sha256AvatarFinalPassDocument,
} from './project-art/avatar-final-pass.mjs';

const SOURCE_REF = '1'.repeat(40);

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBytes.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return output;
}

function png(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = 0;
    for (let x = 0; x < width; x += 1) {
      Buffer.from(rgba(x, y)).copy(row, 1 + x * 4);
    }
    rows.push(row);
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'evavo-avatar-final-pass-'));
  mkdirSync(path.join(root, 'frames'), { recursive: true });
  const frameBytes = [
    png(2, 2, (x, y) => [40 + x * 20, 80 + y * 20, 120, 255]),
    png(2, 2, (x, y) => [60 + x * 10, 100 + y * 10, 150, 255]),
    png(2, 2, (x, y) => [80 + x * 10, 60 + y * 10, 130, 255]),
    png(2, 2, (x, y) => [100 + x * 10, 70 + y * 10, 110, 255]),
  ];
  const names = ['idle-a', 'idle-b', 'talk-a', 'talk-b'];
  const manifestFrames = names.map((name, index) => {
    const relative = `frames/${name}.png`;
    writeFileSync(path.join(root, relative), frameBytes[index]);
    return {
      sourcePath: `assets/eva-female/source-${name}.png`,
      materializedPath: relative,
      sha256: sha256(frameBytes[index]),
      sizeBytes: frameBytes[index].length,
      media: { width: 2, height: 2, alpha: true },
      sourceBatchId: `batch-${index + 1}`,
      ordinal: index + 1,
    };
  });
  const manifestBody = {
    schema: 'evavo.avatar.art-materialization-manifest.v1',
    repository: 'EVAVO-STUDIO/evavo-avatar-runtime',
    sourceRef: SOURCE_REF,
    characterId: 'eva-female',
    sourceRoot: 'assets/eva-female',
    semanticStatus: 'unreviewed',
    semanticAssignmentPerformed: false,
    timestampOrderUsedAsMeaning: false,
    generationOrderUsedAsMeaning: false,
    frameCount: manifestFrames.length,
    totalBytes: manifestFrames.reduce((sum, frame) => sum + frame.sizeBytes, 0),
    frames: manifestFrames,
    excludedSourceFiles: [],
    transport: {
      kind: 'local-authenticated-workstation',
      retentionDays: 1,
      compressionLevel: 0,
      sourceBytesEmbeddedInManifest: false,
    },
    publication: {
      binaryBlobApiSupported: true,
      managedPathPublicationRequired: true,
      forcePushAllowed: false,
    },
    authority: createAvatarFinalPassAuthority(),
  };
  const manifest = {
    ...manifestBody,
    manifestSha256: sha256AvatarFinalPassDocument(manifestBody),
  };
  writeJson(path.join(root, 'manifest.json'), manifest);
  const request = {
    schema: AVATAR_FINAL_PASS_REQUEST_SCHEMA,
    sessionId: 'eva-final-pass-v1',
    characterId: 'eva-female',
    sourceCommit: SOURCE_REF,
    materializationManifestPath: 'manifest.json',
    materializationManifestSha256: manifest.manifestSha256,
    assignmentMode: 'owner-declared-only',
    semanticInferencePerformed: false,
    timestampOrderingUsedAsSemantics: false,
    generationOrderingUsedAsSemantics: false,
    canvas: { width: 2, height: 2 },
    frames: [
      {
        frameId: 'idle-a',
        materializedPath: 'frames/idle-a.png',
        expectedSha256: manifestFrames[0].sha256,
        targetPath: 'assets/eva-female/reviewed/idle-a.png',
        disposition: 'accept',
        issues: [],
        repairOperations: [],
        reviewNotes: 'Clean identity anchor.',
      },
      {
        frameId: 'idle-b',
        materializedPath: 'frames/idle-b.png',
        expectedSha256: manifestFrames[1].sha256,
        targetPath: 'assets/eva-female/reviewed/idle-b.png',
        disposition: 'deterministic-repair',
        issues: ['edge-halo'],
        repairOperations: ['edge-decontaminate', 'defringe'],
        reviewNotes: 'Remove the light fringe without changing the character.',
      },
      {
        frameId: 'talk-a',
        materializedPath: 'frames/talk-a.png',
        expectedSha256: manifestFrames[2].sha256,
        targetPath: 'assets/eva-female/reviewed/talk-a.png',
        disposition: 'provider-redraw',
        issues: ['hands', 'fingers'],
        repairOperations: [],
        reviewNotes: 'Preserve pose and identity; rebuild only the malformed hand.',
      },
      {
        frameId: 'talk-b',
        materializedPath: 'frames/talk-b.png',
        expectedSha256: manifestFrames[3].sha256,
        targetPath: 'assets/eva-female/reviewed/talk-b.png',
        disposition: 'accept',
        issues: [],
        repairOperations: [],
        reviewNotes: 'Clean talk extreme.',
      },
    ],
    inbetweens: [
      {
        frameId: 'idle-mid',
        beforeFrameId: 'idle-a',
        afterFrameId: 'idle-b',
        targetPath: 'assets/eva-female/reviewed/idle-mid.png',
        method: 'provider-generated',
        durationMs: 80,
        constraints: ['hands', 'anatomy', 'face-identity', 'style'],
      },
    ],
    sequences: [
      {
        id: 'idle-main',
        kind: 'idle',
        loopMode: 'loop',
        frames: [
          { frameId: 'idle-a', durationMs: 120 },
          { frameId: 'idle-mid', durationMs: 80 },
          { frameId: 'idle-b', durationMs: 120 },
          { frameId: 'idle-mid', durationMs: 80 },
        ],
        neutralFrameId: 'idle-a',
        emotion: null,
        loopThresholds: {
          maximumChangedFraction: 0.2,
          maximumMeanChannelDelta: 24,
          maximumAlphaChangedFraction: 0.1,
          maximumCentroidShiftPixels: 8,
        },
      },
      {
        id: 'talk-main',
        kind: 'talk-loop',
        loopMode: 'loop',
        frames: [
          { frameId: 'talk-a', durationMs: 80 },
          { frameId: 'talk-b', durationMs: 80 },
        ],
        neutralFrameId: 'talk-a',
        emotion: null,
        loopThresholds: {
          maximumChangedFraction: 0.35,
          maximumMeanChannelDelta: 32,
          maximumAlphaChangedFraction: 0.15,
          maximumCentroidShiftPixels: 12,
        },
      },
    ],
    qualityGates: {
      maximumCentroidShiftPixels: 20,
      maximumChangedFraction: 0.5,
      maximumMeanChannelDelta: 64,
      maximumAlphaChangedFraction: 0.25,
      minimumFrameDurationMs: 40,
      maximumFrameDurationMs: 500,
      requireHandsReview: true,
      requireFaceIdentityReview: true,
      requireLoopClosureForLoops: true,
    },
    authority: { ...createAvatarFinalPassAuthority() },
  };
  return { root, manifest, manifestFrames, request };
}

function compile(f) {
  const requestBytes = Buffer.from(`${JSON.stringify(f.request, null, 2)}\n`, 'utf8');
  return compileProjectArtAvatarFinalPass({
    workspaceRoot: f.root,
    request: f.request,
    requestBytes,
    compiledAt: '2026-08-12T12:00:00.000Z',
  });
}

test('compiles explicit final-art, repair, in-between, timing and release handoffs', () => {
  const f = fixture();
  try {
    const plan = compile(f);
    assert.equal(plan.productionReady, false);
    assert.equal(plan.runtimeActivationAllowed, false);
    assert.equal(plan.qualityJobs.length, 4);
    assert.equal(plan.qualityJobs[0].automatedAssurance.minimumIndependentInspectors, 2);
    assert.equal(plan.qualityJobs[0].automatedAssurance.uncertainDisposition, 'quarantine');
    assert.equal(plan.repairJobs.length, 2);
    assert.equal(plan.inbetweenJobs.length, 1);
    assert.equal(plan.sequenceTimeline.length, 2);
    assert.equal(plan.sequenceMasteringRequestTemplate.requiresOutputHashesBeforeCompile, true);
    assert.equal(plan.atlasRequestTemplate.wholeRunAtomicPublication, true);
    assert.ok(plan.blockers.includes('provider-redraw-review-required'));
    assert.ok(plan.blockers.includes('inbetween-review-required'));
    assert.ok(plan.blockers.includes('automated-frame-assurance-required'));
    assert.match(plan.planSha256, /^[a-f0-9]{64}$/u);
    assert.ok(Object.values(plan.authority).every((value) => value === false));
    assert.equal(plan.materialization.sourceBytesEmbeddedInPlan, false);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('rejects semantic inference and false authority', () => {
  for (const mutate of [
    (request) => {
      request.semanticInferencePerformed = true;
    },
    (request) => {
      request.authority.providerExecution = true;
    },
  ]) {
    const f = fixture();
    try {
      mutate(f.request);
      assert.throws(
        () => compile(f),
        (error) => error instanceof ProjectArtAvatarFinalPassError,
      );
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});

test('accept disposition cannot hide unresolved hands or anatomy defects', () => {
  const f = fixture();
  try {
    f.request.frames[0].issues = ['hands'];
    assert.throws(
      () => compile(f),
      (error) => error.code === 'PROJECT_ART_AVATAR_FINAL_PASS_ACCEPT_NOT_CLEAN',
    );
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('rejects changed source bytes and manifest substitutions', () => {
  const f = fixture();
  try {
    writeFileSync(path.join(f.root, 'frames/idle-a.png'), Buffer.from('changed'));
    assert.throws(
      () => compile(f),
      (error) =>
        error.code === 'PROJECT_ART_AVATAR_FINAL_PASS_SOURCE_SIZE_INVALID' ||
        error.code === 'PROJECT_ART_AVATAR_FINAL_PASS_FRAME_SOURCE_HASH_MISMATCH',
    );
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }

  const g = fixture();
  try {
    g.request.materializationManifestSha256 = 'f'.repeat(64);
    assert.throws(
      () => compile(g),
      (error) => error.code === 'PROJECT_ART_AVATAR_FINAL_PASS_MANIFEST_HASH_MISMATCH',
    );
  } finally {
    rmSync(g.root, { recursive: true, force: true });
  }
});

test('once and ping-pong clips cannot receive false loop thresholds', () => {
  const f = fixture();
  try {
    f.request.sequences[0].loopMode = 'once';
    assert.throws(
      () => compile(f),
      (error) => error.code === 'PROJECT_ART_AVATAR_FINAL_PASS_FALSE_LOOP_THRESHOLD_FORBIDDEN',
    );
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('excluded frames cannot remain in a sequence timeline', () => {
  const f = fixture();
  try {
    f.request.frames[3].disposition = 'exclude';
    f.request.frames[3].issues = ['artefact'];
    assert.throws(
      () => compile(f),
      (error) => error.code === 'PROJECT_ART_AVATAR_FINAL_PASS_EXCLUDED_FRAME_REFERENCED',
    );
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('request bytes are exact and output publication is create-only', () => {
  const f = fixture();
  try {
    const requestPath = path.join(f.root, 'request.json');
    const outputPath = path.join(f.root, 'plan.json');
    writeJson(requestPath, f.request);
    const plan = compileProjectArtAvatarFinalPassFile({
      workspaceRoot: f.root,
      requestPath,
      outputPath,
      compiledAt: '2026-08-12T12:00:00.000Z',
    });
    assert.equal(JSON.parse(readFileSync(outputPath, 'utf8')).planSha256, plan.planSha256);
    assert.throws(
      () =>
        compileProjectArtAvatarFinalPassFile({
          workspaceRoot: f.root,
          requestPath,
          outputPath,
          compiledAt: '2026-08-12T12:00:00.000Z',
        }),
      (error) => error.code === 'EEXIST',
    );

    const requestBytes = Buffer.from(`${JSON.stringify(f.request)}\n`, 'utf8');
    const changed = structuredClone(f.request);
    changed.sessionId = 'different-session';
    assert.throws(
      () =>
        compileProjectArtAvatarFinalPass({
          workspaceRoot: f.root,
          request: changed,
          requestBytes,
          compiledAt: '2026-08-12T12:00:00.000Z',
        }),
      (error) => error.code === 'PROJECT_ART_AVATAR_FINAL_PASS_REQUEST_BYTES_MISMATCH',
    );
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('canonical document hashing is stable across key order', () => {
  const a = { z: 1, a: { y: true, x: ['eva', null] } };
  const b = { a: { x: ['eva', null], y: true }, z: 1 };
  assert.equal(canonicalAvatarFinalPassJson(a), canonicalAvatarFinalPassJson(b));
  assert.equal(sha256AvatarFinalPassDocument(a), sha256AvatarFinalPassDocument(b));
});

console.log('Project Art avatar final-pass regressions passed.');
