#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  access,
  link,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

import { compileProjectArtAvatarSequenceFile } from './compile-project-art-avatar-sequence.mjs';
import {
  materializeProjectArtAvatarSequenceBundle,
  verifyProjectArtAvatarSequenceBundle,
} from './project-art/avatar-sequence-bundle.mjs';
import {
  ProjectArtAvatarSequenceError,
  canonicalJson,
  hashBytes,
} from './project-art/avatar-sequence-common.mjs';

const FIXED_COMPILED_AT = '2026-08-11T06:30:00.000Z';
const FIXED_CREATED_AT = '2026-08-11T06:45:00.000Z';
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
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBytes.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return output;
}

function png(red) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const row = (offset) =>
    Buffer.from([
      0,
      red + offset,
      20,
      30,
      255,
      red + offset,
      20,
      30,
      255,
    ]);
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat([row(0), row(1)]))),
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
    maximumChangedFraction: 0.25,
    maximumMeanChannelDelta: 48,
    maximumAlphaChangedFraction: 0.2,
    maximumCentroidShiftPixels: 24,
  };
}

function resealPlan(plan) {
  const body = { ...plan };
  delete body.documentSha256;
  return {
    ...body,
    documentSha256: hashBytes(Buffer.from(canonicalJson(body), 'utf8')),
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-avatar-bundle-'));
  await mkdir(path.join(root, 'raw'));
  const definitions = [
    ['idle-a', 10],
    ['idle-b', 20],
    ['talk-a', 30],
    ['talk-b', 40],
  ];
  const frames = [];
  for (const [id, red] of definitions) {
    const bytes = png(red);
    const sourcePath = `raw/${id}.png`;
    await writeFile(path.join(root, sourcePath), bytes);
    frames.push({
      id,
      sourcePath,
      targetPath: `assets/eva-female/reviewed/${id}.png`,
      expectedSha256: sha256(bytes),
    });
  }
  const loopThresholds = thresholds();
  const request = {
    schema: 'evavo.project-art-avatar-sequence-request.v1',
    assignmentId: 'bundle-eva-assignment-v1',
    characterId: 'eva-female',
    revision: 1,
    purpose: 'Compile exact existing EVA PNGs into an inert atomic bundle fixture.',
    assignmentMode: 'owner-declared-only',
    semanticInferencePerformed: false,
    timestampOrderingUsedAsSemantics: false,
    canvas: { width: 2, height: 2, requireAlpha: true },
    frames,
    clips: [
      {
        id: 'idle-main',
        kind: 'idle',
        loopMode: 'loop',
        frames: [
          { frameId: 'idle-a', durationMs: 80 },
          { frameId: 'idle-b', durationMs: 80 },
        ],
        neutralFrameId: 'idle-a',
        emotion: null,
        loopThresholds,
      },
      {
        id: 'talk-enter',
        kind: 'talk-in',
        loopMode: 'once',
        frames: [
          { frameId: 'idle-a', durationMs: 80 },
          { frameId: 'talk-a', durationMs: 80 },
        ],
        neutralFrameId: 'idle-a',
        emotion: null,
        loopThresholds: null,
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
        loopThresholds,
      },
      {
        id: 'talk-exit',
        kind: 'talk-out',
        loopMode: 'once',
        frames: [
          { frameId: 'talk-b', durationMs: 80 },
          { frameId: 'idle-a', durationMs: 80 },
        ],
        neutralFrameId: 'idle-a',
        emotion: null,
        loopThresholds: null,
      },
    ],
    defaults: {
      idleClipId: 'idle-main',
      talk: {
        inClipId: 'talk-enter',
        loopClipId: 'talk-main',
        outClipId: 'talk-exit',
      },
      presence: { idle: 'idle-main' },
      events: {},
      emotions: {},
    },
    authority: authority(),
  };
  const requestPath = path.join(root, 'avatar-sequence-request.json');
  const planPath = path.join(root, 'avatar-sequence-plan.json');
  await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`);
  await compileProjectArtAvatarSequenceFile(requestPath, planPath, {
    workspaceRoot: root,
    compiledAt: FIXED_COMPILED_AT,
  });
  return {
    root,
    request,
    requestPath,
    planPath,
    bundleRoot: path.join(root, 'evidence', 'avatar-sequence-bundle'),
  };
}

async function rejectsCode(action, code) {
  await assert.rejects(action, (error) => {
    assert.ok(error instanceof ProjectArtAvatarSequenceError, String(error));
    assert.equal(error.code, code);
    return true;
  });
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

const cleanups = [];
try {
  {
    const f = await fixture();
    cleanups.push(f.root);
    await mkdir(path.dirname(f.bundleRoot), { recursive: true });
    const built = await materializeProjectArtAvatarSequenceBundle({
      planPath: f.planPath,
      outputRoot: f.bundleRoot,
      createdAt: FIXED_CREATED_AT,
    });
    assert.equal(built.status, 'materialized');
    assert.equal(built.sourceImageBytesIncluded, false);
    assert.equal(built.workspaceFilePlanApplied, false);
    assert.equal(built.runtimeActivationAllowed, false);
    const verified = await verifyProjectArtAvatarSequenceBundle({
      bundleRoot: f.bundleRoot,
    });
    assert.equal(verified.status, 'passed');
    assert.equal(verified.sourceIdentitiesRevalidated, true);
    assert.equal(verified.loopRequestCount, 2);
    assert.equal(verified.runtimeActivationAllowed, false);
    const manifest = await readJson(path.join(f.bundleRoot, 'bundle-manifest.json'));
    const receipt = await readJson(path.join(f.bundleRoot, 'bundle-receipt.json'));
    assert.equal(
      manifest.schema,
      'evavo.project-art-avatar-sequence-bundle-manifest.v1',
    );
    assert.equal(
      receipt.schema,
      'evavo.project-art-avatar-sequence-bundle-receipt.v1',
    );
    assert.equal(receipt.wholeRunAtomicMaterialization, true);
    assert.ok(Object.values(manifest.authority).every((value) => value === false));
    assert.ok(Object.values(receipt.authority).every((value) => value === false));
    assert.equal(
      (await readJson(path.join(f.bundleRoot, 'handoffs/runtime-draft.json')))
        .runtimeActivationAllowed,
      false,
    );
    assert.equal(
      (await readJson(
        path.join(f.bundleRoot, 'handoffs/finalization-requirements.json'),
      )).releaseSealRequired,
      true,
    );
    for (const frame of f.request.frames) {
      await assert.rejects(
        access(path.join(f.root, ...frame.targetPath.split('/'))),
      );
    }
    await rejectsCode(
      () =>
        materializeProjectArtAvatarSequenceBundle({
          planPath: f.planPath,
          outputRoot: f.bundleRoot,
          createdAt: FIXED_CREATED_AT,
        }),
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_TARGET_EXISTS',
    );
  }

  {
    const f = await fixture();
    cleanups.push(f.root);
    await rejectsCode(
      () =>
        materializeProjectArtAvatarSequenceBundle({
          planPath: f.planPath,
          outputRoot: path.join(os.tmpdir(), 'escaped-avatar-sequence-bundle'),
          createdAt: FIXED_CREATED_AT,
        }),
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_OUTPUT_INVALID',
    );
  }

  {
    const f = await fixture();
    cleanups.push(f.root);
    const plan = await readJson(f.planPath);
    plan.purpose += ' tampered';
    await writeFile(f.planPath, `${JSON.stringify(plan, null, 2)}\n`);
    await mkdir(path.dirname(f.bundleRoot), { recursive: true });
    await rejectsCode(
      () =>
        materializeProjectArtAvatarSequenceBundle({
          planPath: f.planPath,
          outputRoot: f.bundleRoot,
          createdAt: FIXED_CREATED_AT,
        }),
      'PROJECT_ART_AVATAR_SEQUENCE_PLAN_HASH_MISMATCH',
    );
  }

  {
    const f = await fixture();
    cleanups.push(f.root);
    const plan = await readJson(f.planPath);
    plan.runtimeDraft.authority.repositoryMutation = true;
    await writeFile(
      f.planPath,
      `${JSON.stringify(resealPlan(plan), null, 2)}\n`,
    );
    await mkdir(path.dirname(f.bundleRoot), { recursive: true });
    await rejectsCode(
      () =>
        materializeProjectArtAvatarSequenceBundle({
          planPath: f.planPath,
          outputRoot: f.bundleRoot,
          createdAt: FIXED_CREATED_AT,
        }),
      'PROJECT_ART_AVATAR_SEQUENCE_PLAN_AUTHORITY_ESCALATION',
    );
  }

  {
    const f = await fixture();
    cleanups.push(f.root);
    await writeFile(path.join(f.root, 'raw', 'idle-a.png'), png(90));
    await mkdir(path.dirname(f.bundleRoot), { recursive: true });
    await rejectsCode(
      () =>
        materializeProjectArtAvatarSequenceBundle({
          planPath: f.planPath,
          outputRoot: f.bundleRoot,
          createdAt: FIXED_CREATED_AT,
        }),
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_SOURCE_CHANGED',
    );
  }

  {
    const f = await fixture();
    cleanups.push(f.root);
    await mkdir(path.dirname(f.bundleRoot), { recursive: true });
    await materializeProjectArtAvatarSequenceBundle({
      planPath: f.planPath,
      outputRoot: f.bundleRoot,
      createdAt: FIXED_CREATED_AT,
    });
    await writeFile(path.join(f.root, 'raw', 'idle-a.png'), png(91));
    await rejectsCode(
      () => verifyProjectArtAvatarSequenceBundle({ bundleRoot: f.bundleRoot }),
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_SOURCE_CHANGED',
    );
  }

  {
    const f = await fixture();
    cleanups.push(f.root);
    await mkdir(path.dirname(f.bundleRoot), { recursive: true });
    await materializeProjectArtAvatarSequenceBundle({
      planPath: f.planPath,
      outputRoot: f.bundleRoot,
      createdAt: FIXED_CREATED_AT,
    });
    const runtimePath = path.join(f.bundleRoot, 'handoffs', 'runtime-draft.json');
    const runtime = await readJson(runtimePath);
    runtime.runtimeActivationAllowed = true;
    await writeFile(runtimePath, `${JSON.stringify(runtime, null, 2)}\n`);
    await rejectsCode(
      () => verifyProjectArtAvatarSequenceBundle({ bundleRoot: f.bundleRoot }),
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_MANIFEST_FILES_MISMATCH',
    );
  }

  {
    const f = await fixture();
    cleanups.push(f.root);
    await mkdir(path.dirname(f.bundleRoot), { recursive: true });
    await materializeProjectArtAvatarSequenceBundle({
      planPath: f.planPath,
      outputRoot: f.bundleRoot,
      createdAt: FIXED_CREATED_AT,
    });
    await writeFile(path.join(f.bundleRoot, 'unexpected.json'), '{}\n');
    await rejectsCode(
      () => verifyProjectArtAvatarSequenceBundle({ bundleRoot: f.bundleRoot }),
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_MANIFEST_FILES_MISMATCH',
    );
  }

  if (process.platform !== 'win32') {
    {
      const f = await fixture();
      cleanups.push(f.root);
      await mkdir(path.dirname(f.bundleRoot), { recursive: true });
      await materializeProjectArtAvatarSequenceBundle({
        planPath: f.planPath,
        outputRoot: f.bundleRoot,
        createdAt: FIXED_CREATED_AT,
      });
      await symlink(
        path.join(f.bundleRoot, 'mastering-plan.json'),
        path.join(f.bundleRoot, 'linked-plan.json'),
      );
      await rejectsCode(
        () => verifyProjectArtAvatarSequenceBundle({ bundleRoot: f.bundleRoot }),
        'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_SYMLINK',
      );
    }

    {
      const f = await fixture();
      cleanups.push(f.root);
      await mkdir(path.dirname(f.bundleRoot), { recursive: true });
      await materializeProjectArtAvatarSequenceBundle({
        planPath: f.planPath,
        outputRoot: f.bundleRoot,
        createdAt: FIXED_CREATED_AT,
      });
      await link(
        path.join(f.bundleRoot, 'mastering-plan.json'),
        path.join(f.bundleRoot, 'hard-plan.json'),
      );
      await rejectsCode(
        () => verifyProjectArtAvatarSequenceBundle({ bundleRoot: f.bundleRoot }),
        'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_FILE_UNSAFE',
      );
    }
  }

  {
    const f = await fixture();
    cleanups.push(f.root);
    await mkdir(path.dirname(f.bundleRoot), { recursive: true });
    await materializeProjectArtAvatarSequenceBundle({
      planPath: f.planPath,
      outputRoot: f.bundleRoot,
      createdAt: FIXED_CREATED_AT,
    });
    const moved = path.join(path.dirname(f.bundleRoot), 'moved-bundle');
    await rename(f.bundleRoot, moved);
    await rejectsCode(
      () => verifyProjectArtAvatarSequenceBundle({ bundleRoot: moved }),
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_OUTPUT_MOVED',
    );
  }

  console.log('Project Art avatar-sequence bundle tests passed.');
  console.log('- exact mastering plans materialize as one atomic create-only JSON bundle');
  console.log('- every payload, manifest, receipt and source identity is independently verified');
  console.log('- source image bytes are not copied into the bundle');
  console.log('- workspace copies, loop review, approvals, release sealing and activation remain separate');
  console.log('- source, provider, repository, Git, deployment and publication authority remain false');
} finally {
  await Promise.all(
    cleanups.map((root) => rm(root, { recursive: true, force: true })),
  );
}
