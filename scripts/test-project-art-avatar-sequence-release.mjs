#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  AvatarSequenceReleaseError,
  avatarSequenceReleaseBasisSha256,
  avatarSequenceReleaseCapabilities,
  avatarSequenceTimingSha256,
  canonicalAvatarSequenceReleaseJson,
  sealAvatarSequenceReleaseFiles,
  sha256AvatarSequenceReleaseBytes,
  sha256AvatarSequenceReleaseDocument,
  withAvatarSequenceReleaseHash,
} from './project-art/avatar-sequence-release.mjs';
import {
  minimalAvatarSequenceMasteringPlan,
  REQUIRED_SEQUENCE_RELEASE_FAIL_CLOSED_CODES,
} from './project-art/avatar-sequence-release-fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('reports bounded sequence release capabilities with all downstream authority false', () => {
  const capabilities = avatarSequenceReleaseCapabilities();
  assert.equal(capabilities.schema, 'evavo.project-art-avatar-sequence-release-capabilities.v1');
  assert.deepEqual(capabilities.tools, [
    'evavo_art_avatar_sequence_release_capabilities',
    'evavo_art_seal_avatar_sequence_release',
  ]);
  assert.equal(capabilities.requiredInputs.finalFrameAdmissionForEveryRuntimeFrame, true);
  assert.equal(capabilities.requiredInputs.passedLoopReceiptForEveryTrueLoop, true);
  assert.equal(capabilities.outputs.sealedSequenceRelease, true);
  assert.equal(capabilities.outputs.runtimeActivationAllowed, false);
  for (const key of [
    'imageBytesThroughMcp',
    'arbitraryShell',
    'semanticAssignment',
    'imageMutation',
    'providerExecution',
    'candidateApproval',
    'candidatePromotion',
    'sequenceReleaseSealing',
    'repositoryMutation',
    'gitPublication',
    'deployment',
    'publication',
    'runtimeActivation',
    'forcePush',
  ]) assert.equal(capabilities[key], false, `${key} must remain false`);
});

test('canonical JSON and document hashing ignore object insertion order', () => {
  const first = { z: 2, a: { y: 1, x: true } };
  const second = { a: { x: true, y: 1 }, z: 2 };
  assert.equal(canonicalAvatarSequenceReleaseJson(first), '{"a":{"x":true,"y":1},"z":2}');
  assert.equal(
    sha256AvatarSequenceReleaseDocument(first),
    sha256AvatarSequenceReleaseDocument(second),
  );
});

test('byte hashing uses exact SHA-256 content identity', () => {
  const bytes = Buffer.from('avatar-sequence-release\n', 'utf8');
  assert.equal(
    sha256AvatarSequenceReleaseBytes(bytes),
    createHash('sha256').update(bytes).digest('hex'),
  );
});

test('self-hashed documents remain deterministic and do not mutate their input', () => {
  const input = { schema: 'fixture.v1', value: 7 };
  const output = withAvatarSequenceReleaseHash(input, 'documentSha256');
  assert.equal('documentSha256' in input, false);
  assert.equal(
    output.documentSha256,
    sha256AvatarSequenceReleaseDocument(input),
  );
  assert.deepEqual(
    withAvatarSequenceReleaseHash(input, 'documentSha256'),
    output,
  );
});

test('timing hash is stable for the same owner-declared plan', () => {
  const plan = minimalAvatarSequenceMasteringPlan();
  assert.equal(avatarSequenceTimingSha256(plan), avatarSequenceTimingSha256(structuredClone(plan)));
});

test('timing hash changes when an owner-declared frame duration changes', () => {
  const first = minimalAvatarSequenceMasteringPlan();
  const second = minimalAvatarSequenceMasteringPlan();
  second.runtimeDraft.clips[0].frames[0].durationMs = 160;
  second.runtimeDraft.clips[0].durationMs = 160;
  assert.notEqual(avatarSequenceTimingSha256(first), avatarSequenceTimingSha256(second));
});

test('release basis binds exact frames, timing, defaults and loop evidence', () => {
  const first = minimalAvatarSequenceMasteringPlan();
  const timing = avatarSequenceTimingSha256(first);
  const basis = avatarSequenceReleaseBasisSha256({
    plan: first,
    loopEvidence: [],
    timingSha256: timing,
  });
  const second = minimalAvatarSequenceMasteringPlan();
  second.runtimeDraft.frames[0].sha256 = 'b'.repeat(64);
  assert.notEqual(
    basis,
    avatarSequenceReleaseBasisSha256({
      plan: second,
      loopEvidence: [],
      timingSha256: avatarSequenceTimingSha256(second),
    }),
  );
});

test('invalid inferred mastering plans fail closed through AvatarSequenceReleaseError', () => {
  const plan = minimalAvatarSequenceMasteringPlan();
  plan.assignment.mode = 'inferred';
  assert.throws(
    () => avatarSequenceTimingSha256(plan),
    (error) => {
      assert.equal(error instanceof AvatarSequenceReleaseError, true);
      assert.equal(error.code, 'AVATAR_SEQUENCE_RELEASE_MASTERING_PLAN_INVALID');
      return true;
    },
  );
});

test('malformed release request files fail closed before any output publication', () => {
  const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), 'evavo-sequence-release-invalid-'));
  writeFileSync(path.join(workspaceRoot, 'request.json'), '{\n', { mode: 0o600 });
  assert.throws(
    () => sealAvatarSequenceReleaseFiles({
      workspaceRoot,
      requestPath: 'request.json',
      sealedAt: '2026-08-13T09:30:00.000Z',
    }),
    (error) => {
      assert.equal(error instanceof AvatarSequenceReleaseError, true);
      assert.equal(error.code, 'AVATAR_SEQUENCE_RELEASE_REQUEST_INVALID');
      return true;
    },
  );
});

test('permanent source retains all critical fail-closed release codes and admitted-frame status', () => {
  const source = readFileSync(
    path.join(root, 'scripts/project-art/avatar-sequence-release.mjs'),
    'utf8',
  );
  assert.equal(source.includes("'final-frame-admitted'"), true);
  for (const code of REQUIRED_SEQUENCE_RELEASE_FAIL_CLOSED_CODES) {
    assert.equal(source.includes(code), true, `core is missing ${code}`);
  }
});
