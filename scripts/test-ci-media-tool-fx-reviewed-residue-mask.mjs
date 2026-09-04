import assert from 'node:assert/strict';
import {
  compileReviewedResidueMaskHandoff,
  compileReviewedResidueMaskHandoffFromRasterEvidence,
  validateReviewedResidueMaskHandoff,
} from './fx-reviewed-residue-mask-handoff.mjs';

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

const rasterEvidence = {
  format: 'evavo.fx-residue-alpha-evidence/v1',
  candidateSha256: fixture.vectorCandidateSha256,
  masteringPlanSha256: fixture.masteringPlanSha256,
  processorId: 'sharp-exact-canvas-runtime',
  outputWidth: 1024,
  outputHeight: 1024,
  alphaMode: 'straight',
  transparentPixels: 800000,
  opaquePixels: 150000,
  partialAlphaPixels: 98576,
  visiblePixels: 248576,
  meaningfulTransparency: true,
  paintedCheckerboardDetected: false,
  pngSha256: fixture.pngSha256,
  proofSha256: '6'.repeat(64),
  authority: {
    generatedRasterCandidateOnly: true,
    independentCreativeReviewStillRequired: true,
    substrateIntegrationReviewStillRequired: true,
    mayApproveCreativeResult: false,
    mayApproveTextureMaterial: false,
    publication: false,
  },
};
const fromRaster = compileReviewedResidueMaskHandoffFromRasterEvidence({
  ...fixture,
  rasterEvidence,
});
assert.equal(fromRaster.png.sha256, fixture.pngSha256);
assert.equal(fromRaster.review.evidenceSha256, fixture.reviewEvidenceSha256);
assert.equal(fromRaster.receiver.studio, 'evavo-texture-studio');
assert.deepEqual(validateReviewedResidueMaskHandoff(fromRaster), fromRaster);

assert.throws(() => compileReviewedResidueMaskHandoff({ ...fixture, reviewStatus: 'candidate' }));
assert.throws(() => compileReviewedResidueMaskHandoff({ ...fixture, alphaAnalysis: { meaningfulTransparency: false, paintedCheckerboardDetected: false } }));
assert.throws(() => compileReviewedResidueMaskHandoff({ ...fixture, edgeReview: { passed: false } }));
assert.throws(() => compileReviewedResidueMaskHandoffFromRasterEvidence({ ...fixture, rasterEvidence, reviewStatus: 'candidate' }), /independent review/);
assert.throws(() => compileReviewedResidueMaskHandoffFromRasterEvidence({ ...fixture, pngSha256: '7'.repeat(64), rasterEvidence }), /PNG digest does not match/);
assert.throws(() => compileReviewedResidueMaskHandoffFromRasterEvidence({ ...fixture, vectorCandidateSha256: '8'.repeat(64), rasterEvidence }), /vector candidate does not match/);
const escalated = structuredClone(rasterEvidence);
escalated.authority.mayApproveCreativeResult = true;
assert.throws(() => compileReviewedResidueMaskHandoffFromRasterEvidence({ ...fixture, rasterEvidence: escalated }), /authority escalation/);
const tampered = structuredClone(handoff);
tampered.png.sha256 = '9'.repeat(64);
assert.throws(() => validateReviewedResidueMaskHandoff(tampered));

console.log('EVAVO reviewed residue mask handoff regression passed');
