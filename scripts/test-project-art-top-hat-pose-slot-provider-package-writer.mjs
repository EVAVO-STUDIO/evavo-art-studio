#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_SCHEMA,
  createProjectArtTopHatPoseSlotProviderPackageRequest,
} from './project-art/top-hat-pose-slot-provider-package.mjs';
import {
  TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_RECEIPT_SCHEMA,
  writeProjectArtTopHatPoseSlotProviderPackage,
} from './write-project-art-top-hat-pose-slot-provider-package.mjs';

const sha = (value) =>
  createHash('sha256').update(String(value), 'utf8').digest('hex');
const artifactId = (value) => `artifact_${sha(value)}`;
const occurredAt = '2026-08-16T12:00:00.000Z';
const expiresAt = '2026-08-16T18:00:00.000Z';

function temporaryDirectory() {
  return mkdtempSync(path.join(os.tmpdir(), 'evavo-top-hat-provider-'));
}

function readyRequest() {
  const template = createProjectArtTopHatPoseSlotProviderPackageRequest();
  const selectionBySlot = {};
  const authorizationBySlot = {};
  const artifactBindingsBySlot = {};
  for (const [index, slot] of template.plan.productionSlots.entries()) {
    selectionBySlot[slot.slotId] = {
      preferredAdapterId: 'openai-image-edit',
      preferredModel: 'gpt-image-1.5',
      allowedAdapterIds: ['openai-image-edit'],
      allowFallback: false,
      requireSeed: true,
      seed: 44000 + index,
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
        sourcePath: `artifacts/top-hat-man/${clipId}.reference.json`,
        sourceSha256: sha(`${slot.slotId}:${clipId}`),
        artifactId: artifactId(`${slot.slotId}:clip:${clipId}`),
        evidenceSha256: sha(`${slot.slotId}:clip-evidence:${clipId}`),
        actorClass: 'human',
        actorId: 'fixture-reviewer',
        occurredAt,
      })),
    ];
  }
  return createProjectArtTopHatPoseSlotProviderPackageRequest({
    requestId: 'top-hat-provider-ready-writer-v1',
    selectionBySlot,
    authorizationBySlot,
    artifactBindingsBySlot,
  });
}

test('writes and indepently verifies one create-only blocked provider package', () => {
  const directory = temporaryDirectory();
  try {
    const outputPath = path.join(directory, 'provider-package.json');
    const receipt = writeProjectArtTopHatPoseSlotProviderPackage({ outputPath });
    const bytes = readFileSync(outputPath);
    const providerPackage = JSON.parse(bytes.toString('utf8'));

    assert.equal(receipt.schema, TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_RECEIPT_SCHEMA);
    assert.equal(providerPackage.schema, TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_SCHEMA);
    assert.equal(receipt.outputPath, outputPath);
    assert.equal(receipt.outputBytes, bytes.length);
    assert.equal(receipt.outputSha256, sha(bytes));
    assert.equal(receipt.packageSha256, providerPackage.packageSha256);
    assert.equal(receipt.status, 'blocked');
    assert.equal(receipt.jobs, 6);
    assert.equal(receipt.readyJobs, 0);
    assert.equal(receipt.blockedJobs, 6);
    assert.equal(receipt.maximumProviderCalls, 6);
    assert.equal(receipt.candidatesPerJob, 1);
    assert.equal(receipt.providerExecutionPerformed, false);
    assert.equal(receipt.candidateBytesMaterialized, false);
    assert.equal(receipt.candidateApprovalPerformed, false);
    assert.equal(receipt.poseSlotsFilled, false);
    assert.equal(receipt.runtimeActivationPerformed, false);
    assert.equal(receipt.repositoryMutationAuthority, false);
    assert.equal(receipt.publicationAuthority, false);
    assert.equal(receipt.forcePushAuthority, false);
    const metadata = lstatSync(outputPath);
    assert.equal(metadata.isFile(), true);
    assert.equal(metadata.isSymbolicLink(), false);
    assert.equal(metadata.nlink, 1);
    assert.equal(metadata.mode & 0o777, 0o600);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('accepts an exact request file and writes a ready compile-only package', () => {
  const directory = temporaryDirectory();
  try {
    const requestPath = path.join(directory, 'request.json');
    const outputPath = path.join(directory, 'provider-package.json');
    writeFileSync(requestPath, `${JSON.stringify(readyRequest(), null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    const receipt = writeProjectArtTopHatPoseSlotProviderPackage({
      outputPath,
      requestPath,
    });
    const providerPackage = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.equal(receipt.status, 'ready-for-explicit-provider-submission');
    assert.equal(receipt.readyJobs, 6);
    assert.equal(receipt.blockedJobs, 0);
    assert.equal(providerPackage.status, 'ready-for-explicit-provider-submission');
    assert.ok(providerPackage.jobs.every((job) => job.providerRequestInput));
    assert.ok(
      providerPackage.jobs.every((job) => job.providerExecution === false),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('refuses overwrite, ambiguous request sources and unsafe paths', () => {
  const directory = temporaryDirectory();
  try {
    const outputPath = path.join(directory, 'provider-package.json');
    const first = writeProjectArtTopHatPoseSlotProviderPackage({ outputPath });
    const before = readFileSync(outputPath);
    assert.throws(
      () => writeProjectArtTopHatPoseSlotProviderPackage({ outputPath }),
      /PROJECT_ART_TOP_HAT_PROVIDER_PACKAGE_OUTPUT_EXISTS/u,
    );
    assert.deepEqual(readFileSync(outputPath), before);
    assert.match(first.packageSha256, /^[a-f0-9]{64}$/u);

    assert.throws(
      () =>
        writeProjectArtTopHatPoseSlotProviderPackage({
          outputPath: path.join(directory, 'ambiguous.json'),
          requestPath: path.join(directory, 'request.json'),
          request: createProjectArtTopHatPoseSlotProviderPackageRequest(),
        }),
      /PROJECT_ART_TOP_HAT_PROVIDER_PACKAGE_REQUEST_SOURCE_AMBIGUOUS/u,
    );

    assert.throws(
      () =>
        writeProjectArtTopHatPoseSlotProviderPackage({
          outputPath: 'relative.json',
        }),
      /PROJECT_ART_TOP_HAT_PROVIDER_PACKAGE_PATH_INVALID/u,
    );

    const realRequest = path.join(directory, 'real-request.json');
    const linkedRequest = path.join(directory, 'linked-request.json');
    writeFileSync(
      realRequest,
      `${JSON.stringify(createProjectArtTopHatPoseSlotProviderPackageRequest())}\n`,
    );
    symlinkSync(realRequest, linkedRequest);
    assert.throws(
      () =>
        writeProjectArtTopHatPoseSlotProviderPackage({
          outputPath: path.join(directory, 'linked-output.json'),
          requestPath: linkedRequest,
        }),
      /PROJECT_ART_TOP_HAT_PROVIDER_PACKAGE_REQUEST_FILE_INVALID/u,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
