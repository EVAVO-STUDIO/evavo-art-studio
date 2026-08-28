#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION,
  evaTalkNeutralLocalQueueCapabilities,
  parseEvaTalkNeutralLocalCampaign,
} from './project-art/eva-talk-neutral-local-materialization-queue.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const capabilityPath = path.join(
  root,
  'config/eva-talk-neutral-local-materialization-capability-v1.json',
);
const campaignPath = path.join(
  root,
  'config/eva-talk-neutral-local-materialization-campaign-v1.json',
);
const workstationValidationPath = path.join(
  root,
  'config/eva-talk-neutral-local-materialization-workstation-validation-v1.json',
);

function readOrdinary(relative) {
  const target = path.join(root, ...relative.split('/'));
  const stat = fs.lstatSync(target);
  assert.ok(
    stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1,
    `${relative} must be one ordinary file`,
  );
  const source = fs.readFileSync(target, 'utf8');
  assert.ok(
    source.length > 0 && !source.includes('\r') && source.charCodeAt(0) !== 0xfeff,
    `${relative} must be nonempty LF text without BOM`,
  );
  return source;
}

const capability = JSON.parse(fs.readFileSync(capabilityPath, 'utf8'));
assert.equal(
  capability.schema,
  'evavo.project-art-eva-talk-neutral-local-materialization-capability.v1',
);
assert.equal(capability.protocolVersion, EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION);
assert.equal(capability.characterId, 'eva-female');
assert.equal(capability.clipId, 'talk-neutral');
assert.equal(
  capability.workstationValidation,
  'config/eva-talk-neutral-local-materialization-workstation-validation-v1.json',
);
assert.deepEqual(capability.queue, {
  batchCount: 8,
  imagesPerBatch: 10,
  candidateCount: 80,
  semanticSelectionTargetFrameCount: 36,
  atomicSameFilesystemClaim: true,
  packetOnlyOrphanRecovery: true,
  workerBoundClaims: true,
  minimumLeaseSeconds: 60,
  maximumLeaseSeconds: 3600,
  heartbeatLeaseExtension: true,
  expiredClaimRequeueRequiresNoWorkerEvidence: true,
  completionReceiptRequired: true,
  failureReceiptRequired: true,
});
assert.deepEqual(capability.outputAdmission, {
  exactOutputsPerClaim: 10,
  mediaType: 'image/png',
  width: 1024,
  height: 1536,
  bitDepth: 8,
  colourType: 6,
  interlace: 0,
  pngSignatureRequired: true,
  chunkCrcRequired: true,
  idatInflateRequired: true,
  scanlineFiltersValidated: true,
  exactByteLengthRequired: true,
  sha256Required: true,
  uniqueOutputBodiesRequired: true,
  manifestPreparedFromClaimOutputs: true,
});
assert.equal(capability.execution.localFilesystemOnly, true);
assert.equal(capability.execution.zeroCost, true);
assert.equal(capability.execution.providerExecutionIncluded, false);
assert.equal(capability.execution.networkAccessIncluded, false);
assert.equal(capability.execution.hostedCiRequired, false);
assert.equal(capability.execution.vercelRequired, false);
assert.ok(Object.values(capability.authority).every((value) => value === false));

const requiredFiles = [
  capability.campaign,
  capability.implementation,
  ...capability.modules,
  capability.cli,
  capability.checker,
  ...capability.tests,
  ...capability.documentation,
  capability.workstationValidation,
  'scripts/Invoke-EvaTalkNeutralLocalQueueValidation.ps1',
];
assert.equal(new Set(requiredFiles).size, requiredFiles.length);
for (const relative of requiredFiles) readOrdinary(relative);

const campaign = parseEvaTalkNeutralLocalCampaign(
  JSON.parse(fs.readFileSync(campaignPath, 'utf8')),
);
assert.equal(campaign.candidateProgram.batchCount, 8);
assert.equal(campaign.candidateProgram.imagesPerBatch, 10);
assert.equal(campaign.candidateProgram.candidateCount, 80);
assert.equal(campaign.candidateProgram.selectionTargetFrameCount, 36);
assert.ok(Object.values(campaign.authority).every((value) => value === false));

const workstationValidation = JSON.parse(
  fs.readFileSync(workstationValidationPath, 'utf8'),
);
assert.equal(
  workstationValidation.schema,
  'evavo.project-art-eva-talk-neutral-local-materialization-workstation-validation.v1',
);
assert.equal(
  workstationValidation.protocolVersion,
  EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION,
);
assert.equal(
  workstationValidation.status,
  'available-not-executed-by-repository-state',
);
assert.equal(
  workstationValidation.script,
  'scripts/Invoke-EvaTalkNeutralLocalQueueValidation.ps1',
);
assert.deepEqual(workstationValidation.command, [
  'pwsh',
  '-NoLogo',
  '-NoProfile',
  '-File',
  'scripts/Invoke-EvaTalkNeutralLocalQueueValidation.ps1',
  '-ExpectedHeadSha',
  '<exact-pr-head-sha>',
]);
assert.deepEqual(workstationValidation.requiredEnvironment, {
  operatingSystem: 'windows',
  node: '22.14.0',
  pnpm: '10.13.1',
  cleanWorkingTree: true,
  networkRequiredByQueueChecks: false,
  githubActionsRequired: false,
  vercelRequired: false,
});
assert.deepEqual(workstationValidation.validation, {
  syntaxChecks: 12,
  staticContractCheck: true,
  focusedNodeTests: true,
  concurrentWorkerClaimRace: true,
  realCliLifecycleExercise: true,
  completeRepositoryPnpmCheck: true,
  gitDiffCheck: true,
  cleanTreeAfterValidation: true,
});
assert.deepEqual(workstationValidation.expectedQueueEvidence, {
  packetCount: 8,
  imagesPerPacket: 10,
  candidateCount: 80,
  semanticSelectionTargetFrameCount: 36,
  campaignSha256:
    'e6c4c23eac5d5e6074e334599f19da53ca6a56073857dcd9fc6443ab1f065d74',
});
assert.ok(
  Object.values(workstationValidation.authority).every(
    (value) => value === false,
  ),
);

const workstationScript = readOrdinary(
  'scripts/Invoke-EvaTalkNeutralLocalQueueValidation.ps1',
);
for (const required of [
  '$ExpectedHeadSha',
  "& $Git 'rev-parse' 'HEAD'",
  "@('check')",
  "@('diff', '--check')",
  "'scripts/check-eva-talk-neutral-local-materialization-queue.mjs'",
  "'scripts/test-eva-talk-neutral-local-materialization-workstation-validation.mjs'",
  'repositoryCleanAfterValidation = $true',
]) {
  assert.ok(
    workstationScript.includes(required),
    `workstation script is missing ${required}`,
  );
}
for (const forbidden of [
  'Invoke-WebRequest',
  'Invoke-RestMethod',
  'git push',
  'git commit',
  'gh workflow',
  'vercel deploy',
  'force-with-lease',
]) {
  assert.equal(
    workstationScript.toLowerCase().includes(forbidden.toLowerCase()),
    false,
    `workstation script retained forbidden token ${forbidden}`,
  );
}

const runtimeCapabilities = evaTalkNeutralLocalQueueCapabilities();
assert.equal(runtimeCapabilities.protocolVersion, capability.protocolVersion);
assert.equal(runtimeCapabilities.exactBatchCount, capability.queue.batchCount);
assert.equal(
  runtimeCapabilities.exactImagesPerBatch,
  capability.queue.imagesPerBatch,
);
assert.equal(
  runtimeCapabilities.exactCandidateCount,
  capability.queue.candidateCount,
);
assert.equal(
  runtimeCapabilities.minimumLeaseSeconds,
  capability.queue.minimumLeaseSeconds,
);
assert.equal(
  runtimeCapabilities.maximumLeaseSeconds,
  capability.queue.maximumLeaseSeconds,
);
assert.equal(runtimeCapabilities.networkAccess, false);
assert.equal(runtimeCapabilities.providerExecution, false);
assert.equal(runtimeCapabilities.candidateApproval, false);
assert.equal(runtimeCapabilities.runtimeActivation, false);
assert.equal(runtimeCapabilities.gitMutation, false);

const executableFiles = [
  capability.implementation,
  ...capability.modules,
  capability.cli,
];
for (const relative of executableFiles) {
  const source = readOrdinary(relative);
  for (const forbidden of [
    "from 'node:http'",
    "from 'node:https'",
    "from 'node:child_process'",
    'fetch(',
    'https://',
    'process.env.',
    'git push',
    'forcePush: true',
    'providerExecution: true',
    'runtimeActivation: true',
  ]) {
    assert.ok(
      !source.includes(forbidden),
      `${relative} retained forbidden token ${forbidden}`,
    );
  }
}

const campaignRegression = structuredClone(campaign);
campaignRegression.campaignSha256 = '0'.repeat(64);
assert.throws(
  () => parseEvaTalkNeutralLocalCampaign(campaignRegression),
  /EVA_TALK_NEUTRAL_QUEUE_CAMPAIGN_HASH_INVALID/u,
);

console.log('EVA talk-neutral local materialization queue check passed.');
console.log(
  '- eight immutable ten-image packets are hash-bound to one 80-candidate campaign',
);
console.log(
  '- local atomic claims, bounded leases, heartbeats, orphan recovery and fail-closed requeue are present',
);
console.log(
  '- completion requires ten exact unique 1024x1536 RGBA PNG bodies and a deterministic output manifest',
);
console.log(
  '- exact-head Windows validation runs focused checks, complete pnpm check, diff check and clean-tree verification',
);
console.log(
  '- provider, network, approval, publication, Runtime, website, deployment and Git authority remain false',
);
