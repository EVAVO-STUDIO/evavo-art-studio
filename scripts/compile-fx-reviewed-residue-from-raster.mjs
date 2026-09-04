#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  compileReviewedResidueMaskHandoffFromRasterEvidence,
  validateReviewedResidueMaskHandoff,
} from './fx-reviewed-residue-mask-handoff.mjs';

export const FX_REVIEWED_RESIDUE_FROM_RASTER_REQUEST_FORMAT = 'evavo.fx-reviewed-residue-from-raster-request/v1';

function fail(message) { throw new Error(`fx-reviewed-residue-from-raster: ${message}`); }
function readJsonAbsolute(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function canonicalRelative(value, label, suffix = '') {
  if (typeof value !== 'string' || !value || path.isAbsolute(value) || value.includes('..') || (suffix && !value.endsWith(suffix))) {
    fail(`${label} must be canonical relative${suffix ? ` ${suffix}` : ''} path`);
  }
  return value;
}
function resolveInside(baseDirectory, relativePath, label) {
  const base = path.resolve(baseDirectory);
  const resolved = path.resolve(base, relativePath);
  const relation = path.relative(base, resolved);
  if (!relation || relation.startsWith('..') || path.isAbsolute(relation)) fail(`${label} must resolve beneath request directory`);
  return resolved;
}

export function compileReviewedResidueFromRasterRequest(input, requestDirectory = process.cwd()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('input must be object');
  if (input.format !== FX_REVIEWED_RESIDUE_FROM_RASTER_REQUEST_FORMAT) fail('request format mismatch');
  canonicalRelative(input.rasterEvidencePath, 'rasterEvidencePath', '.json');
  canonicalRelative(input.pngPath, 'pngPath', '.png');
  const rasterEvidenceFile = resolveInside(requestDirectory, input.rasterEvidencePath, 'rasterEvidencePath');
  if (!fs.existsSync(rasterEvidenceFile) || !fs.statSync(rasterEvidenceFile).isFile()) fail('rasterEvidencePath file missing');
  const rasterEvidence = readJsonAbsolute(rasterEvidenceFile);
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

function main() {
  const [command, inputPath, outputPath] = process.argv.slice(2);
  if (!['compile','validate'].includes(command ?? '')) {
    process.stderr.write('usage: node scripts/compile-fx-reviewed-residue-from-raster.mjs <compile|validate> <input.json> [new-output.json]\n');
    process.exitCode = 2;
    return;
  }
  try {
    if (!inputPath) fail('input path required');
    const resolvedInput = path.resolve(inputPath);
    if (command === 'validate') {
      const validated = validateReviewedResidueMaskHandoff(readJsonAbsolute(resolvedInput));
      process.stdout.write(`${JSON.stringify({ ok: true, format: validated.format, handoffSha256: validated.handoffSha256 })}\n`);
      return;
    }
    const request = readJsonAbsolute(resolvedInput);
    const handoff = compileReviewedResidueFromRasterRequest(request, path.dirname(resolvedInput));
    if (!outputPath) {
      process.stdout.write(`${JSON.stringify(handoff, null, 2)}\n`);
      return;
    }
    const target = path.resolve(outputPath);
    if (fs.existsSync(target)) fail(`output already exists: ${target}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(handoff, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    process.stdout.write(`${JSON.stringify({ ok: true, output: target, handoffSha256: handoff.handoffSha256 })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
