#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { compileFxDecalSvgCandidate } from './fx-decal-svg-candidate.mjs';

const [outputDirectory] = process.argv.slice(2);
if (!outputDirectory) throw new Error('usage: node scripts/run-fx-workstation-probe.mjs <new-output-directory>');
const out = path.resolve(outputDirectory);
if (fs.existsSync(out)) throw new Error(`FX art probe output must not exist: ${out}`);
fs.mkdirSync(out, { recursive: false });

const requests = [
  { id: 'probe-plaster-bullet-hole', kind: 'bullet-hole', substrate: 'plaster', seed: 4101, amount: 0.62 },
  { id: 'probe-blood-splatter', kind: 'splatter', substrate: 'stone', seed: 4102, amount: 0.72, viscosity: 0.58, directionDegrees: 28 },
];

const outputs = [];
for (const request of requests) {
  const candidate = compileFxDecalSvgCandidate(request);
  if (candidate.authority !== 'candidate_vector_mask_only') throw new Error(`${request.id}: authority mismatch`);
  if (candidate.finishing?.trueAlphaRequired !== true) throw new Error(`${request.id}: true-alpha requirement missing`);
  const svgPath = path.join(out, `${request.id}.svg`);
  const jsonPath = path.join(out, `${request.id}.candidate.json`);
  fs.writeFileSync(svgPath, candidate.svg, { encoding: 'utf8', flag: 'wx' });
  fs.writeFileSync(jsonPath, `${JSON.stringify(candidate, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  outputs.push({
    id: request.id,
    kind: request.kind,
    candidateSha256: candidate.candidateSha256,
    svg: path.basename(svgPath),
    svgSha256: crypto.createHash('sha256').update(fs.readFileSync(svgPath)).digest('hex'),
    candidate: path.basename(jsonPath),
    candidateFileSha256: crypto.createHash('sha256').update(fs.readFileSync(jsonPath)).digest('hex'),
  });
}

const withoutDigest = {
  format: 'evavo.fx-art-workstation-probe/v1',
  studio: 'evavo-art-studio',
  outputs,
  authority: {
    generatedCandidatesOnly: true,
    creativeApprovalGranted: false,
    textureMaterialApprovalGranted: false,
    publicationGranted: false,
  },
};
const manifest = {
  ...withoutDigest,
  manifestSha256: crypto.createHash('sha256').update(JSON.stringify(withoutDigest)).digest('hex'),
};
const manifestPath = path.join(out, 'manifest.json');
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
process.stdout.write(`${JSON.stringify({ ok: true, output: out, outputs: outputs.length, manifestSha256: manifest.manifestSha256 })}\n`);
