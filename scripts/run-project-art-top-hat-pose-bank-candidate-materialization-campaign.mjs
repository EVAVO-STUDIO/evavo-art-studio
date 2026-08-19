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

import { LocalArtifactStore } from '../packages/artifacts/dist/index.js';
import {
  assert,
  sha256Document,
  stableJsonFile,
} from './project-art/avatar-final-pass-provider-runtime-common.mjs';
import {
  parseProjectArtTopHatPoseSlotProviderRuntimeAdapter,
} from './project-art/top-hat-pose-slot-provider-runtime-adapter.mjs';
import {
  TOP_HAT_RUNTIME_EXPECTED_SLOTS,
} from './project-art/top-hat-pose-slot-provider-runtime-foundation.mjs';
import {
  parseTopHatPoseBankProviderCampaignPlan,
  parseTopHatPoseBankProviderCampaignReceipt,
} from './project-art/top-hat-pose-bank-provider-campaign.mjs';
import {
  compileTopHatPoseBankCandidateMaterializationCampaignPlan,
  parseTopHatPoseBankCandidateMaterializationCampaignPlan,
  parseTopHatPoseBankCandidateMaterializationCampaignReceipt,
  runTopHatPoseBankCandidateMaterializationCampaign,
} from './project-art/top-hat-pose-bank-candidate-materialization-campaign.mjs';

const REQUIRED_FLAGS = Object.freeze([
  '--adapter',
  '--provider-campaign-plan',
  '--provider-campaign-receipt',
  '--artifact-root',
  '--workspace-root',
  '--output-root',
  '--actor-class',
  '--actor-id',
  '--authorization-evidence-sha256',
  '--authorized-at',
]);

const EVIDENCE_PROTOCOL_VERSION = '2026-08-19.1';
const PLAN_EVIDENCE_SCHEMA =
  'evavo.project-art-top-hat-pose-bank-candidate-materialization-campaign-plan-evidence.v1';
const EXECUTION_EVIDENCE_SCHEMA =
  'evavo.project-art-top-hat-pose-bank-candidate-materialization-campaign-execution-evidence.v1';

function fail(code, message = code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function parseFlags(argv) {
  if (!Array.isArray(argv) || argv.length % 2 !== 0) {
    fail('TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_CLI_INVALID');
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
      !value ||
      value.startsWith('--') ||
      /[\0\r\n]/u.test(value)
    ) {
      fail('TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_CLI_INVALID');
    }
    values.set(flag, value);
  }
  for (const flag of REQUIRED_FLAGS) {
    if (!values.has(flag)) {
      fail(
        'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_CLI_INVALID',
        `Missing required flag ${flag}.`,
      );
    }
  }
  if (!['human', 'agent'].includes(values.get('--actor-class'))) {
    fail(
      'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_CLI_INVALID',
      '--actor-class must be human or agent.',
    );
  }
  if (!/^[a-f0-9]{64}$/u.test(values.get('--authorization-evidence-sha256'))) {
    fail(
      'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_CLI_INVALID',
      '--authorization-evidence-sha256 must be a lowercase SHA-256.',
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
      'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_PATH_INVALID',
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
      'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_PATH_INVALID',
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
      'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_ROOT_COLLISION',
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
      'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_INPUT_INVALID',
      `${label} must be a single-link ordinary file.`,
    );
  }
  const record = stableJsonFile(absolute, label);
  const after = lstatSync(absolute);
  for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    if (before[key] !== after[key]) {
      fail(
        'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_INPUT_CHANGED',
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

function readCampaignOutput(record, campaignRoot, label) {
  assert(
    record &&
      typeof record.path === 'string' &&
      /^[a-f0-9]{64}$/u.test(record.fileSha256),
    'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_PROVIDER_OUTPUT_INVALID',
  );
  const input = readStableJson(record.path, label);
  assert(
    isInside(campaignRoot, input.path) && input.fileSha256 === record.fileSha256,
    'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_PROVIDER_OUTPUT_MISMATCH',
    `${label} is outside the provider campaign or has changed bytes.`,
  );
  return input.value;
}

function createOutputRoot(value, artifactRoot, workspaceRoot, providerCampaignRoot) {
  const target = absolutePath(value, 'outputRoot');
  const parent = realDirectory(path.dirname(target), 'outputRoot parent');
  disjointRoots(target, artifactRoot, 'outputRoot', 'artifactRoot');
  disjointRoots(target, workspaceRoot, 'outputRoot', 'workspaceRoot');
  disjointRoots(target, providerCampaignRoot, 'outputRoot', 'providerCampaignRoot');
  try {
    lstatSync(target);
    fail(
      'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_OUTPUT_EXISTS',
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
    'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_OUTPUT_INVALID',
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
    'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_OUTPUT_VERIFY_FAILED',
  );
  const reparsed = JSON.parse(written.toString('utf8'));
  const hashBody = { ...reparsed };
  const recorded = hashBody[hashField];
  delete hashBody[hashField];
  assert(
    typeof recorded === 'string' && sha256Document(hashBody) === recorded,
    'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_OUTPUT_VERIFY_FAILED',
  );
  return Object.freeze({
    path: filePath,
    bytes: written.length,
    fileSha256: sha256Bytes(written),
    documentSha256: recorded,
  });
}

function planEvidenceBody({
  adapterInput,
  adapter,
  providerPlanInput,
  providerPlan,
  providerReceiptInput,
  providerReceipt,
  materializationPlan,
}) {
  return {
    schema: PLAN_EVIDENCE_SCHEMA,
    protocolVersion: EVIDENCE_PROTOCOL_VERSION,
    source: Object.freeze({
      adapterFileSha256: adapterInput.fileSha256,
      adapterSha256: adapter.adapterSha256,
      providerCampaignPlanFileSha256: providerPlanInput.fileSha256,
      providerCampaignPlanSha256: providerPlan.campaignPlanSha256,
      providerCampaignReceiptFileSha256: providerReceiptInput.fileSha256,
      providerCampaignExecutionSha256:
        providerReceipt.campaignExecutionSha256,
    }),
    materializationPlan,
    authority: materializationPlan.authority,
  };
}

function executionEvidenceBody({
  planEvidenceSha256,
  providerReceipt,
  materializationReceipt,
}) {
  return {
    schema: EXECUTION_EVIDENCE_SCHEMA,
    protocolVersion: EVIDENCE_PROTOCOL_VERSION,
    status: materializationReceipt.status,
    planEvidenceSha256,
    sourceProviderCampaignExecutionSha256:
      providerReceipt.campaignExecutionSha256,
    materializationReceipt,
    nextRequiredStage: materializationReceipt.nextRequiredStage,
    authority: materializationReceipt.authority,
  };
}

export async function runTopHatPoseBankCandidateMaterializationCli(
  argv,
  { clock = () => new Date().toISOString() } = {},
) {
  const flags = parseFlags(argv);
  const adapterInput = readStableJson(flags.get('--adapter'), 'adapter');
  const providerPlanInput = readStableJson(
    flags.get('--provider-campaign-plan'),
    'provider campaign plan',
  );
  const providerReceiptInput = readStableJson(
    flags.get('--provider-campaign-receipt'),
    'provider campaign receipt',
  );
  const adapter = parseProjectArtTopHatPoseSlotProviderRuntimeAdapter(
    adapterInput.value,
  );
  const providerPlan = parseTopHatPoseBankProviderCampaignPlan(
    providerPlanInput.value,
  );
  const providerReceipt = parseTopHatPoseBankProviderCampaignReceipt(
    providerReceiptInput.value,
    providerPlan,
  );
  assert(
    providerPlan.sourceAdapterSha256 === adapter.adapterSha256 &&
      providerReceipt.sourceAdapterSha256 === adapter.adapterSha256 &&
      providerReceipt.sourceAdapterFileSha256 === adapterInput.fileSha256 &&
      providerReceipt.status === 'succeeded' &&
      providerReceipt.failure === null &&
      providerReceipt.counts?.plannedSlots === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      providerReceipt.counts?.attemptedSlots === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      providerReceipt.counts?.succeededSlots === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      providerReceipt.counts?.failedSlots === 0 &&
      providerReceipt.counts?.verifiedProviderCalls === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length,
    'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_PROVIDER_CAMPAIGN_INVALID',
    'Candidate materialization requires one exact successful six-slot provider campaign.',
  );

  const artifactRoot = realDirectory(flags.get('--artifact-root'), 'artifactRoot');
  const workspaceRoot = realDirectory(flags.get('--workspace-root'), 'workspaceRoot');
  const providerCampaignRoot = realDirectory(
    providerReceipt.outputRoot,
    'providerCampaignRoot',
  );
  assert(
    providerPlan.artifactStore?.root === artifactRoot &&
      providerReceipt.artifactRoot === artifactRoot,
    'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_ARTIFACT_ROOT_MISMATCH',
  );
  disjointRoots(artifactRoot, workspaceRoot, 'artifactRoot', 'workspaceRoot');

  const slots = providerReceipt.slots.map((slot, index) => {
    assert(
      slot.slotId === TOP_HAT_RUNTIME_EXPECTED_SLOTS[index] &&
        slot.status === 'succeeded' &&
        slot.providerCallCount === 1 &&
        slot.providerCallCountVerified === true &&
        slot.outputFiles?.outcome !== null,
      'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_PROVIDER_SLOT_INVALID',
    );
    return Object.freeze({
      slotId: slot.slotId,
      dispatch: readCampaignOutput(
        slot.outputFiles.dispatch,
        providerCampaignRoot,
        `${slot.slotId} dispatch`,
      ),
      binding: readCampaignOutput(
        slot.outputFiles.binding,
        providerCampaignRoot,
        `${slot.slotId} binding`,
      ),
      outcome: readCampaignOutput(
        slot.outputFiles.outcome,
        providerCampaignRoot,
        `${slot.slotId} outcome`,
      ),
    });
  });

  const authorization = Object.freeze({
    action: 'materialize-unapproved-provider-candidate',
    actorClass: flags.get('--actor-class'),
    actorId: flags.get('--actor-id'),
    occurredAt: flags.get('--authorized-at'),
    evidenceSha256: flags.get('--authorization-evidence-sha256'),
  });
  const artifacts = new LocalArtifactStore({ root: artifactRoot });
  const plannedAt = clock();
  const campaignInput = {
    adapter,
    slots,
    artifactStore: artifacts,
    workspaceRoot,
    authorization,
    plannedAt,
  };

  const materializationPlan =
    await compileTopHatPoseBankCandidateMaterializationCampaignPlan(
      campaignInput,
    );
  parseTopHatPoseBankCandidateMaterializationCampaignPlan(materializationPlan);

  const outputRoot = createOutputRoot(
    flags.get('--output-root'),
    artifactRoot,
    workspaceRoot,
    providerCampaignRoot,
  );
  const planBody = planEvidenceBody({
    adapterInput,
    adapter,
    providerPlanInput,
    providerPlan,
    providerReceiptInput,
    providerReceipt,
    materializationPlan,
  });
  const planEvidence = Object.freeze({
    ...planBody,
    planEvidenceSha256: sha256Document(planBody),
  });
  const planOutput = writeCreateOnlyJson(
    path.join(outputRoot, 'campaign-plan.json'),
    planEvidence,
    'planEvidenceSha256',
  );

  const result = await runTopHatPoseBankCandidateMaterializationCampaign({
    ...campaignInput,
    clock,
  });
  assert(
    result.plan.campaignPlanSha256 === materializationPlan.campaignPlanSha256,
    'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_PLAN_DRIFT',
  );
  parseTopHatPoseBankCandidateMaterializationCampaignReceipt(result.receipt);

  const executionBody = executionEvidenceBody({
    planEvidenceSha256: planEvidence.planEvidenceSha256,
    providerReceipt,
    materializationReceipt: result.receipt,
  });
  const executionEvidence = Object.freeze({
    ...executionBody,
    executionEvidenceSha256: sha256Document(executionBody),
  });
  const executionOutput = writeCreateOnlyJson(
    path.join(outputRoot, 'campaign-execution.json'),
    executionEvidence,
    'executionEvidenceSha256',
  );

  return Object.freeze({
    status: result.receipt.status,
    outputRoot,
    planOutput,
    executionOutput,
    materializedSlots: result.receipt.counts.materializedSlots,
    humanReviewsCreated: 0,
    candidateAdmissionsCreated: 0,
    providerCallsPerformed: 0,
    publicationPerformed: false,
    runtimeActivationPerformed: false,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runTopHatPoseBankCandidateMaterializationCli(process.argv.slice(2))
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (result.status === 'failed') process.exitCode = 1;
    })
    .catch((error) => {
      process.stderr.write(
        `${error?.code ?? 'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_CLI_FAILED'}: ${
          error instanceof Error ? error.message : String(error)
        }\n`,
      );
      process.exitCode = 1;
    });
}
