#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [batchSpecArg, styleLockArg, outputRootArg] = process.argv.slice(2);
if (!batchSpecArg || !styleLockArg) {
  console.error('Usage: node scripts/prepare-mon-batch-workspace.mjs <batch-spec.json> <style-lock.json> [output-root]');
  process.exit(2);
}

function readJson(p) {
  const value = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`JSON root must be object: ${p}`);
  return value;
}
function fail(message) { console.error(JSON.stringify({ok:false,error:message}, null, 2)); process.exit(2); }
function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`command failed (${result.status}): node ${args.join(' ')}`);
}

try {
  const batchSpec = readJson(batchSpecArg);
  const batchId = String(batchSpec.batch_id ?? '').trim();
  if (!batchId) fail('batch_spec.batch_id required');
  if (!Array.isArray(batchSpec.ordered_outputs) || batchSpec.ordered_outputs.length !== 10) fail('batch spec must contain exactly 10 outputs');

  const root = path.resolve(outputRootArg ?? path.join('art-workspaces', batchId));
  const dirs = {
    root,
    specs: path.join(root, 'specs'),
    prompts: path.join(root, 'prompts'),
    candidates: path.join(root, 'candidates'),
    corrections: path.join(root, 'corrections'),
    receipts: path.join(root, 'receipts'),
    proofs: path.join(root, 'proofs'),
    review: path.join(root, 'review'),
    approved: path.join(root, 'approved')
  };
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });

  const stagedSpec = path.join(dirs.specs, `${batchId}.batch.json`);
  const stagedStyle = path.join(dirs.specs, 'mon-style-lock.json');
  fs.copyFileSync(batchSpecArg, stagedSpec);
  fs.copyFileSync(styleLockArg, stagedStyle);

  const compiledBatch = path.join(dirs.specs, `${batchId}.compiled.json`);
  run([path.resolve('scripts/compile-mon-ten-image-batch.mjs'), stagedSpec, compiledBatch]);
  run([path.resolve('scripts/compile-mon-batch-prompt-packets.mjs'), compiledBatch, stagedStyle, dirs.prompts]);

  const ledger = {
    schema_version: 1,
    batch_id: batchId,
    state: 'prepared',
    output_count: 10,
    style_lock_id: batchSpec.style_lock_id,
    runtime_or_reference: batchSpec.runtime_or_reference,
    directories: dirs,
    outputs: batchSpec.ordered_outputs.map((o, i) => ({
      ordinal: i + 1,
      asset_id: String(o.id),
      filename: String(o.filename ?? `${batchId}-${String(i + 1).padStart(2,'0')}.png`),
      state: 'prompt_ready',
      candidate_path: null,
      receipt_path: null,
      parent_candidate_id: null
    })),
    execution_policy: { local_only: true, github_actions_required: false, paid_git_features_required: false }
  };
  const ledgerPath = path.join(root, 'batch-ledger.json');
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');

  console.log(JSON.stringify({
    ok: true,
    batch_id: batchId,
    workspace: root,
    prompt_packets: 10,
    ledger: ledgerPath,
    next: 'Generate exactly the ten planned candidates, write candidate receipts, then compile the ten-image review bundle.'
  }, null, 2));
} catch (error) {
  fail(String(error?.message ?? error));
}
