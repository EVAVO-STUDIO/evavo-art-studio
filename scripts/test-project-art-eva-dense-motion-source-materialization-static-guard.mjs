#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

import guard from './check-project-art-eva-dense-motion-source-materialization.mjs';

test('source materialization static guard remains closed downstream', () => {
  assert.equal(guard.status, 'valid');
  assert.equal(guard.frameCount, 10);
  assert.equal(guard.exactSourceByteCopy, true);
  assert.equal(guard.downstreamAuthorityClosed, true);
});
