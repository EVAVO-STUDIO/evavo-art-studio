#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { resolveArtifactRoot } from './run-local-generation-campaign.mjs';

test('V1 defaults artifact storage to the child run when no override is supplied', () => {
  const outputRoot = path.resolve('C:\\temp\\evavo-run');
  assert.equal(resolveArtifactRoot(new Map(), outputRoot), path.resolve(outputRoot, 'artifacts'));
});

test('V1 accepts an explicit shared immutable artifact store override', () => {
  const outputRoot = path.resolve('C:\\temp\\evavo-run');
  const shared = path.resolve('C:\\temp\\evavo-shared-artifacts');
  const args = new Map([['--artifact-root', shared]]);
  assert.equal(resolveArtifactRoot(args, outputRoot), shared);
});
