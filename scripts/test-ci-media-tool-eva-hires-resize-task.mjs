import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const guard = new URL('./check-eva-premultiplied-alpha-resize-task.mjs', import.meta.url);

test('EVA hires premultiplied-alpha named task stays fail-closed', () => {
  const output = execFileSync(process.execPath, [guard.pathname], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
  const result = JSON.parse(output);
  assert.equal(result.ok, true);
  assert.equal(result.schema, 'evavo_eva_hires_resize_named_task_guard_v1');
  assert.equal(result.task, 'eva-premultiplied-alpha-resize');
  assert.equal(result.producer, 'tools/premultiplied_alpha_resize.py');
  assert.equal(result.pythonEnvironment, 'image-finishing');
  assert.equal(result.network, 'disabled');
  assert.deepEqual(result.parameterOutputs, ['receipt']);
  assert.equal(result.executionPerformed, false);
  assert.equal(result.approvalAuthority, false);
  assert.equal(result.publicationAuthority, false);
  assert.equal(result.runtimeActivationAuthority, false);
  assert.equal(result.websiteActivationAuthority, false);
});
