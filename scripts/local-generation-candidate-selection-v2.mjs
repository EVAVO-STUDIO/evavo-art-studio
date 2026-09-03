#!/usr/bin/env node

export const LOCAL_GENERATION_CANDIDATE_SELECTION_SCHEMA = 'evavo.local-generation-candidate-selection.v2';
const POLICIES = new Set(['all-valid', 'first-valid', 'best-score', 'top-n']);
const SCORE_FIELDS = Object.freeze([
  'promptAdherence',
  'identityConsistency',
  'styleConsistency',
  'composition',
  'anatomyGeometry',
  'technicalQuality',
]);

function fail(message) { throw new Error(message); }
function finite(value, label, min = 0, max = 100) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${label} must be between ${min} and ${max}`);
  return value;
}

export function normalizeSelectionRules(raw = {}, generationMode = 'independent') {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('selection_rules must be an object');
  const defaultPolicy = generationMode === 'paired' ? 'best-score' : generationMode === 'variation' ? 'all-valid' : 'first-valid';
  const policy = raw.policy ?? defaultPolicy;
  if (!POLICIES.has(policy)) fail(`selection_rules.policy must be one of ${[...POLICIES].join(', ')}`);
  const keep = raw.keep == null ? (policy === 'top-n' ? 1 : null) : raw.keep;
  if (keep != null && (!Number.isInteger(keep) || keep < 1 || keep > 16)) fail('selection_rules.keep must be an integer between 1 and 16');
  const minimumScore = raw.minimumScore == null ? null : finite(raw.minimumScore, 'selection_rules.minimumScore');
  const weights = {};
  for (const field of SCORE_FIELDS) {
    const value = raw.weights?.[field];
    if (value != null) weights[field] = finite(value, `selection_rules.weights.${field}`, 0, 10);
  }
  if (Object.keys(weights).length === 0) {
    Object.assign(weights, {
      promptAdherence: 2,
      identityConsistency: 2,
      styleConsistency: 1.5,
      composition: 1,
      anatomyGeometry: 1.5,
      technicalQuality: 1,
    });
  }
  return Object.freeze({
    policy,
    keep,
    minimumScore,
    weights: Object.freeze(weights),
    requireVisualReview: raw.requireVisualReview ?? (policy === 'best-score' || policy === 'top-n'),
  });
}

function normalizedVisualScore(candidate, rules) {
  const review = candidate.visualReview;
  if (!review || typeof review !== 'object') {
    if (rules.requireVisualReview) fail(`candidate ${candidate.candidateIndex ?? '?'} has no visual review required by ${rules.policy}`);
    return null;
  }
  let weighted = 0;
  let totalWeight = 0;
  for (const [field, weight] of Object.entries(rules.weights)) {
    const value = review[field];
    if (value == null) continue;
    weighted += finite(value, `candidate.visualReview.${field}`) * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) {
    if (rules.requireVisualReview) fail(`candidate ${candidate.candidateIndex ?? '?'} visual review has no weighted score fields`);
    return null;
  }
  return weighted / totalWeight;
}

function candidateTieKey(candidate, index) {
  return [
    candidate.qa?.sha256 ?? '',
    candidate.artifactId ?? '',
    String(candidate.candidateIndex ?? index).padStart(4, '0'),
  ].join(':');
}

export function selectCandidates(candidates, rawRules = {}, generationMode = 'independent') {
  if (!Array.isArray(candidates) || candidates.length === 0) fail('candidate selection requires at least one candidate');
  const rules = normalizeSelectionRules(rawRules, generationMode);
  const eligible = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate?.qa?.ok === true)
    .map(({ candidate, index }) => ({
      candidate,
      index,
      score: normalizedVisualScore(candidate, rules),
      tieKey: candidateTieKey(candidate, index),
    }));
  if (eligible.length === 0) return Object.freeze({ schema: LOCAL_GENERATION_CANDIDATE_SELECTION_SCHEMA, rules, selected: [], rejected: candidates.map((_, index) => index), scores: [] });

  let selectedRows;
  if (rules.policy === 'all-valid') {
    selectedRows = eligible;
  } else if (rules.policy === 'first-valid') {
    selectedRows = [eligible[0]];
  } else {
    const ranked = [...eligible].sort((left, right) => {
      const scoreDelta = (right.score ?? -Infinity) - (left.score ?? -Infinity);
      return scoreDelta !== 0 ? scoreDelta : left.tieKey.localeCompare(right.tieKey);
    });
    selectedRows = rules.policy === 'best-score' ? ranked.slice(0, 1) : ranked.slice(0, rules.keep ?? 1);
  }
  if (rules.minimumScore != null) selectedRows = selectedRows.filter((row) => row.score != null && row.score >= rules.minimumScore);
  const selectedIndexes = new Set(selectedRows.map((row) => row.index));
  return Object.freeze({
    schema: LOCAL_GENERATION_CANDIDATE_SELECTION_SCHEMA,
    rules,
    selected: Object.freeze(selectedRows.map((row) => Object.freeze({ index: row.index, candidate: row.candidate, score: row.score }))),
    rejected: Object.freeze(candidates.map((_, index) => index).filter((index) => !selectedIndexes.has(index))),
    scores: Object.freeze(eligible.map((row) => Object.freeze({ index: row.index, score: row.score }))),
  });
}

export function expectedSelectedCount(candidateCount, rawRules = {}, generationMode = 'independent') {
  const rules = normalizeSelectionRules(rawRules, generationMode);
  if (rules.policy === 'all-valid') return candidateCount;
  if (rules.policy === 'top-n') return Math.min(candidateCount, rules.keep ?? 1);
  return 1;
}
