import { createHash } from 'node:crypto';

import {
  inspectAvatarProviderCandidatePng,
} from './avatar-final-pass-provider-candidate.mjs';
import {
  inspectAvatarProviderFramePng,
} from './avatar-final-pass-provider-frame-finisher.mjs';

export const TOP_HAT_V3_CANDIDATE_QUALITY_SCHEMA =
  'evavo.project-art-top-hat-v3-candidate-quality.v1';

const SHA256 = /^[a-f0-9]{64}$/u;
const freeze = Object.freeze;

function fail(code, detail = code) {
  const error = new Error(`${code}:${detail}`);
  error.code = code;
  throw error;
}

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('TOP_HAT_V3_QUALITY_RECORD_INVALID', label);
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

function bounded01(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    fail('TOP_HAT_V3_QUALITY_SCORE_INVALID', label);
  }
  return number;
}

function optionalScore(value, label) {
  return value === null || value === undefined ? null : bounded01(value, label);
}

function requiredExternalEvidence(job, observations) {
  const identitySimilarity = optionalScore(
    observations.identitySimilarity,
    'identitySimilarity',
  );
  const anatomyConfidence = optionalScore(
    observations.anatomyConfidence,
    'anatomyConfidence',
  );
  const registrationConfidence = optionalScore(
    observations.registrationConfidence,
    'registrationConfidence',
  );
  const temporalSimilarity = optionalScore(
    observations.temporalSimilarity,
    'temporalSimilarity',
  );
  const loopClosureSimilarity = optionalScore(
    observations.loopClosureSimilarity,
    'loopClosureSimilarity',
  );

  const missing = [];
  if (identitySimilarity === null) missing.push('identitySimilarity');
  if (anatomyConfidence === null) missing.push('anatomyConfidence');
  if (registrationConfidence === null) missing.push('registrationConfidence');
  if (job.kind === 'body-frame' && job.role === 'continuity-inbetween' && temporalSimilarity === null) {
    missing.push('temporalSimilarity');
  }
  if (job.loopClosureRequired === true && job.isLoopClosureFrame === true && loopClosureSimilarity === null) {
    missing.push('loopClosureSimilarity');
  }
  return freeze({
    identitySimilarity,
    anatomyConfidence,
    registrationConfidence,
    temporalSimilarity,
    loopClosureSimilarity,
    missing: freeze(missing),
  });
}

function thresholds(job) {
  return freeze({
    identitySimilarity: job.kind === 'registered-layer' ? 0.94 : 0.96,
    anatomyConfidence: job.kind === 'registered-layer' ? 0.9 : 0.94,
    registrationConfidence: 0.98,
    temporalSimilarity:
      job.kind === 'body-frame' && job.role === 'continuity-inbetween'
        ? 0.94
        : null,
    loopClosureSimilarity:
      job.loopClosureRequired === true && job.isLoopClosureFrame === true
        ? 0.95
        : null,
  });
}

function weightedScore(metrics) {
  const rows = [
    [metrics.identitySimilarity, 0.36],
    [metrics.anatomyConfidence, 0.22],
    [metrics.registrationConfidence, 0.22],
    [metrics.temporalSimilarity, 0.14],
    [metrics.loopClosureSimilarity, 0.06],
  ].filter(([value]) => value !== null);
  const weight = rows.reduce((sum, [, itemWeight]) => sum + itemWeight, 0);
  if (weight === 0) return 0;
  return Number(
    (rows.reduce((sum, [value, itemWeight]) => sum + value * itemWeight, 0) / weight).toFixed(6),
  );
}

export function evaluateTopHatV3Candidate(input = {}) {
  const job = record(input.job, 'job');
  const observations = record(input.observations ?? {}, 'observations');
  const bytes = Buffer.from(input.pngBytes ?? []);
  if (bytes.length === 0) fail('TOP_HAT_V3_QUALITY_PNG_REQUIRED');

  const candidate = inspectAvatarProviderCandidatePng(bytes, 1024, 1536, {
    requireTransparentPixels: true,
  });
  const frameInspection = inspectAvatarProviderFramePng(bytes, 1024, 1536);
  const { pixels: _pixels, ...frame } = frameInspection;

  const technicalFailures = [];
  if (candidate.sha256 !== frame.sha256) technicalFailures.push('png-inspection-hash-mismatch');
  if (frame.width !== 1024 || frame.height !== 1536) technicalFailures.push('canvas-mismatch');
  if (!(frame.visiblePixels > 0)) technicalFailures.push('no-visible-pixels');
  if (!(frame.transparentPixels > 0)) technicalFailures.push('no-transparent-pixels');
  if (frame.hiddenRgbTransparentPixels !== 0) technicalFailures.push('hidden-rgb-contamination');
  if (frame.edgeVisiblePixels !== 0) technicalFailures.push('canvas-edge-collision');

  const metrics = requiredExternalEvidence(job, observations);
  const expected = thresholds(job);
  const evidenceFailures = [];
  if (metrics.identitySimilarity !== null && metrics.identitySimilarity < expected.identitySimilarity) {
    evidenceFailures.push('identity-drift');
  }
  if (metrics.anatomyConfidence !== null && metrics.anatomyConfidence < expected.anatomyConfidence) {
    evidenceFailures.push('anatomy-risk');
  }
  if (metrics.registrationConfidence !== null && metrics.registrationConfidence < expected.registrationConfidence) {
    evidenceFailures.push('registration-drift');
  }
  if (
    expected.temporalSimilarity !== null &&
    metrics.temporalSimilarity !== null &&
    metrics.temporalSimilarity < expected.temporalSimilarity
  ) {
    evidenceFailures.push('temporal-discontinuity');
  }
  if (
    expected.loopClosureSimilarity !== null &&
    metrics.loopClosureSimilarity !== null &&
    metrics.loopClosureSimilarity < expected.loopClosureSimilarity
  ) {
    evidenceFailures.push('loop-closure-discontinuity');
  }

  const score = weightedScore(metrics);
  const hardRejected = technicalFailures.length > 0 || evidenceFailures.length > 0;
  const deterministicEligible = !hardRejected && metrics.missing.length === 0;
  const recommendation = hardRejected
    ? 'retry'
    : deterministicEligible
      ? 'advance-to-human-review'
      : 'collect-required-evidence';

  const body = freeze({
    schema: TOP_HAT_V3_CANDIDATE_QUALITY_SCHEMA,
    characterId: 'top-hat-man',
    jobId: String(job.jobId ?? ''),
    kind: String(job.kind ?? ''),
    clipId: job.clipId ?? null,
    frameOrdinal: job.frameOrdinal ?? null,
    role: job.role ?? null,
    candidate: freeze({
      sha256: frame.sha256,
      bytes: frame.byteLength,
      width: frame.width,
      height: frame.height,
      visiblePixels: frame.visiblePixels,
      transparentPixels: frame.transparentPixels,
      partialAlphaPixels: frame.partialAlphaPixels,
      hiddenRgbTransparentPixels: frame.hiddenRgbTransparentPixels,
      edgeVisiblePixels: frame.edgeVisiblePixels,
      visibleBounds: frame.visibleBounds,
      visiblePixelSha256: frame.visiblePixelSha256,
      alphaSha256: frame.alphaSha256,
    }),
    thresholds: expected,
    observations: freeze({
      identitySimilarity: metrics.identitySimilarity,
      anatomyConfidence: metrics.anatomyConfidence,
      registrationConfidence: metrics.registrationConfidence,
      temporalSimilarity: metrics.temporalSimilarity,
      loopClosureSimilarity: metrics.loopClosureSimilarity,
    }),
    score,
    missingEvidence: metrics.missing,
    technicalFailures: freeze(technicalFailures),
    evidenceFailures: freeze(evidenceFailures),
    hardRejected,
    deterministicEligible,
    recommendation,
    policy: freeze({
      automaticRejectAllowed: true,
      automaticRetryAllowed: true,
      automaticCreativeApprovalAllowed: false,
      automaticPromotionAllowed: false,
      runtimeActivationAllowed: false,
    }),
  });
  return freeze({ ...body, qualitySha256: sha256Document(body) });
}

export function inspectTopHatV3CandidateQuality(value) {
  const result = record(value, 'candidate-quality');
  const { qualitySha256, ...body } = result;
  if (
    result.schema !== TOP_HAT_V3_CANDIDATE_QUALITY_SCHEMA ||
    result.characterId !== 'top-hat-man' ||
    !SHA256.test(qualitySha256 ?? '') ||
    sha256Document(body) !== qualitySha256 ||
    result.policy?.automaticCreativeApprovalAllowed !== false ||
    result.policy?.automaticPromotionAllowed !== false ||
    result.policy?.runtimeActivationAllowed !== false
  ) {
    fail('TOP_HAT_V3_QUALITY_INVALID');
  }
  return freeze({
    schema: 'evavo.project-art-top-hat-v3-candidate-quality-readiness.v1',
    characterId: 'top-hat-man',
    jobId: result.jobId,
    candidateSha256: result.candidate.sha256,
    score: result.score,
    deterministicEligible: result.deterministicEligible,
    recommendation: result.recommendation,
    hardRejected: result.hardRejected,
    qualitySha256,
    approvalPerformed: false,
    promotionPerformed: false,
    runtimeActivationPerformed: false,
  });
}
