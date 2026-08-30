import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function source(relativePath) {
  return readFile(path.join(root, ...relativePath.split('/')), 'utf8');
}

test('worker explicitly governs both Council identity and direction-master metadata schemas', async () => {
  const worker = await source('apps/worker/src/provider-handlers.ts');
  assert.match(worker, /COUNCIL_AVATAR_PROVIDER_REQUEST_METADATA_SCHEMAS\s*=\s*new Set\(\[/u);
  assert.match(worker, /evavo\.project-art-council-avatar-provider-request\.v1/u);
  assert.match(worker, /evavo\.project-art-council-avatar-direction-master-request\.v1/u);
  assert.match(worker, /COUNCIL_AVATAR_PROVIDER_REQUEST_METADATA_SCHEMAS\.has\(metadata\.schema\)/u);
  assert.doesNotMatch(worker, /metadata\.schema\.startsWith\(['"]evavo\.project-art-council-avatar/u);
});

test('direction-master compiler preserves fail-closed provider authority and canonical identity lock', async () => {
  const compiler = await source('scripts/project-art/council-avatar-direction-master-candidates.mjs');
  assert.match(compiler, /continuityPhase:\s*'direction-master'/u);
  assert.match(compiler, /role:\s*'canonical-identity'/u);
  assert.match(compiler, /strength:\s*1/u);
  assert.match(compiler, /required:\s*true/u);
  assert.match(compiler, /providerExecutionAuthorized:\s*false/u);
  assert.match(compiler, /allowFallback:\s*false/u);
  assert.match(compiler, /runtimeActivationAllowed:\s*false/u);
  assert.match(compiler, /websiteActivationAllowed:\s*false/u);
});
