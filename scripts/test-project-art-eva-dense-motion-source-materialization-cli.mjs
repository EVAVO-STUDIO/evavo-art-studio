#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseEvaDenseMotionSourceMaterializationCliArgs,
} from './run-project-art-eva-dense-motion-source-materialization.mjs';

function valid(command = 'preflight') {
  return [
    command,
    '--program',
    '/tmp/eva-ten-master-program.json',
    '--runtime-root',
    '/tmp/evavo-avatar-runtime',
    '--workspace-root',
    '/tmp/eva-dense-workspace',
    '--materialized-at',
    '2026-08-20T01:10:00.000Z',
  ];
}

test('accepts only the exact preflight/run source materialization contract', () => {
  for (const command of ['preflight', 'run']) {
    const parsed = parseEvaDenseMotionSourceMaterializationCliArgs(valid(command));
    assert.equal(parsed.command, command);
    assert.equal(parsed.programPath, '/tmp/eva-ten-master-program.json');
    assert.equal(parsed.runtimeRoot, '/tmp/evavo-avatar-runtime');
    assert.equal(parsed.workspaceRoot, '/tmp/eva-dense-workspace');
    assert.equal(parsed.materializedAt, '2026-08-20T01:10:00.000Z');
  }
});

test('rejects unknown, duplicate, missing and non-canonical controls', () => {
  assert.throws(
    () =>
      parseEvaDenseMotionSourceMaterializationCliArgs([
        ...valid(),
        '--candidate-approved',
        'true',
      ]),
    /EVA_DENSE_SOURCE_MATERIALIZATION_CLI_INVALID/u,
  );
  const duplicate = valid();
  duplicate.splice(3, 0, '--program', '/tmp/other.json');
  assert.throws(
    () => parseEvaDenseMotionSourceMaterializationCliArgs(duplicate),
    /EVA_DENSE_SOURCE_MATERIALIZATION_CLI_INVALID/u,
  );
  assert.throws(
    () => parseEvaDenseMotionSourceMaterializationCliArgs(valid().slice(0, -2)),
    /EVA_DENSE_SOURCE_MATERIALIZATION_CLI_INVALID/u,
  );
  const nonCanonical = valid();
  nonCanonical[nonCanonical.indexOf('--materialized-at') + 1] =
    '2026-08-20T01:10:00Z';
  assert.throws(
    () => parseEvaDenseMotionSourceMaterializationCliArgs(nonCanonical),
    (error) =>
      error?.code ===
      'EVA_DENSE_SOURCE_MATERIALIZATION_CLI_TIMESTAMP_INVALID',
  );
});
