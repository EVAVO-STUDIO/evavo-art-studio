#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  access,
  link,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

import {
  AVATAR_SEQUENCE_PACK_TARGET_SCHEMA,
  PROJECT_ART_AVATAR_SEQUENCE_PLAN_SCHEMA,
  PROJECT_ART_AVATAR_SEQUENCE_REQUEST_SCHEMA,
  PROJECT_ART_LOOP_CLOSURE_REQUEST_SCHEMA,
  ProjectArtAvatarSequenceError,
  compileProjectArtAvatarSequence,
  compileProjectArtAvatarSequenceFile,
} from './compile-project-art-avatar-sequence.mjs';

const FIXED_TIME = '2026-08-11T06:30:00.000Z';
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

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
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  typeBytes.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return result;
}

function png(width, height, rgba, { colourType = 6 } = {}) {
  const channels = colourType === 6 ? 4 : 3;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colourType;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * channels);
    row[0] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = 1 + x * channels;
      row[offset] = rgba[0];
      row[offset + 1] = rgba[1];
      row[offset + 2] = rgba[2];
      if (channels === 4) row[offset + 3] = rgba[3];
    }
    rows.push(row);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function authority() {
  return {
    providerExecution: false,
    sourceMutation: false,
    sourceDeletion: false,
    candidateApproval: false,
    candidatePromotion: false,
    targetRepositoryMutation: false,
    gitCommit: false,
    gitPush: false,
    publication: false,
    deployment: false,
    forcePush: false,
  };
}

function thresholds() {
  return {
    maximumChangedFraction: 0.2,
    maximumMeanChannelDelta: 32,
    maximumAlphaChangedFraction: 0.15,
    maximumCentroidShiftPixels: 20,
  };
}

async function fixture({ reviewedInPlace = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-avatar-sequence-'));
  const rawRoot = path.join(root, reviewedInPlace ? 'assets/eva-female/reviewed' : 'raw');
  await mkdir(rawRoot, { recursive: true });
  const definitions = [
    ['idle-a', [10, 20, 30, 255]],
    ['idle-b', [11, 20, 30, 255]],
    ['talk-a', [20, 30, 40, 255]],
    ['talk-b', [21, 30, 40, 255]],
    ['listen-a', [30, 40, 50, 255]],
    ['listen-b', [31, 40, 50, 255]],
    ['wave-a', [40, 50, 60, 255]],
    ['dance-a', [50, 60, 70, 255]],
  ];
  const frames = [];
  for (const [id, rgba] of definitions) {
    const bytes = png(2, 2, rgba);
    const sourcePath = reviewedInPlace
      ? `assets/eva-female/reviewed/${id}.png`
      : `raw/ChatGPT Image Aug 9 2026 ${id}.png`;
    await writeFile(path.join(root, ...sourcePath.split('/')), bytes);
    frames.push({
      id,
      sourcePath,
      targetPath: `assets/eva-female/reviewed/${id}.png`,
      expectedSha256: sha256(bytes),
    });
  }
  const clip = (id, kind, loopMode, frameIds, loopThresholds = null) => ({
    id,
    kind,
    loopMode,
    frames: frameIds.map((frameId) => ({ frameId, durationMs: 80 })),
    neutralFrameId: frameIds[0],
    emotion: null,
    loopThresholds,
  });
  const request = {
    schema: PROJECT_ART_AVATAR_SEQUENCE_REQUEST_SCHEMA,
    assignmentId: 'eva-chat-owner-assignment-v1',
    characterId: 'eva-female',
    revision: 1,
    purpose:
      'Compile owner-declared EVA chat clips over exact existing PNG frames without inferring meaning from source filenames or timestamps.',
    assignmentMode: 'owner-declared-only',
    semanticInferencePerformed: false,
    timestampOrderingUsedAsSemantics: false,
    canvas: { width: 2, height: 2, requireAlpha: true },
    frames,
    clips: [
      clip('idle-main', 'idle', 'loop', ['idle-a', 'idle-b'], thresholds()),
      clip('talk-enter', 'talk-in', 'once', ['idle-a', 'talk-a']),
      clip('talk-main', 'talk-loop', 'loop', ['talk-a', 'talk-b'], thresholds()),
      clip('talk-exit', 'talk-out', 'once', ['talk-b', 'idle-a']),
      clip('listen-main', 'listening', 'loop', ['listen-a', 'listen-b'], thresholds()),
      clip('wave-main', 'wave', 'once', ['idle-a', 'wave-a', 'idle-a']),
      clip('dance-main', 'dance', 'ping-pong', ['idle-a', 'dance-a']),
    ],
    defaults: {
      idleClipId: 'idle-main',
      talk: {
        inClipId: 'talk-enter',
        loopClipId: 'talk-main',
        outClipId: 'talk-exit',
      },
      presence: {
        idle: 'idle-main',
        attention: 'idle-main',
        listening: 'listen-main',
        thinking: 'idle-main',
        pleased: 'idle-main',
        concerned: 'idle-main',
        error: 'idle-main',
        sleeping: 'idle-main',
      },
      events: {
        wave: 'wave-main',
        dance: 'dance-main',
      },
      emotions: {},
    },
    authority: authority(),
  };
  return { root, request };
}

function requestBytes(request) {
  return Buffer.from(`${JSON.stringify(request, null, 2)}\n`, 'utf8');
}

async function rejectsCode(action, code) {
  await assert.rejects(action, (error) => {
    assert.ok(error instanceof ProjectArtAvatarSequenceError, String(error));
    assert.equal(error.code, code);
    return true;
  });
}

const cleanups = [];
try {
  {
    const f = await fixture();
    cleanups.push(f.root);
    const plan = await compileProjectArtAvatarSequence({
      workspaceRoot: f.root,
      request: f.request,
      requestBytes: requestBytes(f.request),
      compiledAt: FIXED_TIME,
    });
    const repeated = await compileProjectArtAvatarSequence({
      workspaceRoot: f.root,
      request: structuredClone(f.request),
      requestBytes: requestBytes(f.request),
      compiledAt: FIXED_TIME,
    });
    assert.deepEqual(repeated, plan);
    assert.equal(plan.schema, PROJECT_ART_AVATAR_SEQUENCE_PLAN_SCHEMA);
    assert.equal(plan.runtimeDraft.targetSchema, AVATAR_SEQUENCE_PACK_TARGET_SCHEMA);
    assert.equal(plan.assignment.semanticInferencePerformed, false);
    assert.equal(plan.assignment.timestampOrderingUsedAsSemantics, false);
    assert.equal(plan.workspaceFilePlanRequest.operations.length, f.request.frames.length);
    assert.equal(plan.runtimeDraft.review, null);
    assert.equal(plan.runtimeDraft.loopClosures.length, 0);
    assert.equal(plan.finalizationRequirements.runtimeActivationAllowed, false);
    assert.deepEqual(
      plan.finalizationRequirements.requiredApprovalDisciplines,
      ['art', 'animation', 'runtime'],
    );
    assert.equal(plan.loopClosureRequests.length, 3);
    assert.deepEqual(
      plan.loopClosureRequests.map((entry) => entry.clipId),
      ['idle-main', 'talk-main', 'listen-main'],
    );
    assert.ok(
      plan.loopClosureRequests.every(
        (entry) =>
          entry.request.schema === PROJECT_ART_LOOP_CLOSURE_REQUEST_SCHEMA &&
          entry.request.seam === undefined &&
          entry.request.frames.length === 2,
      ),
    );
    assert.ok(
      plan.runtimeDraft.frames.every(
        (frame) =>
          frame.path.startsWith('assets/eva-female/reviewed/') &&
          !frame.path.includes('ChatGPT Image'),
      ),
    );
    assert.ok(Object.values(plan.authority).every((value) => value === false));
    assert.ok(Object.values(plan.effects).every((value) => value === false));
    for (const frame of f.request.frames) {
      await assert.rejects(
        access(path.join(f.root, ...frame.targetPath.split('/'))),
      );
    }
  }

  {
    const f = await fixture({ reviewedInPlace: true });
    cleanups.push(f.root);
    const plan = await compileProjectArtAvatarSequence({
      workspaceRoot: f.root,
      request: f.request,
      requestBytes: requestBytes(f.request),
      compiledAt: FIXED_TIME,
    });
    assert.equal(plan.workspaceFilePlanRequest.operations.length, 0);
    assert.equal(
      plan.finalizationRequirements.workspaceFilePlanApplicationRequired,
      false,
    );
    assert.ok(plan.sources.every((entry) => entry.alreadyReviewedAtTarget));
    assert.deepEqual(
      plan.loopClosureRequests[0].request.frames.map((entry) => entry.path),
      [
        'assets/eva-female/reviewed/idle-a.png',
        'assets/eva-female/reviewed/idle-b.png',
      ],
    );
  }

  {
    const f = await fixture();
    cleanups.push(f.root);
    const changed = structuredClone(f.request);
    changed.purpose = `${changed.purpose} changed`;
    await rejectsCode(
      () =>
        compileProjectArtAvatarSequence({
          workspaceRoot: f.root,
          request: changed,
          requestBytes: requestBytes(f.request),
          compiledAt: FIXED_TIME,
        }),
      'PROJECT_ART_AVATAR_SEQUENCE_REQUEST_BYTES_MISMATCH',
    );
  }

  {
    const f = await fixture();
    cleanups.push(f.root);
    f.request.semanticInferencePerformed = true;
    await rejectsCode(
      () =>
        compileProjectArtAvatarSequence({
          workspaceRoot: f.root,
          request: f.request,
          requestBytes: requestBytes(f.request),
          compiledAt: FIXED_TIME,
        }),
      'PROJECT_ART_AVATAR_SEQUENCE_EXPLICIT_ASSIGNMENT_REQUIRED',
    );
  }

  {
    const f = await fixture();
    cleanups.push(f.root);
    f.request.frames[0].expectedSha256 = '0'.repeat(64);
    await rejectsCode(
      () =>
        compileProjectArtAvatarSequence({
          workspaceRoot: f.root,
          request: f.request,
          requestBytes: requestBytes(f.request),
          compiledAt: FIXED_TIME,
        }),
      'PROJECT_ART_AVATAR_SEQUENCE_SOURCE_HASH_MISMATCH',
    );
  }

  {
    const f = await fixture();
    cleanups.push(f.root);
    const first = path.join(f.root, ...f.request.frames[0].sourcePath.split('/'));
    const second = path.join(f.root, ...f.request.frames[1].sourcePath.split('/'));
    await writeFile(second, await readFile(first));
    f.request.frames[1].expectedSha256 = f.request.frames[0].expectedSha256;
    await rejectsCode(
      () =>
        compileProjectArtAvatarSequence({
          workspaceRoot: f.root,
          request: f.request,
          requestBytes: requestBytes(f.request),
          compiledAt: FIXED_TIME,
        }),
      'PROJECT_ART_AVATAR_SEQUENCE_FRAME_BYTES_DUPLICATE',
    );
  }

  {
    const f = await fixture();
    cleanups.push(f.root);
    f.request.frames[0].targetPath =
      'assets/eva-female/raw/ChatGPT Image idle-a.png';
    await rejectsCode(
      () =>
        compileProjectArtAvatarSequence({
          workspaceRoot: f.root,
          request: f.request,
          requestBytes: requestBytes(f.request),
          compiledAt: FIXED_TIME,
        }),
      'PROJECT_ART_AVATAR_SEQUENCE_TARGET_PATH_INVALID',
    );
  }

  {
    const f = await fixture();
    cleanups.push(f.root);
    f.request.clips[0].frames[1].frameId = 'idle-a';
    await rejectsCode(
      () =>
        compileProjectArtAvatarSequence({
          workspaceRoot: f.root,
          request: f.request,
          requestBytes: requestBytes(f.request),
          compiledAt: FIXED_TIME,
        }),
      'PROJECT_ART_AVATAR_SEQUENCE_LOOP_FRAME_DUPLICATE',
    );
  }

  {
    const f = await fixture();
    cleanups.push(f.root);
    f.request.clips.find((clip) => clip.id === 'wave-main').loopThresholds =
      thresholds();
    await rejectsCode(
      () =>
        compileProjectArtAvatarSequence({
          workspaceRoot: f.root,
          request: f.request,
          requestBytes: requestBytes(f.request),
          compiledAt: FIXED_TIME,
        }),
      'PROJECT_ART_AVATAR_SEQUENCE_FALSE_WRAP_REQUIREMENT',
    );
  }

  {
    const f = await fixture();
    cleanups.push(f.root);
    f.request.authority.targetRepositoryMutation = true;
    await rejectsCode(
      () =>
        compileProjectArtAvatarSequence({
          workspaceRoot: f.root,
          request: f.request,
          requestBytes: requestBytes(f.request),
          compiledAt: FIXED_TIME,
        }),
      'PROJECT_ART_AVATAR_SEQUENCE_AUTHORITY_INVALID',
    );
  }

  {
    const f = await fixture();
    cleanups.push(f.root);
    const rgb = png(2, 2, [10, 20, 30, 255], { colourType: 2 });
    const source = path.join(f.root, ...f.request.frames[0].sourcePath.split('/'));
    await writeFile(source, rgb);
    f.request.frames[0].expectedSha256 = sha256(rgb);
    await rejectsCode(
      () =>
        compileProjectArtAvatarSequence({
          workspaceRoot: f.root,
          request: f.request,
          requestBytes: requestBytes(f.request),
          compiledAt: FIXED_TIME,
        }),
      'PROJECT_ART_AVATAR_SEQUENCE_PNG_INVALID',
    );
  }

  {
    const f = await fixture();
    cleanups.push(f.root);
    const changed = png(3, 2, [10, 20, 30, 255]);
    const source = path.join(f.root, ...f.request.frames[0].sourcePath.split('/'));
    await writeFile(source, changed);
    f.request.frames[0].expectedSha256 = sha256(changed);
    await rejectsCode(
      () =>
        compileProjectArtAvatarSequence({
          workspaceRoot: f.root,
          request: f.request,
          requestBytes: requestBytes(f.request),
          compiledAt: FIXED_TIME,
        }),
      'PROJECT_ART_AVATAR_SEQUENCE_DIMENSION_MISMATCH',
    );
  }

  if (process.platform !== 'win32') {
    {
      const f = await fixture();
      cleanups.push(f.root);
      const linked = path.join(f.root, 'linked-raw');
      await symlink(path.join(f.root, 'raw'), linked, 'dir');
      f.request.frames[0].sourcePath =
        `linked-raw/${path.posix.basename(f.request.frames[0].sourcePath)}`;
      await rejectsCode(
        () =>
          compileProjectArtAvatarSequence({
            workspaceRoot: f.root,
            request: f.request,
            requestBytes: requestBytes(f.request),
            compiledAt: FIXED_TIME,
          }),
        'PROJECT_ART_AVATAR_SEQUENCE_PATH_SYMLINK',
      );
    }
    {
      const f = await fixture();
      cleanups.push(f.root);
      const original = path.join(
        f.root,
        ...f.request.frames[0].sourcePath.split('/'),
      );
      const linked = path.join(f.root, 'raw', 'hard-linked.png');
      await link(original, linked);
      f.request.frames[0].sourcePath = 'raw/hard-linked.png';
      await rejectsCode(
        () =>
          compileProjectArtAvatarSequence({
            workspaceRoot: f.root,
            request: f.request,
            requestBytes: requestBytes(f.request),
            compiledAt: FIXED_TIME,
          }),
        'PROJECT_ART_AVATAR_SEQUENCE_FILE_UNSAFE',
      );
    }
  }

  {
    const f = await fixture();
    cleanups.push(f.root);
    const requestPath = path.join(f.root, 'assignment.json');
    const outputPath = path.join(f.root, 'mastering-plan.json');
    await writeFile(requestPath, requestBytes(f.request));
    const plan = await compileProjectArtAvatarSequenceFile(
      requestPath,
      outputPath,
      { workspaceRoot: f.root, compiledAt: FIXED_TIME },
    );
    assert.equal(plan.schema, PROJECT_ART_AVATAR_SEQUENCE_PLAN_SCHEMA);
    const saved = JSON.parse(await readFile(outputPath, 'utf8'));
    assert.equal(saved.documentSha256, plan.documentSha256);
    await rejectsCode(
      () =>
        compileProjectArtAvatarSequenceFile(requestPath, outputPath, {
          workspaceRoot: f.root,
          compiledAt: FIXED_TIME,
        }),
      'PROJECT_ART_AVATAR_SEQUENCE_TARGET_EXISTS',
    );
  }

  console.log('Project Art avatar-sequence mastering tests passed.');
  console.log('- explicit owner assignment remains the only semantic authority');
  console.log('- raw and timestamp-named source paths never enter the runtime draft');
  console.log('- exact source bytes, alpha canvas, durations and reviewed target paths are bound');
  console.log('- true loops emit one exact downstream seam request; once and ping-pong do not');
  console.log('- workspace copy requests are path-only, content-addressed and create-only downstream');
  console.log('- no source image, provider, repository, Git, deployment or publication mutation occurred');
} finally {
  await Promise.all(cleanups.map((entry) => rm(entry, { recursive: true, force: true })));
}
