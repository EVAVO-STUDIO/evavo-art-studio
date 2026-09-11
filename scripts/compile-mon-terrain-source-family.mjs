#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [specArg, outputArg] = process.argv.slice(2);
if (!specArg) {
  console.error('Usage: node scripts/compile-mon-terrain-source-family.mjs <spec.json> [output.json]');
  process.exit(2);
}

const fail = (message) => {
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exit(2);
};
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const fileHash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const digest = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

let spec;
try { spec = readJson(specArg); } catch (error) { fail(`cannot read spec: ${error.message}`); }
for (const key of ['family_id', 'style_lock_id', 'material_identity', 'candidates']) {
  if (!(key in spec)) fail(`missing required field: ${key}`);
}
if (!Array.isArray(spec.candidates) || spec.candidates.length < 6 || spec.candidates.length > 12) {
  fail('candidates must contain 6-12 source images');
}
const preferred = Number(spec.preferred_count ?? 8);
if (!Number.isInteger(preferred) || preferred < 6 || preferred > 12) fail('preferred_count must be integer 6-12');

const base = path.dirname(path.resolve(specArg));
const ids = new Set();
const candidates = spec.candidates.map((entry, index) => {
  if (!entry || typeof entry !== 'object') fail(`candidates[${index}] must be object`);
  const id = String(entry.id ?? '').trim();
  const source = String(entry.source ?? '').trim();
  if (!id || !source) fail(`candidates[${index}] requires id and source`);
  if (ids.has(id)) fail(`duplicate candidate id: ${id}`);
  ids.add(id);
  const resolved = path.resolve(base, source);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) fail(`source missing: ${source}`);
  const ext = path.extname(resolved).toLowerCase();
  if (!['.png', '.webp', '.jpg', '.jpeg'].includes(ext)) fail(`unsupported image type: ${source}`);
  return {
    id,
    source,
    source_sha256: fileHash(resolved),
    role: 'continuous_surface_source_candidate',
    status: 'source_unapproved',
    weight_hint: Number(entry.weight_hint ?? 1),
    runtime_authority: false,
  };
});

const manifest = {
  schema_version: 1,
  id: `${spec.family_id}_terrain_source_family`,
  family_id: String(spec.family_id),
  style_lock_id: String(spec.style_lock_id),
  material_identity: String(spec.material_identity),
  preferred_count: preferred,
  candidates,
  production_rules: {
    projection: 'top_down_continuous_surface',
    flat_diffuse_lighting: true,
    hero_objects_forbidden: true,
    transition_edges_forbidden: true,
    shoreline_forbidden: true,
    cliff_faces_forbidden: true,
    distinct_puddles_forbidden: true,
    prompt_seamless_claim_is_evidence: false,
  },
  downstream: {
    texture_studio_profile: 'mon-painted-2_5d-surface-production-v1',
    tile_map_studio_command: 'tile-map-surface-family certify',
    required_proofs: ['offset_proof', '3x3_tiling_proof', 'all_pairs_edge_report', '8x8_family_mosaic', 'native_scale_godot_proof'],
  },
  execution_policy: { local_only: true, github_actions_required: false, hosted_ci_required: false },
};
manifest.manifest_digest = digest(manifest);
const out = path.resolve(outputArg ?? `${spec.family_id}.terrain-source-family.json`);
fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ ok: true, output: out, family_id: manifest.family_id, candidates: candidates.length, digest: manifest.manifest_digest }, null, 2));
