import test from 'node:test';
import assert from 'node:assert/strict';
import { compileFxDecalSvgCandidate } from './fx-decal-svg-candidate.mjs';

test('FX decal SVG candidates are deterministic, alpha-ready and material-aware', () => {
  const requests = [
    { id: 'plaster-hole', kind: 'bullet-hole', substrate: 'plaster', seed: 11, amount: 0.65 },
    { id: 'glass-hole', kind: 'bullet-hole', substrate: 'glass', seed: 12, amount: 0.55 },
    { id: 'blood-splatter', kind: 'splatter', substrate: 'stone', seed: 13, amount: 0.8, viscosity: 0.5, directionDegrees: 25 },
    { id: 'food-splatter', kind: 'splatter', substrate: 'tile', seed: 14, amount: 0.7, viscosity: 0.75, directionDegrees: 115 },
    { id: 'damp-stain', kind: 'stain', substrate: 'plaster', seed: 15, amount: 0.65, porosity: 0.9 },
    { id: 'puddle', kind: 'puddle', substrate: 'stone', seed: 16, amount: 0.8 },
  ];
  for (const request of requests) {
    const left = compileFxDecalSvgCandidate(request);
    const right = compileFxDecalSvgCandidate(request);
    assert.deepEqual(left, right);
    assert.equal(left.format, 'evavo.fx-decal-svg-candidate/v1');
    assert.match(left.candidateSha256, /^[a-f0-9]{64}$/);
    assert.equal(left.finishing.trueAlphaRequired, true);
    assert.equal(left.finishing.rasterizeThroughExistingArtStudioProcessing, true);
    assert.equal(left.authorityBoundary.automaticApproval, false);
    assert.match(left.svg, /<svg/);
    assert.match(left.svg, /candidate-mask/);
  }
  assert.notEqual(
    compileFxDecalSvgCandidate(requests[0]).svg,
    compileFxDecalSvgCandidate(requests[1]).svg,
    'plaster and glass impacts must not collapse to one generic mask',
  );
});

test('FX decal SVG candidate compiler rejects unsupported families', () => {
  assert.throws(() => compileFxDecalSvgCandidate({ id: 'bad', kind: 'unknown' }), /unsupported decal kind/);
});
