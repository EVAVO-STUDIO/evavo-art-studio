#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  TOP_HAT_POSE_SLOT_PROVIDER_CAPABILITIES_SCHEMA,
  TOP_HAT_POSE_SLOT_PROVIDER_JOB_SCHEMA,
  TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_REQUEST_SCHEMA,
  TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_SCHEMA,
  canonicalTopHatPoseSlotProviderPackageJson,
  compileProjectArtTopHatPoseSlotProviderPackage,
  createProjectArtTopHatPoseSlotProviderPackageRequest,
  projectArtTopHatPoseSlotProviderPackageCapabilities,
} from './project-art/top-hat-pose-slot-provider-package.mjs';

const sha = (value) =>
  createHash('sha256').update(String(value), 'utf8').digest('hex');
const artifactId = (value) => `artifact_${sha(value)}`;
const occurredAt = '2026-08-16T12:00:00.000Z';
const expiresAt = '2026-08-16T18:00:00.000Z';

function readyOptions() {
  const template = createProjectArtTopHatPoseSlotProviderPackageRequest();
  const selectionBySlot = {};
  const authorizationBySlot = {};
  const artifactBindingsBySlot = {};
  for (const [slotIndex, slot] of template.plan.productionSlots.entries()) {
    selectionBySlot[slot.slotId] = {
      preferredAdapterId: 'openai-image-edit',
      preferredModel: 'gpt-image-1.5',
      allowedAdapterIds: ['openai-image-edit'],
      allowFallback: false,
      requireSeed: true,
      seed: 187100 + slotIndex,
    };
    authorizationBySlot[slot.slotId] = {
      action: 'run-top-hat-pose-provider-once',
      actorClass: 'human',
      actorId: 'fixture-reviewer',
      slotId: slot.slotId,
      occurredAt,
      expiresAt,
      evidenceSha256: sha(`authorization:${slot.slotId}`),
      maximumProviderCalls: 1,
    };
    artifactBindingsBySlot[slot.slotId] = [
      ...template.plan.identityAnchors.map((anchor) => ({
        bindingKey: `anchor:${anchor.id}`,
        role: anchor.id === 'neutral' ? 'edit-source' : 'identity-anchor',
        sourcePath: anchor.path,
        sourceSha256: anchor.sha256,
        artifactId: artifactId(`${slot.slotId}:anchor:${anchor.id}`),
        evidenceSha256: sha(`${slot.slotId}:anchor-evidence:${anchor.id}`),
        actorClass: 'human',
        actorId: 'fixture-reviewer',
        occurredAt,
      })),
      ...slot.sourceMapping.sourceClipIds.map((clipId) => ({
        bindingKey: `clip:${clipId}`,
        role: 'animation-clip-reference',
        sourcePath:
          `artifacts/top-hat-man/animation-suite/${clipId}.reference.json`,
        sourceSha256: sha(`${slot.slotId}:clip:${clipId}`),
        artifactId: artifactId(`${slot.slotId}:clip:${clipId}`),
        evidenceSha256: sha(`${slot.slotId}:clip-evidence:${clipId}`),
        actorClass: 'human',
        actorId: 'fixture-reviewer',
        occurredAt,
      })),
    ];
  }
  return {
    requestId: 'top-hat-pose-slot-provider-package-authorized-v1',
    selectionBySlot,
    authorizationBySlot,
    artifactBindingsBySlot,
  };
}

test('compiles one deterministic blocked package for all six unfilled slots', () => {
  const request = createProjectArtTopHatPoseSlotProviderPackageRequest();
  const first = compileProjectArtTopHatPoseSlotProviderPackage(request);
  const second = compileProjectArtTopHatPoseSlotProviderPackage(request);

  assert.equal(request.schema, TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_REQUEST_SCHEMA);
  assert.equal(first.schema, TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_SCHEMA);
  assert.equal(first.characterId, 'top-hat-man');
  assert.equal(first.status, 'blocked');
  assert.equal(first.jobs.length, 6);
  assert.equal(first.counts.jobs, 6);
  assert.equal(first.counts.readyJobs, 0);
  assert.equal(first.counts.blockedJobs, 6);
  assert.equal(first.counts.maximumProviderCalls, 6);
  assert.equal(first.counts.candidatesPerJob, 1);
  assert.equal(first.counts.maximumCandidates, 6);
  assert.equal(first.counts.activationEligiblePoseSlots, 0);
  assert.equal(first.currentRuntimeSafe, true);
  assert.equal(first.expandedPerformanceReady, false);
  assert.equal(first.artGenerationRequired, true);
  assert.equal(first.providerExecutionPerformed, false);
  assert.equal(first.candidateBytesMaterialized, false);
  assert.equal(first.candidateApprovalPerformed, false);
  assert.equal(first.poseSlotsFilled, false);
  assert.equal(first.runtimeActivationPerformed, false);
  assert.equal(first.publicationPerformed, false);
  assert.equal(first.packageSha256, second.packageSha256);
  assert.equal(
    canonicalTopHatPoseSlotProviderPackageJson(first),
    canonicalTopHatPoseSlotProviderPackageJson(second),
  );
  assert.match(first.packageSha256, /^[a-f0-9]{64}$/u);
  assert.ok(Object.values(first.authority).every((value) => value === false));

  const ids = first.jobs.map((job) => job.slotId);
  assert.deepEqual(ids, [
    'blink-closed',
    'listening-attentive',
    'thinking-reflective',
    'speech-neutral',
    'presentation-open',
    'presentation-emphasis',
  ]);
  for (const job of first.jobs) {
    assert.equal(job.schema, TOP_HAT_POSE_SLOT_PROVIDER_JOB_SCHEMA);
    assert.equal(job.status, 'blocked');
    assert.equal(job.candidateCount, 1);
    assert.equal(job.providerRequestInput, null);
    assert.equal(job.providerRequestSha256, null);
    assert.equal(job.providerExecution, false);
    assert.equal(job.imageMutation, false);
    assert.equal(job.candidateApproval, false);
    assert.equal(job.candidatePromotion, false);
    assert.equal(job.poseSlotFilling, false);
    assert.equal(job.runtimeActivation, false);
    assert.equal(job.publication, false);
    assert.ok(job.blockers.includes('human-provider-authorization-required'));
    assert.ok(job.blockers.includes('allowed-provider-adapter-required'));
    assert.ok(job.blockers.includes('deterministic-seed-required'));
    assert.ok(
      job.blockers.some((blocker) =>
        blocker.startsWith('reference-artifact-required:anchor:neutral'),
      ),
    );
    assert.equal(job.createOnly, true);
    assert.equal(job.overwriteExistingCandidate, false);
  }
});

test('compiles six one-call provider submissions only after exact human admission', () => {
  const request = createProjectArtTopHatPoseSlotProviderPackageRequest(
    readyOptions(),
  );
  const compiled = compileProjectArtTopHatPoseSlotProviderPackage(request);

  assert.equal(compiled.status, 'ready-for-explicit-provider-submission');
  assert.equal(compiled.counts.readyJobs, 6);
  assert.equal(compiled.counts.blockedJobs, 0);
  assert.equal(compiled.providerExecutionPerformed, false);
  assert.equal(compiled.poseSlotsFilled, false);

  for (const job of compiled.jobs) {
    assert.equal(job.status, 'ready-for-explicit-provider-submission');
    assert.deepEqual(job.blockers, []);
    assert.equal(job.authorization.actorClass, 'human');
    assert.equal(job.authorization.slotId, job.slotId);
    assert.equal(job.authorization.maximumProviderCalls, 1);
    assert.equal(job.selection.allowFallback, false);
    assert.equal(job.selection.requireSeed, true);
    assert.equal(job.selection.allowedAdapterIds.length, 1);
    assert.ok(job.providerRequestInput);
    assert.match(job.providerRequestSha256, /^[a-f0-9]{64}$/u);
    assert.equal(job.providerRequestInput.operation, 'edit');
    assert.equal(job.providerRequestInput.assetKind, 'sprite-frame');
    assert.equal(job.providerRequestInput.candidateCount, 1);
    assert.equal(job.providerRequestInput.target.width, 1024);
    assert.equal(job.providerRequestInput.target.height, 1536);
    assert.equal(job.providerRequestInput.target.pixelFormat, 'rgba8-straight');
    assert.equal(job.providerRequestInput.target.alphaAssociation, 'straight');
    assert.equal(job.providerRequestInput.target.trimTransparentBorders, false);
    assert.equal(job.providerRequestInput.target.rotateAtlasRegions, false);
    assert.equal(job.providerRequestInput.background.paintedCheckerboardAllowed, false);
    assert.equal(job.providerRequestInput.background.opaqueMatteAllowed, false);
    assert.equal(job.providerRequestInput.background.chromaSpillAllowed, false);
    assert.equal(
      job.providerRequestInput.metadata.bodyCadenceIndependentOfVisemes,
      true,
    );
    assert.equal(
      job.providerRequestInput.metadata.registeredMouthLayerOwnsVisemes,
      true,
    );
    assert.equal(
      job.providerRequestInput.metadata.alphaEncoding.association,
      'straight',
    );
    assert.equal(
      job.providerRequestInput.metadata.alphaEncoding.premultiplied,
      false,
    );
    assert.ok(
      Object.values(job.providerRequestInput.metadata.approvals).every(
        (value) => value === false,
      ),
    );
    assert.equal(
      job.providerRequestInput.references.length,
      3 + job.sourceMapping.sourceClipIds.length,
    );
  }
});

test('rejects plan, authority, path, authorization and binding tampering', () => {
  const base = createProjectArtTopHatPoseSlotProviderPackageRequest(
    readyOptions(),
  );

  const planTamper = structuredClone(base);
  planTamper.plan.authority.providerExecution = true;
  assert.throws(
    () => compileProjectArtTopHatPoseSlotProviderPackage(planTamper),
    /PROJECT_ART_TOP_HAT_PROVIDER_PLAN_MISMATCH|UPSTREAM_AUTHORITY_ESCALATED/u,
  );

  const authorityTamper = structuredClone(base);
  authorityTamper.authority.runtimeActivation = true;
  assert.throws(
    () => compileProjectArtTopHatPoseSlotProviderPackage(authorityTamper),
    /PROJECT_ART_TOP_HAT_PROVIDER_FALSE_AUTHORITY_REQUIRED/u,
  );

  const pathTamper = structuredClone(base);
  pathTamper.jobs[0].candidateOutputPath = '../escape.png';
  assert.throws(
    () => compileProjectArtTopHatPoseSlotProviderPackage(pathTamper),
    /PROJECT_ART_TOP_HAT_PROVIDER_PATH_INVALID/u,
  );

  const authorizationTamper = structuredClone(base);
  authorizationTamper.jobs[0].authorization.slotId = 'thinking-reflective';
  assert.throws(
    () => compileProjectArtTopHatPoseSlotProviderPackage(authorizationTamper),
    /PROJECT_ART_TOP_HAT_PROVIDER_AUTHORIZATION_SLOT_MISMATCH/u,
  );

  const anchorTamper = structuredClone(base);
  anchorTamper.jobs[0].artifactBindings[0].sourceSha256 = sha('substituted');
  assert.throws(
    () => compileProjectArtTopHatPoseSlotProviderPackage(anchorTamper),
    /PROJECT_ART_TOP_HAT_PROVIDER_BINDING_SOURCE_MISMATCH/u,
  );

  const unexpected = structuredClone(base);
  unexpected.jobs[0].artifactBindings.push({
    bindingKey: 'clip:unplanned',
    role: 'animation-clip-reference',
    sourcePath: 'artifacts/unplanned.json',
    sourceSha256: sha('unplanned'),
    artifactId: artifactId('unplanned'),
    evidenceSha256: sha('unplanned-evidence'),
    actorClass: 'human',
    actorId: 'fixture-reviewer',
    occurredAt,
  });
  assert.throws(
    () => compileProjectArtTopHatPoseSlotProviderPackage(unexpected),
    /PROJECT_ART_TOP_HAT_PROVIDER_BINDING_UNEXPECTED/u,
  );
});

test('rejects duplicate bindings, fallback, excessive authorization and unsafe evidence', () => {
  const duplicate = createProjectArtTopHatPoseSlotProviderPackageRequest(
    readyOptions(),
  );
  const duplicateMutable = structuredClone(duplicate);
  duplicateMutable.jobs[0].artifactBindings.push(
    structuredClone(duplicateMutable.jobs[0].artifactBindings[0]),
  );
  assert.throws(
    () => compileProjectArtTopHatPoseSlotProviderPackage(duplicateMutable),
    /PROJECT_ART_TOP_HAT_PROVIDER_BINDING_DUPLICATE/u,
  );

  const fallback = structuredClone(duplicate);
  fallback.jobs[0].selection.allowFallback = true;
  assert.throws(
    () => compileProjectArtTopHatPoseSlotProviderPackage(fallback),
    /PROJECT_ART_TOP_HAT_PROVIDER_FALLBACK_FORBIDDEN/u,
  );

  const multiCall = structuredClone(duplicate);
  multiCall.jobs[0].authorization.maximumProviderCalls = 2;
  assert.throws(
    () => compileProjectArtTopHatPoseSlotProviderPackage(multiCall),
    /PROJECT_ART_TOP_HAT_PROVIDER_ONE_CALL_AUTHORIZATION_REQUIRED/u,
  );

  const tooLong = structuredClone(duplicate);
  tooLong.jobs[0].authorization.expiresAt = '2026-08-18T12:00:00.000Z';
  assert.throws(
    () => compileProjectArtTopHatPoseSlotProviderPackage(tooLong),
    /PROJECT_ART_TOP_HAT_PROVIDER_AUTHORIZATION_WINDOW_INVALID/u,
  );

  const accessor = structuredClone(duplicate);
  Object.defineProperty(accessor.jobs[0], 'notes', {
    enumerable: true,
    get() {
      throw new Error('must not execute');
    },
  });
  assert.throws(
    () => compileProjectArtTopHatPoseSlotProviderPackage(accessor),
    /PROJECT_ART_TOP_HAT_PROVIDER_ACCESSOR_FORBIDDEN/u,
  );

  const cyclic = structuredClone(duplicate);
  cyclic.loop = cyclic;
  assert.throws(
    () => compileProjectArtTopHatPoseSlotProviderPackage(cyclic),
    /PROJECT_ART_TOP_HAT_PROVIDER_DOCUMENT_CYCLIC|KEYS_INVALID/u,
  );
});

test('capabilities truthfully disclose compile-only provider readiness', () => {
  const capabilities = projectArtTopHatPoseSlotProviderPackageCapabilities();
  assert.equal(capabilities.schema, TOP_HAT_POSE_SLOT_PROVIDER_CAPABILITIES_SCHEMA);
  assert.equal(capabilities.requiredPoseSlots, 6);
  assert.equal(capabilities.maximumProviderCalls, 6);
  assert.equal(capabilities.candidatesPerJob, 1);
  assert.equal(capabilities.explicitHumanAuthorizationRequired, true);
  assert.equal(capabilities.providerFallbackAllowed, false);
  assert.equal(capabilities.nativeStraightAlphaRequired, true);
  assert.equal(capabilities.alphaAssociationDeclared, true);
  assert.equal(capabilities.fakeTransparencyGridAllowed, false);
  assert.equal(capabilities.registeredMouthLayerOwnsVisemes, true);
  assert.equal(capabilities.bodyCadenceIndependentOfVisemes, true);
  assert.equal(capabilities.syntheticBodyInbetweningAllowed, false);
  for (const key of [
    'providerExecution',
    'imageMutation',
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
