#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [input, outputArg] = process.argv.slice(2);
if (!input) {
  console.error('Usage: node scripts/compile-mon-ten-image-batch.mjs <batch.json> [output.json]');
  process.exit(2);
}

function fail(message) { console.error(JSON.stringify({ok:false,error:message}, null, 2)); process.exit(2); }
function hashObject(v) { return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex'); }

let batch;
try { batch = JSON.parse(fs.readFileSync(input, 'utf8')); } catch (e) { fail(`cannot read batch: ${e.message}`); }
if (!batch || typeof batch !== 'object' || Array.isArray(batch)) fail('batch root must be object');
for (const field of ['batch_id','batch_kind','family_id','style_lock_id','purpose','runtime_or_reference','output_size','background_policy','ordered_outputs']) {
  if (!(field in batch)) fail(`missing required field: ${field}`);
}
if (!Array.isArray(batch.ordered_outputs) || batch.ordered_outputs.length !== 10) fail('ordered_outputs must contain exactly 10 outputs');
const ids = new Set();
const outputs = batch.ordered_outputs.map((value, index) => {
  if (!value || typeof value !== 'object') fail(`ordered_outputs[${index}] must be object`);
  const id = String(value.id ?? '').trim();
  const role = String(value.role ?? '').trim();
  if (!id || !role) fail(`ordered_outputs[${index}] requires id and role`);
  if (ids.has(id)) fail(`duplicate output id: ${id}`);
  ids.add(id);
  return {
    ordinal: index + 1,
    id,
    role,
    purpose: String(value.purpose ?? batch.purpose),
    background_policy: String(value.background_policy ?? batch.background_policy),
    source_reference_ids: Array.isArray(value.source_reference_ids) ? value.source_reference_ids.map(String) : [],
    filename: String(value.filename ?? `${batch.batch_id}-${String(index + 1).padStart(2,'0')}.png`),
    review_state: 'planned',
    runtime_authority: false
  };
});

const compiled = {
  schema_version: 1,
  id: `${batch.batch_id}_compiled`,
  batch_id: String(batch.batch_id),
  batch_kind: String(batch.batch_kind),
  family_id: String(batch.family_id),
  style_lock_id: String(batch.style_lock_id),
  purpose: String(batch.purpose),
  runtime_or_reference: String(batch.runtime_or_reference),
  output_size: batch.output_size,
  background_policy: String(batch.background_policy),
  ordered_reference_ids: Array.isArray(batch.ordered_reference_ids) ? batch.ordered_reference_ids.map(String) : [],
  forbidden_drift: Array.isArray(batch.forbidden_drift) ? batch.forbidden_drift.map(String) : [],
  review_requirements: Array.isArray(batch.review_requirements) ? batch.review_requirements.map(String) : ['family_consistency','native_scale_review'],
  outputs,
  batch_fingerprint: hashObject({batch_id:batch.batch_id,family_id:batch.family_id,style_lock_id:batch.style_lock_id,outputs}),
  execution_policy: {local_only:true, github_actions_required:false, exact_output_count:10}
};

const output = path.resolve(outputArg ?? `${batch.batch_id}.compiled.json`);
fs.writeFileSync(output, JSON.stringify(compiled, null, 2) + '\n');
console.log(JSON.stringify({ok:true, output, batch_id:compiled.batch_id, outputs:10, fingerprint:compiled.batch_fingerprint}, null, 2));
