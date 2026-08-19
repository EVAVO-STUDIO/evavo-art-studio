import { randomBytes } from 'node:crypto';
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
  constants as fsConstants,
} from 'node:fs';
import path from 'node:path';

import {
  assert,
  canonicalRelativePath,
  deepFreeze,
  digest,
  sha256Bytes,
  sha256Document,
  snapshotJsonValue,
  timestamp,
} from './avatar-final-pass-provider-candidate-common.mjs';
import {
  gitBlobSha1,
  inspectPngHeader,
  loadEvaDenseMotionSourcesForMaterialization,
  preflightEvaDenseMotionSources,
} from './eva-dense-motion-source-preflight.mjs';
import {
  verifyEvaDenseMotionTenMasterProgram,
} from './eva-dense-motion-ten-master-program.mjs';

export const EVA_DENSE_MOTION_SOURCE_MATERIALIZATION_PLAN_SCHEMA =
  'evavo.project-art-eva-dense-motion-source-materialization-plan.v1';
export const EVA_DENSE_MOTION_SOURCE_INSPECTION_SCHEMA =
  'evavo.project-art-eva-dense-motion-source-inspection.v1';
export const EVA_DENSE_MOTION_SOURCE_MATERIALIZATION_FRAME_RECEIPT_SCHEMA =
  'evavo.project-art-eva-dense-motion-source-materialization-frame-receipt.v1';
export const EVA_DENSE_MOTION_SOURCE_MATERIALIZATION_CAMPAIGN_RECEIPT_SCHEMA =
  'evavo.project-art-eva-dense-motion-source-materialization-campaign-receipt.v1';
export const EVA_DENSE_MOTION_SOURCE_MATERIALIZATION_CAPABILITIES_SCHEMA =
  'evavo.project-art-eva-dense-motion-source-materialization-capabilities.v1';
export const EVA_DENSE_MOTION_SOURCE_MATERIALIZATION_PROTOCOL_VERSION =
  '2026-08-20.1';

const MAXIMUM_JSON_BYTES = 8 * 1024 * 1024;
const MAXIMUM_PNG_BYTES = 64 * 1024 * 1024;
const FRAME_COUNT = 10;

function authority() {
  return Object.freeze({
    sourceRead: true,
    sourceCopyWrite: true,
    executionReceiptPersistence: true,
    sourceMutation: false,
    sourceDeletion: false,
    candidateCreation: false,
    candidateAssurance: false,
    alphaMatteCreation: false,
    alphaMastering: false,
    technicalInspection: false,
    creativeReview: false,
    candidateApproval: false,
    candidatePromotion: false,
    cloudinaryUpload: false,
    sequenceAdmission: false,
    sequenceRelease: false,
    targetRepositoryMutation: false,
    gitMutation: false,
    deployment: false,
    publication: false,
    runtimeActivation: false,
    forcePush: false,
  });
}

function assertAuthority(value) {
  const expected = authority();
  assert(
    value &&
      typeof value === 'object' &&
      Object.keys(value).length === Object.keys(expected).length &&
      Object.entries(expected).every(
        ([key, expectedValue]) => value[key] === expectedValue,
      ),
    'EVA_DENSE_SOURCE_MATERIALIZATION_AUTHORITY_INVALID',
  );
}

function realDirectory(value, label) {
  assert(
    typeof value === 'string' &&
      path.isAbsolute(value) &&
      !value.includes('\0') &&
      path.normalize(value) === value,
    'EVA_DENSE_SOURCE_MATERIALIZATION_ROOT_INVALID',
  );
  const metadata = lstatSync(value);
  assert(
    metadata.isDirectory() &&
      !metadata.isSymbolicLink() &&
      realpathSync(value) === value,
    'EVA_DENSE_SOURCE_MATERIALIZATION_ROOT_INVALID',
    `${label} must be a real normalized directory.`,
  );
  return value;
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveRelative(root, relative, label) {
  const canonical = canonicalRelativePath(relative, label);
  const absolute = path.join(root, ...canonical.split('/'));
  assert(inside(root, absolute), 'EVA_DENSE_SOURCE_MATERIALIZATION_PATH_ESCAPE');
  return absolute;
}

function stableFile(filePath, label, maximumBytes, minimumBytes) {
  const absolute = realpathSync(path.resolve(filePath));
  const before = lstatSync(absolute);
  assert(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1 &&
      before.size >= minimumBytes &&
      before.size <= maximumBytes,
    'EVA_DENSE_SOURCE_MATERIALIZATION_INPUT_INVALID',
    label,
  );
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    assert(
      before[key] === after[key],
      'EVA_DENSE_SOURCE_MATERIALIZATION_INPUT_CHANGED',
      label,
    );
  }
  return Object.freeze({ absolute, bytes, sha256: sha256Bytes(bytes) });
}

function stableJson(filePath, label) {
  const file = stableFile(filePath, label, MAXIMUM_JSON_BYTES, 2);
  let value;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes);
    assert(
      text.charCodeAt(0) !== 0xfeff,
      'EVA_DENSE_SOURCE_MATERIALIZATION_BOM_FORBIDDEN',
    );
    value = JSON.parse(text);
  } catch (error) {
    if (error?.code) throw error;
    assert(false, 'EVA_DENSE_SOURCE_MATERIALIZATION_JSON_INVALID', label);
  }
  return Object.freeze({ ...file, value });
}

function ensureDirectoryChain(root, relativeDirectory) {
  let current = root;
  if (!relativeDirectory || relativeDirectory === '.') return current;
  for (const part of relativeDirectory.split('/')) {
    current = path.join(current, part);
    if (!existsSync(current)) mkdirSync(current, { mode: 0o700 });
    const metadata = lstatSync(current);
    assert(
      metadata.isDirectory() &&
        !metadata.isSymbolicLink() &&
        inside(root, realpathSync(current)),
      'EVA_DENSE_SOURCE_MATERIALIZATION_OUTPUT_PARENT_INVALID',
    );
  }
  return current;
}

function safeUnlink(filePath) {
  try {
    unlinkSync(filePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function writeStaged(filePath, bytes) {
  const handle = openSync(filePath, 'wx', 0o600);
  try {
    writeFileSync(handle, bytes);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function publishCreateOnlyFrameBundle(root, entries) {
  const parentRelative = path.posix.dirname(entries[0].relative);
  assert(
    entries.every((entry) => path.posix.dirname(entry.relative) === parentRelative),
    'EVA_DENSE_SOURCE_MATERIALIZATION_BUNDLE_PARENT_MISMATCH',
  );
  const parent = ensureDirectoryChain(root, parentRelative);
  const finals = entries.map((entry) => ({
    ...entry,
    absolute: path.join(parent, path.posix.basename(entry.relative)),
  }));
  assert(
    finals.every((entry) => !existsSync(entry.absolute)),
    'EVA_DENSE_SOURCE_MATERIALIZATION_OUTPUT_ALREADY_EXISTS',
  );
  const token = randomBytes(12).toString('hex');
  const staged = finals.map((entry, index) =>
    path.join(parent, `.${path.basename(entry.absolute)}.${token}.${index}.tmp`),
  );
  const published = [];
  try {
    for (let index = 0; index < finals.length; index += 1) {
      writeStaged(staged[index], finals[index].bytes);
    }
    for (let index = 0; index < finals.length; index += 1) {
      copyFileSync(
        staged[index],
        finals[index].absolute,
        fsConstants.COPYFILE_EXCL,
      );
      published.push(finals[index].absolute);
    }
    for (const temporary of staged) safeUnlink(temporary);
  } catch (error) {
    for (const finalPath of published.reverse()) safeUnlink(finalPath);
    for (const temporary of staged) safeUnlink(temporary);
    throw error;
  }
  return Object.freeze(
    Object.fromEntries(finals.map((entry) => [entry.key, entry.absolute])),
  );
}

function sourceCopyRelative(job) {
  return `${job.outputs.frameRoot}/source.png`;
}

function campaignReceiptRelative(program) {
  const firstFrameRoot = program.production.jobs[0].outputs.frameRoot;
  const framesRoot = path.posix.dirname(firstFrameRoot);
  const outputRoot = path.posix.dirname(framesRoot);
  return `${outputRoot}/source-materialization.campaign.json`;
}

function framesForProgram(program) {
  assert(
    Array.isArray(program.production?.jobs) &&
      program.production.jobs.length === FRAME_COUNT,
    'EVA_DENSE_SOURCE_MATERIALIZATION_PROGRAM_FRAME_COUNT_INVALID',
  );
  return Object.freeze(
    program.production.jobs.map((job, index) => {
      const ordinal = index + 1;
      assert(
        job.ordinal === ordinal &&
          job.frameId ===
            `eva-20260809-153620-frame-${String(ordinal).padStart(2, '0')}`,
        'EVA_DENSE_SOURCE_MATERIALIZATION_PROGRAM_FRAME_ORDER_INVALID',
      );
      return Object.freeze({
        ordinal,
        frameId: job.frameId,
        relativePath: job.source.path,
        sourceGitBlobSha1: job.source.gitBlobSha1,
      });
    }),
  );
}

function sourceByOrdinal(preflight) {
  assert(
    preflight?.ok === true &&
      preflight.sourceFrameCount === FRAME_COUNT &&
      Array.isArray(preflight.sourceFrames) &&
      preflight.sourceFrames.length === FRAME_COUNT &&
      preflight.sourceFrames.every((frame, index) => frame.ordinal === index + 1) &&
      preflight.exactSourceIdentityVerified === true &&
      preflight.exactCanvasVerified === true &&
      preflight.allTenSourcesVerifiedBeforeMaterialization === true,
    'EVA_DENSE_SOURCE_MATERIALIZATION_PREFLIGHT_INVALID',
  );
  const sources = new Map(
    preflight.sourceFrames.map((frame) => [frame.ordinal, frame]),
  );
  assert(
    sources.size === FRAME_COUNT,
    'EVA_DENSE_SOURCE_MATERIALIZATION_PREFLIGHT_INVALID',
  );
  return sources;
}

function assertSourceMatchesJob(source, job, requireBytes) {
  assert(
    source?.ordinal === job.ordinal &&
      source.frameId === job.frameId &&
      source.relativePath === job.source.path &&
      source.gitBlobSha1 === job.source.gitBlobSha1 &&
      source.width === job.canvas.width &&
      source.height === job.canvas.height &&
      typeof source.sha256 === 'string' &&
      /^[a-f0-9]{64}$/u.test(source.sha256) &&
      Number.isSafeInteger(source.bytes) &&
      source.bytes >= 33,
    'EVA_DENSE_SOURCE_MATERIALIZATION_SOURCE_JOB_MISMATCH',
  );
  if (requireBytes) {
    assert(
      Buffer.isBuffer(source.sourceBytes) &&
        source.sourceBytes.length === source.bytes &&
        sha256Bytes(source.sourceBytes) === source.sha256 &&
        gitBlobSha1(source.sourceBytes) === job.source.gitBlobSha1,
      'EVA_DENSE_SOURCE_MATERIALIZATION_SOURCE_BYTES_INVALID',
    );
  }
}

export function compileEvaDenseMotionSourceFrameBundle({
  programSha256,
  job,
  sourceBytes: sourceBytesInput,
  materializedAt: materializedAtInput,
}) {
  digest(programSha256, 'programSha256');
  const materializedAt = timestamp(materializedAtInput, 'materializedAt');
  assert(
    job &&
      Number.isSafeInteger(job.ordinal) &&
      job.ordinal >= 1 &&
      job.ordinal <= FRAME_COUNT &&
      typeof job.jobId === 'string' &&
      typeof job.frameId === 'string' &&
      job.source?.readOnly === true &&
      job.source?.runtimeDeliveryAllowed === false &&
      job.canvas?.width === 1024 &&
      job.canvas?.height === 1536,
    'EVA_DENSE_SOURCE_MATERIALIZATION_JOB_INVALID',
  );
  const sourcePath = canonicalRelativePath(job.source.path, 'job.source.path');
  const copiedPath = canonicalRelativePath(sourceCopyRelative(job), 'sourceCopy');
  const sourceBytes = Buffer.from(sourceBytesInput ?? []);
  assert(
    sourceBytes.length >= 33 && sourceBytes.length <= MAXIMUM_PNG_BYTES,
    'EVA_DENSE_SOURCE_MATERIALIZATION_SOURCE_BYTES_INVALID',
  );
  const sourceGitBlobSha1 = gitBlobSha1(sourceBytes);
  assert(
    sourceGitBlobSha1 === job.source.gitBlobSha1,
    'EVA_DENSE_SOURCE_MATERIALIZATION_GIT_BLOB_MISMATCH',
  );
  const png = inspectPngHeader(sourceBytes);
  const sourceSha256 = sha256Bytes(sourceBytes);
  const sourceIdentity = Object.freeze({
    repository: job.source.repository,
    runtimeCommit: job.source.runtimeCommit,
    sourceTreeSha1: job.source.sourceTreeSha1,
    sourceContractSha256: job.source.sourceContractSha256,
    sourceFamilySha256: job.source.sourceFamilySha256,
    path: sourcePath,
    gitBlobSha1: sourceGitBlobSha1,
    sha256: sourceSha256,
    bytes: sourceBytes.length,
    readOnly: true,
    runtimeDeliveryAllowed: false,
  });
  const output = Object.freeze({
    path: copiedPath,
    sha256: sourceSha256,
    bytes: sourceBytes.length,
    width: png.width,
    height: png.height,
    createOnly: true,
    byteForByteCopy: true,
  });
  const inspectionBody = {
    schema: EVA_DENSE_MOTION_SOURCE_INSPECTION_SCHEMA,
    protocolVersion: EVA_DENSE_MOTION_SOURCE_MATERIALIZATION_PROTOCOL_VERSION,
    status: 'source-inspected-awaiting-candidate-production',
    inspectedAt: materializedAt,
    programSha256,
    jobId: job.jobId,
    ordinal: job.ordinal,
    frameId: job.frameId,
    source: sourceIdentity,
    materializedSource: output,
    png: Object.freeze({ ...png }),
    gates: Object.freeze({
      exactProgramJobBindingRequired: true,
      exactGitBlobIdentityPassed: true,
      exactSourceSha256Passed: true,
      canonicalCanvasPassed: true,
      supportedPngEncodingPassed: true,
      byteForByteCopyRequired: true,
      candidateCreationAllowed: false,
      candidateApprovalAllowed: false,
      publicationAllowed: false,
      runtimeActivationAllowed: false,
    }),
    authority: authority(),
  };
  const inspection = deepFreeze({
    ...inspectionBody,
    inspectionSha256: sha256Document(inspectionBody),
  });
  const receiptBody = {
    schema: EVA_DENSE_MOTION_SOURCE_MATERIALIZATION_FRAME_RECEIPT_SCHEMA,
    protocolVersion: EVA_DENSE_MOTION_SOURCE_MATERIALIZATION_PROTOCOL_VERSION,
    status: 'source-materialized-awaiting-candidate-production',
    materializedAt,
    programSha256,
    jobId: job.jobId,
    ordinal: job.ordinal,
    frameId: job.frameId,
    source: sourceIdentity,
    output,
    sourceInspection: Object.freeze({
      path: job.outputs.sourceInspection,
      inspectionSha256: inspection.inspectionSha256,
    }),
    nextRequiredEvidence: Object.freeze({
      denseCandidate: job.outputs.denseCandidate,
      candidateAssurance: job.outputs.candidateAssurance,
      alphaMatte: job.outputs.alphaMatte,
      alphaMatteReview: job.outputs.alphaMatteReview,
    }),
    effects: Object.freeze({
      sourceCopies: 1,
      sourceInspections: 1,
      candidatesCreated: 0,
      alphaMattesCreated: 0,
      alphaMastersCreated: 0,
      approvalsCreated: 0,
      cloudinaryUploads: 0,
      runtimeActivations: 0,
    }),
    authority: authority(),
  };
  const receipt = deepFreeze({
    ...receiptBody,
    materializationSha256: sha256Document(receiptBody),
  });
  return Object.freeze({
    status: receipt.status,
    sourceBytes,
    inspection,
    receipt,
  });
}

export function verifyEvaDenseMotionSourceInspection(input, programInput, jobInput) {
  const program = verifyEvaDenseMotionTenMasterProgram(programInput);
  const value = snapshotJsonValue(input, 'EVA dense source inspection');
  const job =
    jobInput ??
    program.production.jobs.find((entry) => entry.ordinal === value?.ordinal);
  assert(job, 'EVA_DENSE_SOURCE_INSPECTION_JOB_NOT_FOUND');
  assert(
    value?.schema === EVA_DENSE_MOTION_SOURCE_INSPECTION_SCHEMA &&
      value.protocolVersion ===
        EVA_DENSE_MOTION_SOURCE_MATERIALIZATION_PROTOCOL_VERSION &&
      value.status === 'source-inspected-awaiting-candidate-production' &&
      value.programSha256 === program.programSha256 &&
      value.jobId === job.jobId &&
      value.ordinal === job.ordinal &&
      value.frameId === job.frameId &&
      value.source?.repository === job.source.repository &&
      value.source?.runtimeCommit === job.source.runtimeCommit &&
      value.source?.sourceTreeSha1 === job.source.sourceTreeSha1 &&
      value.source?.sourceContractSha256 === job.source.sourceContractSha256 &&
      value.source?.sourceFamilySha256 === job.source.sourceFamilySha256 &&
      value.source?.path === job.source.path &&
      value.source?.gitBlobSha1 === job.source.gitBlobSha1 &&
      value.source?.readOnly === true &&
      value.source?.runtimeDeliveryAllowed === false &&
      value.materializedSource?.path === sourceCopyRelative(job) &&
      value.materializedSource?.sha256 === value.source.sha256 &&
      value.materializedSource?.bytes === value.source.bytes &&
      value.materializedSource?.width === 1024 &&
      value.materializedSource?.height === 1536 &&
      value.materializedSource?.createOnly === true &&
      value.materializedSource?.byteForByteCopy === true &&
      value.png?.width === 1024 &&
      value.png?.height === 1536 &&
      value.gates?.exactGitBlobIdentityPassed === true &&
      value.gates?.exactSourceSha256Passed === true &&
      value.gates?.canonicalCanvasPassed === true &&
      value.gates?.candidateCreationAllowed === false &&
      value.gates?.candidateApprovalAllowed === false &&
      value.gates?.publicationAllowed === false &&
      value.gates?.runtimeActivationAllowed === false,
    'EVA_DENSE_SOURCE_INSPECTION_INVALID',
  );
  timestamp(value.inspectedAt, 'inspectedAt');
  digest(value.source.sha256, 'source.sha256');
  digest(value.inspectionSha256, 'inspectionSha256');
  assertAuthority(value.authority);
  const body = { ...value };
  delete body.inspectionSha256;
  assert(
    sha256Document(body) === value.inspectionSha256,
    'EVA_DENSE_SOURCE_INSPECTION_HASH_MISMATCH',
  );
  return deepFreeze(value);
}

export function verifyEvaDenseMotionSourceMaterializationFrameReceipt(
  input,
  programInput,
  jobInput,
) {
  const program = verifyEvaDenseMotionTenMasterProgram(programInput);
  const value = snapshotJsonValue(input, 'EVA dense source materialization receipt');
  const job =
    jobInput ??
    program.production.jobs.find((entry) => entry.ordinal === value?.ordinal);
  assert(job, 'EVA_DENSE_SOURCE_MATERIALIZATION_FRAME_JOB_NOT_FOUND');
  assert(
    value?.schema ===
      EVA_DENSE_MOTION_SOURCE_MATERIALIZATION_FRAME_RECEIPT_SCHEMA &&
      value.protocolVersion ===
        EVA_DENSE_MOTION_SOURCE_MATERIALIZATION_PROTOCOL_VERSION &&
      value.status === 'source-materialized-awaiting-candidate-production' &&
      value.programSha256 === program.programSha256 &&
      value.jobId === job.jobId &&
      value.ordinal === job.ordinal &&
      value.frameId === job.frameId &&
      value.source?.repository === job.source.repository &&
      value.source?.runtimeCommit === job.source.runtimeCommit &&
      value.source?.sourceTreeSha1 === job.source.sourceTreeSha1 &&
      value.source?.sourceContractSha256 === job.source.sourceContractSha256 &&
      value.source?.sourceFamilySha256 === job.source.sourceFamilySha256 &&
      value.source?.path === job.source.path &&
      value.source?.gitBlobSha1 === job.source.gitBlobSha1 &&
      value.source?.readOnly === true &&
      value.source?.runtimeDeliveryAllowed === false &&
      value.output?.path === sourceCopyRelative(job) &&
      value.output?.sha256 === value.source.sha256 &&
      value.output?.bytes === value.source.bytes &&
      value.output?.width === 1024 &&
      value.output?.height === 1536 &&
      value.output?.createOnly === true &&
      value.output?.byteForByteCopy === true &&
      value.sourceInspection?.path === job.outputs.sourceInspection &&
      value.nextRequiredEvidence?.denseCandidate === job.outputs.denseCandidate &&
      value.nextRequiredEvidence?.candidateAssurance ===
        job.outputs.candidateAssurance &&
      value.nextRequiredEvidence?.alphaMatte === job.outputs.alphaMatte &&
      value.nextRequiredEvidence?.alphaMatteReview ===
        job.outputs.alphaMatteReview &&
      value.effects?.sourceCopies === 1 &&
      value.effects?.sourceInspections === 1 &&
      value.effects?.candidatesCreated === 0 &&
      value.effects?.alphaMattesCreated === 0 &&
      value.effects?.alphaMastersCreated === 0 &&
      value.effects?.approvalsCreated === 0 &&
      value.effects?.cloudinaryUploads === 0 &&
      value.effects?.runtimeActivations === 0,
    'EVA_DENSE_SOURCE_MATERIALIZATION_FRAME_RECEIPT_INVALID',
  );
  timestamp(value.materializedAt, 'materializedAt');
  for (const [label, digestValue] of [
    ['source.sha256', value.source.sha256],
    ['sourceInspection.inspectionSha256', value.sourceInspection?.inspectionSha256],
    ['materializationSha256', value.materializationSha256],
  ]) digest(digestValue, label);
  assertAuthority(value.authority);
  const body = { ...value };
  delete body.materializationSha256;
  assert(
    sha256Document(body) === value.materializationSha256,
    'EVA_DENSE_SOURCE_MATERIALIZATION_FRAME_RECEIPT_HASH_MISMATCH',
  );
  return deepFreeze(value);
}

export function verifyEvaDenseMotionSourceMaterializationCampaignReceipt(
  input,
  programInput,
) {
  const program = verifyEvaDenseMotionTenMasterProgram(programInput);
  const value = snapshotJsonValue(input, 'EVA dense source materialization campaign');
  assert(
    value?.schema ===
      EVA_DENSE_MOTION_SOURCE_MATERIALIZATION_CAMPAIGN_RECEIPT_SCHEMA &&
      value.protocolVersion ===
        EVA_DENSE_MOTION_SOURCE_MATERIALIZATION_PROTOCOL_VERSION &&
      value.status === 'succeeded-awaiting-candidate-production' &&
      value.programSha256 === program.programSha256 &&
      Array.isArray(value.frames) &&
      value.frames.length === FRAME_COUNT &&
      value.effects?.sourceCopiesPresent === FRAME_COUNT &&
      value.effects?.sourceInspectionsPresent === FRAME_COUNT &&
      value.effects?.sourceMaterializationReceiptsPresent === FRAME_COUNT &&
      Number.isSafeInteger(value.effects?.framesExecutedThisRun) &&
      Number.isSafeInteger(value.effects?.framesReusedThisRun) &&
      value.effects.framesExecutedThisRun >= 0 &&
      value.effects.framesReusedThisRun >= 0 &&
      value.effects.framesExecutedThisRun + value.effects.framesReusedThisRun ===
        FRAME_COUNT &&
      value.effects?.candidatesCreated === 0 &&
      value.effects?.alphaMattesCreated === 0 &&
      value.effects?.alphaMastersCreated === 0 &&
      value.effects?.approvalsCreated === 0 &&
      value.effects?.cloudinaryUploads === 0 &&
      value.effects?.runtimeActivations === 0,
    'EVA_DENSE_SOURCE_MATERIALIZATION_CAMPAIGN_RECEIPT_INVALID',
  );
  timestamp(value.completedAt, 'completedAt');
  digest(value.campaignReceiptSha256, 'campaignReceiptSha256');
  value.frames.forEach((frame, index) => {
    const job = program.production.jobs[index];
    assert(
      frame.ordinal === index + 1 &&
        frame.frameId === job.frameId &&
        frame.sourceGitBlobSha1 === job.source.gitBlobSha1,
      'EVA_DENSE_SOURCE_MATERIALIZATION_CAMPAIGN_FRAME_ORDER_INVALID',
    );
    for (const [label, digestValue] of [
      ['sourceSha256', frame.sourceSha256],
      ['inspectionSha256', frame.inspectionSha256],
      ['materializationSha256', frame.materializationSha256],
    ]) digest(digestValue, `frames[${index}].${label}`);
  });
  assertAuthority(value.authority);
  const body = { ...value };
  delete body.campaignReceiptSha256;
  assert(
    sha256Document(body) === value.campaignReceiptSha256,
    'EVA_DENSE_SOURCE_MATERIALIZATION_CAMPAIGN_RECEIPT_HASH_MISMATCH',
  );
  return deepFreeze(value);
}

export function publishEvaDenseMotionSourceFrameBundleFiles({
  workspaceRoot: workspaceRootInput,
  job,
  bundle,
}) {
  const root = realDirectory(workspaceRootInput, 'workspaceRoot');
  assert(
    bundle?.receipt?.ordinal === job.ordinal &&
      bundle.receipt.frameId === job.frameId &&
      bundle.receipt.output.path === sourceCopyRelative(job) &&
      bundle.receipt.sourceInspection.path === job.outputs.sourceInspection &&
      bundle.receipt.materializationSha256 &&
      bundle.inspection?.inspectionSha256 &&
      Buffer.isBuffer(bundle.sourceBytes),
    'EVA_DENSE_SOURCE_MATERIALIZATION_BUNDLE_INVALID',
  );
  const paths = publishCreateOnlyFrameBundle(root, [
    {
      key: 'source',
      relative: bundle.receipt.output.path,
      bytes: bundle.sourceBytes,
    },
    {
      key: 'inspection',
      relative: job.outputs.sourceInspection,
      bytes: jsonBytes(bundle.inspection),
    },
    {
      key: 'materialization',
      relative: job.outputs.sourceMaterialization,
      bytes: jsonBytes(bundle.receipt),
    },
  ]);
  return Object.freeze({ status: bundle.status, paths, ...bundle.receipt });
}

function existingCompletedFrame(root, program, job, source) {
  const materializationPath = resolveRelative(
    root,
    job.outputs.sourceMaterialization,
    'sourceMaterialization',
  );
  if (!existsSync(materializationPath)) return null;
  const materializationRecord = stableJson(
    materializationPath,
    'existing source materialization receipt',
  );
  const receipt = verifyEvaDenseMotionSourceMaterializationFrameReceipt(
    materializationRecord.value,
    program,
    job,
  );
  const sourceFile = stableFile(
    resolveRelative(root, receipt.output.path, 'materialized source'),
    'existing materialized source',
    MAXIMUM_PNG_BYTES,
    33,
  );
  assert(
    sourceFile.sha256 === receipt.output.sha256 &&
      sourceFile.bytes.length === receipt.output.bytes &&
      gitBlobSha1(sourceFile.bytes) === job.source.gitBlobSha1 &&
      sourceFile.sha256 === source.sha256 &&
      sourceFile.bytes.length === source.bytes,
    'EVA_DENSE_SOURCE_MATERIALIZATION_COMPLETED_SOURCE_INVALID',
  );
  const inspectionRecord = stableJson(
    resolveRelative(root, job.outputs.sourceInspection, 'sourceInspection'),
    'existing source inspection',
  );
  const inspection = verifyEvaDenseMotionSourceInspection(
    inspectionRecord.value,
    program,
    job,
  );
  assert(
    inspection.inspectionSha256 === receipt.sourceInspection.inspectionSha256 &&
      inspection.materializedSource.sha256 === sourceFile.sha256,
    'EVA_DENSE_SOURCE_MATERIALIZATION_COMPLETED_INSPECTION_INVALID',
  );
  return receipt;
}

function partialFrameOutputs(root, job) {
  return [sourceCopyRelative(job), job.outputs.sourceInspection].filter((relative) =>
    existsSync(resolveRelative(root, relative, 'partial source output')),
  );
}

function verifyCompletedCampaignEvidence(root, program, campaignReceipt, sources) {
  return Object.freeze(
    program.production.jobs.map((job, index) => {
      const source = sources.get(job.ordinal);
      const receipt = existingCompletedFrame(root, program, job, source);
      assert(
        receipt,
        'EVA_DENSE_SOURCE_MATERIALIZATION_COMPLETED_FRAME_RECEIPT_MISSING',
      );
      const summary = campaignReceipt.frames[index];
      assert(
        receipt.materializationSha256 === summary.materializationSha256 &&
          receipt.sourceInspection.inspectionSha256 === summary.inspectionSha256 &&
          receipt.output.sha256 === summary.sourceSha256,
        'EVA_DENSE_SOURCE_MATERIALIZATION_COMPLETED_CAMPAIGN_FRAME_MISMATCH',
      );
      return receipt;
    }),
  );
}

async function preparePlan({
  tenMasterProgram,
  runtimeRoot,
  workspaceRoot: workspaceRootInput,
  materializedAt: materializedAtInput,
  sourcePreflight = preflightEvaDenseMotionSources,
}) {
  assert(
    typeof sourcePreflight === 'function',
    'EVA_DENSE_SOURCE_MATERIALIZATION_PREFLIGHT_EXECUTOR_INVALID',
  );
  const program = verifyEvaDenseMotionTenMasterProgram(tenMasterProgram);
  const root = realDirectory(workspaceRootInput, 'workspaceRoot');
  const materializedAt = timestamp(materializedAtInput, 'materializedAt');
  const preflight = await sourcePreflight({
    runtimeRoot,
    frames: framesForProgram(program),
  });
  const sources = sourceByOrdinal(preflight);
  for (const job of program.production.jobs) {
    assertSourceMatchesJob(sources.get(job.ordinal), job, false);
  }
  const campaignReceiptPath = resolveRelative(
    root,
    campaignReceiptRelative(program),
    'campaignReceipt',
  );
  if (existsSync(campaignReceiptPath)) {
    const record = stableJson(
      campaignReceiptPath,
      'existing source materialization campaign receipt',
    );
    const receipt = verifyEvaDenseMotionSourceMaterializationCampaignReceipt(
      record.value,
      program,
    );
    verifyCompletedCampaignEvidence(root, program, receipt, sources);
    return Object.freeze({
      program,
      root,
      materializedAt,
      campaignReceiptPath,
      existingCampaignReceipt: receipt,
      prepared: Object.freeze([]),
    });
  }
  const prepared = program.production.jobs.map((job) => {
    const source = sources.get(job.ordinal);
    const completed = existingCompletedFrame(root, program, job, source);
    if (completed) {
      return Object.freeze({ job, source, mode: 'reuse-completed-frame', completed });
    }
    const partial = partialFrameOutputs(root, job);
    assert(
      partial.length === 0,
      'EVA_DENSE_SOURCE_MATERIALIZATION_PARTIAL_FRAME_QUARANTINED',
      `${job.frameId} has partial outputs: ${partial.join(', ')}`,
    );
    return Object.freeze({ job, source, mode: 'execute-frame' });
  });
  const planBody = {
    schema: EVA_DENSE_MOTION_SOURCE_MATERIALIZATION_PLAN_SCHEMA,
    protocolVersion: EVA_DENSE_MOTION_SOURCE_MATERIALIZATION_PROTOCOL_VERSION,
    status: 'ready-for-ten-source-frame-materialization',
    materializedAt,
    programSha256: program.programSha256,
    frames: Object.freeze(
      prepared.map((entry) =>
        Object.freeze({
          ordinal: entry.job.ordinal,
          frameId: entry.job.frameId,
          mode: entry.mode,
          sourceGitBlobSha1: entry.job.source.gitBlobSha1,
          sourceSha256: entry.source.sha256,
          sourceBytes: entry.source.bytes,
          outputPath: sourceCopyRelative(entry.job),
          ...(entry.completed
            ? { materializationSha256: entry.completed.materializationSha256 }
            : {}),
        }),
      ),
    ),
    policy: Object.freeze({
      exactTenSourceFramesRequired: true,
      allTenSourcesPreflightBeforeFirstWrite: true,
      byteForByteCopy: true,
      sequential: true,
      stopOnFirstFailure: true,
      createOnly: true,
      completedFrameBoundaryResumeSupported: true,
      midFramePartialStateRejected: true,
      completedCampaignReplayReverifiesSourceBytes: true,
      candidateCreationAllowed: false,
      providerExecutionAllowed: false,
      publicationAllowed: false,
      runtimeActivationAllowed: false,
    }),
    authority: authority(),
  };
  return Object.freeze({
    program,
    root,
    materializedAt,
    campaignReceiptPath,
    existingCampaignReceipt: null,
    prepared: Object.freeze(prepared),
    plan: deepFreeze({
      ...planBody,
      campaignPlanSha256: sha256Document(planBody),
    }),
  });
}

export async function compileEvaDenseMotionSourceMaterializationPlan(input) {
  const prepared = await preparePlan(input);
  if (prepared.existingCampaignReceipt) {
    return deepFreeze({
      schema: EVA_DENSE_MOTION_SOURCE_MATERIALIZATION_PLAN_SCHEMA,
      protocolVersion: EVA_DENSE_MOTION_SOURCE_MATERIALIZATION_PROTOCOL_VERSION,
      status: 'campaign-already-complete',
      programSha256: prepared.program.programSha256,
      campaignReceiptSha256:
        prepared.existingCampaignReceipt.campaignReceiptSha256,
      completedSourceBytesReverified: true,
      authority: authority(),
    });
  }
  return prepared.plan;
}

export async function runEvaDenseMotionSourceMaterializationCampaign({
  tenMasterProgram,
  runtimeRoot,
  workspaceRoot: workspaceRootInput,
  materializedAt: materializedAtInput,
}) {
  const program = verifyEvaDenseMotionTenMasterProgram(tenMasterProgram);
  const root = realDirectory(workspaceRootInput, 'workspaceRoot');
  const materializedAt = timestamp(materializedAtInput, 'materializedAt');
  const preflight = await loadEvaDenseMotionSourcesForMaterialization({
    runtimeRoot,
    frames: framesForProgram(program),
  });
  const sources = sourceByOrdinal(preflight);
  for (const job of program.production.jobs) {
    assertSourceMatchesJob(sources.get(job.ordinal), job, true);
  }
  const campaignReceiptPath = resolveRelative(
    root,
    campaignReceiptRelative(program),
    'campaignReceipt',
  );
  if (existsSync(campaignReceiptPath)) {
    const record = stableJson(
      campaignReceiptPath,
      'existing source materialization campaign receipt',
    );
    const receipt = verifyEvaDenseMotionSourceMaterializationCampaignReceipt(
      record.value,
      program,
    );
    verifyCompletedCampaignEvidence(root, program, receipt, sources);
    return deepFreeze({
      status: receipt.status,
      reused: true,
      completedSourceBytesReverified: true,
      receiptPath: campaignReceiptPath,
      receipt,
    });
  }

  const prepared = [];
  for (const job of program.production.jobs) {
    const source = sources.get(job.ordinal);
    const completed = existingCompletedFrame(root, program, job, source);
    if (completed) {
      prepared.push(Object.freeze({ job, source, mode: 'reuse-completed-frame', completed }));
      continue;
    }
    const partial = partialFrameOutputs(root, job);
    assert(
      partial.length === 0,
      'EVA_DENSE_SOURCE_MATERIALIZATION_PARTIAL_FRAME_QUARANTINED',
      `${job.frameId} has partial outputs: ${partial.join(', ')}`,
    );
    const bundle = compileEvaDenseMotionSourceFrameBundle({
      programSha256: program.programSha256,
      job,
      sourceBytes: source.sourceBytes,
      materializedAt,
    });
    prepared.push(Object.freeze({ job, source, mode: 'execute-frame', bundle }));
  }
  assert(
    prepared.length === FRAME_COUNT,
    'EVA_DENSE_SOURCE_MATERIALIZATION_FRAME_COUNT_INVALID',
  );

  const frameReceipts = [];
  let framesExecutedThisRun = 0;
  let framesReusedThisRun = 0;
  for (const entry of prepared) {
    if (entry.mode === 'reuse-completed-frame') {
      frameReceipts.push(entry.completed);
      framesReusedThisRun += 1;
      continue;
    }
    publishEvaDenseMotionSourceFrameBundleFiles({
      workspaceRoot: root,
      job: entry.job,
      bundle: entry.bundle,
    });
    const completed = existingCompletedFrame(
      root,
      program,
      entry.job,
      entry.source,
    );
    assert(
      completed?.materializationSha256 ===
        entry.bundle.receipt.materializationSha256,
      'EVA_DENSE_SOURCE_MATERIALIZATION_EXECUTION_VERIFY_FAILED',
    );
    frameReceipts.push(completed);
    framesExecutedThisRun += 1;
  }

  const receiptBody = {
    schema:
      EVA_DENSE_MOTION_SOURCE_MATERIALIZATION_CAMPAIGN_RECEIPT_SCHEMA,
    protocolVersion: EVA_DENSE_MOTION_SOURCE_MATERIALIZATION_PROTOCOL_VERSION,
    status: 'succeeded-awaiting-candidate-production',
    completedAt: materializedAt,
    programSha256: program.programSha256,
    frames: Object.freeze(
      frameReceipts.map((receipt) =>
        Object.freeze({
          ordinal: receipt.ordinal,
          frameId: receipt.frameId,
          sourceGitBlobSha1: receipt.source.gitBlobSha1,
          sourceSha256: receipt.output.sha256,
          inspectionSha256: receipt.sourceInspection.inspectionSha256,
          materializationSha256: receipt.materializationSha256,
        }),
      ),
    ),
    effects: Object.freeze({
      sourceCopiesPresent: FRAME_COUNT,
      sourceInspectionsPresent: FRAME_COUNT,
      sourceMaterializationReceiptsPresent: FRAME_COUNT,
      framesExecutedThisRun,
      framesReusedThisRun,
      candidatesCreated: 0,
      alphaMattesCreated: 0,
      alphaMastersCreated: 0,
      approvalsCreated: 0,
      cloudinaryUploads: 0,
      runtimeActivations: 0,
    }),
    nextRequiredStages: Object.freeze([
      'create-dense-source-space-candidate-for-each-frame',
      'independent-candidate-assurance-all-ten-frames',
      'named-human-alpha-matte-review-all-ten-frames',
      'bounded-one-shot-alpha-mastering-authorization-all-ten-frames',
      'deterministic-ten-frame-mastering-campaign',
    ]),
    authority: authority(),
  };
  const receipt = deepFreeze({
    ...receiptBody,
    campaignReceiptSha256: sha256Document(receiptBody),
  });
  const campaignParent = path.posix.dirname(campaignReceiptRelative(program));
  ensureDirectoryChain(root, campaignParent);
  const campaignPath = resolveRelative(
    root,
    campaignReceiptRelative(program),
    'campaignReceipt',
  );
  const handle = openSync(campaignPath, 'wx', 0o600);
  try {
    writeFileSync(handle, jsonBytes(receipt));
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
  const reread = stableJson(campaignPath, 'written source materialization campaign');
  verifyEvaDenseMotionSourceMaterializationCampaignReceipt(
    reread.value,
    program,
  );
  return deepFreeze({
    status: receipt.status,
    reused: false,
    receiptPath: campaignPath,
    receipt,
  });
}

export function evaDenseMotionSourceMaterializationCapabilities() {
  return deepFreeze({
    schema: EVA_DENSE_MOTION_SOURCE_MATERIALIZATION_CAPABILITIES_SCHEMA,
    protocolVersion: EVA_DENSE_MOTION_SOURCE_MATERIALIZATION_PROTOCOL_VERSION,
    exactTenSourceFrameCampaign: true,
    allTenSourcesPreflightBeforeFirstWrite: true,
    exactGitBlobIdentityRequired: true,
    byteForByteWorkspaceCopy: true,
    sequential: true,
    stopOnFirstFailure: true,
    createOnly: true,
    completedFrameBoundaryResumeSupported: true,
    midFramePartialStateRejected: true,
    completedFrameBytesReverifiedBySha256AndGitBlob: true,
    completedCampaignReplayReverifiesSourceBytes: true,
    candidateCreation: false,
    candidateAssurance: false,
    alphaMatteCreation: false,
    alphaMastering: false,
    technicalInspection: false,
    creativeReview: false,
    cloudinaryUpload: false,
    sequenceRelease: false,
    publication: false,
    runtimeActivation: false,
    authority: authority(),
  });
}
