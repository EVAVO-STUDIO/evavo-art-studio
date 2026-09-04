#!/usr/bin/env node

function fail(message) { throw new Error(message); }

export function retryAllowedForReason(retryRules, reason) {
  if (!retryRules || typeof retryRules !== 'object') fail('retryRules are required');
  if (reason === 'missing-candidates') return Boolean(retryRules.retryMissing);
  if (['missing-file', 'not-file', 'zero-bytes', 'invalid-image-signature', 'dimensions-unavailable'].includes(reason)) {
    return Boolean(retryRules.retryInvalidFile);
  }
  if (reason === 'dimension-mismatch') return Boolean(retryRules.retryDimensionMismatch);
  if (reason === 'duplicate-hash') return Boolean(retryRules.retryDuplicate);
  return false;
}

export function frameProblems(plan, frameResults, targetFrames = plan?.frames) {
  if (!plan || !Array.isArray(plan.frames) || !Array.isArray(targetFrames)) fail('compiled plan and target frames are required');
  if (!(frameResults instanceof Map)) fail('frameResults must be a Map');
  const targetIds = new Set(targetFrames.map((frame) => frame.id));
  const reasonsById = new Map(targetFrames.map((frame) => [frame.id, []]));
  const seenHashes = new Map();

  for (const frame of plan.frames) {
    const result = frameResults.get(frame.id);
    if (targetIds.has(frame.id) && (!result || !Array.isArray(result.candidates) || result.candidates.length < frame.candidateCount)) {
      reasonsById.get(frame.id).push('missing-candidates');
    }
    for (const candidate of result?.candidates ?? []) {
      if (targetIds.has(frame.id) && !candidate?.qa?.ok) {
        const codes = Array.isArray(candidate?.qa?.codes) && candidate.qa.codes.length ? candidate.qa.codes : ['qa-failed'];
        reasonsById.get(frame.id).push(...codes);
      }
      if (plan.outputRules?.requireUniqueHashes && candidate?.qa?.sha256) {
        const prior = seenHashes.get(candidate.qa.sha256);
        if (prior && prior !== frame.id) {
          if (targetIds.has(frame.id)) reasonsById.get(frame.id).push('duplicate-hash');
          if (targetIds.has(prior)) reasonsById.get(prior).push('duplicate-hash');
        } else {
          seenHashes.set(candidate.qa.sha256, frame.id);
        }
      }
    }
  }

  return Object.freeze(targetFrames.flatMap((frame) => {
    const reasons = Object.freeze([...new Set(reasonsById.get(frame.id) ?? [])]);
    return reasons.length ? [Object.freeze({ frame, reasons })] : [];
  }));
}

export function retryableFrameProblems(plan, frameResults, targetFrames = plan?.frames) {
  return Object.freeze(frameProblems(plan, frameResults, targetFrames).filter((problem) =>
    problem.reasons.some((reason) => retryAllowedForReason(plan.retryRules, reason))));
}
