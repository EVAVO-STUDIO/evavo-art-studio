import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const AUDIT_PATH = new URL('./Test-CouncilAvatarProviderPipeline.ps1', import.meta.url);

async function source() {
  return readFile(AUDIT_PATH, 'utf8');
}

test('Council avatar provider PowerShell audit uses valid PowerShell branch syntax', async () => {
  const text = await source();
  assert.doesNotMatch(text, /(^|\s)elif\s*\(/mu);
  assert.match(text, /elseif \(-not \$SkipTests\)/u);
});

test('Council avatar provider PowerShell audit resolves runtime provenance dynamically', async () => {
  const text = await source();
  assert.match(text, /Read-WebsiteProvenance/u);
  assert.match(text, /website-runtime-version-matches-package/u);
  assert.match(text, /website-runtime-provenance-commit-reachable/u);
  assert.match(text, /runtime-version-floor-041/u);
  assert.doesNotMatch(text, /runtime-package-version-038/u);
  assert.doesNotMatch(text, /packageVersion:\s*\\?"0\.38\.0/u);
});

test('Council avatar provider PowerShell audit keeps provider readiness zero-spend', async () => {
  const text = await source();
  assert.match(text, /inspect-project-art-council-avatar-provider-readiness\.mjs/u);
  assert.match(text, /zeroSpendInspection/u);
  assert.match(text, /remoteProviderCallPerformed/u);
  assert.match(text, /paidProviderCallPerformed = \$false/u);
  assert.doesNotMatch(text, /execute-project-art-council-avatar-provider\.mjs[^'\r\n]*&/u);
  assert.doesNotMatch(text, /execute-project-art-council-avatar-direction-masters\.mjs[^'\r\n]*&/u);
});

test('Council avatar provider PowerShell audit builds all provider runtime dependencies with pnpm filters before tests', async () => {
  const text = await source();
  const buildBlock = text.match(/\$Build = Invoke-NativeChecked[\s\S]*?\) \$Art/u)?.[0] ?? '';
  for (const packageName of [
    '@evavo/art-artifacts',
    '@evavo/art-providers',
    '@evavo/art-runtime',
    '@evavo/art-studio-worker',
  ]) {
    assert.ok(buildBlock.includes(packageName), `missing build filter ${packageName}`);
  }
  assert.match(buildBlock, /'build'/u);
  assert.match(text, /test-project-art-council-avatar-provider-runtime\.mjs/u);
  assert.match(text, /test-project-art-council-avatar-provider-authorization\.mjs/u);
  assert.match(text, /test-project-art-council-avatar-review-handoff\.mjs/u);
  assert.match(text, /council-avatar-provider-authorization\.test\.mjs/u);
});

test('Council avatar provider PowerShell audit covers the complete direction-master path but grants no animation authority', async () => {
  const text = await source();
  for (const marker of [
    'council-avatar-direction-master-runtime.mjs',
    'council-avatar-direction-master-readiness.mjs',
    'council-avatar-direction-master-authorization.mjs',
    'council-avatar-direction-master-executor.mjs',
    'council-avatar-direction-master-review-handoff.mjs',
    'council-avatar-direction-master-approval.mjs',
    'test-project-art-council-avatar-direction-master-executor.mjs',
    'test-project-art-council-avatar-direction-master-review-handoff.mjs',
    'test-project-art-council-avatar-direction-master-approval.mjs',
  ]) {
    assert.ok(text.includes(marker), `missing direction pipeline marker ${marker}`);
  }
  assert.match(text, /contract = 'evavo\.council-avatar-provider-pipeline-check\.v3'/u);
  assert.match(text, /animationProductionAuthorized = \$false/u);
  assert.match(text, /runtimeActivationPerformed = \$false/u);
  assert.match(text, /websiteActivationPerformed = \$false/u);
});
