import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAPABILITY_PATH = path.join(
  ROOT,
  'config/eva-talk-neutral-local-materialization-capability-v1.json',
);
const VALIDATION_PATH = path.join(
  ROOT,
  'config/eva-talk-neutral-local-materialization-workstation-validation-v1.json',
);
const SCRIPT_PATH = path.join(
  ROOT,
  'scripts/Invoke-EvaTalkNeutralLocalQueueValidation.ps1',
);

function readOrdinaryText(filePath, label) {
  const stat = fs.lstatSync(filePath);
  assert.ok(stat.isFile(), `${label} must be a file`);
  assert.equal(stat.isSymbolicLink(), false, `${label} must not be a symlink`);
  assert.equal(stat.nlink, 1, `${label} must have one hard link`);
  const source = fs.readFileSync(filePath, 'utf8');
  assert.ok(source.length > 0, `${label} must not be empty`);
  assert.equal(source.charCodeAt(0) === 0xfeff, false, `${label} must not use BOM`);
  assert.equal(source.includes('\r'), false, `${label} must use LF line endings`);
  return source;
}

function readJson(filePath, label) {
  return JSON.parse(readOrdinaryText(filePath, label));
}

function allFalse(record) {
  return Object.values(record).every((value) => value === false);
}

test('workstation validation manifest binds the exact local gate', () => {
  const capability = readJson(CAPABILITY_PATH, 'capability');
  const validation = readJson(VALIDATION_PATH, 'workstation validation');

  assert.equal(
    capability.workstationValidation,
    'config/eva-talk-neutral-local-materialization-workstation-validation-v1.json',
  );
  assert.ok(
    capability.tests.includes(
      'scripts/test-eva-talk-neutral-local-materialization-workstation-validation.mjs',
    ),
  );

  assert.equal(
    validation.schema,
    'evavo.project-art-eva-talk-neutral-local-materialization-workstation-validation.v1',
  );
  assert.equal(validation.protocolVersion, '2026-08-28.2');
  assert.equal(
    validation.status,
    'available-not-executed-by-repository-state',
  );
  assert.equal(
    validation.script,
    'scripts/Invoke-EvaTalkNeutralLocalQueueValidation.ps1',
  );
  assert.deepEqual(validation.command, [
    'pwsh',
    '-NoLogo',
    '-NoProfile',
    '-File',
    'scripts/Invoke-EvaTalkNeutralLocalQueueValidation.ps1',
    '-ExpectedHeadSha',
    '<exact-pr-head-sha>',
  ]);
  assert.deepEqual(validation.requiredEnvironment, {
    operatingSystem: 'windows',
    node: '22.14.0',
    pnpm: '10.13.1',
    cleanWorkingTree: true,
    networkRequiredByQueueChecks: false,
    githubActionsRequired: false,
    vercelRequired: false,
  });
  assert.deepEqual(validation.validation, {
    syntaxChecks: 12,
    staticContractCheck: true,
    focusedNodeTests: true,
    concurrentWorkerClaimRace: true,
    realCliLifecycleExercise: true,
    completeRepositoryPnpmCheck: true,
    gitDiffCheck: true,
    cleanTreeAfterValidation: true,
  });
  assert.deepEqual(validation.expectedQueueEvidence, {
    packetCount: 8,
    imagesPerPacket: 10,
    candidateCount: 80,
    semanticSelectionTargetFrameCount: 36,
    campaignSha256:
      'e6c4c23eac5d5e6074e334599f19da53ca6a56073857dcd9fc6443ab1f065d74',
  });
  assert.equal(allFalse(validation.authority), true);
});

test('PowerShell gate checks exact HEAD, full pnpm validation and clean replay', () => {
  const source = readOrdinaryText(SCRIPT_PATH, 'workstation validation script');

  for (const required of [
    "[ValidatePattern('^[0-9a-f]{40}$')]",
    '$ExpectedHeadSha',
    "& $Git 'rev-parse' 'HEAD'",
    "& $Git 'status' '--porcelain=v1' '--untracked-files=all'",
    "'scripts/check-eva-talk-neutral-local-materialization-queue.mjs'",
    "'scripts/test-eva-talk-neutral-local-materialization-queue.mjs'",
    "'scripts/test-eva-talk-neutral-local-materialization-queue-cli.mjs'",
    "'scripts/test-eva-talk-neutral-local-materialization-workstation-validation.mjs'",
    "'--test'",
    "'scripts/eva-talk-neutral-local-materialization-queue.mjs'",
    "'init'",
    "'claim'",
    "'heartbeat'",
    "'fail'",
    "'status'",
    "Invoke-NativeChecked -FilePath $Pnpm -ArgumentList @('check')",
    "Invoke-NativeChecked -FilePath $Git -ArgumentList @('diff', '--check')",
    "completeLocalPnpmCheck = 'passed'",
    'repositoryCleanAfterValidation = $true',
    'networkAccess = $false',
    'providerExecution = $false',
    'candidateApproval = $false',
    'runtimeActivation = $false',
    'websiteActivation = $false',
    'forcePush = $false',
  ]) {
    assert.ok(source.includes(required), `missing workstation gate token: ${required}`);
  }

  const syntaxTargets = [
    'eva-talk-neutral-local-queue-common.mjs',
    'eva-talk-neutral-local-queue-png.mjs',
    'eva-talk-neutral-local-queue-campaign.mjs',
    'eva-talk-neutral-local-queue-init.mjs',
    'eva-talk-neutral-local-queue-claims.mjs',
    'eva-talk-neutral-local-queue-completion.mjs',
    'eva-talk-neutral-local-materialization-queue.mjs',
    'eva-talk-neutral-local-materialization-queue.mjs',
    'check-eva-talk-neutral-local-materialization-queue.mjs',
    'test-eva-talk-neutral-local-materialization-queue.mjs',
    'test-eva-talk-neutral-local-materialization-queue-cli.mjs',
    'test-eva-talk-neutral-local-materialization-workstation-validation.mjs',
  ];
  assert.equal(
    syntaxTargets.every((target) => source.includes(target)),
    true,
  );

  for (const forbidden of [
    'Invoke-WebRequest',
    'Invoke-RestMethod',
    'Start-Process',
    'git push',
    'git commit',
    'gh workflow',
    'vercel deploy',
    'force-with-lease',
    'Remove-Item $RepoRoot',
  ]) {
    assert.equal(
      source.toLowerCase().includes(forbidden.toLowerCase()),
      false,
      `workstation gate retained forbidden token: ${forbidden}`,
    );
  }
});

test('operator documentation exposes the exact-head local validation command', () => {
  const guide = readOrdinaryText(
    path.join(ROOT, 'docs/EVA_TALK_NEUTRAL_LOCAL_MATERIALIZATION_QUEUE.md'),
    'queue guide',
  );
  const checklist = readOrdinaryText(
    path.join(
      ROOT,
      'docs/eva-talk-neutral-local-materialization-operator-checklist.md',
    ),
    'operator checklist',
  );

  for (const source of [guide, checklist]) {
    assert.ok(source.includes('Invoke-EvaTalkNeutralLocalQueueValidation.ps1'));
    assert.ok(source.includes('ExpectedHeadSha'));
    assert.ok(source.includes('pnpm check'));
  }
});
