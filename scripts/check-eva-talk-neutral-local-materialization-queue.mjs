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

function readOrdinary(relative) {
  const target = path.join(root, ...relative.split('/'));
  const stat = fs.lstatSync(target);
  assert.ok(
    stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1,
    `${relative} must be one ordinary file`,
  );
  const source = fs.readFileSync(target, 'utf8');
  assert.ok(
    source.length > 0 && !source.includes('\r'),
    `${relative} must be nonempty LF text`,
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
  '- provider, network, approval, publication, Runtime, website, deployment and Git authority remain false',
);
