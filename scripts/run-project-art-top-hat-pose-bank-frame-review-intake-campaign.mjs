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
  digest,
  sha256Document,
  stableJsonFile,
  verifySelfHash,
} from './project-art/avatar-final-pass-provider-runtime-common.mjs';
import {
  parseTopHatPoseBankFrameFinishingCampaignPlan,
  parseTopHatPoseBankFrameFinishingCampaignReceipt,
} from './project-art/top-hat-pose-bank-frame-finishing-campaign.mjs';
import {
  parseTopHatPoseBankFrameReviewIntakePlan,
  parseTopHatPoseBankFrameReviewIntakeReceipt,
  runTopHatPoseBankFrameReviewIntakeCampaign,
} from './project-art/top-hat-pose-bank-frame-review-intake-campaign.mjs';
import {
  TOP_HAT_RUNTIME_EXPECTED_SLOTS,
} from './project-art/top-hat-pose-slot-provider-runtime-foundation.mjs';

const REQUIRED_FLAGS = Object.freeze([
  '--finishing-campaign-plan-evidence',
  '--finishing-campaign-execution-evidence',
  '--decision-manifest',
  '--workspace-root',
  '--output-root',
  '--reviewed-at',
]);
const PROTOCOL_VERSION = '2026-08-19.1';
const FINISHING_PLAN_EVIDENCE_SCHEMA =
  'evavo.project-art-top-hat-pose-bank-frame-finishing-campaign-plan-evidence.v1';
const FINISHING_EXECUTION_EVIDENCE_SCHEMA =
  'evavo.project-art-top-hat-pose-bank-frame-finishing-campaign-execution-evidence.v1';
const DECISION_MANIFEST_SCHEMA =
  'evavo.project-art-top-hat-pose-bank-frame-review-decision-manifest.v1';
const REVIEW_PLAN_EVIDENCE_SCHEMA =
  'evavo.project-art-top-hat-pose-bank-frame-review-intake-plan-evidence.v1';
const REVIEW_EXECUTION_EVIDENCE_SCHEMA =
  'evavo.project-art-top-hat-pose-bank-frame-review-intake-execution-evidence.v1';

function fail(code, message = code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function parseFlags(argv) {
  if (!Array.isArray(argv) || argv.length !== REQUIRED_FLAGS.length * 2) {
    fail('TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_CLI_INVALID');
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
      fail('TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_CLI_INVALID');
    }
    values.set(flag, value);
  }
  for (const flag of REQUIRED_FLAGS) {
    if (!values.has(flag)) {
      fail(
        'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_CLI_INVALID',
        `Missing required flag ${flag}.`,
      );
    }
  }
  const reviewedAt = values.get('--reviewed-at');
  if (
    !Number.isFinite(Date.parse(reviewedAt)) ||
    new Date(reviewedAt).toISOString() !== reviewedAt
  ) {
    fail(
      'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_CLI_INVALID',
      '--reviewed-at must be an exact UTC ISO timestamp.',
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
      'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_PATH_INVALID',
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
      'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_PATH_INVALID',
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
      'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_ROOT_COLLISION',
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
      'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_INPUT_INVALID',
      `${label} must be a single-link ordinary file.`,
    );
  }
  const record = stableJsonFile(absolute, label);
  const after = lstatSync(absolute);
  for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    if (before[key] !== after[key]) {
      fail(
        'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_INPUT_CHANGED',
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

function readStableBytes(value, label) {
  const absolute = absolutePath(value, label);
  const before = lstatSync(absolute);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    realpathSync(absolute) !== absolute
  ) {
    fail(
      'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_DECISION_FILE_INVALID',
      `${label} must be a single-link ordinary file.`,
    );
  }
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    if (before[key] !== after[key]) {
      fail(
        'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_INPUT_CHANGED',
        `${label} changed while being read.`,
      );
    }
  }
  return Object.freeze({ path: absolute, fileSha256: sha256Bytes(bytes) });
}

function parseDecisionManifest(input) {
  const manifest = verifySelfHash(
    input,
    'decisionManifestSha256',
    'Top Hat frame-review decision manifest',
  );
  assert(
    manifest.schema === DECISION_MANIFEST_SCHEMA &&
      manifest.protocolVersion === PROTOCOL_VERSION &&
      Array.isArray(manifest.slots) &&
      manifest.slots.length === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      manifest.slots.every(
        (entry, index) =>
          entry?.slotId === TOP_HAT_RUNTIME_EXPECTED_SLOTS[index] &&
          typeof entry.decisionPath === 'string' &&
          path.isAbsolute(entry.decisionPath) &&
          path.normalize(entry.decisionPath) === entry.decisionPath &&
          digest(entry.decisionFileSha256, `${entry.slotId}.decisionFileSha256`),
      ) &&
      manifest.policy?.decisionsExternallyAuthored === true &&
      manifest.policy?.namedHumanRequired === true &&
      manifest.policy?.automaticDecisionCreationAllowed === false,
    'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_DECISION_MANIFEST_INVALID',
  );
  return manifest;
}

function validateDecisionFiles(manifest) {
  return Object.freeze(
    manifest.slots.map((entry) => {
      const file = readStableBytes(entry.decisionPath, `${entry.slotId} decision`);
      assert(
        file.fileSha256 === entry.decisionFileSha256,
        'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_DECISION_FILE_HASH_MISMATCH',
      );
      return Object.freeze({
        slotId: entry.slotId,
        decisionPath: file.path,
      });
    }),
  );
}

function createOutputRoot(value, workspaceRoot, sourceRoots) {
  const target = absolutePath(value, 'outputRoot');
  realDirectory(path.dirname(target), 'outputRoot parent');
  disjointRoots(target, workspaceRoot, 'outputRoot', 'workspaceRoot');
  for (const sourceRoot of sourceRoots) {
    disjointRoots(target, sourceRoot, 'outputRoot', 'source evidence root');
  }
  try {
    lstatSync(target);
    fail(
      'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_OUTPUT_EXISTS',
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
      realpathSync(target) === target,
    'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_OUTPUT_INVALID',
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
    'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_OUTPUT_VERIFY_FAILED',
  );
  const reparsed = JSON.parse(written.toString('utf8'));
  const hashBody = { ...reparsed };
  const recorded = hashBody[hashField];
  delete hashBody[hashField];
  assert(
    typeof recorded === 'string' && sha256Document(hashBody) === recorded,
    'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_OUTPUT_VERIFY_FAILED',
  );
  return Object.freeze({
    path: filePath,
    bytes: written.length,
    fileSha256: sha256Bytes(written),
    documentSha256: recorded,
  });
}

export async function main(argv = process.argv.slice(2)) {
  const flags = parseFlags(argv);
  const workspaceRoot = realDirectory(flags.get('--workspace-root'), 'workspaceRoot');
  const finishingPlanInput = readStableJson(
    flags.get('--finishing-campaign-plan-evidence'),
    'finishing campaign plan evidence',
  );
  const finishingExecutionInput = readStableJson(
    flags.get('--finishing-campaign-execution-evidence'),
    'finishing campaign execution evidence',
  );
  const decisionManifestInput = readStableJson(
    flags.get('--decision-manifest'),
    'human review decision manifest',
  );

  const finishingPlanEvidence = verifySelfHash(
    finishingPlanInput.value,
    'planEvidenceSha256',
    'finishing campaign plan evidence',
  );
  assert(
    finishingPlanEvidence.schema === FINISHING_PLAN_EVIDENCE_SCHEMA &&
      finishingPlanEvidence.protocolVersion === PROTOCOL_VERSION,
    'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_FINISHING_EVIDENCE_INVALID',
  );
  const finishingPlan = parseTopHatPoseBankFrameFinishingCampaignPlan(
    finishingPlanEvidence.finishingPlan,
  );
  const finishingExecutionEvidence = verifySelfHash(
    finishingExecutionInput.value,
    'executionEvidenceSha256',
    'finishing campaign execution evidence',
  );
  assert(
    finishingExecutionEvidence.schema === FINISHING_EXECUTION_EVIDENCE_SCHEMA &&
      finishingExecutionEvidence.protocolVersion === PROTOCOL_VERSION &&
      finishingExecutionEvidence.source?.planEvidenceSha256 ===
        finishingPlanEvidence.planEvidenceSha256,
    'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_FINISHING_EVIDENCE_INVALID',
  );
  const finishingReceipt = parseTopHatPoseBankFrameFinishingCampaignReceipt(
    finishingExecutionEvidence.finishingReceipt,
  );
  assert(
    finishingReceipt.status === 'succeeded-awaiting-named-human-review' &&
      finishingReceipt.campaignPlanSha256 === finishingPlan.campaignPlanSha256 &&
      finishingPlan.workspaceRoot === workspaceRoot,
    'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_FINISHING_EVIDENCE_MISMATCH',
  );

  const decisionManifest = parseDecisionManifest(decisionManifestInput.value);
  const reviewDecisions = validateDecisionFiles(decisionManifest);
  const result = await runTopHatPoseBankFrameReviewIntakeCampaign({
    finishingCampaignReceipt: finishingReceipt,
    reviewDecisions,
    workspaceRoot,
    reviewedAt: flags.get('--reviewed-at'),
  });
  parseTopHatPoseBankFrameReviewIntakePlan(result.plan);
  parseTopHatPoseBankFrameReviewIntakeReceipt(result.receipt);

  const outputRoot = createOutputRoot(
    flags.get('--output-root'),
    workspaceRoot,
    [
      path.dirname(finishingPlanInput.path),
      path.dirname(finishingExecutionInput.path),
      path.dirname(decisionManifestInput.path),
    ],
  );
  const planBody = {
    schema: REVIEW_PLAN_EVIDENCE_SCHEMA,
    protocolVersion: PROTOCOL_VERSION,
    source: Object.freeze({
      finishingPlanEvidenceFileSha256: finishingPlanInput.fileSha256,
      finishingPlanEvidenceSha256: finishingPlanEvidence.planEvidenceSha256,
      finishingExecutionEvidenceFileSha256: finishingExecutionInput.fileSha256,
      finishingExecutionEvidenceSha256:
        finishingExecutionEvidence.executionEvidenceSha256,
      decisionManifestFileSha256: decisionManifestInput.fileSha256,
      decisionManifestSha256: decisionManifest.decisionManifestSha256,
    }),
    reviewIntakePlan: result.plan,
    authority: result.plan.authority,
  };
  const planEvidence = Object.freeze({
    ...planBody,
    planEvidenceSha256: sha256Document(planBody),
  });
  const writtenPlan = writeCreateOnlyJson(
    path.join(outputRoot, 'campaign-plan.json'),
    planEvidence,
    'planEvidenceSha256',
  );

  const executionBody = {
    schema: REVIEW_EXECUTION_EVIDENCE_SCHEMA,
    protocolVersion: PROTOCOL_VERSION,
    source: Object.freeze({
      planEvidenceSha256: planEvidence.planEvidenceSha256,
      finishingCampaignExecutionSha256: finishingReceipt.campaignExecutionSha256,
      decisionManifestSha256: decisionManifest.decisionManifestSha256,
    }),
    reviewIntakeReceipt: result.receipt,
    authority: result.receipt.authority,
  };
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
    reviewIntakePlanSha256: result.plan.reviewIntakePlanSha256,
    reviewIntakeExecutionSha256: result.receipt.reviewIntakeExecutionSha256,
    planEvidence: writtenPlan,
    executionEvidence: writtenExecution,
    counts: result.receipt.counts,
    allSixHumanApproved: result.receipt.allSixHumanApproved,
    nextRequiredStage: result.receipt.nextRequiredStage,
  });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (result.receipt.status === 'failed') process.exitCode = 1;
  return summary;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        status: 'failed',
        code:
          typeof error?.code === 'string'
            ? error.code
            : 'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_FAILED',
        message: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  });
}
