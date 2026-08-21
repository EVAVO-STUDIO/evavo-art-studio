import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TESTS = Object.freeze([
  'scripts/test-project-art-council-identity-candidate-campaign.mjs',
  'scripts/test-project-art-council-identity-candidate-campaign-mcp.mjs',
]);
const SOURCES = Object.freeze([
  'config/council-avatar-identities/council-identity-provider-selection.v1.json',
  'scripts/project-art/council-identity-candidate-campaign.mjs',
  'scripts/compile-project-art-council-identity-candidate-campaign.mjs',
  'tools/project_art_council_avatar_production_mcp.mjs',
  ...TESTS,
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sourceFingerprint() {
  const digest = createHash('sha256');
  for (const source of SOURCES) {
    digest.update(source);
    digest.update('\0');
    digest.update(readFileSync(path.join(ROOT, source)));
    digest.update('\0');
  }
  return digest.digest('hex');
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(
    result.status,
    0,
    [
      `${command} ${args.join(' ')} failed with ${String(result.status)}`,
      result.stdout,
      result.stderr,
    ]
      .filter(Boolean)
      .join('\n'),
  );
  return result;
}

test('established media CI proves the exact V4.4 Council identity campaign', () => {
  const before = sourceFingerprint();
  run(process.execPath, ['--test', ...TESTS]);
  const after = sourceFingerprint();
  assert.equal(after, before);

  const summaryResult = run(process.execPath, [
    'scripts/compile-project-art-council-identity-candidate-campaign.mjs',
    'summary',
  ]);
  const summary = JSON.parse(summaryResult.stdout);
  assert.equal(summary.status, 'passed');
  assert.equal(summary.version, '4.4.0');
  assert.equal(summary.characters, 2);
  assert.equal(summary.anchorJobs, 8);
  assert.equal(summary.dependentJobs, 16);
  assert.equal(summary.totalJobs, 24);
  assert.equal(summary.exactAdapterId, 'openai-gpt-image');
  assert.equal(summary.exactModel, 'gpt-image-1');
  assert.equal(summary.providerAdmission, false);
  assert.equal(summary.providerAuthorization, false);
  assert.equal(summary.providerExecution, false);
  assert.equal(summary.identityApproval, false);
  assert.match(summary.campaignSha256, /^[a-f0-9]{64}$/u);

  const selectionBytes = readFileSync(
    path.join(
      ROOT,
      'config/council-avatar-identities/council-identity-provider-selection.v1.json',
    ),
  );
  const selection = JSON.parse(selectionBytes.toString('utf8'));
  assert.deepEqual(selection.allowedAdapterIds, ['openai-gpt-image']);
  assert.equal(selection.allowFallback, false);
  assert.equal(selection.requireSeed, false);
  assert.equal(selection.seed, null);
  assert.match(sha256(selectionBytes), /^[a-f0-9]{64}$/u);
});
