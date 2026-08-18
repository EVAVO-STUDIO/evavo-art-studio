#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { LocalArtifactStore } from '../packages/artifacts/dist/index.js';
import {
  createProjectArtTopHatPoseSlotProviderPackageRequest,
} from './project-art/top-hat-pose-slot-provider-package.mjs';
import {
  compileProjectArtTopHatPoseSlotProviderRuntimeAdapter,
} from './project-art/top-hat-pose-slot-provider-runtime-adapter.mjs';
import {
  executeTopHatPoseSlotProvider,
  projectArtTopHatPoseSlotProviderExecutionCapabilities,
} from './project-art/top-hat-pose-slot-provider-execution.mjs';
import {
  parseAvatarProviderCandidateSourceChain,
} from './project-art/avatar-final-pass-provider-candidate-source.mjs';
import {
  runTopHatPoseSlotProviderExecution,
} from './run-project-art-top-hat-pose-slot-provider.mjs';

const REFERENCE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFklEQVR4nGNgoBo4YaPxHxkPhAKyAQDgPyKxKv0aXwAAAABJRU5ErkJggg==',
  'base64',
);

function sha(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function temporaryRoots() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'evavo-top-hat-execution-'));
  const runtimeRoot = path.join(root, 'runtime');
  const artifactRoot = path.join(root, 'artifacts');
  mkdirSync(runtimeRoot, { recursive: true, mode: 0o700 });
  mkdirSync(artifactRoot, { recursive: true, mode: 0o700 });
  return { root, runtimeRoot, artifactRoot };
}

async function storeReference(store, slotId, bindingKey, role) {
  return store.put(REFERENCE_PNG, {
    mediaType: 'image/png',
    storageClass: 'source',
    fileName: `${slotId}-${bindingKey.replaceAll(':', '-')}.png`,
    labels: {
      artifactRole: 'top-hat-provider-test-reference',
      bindingKey,
      sourceRole: role,
    },
    metadata: {
      finalDeliverable: false,
      fixtureReference: true,
    },
  });
}

async function createExecutableAdapter(artifactRoot) {
  const template = createProjectArtTopHatPoseSlotProviderPackageRequest();
  const store = new LocalArtifactStore({ root: artifactRoot });
  const now = Date.now();
  const occurredAt = new Date(now - 60_000).toISOString();
  const expiresAt = new Date(now + 60 * 60_000).toISOString();
  const selectionBySlot = {};
  const authorizationBySlot = {};
  const artifactBindingsBySlot = {};

  for (const [slotIndex, slot] of template.plan.productionSlots.entries()) {
    selectionBySlot[slot.slotId] = {
      preferredAdapterId: 'fixture-image',
      preferredModel: 'fixture-transparent-v1',
      allowedAdapterIds: ['fixture-image'],
      allowFallback: false,
      requireSeed: true,
      seed: 187100 + slotIndex,
    };
    authorizationBySlot[slot.slotId] = {
      action: 'run-top-hat-pose-provider-once',
      actorClass: 'human',
      actorId: 'top-hat-execution-test-reviewer',
      slotId: slot.slotId,
      occurredAt,
      expiresAt,
      evidenceSha256: sha(`authorization:${slot.slotId}:${occurredAt}`),
      maximumProviderCalls: 1,
    };

    const bindings = [];
    for (const anchor of template.plan.identityAnchors) {
      const bindingKey = `anchor:${anchor.id}`;
      const role = anchor.id === 'neutral' ? 'edit-source' : 'identity-anchor';
      const stored = await storeReference(store, slot.slotId, bindingKey, role);
      bindings.push({
        bindingKey,
        role,
        sourcePath: anchor.path,
        sourceSha256: anchor.sha256,
        artifactId: stored.artifactId,
        evidenceSha256: sha(`${slot.slotId}:${bindingKey}:evidence`),
        actorClass: 'human',
        actorId: 'top-hat-execution-test-reviewer',
        occurredAt,
      });
    }
    for (const clipId of slot.sourceMapping.sourceClipIds) {
      const bindingKey = `clip:${clipId}`;
      const role = 'animation-clip-reference';
      const stored = await storeReference(store, slot.slotId, bindingKey, role);
      bindings.push({
        bindingKey,
        role,
        sourcePath: `artifacts/top-hat-man/animation-suite/${clipId}.reference.json`,
        sourceSha256: sha(`${slot.slotId}:${clipId}:source`),
        artifactId: stored.artifactId,
        evidenceSha256: sha(`${slot.slotId}:${bindingKey}:evidence`),
        actorClass: 'human',
        actorId: 'top-hat-execution-test-reviewer',
        occurredAt,
      });
    }
    artifactBindingsBySlot[slot.slotId] = bindings;
  }

  const request = createProjectArtTopHatPoseSlotProviderPackageRequest({
    requestId: `top-hat-provider-execution-test-${sha(occurredAt).slice(0, 20)}`,
    selectionBySlot,
    authorizationBySlot,
    artifactBindingsBySlot,
  });
  return compileProjectArtTopHatPoseSlotProviderRuntimeAdapter({
    request,
    compiledAt: new Date(now).toISOString(),
  });
}

test('executes exactly one governed provider call and leaves the candidate unapproved', async () => {
  const roots = temporaryRoots();
  try {
    const adapter = await createExecutableAdapter(roots.artifactRoot);
    const result = await executeTopHatPoseSlotProvider({
      adapter,
      slotId: 'presentation-open',
      runtimeRoot: roots.runtimeRoot,
      artifactRoot: roots.artifactRoot,
      workerId: 'top-hat-provider-execution-test-worker',
      environment: { EVAVO_ART_ENABLE_FIXTURE_PROVIDER: 'true' },
    });

    assert.equal(result.receipt.status, 'succeeded');
    assert.equal(result.receipt.runtime.maximumAttempts, 1);
    assert.equal(result.receipt.runtime.attempts, 1);
    assert.equal(result.receipt.provider.fallbackAllowed, false);
    assert.equal(result.receipt.provider.providerCallCount, 1);
    assert.equal(result.receipt.provider.providerCallCountVerified, true);
    assert.equal(result.receipt.provider.adapterId, 'fixture-image');
    assert.equal(result.receipt.provider.model, 'fixture-transparent-v1');
    assert.equal(result.receipt.effects.providerExecutionPerformed, true);
    assert.equal(result.receipt.effects.candidateArtifactCreated, true);
    assert.equal(result.receipt.effects.evidenceArtifactCreated, true);
    assert.equal(result.receipt.effects.candidateBytesMaterialized, false);
    assert.equal(result.receipt.effects.candidateApprovalPerformed, false);
    assert.equal(result.receipt.effects.poseSlotFilled, false);
    assert.equal(result.receipt.effects.sequenceReleased, false);
    assert.equal(result.receipt.effects.publicationPerformed, false);
    assert.equal(result.receipt.effects.runtimeActivationPerformed, false);
    assert.ok(result.receipt.artifacts.references.length >= 2);
    assert.equal(
      result.receipt.artifacts.candidate?.approvalState,
      'unapproved',
    );
    assert.equal(
      result.outcome?.result.status,
      'candidate-materialization-required',
    );
    assert.ok(
      Object.values(result.outcome?.result.approvals ?? {}).every(
        (value) => value === false,
      ),
    );
    assert.ok(
      Object.values(result.receipt.authority).every((value) => value === false),
    );
  } finally {
    rmSync(roots.root, { recursive: true, force: true });
  }
});

test('reserves a named-human run-once authorization against replay in the durable runtime root', async () => {
  const roots = temporaryRoots();
  try {
    const adapter = await createExecutableAdapter(roots.artifactRoot);
    const options = {
      adapter,
      slotId: 'presentation-open',
      runtimeRoot: roots.runtimeRoot,
      artifactRoot: roots.artifactRoot,
      workerId: 'top-hat-provider-replay-test-worker',
      environment: { EVAVO_ART_ENABLE_FIXTURE_PROVIDER: 'true' },
    };
    const first = await executeTopHatPoseSlotProvider(options);
    assert.equal(first.receipt.status, 'succeeded');
    await assert.rejects(
      executeTopHatPoseSlotProvider(options),
      (error) =>
        error?.code ===
        'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_AUTHORIZATION_ALREADY_RESERVED',
    );
  } finally {
    rmSync(roots.root, { recursive: true, force: true });
  }
});

test('does not reserve runtime work when the exact provider adapter is unavailable', async () => {
  const roots = temporaryRoots();
  try {
    const adapter = await createExecutableAdapter(roots.artifactRoot);
    await assert.rejects(
      executeTopHatPoseSlotProvider({
        adapter,
        slotId: 'presentation-open',
        runtimeRoot: roots.runtimeRoot,
        artifactRoot: roots.artifactRoot,
        environment: {},
      }),
      /unavailable|adapter/i,
    );
  } finally {
    rmSync(roots.root, { recursive: true, force: true });
  }
});

test('CLI persists standard dispatch, binding and outcome documents that the candidate source chain accepts', async () => {
  const roots = temporaryRoots();
  try {
    const adapter = await createExecutableAdapter(roots.artifactRoot);
    const adapterPath = path.join(roots.root, 'adapter.json');
    const dispatchPath = path.join(roots.root, 'dispatch.json');
    const bindingPath = path.join(roots.root, 'binding.json');
    const outcomePath = path.join(roots.root, 'outcome.json');
    const receiptPath = path.join(roots.root, 'execution.json');
    writeFileSync(adapterPath, `${JSON.stringify(adapter, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });

    const result = await runTopHatPoseSlotProviderExecution(
      [
        '--adapter', adapterPath,
        '--expected-adapter-file-sha256', createHash('sha256').update(readFileSync(adapterPath)).digest('hex'),
        '--slot-id', 'presentation-emphasis',
        '--runtime-root', roots.runtimeRoot,
        '--artifact-root', roots.artifactRoot,
        '--dispatch-output', dispatchPath,
        '--binding-output', bindingPath,
        '--outcome-output', outcomePath,
        '--receipt-output', receiptPath,
        '--worker-id', 'top-hat-provider-cli-test-worker',
      ],
      { EVAVO_ART_ENABLE_FIXTURE_PROVIDER: 'true' },
    );

    assert.equal(result.status, 'succeeded');
    assert.equal(result.providerCallCount, 1);
    for (const file of [dispatchPath, bindingPath, outcomePath, receiptPath]) {
      assert.equal(existsSync(file), true);
    }
    const chain = parseAvatarProviderCandidateSourceChain({
      dispatch: JSON.parse(readFileSync(dispatchPath, 'utf8')),
      binding: JSON.parse(readFileSync(bindingPath, 'utf8')),
      outcome: JSON.parse(readFileSync(outcomePath, 'utf8')),
    });
    assert.match(chain.candidateArtifactId, /^artifact_[a-f0-9]{64}$/u);
    assert.match(chain.evidenceArtifactId, /^artifact_[a-f0-9]{64}$/u);
    assert.equal(
      chain.candidateOutputPath,
      'scratch/avatar-final-pass/top-hat-pose-slots-v1/presentation-emphasis/candidate-01.png',
    );
    assert.equal(
      chain.reviewedTargetPath,
      'assets/top-hat-man/candidates/top-hat-man-presentation-emphasis-v1.alpha.png',
    );
  } finally {
    rmSync(roots.root, { recursive: true, force: true });
  }
});

test('advertises execution authority without approval, release or publication authority', () => {
  const capabilities =
    projectArtTopHatPoseSlotProviderExecutionCapabilities();
  assert.equal(capabilities.maximumRuntimeAttempts, 1);
  assert.equal(capabilities.authorizationReservationPerDurableRuntimeRoot, true);
  assert.equal(capabilities.providerReferencePreflightBeforeReservation, true);
  assert.equal(capabilities.providerFallbackAllowed, false);
  assert.equal(capabilities.candidateMaterialization, false);
  assert.equal(capabilities.candidateApproval, false);
  assert.equal(capabilities.poseSlotFilling, false);
  assert.equal(capabilities.sequenceRelease, false);
  assert.equal(capabilities.publication, false);
  assert.equal(capabilities.runtimeActivation, false);
  assert.equal(capabilities.forcePush, false);
});
