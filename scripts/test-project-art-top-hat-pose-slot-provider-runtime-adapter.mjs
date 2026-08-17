#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_ADAPTER_CAPABILITIES_SCHEMA,
  TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_ADAPTER_SCHEMA,
  compileProjectArtTopHatPoseSlotProviderRuntimeAdapter,
  compileProjectArtTopHatPoseSlotProviderRuntimeDispatch,
  parseProjectArtTopHatPoseSlotProviderRuntimeAdapter,
  projectArtTopHatPoseSlotProviderRuntimeAdapterCapabilities,
} from './project-art/top-hat-pose-slot-provider-runtime-adapter.mjs';
import {
  createProjectArtTopHatPoseSlotProviderPackageRequest,
} from './project-art/top-hat-pose-slot-provider-package.mjs';
import {
  createReadyTopHatPoseSlotProviderRuntimeRequest,
  topHatPoseRuntimeFixtureCompiledAt as compiledAt,
  topHatPoseRuntimeFixtureExpiresAt as expiresAt,
} from './project-art/top-hat-pose-slot-provider-runtime-fixture.mjs';
import {
  AVATAR_FINAL_PASS_PROVIDER_RUNTIME_DISPATCH_SCHEMA,
  compileAvatarFinalPassProviderRuntimeOutcome,
  validateAvatarFinalPassCompiledProviderRuntimeContract,
} from './project-art/avatar-final-pass-provider-runtime.mjs';
import {
  candidateRunOutcome,
  compiledRuntimeContract,
} from './project-art/avatar-final-pass-provider-runtime-fixture.mjs';
import {
  parseAvatarProviderCandidateSourceChain,
} from './project-art/avatar-final-pass-provider-candidate-source.mjs';
import {
  sha256Document,
} from './project-art/avatar-final-pass-provider-runtime-common.mjs';

test('seals all six admitted Top Hat slots into one deterministic guarded adapter', () => {
  const request =
    createReadyTopHatPoseSlotProviderRuntimeRequest();
  const first =
    compileProjectArtTopHatPoseSlotProviderRuntimeAdapter({
      request,
      compiledAt,
    });
  const second =
    compileProjectArtTopHatPoseSlotProviderRuntimeAdapter({
      request,
      compiledAt,
    });

  assert.equal(
    first.schema,
    TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_ADAPTER_SCHEMA,
  );
  assert.equal(first.adapterSha256, second.adapterSha256);
  assert.equal(first.characterId, 'top-hat-man');
  assert.equal(first.counts.slots, 6);
  assert.equal(first.counts.readySlots, 6);
  assert.equal(first.counts.maximumProviderCalls, 6);
  assert.equal(first.counts.candidatesPerSlot, 1);
  assert.deepEqual(
    first.slots.map((slot) => slot.slotId),
    [
      'blink-closed',
      'listening-attentive',
      'thinking-reflective',
      'speech-neutral',
      'presentation-open',
      'presentation-emphasis',
    ],
  );
  assert.ok(
    Object.values(first.authority).every(
      (value) => value === false,
    ),
  );
  assert.equal(
    parseProjectArtTopHatPoseSlotProviderRuntimeAdapter(first)
      .adapterSha256,
    first.adapterSha256,
  );
});

test('each guarded slot compiles into the existing generic dispatch, binding and candidate source chain', () => {
  const adapter =
    compileProjectArtTopHatPoseSlotProviderRuntimeAdapter({
      request:
        createReadyTopHatPoseSlotProviderRuntimeRequest(),
      compiledAt,
    });

  for (const slot of adapter.slots) {
    const dispatch =
      compileProjectArtTopHatPoseSlotProviderRuntimeDispatch({
        adapter,
        slotId: slot.slotId,
        compiledAt,
      });
    assert.equal(
      dispatch.schema,
      AVATAR_FINAL_PASS_PROVIDER_RUNTIME_DISPATCH_SCHEMA,
    );
    assert.equal(dispatch.jobId, `redraw:${slot.slotId}`);
    assert.equal(dispatch.frameId, slot.slotId);
    assert.equal(dispatch.kind, 'provider-redraw');
    assert.equal(dispatch.operation, 'edit');
    assert.equal(dispatch.continuityPhase, 'key-pose');
    assert.equal(
      dispatch.candidateAdmission.candidateOutputPath,
      `scratch/avatar-final-pass/top-hat-pose-slots-v1/${slot.slotId}/candidate-01.png`,
    );
    assert.equal(
      dispatch.candidateAdmission.reviewedTargetPath,
      `assets/top-hat-man/candidates/top-hat-man-${slot.slotId}-v1.alpha.png`,
    );
    assert.equal(
      dispatch.candidateAdmission.expectedWidth,
      1024,
    );
    assert.equal(
      dispatch.candidateAdmission.expectedHeight,
      1536,
    );
    for (const capability of [
      'edit',
      'cancellation',
      'reference-images',
      'multiple-reference-images',
      'identity-reference',
      'native-alpha',
      'custom-size',
      'seed',
    ]) {
      assert.ok(
        dispatch.expectedRuntimeContract.requiredCapabilityProfile.includes(
          capability,
        ),
        `${slot.slotId} is missing ${capability}`,
      );
    }

    const input = dispatch.providerCompiler.input;
    assert.equal(input.references.length, 3);
    assert.equal(
      input.references.filter(
        (entry) => entry.role === 'base-image',
      ).length,
      1,
    );
    assert.equal(
      input.references.filter(
        (entry) => entry.role === 'canonical-identity',
      ).length,
      2,
    );
    assert.equal(
      input.metadata.topHatPoseSlot.guardedDispatchRequired,
      true,
    );
    assert.equal(
      input.metadata.topHatPoseSlot.authorization.expiresAt,
      expiresAt,
    );
    assert.equal(
      input.metadata.topHatPoseSlot.authorization
        .maximumProviderCalls,
      1,
    );
    assert.equal(
      input.metadata.topHatPoseSlot.continuityEvidence.length,
      input.metadata.topHatPoseSlot.sourceMapping.sourceClipIds
        .length,
    );
    assert.ok(
      input.metadata.topHatPoseSlot.continuityEvidence.every(
        (entry) =>
          !input.references.some(
            (reference) =>
              reference.artifactId === entry.artifactId,
          ),
      ),
    );

    const compiled = compiledRuntimeContract(dispatch);
    const binding =
      validateAvatarFinalPassCompiledProviderRuntimeContract(
        dispatch,
        compiled,
      );
    const outcome =
      compileAvatarFinalPassProviderRuntimeOutcome(
        dispatch,
        binding,
        candidateRunOutcome(dispatch, binding),
      );
    const source = parseAvatarProviderCandidateSourceChain({
      dispatch,
      binding,
      outcome,
    });
    assert.equal(
      source.candidateOutputPath,
      dispatch.candidateAdmission.candidateOutputPath,
    );
    assert.equal(
      source.reviewedTargetPath,
      dispatch.candidateAdmission.reviewedTargetPath,
    );
    assert.equal(source.expectedWidth, 1024);
    assert.equal(source.expectedHeight, 1536);
  }
});

test('dispatch refuses not-yet-active and expired one-shot authorization windows', () => {
  const adapter =
    compileProjectArtTopHatPoseSlotProviderRuntimeAdapter({
      request:
        createReadyTopHatPoseSlotProviderRuntimeRequest(),
      compiledAt,
    });
  assert.throws(
    () =>
      compileProjectArtTopHatPoseSlotProviderRuntimeDispatch({
        adapter,
        slotId: 'blink-closed',
        compiledAt: '2026-08-16T11:59:59.999Z',
      }),
    (error) =>
      error.code ===
      'TOP_HAT_PROVIDER_RUNTIME_AUTHORIZATION_NOT_YET_ACTIVE',
  );
  assert.throws(
    () =>
      compileProjectArtTopHatPoseSlotProviderRuntimeDispatch({
        adapter,
        slotId: 'blink-closed',
        compiledAt: '2026-08-16T18:00:00.001Z',
      }),
    (error) =>
      error.code ===
      'TOP_HAT_PROVIDER_RUNTIME_AUTHORIZATION_EXPIRED',
  );
});

test('blocked packages, unknown slots and rehashed adapter tampering fail closed', () => {
  assert.throws(
    () =>
      compileProjectArtTopHatPoseSlotProviderRuntimeAdapter({
        request:
          createProjectArtTopHatPoseSlotProviderPackageRequest(),
        compiledAt,
      }),
    (error) =>
      error.code ===
      'TOP_HAT_PROVIDER_RUNTIME_PACKAGE_NOT_READY',
  );

  const adapter =
    compileProjectArtTopHatPoseSlotProviderRuntimeAdapter({
      request:
        createReadyTopHatPoseSlotProviderRuntimeRequest(),
      compiledAt,
    });
  assert.throws(
    () =>
      compileProjectArtTopHatPoseSlotProviderRuntimeDispatch({
        adapter,
        slotId: 'unplanned-pose',
        compiledAt,
      }),
    (error) =>
      error.code === 'TOP_HAT_PROVIDER_RUNTIME_SLOT_UNKNOWN',
  );

  const tampered = structuredClone(adapter);
  tampered.sourceRequest.jobs[0].notes =
    'rehashed attacker change';
  const body = { ...tampered };
  delete body.adapterSha256;
  tampered.adapterSha256 = sha256Document(body);
  assert.throws(
    () =>
      parseProjectArtTopHatPoseSlotProviderRuntimeAdapter(
        tampered,
      ),
    /TOP_HAT_PROVIDER_RUNTIME_ADAPTER_MISMATCH|PROJECT_ART_TOP_HAT_PROVIDER/u,
  );
});

test('capabilities disclose guarded compile-only authority', () => {
  const capabilities =
    projectArtTopHatPoseSlotProviderRuntimeAdapterCapabilities();
  assert.equal(
    capabilities.schema,
    TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_ADAPTER_CAPABILITIES_SCHEMA,
  );
  assert.equal(capabilities.requiredPoseSlots, 6);
  assert.equal(capabilities.oneCandidatePerSlot, true);
  assert.equal(
    capabilities.sourceAuthorizationWindowPreserved,
    true,
  );
  assert.equal(
    capabilities.guardedDispatchCompilerRequired,
    true,
  );
  assert.equal(capabilities.genericBatchPersisted, false);
  assert.equal(
    capabilities.continuityEvidenceRetainedInMetadata,
    true,
  );
  assert.equal(
    capabilities.continuityEvidenceSubmittedAsUnverifiedImageReference,
    false,
  );
  for (const key of [
    'providerExecution',
    'runtimeContractCompilation',
    'runtimeEnqueue',
    'candidateMaterialization',
    'candidateApproval',
    'candidatePromotion',
    'poseSlotFilling',
    'sequenceRelease',
    'repositoryMutation',
    'gitCommit',
    'gitPush',
    'deployment',
    'publication',
    'runtimeActivation',
    'forcePush',
  ]) {
    assert.equal(capabilities[key], false);
  }
});

console.log(
  'Project Art Top Hat pose-slot provider runtime adapter regressions passed.',
);
