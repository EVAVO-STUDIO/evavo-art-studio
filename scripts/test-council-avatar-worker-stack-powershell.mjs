import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const STACK = new URL('./Test-CouncilAvatarWorkerStack.ps1', import.meta.url);

async function source() {
  return readFile(STACK, 'utf8');
}

test('Council worker stack delegates provider verification to the version-aware audit', async () => {
  const text = await source();
  assert.match(text, /Test-CouncilAvatarProviderPipeline\.ps1/u);
  assert.match(text, /council-provider-pipeline-version-aware-audit/u);
  assert.match(text, /evavo\.council-avatar-worker-stack-check\.v2/u);
});

test('Council worker stack no longer pins obsolete runtime or website provenance', async () => {
  const text = await source();
  assert.doesNotMatch(text, /0\.38\.0/u);
  assert.doesNotMatch(text, /90068367db9144b909bc861f91887ea5f0010842/u);
  assert.doesNotMatch(text, /runtime-package-version-038/u);
  assert.match(text, /runtime-package-version-floor-041/u);
});

test('Council worker stack keeps provider and activation authority explicit and false', async () => {
  const text = await source();
  assert.match(text, /providerExecutionAutomaticallyAuthorized = \$false/u);
  assert.match(text, /candidateApprovalAutomaticallyAuthorized = \$false/u);
  assert.match(text, /candidatePromotionAutomaticallyAuthorized = \$false/u);
  assert.match(text, /runtimeActivationAutomaticallyAuthorized = \$false/u);
  assert.match(text, /websiteActivationAutomaticallyAuthorized = \$false/u);
});
