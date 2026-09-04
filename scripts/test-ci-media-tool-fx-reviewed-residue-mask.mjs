import assert from 'node:assert/strict';
import { compileReviewedResidueMaskHandoff, validateReviewedResidueMaskHandoff } from './fx-reviewed-residue-mask-handoff.mjs';

const fixture = {
  sourceResidueHandoffSha256: '1'.repeat(64),
  vectorCandidateSha256: '2'.repeat(64),
  masteringPlanSha256: '3'.repeat(64),
  pngSha256: '4'.repeat(64),
  reviewEvidenceSha256: '5'.repeat(64),
  reviewStatus: 'independently-reviewed',
  pngPath: 'reviewed/bullet-hole-plaster.png',
  width: 1024,
  height: 1024,
  alphaAnalysis: { meaningfulTransparency: true, paintedCheckerboardDetected: false },
  edgeReview: { passed: true },
  substrateIntegrationReview: { passed: true },
};

const handoff = compileReviewedResidueMaskHandoff(fixture);
assert.equal(handoff.format, 'evavo.fx-reviewed-residue-mask-handoff/v1');
assert.equal(handoff.receiver.studio, 'evavo-texture-studio');
assert.equal(handoff.png.alphaMode, 'straight');
assert.equal(handoff.review.status, 'independently-reviewed');
assert.equal(handoff.authorityBoundary.materialResponseRemainsTextureStudioAuthority, true);
assert.equal(handoff.authorityBoundary.mayApproveTextureMaterial, false);
assert.match(handoff.handoffSha256, /^[a-f0-9]{64}$/);
assert.deepEqual(validateReviewedResidueMaskHandoff(handoff), handoff);
assert.deepEqual(compileReviewedResidueMaskHandoff(fixture), handoff);

assert.throws(() => compileReviewedResidueMaskHandoff({ ...fixture, reviewStatus: 'candidate' }));
assert.throws(() => compileReviewedResidueMaskHandoff({ ...fixture, alphaAnalysis: { meaningfulTransparency: false, paintedCheckerboardDetected: false } }));
assert.throws(() => compileReviewedResidueMaskHandoff({ ...fixture, edgeReview: { passed: false } }));
const tampered = structuredClone(handoff);
tampered.png.sha256 = '6'.repeat(64);
assert.throws(() => validateReviewedResidueMaskHandoff(tampered));

console.log('EVAVO reviewed residue mask handoff regression passed');
