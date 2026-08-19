#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  assert,
  sha256Document,
  stableJsonFile,
} from './project-art/avatar-final-pass-provider-runtime-common.mjs';
import {
  parseTopHatPoseBankCandidateMaterializationCampaignPlan,
  parseTopHatPoseBankCandidateMaterializationCampaignReceipt,
} from './project-art/top-hat-pose-bank-candidate-materialization-campaign.mjs';
import {
  compileTopHatPoseBankFrameFinishingCampaignPlan,
  parseTopHatPoseBankFrameFinishingCampaignPlan,
  parseTopHatPoseBankFrameFinishingCampaignReceipt,
  runTopHatPoseBankFrameFinishingCampaign,
} from './project-art/top-hat-pose-bank-frame-finishing-campaign.mjs';

const REQUIRED_FLAGS = Object.freeze([
  '--materialization-campaign-plan',
  '--materialization-campaign-receipt',
  '--workspace-root',
  '--output-root',
  '--finished-at',
]);
const EVIDENCE_PROTOCOL_VERSION = '2026-08-19.1';
const PLAN_EVIDENCE_SCHEMA =
  'evavo.project-art-top-hat-pose-bank-frame-finishing-campaign-plan-evidence.v1';
const EXECUTION_EVIDENCE_SCHEMA =
  'evavo.project-art-top-hat-pose-bank-frame-finishing-campaign-execution-evidence.v1';

function fail(code, message = code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function parseFlags(argv) {
  if (!Array.isArray(argv) || argv.length !== REQUIRED_FLAGS.length * 2) {
    fail('TOP_HAT_POSE_BANK_FRAME_FINISHING_CLI_INVALID');
  }
  const allowed = new Set(REQUIRED_FLAGS);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      !allowed.has(flag) ||
      values.has(flag) ||
      typeof value !== 'string' ||
      value.length === 0 ||
      value.startsWith('--') ||
      /[\0\r\n]/u.test(value)
    ) {
      fail('TOP_HAT_POSE_BANK_FRAME_FINISHING_CLI_INVALID');
    }
    values.set(flag, value);
  }
  for (const flag of REQUIRED_FLAGS) {
    if (!values.has(flag)) {
      fail(
        'TOP_HAT_POSE_BANK_FRAME_FINISHING_CLI_INVALID',
        `Missing required flag ${flag}.`,
      );
    }
  }
  const finishedAt = values.get('--finished-at');
  if (
    !Number.isFinite(Date.parse(finishedAt)) ||
    new Date(finishedAt).toISOString() !== finishedAt
  ) {
    fail(
      'TOP_HAT_POSE_BANK_FRAME_FINISHING_CLI_INVALID',
      '--finished-at must be an exact UTC ISO timestamp.',
    );
  }
  return values;
}

function absolutePath(value, label) {
  if (
    typeof value !== 'string' ||
    !path.isAbsolute(value) ||
    value.includes('\0') ||
    path.normalize(value) !== value
  ) {
    fail(
      'TOP_HAT_POSE_BANK_FRAME_FINISHING_PATH_INVALID',
      `${label} must be an absolute normalized path.`,
    );
  }
  return value;
}

function realDirectory(value, label) {
  const root = absolutePath(value, label);
  const metadata = lstatSync(root);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    realpathSync(root) !== root
  ) {
    fail(
      'TOP_HAT_POSE_BANK_FRAME_FINISHING_PATH_INVALID',
      `${label} must be a real ordinary directory.`,
    );
  }
  return root;
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function disjointRoots(left, right, leftLabel, rightLabel) {
  if (isInside(left, right) || isInside(right, left)) {
    fail(
      'TOP_HAT_POSE_BANK_FRAME_FINISHING_ROOT_COLLISION',
      `${leftLabel} and ${rightLabel} must be disjoint.`,
    );
  }
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readStableJson(value, label) {
  const absolute = absolutePath(value, label);
  const before = lstatSync(absolute);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    realpathSync(absolute) !== absolute
  ) {
    fail(
      'TOP_HAT_POSE_BANK_FRAME_FINISHING_INPUT_INVALID',
      `${label} must be a single-link ordinary file.`,
    );
  }
  const record = stableJsonFile(absolute, label);
  const after = lstatSync(absolute);
  for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    if (before[key] !== after[key]) {
      fail(
        'TOP_HAT_POSE_BANK_FRAME_FINISHING_INPUT_CHANGED',
        `${label} changed while being read.`,
      );
    }
  }
  return Object.freeze({
    path: absolute,
    bytes: record.bytes,
    fileSha256: sha256Bytes(record.bytes),
    value: record.value,
  });
}

function createOutputRoot(value, workspaceRoot, sourceRoots) {
  const target = absolutePath(value, 'outputRoot');
  const parent = realDirectory(path.dirname(target), 'outputRoot parent');
  disjointRoots(target, workspaceRoot, 'outputRoot', 'workspaceRoot');
  for (const sourceRoot of sourceRoots) {
    disjointRoots(target, sourceRoot, 'outputRoot', 'materialization evidence root');
  }
  try {
    lstatSync(target);
    fail(
      'TOP_HAT_POSE_BANK_FRAME_FINISHING_OUTPUT_EXISTS',
      'outputRoot is create-only and already exists.',
    );
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  mkdirSync(target, { recursive: false, mode: 0o700 });
  const metadata = lstatSync(target);
  assert(
    metadata.isDirectory() &&
      !metadata.isSymbolicLink() &&
      realpathSync(target) === target &&
      realpathSync(parent) === parent,
    'TOP_HAT_POSE_BANK_FRAME_FINISHING_OUTPUT_INVALID',
  );
  return target;
}

function writeCreateOnlyJson(filePath, value, hashField) {
  const body = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  let handle;
  try {
    handle = openSync(filePath, 'wx', 0o600);
    writeFileSync(handle, body);
    fsyncSync(handle);
  } finally {
    if (handle !== undefined) closeSync(handle);
  }
  const written = readFileSync(filePath);
  assert(
    written.equals(body),
    'TOP_HAT_POSE_BANK_FRAME_FINISHING_OUTPUT_VERIFY_FAILED',
  );
  const reparsed = JSON.parse(written.toString('utf8'));
  const hashBody = { ...reparsed };
  const recorded = hashBody[hashField];
  delete hashBody[hashField];
  assert(
    typeof recorded === 'string' && sha256Document(hashBody) === recorded,
    'TOP_HAT_POSE_BANK_FRAME_FINISHING_OUTPUT_VERIFY_FAILED',
  );
  return Object.freeze({
    path: filePath,
    bytes: written.length,
    fileSha256: sha256Bytes(written),
    documentSha256: recorded,
  });
}

function planEvidenceBody({
  materializationPlanInput,
  materializationPlan,
  materializationReceiptInput,
  materializationReceipt,
  finishingPlan,
}) {
  return {
    schema: PLAN_EVIDENCE_SCHEMA,
    protocolVersion: EVIDENCE_PROTOCOL_VERSION,
    source: Object.freeze({
      materializationCampaignPlanFileSha256:
        materializationPlanInput.fileSha256,
      materializationCampaignPlanSha256:
        materializationPlan.campaignPlanSha256,
      materializationCampaignReceiptFileSha256:
        materializationReceiptInput.fileSha256,
      materializationCampaignExecutionSha256:
        materializationReceipt.campaignExecutionSha256,
    }),
    finishingPlan,
    authority: finishingPlan.authority,
  };
}

function executionEvidenceBody({
  planEvidenceSha256,
  materializationReceipt,
  finishingReceipt,
}) {
  return {
    schema: EXECUTION_EVIDENCE_SCHEMA,
    protocolVersion: EVIDENCE_PROTOCOL_VERSION,
    source: Object.freeze({
      planEvidenceSha256,
      materializationCampaignExecutionSha256:
        materializationReceipt.campaignExecutionSha256,
    }),
    finishingReceipt,
    authority: finishingReceipt.authority,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const flags = parseFlags(argv);
  const workspaceRoot = realDirectory(flags.get('--workspace-root'), 'workspaceRoot');
  const planInput = readStableJson(
    flags.get('--materialization-campaign-plan'),
    'materialization campaign plan',
  );
  const receiptInput = readStableJson(
    flags.get('--materialization-campaign-receipt'),
    'materialization campaign receipt',
  );
  const materializationPlan =
    parseTopHatPoseBankCandidateMaterializationCampaignPlan(planInput.value);
  const materializationReceipt =
    parseTopHatPoseBankCandidateMaterializationCampaignReceipt(receiptInput.value);
  assert(
    materializationReceipt.status ===
      'succeeded-awaiting-frame-finishing-and-human-review' &&
      materializationReceipt.campaignPlanSha256 ===
        materializationPlan.campaignPlanSha256 &&
      materializationPlan.workspaceRoot === workspaceRoot,
    'TOP_HAT_POSE_BANK_FRAME_FINISHING_SOURCE_CAMPAIGN_MISMATCH',
  );
  const finishedAt = flags.get('--finished-at');
  const finishingPlan =
    await compileTopHatPoseBankFrameFinishingCampaignPlan({
      materializationCampaignReceipt: materializationReceipt,
      workspaceRoot,
      finishedAt,
    });
  parseTopHatPoseBankFrameFinishingCampaignPlan(finishingPlan);

  const outputRoot = createOutputRoot(
    flags.get('--output-root'),
    workspaceRoot,
    [...new Set([path.dirname(planInput.path), path.dirname(receiptInput.path)])],
  );
  const planBody = planEvidenceBody({
    materializationPlanInput: planInput,
    materializationPlan,
    materializationReceiptInput: receiptInput,
    materializationReceipt,
    finishingPlan,
  });
  const planEvidence = Object.freeze({
    ...planBody,
    planEvidenceSha256: sha256Document(planBody),
  });
  const writtenPlan = writeCreateOnlyJson(
    path.join(outputRoot, 'campaign-plan.json'),
    planEvidence,
    'planEvidenceSha256',
  );

  const result = await runTopHatPoseBankFrameFinishingCampaign({
    materializationCampaignReceipt: materializationReceipt,
    workspaceRoot,
    finishedAt,
  });
  assert(
    result.plan.campaignPlanSha256 === finishingPlan.campaignPlanSha256,
    'TOP_HAT_POSE_BANK_FRAME_FINISHING_PLAN_DRIFT',
  );
  parseTopHatPoseBankFrameFinishingCampaignReceipt(result.receipt);
  const executionBody = executionEvidenceBody({
    planEvidenceSha256: planEvidence.planEvidenceSha256,
    materializationReceipt,
    finishingReceipt: result.receipt,
  });
  const executionEvidence = Object.freeze({
    ...executionBody,
    executionEvidenceSha256: sha256Document(executionBody),
  });
  const writtenExecution = writeCreateOnlyJson(
    path.join(outputRoot, 'campaign-execution.json'),
    executionEvidence,
    'executionEvidenceSha256',
  );

  const summary = Object.freeze({
    status: result.receipt.status,
    outputRoot,
    campaignPlanSha256: result.plan.campaignPlanSha256,
    campaignExecutionSha256: result.receipt.campaignExecutionSha256,
    planEvidence: writtenPlan,
    executionEvidence: writtenExecution,
    counts: result.receipt.counts,
    nextRequiredStage: result.receipt.nextRequiredStage,
  });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (result.receipt.status !== 'succeeded-awaiting-named-human-review') {
    process.exitCode = 1;
  }
  return summary;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    const payload = {
      status: 'failed',
      code:
        typeof error?.code === 'string'
          ? error.code
          : 'TOP_HAT_POSE_BANK_FRAME_FINISHING_FAILED',
      message: error instanceof Error ? error.message : String(error),
    };
    process.stderr.write(`${JSON.stringify(payload)}\n`);
    process.exitCode = 1;
  });
}
