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
  exactKeys,
  sha256Bytes,
  stableJsonFile,
} from './project-art/avatar-final-pass-provider-runtime-common.mjs';
import {
  TOP_HAT_POSE_SLOT_IDS,
} from './project-art/top-hat-pose-slot-candidate-admission.mjs';
import {
  TOP_HAT_POSE_BANK_RELEASE_PLAN_RECEIPT_SCHEMA,
} from './project-art/top-hat-pose-bank-release-plan-foundation.mjs';
import {
  compileProjectArtTopHatPoseBankReleasePlan,
  parseProjectArtTopHatPoseBankReleasePlan,
} from './project-art/top-hat-pose-bank-release-plan.mjs';

function absolutePath(value, label) {
  assert(
    typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0'),
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_WRITER_PATH_INVALID',
    `${label} must be an absolute path.`,
  );
  return path.normalize(value);
}

function stableInputPath(value, label) {
  const absolute = absolutePath(value, label);
  const before = lstatSync(absolute);
  assert(
    before.isFile() && !before.isSymbolicLink() && before.nlink === 1,
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_WRITER_INPUT_INVALID',
    `${label} must be a single-link ordinary file.`,
  );
  assert(
    realpathSync(absolute) === absolute,
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_WRITER_INPUT_INVALID',
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
      'TOP_HAT_POSE_BANK_RELEASE_PLAN_WRITER_INPUT_CHANGED',
      `${label} changed while being read.`,
    );
  }
  return record.value;
}

function outputTarget(value) {
  const absolute = absolutePath(value, 'outputPath');
  const parent = path.dirname(absolute);
  const metadata = lstatSync(parent);
  assert(
    metadata.isDirectory() && !metadata.isSymbolicLink(),
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_WRITER_OUTPUT_PARENT_INVALID',
  );
  assert(
    realpathSync(parent) === parent,
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_WRITER_OUTPUT_PARENT_INVALID',
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

export function writeProjectArtTopHatPoseBankReleasePlan({
  admissionPaths,
  outputPath,
  compiledAt,
}) {
  exactKeys(
    admissionPaths,
    TOP_HAT_POSE_SLOT_IDS,
    'admissionPaths',
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_WRITER_INPUT_INVALID',
  );
  const target = outputTarget(outputPath);
  const admissions = TOP_HAT_POSE_SLOT_IDS.map((slotId) =>
    readStableJson(admissionPaths[slotId], `admissionPaths.${slotId}`),
  );
  const plan = compileProjectArtTopHatPoseBankReleasePlan({
    admissions,
    ...(compiledAt ? { compiledAt } : {}),
  });
  const bytes = Buffer.from(`${JSON.stringify(plan, null, 2)}\n`, 'utf8');

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
        'TOP_HAT_POSE_BANK_RELEASE_PLAN_WRITER_OUTPUT_EXISTS',
        'The pose-bank release plan is create-only and already exists.',
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
      'TOP_HAT_POSE_BANK_RELEASE_PLAN_WRITER_OUTPUT_INVALID',
    );
    const written = readFileSync(target);
    assert(
      written.equals(bytes),
      'TOP_HAT_POSE_BANK_RELEASE_PLAN_WRITER_OUTPUT_VERIFY_FAILED',
    );
    const reparsed = parseProjectArtTopHatPoseBankReleasePlan(
      JSON.parse(written.toString('utf8')),
    );
    assert(
      reparsed.poseBankReleasePlanSha256 ===
        plan.poseBankReleasePlanSha256,
      'TOP_HAT_POSE_BANK_RELEASE_PLAN_WRITER_OUTPUT_VERIFY_FAILED',
    );
  } catch (error) {
    removeOwnedPartial(target);
    throw error;
  }

  return deepFreeze({
    schema: TOP_HAT_POSE_BANK_RELEASE_PLAN_RECEIPT_SCHEMA,
    outputPath: target,
    outputBytes: bytes.length,
    outputSha256: sha256Bytes(bytes),
    poseBankReleasePlanSha256: plan.poseBankReleasePlanSha256,
    characterId: plan.characterId,
    slotCount: plan.slotCount,
    status: plan.status,
    releaseApproved: false,
    poseSlotFillingPerformed: false,
    poseBankReleased: false,
    sequenceReleased: false,
    runtimeActivationPerformed: false,
    websiteInstallationPerformed: false,
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
      'TOP_HAT_POSE_BANK_RELEASE_PLAN_WRITER_CLI_INVALID',
    );
    assert(
      !flags.has(flag),
      'TOP_HAT_POSE_BANK_RELEASE_PLAN_WRITER_CLI_INVALID',
    );
    flags.set(flag, value);
  }

  const slotFlags = new Map(
    TOP_HAT_POSE_SLOT_IDS.map((slotId) => [`--${slotId}`, slotId]),
  );
  const required = [...slotFlags.keys(), '--output'];
  for (const flag of required) {
    assert(
      flags.has(flag),
      'TOP_HAT_POSE_BANK_RELEASE_PLAN_WRITER_CLI_INVALID',
      `Missing required flag ${flag}.`,
    );
  }
  const allowed = new Set([...required, '--compiled-at']);
  for (const flag of flags.keys()) {
    assert(
      allowed.has(flag),
      'TOP_HAT_POSE_BANK_RELEASE_PLAN_WRITER_CLI_INVALID',
      `Unknown flag ${flag}.`,
    );
  }

  return Object.freeze({
    admissionPaths: Object.freeze(
      Object.fromEntries(
        [...slotFlags].map(([flag, slotId]) => [slotId, flags.get(flag)]),
      ),
    ),
    outputPath: flags.get('--output'),
    ...(flags.has('--compiled-at')
      ? { compiledAt: flags.get('--compiled-at') }
      : {}),
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const receipt = writeProjectArtTopHatPoseBankReleasePlan(
      parseCli(process.argv.slice(2)),
    );
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error?.code ?? 'TOP_HAT_POSE_BANK_RELEASE_PLAN_WRITER_FAILED'}: ${
      error instanceof Error ? error.message : String(error)
    }\n`);
    process.exitCode = 1;
  }
}
