import { createHash } from 'node:crypto';

import {
  inspectTopHatV3CandidateQuality,
} from './top-hat-v3-candidate-quality.mjs';

export const TOP_HAT_V3_CANDIDATE_SELECTION_SCHEMA =
  'evavo.project-art-top-hat-v3-candidate-selection.v1';

const freeze = Object.freeze;
const SHA256 = /^[a-f0-9]{64}$/u;

function fail(code, detail = code) {
  const error = new Error(`${code}:${detail}`);
  error.code = code;
  throw error;
}

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('TOP_HAT_V3_SELECTION_RECORD_INVALID', label);
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

function integer(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail('TOP_HAT_V3_SELECTION_INTEGER_INVALID', label);
  }
  return value;
}

function retryLimit(kind, role) {
  if (kind === 'foundation-pose') return 4;
  if (role === 'opening-anchor' || role === 'closing-anchor') return 4;
  if (kind === 'registered-layer') return 3;
  return 3;
}

function sortedCandidates(candidates) {
  return [...candidates].sort((left, right) =>
    Number(right.deterministicEligible) - Number(left.deterministicEligible) ||
    Number(left.hardRejected) - Number(right.hardRejected) ||
    right.score - left.score ||
    left.candidateSha256.localeCompare(right.candidateSha256),
  );
}

export function compileTopHatV3CandidateSelection(input = {}) {
  const job = record(input.job, 'job');
  const attemptsUsed = integer(input.attemptsUsed ?? 0, 'attemptsUsed', 0, 32);
  if (!Array.isArray(input.qualityResults) || input.qualityResults.length < 1) {
    fail('TOP_HAT_V3_SELECTION_QUALITY_RESULTS_REQUIRED');
  }
  const candidates = freeze(
    input.qualityResults.map((value) => {
      const readiness = inspectTopHatV3CandidateQuality(value);
      if (readiness.jobId !== job.jobId) {
        fail('TOP_HAT_V3_SELECTION_JOB_MISMATCH', readiness.jobId);
      }
      return freeze({
        candidateSha256: readiness.candidateSha256,
        qualitySha256: readiness.qualitySha256,
        score: readiness.score,
        deterministicEligible: readiness.deterministicEligible,
        hardRejected: readiness.hardRejected,
        recommendation: readiness.recommendation,
      });
    }),
  );
  const ranked = freeze(sortedCandidates(candidates));
  const best = ranked[0];
  const maximumAttempts = retryLimit(job.kind, job.role);
  const attemptsRemaining = Math.max(0, maximumAttempts - attemptsUsed);
  let action;
  if (best.deterministicEligible) {
    action = 'advance-best-to-human-review';
  } else if (attemptsRemaining > 0) {
    action = 'retry-generation';
  } else {
    action = 'escalate-blocked-job';
  }

  const retry = action === 'retry-generation'
    ? freeze({
        sameJobId: true,
        preserveCanonicalIdentityReferences: true,
        preserveApprovedTemporalBracket: true,
        changeProviderSeed: true,
        widenIdentityStrength: best.hardRejected,
        reduceMotionAmplitude:
          ranked.some((entry) => entry.recommendation === 'retry') &&
          job.kind === 'body-frame',
        candidateCount:
          job.kind === 'foundation-pose' ||
          job.role === 'opening-anchor' ||
          job.role === 'closing-anchor'
            ? 3
            : 2,
      })
    : null;

  const body = freeze({
    schema: TOP_HAT_V3_CANDIDATE_SELECTION_SCHEMA,
    characterId: 'top-hat-man',
    jobId: String(job.jobId ?? ''),
    kind: String(job.kind ?? ''),
    clipId: job.clipId ?? null,
    frameOrdinal: job.frameOrdinal ?? null,
    role: job.role ?? null,
    attempts: freeze({
      used: attemptsUsed,
      maximum: maximumAttempts,
      remaining: attemptsRemaining,
    }),
    rankedCandidates: ranked,
    selectedCandidateSha256:
      action === 'advance-best-to-human-review' ? best.candidateSha256 : null,
    action,
    retry,
    policy: freeze({
      automaticTechnicalRanking: true,
      boundedAutomaticRetry: true,
      retryMayChangeCharacterIdentity: false,
      retryMayChangeApprovedTemporalAnchors: false,
      automaticCreativeApproval: false,
      automaticPromotion: false,
      runtimeActivation: false,
    }),
  });
  return freeze({ ...body, selectionSha256: sha256Document(body) });
}

export function inspectTopHatV3CandidateSelection(value) {
  const selection = record(value, 'selection');
  const { selectionSha256, ...body } = selection;
  if (
    selection.schema !== TOP_HAT_V3_CANDIDATE_SELECTION_SCHEMA ||
    selection.characterId !== 'top-hat-man' ||
    !SHA256.test(selectionSha256 ?? '') ||
    sha256Document(body) !== selectionSha256 ||
    selection.policy?.automaticCreativeApproval !== false ||
    selection.policy?.automaticPromotion !== false ||
    selection.policy?.runtimeActivation !== false
  ) {
    fail('TOP_HAT_V3_SELECTION_INVALID');
  }
  return freeze({
    schema: 'evavo.project-art-top-hat-v3-candidate-selection-readiness.v1',
    characterId: 'top-hat-man',
    jobId: selection.jobId,
    action: selection.action,
    selectedCandidateSha256: selection.selectedCandidateSha256,
    attemptsRemaining: selection.attempts.remaining,
    selectionSha256,
    creativeApprovalPerformed: false,
    promotionPerformed: false,
    runtimeActivationPerformed: false,
  });
}
