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
import {
  EVA_SOURCE_REPAIR_HAND_ENVELOPES,
} from './project-art/eva-source-repair-candidate-assurance.mjs';
import {
  EVA_SOURCE_REPAIR_PROVIDER_ADMISSIONS_SCHEMA,
  EVA_SOURCE_REPAIR_PROVIDER_PACKAGE_SCHEMA,
  compileProjectArtEvaSourceRepairProviderAdmissionsTemplate,
  compileProjectArtEvaSourceRepairProviderAdmissionsTemplateFile,
  compileProjectArtEvaSourceRepairProviderPackage,
  compileProjectArtEvaSourceRepairProviderPackageFile,
  parseProjectArtEvaSourceRepairProviderPackage,
  parseProjectArtEvaSourceRepairProviderPackageForDispatch,
} from './project-art/eva-source-repair-provider-package.mjs';
import {
  compileAvatarFinalPassProviderRuntimeDispatch,
} from './project-art/avatar-final-pass-provider-runtime.mjs';
import {
  runAvatarFinalPassProviderRuntimeCli,
} from './avatar-final-pass-provider-runtime-cli.mjs';

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
  const hasAlphaChannel = index > 152;
  const outlierDimensions = new Map([
    [187, [1254, 1254]],
    [188, [1254, 1254]],
    [189, [1254, 1254]],
    [190, [1536, 1024]],
    [191, [1619, 971]],
  ]);
  const [width, height] = outlierDimensions.get(index) ?? [1024, 1536];
  return {
    sourcePath,
    materializedPath: `frames/frame-${String(index).padStart(3, '0')}.png`,
    sha256: sha256(`frame:${gitBlobSha1}`),
    gitBlobSha1,
    sizeBytes: 1_024 + index,
    media: {
      format: 'png',
      mimeType: 'image/png',
      width,
      height,
      bitDepth: 8,
      colourType: hasAlphaChannel ? 6 : 2,
      interlace: 0,
      hasAlphaChannel,
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

function providerAdmissions(intake) {
  const template =
    compileProjectArtEvaSourceRepairProviderAdmissionsTemplate(intake);
  const body = {
    schema: EVA_SOURCE_REPAIR_PROVIDER_ADMISSIONS_SCHEMA,
    intakeSha256: intake.intakeSha256,
    requestId: template.requestId,
    authorization: {
      action: 'run-provider-once',
      actorClass: 'human',
      actorId: 'eva-production-owner',
      occurredAt: '2026-08-15T11:02:00.000Z',
      expiresAt: '2026-08-15T12:02:00.000Z',
      evidenceSha256: sha256('provider-authorization-evidence'),
      authorizedJobIds: template.jobs.map((job) => job.jobId),
      maximumProviderCalls: 6,
      candidateCountPerJob: 1,
      allowFallback: false,
    },
    jobs: template.jobs.map((job) => {
      const artifactBindings = job.artifactBindings.map((binding) => ({
        ...binding,
        sourceSha256:
          binding.sourceSha256 ?? sha256(`mask:${job.jobId}`),
        artifactId: `artifact_${sha256(
          `artifact:${job.jobId}:${binding.bindingKey}`,
        )}`,
        evidenceSha256: sha256(
          `admission:${job.jobId}:${binding.bindingKey}`,
        ),
        actorId: 'eva-artifact-admitter',
        occurredAt: '2026-08-15T11:01:00.000Z',
      }));
      let maskAssurance = null;
      if (job.jobId.startsWith('redraw:')) {
        const frameId = job.jobId.replace(/^redraw:/u, '');
        const repair = intake.providerPlan.repairJobs.find(
          (entry) => entry.frameId === frameId,
        );
        const task = EVA_SOURCE_REPAIR_TASK_CATALOGUE.find(
          (entry) => entry.frameId === frameId,
        );
        const maskBinding = artifactBindings.find(
          (entry) => entry.bindingKey === 'defect-mask',
        );
        const envelopes = EVA_SOURCE_REPAIR_HAND_ENVELOPES[frameId];
        const maskBody = {
          schema: 'evavo.project-art-eva-source-repair-mask-assurance.v1',
          phase: 'pre-dispatch-mask-admission',
          frameId,
          taskId: task.taskId,
          inspectedAt: '2026-08-15T11:00:30.000Z',
          intakeSha256: intake.intakeSha256,
          canvas: { width: 1024, height: 1536 },
          source: {
            path: repair.sourcePath,
            sha256: repair.sourceSha256,
            gitBlobSha1: repair.sourceGitBlobSha1,
            encoding: 'rgb8',
            alphaChannelPresent: false,
            identityAuthority: 'sealed-eva-source-repair-intake',
          },
          mask: {
            path: maskBinding.sourcePath,
            sha256: maskBinding.sourceSha256,
            semantics: 'transparent-black-protected__opaque-white-editable',
            connectivity: 4,
            editablePixels: 3200,
            protectedPixels: 1569664,
            coverageRatio: 3200 / (1024 * 1536),
            components: [
              {
                side: 'left',
                pixelCount: 1600,
                bounds: {
                  minimumX: envelopes.left.minimumX + 10,
                  minimumY: envelopes.left.minimumY + 10,
                  maximumX: envelopes.left.minimumX + 49,
                  maximumY: envelopes.left.minimumY + 49,
                },
                envelope: envelopes.left,
              },
              {
                side: 'right',
                pixelCount: 1600,
                bounds: {
                  minimumX: envelopes.right.minimumX + 10,
                  minimumY: envelopes.right.minimumY + 10,
                  maximumX: envelopes.right.minimumX + 49,
                  maximumY: envelopes.right.minimumY + 49,
                },
                envelope: envelopes.right,
              },
            ],
            touchesCanvasEdge: false,
          },
          gates: {
            exactSourceIdentityPassed: true,
            exactCanvasPassed: true,
            canonicalBinaryMaskPassed: true,
            bilateralHandEnvelopePassed: true,
            faceTorsoWardrobeProtected: true,
            providerDispatchMaskReady: true,
            candidateApproval: false,
            productionAlphaReady: false,
            runtimeActivationAllowed: false,
          },
          authority: {
            sourceMutation: false,
            providerExecution: false,
            candidateApproval: false,
            candidatePromotion: false,
            alphaMasteringApproval: false,
            runtimeActivation: false,
            publication: false,
            repositoryMutation: false,
            gitCommit: false,
            gitPush: false,
            forcePush: false,
          },
        };
        maskAssurance = {
          ...maskBody,
          assuranceSha256:
            sha256ProjectArtEvaSourceRepairDocument(maskBody),
        };
        maskBinding.evidenceSha256 = maskAssurance.assuranceSha256;
      }
      return {
        jobId: job.jobId,
        selection: job.selection,
        artifactBindings,
        maskAssurance,
      };
    }),
    authority: {
      sourceMutation: false,
      automaticGenerationAuthorization: false,
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
    admissionsSha256: sha256ProjectArtEvaSourceRepairDocument(body),
  };
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
  assert.ok(
    batch.jobs
      .filter((job) => job.kind === 'provider-redraw')
      .every((job) => job.blockers.includes('defect-mask-artifact-required')),
  );
  assert.equal(batch.providerExecution, false);
  assert.equal(batch.candidateApproval, false);
});

test('mixed source encodings and non-job outliers compile while invalid job media fails closed', () => {
  const mixedManifest = manifest();
  assert.deepEqual(
    mixedManifest.frames.reduce(
      (counts, entry) => ({
        rgb: counts.rgb + Number(entry.media.colourType === 2),
        rgba: counts.rgba + Number(entry.media.colourType === 6),
      }),
      { rgb: 0, rgba: 0 },
    ),
    { rgb: 152, rgba: 39 },
  );
  assert.equal(
    mixedManifest.frames.filter(
      (entry) => entry.media.width !== 1024 || entry.media.height !== 1536,
    ).length,
    5,
  );
  const intake = compileProjectArtEvaSourceRepairIntake({
    handoff: handoff(),
    materializationManifest: mixedManifest,
    compiledAt: COMPILED_AT,
  });
  assert.ok(
    intake.providerPlan.repairJobs.every(
      (job) => job.editPolicy.actualRgbaAlphaRequired === true,
    ),
  );

  const inconsistent = structuredClone(mixedManifest);
  inconsistent.frames[0].media.hasAlphaChannel = true;
  const { manifestSha256: ignoredManifestSha256, ...inconsistentBody } =
    inconsistent;
  inconsistent.manifestSha256 =
    sha256ProjectArtEvaSourceRepairDocument(inconsistentBody);
  assert.throws(
    () =>
      compileProjectArtEvaSourceRepairIntake({
        handoff: handoff(),
        materializationManifest: inconsistent,
        compiledAt: COMPILED_AT,
      }),
    /EVA_SOURCE_REPAIR_INTAKE_FRAME_INVALID/u,
  );

  const invalidJobMedia = structuredClone(mixedManifest);
  const task = EVA_SOURCE_REPAIR_TASK_CATALOGUE[0];
  const taskFrame = invalidJobMedia.frames.find(
    (entry) => entry.sourcePath === task.sourcePath,
  );
  taskFrame.media.width = 1254;
  taskFrame.media.height = 1254;
  const { manifestSha256: ignoredJobMediaHash, ...invalidJobMediaBody } =
    invalidJobMedia;
  invalidJobMedia.manifestSha256 =
    sha256ProjectArtEvaSourceRepairDocument(invalidJobMediaBody);
  assert.throws(
    () =>
      compileProjectArtEvaSourceRepairIntake({
        handoff: handoff(),
        materializationManifest: invalidJobMedia,
        compiledAt: COMPILED_AT,
      }),
    /EVA_SOURCE_REPAIR_INTAKE_JOB_FRAME_PROFILE_INVALID/u,
  );
});

test('named authorization and exact mask admissions seal one six-job provider package', () => {
  const intake = compile();
  const template =
    compileProjectArtEvaSourceRepairProviderAdmissionsTemplate(intake);
  assert.equal(template.jobs.length, 6);
  assert.equal(
    template.jobs.filter((job) =>
      job.artifactBindings.some(
        (binding) => binding.bindingKey === 'defect-mask',
      ),
    ).length,
    5,
  );

  const providerPackage = compileProjectArtEvaSourceRepairProviderPackage({
    intake,
    admissions: providerAdmissions(intake),
    compiledAt: '2026-08-15T11:03:00.000Z',
  });
  assert.equal(providerPackage.schema, EVA_SOURCE_REPAIR_PROVIDER_PACKAGE_SCHEMA);
  assert.deepEqual(providerPackage.counts, {
    requested: 6,
    ready: 6,
    blocked: 0,
    redraws: 5,
    inbetweens: 1,
  });
  assert.equal(providerPackage.providerExecution, false);
  assert.equal(providerPackage.candidateApproval, false);
  assert.equal(providerPackage.runtimeActivationAllowed, false);
  assert.equal(
    parseProjectArtEvaSourceRepairProviderPackage(providerPackage).packageSha256,
    providerPackage.packageSha256,
  );

  const redraw = providerPackage.providerBatch.jobs.find(
    (job) => job.kind === 'provider-redraw',
  );
  const providerReferenceRoles = new Set([
    'canonical-identity',
    'direction-master',
    'previous-key-pose',
    'next-key-pose',
    'base-image',
    'mask',
    'pose-control',
    'edge-control',
    'depth-control',
    'palette-reference',
    'line-reference',
    'material-reference',
    'layer-context',
  ]);
  assert.equal(
    redraw.providerRequestInput.references.filter(
      (reference) => reference.role === 'mask',
    ).length,
    1,
  );
  assert.ok(
    redraw.providerRequestInput.references.every((reference) =>
      providerReferenceRoles.has(reference.role),
    ),
  );
  assert.equal(redraw.providerRequestInput.target.transparency, 'opaque');
  assert.equal(redraw.providerRequestInput.background.strategy, 'opaque-source');
  assert.match(
    redraw.composedPrompt,
    /production alpha mastering is a separate downstream gate/u,
  );
  const inbetween = providerPackage.providerBatch.jobs.find(
    (job) => job.kind === 'provider-generated-inbetween',
  );
  assert.equal(inbetween.providerRequestInput.target.transparency, 'required');
  assert.equal(inbetween.providerRequestInput.background.strategy, 'native-alpha');
  const dispatch = compileAvatarFinalPassProviderRuntimeDispatch({
    batch: providerPackage.providerBatch,
    jobId: redraw.jobId,
    compiledAt: '2026-08-15T11:04:00.000Z',
  });
  assert.ok(
    dispatch.expectedRuntimeContract.requiredCapabilityProfile.includes(
      'mask',
    ),
  );
  assert.ok(
    dispatch.expectedRuntimeContract.requiredCapabilityProfile.includes(
      'cancellation',
    ),
  );
  assert.ok(
    !dispatch.expectedRuntimeContract.requiredCapabilityProfile.includes(
      'native-alpha',
    ),
  );
});

test('expired authorization, missing masks and package tampering fail closed', () => {
  const intake = compile();

  const expired = providerAdmissions(intake);
  expired.authorization.expiresAt = '2026-08-15T11:02:30.000Z';
  const { admissionsSha256: ignoredExpiredHash, ...expiredBody } = expired;
  expired.admissionsSha256 =
    sha256ProjectArtEvaSourceRepairDocument(expiredBody);
  assert.throws(
    () =>
      compileProjectArtEvaSourceRepairProviderPackage({
        intake,
        admissions: expired,
        compiledAt: '2026-08-15T11:03:00.000Z',
      }),
    /EVA_SOURCE_REPAIR_PROVIDER_AUTHORIZATION_WINDOW_INVALID/u,
  );

  const missingMask = providerAdmissions(intake);
  missingMask.jobs[0].artifactBindings =
    missingMask.jobs[0].artifactBindings.filter(
      (binding) => binding.bindingKey !== 'defect-mask',
    );
  const { admissionsSha256: ignoredMaskHash, ...missingMaskBody } = missingMask;
  missingMask.admissionsSha256 =
    sha256ProjectArtEvaSourceRepairDocument(missingMaskBody);
  assert.throws(
    () =>
      compileProjectArtEvaSourceRepairProviderPackage({
        intake,
        admissions: missingMask,
        compiledAt: '2026-08-15T11:03:00.000Z',
      }),
    (error) =>
      error?.code === 'EVA_SOURCE_REPAIR_PROVIDER_DEFECT_MASK_INVALID',
  );

  const failedMaskAssurance = providerAdmissions(intake);
  failedMaskAssurance.jobs[0].maskAssurance.gates.bilateralHandEnvelopePassed =
    false;
  const {
    assuranceSha256: ignoredAssuranceSha256,
    ...failedMaskAssuranceBody
  } = failedMaskAssurance.jobs[0].maskAssurance;
  failedMaskAssurance.jobs[0].maskAssurance.assuranceSha256 =
    sha256ProjectArtEvaSourceRepairDocument(failedMaskAssuranceBody);
  failedMaskAssurance.jobs[0].artifactBindings.find(
    (binding) => binding.bindingKey === 'defect-mask',
  ).evidenceSha256 =
    failedMaskAssurance.jobs[0].maskAssurance.assuranceSha256;
  const {
    admissionsSha256: ignoredFailedMaskAdmissionsSha256,
    ...failedMaskAdmissionsBody
  } = failedMaskAssurance;
  failedMaskAssurance.admissionsSha256 =
    sha256ProjectArtEvaSourceRepairDocument(failedMaskAdmissionsBody);
  assert.throws(
    () =>
      compileProjectArtEvaSourceRepairProviderPackage({
        intake,
        admissions: failedMaskAssurance,
        compiledAt: '2026-08-15T11:03:00.000Z',
      }),
    (error) =>
      error?.code === 'EVA_SOURCE_REPAIR_PROVIDER_MASK_ASSURANCE_INVALID',
  );

  const providerPackage = compileProjectArtEvaSourceRepairProviderPackage({
    intake,
    admissions: providerAdmissions(intake),
    compiledAt: '2026-08-15T11:03:00.000Z',
  });
  assert.throws(
    () =>
      parseProjectArtEvaSourceRepairProviderPackageForDispatch(
        providerPackage,
        '2026-08-15T12:02:00.000Z',
      ),
    (error) =>
      error?.code ===
      'EVA_SOURCE_REPAIR_PROVIDER_DISPATCH_AUTHORIZATION_EXPIRED',
  );
  const tampered = structuredClone(providerPackage);
  tampered.providerBatch.jobs[0].providerExecution = true;
  assert.throws(
    () => parseProjectArtEvaSourceRepairProviderPackage(tampered),
    (error) =>
      error?.code === 'EVA_SOURCE_REPAIR_PROVIDER_SELF_HASH_MISMATCH',
  );
});

test('create-only files carry intake through admissions template, package and runtime dispatch', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'eva-provider-package-'));
  try {
    const intake = compile();
    const admissions = providerAdmissions(intake);
    const intakePath = path.join(root, 'intake.json');
    const admissionsPath = path.join(root, 'admissions.json');
    const templatePath = path.join(root, 'admissions-template.json');
    const packagePath = path.join(root, 'provider-package.json');
    const dispatchPath = path.join(root, 'runtime-dispatch.json');
    writeFileSync(intakePath, `${JSON.stringify(intake, null, 2)}\n`);
    writeFileSync(admissionsPath, `${JSON.stringify(admissions, null, 2)}\n`);

    const templateResult =
      compileProjectArtEvaSourceRepairProviderAdmissionsTemplateFile({
        intakePath,
        outputPath: templatePath,
      });
    assert.equal(templateResult.template.jobs.length, 6);

    const packageResult = compileProjectArtEvaSourceRepairProviderPackageFile({
      intakePath,
      admissionsPath,
      outputPath: packagePath,
      compiledAt: '2026-08-15T11:03:00.000Z',
    });
    assert.equal(packageResult.providerPackage.counts.ready, 6);
    const firstJob = packageResult.providerPackage.providerBatch.jobs[0].jobId;
    const dispatchResult = runAvatarFinalPassProviderRuntimeCli([
      'dispatch-package',
      '--package',
      packagePath,
      '--job-id',
      firstJob,
      '--output',
      dispatchPath,
      '--compiled-at',
      '2026-08-15T11:04:00.000Z',
    ]);
    assert.equal(dispatchResult.jobId, firstJob);
    assert.equal(
      dispatchResult.sourcePackageSha256,
      packageResult.providerPackage.packageSha256,
    );
    assert.equal(JSON.parse(readFileSync(dispatchPath, 'utf8')).jobId, firstJob);

    assert.throws(
      () =>
        compileProjectArtEvaSourceRepairProviderPackageFile({
          intakePath,
          admissionsPath,
          outputPath: packagePath,
          compiledAt: '2026-08-15T11:03:00.000Z',
        }),
      /EEXIST/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
