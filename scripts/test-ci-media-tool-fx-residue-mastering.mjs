import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { compileFxResidueMasteringPlan } from './compile-fx-residue-mastering-plan.mjs';

const fixture = {
  kind: 'bullet-hole',
  substrate: 'plaster',
  svgPath: 'candidate/bullet-hole-plaster.svg',
  candidateSha256: 'a'.repeat(64),
  width: 1024,
  height: 1024,
};

const plan = compileFxResidueMasteringPlan(fixture);
assert.equal(plan.format, 'evavo.fx-residue-mastering-plan/v1');
assert.equal(plan.route.processorId, 'sharp-exact-canvas-runtime');
assert.equal(plan.route.runtimeFormat, 'png');
assert.equal(plan.canvas.background, 'transparent');
assert.equal(plan.canvas.meaningfulTransparencyRequired, true);
assert.equal(plan.delivery.createOnlyOutput, true);
assert.equal(plan.delivery.sourceOverwriteAllowed, false);
assert.equal(plan.delivery.lossyIntermediateAllowed, false);
assert.equal(plan.delivery.rejectPaintedCheckerboard, true);
assert.equal(plan.proofs.hostileBackgroundProofs.includes('saturated-green'), true);
assert.equal(plan.authorityBoundary.mayExecuteProcessor, false);
assert.equal(plan.authorityBoundary.mayApproveCreativeResult, false);
assert.equal(plan.downstream.textureStudioMaterialResponseSeparate, true);
assert.match(plan.planSha256, /^[a-f0-9]{64}$/);
assert.deepEqual(plan, compileFxResidueMasteringPlan(fixture));

for (const bad of [
  { ...fixture, svgPath: '../escape.svg' },
  { ...fixture, candidateSha256: 'bad' },
  { ...fixture, width: 0 },
]) {
  assert.throws(() => compileFxResidueMasteringPlan(bad));
}

const root = mkdtempSync(path.join(os.tmpdir(), 'evavo-art-fx-residue-mastering-'));
try {
  const input = path.join(root, 'input.json');
  const output = path.join(root, 'plan.json');
  writeFileSync(input, JSON.stringify(fixture));
  const first = spawnSync(process.execPath, ['scripts/compile-fx-residue-mastering-plan.mjs', 'compile', input, output], {
    cwd: process.cwd(), encoding: 'utf8', shell: false, windowsHide: true,
  });
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const written = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(written.planSha256, plan.planSha256);
  const overwrite = spawnSync(process.execPath, ['scripts/compile-fx-residue-mastering-plan.mjs', 'compile', input, output], {
    cwd: process.cwd(), encoding: 'utf8', shell: false, windowsHide: true,
  });
  assert.notEqual(overwrite.status, 0, 'create-only plan output must reject overwrite');
  const validate = spawnSync(process.execPath, ['scripts/compile-fx-residue-mastering-plan.mjs', 'validate', output], {
    cwd: process.cwd(), encoding: 'utf8', shell: false, windowsHide: true,
  });
  assert.equal(validate.status, 0, validate.stderr || validate.stdout);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('EVAVO FX residue mastering media-tool regression passed');
