#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(here), '..');
const fail = (condition, message) => {
  if (!condition) throw new Error(message);
};
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const json = (relative) => JSON.parse(read(relative));
const sha40 = (value) => /^[a-f0-9]{40}$/u.test(String(value));
const semver = (value) =>
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(String(value));
const same = (actual, expected) =>
  JSON.stringify(actual) === JSON.stringify(expected);

export function validateTask(
  task,
  scriptSource,
  v5Client,
  preflightSource = '',
  materializationSource = '',
) {
  fail(
    task.schemaVersion === 1 &&
      task.kind === 'evavo-eva-dense-motion-workstation-task',
    'EVA workstation task identity drifted.',
  );
  fail(
    task.taskId === 'eva-dense-motion-validate-v1',
    'EVA workstation task ID drifted.',
  );
  fail(
    task.repository === 'EVAVO-STUDIO/evavo-art-studio',
    'EVA workstation repository drifted.',
  );
  fail(
    task.scriptPath === 'scripts/Invoke-EvaDenseMotionWorkstationValidation.ps1',
    'EVA workstation script path drifted.',
  );
  fail(
    task.sourceRepository === 'EVAVO-STUDIO/evavo-avatar-runtime',
    'EVA source repository drifted.',
  );
  fail(
    task.sourcePreflightScript ===
      'scripts/project-art/eva-dense-motion-source-preflight.mjs',
    'EVA source preflight path drifted.',
  );
  fail(
    task.denseMotionFamily === 'eva-20260809-153620',
    'EVA dense-motion family drifted.',
  );
  fail(
    same(task.pendingOrdinals, [1, 2, 3, 7, 8, 9, 10]),
    'EVA legacy pending ordinals drifted.',
  );

  const sourceMaterialization = task.sourceMaterialization;
  fail(
    sourceMaterialization?.planSchema ===
      'evavo.project-art-eva-dense-motion-source-materialization-plan.v1' &&
      sourceMaterialization.campaignReceiptSchema ===
        'evavo.project-art-eva-dense-motion-source-materialization-campaign-receipt.v1',
    'EVA source materialization schema drifted.',
  );
  fail(
    sourceMaterialization.preflightScript ===
      'scripts/project-art/eva-dense-motion-source-preflight.mjs' &&
      sourceMaterialization.campaignScript ===
        'scripts/run-project-art-eva-dense-motion-source-materialization.mjs',
    'EVA source materialization surface drifted.',
  );
  fail(
    same(sourceMaterialization.requiredOrdinals, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) &&
      sourceMaterialization.requiredSourceFrameCount === 10,
    'EVA source materialization coverage drifted.',
  );
  fail(
    sourceMaterialization.allTenSourcesPreflightBeforeFirstWrite === true &&
      sourceMaterialization.byteForByteWorkspaceCopy === true &&
      sourceMaterialization.completedFrameBoundaryResumeSupported === true &&
      sourceMaterialization.midFramePartialStateRejected === true,
    'EVA source materialization safety policy weakened.',
  );
  fail(
    sourceMaterialization.candidateCreationAllowed === false &&
      sourceMaterialization.executionByValidationTask === false,
    'EVA source materialization authority widened.',
  );

  const tenMaster = task.tenMasterPlanning;
  fail(
    tenMaster?.schema === 'evavo.project-art-eva-dense-motion-ten-master-program.v2',
    'EVA ten-master planning schema drifted.',
  );
  fail(
    tenMaster.compilerScript ===
      'scripts/compile-project-art-eva-dense-motion-ten-master.mjs',
    'EVA ten-master compiler path drifted.',
  );
  fail(
    same(tenMaster.requiredFinalOrdinals, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) &&
      tenMaster.requiredNewMasterCount === 10,
    'EVA ten-master final coverage drifted.',
  );
  fail(
    same(tenMaster.currentFallbackOrdinals, [4, 5, 6]) &&
      same(tenMaster.fallbackRemasterOrdinals, [4, 5, 6]),
    'EVA fallback remaster coverage drifted.',
  );
  fail(
    tenMaster.legacyFallbackMaySatisfyFinalMasterGate === false &&
      tenMaster.atomicTenMasterActivationRequired === true &&
      tenMaster.executionByThisTask === false,
    'EVA ten-master planning authority widened.',
  );

  fail(
    semver(task.minimumLocalStorageVersion) &&
      task.minimumLocalStorageVersion === '0.48.9',
    'EVA worker requires Local Storage 0.48.9.',
  );
  const worker = task.worker;
  fail(
    worker.target === 'pool' &&
      worker.poolId === 'windows-local' &&
      worker.fallbackNodeId === 'windows-primary',
    'EVA worker routing drifted.',
  );
  for (const capability of [
    'filesystem',
    'powershell',
    'node',
    'git',
    'art-pipeline-validation',
  ]) {
    fail(
      worker.requiredCapabilities.includes(capability),
      `EVA worker capability missing: ${capability}.`,
    );
  }
  fail(
    worker.physicalAcceptanceRequired === true,
    'Physical Windows acceptance is required.',
  );
  fail(
    worker.plannerAction === 'storage.repository_task_plan' &&
      worker.executionAction === 'storage.repository_task_run',
    'Two-stage repository actions drifted.',
  );
  fail(worker.plannerReceiptRequired === true, 'Planner receipt is required.');
  for (const [key, value] of Object.entries(worker.plannerMeasurements)) {
    fail(value === true, `Planner measurement weakened: ${key}.`);
  }
  fail(
    worker.timeoutSeconds === 900 && worker.maximumOutputBytes === 1048576,
    'Worker bounds drifted.',
  );
  fail(
    worker.maximumAttempts === 3 && worker.transientRetriesOnly === true,
    'Retry policy drifted.',
  );
  for (const [key, value] of Object.entries(task.authority)) {
    fail(value === false, `EVA worker authority widened: ${key}.`);
  }
  fail(
    task.publication.operatorRepository ===
      'EVAVO-STUDIO/evavo-development-studio',
    'Development Studio publication owner drifted.',
  );
  fail(
    task.publication.operator === 'scripts/mainline-publish.mjs',
    'Development Studio publisher drifted.',
  );
  for (const key of [
    'workerReceiptIsPublicationEvidence',
    'plannerReceiptIsPublicationEvidence',
    'physicalAcceptanceReceiptIsPublicationEvidence',
  ]) {
    fail(
      task.publication[key] === false,
      `Publication evidence boundary widened: ${key}.`,
    );
  }

  fail(
    v5Client.contractVersion === 5 && v5Client.client === 'evavo-art-studio',
    'Art Studio v5 runtime-truth client is unavailable.',
  );
  fail(
    v5Client.minimumLocalStorageVersion === task.minimumLocalStorageVersion,
    'EVA worker Local Storage floor differs from Art Studio v5.',
  );
  fail(
    v5Client.execution.repositoryTaskPlanAction === worker.plannerAction,
    'Planner action differs from Art Studio v5.',
  );
  fail(
    v5Client.execution.repositoryTaskExecuteAction === worker.executionAction,
    'Execution action differs from Art Studio v5.',
  );
  fail(
    v5Client.execution.plannerReceiptRequiredForUnmeasuredRepositoryTask === true,
    'Art Studio v5 planner requirement was weakened.',
  );
  fail(
    sha40(v5Client.reviewedLocalStorageMain) &&
      sha40(v5Client.reviewedDevelopmentStudioMain),
    'Art Studio v5 reviewed main SHAs are invalid.',
  );

  const requiredMarkers = [
    'Set-StrictMode -Version Latest',
    "$ErrorActionPreference = 'Stop'",
    '$global:LASTEXITCODE = 0',
    "& $Git 'rev-parse' 'HEAD'",
    "& $Git 'status' '--porcelain=v1' '--untracked-files=all'",
    'evavo-avatar-runtime',
    'scripts/project-art/eva-dense-motion-source-preflight.mjs',
    'scripts/project-art/eva-dense-motion-source-materialization.mjs',
    'scripts/run-project-art-eva-dense-motion-source-materialization.mjs',
    "sourceMediaPreflight = 'passed'",
    "sourceMaterializationContract = 'passed'",
    "sourceMaterializationPlan = 'passed'",
    'scripts/check-project-art-eva-dense-motion-work-order.mjs',
    'scripts/check-art-studio-workstation-v5-contract.mjs',
    'scripts/test-art-studio-workstation-v5-contract.mjs',
    'sourceFrameCount -ne 10',
    "status -ne 'ready-for-ten-source-frame-materialization'",
    'sourceMaterialization = [ordered]@{',
    'requiredSourceFrameCount = 10',
    'allTenSourcesPreflightBeforeFirstWrite = $true',
    'byteForByteWorkspaceCopy = $true',
    'executionByValidationTask = $false',
    'tenMasterPlanning = [ordered]@{',
    "compilerScript = 'scripts/compile-project-art-eva-dense-motion-ten-master.mjs'",
    'requiredNewMasterCount = 10',
    'fallbackRemasterOrdinals = @(4, 5, 6)',
    'atomicTenMasterActivationRequired = $true',
    'executionByThisTask = $false',
    'sourceCopyWrite = $false',
    'candidateCreation = $false',
    'providerExecution = $false',
    'cloudinaryUpload = $false',
    'repositoryCommit = $false',
    'repositoryPush = $false',
    'publication = $false',
    'runtimeActivation = $false',
    'forcePush = $false',
  ];
  for (const marker of requiredMarkers) {
    fail(scriptSource.includes(marker), `Tracked PowerShell task is missing: ${marker}`);
  }

  for (const marker of [
    'EVA_DENSE_MOTION_SOURCE_PREFLIGHT_SCHEMA',
    'EVA_DENSE_MOTION_SOURCE_ORDINALS',
    'gitBlobSha1',
    'inspectPngHeader',
    'readStableContainedSource',
    'EVA_DENSE_SOURCE_GIT_BLOB_MISMATCH',
    'allTenSourcesVerifiedBeforeMaterialization: true',
    'sourceMutation: false',
    'candidateCreation: false',
    'providerExecution: false',
    'runtimeActivation: false',
  ]) {
    fail(preflightSource.includes(marker), `Source preflight is missing: ${marker}`);
  }

  for (const marker of [
    'EVA_DENSE_MOTION_SOURCE_MATERIALIZATION_PLAN_SCHEMA',
    'allTenSourcesPreflightBeforeFirstWrite: true',
    'byteForByteCopy: true',
    'completedFrameBoundaryResumeSupported: true',
    'midFramePartialStateRejected: true',
    'completedCampaignReplayReverifiesSourceBytes: true',
    'EVA_DENSE_SOURCE_MATERIALIZATION_PARTIAL_FRAME_QUARANTINED',
    'gitBlobSha1(sourceFile.bytes)',
    'candidateCreation: false',
    'alphaMastering: false',
    'cloudinaryUpload: false',
    'runtimeActivation: false',
  ]) {
    fail(
      materializationSource.includes(marker),
      `Source materialization is missing: ${marker}`,
    );
  }

  const lower = scriptSource.toLowerCase();
  for (const token of [
    'Invoke-Expression',
    '-EncodedCommand',
    'git push',
    'git commit',
    'git reset --hard',
    'git clean',
    'Remove-Item',
    'cloudinary upload',
    'candidatePromotion = $true',
    'candidateCreation = $true',
    'providerExecution = $true',
    'runtimeActivation = $true',
    'executionByValidationTask = $true',
    'executionByThisTask = $true',
  ]) {
    fail(
      !lower.includes(token.toLowerCase()),
      `Tracked PowerShell task contains forbidden material: ${token}`,
    );
  }

  return Object.freeze({
    schema: 'evavo.eva-dense-motion-workstation-task-check.v3',
    ok: true,
    family: task.denseMotionFamily,
    pendingOrdinalCount: task.pendingOrdinals.length,
    sourceFrameCount: sourceMaterialization.requiredSourceFrameCount,
    sourcePreflightRequired: true,
    sourceMaterializationPlanningAvailable: true,
    sourceMaterializationExecutionByValidationTask: false,
    tenMasterPlanningAvailable: true,
    requiredNewMasterCount: tenMaster.requiredNewMasterCount,
    fallbackRemasterCount: tenMaster.fallbackRemasterOrdinals.length,
    tenMasterExecutionByTask: false,
    plannerBound: true,
    physicalAcceptanceRequired: true,
    minimumLocalStorageVersion: task.minimumLocalStorageVersion,
    repositoryWriteAuthority: false,
    publicationAuthority: false,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(here)) {
  const task = json('config/eva-dense-motion-workstation-task-v1.json');
  const script = read('scripts/Invoke-EvaDenseMotionWorkstationValidation.ps1');
  const v5 = json('config/automation-fabric-client-v5.json');
  const preflight = read(
    'scripts/project-art/eva-dense-motion-source-preflight.mjs',
  );
  const materialization = read(
    'scripts/project-art/eva-dense-motion-source-materialization.mjs',
  );
  console.log(
    JSON.stringify(validateTask(task, script, v5, preflight, materialization)),
  );
}
