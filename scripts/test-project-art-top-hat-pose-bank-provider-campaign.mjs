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
  TOP_HAT_RUNTIME_EXPECTED_SLOTS,
} from './project-art/top-hat-pose-slot-provider-runtime-foundation.mjs';
import {
  compileTopHatPoseBankProviderCampaignPlan,
  parseTopHatPoseBankProviderCampaignPlan,
  parseTopHatPoseBankProviderCampaignReceipt,
  topHatPoseBankProviderCampaignCapabilities,
} from './project-art/top-hat-pose-bank-provider-campaign.mjs';
import {
  parseAvatarProviderCandidateSourceChain,
} from './project-art/avatar-final-pass-provider-candidate-source.mjs';
import {
  runTopHatPoseBankProviderCampaign,
} from './run-project-art-top-hat-pose-bank-provider-campaign.mjs';

const REFERENCE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFklEQVR4nGNgoBo4YaPxHxkPhAKyAQDgPyKxKv0aXwAAAABJRU5ErkJggg==',
  'base64',
);

function sha(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function roots() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'evavo-top-hat-campaign-'));
  const artifactRoot = path.join(root, 'artifacts');
  const runtimeRoot = path.join(root, 'runtime');
  const outputParent = path.join(root, 'campaigns');
  const outputRoot = path.join(outputParent, 'six-pose-run');
  mkdirSync(artifactRoot, { recursive: true, mode: 0o700 });
  mkdirSync(outputParent, { recursive: true, mode: 0o700 });
  return { root, artifactRoot, runtimeRoot, outputParent, outputRoot };
}

async function storeReference(store, slotId, bindingKey, role) {
  return store.put(REFERENCE_PNG, {
    mediaType: 'image/png',
    storageClass: 'source',
    fileName: `${slotId}-${bindingKey.replaceAll(':', '-')}.png`,
    labels: {
      artifactRole: 'top-hat-campaign-test-reference',
      bindingKey,
      sourceRole: role,
    },
    metadata: {
      finalDeliverable: false,
      fixtureReference: true,
    },
  });
}

async function executableAdapter(artifactRoot) {
  const template = createProjectArtTopHatPoseSlotProviderPackageRequest();
  const store = new LocalArtifactStore({ root: artifactRoot });
  const now = Date.now();
  const occurredAt = new Date(now - 60_000).toISOString();
  const expiresAt = new Date(now + 2 * 60 * 60_000).toISOString();
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
      seed: 187160 + slotIndex,
    };
    authorizationBySlot[slot.slotId] = {
      action: 'run-top-hat-pose-provider-once',
      actorClass: 'human',
      actorId: 'top-hat-campaign-test-reviewer',
      slotId: slot.slotId,
      occurredAt,
      expiresAt,
      evidenceSha256: sha(`campaign-authorization:${slot.slotId}:${occurredAt}`),
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
        evidenceSha256: sha(`${slot.slotId}:${bindingKey}:campaign-evidence`),
        actorClass: 'human',
        actorId: 'top-hat-campaign-test-reviewer',
        occurredAt,
      });
    }
    for (const clipId of slot.sourceMapping.sourceClipIds) {
      const bindingKey = `clip:${clipId}`;
      const stored = await storeReference(
        store,
        slot.slotId,
        bindingKey,
        'animation-clip-reference',
      );
      bindings.push({
        bindingKey,
        role: 'animation-clip-reference',
        sourcePath: `artifacts/top-hat-man/animation-suite/${clipId}.reference.json`,
        sourceSha256: sha(`${slot.slotId}:${clipId}:campaign-source`),
        artifactId: stored.artifactId,
        evidenceSha256: sha(`${slot.slotId}:${bindingKey}:campaign-evidence`),
        actorClass: 'human',
        actorId: 'top-hat-campaign-test-reviewer',
        occurredAt,
      });
    }
    artifactBindingsBySlot[slot.slotId] = bindings;
  }

  const request = createProjectArtTopHatPoseSlotProviderPackageRequest({
    requestId: `top-hat-provider-campaign-test-${sha(occurredAt).slice(0, 20)}`,
    selectionBySlot,
    authorizationBySlot,
    artifactBindingsBySlot,
  });
  return compileProjectArtTopHatPoseSlotProviderRuntimeAdapter({
    request,
    compiledAt: new Date(now).toISOString(),
  });
}

function writeAdapter(root, adapter) {
  const adapterPath = path.join(root, 'adapter.json');
  writeFileSync(adapterPath, `${JSON.stringify(adapter, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  const fileSha256 = createHash('sha256')
    .update(readFileSync(adapterPath))
    .digest('hex');
  return { adapterPath, fileSha256 };
}

test('preflights all six active one-shot authorizations, exact adapters and immutable image references', async () => {
  const workspace = roots();
  try {
    const adapter = await executableAdapter(workspace.artifactRoot);
    const plan = await compileTopHatPoseBankProviderCampaignPlan({
      adapter,
      artifactRoot: workspace.artifactRoot,
      environment: { EVAVO_ART_ENABLE_FIXTURE_PROVIDER: 'true' },
    });
    const parsed = parseTopHatPoseBankProviderCampaignPlan(plan);
    assert.equal(parsed.status, 'ready-for-six-slot-provider-execution');
    assert.deepEqual(
      parsed.slots.map((slot) => slot.slotId),
      TOP_HAT_RUNTIME_EXPECTED_SLOTS,
    );
    assert.equal(parsed.counts.slots, 6);
    assert.equal(parsed.counts.readySlots, 6);
    assert.equal(parsed.counts.maximumProviderCalls, 6);
    assert.equal(parsed.counts.maximumCandidates, 6);
    assert.equal(parsed.counts.verifiedProviderReferences, 18);
    for (const slot of parsed.slots) {
      assert.equal(slot.authorization.actorClass, 'human');
      assert.equal(slot.authorization.maximumProviderCalls, 1);
      assert.deepEqual(slot.allowedAdapterIds, ['fixture-image']);
      assert.deepEqual(slot.eligibleAdapterIds, ['fixture-image']);
      assert.equal(slot.selectedAdapterId, 'fixture-image');
      assert.equal(slot.references.length, 3);
      assert.equal(slot.providerExecutionPerformed, false);
      assert.equal(slot.candidateMaterializationPerformed, false);
      assert.equal(slot.candidateApprovalPerformed, false);
      assert.equal(slot.poseSlotFilled, false);
    }
    assert.ok(Object.values(parsed.authority).every((value) => value === false));
  } finally {
    rmSync(workspace.root, { recursive: true, force: true });
  }
});

test('runs the six-pose campaign sequentially and persists admission-compatible evidence for every slot', async () => {
  const workspace = roots();
  try {
    const adapter = await executableAdapter(workspace.artifactRoot);
    const { adapterPath, fileSha256 } = writeAdapter(workspace.root, adapter);
    const result = await runTopHatPoseBankProviderCampaign(
      [
        '--adapter', adapterPath,
        '--expected-adapter-file-sha256', fileSha256,
        '--runtime-root', workspace.runtimeRoot,
        '--artifact-root', workspace.artifactRoot,
        '--output-root', workspace.outputRoot,
        '--worker-prefix', 'top-hat-campaign-test',
      ],
      { EVAVO_ART_ENABLE_FIXTURE_PROVIDER: 'true' },
    );

    assert.equal(result.status, 'succeeded');
    assert.equal(result.counts.plannedSlots, 6);
    assert.equal(result.counts.attemptedSlots, 6);
    assert.equal(result.counts.succeededSlots, 6);
    assert.equal(result.counts.failedSlots, 0);
    assert.equal(result.counts.verifiedProviderCalls, 6);
    assert.equal(result.candidateMaterializationPerformed, false);
    assert.equal(result.candidateApprovalPerformed, false);
    assert.equal(result.poseSlotsFilled, false);
    assert.equal(result.sequenceReleased, false);
    assert.equal(result.publicationPerformed, false);
    assert.equal(result.runtimeActivationPerformed, false);

    const plan = JSON.parse(readFileSync(result.campaignPlanPath, 'utf8'));
    parseTopHatPoseBankProviderCampaignPlan(plan);
    const receipt = JSON.parse(readFileSync(result.campaignReceiptPath, 'utf8'));
    const parsedReceipt = parseTopHatPoseBankProviderCampaignReceipt(receipt, plan);
    assert.equal(parsedReceipt.status, 'succeeded');
    assert.equal(parsedReceipt.slots.length, 6);
    assert.ok(
      Object.values(parsedReceipt.authority).every((value) => value === false),
    );

    for (const [index, slotId] of TOP_HAT_RUNTIME_EXPECTED_SLOTS.entries()) {
      const slotRoot = path.join(
        workspace.outputRoot,
        `${String(index + 1).padStart(2, '0')}-${slotId}`,
      );
      const dispatchPath = path.join(slotRoot, 'dispatch.json');
      const bindingPath = path.join(slotRoot, 'binding.json');
      const outcomePath = path.join(slotRoot, 'outcome.json');
      const executionPath = path.join(slotRoot, 'execution.json');
      const checkpointPath = path.join(slotRoot, 'checkpoint.json');
      for (const file of [
        dispatchPath,
        bindingPath,
        outcomePath,
        executionPath,
        checkpointPath,
      ]) {
        assert.equal(existsSync(file), true, `${slotId} is missing ${file}`);
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
        `scratch/avatar-final-pass/top-hat-pose-slots-v1/${slotId}/candidate-01.png`,
      );
      assert.equal(
        chain.reviewedTargetPath,
        `assets/top-hat-man/candidates/top-hat-man-${slotId}-v1.alpha.png`,
      );
      const execution = JSON.parse(readFileSync(executionPath, 'utf8'));
      assert.equal(execution.status, 'succeeded');
      assert.equal(execution.provider.providerCallCount, 1);
      assert.equal(execution.provider.providerCallCountVerified, true);
      assert.equal(execution.effects.candidateBytesMaterialized, false);
      assert.equal(execution.effects.candidateApprovalPerformed, false);
      assert.equal(execution.effects.poseSlotFilled, false);
      assert.equal(execution.effects.publicationPerformed, false);
      assert.equal(execution.effects.runtimeActivationPerformed, false);
    }

    await assert.rejects(
      runTopHatPoseBankProviderCampaign(
        [
          '--adapter', adapterPath,
          '--expected-adapter-file-sha256', fileSha256,
          '--runtime-root', workspace.runtimeRoot,
          '--artifact-root', workspace.artifactRoot,
          '--output-root', workspace.outputRoot,
        ],
        { EVAVO_ART_ENABLE_FIXTURE_PROVIDER: 'true' },
      ),
      (error) =>
        error?.code === 'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_CLI_OUTPUT_EXISTS',
    );
  } finally {
    rmSync(workspace.root, { recursive: true, force: true });
  }
});

test('fails campaign preflight before creating output or runtime state when the exact provider is unavailable', async () => {
  const workspace = roots();
  try {
    const adapter = await executableAdapter(workspace.artifactRoot);
    const { adapterPath, fileSha256 } = writeAdapter(workspace.root, adapter);
    await assert.rejects(
      runTopHatPoseBankProviderCampaign(
        [
          '--adapter', adapterPath,
          '--expected-adapter-file-sha256', fileSha256,
          '--runtime-root', workspace.runtimeRoot,
          '--artifact-root', workspace.artifactRoot,
          '--output-root', workspace.outputRoot,
        ],
        {},
      ),
      /eligible|adapter|unavailable/i,
    );
    assert.equal(existsSync(workspace.outputRoot), false);
    assert.equal(existsSync(workspace.runtimeRoot), false);
  } finally {
    rmSync(workspace.root, { recursive: true, force: true });
  }
});

test('campaign capabilities never imply approval, release, publication or activation authority', () => {
  const capabilities = topHatPoseBankProviderCampaignCapabilities();
  assert.equal(capabilities.requiredSlots, 6);
  assert.equal(capabilities.preflightAllSlotsBeforeFirstProviderCall, true);
  assert.equal(capabilities.sequentialExecution, true);
  assert.equal(capabilities.stopOnFirstFailure, true);
  assert.equal(capabilities.maximumProviderCalls, 6);
  assert.equal(capabilities.perSlotMaximumAttempts, 1);
  assert.equal(capabilities.providerFallbackAllowed, false);
  assert.equal(capabilities.automaticRetry, false);
  assert.equal(capabilities.providerExecution, false);
  assert.equal(capabilities.runtimeSubmission, false);
  assert.equal(capabilities.candidateMaterialization, false);
  assert.equal(capabilities.candidateApproval, false);
  assert.equal(capabilities.candidatePromotion, false);
  assert.equal(capabilities.poseSlotFilling, false);
  assert.equal(capabilities.sequenceRelease, false);
  assert.equal(capabilities.publication, false);
  assert.equal(capabilities.runtimeActivation, false);
  assert.equal(capabilities.forcePush, false);
});
