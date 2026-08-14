import {
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import {
  AVATAR_FINAL_PASS_PROVIDER_REQUEST_SCHEMA,
  FINAL_PASS_PLAN_SCHEMA,
  SHA1_PATTERN,
  SHA256_PATTERN,
} from './avatar-final-pass-provider-constants.mjs';
import {
  canonicalAvatarFinalPassProviderJson,
  createAvatarFinalPassProviderAuthority,
  sha256AvatarFinalPassProviderDocument,
} from './avatar-final-pass-provider-common.mjs';
import {
  EVA_SOURCE_REPAIR_TASK_CATALOGUE,
  EVA_SOURCE_REPAIR_TASK_CATALOGUE_SHA256,
} from './eva-source-repair-catalogue.mjs';

export const EVA_SOURCE_REPAIR_HANDOFF_SCHEMA =
  'evavo.avatar.eva-source-repair-art-studio-handoff.v1';
export const EVA_SOURCE_REPAIR_INTAKE_SCHEMA =
  'evavo.project-art-eva-source-repair-intake.v1';
export const EVA_SOURCE_REPAIR_MATERIALIZATION_SCHEMA =
  'evavo.avatar.art-materialization-manifest.v2';

const SOURCE_PLAN_SCHEMA = 'evavo.avatar.eva-source-repair-plan.v1';
const RUNTIME_REPOSITORY = 'EVAVO-STUDIO/evavo-avatar-runtime';
const ART_STUDIO_REPOSITORY = 'EVAVO-STUDIO/evavo-art-studio';
const CHARACTER_ID = 'eva-female';
const CANVAS = Object.freeze({ width: 1024, height: 1536 });
const MAXIMUM_DOCUMENT_BYTES = 4 * 1024 * 1024;
const MAXIMUM_FRAME_BYTES = 64 * 1024 * 1024;
const EXPECTED_FRAME_COUNT = 191;
const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,191}$/u;
const VERSION = /^\d+\.\d+\.\d+$/u;

const HANDOFF_AUTHORITY_KEYS = Object.freeze([
  'sourceMutation',
  'sourceDeletion',
  'providerExecution',
  'candidateApproval',
  'candidatePromotion',
  'repositoryMutation',
  'gitCommit',
  'gitPush',
  'deployment',
  'publication',
  'runtimeActivation',
  'forcePush',
]);

export class ProjectArtEvaSourceRepairIntakeError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ProjectArtEvaSourceRepairIntakeError';
    this.code = code;
  }
}

function fail(code, message = code) {
  throw new ProjectArtEvaSourceRepairIntakeError(
    code,
    message === code ? code : `${code}: ${message}`,
  );
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null;
}

function exact(value, keys, label) {
  if (!record(value)) fail('EVA_SOURCE_REPAIR_INTAKE_OBJECT_INVALID', label);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail('EVA_SOURCE_REPAIR_INTAKE_KEYS_INVALID', label);
  }
}

function digest(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    fail('EVA_SOURCE_REPAIR_INTAKE_SHA256_INVALID', label);
  }
  return value;
}

function sourceRef(value, label) {
  if (typeof value !== 'string' || !SHA1_PATTERN.test(value)) {
    fail('EVA_SOURCE_REPAIR_INTAKE_SHA1_INVALID', label);
  }
  return value;
}

function identifier(value, label) {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    fail('EVA_SOURCE_REPAIR_INTAKE_ID_INVALID', label);
  }
  return value;
}

function timestamp(value, label) {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    fail('EVA_SOURCE_REPAIR_INTAKE_TIMESTAMP_INVALID', label);
  }
  return value;
}

function relativePath(value, label) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 1024 ||
    value.includes('\\') ||
    value.includes('\0') ||
    value.startsWith('/') ||
    value.startsWith('../') ||
    value.includes('/../') ||
    value.includes('//') ||
    path.posix.normalize(value) !== value
  ) {
    fail('EVA_SOURCE_REPAIR_INTAKE_PATH_INVALID', label);
  }
  return value;
}

function allFalse(value, keys, label) {
  exact(value, keys, label);
  if (Object.values(value).some((entry) => entry !== false)) {
    fail('EVA_SOURCE_REPAIR_INTAKE_AUTHORITY_INVALID', label);
  }
  return Object.freeze({ ...value });
}

function hash(value) {
  return sha256AvatarFinalPassProviderDocument(value);
}

function parseSourcePlan(value) {
  exact(
    value,
    [
      'schema',
      'requestId',
      'characterId',
      'actorId',
      'createdAt',
      'sourceTreeSha1',
      'sourceContractSha256',
      'productionProfileSha256',
      'outputRoot',
      'ownerApprovalSha256',
      'tasks',
      'releaseGates',
      'authority',
      'planFingerprint',
    ],
    'sourcePlan',
  );
  if (
    value.schema !== SOURCE_PLAN_SCHEMA ||
    value.characterId !== CHARACTER_ID ||
    !Array.isArray(value.tasks) ||
    value.tasks.length !== EVA_SOURCE_REPAIR_TASK_CATALOGUE.length ||
    canonicalAvatarFinalPassProviderJson(value.tasks) !==
      canonicalAvatarFinalPassProviderJson(EVA_SOURCE_REPAIR_TASK_CATALOGUE) ||
    hash(value.tasks) !== EVA_SOURCE_REPAIR_TASK_CATALOGUE_SHA256
  ) {
    fail('EVA_SOURCE_REPAIR_INTAKE_SOURCE_PLAN_INVALID');
  }
  identifier(value.requestId, 'sourcePlan.requestId');
  identifier(value.actorId, 'sourcePlan.actorId');
  timestamp(value.createdAt, 'sourcePlan.createdAt');
  sourceRef(value.sourceTreeSha1, 'sourcePlan.sourceTreeSha1');
  digest(value.sourceContractSha256, 'sourcePlan.sourceContractSha256');
  digest(value.productionProfileSha256, 'sourcePlan.productionProfileSha256');
  relativePath(value.outputRoot, 'sourcePlan.outputRoot');
  digest(value.ownerApprovalSha256, 'sourcePlan.ownerApprovalSha256');
  const releaseGateKeys = [
    'sourceBytesMaterialized',
    'allTaskEvidencePassed',
    'creativeApprovalRecorded',
    'atlasRegenerated',
    'sequenceReleaseRegenerated',
    'browserPlaybackReverified',
    'topHatProductionMayStart',
  ];
  allFalse(value.releaseGates, releaseGateKeys, 'sourcePlan.releaseGates');
  allFalse(
    value.authority,
    [
      'sourceOverwrite',
      'providerExecution',
      'candidateApproval',
      'repositoryWrite',
      'publication',
      'runtimeActivation',
      'deployment',
      'forcePush',
    ],
    'sourcePlan.authority',
  );
  const { planFingerprint, ...body } = value;
  if (digest(planFingerprint, 'sourcePlan.planFingerprint') !== hash(body)) {
    fail('EVA_SOURCE_REPAIR_INTAKE_SOURCE_PLAN_FINGERPRINT_INVALID');
  }
  return Object.freeze({ ...value });
}

export function parseEvaSourceRepairHandoff(value) {
  exact(
    value,
    [
      'schema',
      'handoffId',
      'createdAt',
      'runtime',
      'artStudio',
      'sourcePlan',
      'taskCatalogueSha256',
      'requiredMaterializationSchema',
      'authority',
      'handoffFingerprint',
    ],
    'handoff',
  );
  exact(value.runtime, ['repository', 'commit', 'tree', 'packageVersion'], 'handoff.runtime');
  exact(
    value.artStudio,
    [
      'repository',
      'commit',
      'tree',
      'intakeSchema',
      'providerPlanSchema',
      'providerRequestSchema',
    ],
    'handoff.artStudio',
  );
  if (
    value.schema !== EVA_SOURCE_REPAIR_HANDOFF_SCHEMA ||
    value.runtime.repository !== RUNTIME_REPOSITORY ||
    value.artStudio.repository !== ART_STUDIO_REPOSITORY ||
    value.artStudio.intakeSchema !== EVA_SOURCE_REPAIR_INTAKE_SCHEMA ||
    value.artStudio.providerPlanSchema !== FINAL_PASS_PLAN_SCHEMA ||
    value.artStudio.providerRequestSchema !==
      AVATAR_FINAL_PASS_PROVIDER_REQUEST_SCHEMA ||
    value.requiredMaterializationSchema !==
      EVA_SOURCE_REPAIR_MATERIALIZATION_SCHEMA ||
    value.taskCatalogueSha256 !== EVA_SOURCE_REPAIR_TASK_CATALOGUE_SHA256 ||
    !VERSION.test(value.runtime.packageVersion)
  ) {
    fail('EVA_SOURCE_REPAIR_INTAKE_HANDOFF_INVALID');
  }
  identifier(value.handoffId, 'handoff.handoffId');
  timestamp(value.createdAt, 'handoff.createdAt');
  sourceRef(value.runtime.commit, 'handoff.runtime.commit');
  sourceRef(value.runtime.tree, 'handoff.runtime.tree');
  sourceRef(value.artStudio.commit, 'handoff.artStudio.commit');
  sourceRef(value.artStudio.tree, 'handoff.artStudio.tree');
  parseSourcePlan(value.sourcePlan);
  allFalse(value.authority, HANDOFF_AUTHORITY_KEYS, 'handoff.authority');
  const { handoffFingerprint, ...body } = value;
  if (digest(handoffFingerprint, 'handoff.handoffFingerprint') !== hash(body)) {
    fail('EVA_SOURCE_REPAIR_INTAKE_HANDOFF_FINGERPRINT_INVALID');
  }
  return Object.freeze({ ...value });
}

function parseMaterializedFrame(value, index) {
  exact(
    value,
    [
      'sourcePath',
      'materializedPath',
      'sha256',
      'gitBlobSha1',
      'sizeBytes',
      'media',
      'sourceBatchId',
      'ordinal',
    ],
    `manifest.frames[${index}]`,
  );
  const media = record(value.media);
  if (
    !media ||
    media.format !== 'png' ||
    media.width !== CANVAS.width ||
    media.height !== CANVAS.height ||
    media.hasAlphaChannel !== true ||
    media.animated !== false ||
    !Number.isSafeInteger(value.sizeBytes) ||
    value.sizeBytes < 33 ||
    value.sizeBytes > MAXIMUM_FRAME_BYTES ||
    !Number.isSafeInteger(value.ordinal) ||
    value.ordinal < 1 ||
    value.ordinal > 999
  ) {
    fail('EVA_SOURCE_REPAIR_INTAKE_FRAME_INVALID');
  }
  return Object.freeze({
    sourcePath: relativePath(value.sourcePath, `manifest.frames[${index}].sourcePath`),
    materializedPath: relativePath(
      value.materializedPath,
      `manifest.frames[${index}].materializedPath`,
    ),
    sha256: digest(value.sha256, `manifest.frames[${index}].sha256`),
    gitBlobSha1: sourceRef(
      value.gitBlobSha1,
      `manifest.frames[${index}].gitBlobSha1`,
    ),
    sizeBytes: value.sizeBytes,
    media: Object.freeze({ ...media }),
    sourceBatchId: identifier(
      value.sourceBatchId,
      `manifest.frames[${index}].sourceBatchId`,
    ),
    ordinal: value.ordinal,
  });
}

function parseMaterializationManifest(value, handoff) {
  exact(
    value,
    [
      'schema',
      'repository',
      'sourceRef',
      'characterId',
      'sourceRoot',
      'semanticStatus',
      'semanticAssignmentPerformed',
      'timestampOrderUsedAsMeaning',
      'generationOrderUsedAsMeaning',
      'frameCount',
      'totalBytes',
      'frames',
      'excludedSourceFiles',
      'transport',
      'publication',
      'authority',
      'manifestSha256',
    ],
    'manifest',
  );
  if (
    value.schema !== EVA_SOURCE_REPAIR_MATERIALIZATION_SCHEMA ||
    value.repository !== RUNTIME_REPOSITORY ||
    value.sourceRef !== handoff.runtime.commit ||
    value.characterId !== CHARACTER_ID ||
    value.sourceRoot !== 'assets/eva-female' ||
    value.semanticStatus !== 'unreviewed' ||
    value.semanticAssignmentPerformed !== false ||
    value.timestampOrderUsedAsMeaning !== false ||
    value.generationOrderUsedAsMeaning !== false ||
    !Array.isArray(value.frames) ||
    value.frames.length !== EXPECTED_FRAME_COUNT ||
    value.frameCount !== value.frames.length ||
    !Array.isArray(value.excludedSourceFiles) ||
    value.transport?.sourceBytesEmbeddedInManifest !== false ||
    value.publication?.binaryBlobApiSupported !== true ||
    value.publication?.managedPathPublicationRequired !== true ||
    value.publication?.forcePushAllowed !== false
  ) {
    fail('EVA_SOURCE_REPAIR_INTAKE_MANIFEST_INVALID');
  }
  const frames = Object.freeze(value.frames.map(parseMaterializedFrame));
  const sourcePaths = new Set(frames.map((frame) => frame.sourcePath));
  const materializedPaths = new Set(frames.map((frame) => frame.materializedPath));
  if (
    sourcePaths.size !== frames.length ||
    materializedPaths.size !== frames.length ||
    value.totalBytes !== frames.reduce((sum, frame) => sum + frame.sizeBytes, 0)
  ) {
    fail('EVA_SOURCE_REPAIR_INTAKE_MANIFEST_FRAME_SET_INVALID');
  }
  if (!record(value.authority) || Object.values(value.authority).some((entry) => entry !== false)) {
    fail('EVA_SOURCE_REPAIR_INTAKE_MANIFEST_AUTHORITY_INVALID');
  }
  const { manifestSha256, ...body } = value;
  if (digest(manifestSha256, 'manifest.manifestSha256') !== hash(body)) {
    fail('EVA_SOURCE_REPAIR_INTAKE_MANIFEST_FINGERPRINT_INVALID');
  }
  return Object.freeze({ ...value, frames });
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freezeDeep(child);
  return value;
}

function providerPlanAndRequest(handoff, manifest, compiledAt) {
  const bySourcePath = new Map(manifest.frames.map((frame) => [frame.sourcePath, frame]));
  const byBlob = new Map();
  for (const frame of manifest.frames) {
    const entries = byBlob.get(frame.gitBlobSha1) ?? [];
    entries.push(frame);
    byBlob.set(frame.gitBlobSha1, entries);
  }
  for (const entries of byBlob.values()) {
    entries.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath, 'en'));
  }
  const exactSource = (task) => {
    const frame = bySourcePath.get(task.sourcePath);
    if (!frame || frame.gitBlobSha1 !== task.sourceGitBlobSha1) {
      fail('EVA_SOURCE_REPAIR_INTAKE_SOURCE_IDENTITY_MISMATCH', task.taskId);
    }
    return frame;
  };
  const blobSource = (reference) => {
    const frame = byBlob.get(reference.referenceGitBlobSha1)?.[0];
    if (!frame) {
      fail(
        'EVA_SOURCE_REPAIR_INTAKE_REFERENCE_IDENTITY_MISSING',
        reference.referenceFrameId,
      );
    }
    return frame;
  };
  const descriptors = new Map();
  const addDescriptor = (id, frame) => {
    const previous = descriptors.get(id);
    if (previous && previous.expectedSha256 !== frame.sha256) {
      fail('EVA_SOURCE_REPAIR_INTAKE_DESCRIPTOR_CONFLICT', id);
    }
    descriptors.set(
      id,
      Object.freeze({
        id,
        sourcePath: frame.materializedPath,
        targetPath: frame.materializedPath,
        expectedSha256: frame.sha256,
        pendingOutput: false,
      }),
    );
  };

  const repairJobs = [];
  const inbetweenJobs = [];
  const requestJobs = [];
  const sessionId = 'eva-source-repair-v1';
  for (const task of handoff.sourcePlan.tasks) {
    const targetPath = relativePath(
      `${handoff.sourcePlan.outputRoot}/${task.targetRelativePath}`,
      `${task.taskId}.targetPath`,
    );
    if (task.kind === 'masked-source-edit') {
      const source = exactSource(task);
      addDescriptor(task.frameId, source);
      for (const reference of task.references) {
        addDescriptor(reference.referenceFrameId, blobSource(reference));
      }
      repairJobs.push(
        Object.freeze({
          schema: 'evavo.project-art-avatar-frame-repair-request.v1',
          frameId: task.frameId,
          mode: 'provider-redraw',
          sourcePath: source.materializedPath,
          sourceSha256: source.sha256,
          sourceGitBlobSha1: source.gitBlobSha1,
          targetPath,
          issues: Object.freeze(['hands', 'fingers', 'anatomy']),
          declaredDefect: task.issue,
          operations: Object.freeze([]),
          referenceImages: Object.freeze(
            task.references.map((entry) =>
              blobSource(entry).materializedPath,
            ),
          ),
          editPolicy: task.editPolicy,
          providerExecutionAllowed: false,
          candidateApproval: false,
        }),
      );
      requestJobs.push({
        jobId: `redraw:${task.frameId}`,
        identityFrameId: task.frameId,
        frameId: task.frameId,
        notes:
          `Repair only ${task.issue} inside a precise hands-and-fingers mask; ` +
          'preserve every pixel outside the admitted mask.',
      });
    } else {
      const beforeReference = task.references[0];
      const afterReference = task.references[1];
      const before = blobSource(beforeReference);
      const after = blobSource(afterReference);
      addDescriptor(beforeReference.referenceFrameId, before);
      addDescriptor(afterReference.referenceFrameId, after);
      inbetweenJobs.push(
        Object.freeze({
          schema: 'evavo.project-art-avatar-inbetween-request.v1',
          frameId: task.frameId,
          method: 'provider-generated',
          before: Object.freeze({
            frameId: beforeReference.referenceFrameId,
            path: before.materializedPath,
            sourceSha256: before.sha256,
            sourceGitBlobSha1: before.gitBlobSha1,
          }),
          after: Object.freeze({
            frameId: afterReference.referenceFrameId,
            path: after.materializedPath,
            sourceSha256: after.sha256,
            sourceGitBlobSha1: after.gitBlobSha1,
          }),
          targetPath,
          durationMs: 80,
          constraints: Object.freeze([
            'hands',
            'fingers',
            'anatomy',
            'face-identity',
            'silhouette',
            'style',
          ]),
          editPolicy: task.editPolicy,
          canvas: CANVAS,
          productionEligible: false,
          providerExecutionAllowed: false,
          candidateApproval: false,
        }),
      );
      requestJobs.push({
        jobId: `inbetween:${task.frameId}`,
        identityFrameId: beforeReference.referenceFrameId,
        frameId: task.frameId,
        notes:
          'Generate one physically coherent in-between from only the two admitted endpoint blobs.',
      });
    }
  }

  const providerPlanBody = {
    schema: FINAL_PASS_PLAN_SCHEMA,
    sessionId,
    characterId: CHARACTER_ID,
    sourceCommit: handoff.runtime.commit,
    compiledAt,
    sourceRepair: Object.freeze({
      handoffFingerprint: handoff.handoffFingerprint,
      sourcePlanFingerprint: handoff.sourcePlan.planFingerprint,
      taskCatalogueSha256: handoff.taskCatalogueSha256,
      materializationManifestSha256: manifest.manifestSha256,
    }),
    canvas: CANVAS,
    repairJobs: Object.freeze(repairJobs),
    inbetweenJobs: Object.freeze(inbetweenJobs),
    sequenceMasteringRequestTemplate: Object.freeze({
      frames: Object.freeze([...descriptors.values()]),
    }),
    productionReady: false,
    runtimeActivationAllowed: false,
    authority: createAvatarFinalPassProviderAuthority(),
  };
  const providerPlan = freezeDeep({
    ...providerPlanBody,
    planSha256: hash(providerPlanBody),
  });
  const providerRequestTemplate = freezeDeep({
    schema: AVATAR_FINAL_PASS_PROVIDER_REQUEST_SCHEMA,
    requestId: `${handoff.handoffId}-provider`,
    planSha256: providerPlan.planSha256,
    jobs: requestJobs.map((job) => ({
      jobId: job.jobId,
      identityFrameId: job.identityFrameId,
      candidateOutputPath:
        `scratch/avatar-final-pass/${sessionId}/${job.frameId}/candidate-01.png`,
      selection: {
        preferredAdapterId: null,
        preferredModel: null,
        allowedAdapterIds: [],
        allowFallback: false,
        requireSeed: false,
        seed: null,
      },
      authorization: null,
      artifactBindings: [],
      notes: job.notes,
    })),
    authority: createAvatarFinalPassProviderAuthority(),
  });
  return Object.freeze({ providerPlan, providerRequestTemplate });
}

export function compileProjectArtEvaSourceRepairIntake({
  handoff,
  materializationManifest,
  compiledAt = new Date().toISOString(),
}) {
  timestamp(compiledAt, 'compiledAt');
  const parsedHandoff = parseEvaSourceRepairHandoff(handoff);
  const manifest = parseMaterializationManifest(
    materializationManifest,
    parsedHandoff,
  );
  const { providerPlan, providerRequestTemplate } = providerPlanAndRequest(
    parsedHandoff,
    manifest,
    compiledAt,
  );
  const body = {
    schema: EVA_SOURCE_REPAIR_INTAKE_SCHEMA,
    compiledAt,
    handoffFingerprint: parsedHandoff.handoffFingerprint,
    sourcePlanFingerprint: parsedHandoff.sourcePlan.planFingerprint,
    taskCatalogueSha256: parsedHandoff.taskCatalogueSha256,
    materializationManifestSha256: manifest.manifestSha256,
    counts: Object.freeze({
      sourceFrames: manifest.frameCount,
      repairJobs: providerPlan.repairJobs.length,
      inbetweenJobs: providerPlan.inbetweenJobs.length,
      totalJobs:
        providerPlan.repairJobs.length + providerPlan.inbetweenJobs.length,
    }),
    providerPlan,
    providerRequestTemplate,
    nextRequiredActions: Object.freeze([
      'admit-exact-reference-artifacts',
      'human-provider-authorization-required',
      'record-named-human-run-once-provider-authorization',
      'compile-one-candidate-provider-batch',
      'materialize-candidates-create-only',
      'run-frame-finisher-and-dual-inspector-assurance',
      'record-separate-creative-approval',
      'regenerate-atlas-and-sequence-release',
      'reverify-browser-playback-before-runtime-activation',
    ]),
    sourceBytesEmbedded: false,
    providerExecution: false,
    candidateApproval: false,
    candidatePromotion: false,
    productionReady: false,
    runtimeActivationAllowed: false,
    topHatProductionMayStart: false,
    authority: parsedHandoff.authority,
  };
  return freezeDeep({ ...body, intakeSha256: hash(body) });
}

function stableJson(filePath, label) {
  const before = lstatSync(filePath);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.size < 2 ||
    before.size > MAXIMUM_DOCUMENT_BYTES
  ) {
    fail('EVA_SOURCE_REPAIR_INTAKE_FILE_INVALID', label);
  }
  const bytes = readFileSync(filePath);
  const after = lstatSync(filePath);
  for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    if (before[key] !== after[key]) {
      fail('EVA_SOURCE_REPAIR_INTAKE_FILE_CHANGED', label);
    }
  }
  let value;
  try {
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (source.startsWith('\uFEFF')) fail('EVA_SOURCE_REPAIR_INTAKE_BOM_FORBIDDEN', label);
    value = JSON.parse(source);
  } catch (error) {
    if (error instanceof ProjectArtEvaSourceRepairIntakeError) throw error;
    fail('EVA_SOURCE_REPAIR_INTAKE_JSON_INVALID', label);
  }
  return value;
}

export function compileProjectArtEvaSourceRepairIntakeFile({
  handoffPath,
  materializationManifestPath,
  outputPath,
  compiledAt,
}) {
  const intake = compileProjectArtEvaSourceRepairIntake({
    handoff: stableJson(path.resolve(handoffPath), 'handoff'),
    materializationManifest: stableJson(
      path.resolve(materializationManifestPath),
      'materializationManifest',
    ),
    ...(compiledAt ? { compiledAt } : {}),
  });
  const output = path.resolve(outputPath);
  const handle = openSync(output, 'wx', 0o600);
  try {
    writeFileSync(handle, `${JSON.stringify(intake, null, 2)}\n`, 'utf8');
  } finally {
    closeSync(handle);
  }
  return intake;
}

export function sha256ProjectArtEvaSourceRepairDocument(value) {
  return hash(value);
}
