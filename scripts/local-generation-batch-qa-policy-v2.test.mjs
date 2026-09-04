#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

import { frameProblems, retryAllowedForReason, retryableFrameProblems } from './local-generation-batch-qa-policy-v2.mjs';

function frame(id, candidateCount = 1) { return { id, candidateCount }; }
function plan(retryRules = {}) {
  return {
    frames: [frame('anchor'), frame('follow')],
    outputRules: { requireUniqueHashes: true },
    retryRules: {
      retryMissing: false,
      retryInvalidFile: false,
      retryDimensionMismatch: false,
      retryDuplicate: false,
      ...retryRules,
    },
  };
}
function candidate({ ok = true, codes = [], sha256 = 'a'.repeat(64) } = {}) {
  return { qa: { ok, codes, sha256 } };
}

test('non-retryable QA failures remain terminal frame problems instead of disappearing', () => {
  const compiled = plan({ retryDimensionMismatch: false });
  const results = new Map([
    ['anchor', { candidates: [candidate({ ok: false, codes: ['dimension-mismatch'] })] }],
    ['follow', { candidates: [candidate({ sha256: 'b'.repeat(64) })] }],
  ]);
  const problems = frameProblems(compiled, results);
  assert.deepEqual(problems.map((item) => [item.frame.id, item.reasons]), [['anchor', ['dimension-mismatch']]]);
  assert.deepEqual(retryableFrameProblems(compiled, results), []);
});

test('retry policy selects only problems whose failure reason is explicitly retryable', () => {
  const compiled = plan({ retryDimensionMismatch: true });
  const results = new Map([
    ['anchor', { candidates: [candidate({ ok: false, codes: ['dimension-mismatch'] })] }],
    ['follow', { candidates: [candidate({ sha256: 'b'.repeat(64) })] }],
  ]);
  const retry = retryableFrameProblems(compiled, results);
  assert.equal(retry.length, 1);
  assert.equal(retry[0].frame.id, 'anchor');
  assert.deepEqual(retry[0].reasons, ['dimension-mismatch']);
});

test('missing candidate count is always reported and only retried when retryMissing is enabled', () => {
  const compiled = plan({ retryMissing: false });
  compiled.frames[0].candidateCount = 2;
  const results = new Map([
    ['anchor', { candidates: [candidate()] }],
    ['follow', { candidates: [candidate({ sha256: 'b'.repeat(64) })] }],
  ]);
  assert.deepEqual(frameProblems(compiled, results)[0].reasons, ['missing-candidates']);
  assert.equal(retryableFrameProblems(compiled, results).length, 0);
  compiled.retryRules.retryMissing = true;
  assert.equal(retryableFrameProblems(compiled, results)[0].frame.id, 'anchor');
});

test('duplicate hashes are reported across already accepted and current target stages', () => {
  const compiled = plan({ retryDuplicate: true });
  const repeated = 'c'.repeat(64);
  const results = new Map([
    ['anchor', { candidates: [candidate({ sha256: repeated })] }],
    ['follow', { candidates: [candidate({ sha256: repeated })] }],
  ]);
  const problems = frameProblems(compiled, results, [compiled.frames[1]]);
  assert.deepEqual(problems.map((item) => [item.frame.id, item.reasons]), [['follow', ['duplicate-hash']]]);
  assert.equal(retryableFrameProblems(compiled, results, [compiled.frames[1]])[0].frame.id, 'follow');
});

test('unknown QA failure codes fail closed as terminal problems and are never implicitly retryable', () => {
  const compiled = plan({ retryInvalidFile: true, retryDimensionMismatch: true, retryDuplicate: true, retryMissing: true });
  const results = new Map([
    ['anchor', { candidates: [candidate({ ok: false, codes: ['vision-quality-rejected'] })] }],
    ['follow', { candidates: [candidate({ sha256: 'b'.repeat(64) })] }],
  ]);
  assert.deepEqual(frameProblems(compiled, results)[0].reasons, ['vision-quality-rejected']);
  assert.equal(retryableFrameProblems(compiled, results).length, 0);
  assert.equal(retryAllowedForReason(compiled.retryRules, 'vision-quality-rejected'), false);
});
