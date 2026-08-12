#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  link,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RECEIPT_SCHEMA,
  PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_SCHEMA,
  withDocumentHash,
} from './project-art/avatar-sequence-bundle-common.mjs';
import { createAvatarSequenceBundleFixture } from './project-art/avatar-sequence-bundle-fixture.mjs';
import { writeProjectArtAvatarSequenceBundle } from './write-project-art-avatar-sequence-bundle.mjs';

const FIXED_TIME = '2026-08-12T00:00:00.000Z';
const clone = (value) => structuredClone(value);
const expectCode = (code) => (error) => {
  assert.equal(error?.code, code);
  return true;
};

test('writes an atomic create-only bundle of path-and-hash handoffs', async (t) => {
  const f = await createAvatarSequenceBundleFixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const result = writeProjectArtAvatarSequenceBundle({
    workspaceRoot: f.workspace,
    planPath: f.planPath,
    outputRoot: 'bundles/eva-v1',
    createdAt: FIXED_TIME,
  });
  assert.equal(result.manifest.schema, PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_SCHEMA);
  assert.equal(
    result.receipt.schema,
    PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RECEIPT_SCHEMA,
  );
  assert.deepEqual(result.manifest.counts, {
    frames: 4,
    clips: 4,
    loopClosureRequests: 2,
    workspaceOperations: 4,
  });
  assert.equal(result.manifest.runtimeActivationAllowed, false);
  assert.equal(result.receipt.sourcePlanRevalidatedBeforePublication, true);
  assert.equal(result.receipt.wholeRunAtomicPublication, true);
  assert.ok(Object.values(result.receipt.effects).every((value) => value === false));

  const output = path.join(f.workspace, 'bundles', 'eva-v1');
  const expected = [
    'workspace-file-plan-request.json',
    'runtime-draft.json',
    'loop-closure/000-idle-main.request.json',
    'loop-closure/001-talk-main.request.json',
    'manifest.json',
    'receipt.json',
  ];
  for (const relative of expected) {
    const bytes = await readFile(path.join(output, ...relative.split('/')));
    assert.ok(bytes.length > 2, relative);
  }
  const runtimeDraft = JSON.parse(
    await readFile(path.join(output, 'runtime-draft.json'), 'utf8'),
  );
  assert.equal(runtimeDraft.review, null);
  assert.deepEqual(runtimeDraft.loopClosures, []);
  assert.equal(runtimeDraft.runtimeActivationAllowed, false);
  assert.equal('imageBytes' in result.manifest, false);
});

test('deterministic replay fails closed without changing the first bundle', async (t) => {
  const f = await createAvatarSequenceBundleFixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const input = {
    workspaceRoot: f.workspace,
    planPath: f.planPath,
    outputRoot: 'bundles/eva-v1',
    createdAt: FIXED_TIME,
  };
  writeProjectArtAvatarSequenceBundle(input);
  const manifestPath = path.join(f.workspace, 'bundles/eva-v1/manifest.json');
  const before = await readFile(manifestPath);
  assert.throws(
    () => writeProjectArtAvatarSequenceBundle(input),
    expectCode('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_OUTPUT_EXISTS'),
  );
  assert.deepEqual(await readFile(manifestPath), before);
});

test('tampered, inferred, activating, and authority-escalating plans fail closed', async (t) => {
  const mutations = [
    [
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_DOCUMENT_HASH_MISMATCH',
      (plan) => { plan.purpose = 'tampered after sealing'; },
    ],
    [
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_EXPLICIT_ASSIGNMENT_REQUIRED',
      (plan) => {
        plan.assignment.semanticInferencePerformed = true;
        return withDocumentHash(plan);
      },
    ],
    [
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RUNTIME_DRAFT_INVALID',
      (plan) => {
        plan.runtimeDraft.runtimeActivationAllowed = true;
        return withDocumentHash(plan);
      },
    ],
    [
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_PLAN_AUTHORITY_INVALID',
      (plan) => {
        plan.authority.gitPush = true;
        return withDocumentHash(plan);
      },
    ],
  ];
  for (const [index, [code, mutate]] of mutations.entries()) {
    const f = await createAvatarSequenceBundleFixture();
    t.after(() => rm(f.root, { recursive: true, force: true }));
    let plan = clone(f.plan);
    const replacement = mutate(plan);
    if (replacement) plan = replacement;
    await writeFile(f.planPath, `${JSON.stringify(plan, null, 2)}\n`);
    assert.throws(
      () => writeProjectArtAvatarSequenceBundle({
        workspaceRoot: f.workspace,
        planPath: f.planPath,
        outputRoot: `bundles/failure-${index}`,
        createdAt: FIXED_TIME,
      }),
      expectCode(code),
    );
    await assert.rejects(
      readFile(path.join(f.workspace, `bundles/failure-${index}/manifest.json`)),
      { code: 'ENOENT' },
    );
  }
});

test('loop request substitution and ordering drift are rejected', async (t) => {
  const f = await createAvatarSequenceBundleFixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const plan = clone(f.plan);
  const [first, second] = plan.loopClosureRequests;
  plan.loopClosureRequests = [second, first];
  const sealed = withDocumentHash(plan);
  await writeFile(f.planPath, `${JSON.stringify(sealed, null, 2)}\n`);
  assert.throws(
    () => writeProjectArtAvatarSequenceBundle({
      workspaceRoot: f.workspace,
      planPath: f.planPath,
      outputRoot: 'bundles/reordered',
      createdAt: FIXED_TIME,
    }),
    expectCode('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_LOOP_REQUESTS_INVALID'),
  );
});

test('symlinked and hard-linked plans and escaped output roots are rejected', async (t) => {
  const f = await createAvatarSequenceBundleFixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const symlinkPath = path.join(f.workspace, 'plans', 'symlink-plan.json');
  await symlink(f.planPath, symlinkPath);
  assert.throws(
    () => writeProjectArtAvatarSequenceBundle({
      workspaceRoot: f.workspace,
      planPath: symlinkPath,
      outputRoot: 'bundles/symlink',
      createdAt: FIXED_TIME,
    }),
    expectCode('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_PATH_SYMLINK'),
  );

  const hardLinkPath = path.join(f.workspace, 'plans', 'hardlink-plan.json');
  await link(f.planPath, hardLinkPath);
  assert.throws(
    () => writeProjectArtAvatarSequenceBundle({
      workspaceRoot: f.workspace,
      planPath: hardLinkPath,
      outputRoot: 'bundles/hardlink',
      createdAt: FIXED_TIME,
    }),
    expectCode('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_FILE_UNSAFE'),
  );
  await rm(hardLinkPath);

  assert.throws(
    () => writeProjectArtAvatarSequenceBundle({
      workspaceRoot: f.workspace,
      planPath: f.planPath,
      outputRoot: path.join(f.root, 'escaped'),
      createdAt: FIXED_TIME,
    }),
    expectCode('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_PATH_ESCAPE'),
  );
});

console.log('Project Art avatar-sequence bundle tests passed.');
console.log('- exact mastering plans materialize into atomic path-and-hash handoffs');
console.log('- runtime drafts remain unreviewed and inactive');
console.log('- replay, tampering, inference, loop substitution, symlinks and hard links fail closed');
console.log('- no image, provider, repository, Git, deployment or publication authority is introduced');
