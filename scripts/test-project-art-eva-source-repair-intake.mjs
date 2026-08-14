#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  compileProjectArtAvatarFinalPassProviderBatch,
} from './project-art/avatar-final-pass-provider.mjs';
import {
  EVA_SOURCE_REPAIR_HANDOFF_SCHEMA,
  EVA_SOURCE_REPAIR_INTAKE_SCHEMA,
  EVA_SOURCE_REPAIR_MATERIALIZATION_SCHEMA,
  compileProjectArtEvaSourceRepairIntake,
  compileProjectArtEvaSourceRepairIntakeFile,
  sha256ProjectArtEvaSourceRepairDocument,
} from './project-art/eva-source-repair-intake.mjs';
import {
  EVA_SOURCE_REPAIR_TASK_CATALOGUE,
  EVA_SOURCE_REPAIR_TASK_CATALOGUE_SHA256,
} from './project-art/eva-source-repair-catalogue.mjs';

const RUNTIME_COMMIT = '1'.repeat(40);
const RUNTIME_TREE = '2'.repeat(40);
const ART_COMMIT = '3'.repeat(40);
const ART_TREE = '4'.repeat(40);
const COMPILED_AT = '2026-08-15T11:00:00.000Z';

const sha1 = (value) => createHash('sha1').update(value).digest('hex');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function authority() {
  return {
    sourceMutation: false,
    sourceDeletion: false,
    providerExecution: false,
    candidateApproval: false,
    candidatePromotion: false,
    repositoryMutation: false,
    gitCommit: false,
    gitPush: false,
    deployment: false,
    publication: false,
    runtimeActivation: false,
    forcePush: false,
  };
}

function sourcePlan() {
  const body = {
    schema: 'evavo.avatar.eva-source-repair-plan.v1',
    requestId: 'eva-repair-20260815',
    characterId: 'eva-female',
    actorId: 'chatgpt.avatar-repair',
    createdAt: '2026-08-15T10:00:00.000Z',
    sourceTreeSha1: 'fad3bc2276fced5c3d10301a0cc151562f4fa880',
    sourceContractSha256:
      '2e5959849bcf891a0b44e4fc951128b5368a264d3745237872eff582ce10c849',
    productionProfileSha256:
      '1463d66f93fcc7eaca824e58d2396418cbca6c5ff9a10ae478c173b2864dfe3a',
    outputRoot: 'workfiles/eva-source-repairs/v1',
    ownerApprovalSha256: 'a'.repeat(64),
    tasks: structuredClone(EVA_SOURCE_REPAIR_TASK_CATALOGUE),
    releaseGates: {
      sourceBytesMaterialized: false,
      allTaskEvidencePassed: false,
      creativeApprovalRecorded: false,
      atlasRegenerated: false,
      sequenceReleaseRegenerated: false,
      browserPlaybackReverified: false,
      topHatProductionMayStart: false,
    },
    authority: {
      sourceOverwrite: false,
      providerExecution: false,
      candidateApproval: false,
      repositoryWrite: false,
      publication: false,
      runtimeActivation: false,
      deployment: false,
      forcePush: false,
    },
  };
  return {
    ...body,
    planFingerprint: sha256ProjectArtEvaSourceRepairDocument(body),
  };
}

function handoff() {
  const body = {
    schema: EVA_SOURCE_REPAIR_HANDOFF_SCHEMA,
    handoffId: 'eva-repair-handoff-001',
    createdAt: '2026-08-15T10:05:00.000Z',
    runtime: {
      repository: 'EVAVO-STUDIO/evavo-avatar-runtime',
      commit: RUNTIME_COMMIT,
      tree: RUNTIME_TREE,
      packageVersion: '0.22.0',
    },
    artStudio: {
      repository: 'EVAVO-STUDIO/evavo-art-studio',
      commit: ART_COMMIT,
      tree: ART_TREE,
      intakeSchema: EVA_SOURCE_REPAIR_INTAKE_SCHEMA,
      providerPlanSchema: 'evavo.project-art-avatar-final-pass-plan.v1',
      providerRequestSchema:
        'evavo.project-art-avatar-final-pass-provider-request.v1',
    },
    sourcePlan: sourcePlan(),
    taskCatalogueSha256: EVA_SOURCE_REPAIR_TASK_CATALOGUE_SHA256,
    requiredMaterializationSchema: EVA_SOURCE_REPAIR_MATERIALIZATION_SCHEMA,
    authority: authority(),
  };
  return {
    ...body,
    handoffFingerprint: sha256ProjectArtEvaSourceRepairDocument(body),
  };
}

function frame({ sourcePath, gitBlobSha1, index }) {
  return {
    sourcePath,
    materializedPath: `frames/frame-${String(index).padStart(3, '0')}.png`,
    sha256: sha256(`frame:${gitBlobSha1}`),
    gitBlobSha1,
    sizeBytes: 1_024 + index,
    media: {
      format: 'png',
      mimeType: 'image/png',
      width: 1024,
      height: 1536,
      bitDepth: 8,
      colourType: 6,
      interlace: 0,
      hasAlphaChannel: true,
      animated: false,
      iendObserved: true,
    },
    sourceBatchId: `fixture-batch-${String(index).padStart(3, '0')}`,
    ordinal: (index % 10) + 1,
  };
}

function manifest() {
  const frames = [];
  const seenBlobs = new Set();
  const add = (sourcePath, gitBlobSha1) => {
    if (seenBlobs.has(gitBlobSha1)) return;
    seenBlobs.add(gitBlobSha1);
    frames.push(frame({ sourcePath, gitBlobSha1, index: frames.length + 1 }));
  };
  for (const task of EVA_SOURCE_REPAIR_TASK_CATALOGUE) {
    if (task.sourcePath) add(task.sourcePath, task.sourceGitBlobSha1);
    for (const reference of task.references) {
      add(
        `assets/eva-female/reference-${reference.referenceFrameId}.png`,
        reference.referenceGitBlobSha1,
      );
    }
  }
  while (frames.length < 191) {
    const index = frames.length + 1;
    add(`assets/eva-female/dummy-${index}.png`, sha1(`dummy:${index}`));
  }
  const body = {
    schema: EVA_SOURCE_REPAIR_MATERIALIZATION_SCHEMA,
    repository: 'EVAVO-STUDIO/evavo-avatar-runtime',
    sourceRef: RUNTIME_COMMIT,
    characterId: 'eva-female',
    sourceRoot: 'assets/eva-female',
    semanticStatus: 'unreviewed',
    semanticAssignmentPerformed: false,
    timestampOrderUsedAsMeaning: false,
    generationOrderUsedAsMeaning: false,
    frameCount: frames.length,
    totalBytes: frames.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    frames,
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
    authority: {
      semanticAssignment: false,
      sourceMutation: false,
      sourceDeletion: false,
      imageEditing: false,
      providerExecution: false,
      candidateApproval: false,
      candidatePromotion: false,
      repositoryMutation: false,
      gitCommit: false,
      gitPush: false,
      deployment: false,
      publication: false,
      runtimeActivation: false,
      forcePush: false,
    },
  };
  return {
    ...body,
    manifestSha256: sha256ProjectArtEvaSourceRepairDocument(body),
  };
}

function compile() {
  return compileProjectArtEvaSourceRepairIntake({
    handoff: handoff(),
    materializationManifest: manifest(),
    compiledAt: COMPILED_AT,
  });
}

test('exact six-task handoff compiles into the existing provider boundary', () => {
  const intake = compile();
  assert.equal(intake.schema, EVA_SOURCE_REPAIR_INTAKE_SCHEMA);
  assert.deepEqual(intake.counts, {
    sourceFrames: 191,
    repairJobs: 5,
    inbetweenJobs: 1,
    totalJobs: 6,
  });
  assert.equal(intake.providerPlan.repairJobs.length, 5);
  assert.equal(intake.providerPlan.inbetweenJobs.length, 1);
  assert.equal(intake.providerRequestTemplate.jobs.length, 6);
  assert.ok(
    intake.providerPlan.repairJobs.every(
      (job) =>
        job.editPolicy.preserveOutsideMask &&
        job.editPolicy.actualRgbaAlphaRequired &&
        job.providerExecutionAllowed === false,
    ),
  );
  const planBytes = Buffer.from(
    `${JSON.stringify(intake.providerPlan, null, 2)}\n`,
  );
  const requestBytes = Buffer.from(
    `${JSON.stringify(intake.providerRequestTemplate, null, 2)}\n`,
  );
  const batch = compileProjectArtAvatarFinalPassProviderBatch({
    plan: intake.providerPlan,
    planBytes,
    request: intake.providerRequestTemplate,
    requestBytes,
    compiledAt: '2026-08-15T11:01:00.000Z',
  });
  assert.deepEqual(batch.counts, {
    requested: 6,
    ready: 0,
    blocked: 6,
    redraws: 5,
    inbetweens: 1,
  });
  assert.ok(
    batch.jobs.every((job) =>
      job.blockers.includes('human-provider-authorization-required'),
    ),
  );
  assert.equal(batch.providerExecution, false);
  assert.equal(batch.candidateApproval, false);
});

test('Git-blob, plan, manifest and authority drift fail closed', () => {
  const baseHandoff = handoff();
  const baseManifest = manifest();

  const wrongBlob = structuredClone(baseManifest);
  const task = EVA_SOURCE_REPAIR_TASK_CATALOGUE[0];
  const index = wrongBlob.frames.findIndex(
    (entry) => entry.sourcePath === task.sourcePath,
  );
  wrongBlob.frames[index].gitBlobSha1 = 'f'.repeat(40);
  const { manifestSha256: ignoredManifestSha256, ...wrongBlobBody } = wrongBlob;
  wrongBlob.manifestSha256 =
    sha256ProjectArtEvaSourceRepairDocument(wrongBlobBody);
  assert.throws(
    () =>
      compileProjectArtEvaSourceRepairIntake({
        handoff: baseHandoff,
        materializationManifest: wrongBlob,
        compiledAt: COMPILED_AT,
      }),
    /EVA_SOURCE_REPAIR_INTAKE_SOURCE_IDENTITY_MISMATCH/u,
  );

  const changedTask = structuredClone(baseHandoff);
  changedTask.sourcePlan.tasks[0].editPolicy.preserveOutsideMask = false;
  const { planFingerprint, ...planBody } = changedTask.sourcePlan;
  changedTask.sourcePlan.planFingerprint =
    sha256ProjectArtEvaSourceRepairDocument(planBody);
  const { handoffFingerprint, ...handoffBody } = changedTask;
  changedTask.handoffFingerprint =
    sha256ProjectArtEvaSourceRepairDocument(handoffBody);
  assert.throws(
    () =>
      compileProjectArtEvaSourceRepairIntake({
        handoff: changedTask,
        materializationManifest: baseManifest,
        compiledAt: COMPILED_AT,
      }),
    /EVA_SOURCE_REPAIR_INTAKE_SOURCE_PLAN_INVALID/u,
  );

  const escalated = structuredClone(baseHandoff);
  escalated.authority.providerExecution = true;
  const { handoffFingerprint: ignoredHandoffFingerprint, ...escalatedBody } = escalated;
  escalated.handoffFingerprint =
    sha256ProjectArtEvaSourceRepairDocument(escalatedBody);
  assert.throws(
    () =>
      compileProjectArtEvaSourceRepairIntake({
        handoff: escalated,
        materializationManifest: baseManifest,
        compiledAt: COMPILED_AT,
      }),
    /EVA_SOURCE_REPAIR_INTAKE_AUTHORITY_INVALID/u,
  );
});

test('file compilation is bounded and create-only', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'eva-source-repair-intake-'));
  try {
    const handoffPath = path.join(root, 'handoff.json');
    const manifestPath = path.join(root, 'manifest.json');
    const outputPath = path.join(root, 'intake.json');
    writeFileSync(handoffPath, `${JSON.stringify(handoff(), null, 2)}\n`);
    writeFileSync(manifestPath, `${JSON.stringify(manifest(), null, 2)}\n`);
    const intake = compileProjectArtEvaSourceRepairIntakeFile({
      handoffPath,
      materializationManifestPath: manifestPath,
      outputPath,
      compiledAt: COMPILED_AT,
    });
    assert.equal(JSON.parse(readFileSync(outputPath, 'utf8')).intakeSha256, intake.intakeSha256);
    assert.throws(
      () =>
        compileProjectArtEvaSourceRepairIntakeFile({
          handoffPath,
          materializationManifestPath: manifestPath,
          outputPath,
          compiledAt: COMPILED_AT,
        }),
      /EEXIST/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

console.log('Project Art EVA source-repair intake regressions passed.');
console.log('- five exact masked edits and one endpoint-bound in-between are admitted');
console.log('- SHA-1 Git blobs and SHA-256 materialized bytes remain jointly bound');
console.log('- the existing one-candidate provider compiler consumes the generated plan');
console.log('- authorization, artifact admission, review, publication and activation stay separate');
