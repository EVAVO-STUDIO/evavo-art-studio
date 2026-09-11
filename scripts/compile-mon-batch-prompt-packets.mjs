#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [batchPath, stylePath, outDirArg] = process.argv.slice(2);
if (!batchPath || !stylePath) {
  console.error('Usage: node scripts/compile-mon-batch-prompt-packets.mjs <compiled-batch.json> <style-lock.json> [out-dir]');
  process.exit(2);
}

function readJson(p) {
  const v = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`JSON root must be object: ${p}`);
  return v;
}
function digest(v) { return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex'); }
function fail(message) { console.error(JSON.stringify({ok:false,error:message}, null, 2)); process.exit(2); }

let batch, style;
try { batch = readJson(batchPath); style = readJson(stylePath); } catch (error) { fail(error.message); }
if (!Array.isArray(batch.outputs) || batch.outputs.length !== 10) fail('compiled batch must contain exactly 10 outputs');
if (!batch.style_lock_id || !style.id) fail('batch/style lock identity missing');
if (String(batch.style_lock_id) !== String(style.id)) fail(`style lock mismatch: ${batch.style_lock_id} != ${style.id}`);

const globalStyle = {
  id: style.id,
  visual_center: style.period_visual_centre ?? style.visual_center ?? 'late Roman/post-Roman Wales c.400-550',
  palette: style.palette ?? style.palette_families ?? {},
  lighting: style.lighting ?? style.lighting_family ?? {},
  material_language: style.material_language ?? style.materials ?? {},
  camera: style.camera ?? style.camera_projection ?? {},
  prohibited: style.prohibited ?? style.forbidden ?? [],
};

const outDir = path.resolve(outDirArg ?? `${batch.batch_id}.prompt-packets`);
fs.mkdirSync(outDir, { recursive: true });
const packets = [];
for (const output of batch.outputs) {
  const packet = {
    schema_version: 1,
    packet_id: `${batch.batch_id}-${String(output.ordinal).padStart(2, '0')}-prompt`,
    batch_id: batch.batch_id,
    ordinal: output.ordinal,
    asset_id: output.id,
    family_id: batch.family_id,
    role: output.role,
    purpose: output.purpose,
    output_size: batch.output_size,
    background_policy: output.background_policy,
    runtime_or_reference: batch.runtime_or_reference,
    style_lock_id: batch.style_lock_id,
    shared_style: globalStyle,
    ordered_reference_ids: [
      ...(Array.isArray(batch.ordered_reference_ids) ? batch.ordered_reference_ids : []),
      ...(Array.isArray(output.source_reference_ids) ? output.source_reference_ids : [])
    ],
    forbidden_drift: Array.isArray(batch.forbidden_drift) ? batch.forbidden_drift : [],
    generation_instructions: [
      'Preserve the same camera/projection, palette envelope, light direction and material language as the approved family references.',
      'Produce only the requested role for this output; do not invent unrelated scene content.',
      'Do not add text, labels, borders, contact sheets or multiple panels.',
      'Keep historically specific details within the supplied provenance and family references.',
      'For runtime transparent assets, preserve true alpha and avoid painted checkerboards or matte halos.',
      'For environment assets, prioritize clean silhouette/layer separation and native-scale gameplay readability over concept-art spectacle.'
    ],
    review_requirements: batch.review_requirements,
    runtime_authority: false,
    correction_policy: {
      local_patch_preferred: true,
      regenerate_unrelated_approved_content: false,
      parent_candidate_required_after_correction: true
    }
  };
  packet.prompt_packet_digest = digest(packet);
  const filename = `${batch.batch_id}-${String(output.ordinal).padStart(2, '0')}-${output.id}.prompt.json`;
  fs.writeFileSync(path.join(outDir, filename), JSON.stringify(packet, null, 2) + '\n');
  packets.push({asset_id: output.id, filename, digest: packet.prompt_packet_digest});
}

const index = {
  schema_version: 1,
  batch_id: batch.batch_id,
  output_count: packets.length,
  style_lock_id: batch.style_lock_id,
  batch_fingerprint: batch.batch_fingerprint,
  packets,
  execution_policy: { local_only: true, github_actions_required: false }
};
index.index_digest = digest(index);
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(JSON.stringify({ok:true, out_dir:outDir, batch_id:batch.batch_id, prompt_packets:packets.length, index_digest:index.index_digest}, null, 2));
