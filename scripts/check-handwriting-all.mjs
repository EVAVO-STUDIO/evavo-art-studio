import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

run(process.execPath, ['scripts/check-handwriting-toolchain.mjs']);
run(process.execPath, ['scripts/check-handwriting-realistic.mjs']);

const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
for (const test of [
  'scripts/test_document_ink_finisher.py',
  'scripts/test_handwriting_atlas.py',
  'scripts/test_handwriting_realistic_render.py',
  'scripts/test_handwriting_multiline.py',
  'scripts/test_handwriting_paragraph.py',
  'scripts/test_handwriting_realism_qa.py',
  'scripts/test_handwriting_asset_confinement.py',
  'scripts/test_handwriting_whole_mark.py',
  'scripts/test_handwriting_document_bridge.py',
  'scripts/test_handwriting_coverage.py',
  'scripts/test_handwriting_capture_spec.py',
  'scripts/test_handwriting_capture_gap.py',
  'scripts/test_handwriting_capture_sheet.py',
  'scripts/test_handwriting_capture_register.py',
  'scripts/test_handwriting_fiducial_detect.py',
  'scripts/test_handwriting_registration_review.py',
  'scripts/test_handwriting_export_contract.py',
]) {
  run(python, ['-m', 'unittest', test]);
}

console.log(JSON.stringify({
  ok: true,
  check: 'handwriting-all',
  networkUsed: false,
  signingApprovalAuthority: false,
  suites: 17,
  preferredProductionRenderer: 'deterministic-shuffled-genuine-variant-bag-v1',
}, null, 2));
