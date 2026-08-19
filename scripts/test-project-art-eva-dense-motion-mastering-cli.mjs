#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseEvaDenseMotionMasteringCliArgs,
} from './run-project-art-eva-dense-motion-mastering-campaign.mjs';

function valid(command = 'preflight') {
  return [
    command,
    '--program',
    '/tmp/eva-ten-master-program.json',
    '--workspace-root',
    '/tmp/eva-dense-workspace',
    '--mastered-at',
    '2026-08-20T00:20:00.000Z',
    '--finished-at',
    '2026-08-20T00:21:00.000Z',
  ];
}

function hasCode(code) {
  return (error) => error instanceof Error && error.code === code;
}

test('accepts only the exact preflight/run command contract', () => {
  for (const command of ['preflight', 'run']) {
    const parsed = parseEvaDenseMotionMasteringCliArgs(valid(command));
    assert.equal(parsed.command, command);
    assert.equal(parsed.programPath, '/tmp/eva-ten-master-program.json');
    assert.equal(parsed.workspaceRoot, '/tmp/eva-dense-workspace');
    assert.equal(parsed.masteredAt, '2026-08-20T00:20:00.000Z');
    assert.equal(parsed.finishedAt, '2026-08-20T00:21:00.000Z');
  }
});

test('rejects unknown, duplicate, missing and non-canonical controls with typed errors', () => {
  assert.throws(
    () => parseEvaDenseMotionMasteringCliArgs([
      ...valid(),
      '--pretend-approved',
      'true',
    ]),
    hasCode('EVA_DENSE_MASTERING_CLI_INVALID'),
  );
  const duplicate = valid();
  duplicate.splice(3, 0, '--program', '/tmp/other.json');
  assert.throws(
    () => parseEvaDenseMotionMasteringCliArgs(duplicate),
    hasCode('EVA_DENSE_MASTERING_CLI_INVALID'),
  );
  assert.throws(
    () => parseEvaDenseMotionMasteringCliArgs(valid().slice(0, -2)),
    hasCode('EVA_DENSE_MASTERING_CLI_INVALID'),
  );
  const nonCanonical = valid();
  nonCanonical[nonCanonical.indexOf('--mastered-at') + 1] = '2026-08-20T00:20:00Z';
  assert.throws(
    () => parseEvaDenseMotionMasteringCliArgs(nonCanonical),
    hasCode('EVA_DENSE_MASTERING_CLI_TIMESTAMP_INVALID'),
  );
  const backwards = valid();
  backwards[backwards.indexOf('--finished-at') + 1] = '2026-08-20T00:19:00.000Z';
  assert.throws(
    () => parseEvaDenseMotionMasteringCliArgs(backwards),
    hasCode('EVA_DENSE_MASTERING_CLI_TIME_ORDER_INVALID'),
  );
});
