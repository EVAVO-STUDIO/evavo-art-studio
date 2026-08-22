#!/usr/bin/env node
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  compileEvaDenseMotionFamilyFingerprintPlanV2,
  compileEvaDenseMotionFamilyReleaseManifestV2,
  readEvaDenseMotionFamilyApprovalFileV2,
} from './project-art/eva-dense-motion-family-release-manifest-v2.mjs';

const MAXIMUM_JSON_BYTES = 32 * 1024 * 1024;

function fail(code, message = code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function parsePairs(argv) {
  if (!Array.isArray(argv) || argv.length < 1) fail('EVA_DENSE_FAMILY_MANIFEST_V2_CLI_ARGUMENT_INVALID');
  const command = argv[0];
  const rest = argv.slice(1);
  if (rest.length % 2 !== 0) fail('EVA_DENSE_FAMILY_MANIFEST_V2_CLI_ARGUMENT_INVALID');
  const values = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (
      typeof flag !== 'string' || !flag.startsWith('--') || values.has(flag) ||
      typeof value !== 'string' || value.length === 0 || value.startsWith('--') || /[\0\r\n]/u.test(value)
    ) fail('EVA_DENSE_FAMILY_MANIFEST_V2_CLI_ARGUMENT_INVALID', flag ?? 'argument');
    values.set(flag, value);
  }
  return { command, values };
}

function required(values, flags) {
  for (const flag of flags) if (!values.has(flag)) fail('EVA_DENSE_FAMILY_MANIFEST_V2_CLI_ARGUMENT_MISSING', flag);
}

function realDirectory(raw, label) {
  const absolute = path.resolve(raw);
  const metadata = lstatSync(absolute);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || realpathSync(absolute) !== absolute) {
    fail('EVA_DENSE_FAMILY_MANIFEST_V2_CLI_ROOT_INVALID', label);
  }
  return absolute;
}

function stableJson(raw, label) {
  const absolute = path.resolve(raw);
  const before = lstatSync(absolute);
  if (
    !before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size < 2 ||
    before.size > MAXIMUM_JSON_BYTES || realpathSync(absolute) !== absolute
  ) fail('EVA_DENSE_FAMILY_MANIFEST_V2_CLI_INPUT_INVALID', label);
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    if (before[field] !== after[field]) fail('EVA_DENSE_FAMILY_MANIFEST_V2_CLI_INPUT_CHANGED', label);
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail('EVA_DENSE_FAMILY_MANIFEST_V2_CLI_JSON_INVALID', label);
  }
}

function evidenceRef(values, prefix) {
  return Object.freeze({
    path: values.get(`--${prefix}-path`),
    sha256: values.get(`--${prefix}-sha256`),
  });
}

function writeJson(raw, value) {
  const target = path.resolve(raw);
  if (existsSync(target)) fail('EVA_DENSE_FAMILY_MANIFEST_V2_CLI_OUTPUT_EXISTS');
  const parent = path.dirname(target);
  const metadata = lstatSync(parent);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || realpathSync(parent) !== parent) {
    fail('EVA_DENSE_FAMILY_MANIFEST_V2_CLI_OUTPUT_PARENT_INVALID');
  }
  const handle = openSync(target, 'wx', 0o600);
  try {
    writeFileSync(handle, `${JSON.stringify(value, null, 2)}\n`);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
  return target;
}

function fingerprint(values) {
  required(values, [
    '--program', '--work-order', '--family-evidence-root',
    '--sequence-pack-path', '--sequence-pack-sha256',
    '--release-manifest-path', '--release-manifest-sha256',
    '--browser-playback-path', '--browser-playback-sha256',
    '--runtime-release', '--prepared-at', '--output',
  ]);
  const result = compileEvaDenseMotionFamilyFingerprintPlanV2({
    tenMasterProgram: stableJson(values.get('--program'), 'ten-master program'),
    workOrder: stableJson(values.get('--work-order'), 'dense-motion work order'),
    familyEvidenceRoot: realDirectory(values.get('--family-evidence-root'), 'familyEvidenceRoot'),
    sequencePack: evidenceRef(values, 'sequence-pack'),
    releaseManifest: evidenceRef(values, 'release-manifest'),
    browserPlayback: evidenceRef(values, 'browser-playback'),
    runtimeRelease: stableJson(values.get('--runtime-release'), 'runtime release'),
    preparedAt: values.get('--prepared-at'),
  });
  const outputPath = writeJson(values.get('--output'), result);
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    familyEvidenceFingerprint: result.familyEvidenceFingerprint,
    requiredExternalApprovals: result.requiredExternalApprovals,
    automaticApprovalCreationAllowed: result.automaticApprovalCreationAllowed,
    outputPath,
  }, null, 2)}\n`);
  return 0;
}

function manifest(values) {
  required(values, [
    '--fingerprint-plan', '--owner-approval', '--creative-director-approval',
    '--technical-director-approval', '--manifested-at', '--output',
  ]);
  const plan = stableJson(values.get('--fingerprint-plan'), 'fingerprint plan');
  const manifestedAt = values.get('--manifested-at');
  const result = compileEvaDenseMotionFamilyReleaseManifestV2({
    fingerprintPlan: plan,
    ownerApproval: readEvaDenseMotionFamilyApprovalFileV2(
      values.get('--owner-approval'), 'owner', plan.familyEvidenceFingerprint, manifestedAt,
    ),
    creativeDirectorApproval: readEvaDenseMotionFamilyApprovalFileV2(
      values.get('--creative-director-approval'), 'creative-director', plan.familyEvidenceFingerprint, manifestedAt,
    ),
    technicalDirectorApproval: readEvaDenseMotionFamilyApprovalFileV2(
      values.get('--technical-director-approval'), 'technical-director', plan.familyEvidenceFingerprint, manifestedAt,
    ),
    manifestedAt,
  });
  const outputPath = writeJson(values.get('--output'), result);
  process.stdout.write(`${JSON.stringify({
    status: 'family-release-manifest-v2-created-from-external-human-approvals',
    familyEvidenceFingerprint: result.familyEvidenceFingerprint,
    manifestSha256: result.manifestSha256,
    automaticApprovalCreationAllowed: result.policy.automaticApprovalCreationAllowed,
    outputPath,
  }, null, 2)}\n`);
  return 0;
}

export function main(argv = process.argv.slice(2)) {
  try {
    const { command, values } = parsePairs(argv);
    if (command === 'fingerprint') return fingerprint(values);
    if (command === 'manifest') return manifest(values);
    fail('EVA_DENSE_FAMILY_MANIFEST_V2_CLI_COMMAND_INVALID', command);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      status: 'error',
      code: error?.code ?? 'EVA_DENSE_FAMILY_MANIFEST_V2_CLI_FAILED',
      message: error instanceof Error ? error.message : String(error),
    })}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) process.exitCode = main();
