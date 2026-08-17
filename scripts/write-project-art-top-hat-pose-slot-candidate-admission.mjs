#!/usr/bin/env node
import {
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  assert,
  deepFreeze,
  sha256Bytes,
  stableJsonFile,
} from './project-art/avatar-final-pass-provider-runtime-common.mjs';
import {
  TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_RECEIPT_SCHEMA,
  admitProjectArtTopHatPoseSlotCandidate,
  parseProjectArtTopHatPoseSlotCandidateAdmission,
} from './project-art/top-hat-pose-slot-candidate-admission.mjs';

const MAXIMUM_PNG_BYTES = 64 * 1024 * 1024;

function absolutePath(value, label) {
  assert(
    typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0'),
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_WRITER_PATH_INVALID',
    `${label} must be an absolute path.`,
  );
  return path.normalize(value);
}

function stableInputPath(value, label) {
  const absolute = absolutePath(value, label);
  const before = lstatSync(absolute);
  assert(
    before.isFile() && !before.isSymbolicLink() && before.nlink === 1,
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_WRITER_INPUT_INVALID',
    `${label} must be a single-link ordinary file.`,
  );
  const resolved = realpathSync(absolute);
  assert(
    resolved === absolute,
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_WRITER_INPUT_INVALID',
    `${label} must not traverse a symbolic path.`,
  );
  return Object.freeze({ absolute, before });
}

function readStableJson(value, label) {
  const input = stableInputPath(value, label);
  const record = stableJsonFile(input.absolute, label);
  const after = lstatSync(input.absolute);
  for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    assert(
      input.before[key] === after[key],
      'TOP_HAT_POSE_CANDIDATE_ADMISSION_WRITER_INPUT_CHANGED',
      `${label} changed while being read.`,
    );
  }
  return record.value;
}

function readStablePng(value, label) {
  const input = stableInputPath(value, label);
  assert(
    input.before.size >= 57 && input.before.size <= MAXIMUM_PNG_BYTES,
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_WRITER_PNG_SIZE_INVALID',
  );
  const bytes = readFileSync(input.absolute);
  const after = lstatSync(input.absolute);
  for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    assert(
      input.before[key] === after[key],
      'TOP_HAT_POSE_CANDIDATE_ADMISSION_WRITER_INPUT_CHANGED',
      `${label} changed while being read.`,
    );
  }
  return bytes;
}

function outputTarget(value) {
  const absolute = absolutePath(value, 'outputPath');
  const parent = path.dirname(absolute);
  const parentMetadata = lstatSync(parent);
  assert(
    parentMetadata.isDirectory() && !parentMetadata.isSymbolicLink(),
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_WRITER_OUTPUT_PARENT_INVALID',
  );
  assert(
    realpathSync(parent) === parent,
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_WRITER_OUTPUT_PARENT_INVALID',
  );
  return absolute;
}

function removeOwnedPartial(filePath) {
  try {
    unlinkSync(filePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

export function writeProjectArtTopHatPoseSlotCandidateAdmission({
  slotId,
  adapterPath,
  dispatchPath,
  bindingPath,
  outcomePath,
  materializationReceiptPath,
  finisherRequestPath,
  frameFinisherReportPath,
  frameReviewRequestPath,
  frameReviewDecisionPath,
  frameReviewOutcomePath,
  finishedFramePath,
  outputPath,
  admittedAt,
}) {
  const target = outputTarget(outputPath);
  const admission = admitProjectArtTopHatPoseSlotCandidate({
    slotId,
    adapter: readStableJson(adapterPath, 'adapterPath'),
    dispatch: readStableJson(dispatchPath, 'dispatchPath'),
    binding: readStableJson(bindingPath, 'bindingPath'),
    outcome: readStableJson(outcomePath, 'outcomePath'),
    materializationReceipt: readStableJson(
      materializationReceiptPath,
      'materializationReceiptPath',
    ),
    finisherRequest: readStableJson(finisherRequestPath, 'finisherRequestPath'),
    frameFinisherReport: readStableJson(
      frameFinisherReportPath,
      'frameFinisherReportPath',
    ),
    frameReviewRequest: readStableJson(
      frameReviewRequestPath,
      'frameReviewRequestPath',
    ),
    frameReviewDecision: readStableJson(
      frameReviewDecisionPath,
      'frameReviewDecisionPath',
    ),
    frameReviewOutcome: readStableJson(
      frameReviewOutcomePath,
      'frameReviewOutcomePath',
    ),
    finishedFrameBytes: readStablePng(finishedFramePath, 'finishedFramePath'),
    ...(admittedAt ? { admittedAt } : {}),
  });
  const bytes = Buffer.from(`${JSON.stringify(admission, null, 2)}\n`, 'utf8');
  let handle;
  let created = false;
  try {
    handle = openSync(target, 'wx', 0o600);
    created = true;
    writeFileSync(handle, bytes);
    fsyncSync(handle);
  } catch (error) {
    if (created) removeOwnedPartial(target);
    if (error?.code === 'EEXIST') {
      assert(
        false,
        'TOP_HAT_POSE_CANDIDATE_ADMISSION_WRITER_OUTPUT_EXISTS',
        'The candidate admission output is create-only and already exists.',
      );
    }
    throw error;
  } finally {
    if (handle !== undefined) closeSync(handle);
  }

  try {
    const metadata = lstatSync(target);
    assert(
      metadata.isFile() &&
        !metadata.isSymbolicLink() &&
        metadata.nlink === 1 &&
        (metadata.mode & 0o777) === 0o600 &&
        metadata.size === bytes.length,
      'TOP_HAT_POSE_CANDIDATE_ADMISSION_WRITER_OUTPUT_INVALID',
    );
    const written = readFileSync(target);
    assert(
      written.equals(bytes),
      'TOP_HAT_POSE_CANDIDATE_ADMISSION_WRITER_OUTPUT_VERIFY_FAILED',
    );
    const reparsed = parseProjectArtTopHatPoseSlotCandidateAdmission(
      JSON.parse(written.toString('utf8')),
    );
    assert(
      reparsed.candidateAdmissionSha256 === admission.candidateAdmissionSha256,
      'TOP_HAT_POSE_CANDIDATE_ADMISSION_WRITER_OUTPUT_VERIFY_FAILED',
    );
  } catch (error) {
    removeOwnedPartial(target);
    throw error;
  }

  return deepFreeze({
    schema: TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_RECEIPT_SCHEMA,
    outputPath: target,
    outputBytes: bytes.length,
    outputSha256: sha256Bytes(bytes),
    candidateAdmissionSha256: admission.candidateAdmissionSha256,
    characterId: admission.characterId,
    slotId: admission.slotId,
    status: admission.status,
    poseSlotFilled: false,
    poseBankReleased: false,
    runtimeActivationPerformed: false,
    repositoryMutationAuthority: false,
    publicationAuthority: false,
    forcePushAuthority: false,
  });
}

function parseCli(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    assert(
      typeof flag === 'string' && flag.startsWith('--') && value !== undefined,
      'TOP_HAT_POSE_CANDIDATE_ADMISSION_WRITER_CLI_INVALID',
    );
    assert(
      !flags.has(flag),
      'TOP_HAT_POSE_CANDIDATE_ADMISSION_WRITER_CLI_INVALID',
    );
    flags.set(flag, value);
  }
  const required = [
    '--slot-id',
    '--adapter',
    '--dispatch',
    '--binding',
    '--outcome',
    '--materialization',
    '--finisher-request',
    '--finisher-report',
    '--review-request',
    '--review-decision',
    '--review-outcome',
    '--finished-frame',
    '--output',
  ];
  for (const flag of required) {
    assert(
      flags.has(flag),
      'TOP_HAT_POSE_CANDIDATE_ADMISSION_WRITER_CLI_INVALID',
      `Missing required flag ${flag}.`,
    );
  }
  const allowed = new Set([...required, '--admitted-at']);
  for (const flag of flags.keys()) {
    assert(
      allowed.has(flag),
      'TOP_HAT_POSE_CANDIDATE_ADMISSION_WRITER_CLI_INVALID',
      `Unknown flag ${flag}.`,
    );
  }
  return Object.freeze({
    slotId: flags.get('--slot-id'),
    adapterPath: flags.get('--adapter'),
    dispatchPath: flags.get('--dispatch'),
    bindingPath: flags.get('--binding'),
    outcomePath: flags.get('--outcome'),
    materializationReceiptPath: flags.get('--materialization'),
    finisherRequestPath: flags.get('--finisher-request'),
    frameFinisherReportPath: flags.get('--finisher-report'),
    frameReviewRequestPath: flags.get('--review-request'),
    frameReviewDecisionPath: flags.get('--review-decision'),
    frameReviewOutcomePath: flags.get('--review-outcome'),
    finishedFramePath: flags.get('--finished-frame'),
    outputPath: flags.get('--output'),
    ...(flags.has('--admitted-at')
      ? { admittedAt: flags.get('--admitted-at') }
      : {}),
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const receipt = writeProjectArtTopHatPoseSlotCandidateAdmission(
      parseCli(process.argv.slice(2)),
    );
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error?.code ?? 'TOP_HAT_POSE_CANDIDATE_ADMISSION_WRITER_FAILED'}: ${
      error instanceof Error ? error.message : String(error)
    }\n`);
    process.exitCode = 1;
  }
}
