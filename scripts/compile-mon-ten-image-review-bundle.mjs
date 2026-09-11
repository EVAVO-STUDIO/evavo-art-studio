#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [batchPath, receiptsDirArg, outputArg] = process.argv.slice(2);
if (!batchPath || !receiptsDirArg) {
  console.error('Usage: node scripts/compile-mon-ten-image-review-bundle.mjs <compiled-batch.json> <receipts-dir> [output.json]');
  process.exit(2);
}

function fail(message) { console.error(JSON.stringify({ok:false,error:message}, null, 2)); process.exit(2); }
function readJson(p) {
  const v = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(`JSON root must be object: ${p}`);
  return v;
}
function hash(v) { return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex'); }

const batch = readJson(batchPath);
if (!Array.isArray(batch.outputs) || batch.outputs.length !== 10) fail('compiled batch must have exactly 10 outputs');
const receiptsDir = path.resolve(receiptsDirArg);
if (!fs.existsSync(receiptsDir) || !fs.statSync(receiptsDir).isDirectory()) fail('receipts-dir missing');

const receiptFiles = fs.readdirSync(receiptsDir).filter((f) => f.endsWith('.json')).sort();
const receipts = receiptFiles.map((f) => ({file:f, data:readJson(path.join(receiptsDir, f))}));
const byAsset = new Map();
for (const item of receipts) {
  const assetId = String(item.data.asset_id ?? '').trim();
  if (!assetId) continue;
  if (byAsset.has(assetId)) fail(`duplicate candidate receipt for ${assetId}`);
  byAsset.set(assetId, item);
}

const ordered = [];
for (const output of batch.outputs) {
  const item = byAsset.get(output.id);
  if (!item) fail(`missing candidate receipt for planned asset ${output.id}`);
  if (String(item.data.style_lock_id ?? '') !== String(batch.style_lock_id)) fail(`style lock mismatch for ${output.id}`);
  ordered.push({
    ordinal: output.ordinal,
    asset_id: output.id,
    candidate_id: String(item.data.candidate_id ?? ''),
    receipt_file: item.file,
    review_state: String(item.data.review_state ?? ''),
    outputs: item.data.outputs ?? [],
    qa: item.data.qa ?? {},
    parent_candidate_id: item.data.parent_candidate_id ?? null
  });
}
if (byAsset.size !== 10) {
  const extras = [...byAsset.keys()].filter((id) => !batch.outputs.some((o) => o.id === id));
  if (extras.length) fail(`unplanned candidate receipts present: ${extras.join(', ')}`);
}

const bundle = {
  schema_version: 1,
  id: `${batch.batch_id}_review_bundle`,
  batch_id: batch.batch_id,
  style_lock_id: batch.style_lock_id,
  batch_fingerprint: batch.batch_fingerprint,
  exact_output_count: 10,
  candidate_receipts: ordered,
  qa: {
    exact_output_coverage: true,
    family_consistency: false,
    style_lock_consistency: true,
    native_scale_review: false,
    no_unplanned_panels_or_contact_sheets: true,
    corrections_preserve_lineage: ordered.every((x) => !x.parent_candidate_id || typeof x.parent_candidate_id === 'string')
  },
  approval: {
    local_only: true,
    github_actions_required: false,
    all_candidates_approved: ordered.every((x) => x.review_state === 'approved'),
    exact_hashes_required: true,
    review_state: 'technical_review'
  }
};
bundle.bundle_digest = hash(bundle);
const out = path.resolve(outputArg ?? `${batch.batch_id}.review-bundle.json`);
fs.writeFileSync(out, JSON.stringify(bundle, null, 2) + '\n');
console.log(JSON.stringify({ok:true, output:out, batch_id:batch.batch_id, candidates:10, digest:bundle.bundle_digest}, null, 2));
