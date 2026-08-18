#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  realpathSync,
  readFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  parseProjectArtTopHatPoseSlotProviderRuntimeAdapter,
} from './project-art/top-hat-pose-slot-provider-runtime-adapter.mjs';
import {
  TOP_HAT_RUNTIME_EXPECTED_SLOTS,
} from './project-art/top-hat-pose-slot-provider-runtime-foundation.mjs';
import {
  assert,
  sha256Document,
  timestamp,
  verifySelfHash,
} from './project-art/avatar-final-pass-provider-runtime-common.mjs';
import {
  failTopHatProviderRuntimeCli as fail,
  readTopHatProviderRuntimeJsonFile as stableJsonFile,
  sha256TopHatProviderRuntimeBytes as sha256Bytes,
  writeTopHatProviderRuntimeJsonCreateOnly as writeCreateOnlyJson,
} from './project-art/top-hat-pose-slot-provider-runtime-cli-files.mjs';
import {
  runTopHatPoseSlotProviderExecution,
} from './run-project-art-top-hat-pose-slot-provider.mjs';

const REQUIRED_FLAGS = Object.freeze([
  '--adapter',
  '--expected-adapter-file-sha256',
  '--runtime-root',
  '--artifact-root',
  '--output-root',
]);
const OPTIONAL_FLAGS = Object.freeze(['--worker-prefix']);
const CHECKPOINT_SCHEMA =
  'evavo.project-art-top-hat-pose-bank-provider-campaign-checkpoint.v1';

function safeIdentifier(value, label, fallback) {
  const text = value ?? fallback;
  if (
    typeof text !== 'string' ||
    !/^[a-z0-9][a-z0-9._:-]{0,127}$/u.test(text)
  ) {
    fail(
      'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_CLI_IDENTIFIER_INVALID',
      `${label} is invalid.`,
    );
  }
  return text;
}

function parseFlags(argv) {
  if (!Array.isArray(argv) || argv.length % 2 !== 0) {
    fail('TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_CLI_INVALID');
  }
  const allowed = new Set([...REQUIRED_FLAGS, ...OPTIONAL_FLAGS]);
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
      fail('TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_CLI_INVALID');
    }
    values.set(flag, value);
  }
  for (const flag of REQUIRED_FLAGS) {
    if (!values.has(flag)) {
      fail(
        'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_CLI_INVALID',
        `Missing required flag ${flag}.`,
      );
    }
  }
  if (!/^[a-f0-9]{64}$/u.test(values.get('--expected-adapter-file-sha256'))) {
    fail(
      'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_CLI_INVALID',
      '--expected-adapter-file-sha256 must be a lowercase SHA-256.',
    );
  }
  return values;
}

function absolutePath(value, label) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 4096 ||
    value.includes('\0') ||
    !path.isAbsolute(value)
  ) {
    fail(
      'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_CLI_PATH_INVALID',
      `${label} must be an absolute path.`,
    );
  }
  const normalized = path.normalize(value);
  if (path.resolve(normalized) !== normalized) {
    fail(
      'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_CLI_PATH_INVALID',
      `${label} must be normalized.`,
    );
  }
  return normalized;
}

function existingOrdinaryDirectory(value, label) {
  const root = absolutePath(value, label);
  const metadata = lstatSync(root);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    realpathSync(root) !== path.resolve(root)
  ) {
    fail(
      'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_CLI_PATH_INVALID',
      `${label} must be a real directory on an ordinary path.`,
    );
  }
  return root;
}

function createOnlyDirectory(value, label) {
  const target = absolutePath(value, label);
  const parent = path.dirname(target);
  existingOrdinaryDirectory(parent, `${label} parent`);
  try {
    lstatSync(target);
    fail(
      'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_CLI_OUTPUT_EXISTS',
      `${label} is create-only and already exists.`,
    );
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  mkdirSync(target, { recursive: false, mode: 0o700 });
  return existingOrdinaryDirectory(target, label);
}

function childDirectory(parent, name) {
  const target = path.join(parent, name);
  mkdirSync(target, { recursive: false, mode: 0o700 });
  return existingOrdinaryDirectory(target, `slot directory ${name}`);
}

function pnpmExecutable() {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function runBuild(args, label) {
  const result = spawnSync(pnpmExecutable(), args, {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    windowsHide: true,
    stdio: 'inherit',
  });
  if (result.error) {
    fail(
      'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_BUILD_FAILED',
      `${label} failed to start: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    fail(
      'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_BUILD_FAILED',
      `${label} failed with exit code ${result.status}.`,
    );
  }
}

function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function outputRecord(file, label) {
  const record = stableJsonFile(file, label);
  return Object.freeze({
    path: record.absolute,
    fileSha256: sha256Bytes(record.bytes),
    value: record.value,
  });
}

function checkpointAuthority() {
  return Object.freeze({
    providerExecution: false,
    candidateMaterialization: false,
    creativeReview: false,
    candidateApproval: false,
    candidatePromotion: false,
    poseSlotFilling: false,
    sequenceRelease: false,
    publication: false,
    runtimeActivation: false,
    forcePush: false,
  });
}

function verifyCheckpoint(value, plan, slotId, position) {
  const checkpoint = verifySelfHash(
    value,
    'checkpointSha256',
    'Top Hat pose-bank provider campaign checkpoint',
  );
  assert(
    checkpoint.schema === CHECKPOINT_SCHEMA &&
      checkpoint.campaignPlanSha256 === plan.campaignPlanSha256 &&
      checkpoint.slotId === slotId &&
      checkpoint.position === position &&
      checkpoint.slot?.slotId === slotId &&
      Object.values(checkpoint.authority).every((entry) => entry === false),
    'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_CHECKPOINT_INVALID',
  );
  return checkpoint;
}

function slotRecordFromExecution(slotId, execution) {
  const dispatch = outputRecord(execution.outputFiles.dispatch, `${slotId} dispatch`);
  const binding = outputRecord(execution.outputFiles.binding, `${slotId} binding`);
  const receipt = outputRecord(execution.outputFiles.receipt, `${slotId} execution receipt`);
  const outcome = execution.outputFiles.outcome
    ? outputRecord(execution.outputFiles.outcome, `${slotId} outcome`)
    : null;
  const candidateArtifactId =
    outcome?.value?.result?.status === 'candidate-materialization-required'
      ? outcome.value.result.candidateArtifactId
      : null;
  const evidenceArtifactId =
    outcome?.value?.result?.status === 'candidate-materialization-required'
      ? outcome.value.result.evidenceArtifactId
      : null;
  return Object.freeze({
    slotId,
    status: execution.status,
    providerCallCount: execution.providerCallCount,
    providerCallCountVerified: execution.providerCallCountVerified,
    runtimeDispatchSha256: execution.runtimeDispatchSha256,
    runtimeBindingSha256: execution.runtimeBindingSha256,
    runtimeOutcomeSha256: execution.runtimeOutcomeSha256,
    executionSha256: execution.executionSha256,
    candidateArtifactId,
    evidenceArtifactId,
    outputFiles: Object.freeze({
      dispatch: Object.freeze({ path: dispatch.path, fileSha256: dispatch.fileSha256 }),
      binding: Object.freeze({ path: binding.path, fileSha256: binding.fileSha256 }),
      outcome:
        outcome === null
          ? null
          : Object.freeze({ path: outcome.path, fileSha256: outcome.fileSha256 }),
      receipt: Object.freeze({ path: receipt.path, fileSha256: receipt.fileSha256 }),
    }),
  });
}

function campaignReceiptBody({
  plan,
  adapter,
  adapterFileSha256,
  runtimeRoot,
  artifactRoot,
  outputRoot,
  startedAt,
  completedAt,
  slots,
  failure,
}) {
  const succeededSlots = slots.filter((slot) => slot.status === 'succeeded').length;
  const failedSlots = slots.filter((slot) => slot.status !== 'succeeded').length;
  const verifiedProviderCalls = slots.reduce(
    (total, slot) =>
      total + (slot.providerCallCountVerified === true ? slot.providerCallCount : 0),
    0,
  );
  return {
    schema: 'evavo.project-art-top-hat-pose-bank-provider-campaign-receipt.v1',
    protocolVersion: '2026-08-19.1',
    status:
      failure === null && succeededSlots === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length
        ? 'succeeded'
        : 'failed',
    startedAt,
    completedAt,
    campaignPlanSha256: plan.campaignPlanSha256,
    sourceAdapterFileSha256: adapterFileSha256,
    sourceAdapterSha256: adapter.adapterSha256,
    sourceProviderPackageSha256: adapter.sourceProviderPackageSha256,
    runtimeRoot,
    artifactRoot,
    outputRoot,
    executionPolicy: plan.executionPolicy,
    slots: Object.freeze([...slots]),
    counts: Object.freeze({
      plannedSlots: TOP_HAT_RUNTIME_EXPECTED_SLOTS.length,
      attemptedSlots: slots.length,
      succeededSlots,
      failedSlots,
      verifiedProviderCalls,
      maximumProviderCalls: TOP_HAT_RUNTIME_EXPECTED_SLOTS.length,
      maximumCandidates: TOP_HAT_RUNTIME_EXPECTED_SLOTS.length,
    }),
    failure,
    effects: Object.freeze({
      providerExecutionVerified: verifiedProviderCalls > 0,
      runtimeCompletionEvidenceRecorded: slots.length > 0,
      candidateBytesMaterialized: false,
      candidateApprovalPerformed: false,
      poseSlotsFilled: false,
      sequenceReleased: false,
      repositoryMutationPerformed: false,
      publicationPerformed: false,
      runtimeActivationPerformed: false,
    }),
    authority: Object.freeze({
      providerExecution: false,
      runtimeSubmission: false,
      candidateMaterialization: false,
      deterministicQa: false,
      creativeReview: false,
      candidateApproval: false,
      candidatePromotion: false,
      poseSlotFilling: false,
      sequenceRelease: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
      runtimeActivation: false,
      forcePush: false,
    }),
  };
}

export async function runTopHatPoseBankProviderCampaign(
  argv,
  environment = process.env,
  { build = false } = {},
) {
  const flags = parseFlags(argv);
  const adapterPath = absolutePath(flags.get('--adapter'), 'adapter');
  const adapterInput = stableJsonFile(adapterPath, 'adapter');
  const adapterFileSha256 = sha256Bytes(adapterInput.bytes);
  if (adapterFileSha256 !== flags.get('--expected-adapter-file-sha256')) {
    fail(
      'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_ADAPTER_SHA256_MISMATCH',
      'Adapter file SHA-256 does not match the reviewed expected digest.',
    );
  }
  const adapter = parseProjectArtTopHatPoseSlotProviderRuntimeAdapter(
    adapterInput.value,
  );
  const runtimeRoot = absolutePath(flags.get('--runtime-root'), 'runtimeRoot');
  const artifactRoot = existingOrdinaryDirectory(
    flags.get('--artifact-root'),
    'artifactRoot',
  );
  if (path.resolve(runtimeRoot) === path.resolve(artifactRoot)) {
    fail(
      'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_ROOT_COLLISION',
      'runtimeRoot and artifactRoot must be separate directories.',
    );
  }
  const outputRootTarget = absolutePath(flags.get('--output-root'), 'outputRoot');
  const workerPrefix = safeIdentifier(
    flags.get('--worker-prefix'),
    'workerPrefix',
    'top-hat-pose-bank-provider',
  );

  if (build) {
    runBuild(['run', 'build:domain'], 'Art Studio domain build');
    runBuild(
      ['--filter', '@evavo/art-studio-worker', 'build'],
      'Art Studio worker build',
    );
  }

  const {
    compileTopHatPoseBankProviderCampaignPlan,
    parseTopHatPoseBankProviderCampaignPlan,
    parseTopHatPoseBankProviderCampaignReceipt,
  } = await import('./project-art/top-hat-pose-bank-provider-campaign.mjs');

  const startedAt = new Date().toISOString();
  const plan = await compileTopHatPoseBankProviderCampaignPlan({
    adapter,
    artifactRoot,
    environment,
    plannedAt: startedAt,
  });

  const outputRoot = createOnlyDirectory(outputRootTarget, 'outputRoot');
  const campaignPlanPath = path.join(outputRoot, 'campaign-plan.json');
  const campaignReceiptPath = path.join(outputRoot, 'campaign-execution.json');
  const planWrite = writeCreateOnlyJson({
    outputPath: campaignPlanPath,
    value: plan,
    verify: parseTopHatPoseBankProviderCampaignPlan,
  });

  const slotResults = [];
  let failure = null;
  for (const [index, slotId] of TOP_HAT_RUNTIME_EXPECTED_SLOTS.entries()) {
    const position = index + 1;
    const slotRoot = childDirectory(outputRoot, `${String(position).padStart(2, '0')}-${slotId}`);
    const dispatchPath = path.join(slotRoot, 'dispatch.json');
    const bindingPath = path.join(slotRoot, 'binding.json');
    const outcomePath = path.join(slotRoot, 'outcome.json');
    const receiptPath = path.join(slotRoot, 'execution.json');
    try {
      const execution = await runTopHatPoseSlotProviderExecution(
        [
          '--adapter', adapterPath,
          '--expected-adapter-file-sha256', adapterFileSha256,
          '--slot-id', slotId,
          '--runtime-root', runtimeRoot,
          '--artifact-root', artifactRoot,
          '--dispatch-output', dispatchPath,
          '--binding-output', bindingPath,
          '--outcome-output', outcomePath,
          '--receipt-output', receiptPath,
          '--worker-id', `${workerPrefix}:${slotId}`,
        ],
        environment,
        { build: false },
      );
      const slotRecord = slotRecordFromExecution(slotId, execution);
      slotResults.push(slotRecord);
      const checkpointBody = {
        schema: CHECKPOINT_SCHEMA,
        recordedAt: new Date().toISOString(),
        campaignPlanSha256: plan.campaignPlanSha256,
        position,
        slotId,
        slot: slotRecord,
        downstreamAuthorityGranted: false,
        authority: checkpointAuthority(),
      };
      const checkpoint = Object.freeze({
        ...checkpointBody,
        checkpointSha256: sha256Document(checkpointBody),
      });
      writeCreateOnlyJson({
        outputPath: path.join(slotRoot, 'checkpoint.json'),
        value: checkpoint,
        verify: (value) => verifyCheckpoint(value, plan, slotId, position),
      });
      if (execution.status !== 'succeeded') {
        failure = Object.freeze({
          code: 'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_SLOT_FAILED',
          slotId,
          message: `${slotId} provider execution did not succeed; later slots were not attempted.`,
          providerCallCountVerified: execution.providerCallCountVerified,
          providerCallCount: execution.providerCallCount,
        });
        break;
      }
    } catch (error) {
      failure = Object.freeze({
        code: error?.code ?? 'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_SLOT_ERROR',
        slotId,
        message: error instanceof Error ? error.message : String(error),
        providerCallCountVerified: false,
        providerCallCount: null,
      });
      break;
    }
  }

  const completedAt = new Date().toISOString();
  const receiptBody = campaignReceiptBody({
    plan,
    adapter,
    adapterFileSha256,
    runtimeRoot,
    artifactRoot,
    outputRoot,
    startedAt,
    completedAt,
    slots: slotResults,
    failure,
  });
  const campaignReceipt = Object.freeze({
    ...receiptBody,
    campaignExecutionSha256: sha256Document(receiptBody),
  });
  const receiptWrite = writeCreateOnlyJson({
    outputPath: campaignReceiptPath,
    value: campaignReceipt,
    verify: (value) =>
      parseTopHatPoseBankProviderCampaignReceipt(value, plan),
  });

  return Object.freeze({
    status: campaignReceipt.status,
    campaignPlanSha256: plan.campaignPlanSha256,
    campaignExecutionSha256: campaignReceipt.campaignExecutionSha256,
    sourceAdapterSha256: adapter.adapterSha256,
    sourceAdapterFileSha256: adapterFileSha256,
    outputRoot,
    campaignPlanPath: planWrite.outputPath,
    campaignPlanFileSha256: planWrite.outputSha256,
    campaignReceiptPath: receiptWrite.outputPath,
    campaignReceiptFileSha256: receiptWrite.outputSha256,
    counts: campaignReceipt.counts,
    failure: campaignReceipt.failure,
    candidateMaterializationPerformed: false,
    candidateApprovalPerformed: false,
    poseSlotsFilled: false,
    sequenceReleased: false,
    publicationPerformed: false,
    runtimeActivationPerformed: false,
  });
}

const invoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (invoked) {
  try {
    const result = await runTopHatPoseBankProviderCampaign(
      process.argv.slice(2),
      process.env,
      { build: true },
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== 'succeeded') process.exitCode = 2;
  } catch (error) {
    const code = error?.code ?? 'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_FAILED';
    process.stderr.write(
      `${code}: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
