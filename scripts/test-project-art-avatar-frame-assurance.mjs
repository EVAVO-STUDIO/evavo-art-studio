import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AVATAR_FRAME_ASSURANCE_CHECKS,
  AVATAR_FRAME_ASSURANCE_SCHEMA,
  inspectAvatarFrameAssurance,
} from './project-art/avatar-frame-assurance.mjs';

function report(verdict = 'pass', confidence = 0.97) {
  return {
    schema: AVATAR_FRAME_ASSURANCE_SCHEMA,
    frameId: 'eva-idle-001',
    sourceSha256: 'a'.repeat(64),
    checks: AVATAR_FRAME_ASSURANCE_CHECKS.map((check) => ({
      check,
      observations: ['vision-a', 'vision-b'].map((inspectorId, index) => ({
        inspectorId,
        inspectorVersion: `2026.08.${index + 1}`,
        applicability: 'visible',
        verdict,
        confidence,
        evidenceSha256: String(index + 1).repeat(64),
        note: `${check} independently inspected`,
      })),
    })),
    publicationAuthority: false,
  };
}

test('two independent high-confidence passes become review-ready, never approved', () => {
  const result = inspectAvatarFrameAssurance(report());
  assert.equal(result.status, 'review-ready');
  assert.equal(result.candidateApproval, false);
  assert.equal(result.publicationAuthority, false);
  assert.match(result.reportSha256, /^[a-f0-9]{64}$/u);
});

test('a hand defect routes the exact frame to repair', () => {
  const value = report();
  value.checks[0].observations[1].verdict = 'fail';
  assert.equal(inspectAvatarFrameAssurance(value).status, 'repair-required');
});

test('uncertainty or confidence below the gate quarantines the frame', () => {
  assert.equal(inspectAvatarFrameAssurance(report('uncertain')).status, 'quarantined');
  assert.equal(inspectAvatarFrameAssurance(report('pass', 0.89)).status, 'quarantined');
});

test('duplicate inspectors, reordered checks and source substitutions fail closed', () => {
  const duplicate = report();
  duplicate.checks[0].observations[1].inspectorId = 'vision-a';
  assert.throws(
    () => inspectAvatarFrameAssurance(duplicate),
    /PROJECT_ART_AVATAR_FRAME_ASSURANCE_INDEPENDENCE_REQUIRED/u,
  );

  const reordered = report();
  [reordered.checks[0], reordered.checks[1]] = [reordered.checks[1], reordered.checks[0]];
  assert.throws(() => inspectAvatarFrameAssurance(reordered));

  assert.throws(() =>
    inspectAvatarFrameAssurance(report(), { sourceSha256: 'b'.repeat(64) }),
  );
});
