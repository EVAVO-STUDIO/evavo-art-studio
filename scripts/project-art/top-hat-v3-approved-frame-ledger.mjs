import { createHash } from 'node:crypto';

import {
  inspectTopHatV3CandidateQuality,
} from './top-hat-v3-candidate-quality.mjs';
import {
  inspectTopHatV3CandidateSelection,
} from './top-hat-v3-candidate-selection.mjs';

export const TOP_HAT_V3_APPROVED_FRAME_LEDGER_SCHEMA =
  'evavo.project-art-top-hat-v3-approved-frame-ledger.v1';

const freeze = Object.freeze;
const SHA256 = /^[a-f0-9]{64}$/u;
const REVIEW_STATES = new Set(['pass', 'not-applicable']);

function fail(code, detail = code) {
  const error = new Error(`${code}:${detail}`);
  error.code = code;
  throw error;
}

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('TOP_HAT_V3_LEDGER_RECORD_INVALID', label);
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

function timestamp(value, label) {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    fail('TOP_HAT_V3_LEDGER_TIMESTAMP_INVALID', label);
  }
  return value;
}

function humanReviewer(value) {
  const reviewer = record(value, 'reviewer');
  if (
    reviewer.actorClass !== 'human' ||
    typeof reviewer.actorId !== 'string' ||
    reviewer.actorId.trim().length < 2 ||
    reviewer.actorId.length > 256
  ) {
    fail('TOP_HAT_V3_LEDGER_REVIEWER_INVALID');
  }
  return freeze({ actorClass: 'human', actorId: reviewer.actorId.trim() });
}

function reviewGates(job, gates) {
  const value = record(gates, 'gates');
  const required = [
    'technical',
    'handsAndAnatomy',
    'faceIdentity',
    'silhouetteRegistration',
    'adjacentFrameContinuity',
    'loopClosure',
  ];
  for (const key of required) {
    if (!REVIEW_STATES.has(value[key])) {
      fail('TOP_HAT_V3_LEDGER_REVIEW_GATE_INVALID', `${job.jobId}:${key}`);
    }
  }
  if (
    value.technical !== 'pass' ||
    value.handsAndAnatomy !== 'pass' ||
    value.faceIdentity !== 'pass' ||
    value.silhouetteRegistration !== 'pass'
  ) {
    fail('TOP_HAT_V3_LEDGER_REVIEW_NOT_APPROVED', job.jobId);
  }
  if (
    job.kind === 'body-frame' &&
    job.role === 'continuity-inbetween' &&
    value.adjacentFrameContinuity !== 'pass'
  ) {
    fail('TOP_HAT_V3_LEDGER_CONTINUITY_NOT_APPROVED', job.jobId);
  }
  if (
    job.loopClosureRequired === true &&
    job.isLoopClosureFrame === true &&
    value.loopClosure !== 'pass'
  ) {
    fail('TOP_HAT_V3_LEDGER_LOOP_NOT_APPROVED', job.jobId);
  }
  return freeze(Object.fromEntries(required.map((key) => [key, value[key]])));
}

export function createTopHatV3ApprovedFrameEvidence(input = {}) {
  const job = record(input.job, 'job');
  const qualityReadiness = inspectTopHatV3CandidateQuality(input.quality);
  const selectionReadiness = inspectTopHatV3CandidateSelection(input.selection);
  if (
    qualityReadiness.jobId !== job.jobId ||
    selectionReadiness.jobId !== job.jobId ||
    selectionReadiness.action !== 'advance-best-to-human-review' ||
    selectionReadiness.selectedCandidateSha256 !== qualityReadiness.candidateSha256 ||
    qualityReadiness.deterministicEligible !== true
  ) {
    fail('TOP_HAT_V3_LEDGER_CANDIDATE_CHAIN_INVALID', job.jobId);
  }
  const review = record(input.review, 'review');
  const reviewer = humanReviewer(review.reviewer);
  const reviewedAt = timestamp(review.reviewedAt, 'review.reviewedAt');
  const gates = reviewGates(job, review.gates);
  if (
    review.decision !== 'approve-final-frame' ||
    review.finalFrameSha256 !== qualityReadiness.candidateSha256 ||
    typeof review.evidenceSha256 !== 'string' ||
    !SHA256.test(review.evidenceSha256)
  ) {
    fail('TOP_HAT_V3_LEDGER_REVIEW_CHAIN_INVALID', job.jobId);
  }

  const body = freeze({
    schema: 'evavo.project-art-top-hat-v3-approved-frame-evidence.v1',
    characterId: 'top-hat-man',
    jobId: String(job.jobId ?? ''),
    kind: String(job.kind ?? ''),
    clipId: job.clipId ?? null,
    frameOrdinal: job.frameOrdinal ?? null,
    role: job.role ?? null,
    targetPath: String(job.targetPath ?? ''),
    candidateSha256: qualityReadiness.candidateSha256,
    qualitySha256: qualityReadiness.qualitySha256,
    selectionSha256: selectionReadiness.selectionSha256,
    reviewer,
    reviewedAt,
    reviewEvidenceSha256: review.evidenceSha256,
    gates,
    status: 'approved-for-v3-production-dependency-only',
    policy: freeze({
      mayUnlockDependentGenerationJobs: true,
      sequenceReleaseAllowed: false,
      candidatePromotionAllowed: false,
      cloudinaryUploadAllowed: false,
      repositoryMutationAllowed: false,
      runtimeActivationAllowed: false,
    }),
  });
  return freeze({ ...body, evidenceSha256: sha256Document(body) });
}

export function compileTopHatV3ApprovedFrameLedger(input = {}) {
  if (!Array.isArray(input.evidence)) {
    fail('TOP_HAT_V3_LEDGER_EVIDENCE_ARRAY_REQUIRED');
  }
  const seenJobs = new Set();
  const seenCandidates = new Set();
  const entries = freeze(
    input.evidence.map((entry) => {
      const value = record(entry, 'evidence-entry');
      const { evidenceSha256, ...body } = value;
      if (
        value.schema !== 'evavo.project-art-top-hat-v3-approved-frame-evidence.v1' ||
        value.characterId !== 'top-hat-man' ||
        value.status !== 'approved-for-v3-production-dependency-only' ||
        !SHA256.test(evidenceSha256 ?? '') ||
        sha256Document(body) !== evidenceSha256 ||
        value.policy?.mayUnlockDependentGenerationJobs !== true ||
        value.policy?.sequenceReleaseAllowed !== false ||
        value.policy?.runtimeActivationAllowed !== false
      ) {
        fail('TOP_HAT_V3_LEDGER_EVIDENCE_INVALID');
      }
      if (seenJobs.has(value.jobId)) fail('TOP_HAT_V3_LEDGER_DUPLICATE_JOB', value.jobId);
      if (seenCandidates.has(value.candidateSha256)) {
        fail('TOP_HAT_V3_LEDGER_DUPLICATE_CANDIDATE', value.candidateSha256);
      }
      seenJobs.add(value.jobId);
      seenCandidates.add(value.candidateSha256);
      return value;
    }),
  );
  const body = freeze({
    schema: TOP_HAT_V3_APPROVED_FRAME_LEDGER_SCHEMA,
    characterId: 'top-hat-man',
    generationPlanSha256: String(input.generationPlanSha256 ?? ''),
    entries,
    counts: freeze({ approved: entries.length }),
    approvedJobIds: freeze(entries.map((entry) => entry.jobId).sort()),
    policy: freeze({
      dependencyUnlockOnly: true,
      automaticCreativeApproval: false,
      automaticPromotion: false,
      sequenceRelease: false,
      cloudinaryUpload: false,
      repositoryMutation: false,
      runtimeActivation: false,
    }),
  });
  if (!SHA256.test(body.generationPlanSha256)) {
    fail('TOP_HAT_V3_LEDGER_GENERATION_PLAN_HASH_INVALID');
  }
  return freeze({ ...body, ledgerSha256: sha256Document(body) });
}

export function inspectTopHatV3ApprovedFrameLedger(value) {
  const ledger = record(value, 'ledger');
  const { ledgerSha256, ...body } = ledger;
  if (
    ledger.schema !== TOP_HAT_V3_APPROVED_FRAME_LEDGER_SCHEMA ||
    ledger.characterId !== 'top-hat-man' ||
    !SHA256.test(ledgerSha256 ?? '') ||
    sha256Document(body) !== ledgerSha256 ||
    ledger.policy?.dependencyUnlockOnly !== true ||
    ledger.policy?.automaticCreativeApproval !== false ||
    ledger.policy?.sequenceRelease !== false ||
    ledger.policy?.runtimeActivation !== false
  ) {
    fail('TOP_HAT_V3_LEDGER_INVALID');
  }
  return freeze({
    schema: 'evavo.project-art-top-hat-v3-approved-frame-ledger-readiness.v1',
    characterId: 'top-hat-man',
    generationPlanSha256: ledger.generationPlanSha256,
    approvedCount: ledger.counts.approved,
    approvedJobIds: ledger.approvedJobIds,
    ledgerSha256,
    dependencyUnlockOnly: true,
    sequenceReleaseAllowed: false,
    runtimeActivationAllowed: false,
  });
}
