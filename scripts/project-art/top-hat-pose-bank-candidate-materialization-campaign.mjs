import { existsSync, lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';

import {
  materializeAvatarFinalPassProviderCandidate,
} from './avatar-final-pass-provider-candidate.mjs';
import {
  parseAvatarFinalPassProviderRuntimeDispatch,
} from './avatar-final-pass-provider-runtime-dispatch-core.mjs';
import {
  parseAvatarFinalPassProviderRuntimeBinding,
} from './avatar-final-pass-provider-runtime-binding.mjs';
import {
  parseAvatarProviderCandidateSourceChain,
} from './avatar-final-pass-provider-candidate-source.mjs';
import {
  compileProjectArtTopHatPoseSlotProviderRuntimeDispatch,
  parseProjectArtTopHatPoseSlotProviderRuntimeAdapter,
} from './top-hat-pose-slot-provider-runtime-adapter.mjs';
import {
  TOP_HAT_RUNTIME_EXPECTED_SLOTS,
} from './top-hat-pose-slot-provider-runtime-foundation.mjs';
import {
  assert,
  canonicalJson,
  deepFreeze,
  digest,
  isRecord,
  sha256Document,
  timestamp,
  verifySelfHash,
} from './avatar-final-pass-provider-runtime-common.mjs';

export const TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_CAMPAIGN_PLAN_SCHEMA =
  'evavo.project-art-top-hat-pose-bank-candidate-materialization-campaign-plan.v1';
export const TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_CAMPAIGN_RECEIPT_SCHEMA =
  'evavo.project-art-top-hat-pose-bank-candidate-materialization-campaign-receipt.v1';
export const TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_CAMPAIGN_PROTOCOL_VERSION =
  '2026-08-19.1';

const AUTHORITY_KEYS = Object.freeze([
  'providerExecution',
  'candidateMaterialization',
  'deterministicQa',
  'creativeReview',
  'candidateApproval',
  'candidatePromotion',
  'poseSlotFilling',
  'sequenceRelease',
  'targetRepositoryMutation',
  'gitMutation',
  'deployment',
  'publication',
  'runtimeActivation',
  'forcePush',
]);

function authority() {
  return Object.freeze({
    providerExecution: false,
    candidateMaterialization: true,
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
  });
}

function realDirectory(value, label) {
  assert(
    typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0'),
    'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_ROOT_INVALID',
    `${label} must be an absolute path.`,
  );
  const normalized = path.normalize(value);
  assert(
    normalized === value,
    'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_ROOT_INVALID',
    `${label} must be normalized.`,
  );
  const metadata = lstatSync(normalized);
  assert(
    metadata.isDirectory() &&
      !metadata.isSymbolicLink() &&
      realpathSync(normalized) === normalized,
    'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_ROOT_INVALID',
    `${label} must be a real ordinary directory.`,
  );
  return normalized;
}

function assertArtifactStore(store) {
  assert(
    store &&
      typeof store.get === 'function' &&
      typeof store.verify === 'function' &&
      typeof store.read === 'function',
    'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_ARTIFACT_STORE_INVALID',
  );
  return store;
}

function candidateBundlePaths(workspaceRoot, candidateOutputPath) {
  assert(
    typeof candidateOutputPath === 'string' &&
      candidateOutputPath.length > 4 &&
      candidateOutputPath.endsWith('.png') &&
      !path.posix.isAbsolute(candidateOutputPath) &&
      !candidateOutputPath.split('/').includes('..'),
    'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_PATH_INVALID',
  );
  const candidate = path.resolve(
    workspaceRoot,
    ...candidateOutputPath.split('/'),
  );
  const relative = path.relative(workspaceRoot, candidate);
  assert(
    relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative),
    'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_PATH_ESCAPE',
  );
  const stem = candidate.slice(0, -4);
  return Object.freeze({
    candidate,
    materialization: `${stem}.materialization.json`,
    finisherRequest: `${stem}.finisher-request.json`,
  });
}

function normalizedAuthorization(input) {
  assert(
    isRecord(input) &&
      input.action === 'materialize-unapproved-provider-candidate' &&
      (input.actorClass === 'human' || input.actorClass === 'agent') &&
      typeof input.actorId === 'string' &&
      input.actorId.length >= 1 &&
      input.actorId.length <= 256,
    'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_AUTHORIZATION_INVALID',
  );
  timestamp(
    input.occurredAt,
    'candidate materialization authorization.occurredAt',
  );
  digest(
    input.evidenceSha256,
    'candidate materialization authorization.evidenceSha256',
  );
  return deepFreeze({
    action: input.action,
    actorClass: input.actorClass,
    actorId: input.actorId,
    occurredAt: input.occurredAt,
    evidenceSha256: input.evidenceSha256,
  });
}

function exactSixSlots(slots) {
  assert(
    Array.isArray(slots) &&
      slots.length === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      slots.every(
        (entry, index) =>
          isRecord(entry) &&
          entry.slotId === TOP_HAT_RUNTIME_EXPECTED_SLOTS[index],
      ),
    'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_SLOTS_INVALID',
    'The campaign must contain the exact six canonical slots in canonical order.',
  );
}

function prepareSource(adapter, entry) {
  const dispatch = parseAvatarFinalPassProviderRuntimeDispatch(entry.dispatch);
  const expectedDispatch =
    compileProjectArtTopHatPoseSlotProviderRuntimeDispatch({
      adapter,
      slotId: entry.slotId,
      compiledAt: dispatch.compiledAt,
    });
  assert(
    canonicalJson(dispatch) === canonicalJson(expectedDispatch) &&
      dispatch.frameId === entry.slotId &&
      dispatch.jobId === `redraw:${entry.slotId}` &&
      dispatch.candidateAdmission?.expectedWidth === 1024 &&
      dispatch.candidateAdmission?.expectedHeight === 1536,
    'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_DISPATCH_MISMATCH',
  );
  const binding = parseAvatarFinalPassProviderRuntimeBinding(
    entry.binding,
    dispatch,
  );
  const source = parseAvatarProviderCandidateSourceChain({
    dispatch,
    binding,
    outcome: entry.outcome,
  });
  assert(
    source.outcome.result?.status === 'candidate-materialization-required' &&
      source.outcome.providerCallCount === 1 &&
      source.dispatch.providerCompiler.input.selection?.allowFallback === false,
    'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_SOURCE_INVALID',
  );
  return Object.freeze({
    slotId: entry.slotId,
    dispatch,
    binding,
    outcome: source.outcome,
    source,
  });
}

async function verifyArtifact(store, id, mediaType, label) {
  const verification = await store.verify(id);
  assert(
    verification?.exists === true &&
      verification.descriptorValid === true &&
      verification.contentValid === true,
    'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_ARTIFACT_INVALID',
    `${label} failed immutable verification.`,
  );
  const descriptor = await store.get(id);
  assert(
    isRecord(descriptor) &&
      descriptor.artifactId === id &&
      descriptor.mediaType === mediaType,
    'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_ARTIFACT_INVALID',
    `${label} descriptor is invalid.`,
  );
}

async function prepareCampaign({
  adapter: adapterInput,
  slots,
  artifactStore,
  workspaceRoot: workspaceRootInput,
  authorization: authorizationInput,
  plannedAt,
}) {
  exactSixSlots(slots);
  const adapter = parseProjectArtTopHatPoseSlotProviderRuntimeAdapter(adapterInput);
  const workspaceRoot = realDirectory(workspaceRootInput, 'workspaceRoot');
  const store = assertArtifactStore(artifactStore);
  const authorization = normalizedAuthorization(authorizationInput);
  const campaignPlannedAt = timestamp(
    plannedAt ?? new Date().toISOString(),
    'plannedAt',
  );
  const prepared = slots.map((entry) => prepareSource(adapter, entry));
  const targets = new Set();
  const planSlots = [];

  for (const entry of prepared) {
    await verifyArtifact(
      store,
      entry.source.candidateArtifactId,
      'image/png',
      `${entry.slotId} candidate artifact`,
    );
    await verifyArtifact(
      store,
      entry.source.evidenceArtifactId,
      'application/json',
      `${entry.slotId} evidence artifact`,
    );
    const outputs = candidateBundlePaths(
      workspaceRoot,
      entry.source.candidateOutputPath,
    );
    for (const target of Object.values(outputs)) {
      assert(
        !targets.has(target),
        'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_TARGET_COLLISION',
      );
      targets.add(target);
      assert(
        !existsSync(target),
        'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_REPLAY_BLOCKED',
        `${entry.slotId} output already exists; campaign materialization is create-only.`,
      );
    }
    planSlots.push(
      Object.freeze({
        slotId: entry.slotId,
        runtimeDispatchSha256: entry.dispatch.runtimeDispatchSha256,
        runtimeBindingSha256: entry.binding.runtimeBindingSha256,
        runtimeOutcomeSha256: entry.outcome.runtimeOutcomeSha256,
        providerRequestId: entry.source.providerRequestId,
        providerRequestSha256: entry.source.providerRequestSha256,
        compiledPromptSha256: entry.source.compiledPromptSha256,
        candidateArtifactId: entry.source.candidateArtifactId,
        evidenceArtifactId: entry.source.evidenceArtifactId,
        candidateOutputPath: entry.source.candidateOutputPath,
        reviewedTargetPath: entry.source.reviewedTargetPath,
        outputs,
      }),
    );
  }

  const body = {
    schema: TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_CAMPAIGN_PLAN_SCHEMA,
    protocolVersion:
      TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_CAMPAIGN_PROTOCOL_VERSION,
    status: 'ready-for-six-slot-candidate-materialization',
    plannedAt: campaignPlannedAt,
    sourceAdapterSha256: adapter.adapterSha256,
    sourceProviderPackageSha256: adapter.sourceProviderPackageSha256,
    sourceProviderRequestSha256: adapter.sourceProviderRequestSha256,
    productionPlanSha256: adapter.productionPlanSha256,
    characterId: adapter.characterId,
    workspaceRoot,
    slots: Object.freeze(planSlots),
    policy: Object.freeze({
      slotOrder: TOP_HAT_RUNTIME_EXPECTED_SLOTS,
      preflightAllSlotsBeforeFirstWrite: true,
      sequential: true,
      stopOnFirstFailure: true,
      createOnlyCandidateBundles: true,
      providerExecutionAllowed: false,
      automaticReviewAllowed: false,
      automaticAdmissionAllowed: false,
      automaticPromotionAllowed: false,
      providerFallbackAllowed: false,
    }),
    effects: Object.freeze({
      candidateBundlesMaterialized: 0,
      frameFinisherRequestsCreated: 0,
      humanReviewsCreated: 0,
      candidateAdmissionsCreated: 0,
      poseSlotsFilled: 0,
      releasesCreated: 0,
    }),
    authority: authority(),
  };
  const plan = deepFreeze({
    ...body,
    campaignPlanSha256: sha256Document(body),
  });
  return Object.freeze({
    adapter,
    workspaceRoot,
    store,
    authorization,
    prepared,
    plan,
  });
}

export async function compileTopHatPoseBankCandidateMaterializationCampaignPlan(
  input,
) {
  return (await prepareCampaign(input)).plan;
}

export function parseTopHatPoseBankCandidateMaterializationCampaignPlan(input) {
  const plan = verifySelfHash(
    input,
    'campaignPlanSha256',
    'Top Hat candidate materialization campaign plan',
  );
  assert(
    plan.schema ===
      TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_CAMPAIGN_PLAN_SCHEMA &&
      plan.protocolVersion ===
        TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_CAMPAIGN_PROTOCOL_VERSION &&
      plan.status === 'ready-for-six-slot-candidate-materialization' &&
      Array.isArray(plan.slots) &&
      plan.slots.length === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      plan.slots.every(
        (entry, index) =>
          entry.slotId === TOP_HAT_RUNTIME_EXPECTED_SLOTS[index],
      ) &&
      plan.policy?.preflightAllSlotsBeforeFirstWrite === true &&
      plan.policy?.sequential === true &&
      plan.policy?.stopOnFirstFailure === true &&
      plan.policy?.createOnlyCandidateBundles === true &&
      plan.policy?.providerExecutionAllowed === false &&
      plan.policy?.automaticReviewAllowed === false &&
      plan.policy?.automaticAdmissionAllowed === false &&
      plan.policy?.automaticPromotionAllowed === false &&
      plan.policy?.providerFallbackAllowed === false &&
      plan.authority?.candidateMaterialization === true &&
      AUTHORITY_KEYS.filter((key) => key !== 'candidateMaterialization').every(
        (key) => plan.authority?.[key] === false,
      ),
    'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_PLAN_INVALID',
  );
  return plan;
}

export async function runTopHatPoseBankCandidateMaterializationCampaign({
  materialize = materializeAvatarFinalPassProviderCandidate,
  clock = () => new Date().toISOString(),
  ...input
}) {
  assert(
    typeof materialize === 'function' && typeof clock === 'function',
    'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_EXECUTOR_INVALID',
  );
  const preparedCampaign = await prepareCampaign(input);
  const plan = preparedCampaign.plan;
  const slots = [];
  let failure = null;

  for (const entry of preparedCampaign.prepared) {
    try {
      const result = await materialize({
        dispatch: entry.dispatch,
        binding: entry.binding,
        outcome: entry.outcome,
        artifactStore: preparedCampaign.store,
        workspaceRoot: preparedCampaign.workspaceRoot,
        authorization: preparedCampaign.authorization,
        materializedAt: timestamp(clock(), `${entry.slotId}.materializedAt`),
      });
      assert(
        result?.reused === false &&
          result?.status ===
            'candidate-materialized-awaiting-frame-finisher' &&
          result?.receipt?.output?.unapproved === true &&
          result?.finisherRequest?.candidateApproval === false &&
          result?.finisherRequest?.candidatePromotion === false &&
          result?.finisherRequest?.runtimeActivationAllowed === false,
        'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_RESULT_INVALID',
      );
      slots.push(
        Object.freeze({
          slotId: entry.slotId,
          status: 'materialized-awaiting-frame-finisher',
          materializationId: result.materializationId,
          materializationSha256: result.receipt.materializationSha256,
          finisherRequestSha256:
            result.finisherRequest.finisherRequestSha256,
          candidatePath: result.candidatePath,
          materializationReceiptPath: result.receiptPath,
          finisherRequestPath: result.finisherRequestPath,
        }),
      );
    } catch (error) {
      failure = Object.freeze({
        slotId: entry.slotId,
        code:
          typeof error?.code === 'string'
            ? error.code
            : 'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_SLOT_FAILED',
        message: error instanceof Error ? error.message : String(error),
      });
      break;
    }
  }

  const completedAt = timestamp(clock(), 'completedAt');
  const body = {
    schema:
      TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_CAMPAIGN_RECEIPT_SCHEMA,
    protocolVersion:
      TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_CAMPAIGN_PROTOCOL_VERSION,
    status:
      failure === null && slots.length === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length
        ? 'succeeded-awaiting-frame-finishing-and-human-review'
        : 'failed',
    completedAt,
    campaignPlanSha256: plan.campaignPlanSha256,
    sourceAdapterSha256: plan.sourceAdapterSha256,
    slots: Object.freeze(slots),
    counts: Object.freeze({
      plannedSlots: TOP_HAT_RUNTIME_EXPECTED_SLOTS.length,
      attemptedSlots: slots.length + (failure === null ? 0 : 1),
      materializedSlots: slots.length,
      remainingSlots: TOP_HAT_RUNTIME_EXPECTED_SLOTS.length - slots.length,
      humanReviewsCreated: 0,
      candidateAdmissionsCreated: 0,
    }),
    failure,
    nextRequiredStage:
      'deterministic-frame-finishing-then-named-human-review',
    effects: Object.freeze({
      candidateBundlesMaterialized: slots.length,
      frameFinisherRequestsCreated: slots.length,
      humanReviewsCreated: 0,
      candidateAdmissionsCreated: 0,
      poseSlotsFilled: 0,
      releasesCreated: 0,
      providerCallsPerformed: 0,
    }),
    authority: authority(),
  };
  const receipt = deepFreeze({
    ...body,
    campaignExecutionSha256: sha256Document(body),
  });
  return deepFreeze({ plan, receipt });
}

export function parseTopHatPoseBankCandidateMaterializationCampaignReceipt(input) {
  const receipt = verifySelfHash(
    input,
    'campaignExecutionSha256',
    'Top Hat candidate materialization campaign receipt',
  );
  assert(
    receipt.schema ===
      TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_CAMPAIGN_RECEIPT_SCHEMA &&
      receipt.protocolVersion ===
        TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_CAMPAIGN_PROTOCOL_VERSION &&
      (receipt.status ===
        'succeeded-awaiting-frame-finishing-and-human-review' ||
        receipt.status === 'failed') &&
      Array.isArray(receipt.slots) &&
      receipt.slots.every(
        (entry, index) =>
          entry.slotId === TOP_HAT_RUNTIME_EXPECTED_SLOTS[index],
      ) &&
      receipt.counts?.materializedSlots === receipt.slots.length &&
      receipt.counts?.humanReviewsCreated === 0 &&
      receipt.counts?.candidateAdmissionsCreated === 0 &&
      receipt.effects?.providerCallsPerformed === 0 &&
      receipt.effects?.humanReviewsCreated === 0 &&
      receipt.effects?.candidateAdmissionsCreated === 0 &&
      receipt.authority?.candidateMaterialization === true &&
      AUTHORITY_KEYS.filter((key) => key !== 'candidateMaterialization').every(
        (key) => receipt.authority?.[key] === false,
      ),
    'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_RECEIPT_INVALID',
  );
  return receipt;
}
