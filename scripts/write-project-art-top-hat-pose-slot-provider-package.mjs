#!/usr/bin/env node
import { createHash } from 'node:crypto';
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
  TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_REQUEST_SCHEMA,
  TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_SCHEMA,
  compileProjectArtTopHatPoseSlotProviderPackage,
  createProjectArtTopHatPoseSlotProviderPackageRequest,
} from './project-art/top-hat-pose-slot-provider-package.mjs';

export const TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_RECEIPT_SCHEMA =
  'evavo.project-art-top-hat-pose-slot-provider-package-receipt.v1';

const MAXIMUM_REQUEST_BYTES = 4 * 1024 * 1024;

function fail(code, message = code) {
  const error = new Error(message === code ? code : `${code}: ${message}`);
  error.code = code;
  throw error;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function ordinaryAbsolutePath(value, label) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 4096 ||
    value.includes('\0') ||
    !path.isAbsolute(value)
  ) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_PACKAGE_PATH_INVALID', `${label} is invalid.`);
  }
  return path.normalize(value);
}

function outputTarget(value) {
  const absolute = ordinaryAbsolutePath(value, 'outputPath');
  const parent = path.dirname(absolute);
  const parentMetadata = lstatSync(parent);
  if (!parentMetadata.isDirectory() || parentMetadata.isSymbolicLink()) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_PACKAGE_OUTPUT_PARENT_INVALID');
  }
  const realParent = realpathSync(parent);
  if (realParent !== path.resolve(parent)) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_PACKAGE_OUTPUT_PARENT_INVALID');
  }
  return path.join(realParent, path.basename(absolute));
}

function readRequest(requestPath) {
  if (requestPath === null || requestPath === undefined) {
    return createProjectArtTopHatPoseSlotProviderPackageRequest();
  }
  const absolute = ordinaryAbsolutePath(requestPath, 'requestPath');
  const before = lstatSync(absolute);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.size < 2 ||
    before.size > MAXIMUM_REQUEST_BYTES
  ) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_PACKAGE_REQUEST_FILE_INVALID');
  }
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  if (
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs ||
    before.ctimeMs !== after.ctimeMs
  ) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_PACKAGE_REQUEST_FILE_CHANGED');
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_PACKAGE_REQUEST_UTF8_INVALID');
  }
  if (text.charCodeAt(0) === 0xfeff) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_PACKAGE_REQUEST_BOM_FORBIDDEN');
  }
  try {
    return JSON.parse(text);
  } catch {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_PACKAGE_REQUEST_JSON_INVALID');
  }
}

function removePartial(target) {
  try {
    unlinkSync(target);
  } catch {
    // Preserve the original write or verification failure.
  }
}

export function writeProjectArtTopHatPoseSlotProviderPackage({
  outputPath,
  requestPath = null,
  request = null,
}) {
  if (requestPath !== null && request !== null) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_PACKAGE_REQUEST_SOURCE_AMBIGUOUS');
  }
  const target = outputTarget(outputPath);
  const requestValue = request ?? readRequest(requestPath);
  const providerPackage = compileProjectArtTopHatPoseSlotProviderPackage(
    requestValue,
  );
  const bytes = Buffer.from(
    `${JSON.stringify(providerPackage, null, 2)}\n`,
    'utf8',
  );
  let descriptor;
  let created = false;
  let writeError = null;
  try {
    descriptor = openSync(target, 'wx', 0o600);
    created = true;
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } catch (error) {
    writeError = error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  if (writeError) {
    if (created) removePartial(target);
    if (writeError?.code === 'EEXIST') {
      fail(
        'PROJECT_ART_TOP_HAT_PROVIDER_PACKAGE_OUTPUT_EXISTS',
        'The provider package output is create-only and already exists.',
      );
    }
    fail(
      'PROJECT_ART_TOP_HAT_PROVIDER_PACKAGE_OUTPUT_WRITE_FAILED',
      writeError instanceof Error ? writeError.message : String(writeError),
    );
  }

  try {
    const metadata = lstatSync(target);
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.nlink !== 1 ||
      (metadata.mode & 0o777) !== 0o600
    ) {
      fail('PROJECT_ART_TOP_HAT_PROVIDER_PACKAGE_OUTPUT_VERIFY_FAILED');
    }
    const written = readFileSync(target);
    if (!written.equals(bytes)) {
      fail('PROJECT_ART_TOP_HAT_PROVIDER_PACKAGE_OUTPUT_VERIFY_FAILED');
    }
    const reparsed = JSON.parse(written.toString('utf8'));
    const recompiled = compileProjectArtTopHatPoseSlotProviderPackage(
      requestValue,
    );
    if (
      reparsed.packageSha256 !== providerPackage.packageSha256 ||
      recompiled.packageSha256 !== providerPackage.packageSha256
    ) {
      fail('PROJECT_ART_TOP_HAT_PROVIDER_PACKAGE_OUTPUT_VERIFY_FAILED');
    }
  } catch (error) {
    if (created) removePartial(target);
    if (error?.code?.startsWith?.('PROJECT_ART_TOP_HAT_')) throw error;
    fail(
      'PROJECT_ART_TOP_HAT_PROVIDER_PACKAGE_OUTPUT_VERIFY_FAILED',
      error instanceof Error ? error.message : String(error),
    );
  }

  return Object.freeze({
    schema: TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_RECEIPT_SCHEMA,
    requestSchema: TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_REQUEST_SCHEMA,
    packageSchema: TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_SCHEMA,
    outputPath: target,
    outputBytes: bytes.length,
    outputSha256: sha256(bytes),
    packageSha256: providerPackage.packageSha256,
    productionPlanSha256: providerPackage.productionPlanSha256,
    characterId: providerPackage.characterId,
    status: providerPackage.status,
    jobs: providerPackage.counts.jobs,
    readyJobs: providerPackage.counts.readyJobs,
    blockedJobs: providerPackage.counts.blockedJobs,
    maximumProviderCalls: providerPackage.counts.maximumProviderCalls,
    candidatesPerJob: providerPackage.counts.candidatesPerJob,
    providerExecutionPerformed: false,
    candidateBytesMaterialized: false,
    candidateApprovalPerformed: false,
    poseSlotsFilled: false,
    runtimeActivationPerformed: false,
    repositoryMutationAuthority: false,
    publicationAuthority: false,
    forcePushAuthority: false,
  });
}

function parseCli(argv) {
  if (!Array.isArray(argv) || argv.length < 2 || argv.length > 4 || argv.length % 2 !== 0) {
    fail(
      'PROJECT_ART_TOP_HAT_PROVIDER_PACKAGE_CLI_INVALID',
      'Usage: node scripts/write-project-art-top-hat-pose-slot-provider-package.mjs --output <absolute-package.json> [--request <absolute-request.json>]',
    );
  }
  const parsed = { outputPath: null, requestPath: null };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--output' && parsed.outputPath === null) {
      parsed.outputPath = value;
    } else if (flag === '--request' && parsed.requestPath === null) {
      parsed.requestPath = value;
    } else {
      fail('PROJECT_ART_TOP_HAT_PROVIDER_PACKAGE_CLI_INVALID');
    }
  }
  if (parsed.outputPath === null) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_PACKAGE_CLI_INVALID');
  }
  return Object.freeze(parsed);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  try {
    const receipt = writeProjectArtTopHatPoseSlotProviderPackage(
      parseCli(process.argv.slice(2)),
    );
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } catch (error) {
    const code = error?.code ?? 'PROJECT_ART_TOP_HAT_PROVIDER_PACKAGE_WRITE_FAILED';
    process.stderr.write(`${code}: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
