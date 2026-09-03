#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  expectedSelectedCount,
  normalizeSelectionRules,
  selectCandidates,
} from './local-generation-candidate-selection-v2.mjs';

function candidate(index, { ok = true, hash, artifact, review } = {}) {
  return {
    candidateIndex: index,
    artifactId: artifact ?? `artifact_${String(index + 1).padStart(64, 'a')}`.slice(0, 73),
    qa: { ok, sha256: hash ?? String(index + 1).padStart(64, '0') },
    visualReview: review,
  };
}

const strong = {
  promptAdherence: 94,
  identityConsistency: 96,
  styleConsistency: 92,
  composition: 88,
  anatomyGeometry: 91,
  technicalQuality: 90,
};
const weak = {
  promptAdherence: 70,
  identityConsistency: 65,
  styleConsistency: 74,
  composition: 72,
  anatomyGeometry: 60,
  technicalQuality: 80,
};

test('paired mode defaults to best-score and refuses to fake a winner without visual review', () => {
  const rules = normalizeSelectionRules({}, 'paired');
  assert.equal(rules.policy, 'best-score');
  assert.equal(rules.requireVisualReview, true);
  assert.throws(() => selectCandidates([candidate(0), candidate(1)], {}, 'paired'), /has no visual review/u);
});

test('paired mode selects the stronger reviewed candidate and returns deterministic score evidence', () => {
  const result = selectCandidates([
    candidate(0, { review: weak }),
    candidate(1, { review: strong }),
  ], {}, 'paired');
  assert.equal(result.selected.length, 1);
  assert.equal(result.selected[0].candidate.candidateIndex, 1);
  assert.ok(result.selected[0].score > 90);
  assert.deepEqual(result.rejected, [0]);
});

test('technical QA failures are ineligible even when their visual review score is high', () => {
  const result = selectCandidates([
    candidate(0, { ok: false, review: { ...strong, promptAdherence: 100 } }),
    candidate(1, { review: weak }),
  ], {}, 'paired');
  assert.equal(result.selected.length, 1);
  assert.equal(result.selected[0].candidate.candidateIndex, 1);
});

test('variation mode preserves all valid candidates by default', () => {
  const result = selectCandidates([
    candidate(0), candidate(1), candidate(2, { ok: false }), candidate(3),
  ], {}, 'variation');
  assert.deepEqual(result.selected.map((row) => row.candidate.candidateIndex), [0, 1, 3]);
  assert.equal(expectedSelectedCount(4, {}, 'variation'), 4);
});

test('top-n ranks reviewed candidates and honors explicit keep', () => {
  const medium = { ...weak, promptAdherence: 82, identityConsistency: 80, anatomyGeometry: 78 };
  const result = selectCandidates([
    candidate(0, { review: weak }),
    candidate(1, { review: strong }),
    candidate(2, { review: medium }),
  ], { policy: 'top-n', keep: 2 }, 'variation');
  assert.deepEqual(result.selected.map((row) => row.candidate.candidateIndex), [1, 2]);
  assert.equal(expectedSelectedCount(3, { policy: 'top-n', keep: 2 }, 'variation'), 2);
});

test('minimum score can reject every technically valid candidate', () => {
  const result = selectCandidates([
    candidate(0, { review: weak }),
    candidate(1, { review: { ...weak, promptAdherence: 72 } }),
  ], { policy: 'best-score', minimumScore: 95 }, 'paired');
  assert.equal(result.selected.length, 0);
  assert.deepEqual(result.rejected, [0, 1]);
});

test('score ties are deterministic using stable candidate evidence', () => {
  const first = candidate(0, { review: strong, hash: 'b'.repeat(64) });
  const second = candidate(1, { review: strong, hash: 'a'.repeat(64) });
  const a = selectCandidates([first, second], {}, 'paired');
  const b = selectCandidates([second, first], {}, 'paired');
  assert.equal(a.selected[0].candidate.qa.sha256, 'a'.repeat(64));
  assert.equal(b.selected[0].candidate.qa.sha256, 'a'.repeat(64));
});

test('selection rule validation rejects unsupported policies and impossible weights', () => {
  assert.throws(() => normalizeSelectionRules({ policy: 'magic' }, 'paired'), /policy/u);
  assert.throws(() => normalizeSelectionRules({ policy: 'top-n', keep: 0 }, 'variation'), /keep/u);
  assert.throws(() => normalizeSelectionRules({ weights: { promptAdherence: 11 } }, 'paired'), /promptAdherence/u);
});
