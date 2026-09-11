#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function fail(message) {
  console.error(`MÔN candidate receipt: ${message}`);
  process.exit(2);
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(`cannot read JSON ${file}: ${error.message}`); }
}

function sha256(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) fail(`file missing: ${file}`);
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function requiredString(spec, key) {
  const value = spec[key];
  if (typeof value !== 'string' || !value.trim()) fail(`${key} must be a non-empty string`);
  return value.trim();
}

const args = process.argv.slice(2);
const specIndex = args.indexOf('--spec');
const outIndex = args.indexOf('--out');
if (specIndex < 0 || !args[specIndex + 1] || outIndex < 0 || !args[outIndex + 1]) {
  fail('usage: node scripts/build-mon-candidate-receipt.mjs --spec <spec.json> --out <receipt.json>');
}

const specPath = path.resolve(args[specIndex + 1]);
const outputPath = path.resolve(args[outIndex + 1]);
const spec = readJson(specPath);

const sourceHashes = {};
for (const entry of spec.sources ?? []) {
  if (!entry || typeof entry.id !== 'string' || typeof entry.path !== 'string') fail('sources entries require id and path');
  sourceHashes[entry.id] = sha256(path.resolve(path.dirname(specPath), entry.path));
}
if (Object.keys(sourceHashes).length === 0) fail('at least one source is required');

const outputs = [];
for (const entry of spec.outputs ?? []) {
  if (!entry || typeof entry.path !== 'string' || typeof entry.role !== 'string') fail('outputs entries require path and role');
  const resolved = path.resolve(path.dirname(specPath), entry.path);
  outputs.push({ path: entry.path, role: entry.role, sha256: sha256(resolved) });
}
if (outputs.length === 0) fail('at least one output is required');

const qa = {
  local_validation_passed: Boolean(spec.qa?.local_validation_passed),
  family_consistency_checked: Boolean(spec.qa?.family_consistency_checked),
  style_lock_checked: Boolean(spec.qa?.style_lock_checked),
  native_scale_proof_passed: Boolean(spec.qa?.native_scale_proof_passed),
  remote_ci_required: false,
  ...(spec.qa ?? {}),
  remote_ci_required: false,
};

const receipt = {
  schema_version: 1,
  candidate_id: requiredString(spec, 'candidate_id'),
  asset_id: requiredString(spec, 'asset_id'),
  family_id: requiredString(spec, 'family_id'),
  producer_tool: requiredString(spec, 'producer_tool'),
  producer_repo: requiredString(spec, 'producer_repo'),
  producer_profile_id: requiredString(spec, 'producer_profile_id'),
  style_lock_id: requiredString(spec, 'style_lock_id'),
  source_hashes: sourceHashes,
  reference_ids: Array.isArray(spec.reference_ids) ? spec.reference_ids : [],
  outputs,
  qa,
  review_state: spec.review_state ?? 'candidate',
};

for (const key of ['parent_candidate_id', 'correction_reason', 'changed_regions_or_layers', 'preserved_locks', 'historical_tags', 'prompt_packet_id']) {
  if (spec[key] !== undefined) receipt[key] = spec[key];
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ok: true, receipt: outputPath, candidate_id: receipt.candidate_id, outputs: outputs.length }, null, 2));
