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
const ATTRIBUTES_PATH = path.join(ROOT, '.gitattributes');
const EXPECTED_CHANGED_FILES = Object.freeze([
  '.gitattributes',
  'config/eva-talk-neutral-local-materialization-campaign-v1.json',
  'config/eva-talk-neutral-local-materialization-capability-v1.json',
  'config/eva-talk-neutral-local-materialization-workstation-validation-v1.json',
  'docs/EVA_TALK_NEUTRAL_LOCAL_MATERIALIZATION_QUEUE.md',
  'docs/eva-talk-neutral-local-materialization-operator-checklist.md',
  'scripts/Invoke-EvaTalkNeutralLocalQueueValidation.ps1',
  'scripts/check-eva-talk-neutral-local-materialization-queue.mjs',
  'scripts/eva-talk-neutral-local-materialization-queue.mjs',
  'scripts/project-art/eva-talk-neutral-local-materialization-queue.mjs',
  'scripts/project-art/eva-talk-neutral-local-queue-campaign.mjs',
  'scripts/project-art/eva-talk-neutral-local-queue-claims.mjs',
  'scripts/project-art/eva-talk-neutral-local-queue-common.mjs',
  'scripts/project-art/eva-talk-neutral-local-queue-completion.mjs',
  'scripts/project-art/eva-talk-neutral-local-queue-init.mjs',
  'scripts/project-art/eva-talk-neutral-local-queue-png.mjs',
  'scripts/test-eva-talk-neutral-local-materialization-queue-cli.mjs',
  'scripts/test-eva-talk-neutral-local-materialization-queue.mjs',
  'scripts/test-eva-talk-neutral-local-materialization-workstation-validation.mjs',
]);

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
  return (
    record &&
    typeof record === 'object' &&
    !Array.isArray(record) &&
    Object.values(record).length > 0 &&
    Object.values(record).every((value) => value === false)
  );
}

test('workstation validation manifest binds exact head and exact main', () => {
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
    '-ExpectedMainSha',
    '<exact-origin-main-sha>',
  ]);
  assert.deepEqual(validation.requiredEnvironment, {
    operatingSystem: 'windows',
    powershell: 'pwsh',
    node: '22.14.0',
    pnpm: '10.13.1',
    repositoryOrigin: 'EVAVO-STUDIO/evavo-art-studio',
    cleanWorkingTree: true,
    originMainPresent: true,
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
    toolchainVersionCheck: true,
    repositoryIdentityCheck: true,
    exactHeadCheck: true,
    exactOriginMainCheck: true,
    mainAncestorOfHeadCheck: true,
    exactChangedFileSetCheck: true,
    diffRangeCheck: true,
    cleanTreeAfterValidation: true,
  });
  assert.deepEqual(validation.expectedChangeEvidence, {
    changedFileCount: EXPECTED_CHANGED_FILES.length,
    changedFiles: EXPECTED_CHANGED_FILES,
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

test('PowerShell gate proves exact repository and toolchain state locally', () => {
  const source = readOrdinaryText(SCRIPT_PATH, 'workstation validation script');

  for (const required of [
    "[ValidatePattern('^[0-9a-f]{40}$')]",
    '$ExpectedHeadSha',
    '$ExpectedMainSha',
    '$IsWindows',
    "$ExpectedRepository = 'EVAVO-STUDIO/evavo-art-studio'",
    "$ExpectedNodeVersion = 'v22.14.0'",
    "$ExpectedPnpmVersion = '10.13.1'",
    "'refs/remotes/origin/main'",
    "'merge-base'",
    "'--is-ancestor'",
    "'rev-list'",
    "'--count'",
    "'--name-only'",
    "'--diff-filter=ACMRD'",
    '$ExpectedChangedFiles',
    'Compare-Object',
    '$DiffRange',
    "'scripts/check-eva-talk-neutral-local-materialization-queue.mjs'",
    "'scripts/test-eva-talk-neutral-local-materialization-queue.mjs'",
    "'scripts/test-eva-talk-neutral-local-materialization-queue-cli.mjs'",
    "'scripts/test-eva-talk-neutral-local-materialization-workstation-validation.mjs'",
    "'scripts/eva-talk-neutral-local-materialization-queue.mjs'",
    "'init'",
    "'claim'",
    "'heartbeat'",
    "'fail'",
    "'status'",
    "Invoke-NativeChecked -FilePath $Pnpm -ArgumentList @(",
    "'check'",
    "'diff'",
    "'--check'",
    "completeLocalPnpmCheck = 'passed'",
    'repositoryCleanAfterValidation = $true',
    'expectedMainSha = $ExpectedMainSha',
    'changedFileCount = $FinalState.changedFiles.Count',
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
  assert.equal(syntaxTargets.every((target) => source.includes(target)), true);

  for (const expectedPath of EXPECTED_CHANGED_FILES) {
    assert.ok(
      source.includes(`'${expectedPath}'`),
      `workstation gate omits expected changed path ${expectedPath}`,
    );
  }

  for (const forbidden of [
    'Invoke-WebRequest',
    'Invoke-RestMethod',
    'Start-Process',
    'git push',
    'git commit',
    'gh workflow',
    'vercel deploy',
    'force-with-lease',
    'fetch origin',
    'Remove-Item $RepoRoot',
  ]) {
    assert.equal(
      source.toLowerCase().includes(forbidden.toLowerCase()),
      false,
      `workstation gate retained forbidden token: ${forbidden}`,
    );
  }
});

test('line-ending policy covers the complete queue validation surface', () => {
  const source = readOrdinaryText(ATTRIBUTES_PATH, '.gitattributes');
  for (const required of [
    'config/eva-talk-neutral-local-materialization-*.json text eol=lf',
    'scripts/project-art/eva-talk-neutral-local-*.mjs text eol=lf',
    'scripts/eva-talk-neutral-local-materialization-queue.mjs text eol=lf',
    'scripts/check-eva-talk-neutral-local-materialization-queue.mjs text eol=lf',
    'scripts/test-eva-talk-neutral-local-materialization-*.mjs text eol=lf',
    'scripts/Invoke-EvaTalkNeutralLocalQueueValidation.ps1 text eol=lf',
    'docs/EVA_TALK_NEUTRAL_LOCAL_MATERIALIZATION_QUEUE.md text eol=lf',
    'docs/eva-talk-neutral-local-materialization-operator-checklist.md text eol=lf',
  ]) {
    assert.ok(source.includes(required), `.gitattributes omits ${required}`);
  }
});

test('operator documentation exposes the exact head and main command', () => {
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
    assert.ok(source.includes('ExpectedMainSha'));
    assert.ok(source.includes('origin/main'));
    assert.ok(source.includes('pnpm check'));
    assert.ok(source.includes('git diff --check'));
  }
});
