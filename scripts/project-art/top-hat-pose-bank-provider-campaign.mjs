import path from 'node:path';
import { lstat } from 'node:fs/promises';

import { LocalArtifactStore } from '../../packages/artifacts/dist/index.js';
import {
  PROVIDER_PROTOCOL_VERSION,
  compileProviderCandidateRuntimeContract,
  compileProviderExecutionRoutingPlan,
  providerRequestSha256,
  validateProviderCandidateRequest,
} from '../../packages/providers/dist/index.js';
import {
  createProviderRegistryFromEnvironment,
  restrictProviderRegistry,
} from '../../apps/worker/dist/provider-handlers.js';

import {
  validateAvatarFinalPassCompiledProviderRuntimeContract,
} from './avatar-final-pass-provider-runtime-dispatch.mjs';
import {
  GENERIC_PROVIDER_PROTOCOL_VERSION,
} from './avatar-final-pass-provider-runtime-constants.mjs';
import {
  compileProjectArtTopHatPoseSlotProviderRuntimeDispatch,
  parseProjectArtTopHatPoseSlotProviderRuntimeAdapter,
} from './top-hat-pose-slot-provider-runtime-adapter.mjs';
import {
  TOP_HAT_RUNTIME_EXPECTED_SLOTS,
} from './top-hat-pose-slot-provider-runtime-foundation.mjs';
import {
  artifactId,
  assert,
  boundedText,
  deepFreeze,
  digest,
  exactKeys,
  isRecord,
  parseAllFalseAuthority,
  sha256Document,
  sha256Text,
  timestamp,
  verifySelfHash,
} from './avatar-final-pass-provider-runtime-common.mjs';

export const TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_PLAN_SCHEMA =
  'evavo.project-art-top-hat-pose-bank-provider-campaign-plan.v1';
export const TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_RECEIPT_SCHEMA =
  'evavo.project-art-top-hat-pose-bank-provider-campaign-receipt.v1';
export const TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_PROTOCOL_VERSION =
  '2026-08-19.1';

const PLAN_AUTHORITY_KEYS = Object.freeze([
  'providerExecution',
  'runtimeSubmission',
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

const RECEIPT_AUTHORITY_KEYS = PLAN_AUTHORITY_KEYS;

function falseAuthority(keys = PLAN_AUTHORITY_KEYS) {
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, false])));
}

function campaignPolicy() {
  return Object.freeze({
    slotOrder: TOP_HAT_RUNTIME_EXPECTED_SLOTS,
    sequential: true,
    stopOnFirstFailure: true,
    preflightAllSlotsBeforeFirstProviderCall: true,
    perSlotMaximumAttempts: 1,
    automaticRetry: false,
    providerFallbackAllowed: false,
    freshHumanAuthorizationRequiredAfterFailedProviderAttempt: true,
    sharedDurableRuntimeRoot: true,
    sharedArtifactStoreRequired: true,
  });
}

function normalizedAbsolutePath(value, label) {
  assert(
    typeof value === 'string' && value.length >= 1 && !value.includes('\0'),
    'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_PATH_INVALID',
    `${label} is invalid.`,
  );
  const resolved = path.resolve(value);
  assert(
    resolved === value,
    'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_PATH_INVALID',
    `${label} must be absolute and normalized.`,
  );
  return resolved;
}

async function realDirectory(value, label) {
  const root = normalizedAbsolutePath(value, label);
  const state = await lstat(root);
  assert(
    state.isDirectory() && !state.isSymbolicLink(),
    'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_PATH_INVALID',
    `${label} must be a real directory.`,
  );
  return root;
}

async function preflightReferences(artifacts, request, selectedAdapter) {
  let totalBytes = 0;
  const references = [];
  for (const [index, reference] of request.references.entries()) {
    const descriptor = await artifacts.get(reference.artifactId);
    assert(
      descriptor || reference.required !== true,
      'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_REFERENCE_MISSING',
      `Required provider reference ${index} is missing from artifactRoot.`,
    );
    if (!descriptor) continue;
    const verification = await artifacts.verify(reference.artifactId);
    assert(
      verification.descriptorValid === true && verification.contentValid === true,
      'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_REFERENCE_INVALID',
      `Provider reference ${index} failed immutable verification.`,
    );
    assert(
      descriptor.mediaType.startsWith('image/'),
      'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_REFERENCE_INVALID',
      `Provider reference ${index} is not an image artifact.`,
    );
    assert(
      descriptor.sizeBytes <= 32 * 1024 * 1024 &&
        descriptor.sizeBytes <= selectedAdapter.maximumSourceBytes,
      'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_REFERENCE_TOO_LARGE',
      `Provider reference ${index} exceeds the selected adapter source limit.`,
    );
    totalBytes += descriptor.sizeBytes;
    assert(
      totalBytes <= 128 * 1024 * 1024,
      'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_REFERENCES_TOO_LARGE',
      'Provider references exceed the aggregate source limit.',
    );
    references.push(Object.freeze({
      artifactId: reference.artifactId,
      role: reference.role,
      required: reference.required,
      contentHash: descriptor.contentHash,
      mediaType: descriptor.mediaType,
      sizeBytes: descriptor.sizeBytes,
    }));
  }
  return Object.freeze(references);
}

function authorizationSummary(dispatch) {
  const metadata = dispatch.providerCompiler.input?.metadata?.topHatPoseSlot;
  assert(
    isRecord(metadata) && isRecord(metadata.authorization),
    'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_AUTHORIZATION_INVALID',
  );
  assert(
    metadata.authorization.actorClass === 'human' &&
      metadata.authorization.maximumProviderCalls === 1,
    'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_AUTHORIZATION_INVALID',
  );
  return Object.freeze({
    actorClass: 'human',
    actorId: boundedText(
      metadata.authorization.actorId,
      'topHatPoseSlot.authorization.actorId',
      1,
      256,
    ),
    occurredAt: timestamp(
      metadata.authorization.occurredAt,
      'topHatPoseSlot.authorization.occurredAt',
    ),
    expiresAt: timestamp(
      metadata.authorization.expiresAt,
      'topHatPoseSlot.authorization.expiresAt',
    ),
    evidenceSha256: digest(
      metadata.authorization.evidenceSha256,
      'topHatPoseSlot.authorization.evidenceSha256',
    ),
    maximumProviderCalls: 1,
  });
}

export async function compileTopHatPoseBankProviderCampaignPlan({
  adapter: adapterInput,
  artifactRoot: artifactRootInput,
  environment = process.env,
  plannedAt = new Date().toISOString(),
}) {
  const adapter = parseProjectArtTopHatPoseSlotProviderRuntimeAdapter(adapterInput);
  const campaignPlannedAt = timestamp(plannedAt, 'plannedAt');
  assert(
    PROVIDER_PROTOCOL_VERSION === GENERIC_PROVIDER_PROTOCOL_VERSION,
    'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_PROTOCOL_DRIFT',
    `Avatar provider bridge ${GENERIC_PROVIDER_PROTOCOL_VERSION} does not match provider runtime ${PROVIDER_PROTOCOL_VERSION}.`,
  );
  assert(
    adapter.counts.slots === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      adapter.counts.readySlots === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      adapter.counts.maximumProviderCalls === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      adapter.counts.candidatesPerSlot === 1,
    'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_ADAPTER_INCOMPLETE',
  );

  const artifactRoot = await realDirectory(artifactRootInput, 'artifactRoot');
  const artifacts = new LocalArtifactStore({ root: artifactRoot });
  const baseRegistry = createProviderRegistryFromEnvironment(environment);
  const slots = [];
  const submissionKeys = new Set();
  let verifiedReferenceCount = 0;

  for (const slotId of TOP_HAT_RUNTIME_EXPECTED_SLOTS) {
    const dispatch = compileProjectArtTopHatPoseSlotProviderRuntimeDispatch({
      adapter,
      slotId,
      compiledAt: campaignPlannedAt,
    });
    const compiled = compileProviderCandidateRuntimeContract(
      dispatch.providerCompiler.input,
    );
    const binding = validateAvatarFinalPassCompiledProviderRuntimeContract(
      dispatch,
      compiled,
    );
    const request = validateProviderCandidateRequest(compiled.request);
    assert(
      providerRequestSha256(request) === binding.normalizedProviderRequestSha256 &&
        request.candidateCount === 1 &&
        request.selection.allowFallback === false,
      'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_REQUEST_INVALID',
    );
    assert(
      Array.isArray(request.selection.allowedAdapterIds) &&
        request.selection.allowedAdapterIds.length >= 1,
      'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_ADAPTERS_INVALID',
    );
    const registry = restrictProviderRegistry(
      baseRegistry,
      request.selection.allowedAdapterIds,
    );
    const routing = compileProviderExecutionRoutingPlan(
      request,
      registry.rank(request),
    );
    assert(
      routing.eligibleAdapters.length >= 1 &&
        routing.inspection.fallbackAllowed === false &&
        routing.inspection.providerCallPerformedByInspection === false,
      'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_ROUTING_INVALID',
      `${slotId} has no eligible exact provider adapter.`,
    );
    const selectedAdapter = routing.eligibleAdapters[0].adapter.descriptor;
    const references = await preflightReferences(
      artifacts,
      request,
      selectedAdapter,
    );
    verifiedReferenceCount += references.length;
    assert(
      !submissionKeys.has(dispatch.submissionIdempotencyKey),
      'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_DUPLICATE_SUBMISSION',
    );
    submissionKeys.add(dispatch.submissionIdempotencyKey);
    slots.push(Object.freeze({
      slotId,
      sourceJobEnvelopeSha256:
        dispatch.providerCompiler.input.metadata.topHatPoseSlot
          .providerJobEnvelopeSha256,
      preflightRuntimeDispatchSha256: dispatch.runtimeDispatchSha256,
      providerRequestInputSha256: dispatch.providerRequestInputSha256,
      normalizedProviderRequestId: binding.normalizedProviderRequestId,
      normalizedProviderRequestSha256: binding.normalizedProviderRequestSha256,
      compiledPromptSha256: binding.compiledPromptSha256,
      submissionIdempotencyKey: dispatch.submissionIdempotencyKey,
      allowedAdapterIds: Object.freeze([...request.selection.allowedAdapterIds]),
      eligibleAdapterIds: Object.freeze(
        routing.eligibleAdapters.map((entry) => entry.adapter.descriptor.id),
      ),
      selectedAdapterId: selectedAdapter.id,
      candidateOutputPath: dispatch.candidateAdmission.candidateOutputPath,
      reviewedTargetPath: dispatch.candidateAdmission.reviewedTargetPath,
      authorization: authorizationSummary(dispatch),
      references,
      providerExecutionPerformed: false,
      candidateMaterializationPerformed: false,
      candidateApprovalPerformed: false,
      poseSlotFilled: false,
    }));
  }

  const body = {
    schema: TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_PLAN_SCHEMA,
    protocolVersion: TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_PROTOCOL_VERSION,
    status: 'ready-for-six-slot-provider-execution',
    plannedAt: campaignPlannedAt,
    providerProtocolVersion: PROVIDER_PROTOCOL_VERSION,
    sourceAdapterSha256: adapter.adapterSha256,
    sourceProviderPackageSha256: adapter.sourceProviderPackageSha256,
    sourceProviderRequestSha256: adapter.sourceProviderRequestSha256,
    productionPlanSha256: adapter.productionPlanSha256,
    characterId: adapter.characterId,
    artifactStore: Object.freeze({
      root: artifactRoot,
      rootSha256: sha256Text(artifactRoot),
    }),
    slots: Object.freeze(slots),
    counts: Object.freeze({
      slots: TOP_HAT_RUNTIME_EXPECTED_SLOTS.length,
      readySlots: slots.length,
      maximumProviderCalls: TOP_HAT_RUNTIME_EXPECTED_SLOTS.length,
      candidatesPerSlot: 1,
      maximumCandidates: TOP_HAT_RUNTIME_EXPECTED_SLOTS.length,
      verifiedProviderReferences: verifiedReferenceCount,
    }),
    executionPolicy: campaignPolicy(),
    effects: Object.freeze({
      providerExecutionPerformed: false,
      runtimeSubmissionPerformed: false,
      candidateBytesMaterialized: false,
      candidateApprovalPerformed: false,
      poseSlotsFilled: false,
      sequenceReleased: false,
      repositoryMutationPerformed: false,
      publicationPerformed: false,
      runtimeActivationPerformed: false,
    }),
    authority: falseAuthority(),
  };
  return deepFreeze({
    ...body,
    campaignPlanSha256: sha256Document(body),
  });
}

export function parseTopHatPoseBankProviderCampaignPlan(input) {
  const plan = verifySelfHash(
    input,
    'campaignPlanSha256',
    'Top Hat pose-bank provider campaign plan',
  );
  exactKeys(
    plan,
    [
      'schema',
      'protocolVersion',
      'status',
      'plannedAt',
      'providerProtocolVersion',
      'sourceAdapterSha256',
      'sourceProviderPackageSha256',
      'sourceProviderRequestSha256',
      'productionPlanSha256',
      'characterId',
      'artifactStore',
      'slots',
      'counts',
      'executionPolicy',
      'effects',
      'authority',
      'campaignPlanSha256',
    ],
    'Top Hat pose-bank provider campaign plan',
  );
  assert(
    plan.schema === TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_PLAN_SCHEMA &&
      plan.protocolVersion === TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_PROTOCOL_VERSION &&
      plan.status === 'ready-for-six-slot-provider-execution' &&
      plan.providerProtocolVersion === GENERIC_PROVIDER_PROTOCOL_VERSION,
    'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_PLAN_INVALID',
  );
  timestamp(plan.plannedAt, 'campaign plan.plannedAt');
  for (const key of [
    'sourceAdapterSha256',
    'sourceProviderPackageSha256',
    'sourceProviderRequestSha256',
    'productionPlanSha256',
  ]) digest(plan[key], `campaign plan.${key}`);
  assert(
    Array.isArray(plan.slots) &&
      plan.slots.length === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      plan.slots.every(
        (slot, index) => slot.slotId === TOP_HAT_RUNTIME_EXPECTED_SLOTS[index],
      ) &&
      plan.counts?.slots === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      plan.counts?.readySlots === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      plan.counts?.maximumProviderCalls === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      plan.counts?.candidatesPerSlot === 1 &&
      plan.executionPolicy?.sequential === true &&
      plan.executionPolicy?.stopOnFirstFailure === true &&
      plan.executionPolicy?.preflightAllSlotsBeforeFirstProviderCall === true &&
      plan.executionPolicy?.perSlotMaximumAttempts === 1 &&
      plan.executionPolicy?.automaticRetry === false &&
      plan.executionPolicy?.providerFallbackAllowed === false,
    'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_PLAN_INVALID',
  );
  assert(
    isRecord(plan.effects) &&
      Object.values(plan.effects).every((value) => value === false),
    'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_PLAN_EFFECTS_INVALID',
  );
  parseAllFalseAuthority(
    plan.authority,
    PLAN_AUTHORITY_KEYS,
    'campaign plan.authority',
  );
  return plan;
}

export function parseTopHatPoseBankProviderCampaignReceipt(input, planInput) {
  const plan = parseTopHatPoseBankProviderCampaignPlan(planInput);
  const receipt = verifySelfHash(
    input,
    'campaignExecutionSha256',
    'Top Hat pose-bank provider campaign receipt',
  );
  assert(
    receipt.schema === TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_RECEIPT_SCHEMA &&
      receipt.protocolVersion === TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_PROTOCOL_VERSION &&
      ['succeeded', 'failed'].includes(receipt.status) &&
      receipt.campaignPlanSha256 === plan.campaignPlanSha256 &&
      receipt.sourceAdapterSha256 === plan.sourceAdapterSha256 &&
      receipt.sourceProviderPackageSha256 === plan.sourceProviderPackageSha256,
    'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_RECEIPT_INVALID',
  );
  timestamp(receipt.startedAt, 'campaign receipt.startedAt');
  timestamp(receipt.completedAt, 'campaign receipt.completedAt');
  assert(
    Array.isArray(receipt.slots) &&
      receipt.slots.length <= TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      receipt.slots.every(
        (slot, index) => slot.slotId === TOP_HAT_RUNTIME_EXPECTED_SLOTS[index],
      ),
    'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_RECEIPT_SLOT_ORDER_INVALID',
  );
  const succeeded = receipt.slots.filter((slot) => slot.status === 'succeeded').length;
  const failed = receipt.slots.filter((slot) => slot.status !== 'succeeded').length;
  const verifiedCalls = receipt.slots.reduce(
    (sum, slot) =>
      sum + (slot.providerCallCountVerified === true ? slot.providerCallCount : 0),
    0,
  );
  assert(
    receipt.counts?.plannedSlots === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      receipt.counts?.attemptedSlots === receipt.slots.length &&
      receipt.counts?.succeededSlots === succeeded &&
      receipt.counts?.failedSlots === failed &&
      receipt.counts?.verifiedProviderCalls === verifiedCalls &&
      verifiedCalls <= TOP_HAT_RUNTIME_EXPECTED_SLOTS.length,
    'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_RECEIPT_COUNT_INVALID',
  );
  if (receipt.status === 'succeeded') {
    assert(
      receipt.slots.length === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
        succeeded === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
        failed === 0 &&
        verifiedCalls === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
        receipt.failure === null,
      'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_RECEIPT_SUCCESS_INVALID',
    );
    for (const slot of receipt.slots) {
      assert(
        slot.providerCallCount === 1 &&
          slot.providerCallCountVerified === true &&
          typeof slot.runtimeOutcomeSha256 === 'string' &&
          artifactId(slot.candidateArtifactId, `${slot.slotId}.candidateArtifactId`) &&
          artifactId(slot.evidenceArtifactId, `${slot.slotId}.evidenceArtifactId`),
        'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_RECEIPT_SUCCESS_INVALID',
      );
    }
  } else {
    assert(
      isRecord(receipt.failure),
      'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_RECEIPT_FAILURE_INVALID',
    );
  }
  assert(
    receipt.effects?.candidateBytesMaterialized === false &&
      receipt.effects?.candidateApprovalPerformed === false &&
      receipt.effects?.poseSlotsFilled === false &&
      receipt.effects?.sequenceReleased === false &&
      receipt.effects?.repositoryMutationPerformed === false &&
      receipt.effects?.publicationPerformed === false &&
      receipt.effects?.runtimeActivationPerformed === false,
    'TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_RECEIPT_EFFECTS_INVALID',
  );
  parseAllFalseAuthority(
    receipt.authority,
    RECEIPT_AUTHORITY_KEYS,
    'campaign receipt.authority',
  );
  return receipt;
}

export function topHatPoseBankProviderCampaignCapabilities() {
  return Object.freeze({
    schema: 'evavo.project-art-top-hat-pose-bank-provider-campaign-capabilities.v1',
    protocolVersion: TOP_HAT_POSE_BANK_PROVIDER_CAMPAIGN_PROTOCOL_VERSION,
    requiredSlots: TOP_HAT_RUNTIME_EXPECTED_SLOTS.length,
    preflightAllSlotsBeforeFirstProviderCall: true,
    sequentialExecution: true,
    stopOnFirstFailure: true,
    maximumProviderCalls: TOP_HAT_RUNTIME_EXPECTED_SLOTS.length,
    candidatesPerSlot: 1,
    perSlotMaximumAttempts: 1,
    providerFallbackAllowed: false,
    automaticRetry: false,
    activeNamedHumanAuthorizationPerSlotRequired: true,
    immutableProviderReferencePreflight: true,
    exactAdapterAvailabilityPreflight: true,
    providerExecution: false,
    runtimeSubmission: false,
    candidateMaterialization: false,
    candidateApproval: false,
    candidatePromotion: false,
    poseSlotFilling: false,
    sequenceRelease: false,
    repositoryMutation: false,
    gitPush: false,
    deployment: false,
    publication: false,
    runtimeActivation: false,
    forcePush: false,
  });
}
