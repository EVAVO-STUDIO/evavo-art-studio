import { createHash } from 'node:crypto';

import {
  inspectTopHatV3ProviderSchedule,
} from './top-hat-v3-provider-scheduler.mjs';
import {
  inspectTopHatV3ProviderAuthorization,
} from './top-hat-v3-provider-authorization.mjs';

export const TOP_HAT_V3_PROVIDER_DISPATCH_SCHEMA =
  'evavo.project-art-top-hat-v3-provider-dispatch.v1';

const freeze = Object.freeze;
const SHA256 = /^[a-f0-9]{64}$/u;

function fail(code, detail = code) {
  const error = new Error(`${code}:${detail}`);
  error.code = code;
  throw error;
}

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('TOP_HAT_V3_DISPATCH_RECORD_INVALID', label);
  }
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function sha256Document(value) {
  return createHash('sha256')
    .update(`${JSON.stringify(canonical(value))}\n`, 'utf8')
    .digest('hex');
}

function requestAdapterIds(request) {
  const ids = request?.selection?.allowedAdapterIds;
  if (!Array.isArray(ids) || ids.length === 0) {
    fail('TOP_HAT_V3_DISPATCH_REQUEST_ADAPTERS_INVALID');
  }
  return ids;
}

export function compileTopHatV3ProviderDispatch(input = {}) {
  const schedule = record(input.schedule, 'schedule');
  const scheduleReadiness = inspectTopHatV3ProviderSchedule(schedule);
  const authorization = record(input.authorization, 'authorization');
  const authorizationReadiness = inspectTopHatV3ProviderAuthorization(
    authorization,
    {
      now: input.now,
      usedProviderCalls: input.usedProviderCalls ?? 0,
    },
  );

  if (!authorizationReadiness.active) {
    fail('TOP_HAT_V3_DISPATCH_AUTHORIZATION_INACTIVE');
  }
  if (
    authorizationReadiness.generationPlanSha256 !==
      schedule.generationPlanSha256
  ) {
    fail('TOP_HAT_V3_DISPATCH_GENERATION_PLAN_MISMATCH');
  }
  const requested = schedule.nextDispatchBatch.jobs;
  const budget = Math.min(
    requested.length,
    authorizationReadiness.remainingProviderCalls,
    authorizationReadiness.maximumConcurrentCalls,
  );
  if (budget < 1 && requested.length > 0) {
    fail('TOP_HAT_V3_DISPATCH_PROVIDER_BUDGET_EXHAUSTED');
  }

  const allowed = new Set(authorizationReadiness.allowedAdapterIds);
  const jobs = freeze(
    requested.slice(0, budget).map((entry) => {
      if (!entry.dispatchEligible || !entry.request) {
        fail('TOP_HAT_V3_DISPATCH_JOB_NOT_ELIGIBLE', entry.jobId);
      }
      const requestAdapters = requestAdapterIds(entry.request);
      if (requestAdapters.some((adapterId) => !allowed.has(adapterId))) {
        fail('TOP_HAT_V3_DISPATCH_ADAPTER_SCOPE_VIOLATION', entry.jobId);
      }
      const requestSha256 = sha256Document(entry.request);
      return freeze({
        jobId: entry.jobId,
        requestSha256,
        request: entry.request,
        providerCallBudget: 1,
        allowedAdapterIds: freeze([...requestAdapters]),
        candidateApprovalAuthorized: false,
        candidatePromotionAuthorized: false,
        runtimeActivationAuthorized: false,
      });
    }),
  );

  const body = freeze({
    schema: TOP_HAT_V3_PROVIDER_DISPATCH_SCHEMA,
    characterId: 'top-hat-man',
    generationPlanSha256: schedule.generationPlanSha256,
    providerPlanSha256: schedule.providerPlanSha256,
    scheduleSha256: scheduleReadiness.scheduleSha256,
    authorizationSha256: authorizationReadiness.authorizationSha256,
    phase: schedule.nextDispatchBatch.phase,
    clipId: schedule.nextDispatchBatch.clipId,
    waveIndex: schedule.nextDispatchBatch.waveIndex,
    jobs,
    budget: freeze({
      authorizedMaximumProviderCalls:
        authorizationReadiness.maximumProviderCalls,
      usedProviderCallsBeforeDispatch:
        authorizationReadiness.usedProviderCalls,
      remainingProviderCallsBeforeDispatch:
        authorizationReadiness.remainingProviderCalls,
      maximumConcurrentCalls:
        authorizationReadiness.maximumConcurrentCalls,
      callsReservedByThisDispatch: jobs.length,
      remainingProviderCallsAfterSuccessfulDispatch:
        authorizationReadiness.remainingProviderCalls - jobs.length,
    }),
    policy: freeze({
      oneProviderCallPerJob: true,
      exactAdapterAllowlistRequired: true,
      providerFallbackAllowed: false,
      candidateOutputsRemainUnapproved: true,
      automaticApproval: false,
      automaticPromotion: false,
      runtimeActivation: false,
      publication: false,
      deployment: false,
    }),
    executionPerformed: false,
  });
  return freeze({ ...body, dispatchSha256: sha256Document(body) });
}

export function inspectTopHatV3ProviderDispatch(value) {
  const dispatch = record(value, 'dispatch');
  if (
    dispatch.schema !== TOP_HAT_V3_PROVIDER_DISPATCH_SCHEMA ||
    dispatch.characterId !== 'top-hat-man' ||
    dispatch.policy?.oneProviderCallPerJob !== true ||
    dispatch.policy?.exactAdapterAllowlistRequired !== true ||
    dispatch.policy?.providerFallbackAllowed !== false ||
    dispatch.policy?.automaticApproval !== false ||
    dispatch.policy?.automaticPromotion !== false ||
    dispatch.policy?.runtimeActivation !== false ||
    dispatch.executionPerformed !== false ||
    !SHA256.test(dispatch.dispatchSha256 ?? '')
  ) {
    fail('TOP_HAT_V3_DISPATCH_INVALID');
  }
  const { dispatchSha256, ...body } = dispatch;
  if (sha256Document(body) !== dispatchSha256) {
    fail('TOP_HAT_V3_DISPATCH_HASH_INVALID');
  }
  return freeze({
    schema: 'evavo.project-art-top-hat-v3-provider-dispatch-readiness.v1',
    characterId: 'top-hat-man',
    dispatchSha256,
    phase: dispatch.phase,
    clipId: dispatch.clipId,
    waveIndex: dispatch.waveIndex,
    jobCount: dispatch.jobs.length,
    callsReserved: dispatch.budget.callsReservedByThisDispatch,
    callsRemainingAfterSuccessfulDispatch:
      dispatch.budget.remainingProviderCallsAfterSuccessfulDispatch,
    providerFallbackAllowed: false,
    executionPerformed: false,
    approvalPerformed: false,
    runtimeActivationPerformed: false,
  });
}
