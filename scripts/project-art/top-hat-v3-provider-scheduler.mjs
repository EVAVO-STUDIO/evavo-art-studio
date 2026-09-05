import { createHash } from 'node:crypto';

import {
  TOP_HAT_V3_PROVIDER_PLAN_SCHEMA,
  inspectTopHatV3ProviderPlan,
} from './top-hat-v3-animation-provider-plan.mjs';
import {
  inspectTopHatV3ApprovedFrameLedger,
} from './top-hat-v3-approved-frame-ledger.mjs';

export const TOP_HAT_V3_PROVIDER_SCHEDULE_SCHEMA =
  'evavo.project-art-top-hat-v3-provider-schedule.v1';

const freeze = Object.freeze;
const SHA256 = /^[a-f0-9]{64}$/u;

function fail(code, detail = code) {
  const error = new Error(`${code}:${detail}`);
  error.code = code;
  throw error;
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

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('TOP_HAT_V3_PROVIDER_SCHEDULER_RECORD_INVALID', label);
  }
  return value;
}

function approvedSet(value = []) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    fail('TOP_HAT_V3_PROVIDER_SCHEDULER_APPROVALS_INVALID');
  }
  return new Set(value);
}

function approvedFromLedger(ledgerInput, providerPlan) {
  if (ledgerInput === null || ledgerInput === undefined) {
    return Object.freeze({ ids: new Set(), ledgerSha256: null });
  }
  const readiness = inspectTopHatV3ApprovedFrameLedger(ledgerInput);
  if (readiness.generationPlanSha256 !== providerPlan.generationPlanSha256) {
    fail('TOP_HAT_V3_PROVIDER_SCHEDULER_LEDGER_PLAN_MISMATCH');
  }
  return Object.freeze({
    ids: new Set(readiness.approvedJobIds),
    ledgerSha256: readiness.ledgerSha256,
  });
}

function successfulSet(value = []) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    fail('TOP_HAT_V3_PROVIDER_SCHEDULER_COMPLETIONS_INVALID');
  }
  return new Set(value);
}

function entryState(entry, approved, successful) {
  if (approved.has(entry.jobId)) return 'approved';
  if (successful.has(entry.jobId)) return 'awaiting-approval';
  if (entry.request === null) return 'blocked';
  return 'request-ready';
}

function scheduleEntry(entry, approved, successful, extraBlockers = []) {
  const state = entryState(entry, approved, successful);
  const blockers = [
    ...entry.blockers,
    ...extraBlockers,
    ...(state === 'awaiting-approval' ? ['candidate-approval-required'] : []),
  ];
  return freeze({
    jobId: entry.jobId,
    kind: entry.kind,
    state,
    dispatchEligible: state === 'request-ready' && blockers.length === 0,
    blockers: freeze([...new Set(blockers)]),
    request: state === 'request-ready' && blockers.length === 0 ? entry.request : null,
  });
}

function allApproved(rows, approved) {
  return rows.every((entry) => approved.has(entry.jobId));
}

function allTerminal(rows, approved, successful) {
  return rows.every((entry) => approved.has(entry.jobId) || successful.has(entry.jobId));
}

function compileFoundation(providerPlan, approved, successful) {
  return freeze(
    providerPlan.foundation.map((entry) => scheduleEntry(entry, approved, successful)),
  );
}

function compileLayers(providerPlan, approved, successful, foundationApproved) {
  const barrier = foundationApproved ? [] : ['foundation-approval-barrier'];
  return freeze(
    providerPlan.registeredLayers.map((entry) =>
      scheduleEntry(entry, approved, successful, barrier),
    ),
  );
}

function compileClips(providerPlan, approved, successful, foundationApproved) {
  return freeze(
    providerPlan.clips.map((clip) => {
      let previousWaveApproved = foundationApproved;
      const waves = clip.waves.map((wave) => {
        const waveBarrier = previousWaveApproved
          ? []
          : [
              wave.waveIndex === 0
                ? 'foundation-approval-barrier'
                : `previous-wave-approval-barrier:${wave.waveIndex - 1}`,
            ];
        const jobs = freeze(
          wave.jobs.map((entry) =>
            scheduleEntry(entry, approved, successful, waveBarrier),
          ),
        );
        previousWaveApproved = allApproved(wave.jobs, approved);
        return freeze({
          waveIndex: wave.waveIndex,
          mode: wave.mode,
          previousBarrierSatisfied: waveBarrier.length === 0,
          allApproved: allApproved(wave.jobs, approved),
          allProviderRunsComplete: allTerminal(wave.jobs, approved, successful),
          jobs,
        });
      });
      return freeze({
        clipId: clip.clipId,
        fps: clip.fps,
        loopMode: clip.loopMode,
        targetFrames: clip.targetFrames,
        waves: freeze(waves),
      });
    }),
  );
}

function nextDispatchBatch(foundation, layers, clips, maximumJobs) {
  const groups = [
    { phase: 'foundation', clipId: null, waveIndex: null, rows: foundation },
    { phase: 'registered-layers', clipId: null, waveIndex: null, rows: layers },
    ...clips.flatMap((clip) =>
      clip.waves.map((wave) => ({
        phase: 'body-clips',
        clipId: clip.clipId,
        waveIndex: wave.waveIndex,
        rows: wave.jobs,
      })),
    ),
  ];
  for (const group of groups) {
    const ready = group.rows.filter((entry) => entry.dispatchEligible);
    if (ready.length > 0) {
      return freeze({
        phase: group.phase,
        clipId: group.clipId,
        waveIndex: group.waveIndex,
        jobs: freeze(ready.slice(0, maximumJobs)),
      });
    }
  }
  return freeze({ phase: null, clipId: null, waveIndex: null, jobs: freeze([]) });
}

export function compileTopHatV3ProviderSchedule(input = {}) {
  const providerPlan = record(input.providerPlan, 'providerPlan');
  if (providerPlan.schema !== TOP_HAT_V3_PROVIDER_PLAN_SCHEMA) {
    fail('TOP_HAT_V3_PROVIDER_SCHEDULER_PLAN_SCHEMA_INVALID');
  }
  inspectTopHatV3ProviderPlan(providerPlan);

  const ledgerApproval = approvedFromLedger(input.approvedLedger, providerPlan);
  const explicitApproved = approvedSet(input.approvedJobIds ?? []);
  if (ledgerApproval.ledgerSha256 !== null && explicitApproved.size > 0) {
    for (const id of explicitApproved) {
      if (!ledgerApproval.ids.has(id)) {
        fail('TOP_HAT_V3_PROVIDER_SCHEDULER_EXPLICIT_APPROVAL_OUTSIDE_LEDGER', id);
      }
    }
  }
  const approved = ledgerApproval.ledgerSha256 === null
    ? explicitApproved
    : ledgerApproval.ids;
  const approvalSource = ledgerApproval.ledgerSha256 === null
    ? 'explicit-job-id-list'
    : 'sealed-approved-frame-ledger';

  const successful = successfulSet(input.successfulProviderJobIds ?? []);
  const maximumJobs = input.maximumJobs ?? 8;
  if (!Number.isSafeInteger(maximumJobs) || maximumJobs < 1 || maximumJobs > 64) {
    fail('TOP_HAT_V3_PROVIDER_SCHEDULER_MAXIMUM_INVALID');
  }
  for (const jobId of approved) successful.add(jobId);

  const foundation = compileFoundation(providerPlan, approved, successful);
  const foundationApproved = allApproved(providerPlan.foundation, approved);
  const registeredLayers = compileLayers(
    providerPlan,
    approved,
    successful,
    foundationApproved,
  );
  const clips = compileClips(
    providerPlan,
    approved,
    successful,
    foundationApproved,
  );
  const next = nextDispatchBatch(
    foundation,
    registeredLayers,
    clips,
    maximumJobs,
  );
  const allRows = [
    ...foundation,
    ...registeredLayers,
    ...clips.flatMap((clip) => clip.waves.flatMap((wave) => wave.jobs)),
  ];
  const body = freeze({
    schema: TOP_HAT_V3_PROVIDER_SCHEDULE_SCHEMA,
    characterId: 'top-hat-man',
    generationPlanSha256: providerPlan.generationPlanSha256,
    providerPlanSha256: providerPlan.providerPlanSha256,
    approvals: freeze({
      source: approvalSource,
      approvedFrameLedgerSha256: ledgerApproval.ledgerSha256,
      approvedJobCount: approved.size,
    }),
    state: freeze({
      foundationApproved,
      approvedJobs: approved.size,
      successfulProviderJobs: successful.size,
      dispatchEligibleJobs: allRows.filter((entry) => entry.dispatchEligible).length,
      awaitingApprovalJobs: allRows.filter((entry) => entry.state === 'awaiting-approval').length,
      blockedJobs: allRows.filter((entry) => entry.blockers.length > 0).length,
    }),
    productionOrder: freeze([
      'foundation',
      'registered-layers',
      'body-clips-by-priority-and-wave',
      'temporal-loop-review',
      'atlas-audio-release',
    ]),
    policy: freeze({
      foundationApprovalRequiredBeforeBody: true,
      previousWaveApprovalRequiredBeforeNextWave: true,
      providerSuccessDoesNotEqualApproval: true,
      sealedApprovalLedgerPreferred: true,
      blockedRequestsNeverDispatch: true,
      maximumConcurrentDispatches: maximumJobs,
      automaticApproval: false,
      automaticPromotion: false,
      automaticRuntimeActivation: false,
    }),
    foundation,
    registeredLayers,
    clips,
    nextDispatchBatch: next,
  });
  return freeze({ ...body, scheduleSha256: sha256Document(body) });
}

export function inspectTopHatV3ProviderSchedule(value) {
  const schedule = record(value, 'schedule');
  if (
    schedule.schema !== TOP_HAT_V3_PROVIDER_SCHEDULE_SCHEMA ||
    schedule.characterId !== 'top-hat-man' ||
    schedule.policy?.foundationApprovalRequiredBeforeBody !== true ||
    schedule.policy?.previousWaveApprovalRequiredBeforeNextWave !== true ||
    schedule.policy?.providerSuccessDoesNotEqualApproval !== true ||
    schedule.policy?.sealedApprovalLedgerPreferred !== true ||
    schedule.policy?.automaticApproval !== false ||
    schedule.policy?.automaticRuntimeActivation !== false ||
    !SHA256.test(schedule.scheduleSha256 ?? '')
  ) {
    fail('TOP_HAT_V3_PROVIDER_SCHEDULE_INVALID');
  }
  const { scheduleSha256, ...body } = schedule;
  if (sha256Document(body) !== scheduleSha256) {
    fail('TOP_HAT_V3_PROVIDER_SCHEDULE_HASH_INVALID');
  }
  return freeze({
    schema: 'evavo.project-art-top-hat-v3-provider-schedule-readiness.v1',
    characterId: 'top-hat-man',
    scheduleSha256,
    approvalSource: schedule.approvals.source,
    approvedFrameLedgerSha256: schedule.approvals.approvedFrameLedgerSha256,
    foundationApproved: schedule.state.foundationApproved,
    approvedJobs: schedule.state.approvedJobs,
    successfulProviderJobs: schedule.state.successfulProviderJobs,
    dispatchEligibleJobs: schedule.state.dispatchEligibleJobs,
    awaitingApprovalJobs: schedule.state.awaitingApprovalJobs,
    blockedJobs: schedule.state.blockedJobs,
    nextPhase: schedule.nextDispatchBatch.phase,
    nextClipId: schedule.nextDispatchBatch.clipId,
    nextWaveIndex: schedule.nextDispatchBatch.waveIndex,
    nextJobCount: schedule.nextDispatchBatch.jobs.length,
    executionPerformed: false,
  });
}
