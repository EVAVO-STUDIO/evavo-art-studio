import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const media = fs.readFileSync('packages/media/src/fx-residue-raster.ts', 'utf8');
const probe = fs.readFileSync('scripts/run-fx-workstation-probe.mjs', 'utf8');
const index = fs.readFileSync('packages/media/src/index.ts', 'utf8');

test('FX residue probe uses the approved Sharp true-alpha media path', () => {
  for (const token of [
    'rasterizeFxResidueSvgCandidate',
    'sharp-exact-canvas-runtime',
    'normalizeAlphaCanvas',
    'createTransparencyProofSheet',
    'meaningfulTransparency',
    'paintedCheckerboardDetected',
    'transparentPixels',
    'partialAlphaPixels',
    'proofSha256',
  ]) assert.ok(media.includes(token), `media residue raster missing ${token}`);
  assert.ok(index.includes('./fx-residue-raster.js'));
  for (const token of [
    "'evavo.fx-art-workstation-probe/v2'",
    "'evavo.fx-residue-alpha-evidence/v1'",
    "'sharp-exact-canvas-runtime'",
    'masteringPlanSha256',
    'transparencyProofSha256',
    'trueAlphaRasterExecutionProven: true',
    'creativeApprovalGranted: false',
    'independentCreativeReviewStillRequired: true',
  ]) assert.ok(probe.includes(token), `workstation probe missing ${token}`);
});
