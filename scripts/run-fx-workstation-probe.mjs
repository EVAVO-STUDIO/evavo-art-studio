#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { compileFxDecalSvgCandidate } from './fx-decal-svg-candidate.mjs';
import { compileFxResidueMasteringPlan } from './compile-fx-residue-mastering-plan.mjs';

const [outputDirectory] = process.argv.slice(2);
if (!outputDirectory) throw new Error('usage: node scripts/run-fx-workstation-probe.mjs <new-output-directory>');
const out = path.resolve(outputDirectory);
if (fs.existsSync(out)) throw new Error(`FX art probe output must not exist: ${out}`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.mkdirSync(out, { recursive: false });

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const build = spawnSync(npm, ['--workspace', '@evavo/art-media', 'run', 'build', '--silent'], { cwd: process.cwd(), encoding: 'utf8', shell: false });
if (build.status !== 0) throw new Error(`FX art probe media build failed: ${build.stderr || build.stdout}`);
const mediaPath = path.resolve('packages/media/dist/index.js');
if (!fs.existsSync(mediaPath)) throw new Error('FX art probe media runtime missing after build');
const { rasterizeFxResidueSvgCandidate } = await import(`${pathToFileURL(mediaPath).href}?fx-probe=${Date.now()}`);
if (typeof rasterizeFxResidueSvgCandidate !== 'function') throw new Error('FX art residue raster processor is unavailable');

const requests = [
  { id: 'probe-plaster-bullet-hole', kind: 'bullet-hole', substrate: 'plaster', seed: 4101, amount: 0.62 },
  { id: 'probe-blood-splatter', kind: 'splatter', substrate: 'stone', seed: 4102, amount: 0.72, viscosity: 0.58, directionDegrees: 28 },
];

const digestFile = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const outputs = [];
for (const request of requests) {
  const candidate = compileFxDecalSvgCandidate(request);
  if (candidate.authority !== 'candidate_vector_mask_only') throw new Error(`${request.id}: authority mismatch`);
  if (candidate.finishing?.trueAlphaRequired !== true) throw new Error(`${request.id}: true-alpha requirement missing`);

  const svgPath = path.join(out, `${request.id}.svg`);
  const jsonPath = path.join(out, `${request.id}.candidate.json`);
  const planPath = path.join(out, `${request.id}.mastering-plan.json`);
  const pngPath = path.join(out, `${request.id}.png`);
  const proofPath = path.join(out, `${request.id}.transparency-proof.png`);
  const evidencePath = path.join(out, `${request.id}.alpha-evidence.json`);
  fs.writeFileSync(svgPath, candidate.svg, { encoding: 'utf8', flag: 'wx' });
  fs.writeFileSync(jsonPath, `${JSON.stringify(candidate, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });

  const plan = compileFxResidueMasteringPlan({
    kind: request.kind,
    substrate: request.substrate,
    svgPath: path.basename(svgPath),
    candidateSha256: candidate.candidateSha256,
    width: 1024,
    height: 1024,
  });
  if (plan.route?.processorId !== 'sharp-exact-canvas-runtime') throw new Error(`${request.id}: mastering processor mismatch`);
  if (plan.canvas?.exactCanvasRequired !== true || plan.canvas?.meaningfulTransparencyRequired !== true) throw new Error(`${request.id}: mastering canvas contract weakened`);
  fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });

  const raster = await rasterizeFxResidueSvgCandidate(candidate.svg, 1024, 1024, 12);
  if (raster.evidence.processorId !== 'sharp-exact-canvas-runtime') throw new Error(`${request.id}: raster processor mismatch`);
  if (raster.evidence.meaningfulTransparency !== true || raster.evidence.paintedCheckerboardDetected !== false) throw new Error(`${request.id}: alpha evidence invalid`);
  if (raster.evidence.outputWidth !== 1024 || raster.evidence.outputHeight !== 1024) throw new Error(`${request.id}: exact canvas mismatch`);
  fs.writeFileSync(pngPath, raster.png, { flag: 'wx' });
  fs.writeFileSync(proofPath, raster.transparencyProofPng, { flag: 'wx' });
  const alphaEvidence = {
    format: 'evavo.fx-residue-alpha-evidence/v1',
    candidateSha256: candidate.candidateSha256,
    masteringPlanSha256: plan.planSha256,
    ...raster.evidence,
    authority: {
      generatedRasterCandidateOnly: true,
      independentCreativeReviewStillRequired: true,
      substrateIntegrationReviewStillRequired: true,
      mayApproveCreativeResult: false,
      mayApproveTextureMaterial: false,
      publication: false,
    },
  };
  fs.writeFileSync(evidencePath, `${JSON.stringify(alphaEvidence, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });

  if (digestFile(pngPath) !== raster.evidence.pngSha256) throw new Error(`${request.id}: PNG SHA mismatch`);
  if (digestFile(proofPath) !== raster.evidence.proofSha256) throw new Error(`${request.id}: proof SHA mismatch`);
  outputs.push({
    id: request.id,
    kind: request.kind,
    candidateSha256: candidate.candidateSha256,
    svg: path.basename(svgPath),
    svgSha256: digestFile(svgPath),
    candidate: path.basename(jsonPath),
    candidateFileSha256: digestFile(jsonPath),
    masteringPlan: path.basename(planPath),
    masteringPlanSha256: plan.planSha256,
    png: path.basename(pngPath),
    pngSha256: raster.evidence.pngSha256,
    transparencyProof: path.basename(proofPath),
    transparencyProofSha256: raster.evidence.proofSha256,
    alphaEvidence: path.basename(evidencePath),
    alphaEvidenceSha256: digestFile(evidencePath),
    alpha: {
      exactCanvas: true,
      meaningfulTransparency: true,
      paintedCheckerboardDetected: false,
      transparentPixels: raster.evidence.transparentPixels,
      partialAlphaPixels: raster.evidence.partialAlphaPixels,
      visiblePixels: raster.evidence.visiblePixels,
    },
  });
}

const withoutDigest = {
  format: 'evavo.fx-art-workstation-probe/v2',
  studio: 'evavo-art-studio',
  processorId: 'sharp-exact-canvas-runtime',
  outputs,
  authority: {
    generatedCandidatesOnly: true,
    trueAlphaRasterExecutionProven: true,
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
process.stdout.write(`${JSON.stringify({ ok: true, output: out, outputs: outputs.length, format: manifest.format, processorId: manifest.processorId, manifestSha256: manifest.manifestSha256 })}\n`);
