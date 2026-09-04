import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  FX_REVIEWED_RESIDUE_FROM_RASTER_REQUEST_FORMAT,
  compileReviewedResidueFromRasterRequest,
} from './compile-fx-reviewed-residue-from-raster.mjs';

function rasterEvidence(candidateSha, masteringSha, pngSha) {
  return {
    format: 'evavo.fx-residue-alpha-evidence/v1',
    candidateSha256: candidateSha,
    masteringPlanSha256: masteringSha,
    processorId: 'sharp-exact-canvas-runtime',
    outputWidth: 1024,
    outputHeight: 1024,
    alphaMode: 'straight',
    meaningfulTransparency: true,
    paintedCheckerboardDetected: false,
    transparentPixels: 800000,
    partialAlphaPixels: 12000,
    visiblePixels: 248576,
    pngSha256: pngSha,
    proofSha256: '4'.repeat(64),
    authority: {
      generatedRasterCandidateOnly: true,
      independentCreativeReviewStillRequired: true,
      substrateIntegrationReviewStillRequired: true,
      mayApproveCreativeResult: false,
      mayApproveTextureMaterial: false,
      publication: false,
    },
  };
}

function request(overrides = {}) {
  return {
    format: FX_REVIEWED_RESIDUE_FROM_RASTER_REQUEST_FORMAT,
    sourceResidueHandoffSha256: 'a'.repeat(64),
    vectorCandidateSha256: '1'.repeat(64),
    masteringPlanSha256: '2'.repeat(64),
    pngSha256: '3'.repeat(64),
    reviewEvidenceSha256: '5'.repeat(64),
    reviewStatus: 'independently-reviewed',
    rasterEvidencePath: 'evidence/alpha.json',
    pngPath: 'reviewed/bullet-hole-plaster.png',
    edgeReview: { passed: true },
    substrateIntegrationReview: { passed: true },
    ...overrides,
  };
}

test('reviewed residue request resolves raster evidence relative to request directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evavo-fx-reviewed-raster-'));
  try {
    const requestDirectory = path.join(root, 'review-package');
    const evidenceDirectory = path.join(requestDirectory, 'evidence');
    fs.mkdirSync(evidenceDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(evidenceDirectory, 'alpha.json'),
      `${JSON.stringify(rasterEvidence('1'.repeat(64), '2'.repeat(64), '3'.repeat(64)), null, 2)}\n`,
      'utf8',
    );

    const originalCwd = process.cwd();
    process.chdir(root);
    try {
      const handoff = compileReviewedResidueFromRasterRequest(request(), requestDirectory);
      assert.equal(handoff.format, 'evavo.fx-reviewed-residue-mask-handoff/v1');
      assert.equal(handoff.receiver.studio, 'evavo-texture-studio');
      assert.equal(handoff.png.sha256, '3'.repeat(64));
      assert.equal(handoff.review.status, 'independently-reviewed');
      assert.equal(handoff.review.edgeReviewPassed, true);
      assert.equal(handoff.review.substrateIntegrationReviewPassed, true);
      assert.equal(handoff.authorityBoundary.mayApproveTextureMaterial, false);
    } finally {
      process.chdir(originalCwd);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('reviewed residue request rejects unsafe paths and unreviewed evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evavo-fx-reviewed-raster-reject-'));
  try {
    const evidenceDirectory = path.join(root, 'evidence');
    fs.mkdirSync(evidenceDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(evidenceDirectory, 'alpha.json'),
      `${JSON.stringify(rasterEvidence('1'.repeat(64), '2'.repeat(64), '3'.repeat(64)))}\n`,
      'utf8',
    );
    assert.throws(() => compileReviewedResidueFromRasterRequest(request({ rasterEvidencePath: '../alpha.json' }), root), /canonical relative/);
    assert.throws(() => compileReviewedResidueFromRasterRequest(request({ reviewStatus: 'candidate' }), root), /independent review/i);
    assert.throws(() => compileReviewedResidueFromRasterRequest(request({ edgeReview: { passed: false } }), root), /reviews must pass/i);
    assert.throws(() => compileReviewedResidueFromRasterRequest(request({ pngSha256: '9'.repeat(64) }), root), /PNG digest does not match/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
