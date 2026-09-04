#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const FX_RESIDUE_MASTERING_PLAN_FORMAT = 'evavo.fx-residue-mastering-plan/v1';
const APPROVED_PROCESSOR = 'sharp-exact-canvas-runtime';
const ALLOWED_KINDS = new Set(['bullet-hole', 'splatter', 'stain', 'puddle']);

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return crypto.createHash('sha256').update(stable(value)).digest('hex');
}

function isSha(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function fail(message) {
  throw new Error(`fx-residue-mastering: ${message}`);
}

export function validateFxResidueCandidate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('candidate must be an object');
  if (!ALLOWED_KINDS.has(input.kind)) fail('candidate kind unsupported');
  if (!isSha(input.candidateSha256)) fail('candidateSha256 must be lowercase SHA-256');
  if (typeof input.svgPath !== 'string' || !input.svgPath.endsWith('.svg') || path.isAbsolute(input.svgPath) || input.svgPath.includes('..')) {
    fail('svgPath must be a canonical relative SVG path');
  }
  if (!Number.isInteger(input.width) || input.width < 16 || input.width > 8192) fail('width out of range');
  if (!Number.isInteger(input.height) || input.height < 16 || input.height > 8192) fail('height out of range');
  if (typeof input.substrate !== 'string' || !input.substrate.trim() || input.substrate.length > 64) fail('substrate invalid');
  return structuredClone(input);
}

export function compileFxResidueMasteringPlan(input) {
  const candidate = validateFxResidueCandidate(input);
  const withoutDigest = {
    format: FX_RESIDUE_MASTERING_PLAN_FORMAT,
    authority: 'candidate_mastering_plan_only',
    source: {
      kind: candidate.kind,
      substrate: candidate.substrate,
      svgPath: candidate.svgPath,
      candidateSha256: candidate.candidateSha256,
      sourceMustRemainImmutable: true,
    },
    route: {
      processorId: APPROVED_PROCESSOR,
      runtimeFormat: 'png',
      outputRole: 'true-alpha-residue-candidate',
      providerGeneration: false,
      fallbackAllowedOnlyIfEntireDeterministicOperationSetSupported: true,
    },
    canvas: {
      width: candidate.width,
      height: candidate.height,
      exactCanvasRequired: true,
      background: 'transparent',
      meaningfulTransparencyRequired: true,
      alphaMode: 'straight',
    },
    operations: [
      'inspect',
      'canvas-normalize',
      'convert',
      'alpha-analyze',
      'optimize',
    ],
    delivery: {
      createOnlyOutput: true,
      sourceOverwriteAllowed: false,
      lossyIntermediateAllowed: false,
      preserveAlpha: true,
      rejectPaintedCheckerboard: true,
      preserveVectorSource: true,
    },
    proofs: {
      alphaAnalysisRequired: true,
      hostileBackgroundProofs: ['black', 'white', 'mid-grey', 'saturated-green'],
      edgeFringeReviewRequired: true,
      substrateIntegrationReviewRequired: true,
      scaleReviewRequired: true,
    },
    downstream: {
      textureStudioMaterialResponseSeparate: true,
      particleStudioTransientBurstSeparate: true,
      atmosphereScenePlacementSeparate: true,
    },
    authorityBoundary: {
      mayExecuteProcessor: false,
      mayApproveCreativeResult: false,
      mayPromoteCanonical: false,
      mayPublish: false,
      mayDeleteVectorSource: false,
    },
  };
  return { ...withoutDigest, planSha256: digest(withoutDigest) };
}

function main() {
  const [command, inputPath, outputPath] = process.argv.slice(2);
  if (!['compile', 'validate'].includes(command ?? '')) {
    console.error('usage: node scripts/compile-fx-residue-mastering-plan.mjs <compile|validate> <input.json> [output.json]');
    process.exitCode = 2;
    return;
  }
  if (!inputPath) fail('input path required');
  const document = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (command === 'validate') {
    const plan = document.format === FX_RESIDUE_MASTERING_PLAN_FORMAT ? document : compileFxResidueMasteringPlan(document);
    if (!isSha(plan.planSha256)) fail('planSha256 missing');
    const expected = digest(Object.fromEntries(Object.entries(plan).filter(([key]) => key !== 'planSha256')));
    if (expected !== plan.planSha256) fail('plan self hash mismatch');
    console.log(JSON.stringify({ ok: true, format: plan.format, planSha256: plan.planSha256 }));
    return;
  }
  const plan = compileFxResidueMasteringPlan(document);
  if (!outputPath) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }
  const target = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(plan, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ ok: true, output: target, planSha256: plan.planSha256 }));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).href) {
  main();
}
