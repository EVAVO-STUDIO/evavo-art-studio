#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import {
  compileReviewedResidueMaskHandoffFromRasterEvidence,
  validateReviewedResidueMaskHandoff,
} from './fx-reviewed-residue-mask-handoff.mjs';

function fail(message) { throw new Error(`fx-reviewed-residue-from-raster: ${message}`); }
function readJson(file) { return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')); }

function compile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('input must be object');
  if (input.format !== 'evavo.fx-reviewed-residue-from-raster-request/v1') fail('request format mismatch');
  if (typeof input.rasterEvidencePath !== 'string' || input.rasterEvidencePath.includes('..') || path.isAbsolute(input.rasterEvidencePath)) fail('rasterEvidencePath must be canonical relative path');
  if (typeof input.pngPath !== 'string' || input.pngPath.includes('..') || path.isAbsolute(input.pngPath) || !input.pngPath.endsWith('.png')) fail('pngPath must be canonical relative PNG path');
  const rasterEvidence = readJson(input.rasterEvidencePath);
  const handoff = compileReviewedResidueMaskHandoffFromRasterEvidence({
    sourceResidueHandoffSha256: input.sourceResidueHandoffSha256,
    vectorCandidateSha256: input.vectorCandidateSha256,
    masteringPlanSha256: input.masteringPlanSha256,
    pngSha256: input.pngSha256,
    reviewEvidenceSha256: input.reviewEvidenceSha256,
    reviewStatus: input.reviewStatus,
    pngPath: input.pngPath,
    edgeReview: input.edgeReview,
    substrateIntegrationReview: input.substrateIntegrationReview,
    rasterEvidence,
  });
  return validateReviewedResidueMaskHandoff(handoff);
}

const [command, inputPath, outputPath] = process.argv.slice(2);
if (!['compile','validate'].includes(command ?? '')) {
  process.stderr.write('usage: node scripts/compile-fx-reviewed-residue-from-raster.mjs <compile|validate> <input.json> [new-output.json]\n');
  process.exitCode = 2;
} else {
  try {
    if (!inputPath) fail('input path required');
    if (command === 'validate') {
      const validated = validateReviewedResidueMaskHandoff(readJson(inputPath));
      process.stdout.write(`${JSON.stringify({ ok: true, format: validated.format, handoffSha256: validated.handoffSha256 })}\n`);
    } else {
      const handoff = compile(readJson(inputPath));
      if (!outputPath) {
        process.stdout.write(`${JSON.stringify(handoff, null, 2)}\n`);
      } else {
        const target = path.resolve(outputPath);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, `${JSON.stringify(handoff, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
        process.stdout.write(`${JSON.stringify({ ok: true, output: target, handoffSha256: handoff.handoffSha256 })}\n`);
      }
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
