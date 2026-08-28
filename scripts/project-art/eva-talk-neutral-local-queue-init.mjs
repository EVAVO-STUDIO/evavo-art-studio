import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

import {
  EVA_TALK_NEUTRAL_LOCAL_BATCH_COUNT,
  EVA_TALK_NEUTRAL_LOCAL_CANDIDATE_COUNT,
  EVA_TALK_NEUTRAL_LOCAL_IMAGES_PER_BATCH,
  EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION,
  EVA_TALK_NEUTRAL_LOCAL_QUEUE_MANIFEST_SCHEMA,
  QUEUE_DIRECTORIES,
  SHA256,
  assert,
  assertClosedAuthority,
  closedAuthority,
  createQueueRoot,
  deepFreeze,
  directoryChildDirectories,
  directoryEntries,
  ensureDirectoryChain,
  exactKeys,
  removeFileIfPresent,
  resolveInside,
  sha256EvaTalkNeutralLocalQueueDocument,
  snapshot,
  stableJson,
  timestamp,
  writeJsonCreateOnly,
} from './eva-talk-neutral-local-queue-common.mjs';
import {
  compileEvaTalkNeutralLocalPackets,
  parseEvaTalkNeutralLocalCampaign,
  verifyEvaTalkNeutralLocalPacket,
} from './eva-talk-neutral-local-queue-campaign.mjs';

export function loadQueueManifest(queueRoot) {
  const input = stableJson(
    path.join(queueRoot, 'queue-manifest.json'),
    'queue manifest',
  );
  const value = snapshot(input.value, 'queue manifest');
  exactKeys(
    value,
    [
      'schema',
      'protocolVersion',
      'campaignId',
      'campaignSha256',
      'initializedAt',
      'jobCount',
      'imagesPerJob',
      'candidateCount',
      'jobs',
      'authority',
      'queueManifestSha256',
    ],
    'EVA_TALK_NEUTRAL_QUEUE_MANIFEST_INVALID',
  );
  assert(
    value.schema === EVA_TALK_NEUTRAL_LOCAL_QUEUE_MANIFEST_SCHEMA &&
      value.protocolVersion === EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION &&
      value.jobCount === EVA_TALK_NEUTRAL_LOCAL_BATCH_COUNT &&
      value.imagesPerJob === EVA_TALK_NEUTRAL_LOCAL_IMAGES_PER_BATCH &&
      value.candidateCount === EVA_TALK_NEUTRAL_LOCAL_CANDIDATE_COUNT &&
      Array.isArray(value.jobs) &&
      value.jobs.length === EVA_TALK_NEUTRAL_LOCAL_BATCH_COUNT,
    'EVA_TALK_NEUTRAL_QUEUE_MANIFEST_INVALID',
  );
  timestamp(value.initializedAt, 'initializedAt');
  assert(
    typeof value.campaignSha256 === 'string' &&
      SHA256.test(value.campaignSha256),
    'EVA_TALK_NEUTRAL_QUEUE_MANIFEST_INVALID',
  );
  const jobIds = new Set();
  const packetHashes = new Set();
  for (const [index, job] of value.jobs.entries()) {
    exactKeys(
      job,
      ['jobId', 'packetSha256'],
      'EVA_TALK_NEUTRAL_QUEUE_MANIFEST_JOB_INVALID',
    );
    const ordinal = index + 1;
    assert(
      job.jobId ===
        `eva-talk-neutral-batch-${String(ordinal).padStart(2, '0')}` &&
        typeof job.packetSha256 === 'string' &&
        SHA256.test(job.packetSha256),
      'EVA_TALK_NEUTRAL_QUEUE_MANIFEST_JOB_INVALID',
    );
    jobIds.add(job.jobId);
    packetHashes.add(job.packetSha256);
  }
  assert(
    jobIds.size === EVA_TALK_NEUTRAL_LOCAL_BATCH_COUNT &&
      packetHashes.size === EVA_TALK_NEUTRAL_LOCAL_BATCH_COUNT,
    'EVA_TALK_NEUTRAL_QUEUE_MANIFEST_JOB_INVALID',
  );
  assertClosedAuthority(value.authority);
  const body = { ...value };
  delete body.queueManifestSha256;
  assert(
    value.queueManifestSha256 === sha256EvaTalkNeutralLocalQueueDocument(body),
    'EVA_TALK_NEUTRAL_QUEUE_MANIFEST_HASH_INVALID',
  );
  return deepFreeze(value);
}

export function readPacketFromDirectory(directory, campaign = null) {
  const input = stableJson(path.join(directory, 'packet.json'), 'packet');
  return verifyEvaTalkNeutralLocalPacket(input.value, campaign);
}

export function loadStoredCampaign(queueRoot) {
  return parseEvaTalkNeutralLocalCampaign(
    stableJson(path.join(queueRoot, 'campaign.json'), 'stored campaign').value,
  );
}

function lifecycleCounts(queueRoot) {
  return Object.freeze({
    pending: directoryChildDirectories(path.join(queueRoot, 'pending')).length,
    claimed: directoryChildDirectories(path.join(queueRoot, 'claimed')).length,
    completed: directoryChildDirectories(path.join(queueRoot, 'completed')).length,
    failed: directoryChildDirectories(path.join(queueRoot, 'failed')).length,
  });
}

export function initializeEvaTalkNeutralLocalQueue({
  queueRoot: queueRootInput,
  campaign: campaignInput,
  initializedAt: initializedAtInput,
}) {
  const queueRoot = createQueueRoot(queueRootInput);
  const campaign = parseEvaTalkNeutralLocalCampaign(campaignInput);
  const initializedAt = timestamp(initializedAtInput, 'initializedAt');
  assert(
    Date.parse(initializedAt) >= Date.parse(campaign.createdAt),
    'EVA_TALK_NEUTRAL_QUEUE_CHRONOLOGY_INVALID',
  );
  const campaignPath = path.join(queueRoot, 'campaign.json');
  const manifestPath = path.join(queueRoot, 'queue-manifest.json');

  if (existsSync(manifestPath)) {
    const manifest = loadQueueManifest(queueRoot);
    const storedCampaign = loadStoredCampaign(queueRoot);
    assert(
      storedCampaign.campaignSha256 === campaign.campaignSha256 &&
        manifest.campaignSha256 === campaign.campaignSha256,
      'EVA_TALK_NEUTRAL_QUEUE_ALREADY_INITIALIZED_DIFFERENT_CAMPAIGN',
    );
    for (const relative of QUEUE_DIRECTORIES) {
      const directory = resolveInside(queueRoot, relative, 'queue directory');
      assert(
        existsSync(directory),
        'EVA_TALK_NEUTRAL_QUEUE_DIRECTORY_MISSING',
      );
    }
    return deepFreeze({
      status: 'already-initialized',
      queueRoot,
      campaignSha256: campaign.campaignSha256,
      queueManifestSha256: manifest.queueManifestSha256,
      counts: lifecycleCounts(queueRoot),
    });
  }

  assert(
    directoryEntries(queueRoot).length === 0,
    'EVA_TALK_NEUTRAL_QUEUE_ROOT_NOT_EMPTY',
  );
  for (const relative of QUEUE_DIRECTORIES) {
    ensureDirectoryChain(queueRoot, relative);
  }
  writeJsonCreateOnly(campaignPath, campaign);
  const packets = compileEvaTalkNeutralLocalPackets(campaign);
  const createdJobDirectories = [];
  try {
    for (const packet of packets) {
      const jobDirectory = path.join(queueRoot, 'pending', packet.jobId);
      mkdirSync(jobDirectory, { mode: 0o700 });
      createdJobDirectories.push(jobDirectory);
      writeJsonCreateOnly(path.join(jobDirectory, 'packet.json'), packet);
    }
    const body = {
      schema: EVA_TALK_NEUTRAL_LOCAL_QUEUE_MANIFEST_SCHEMA,
      protocolVersion: EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION,
      campaignId: campaign.campaignId,
      campaignSha256: campaign.campaignSha256,
      initializedAt,
      jobCount: packets.length,
      imagesPerJob: EVA_TALK_NEUTRAL_LOCAL_IMAGES_PER_BATCH,
      candidateCount: EVA_TALK_NEUTRAL_LOCAL_CANDIDATE_COUNT,
      jobs: Object.freeze(
        packets.map((packet) =>
          Object.freeze({
            jobId: packet.jobId,
            packetSha256: packet.packetSha256,
          }),
        ),
      ),
      authority: closedAuthority(),
    };
    const manifest = deepFreeze({
      ...body,
      queueManifestSha256: sha256EvaTalkNeutralLocalQueueDocument(body),
    });
    writeJsonCreateOnly(manifestPath, manifest);
    return deepFreeze({
      status: 'initialized',
      queueRoot,
      campaignSha256: campaign.campaignSha256,
      queueManifestSha256: manifest.queueManifestSha256,
      counts: lifecycleCounts(queueRoot),
    });
  } catch (error) {
    for (const directory of createdJobDirectories.reverse()) {
      rmSync(directory, { recursive: true, force: true });
    }
    removeFileIfPresent(campaignPath);
    removeFileIfPresent(manifestPath);
    for (const relative of [...QUEUE_DIRECTORIES].reverse()) {
      const directory = resolveInside(queueRoot, relative, 'queue directory');
      try {
        if (
          existsSync(directory) &&
          directoryEntries(directory).length === 0
        ) {
          rmSync(directory);
        }
      } catch {
        // Retain evidence if rollback cannot remove an empty directory cleanly.
      }
    }
    throw error;
  }
}

export function verifyQueuePacketSet(queueRoot) {
  const campaign = loadStoredCampaign(queueRoot);
  const manifest = loadQueueManifest(queueRoot);
  const expected = new Map(
    manifest.jobs.map((job) => [job.jobId, job.packetSha256]),
  );
  const observed = [];
  for (const lifecycle of ['pending', 'claimed', 'completed', 'failed']) {
    const lifecycleRoot = path.join(queueRoot, lifecycle);
    for (const directoryName of directoryChildDirectories(lifecycleRoot)) {
      const directory = path.join(lifecycleRoot, directoryName);
      const packet = readPacketFromDirectory(directory, campaign);
      assert(
        expected.get(packet.jobId) === packet.packetSha256,
        'EVA_TALK_NEUTRAL_QUEUE_PACKET_MANIFEST_MISMATCH',
      );
      observed.push(
        Object.freeze({
          lifecycle,
          directoryName,
          jobId: packet.jobId,
          packetSha256: packet.packetSha256,
        }),
      );
    }
  }
  const uniqueJobs = new Set(observed.map((item) => item.jobId));
  assert(
    observed.length === EVA_TALK_NEUTRAL_LOCAL_BATCH_COUNT &&
      uniqueJobs.size === EVA_TALK_NEUTRAL_LOCAL_BATCH_COUNT,
    'EVA_TALK_NEUTRAL_QUEUE_JOB_LIFECYCLE_INVALID',
  );
  return deepFreeze({
    campaign,
    manifest,
    packetCount: observed.length,
    candidateCount:
      observed.length * EVA_TALK_NEUTRAL_LOCAL_IMAGES_PER_BATCH,
    observed: Object.freeze(observed),
  });
}
