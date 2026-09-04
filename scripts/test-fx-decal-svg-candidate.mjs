import { compileFxDecalSvgCandidate } from './fx-decal-svg-candidate.mjs';

const cases = [
  { id: 'plaster-hole', kind: 'bullet-hole', substrate: 'plaster', seed: 1, amount: 0.6 },
  { id: 'metal-hole', kind: 'bullet-hole', substrate: 'metal', seed: 2, amount: 0.5 },
  { id: 'blood-splatter', kind: 'splatter', substrate: 'stone', seed: 3, amount: 0.8, viscosity: 0.55, directionDegrees: 35 },
  { id: 'food-splatter', kind: 'splatter', substrate: 'tile', seed: 4, amount: 0.7, viscosity: 0.72, directionDegrees: 120 },
  { id: 'damp-stain', kind: 'stain', substrate: 'plaster', seed: 5, amount: 0.65, porosity: 0.9, gravity: true },
  { id: 'puddle', kind: 'puddle', substrate: 'stone', seed: 6, amount: 0.75 },
];
for (const request of cases) {
  const left = compileFxDecalSvgCandidate(request);
  const right = compileFxDecalSvgCandidate(request);
  if (JSON.stringify(left) !== JSON.stringify(right)) throw new Error(`${request.id}: generator is not deterministic`);
  if (left.format !== 'evavo.fx-decal-svg-candidate/v1') throw new Error(`${request.id}: format mismatch`);
  if (!left.svg.includes('<svg') || !left.svg.includes('candidate-mask')) throw new Error(`${request.id}: invalid SVG`);
  if (!/^[a-f0-9]{64}$/.test(left.candidateSha256)) throw new Error(`${request.id}: digest invalid`);
  if (left.finishing.trueAlphaRequired !== true) throw new Error(`${request.id}: true alpha not required`);
  if (left.authorityBoundary.automaticApproval !== false) throw new Error(`${request.id}: authority expanded`);
}
const plaster = compileFxDecalSvgCandidate(cases[0]);
const metal = compileFxDecalSvgCandidate(cases[1]);
if (plaster.svg === metal.svg) throw new Error('material-aware bullet holes collapsed to same vector mask');
let invalidRejected = false;
try { compileFxDecalSvgCandidate({ id: 'bad', kind: 'unknown' }); } catch { invalidRejected = true; }
if (!invalidRejected) throw new Error('unknown decal family was accepted');
console.log(JSON.stringify({ ok: true, gate: 'evavo-fx-decal-svg-candidate-v1', cases: cases.length }));
