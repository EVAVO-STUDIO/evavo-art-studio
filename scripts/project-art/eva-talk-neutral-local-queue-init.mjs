import {
  existsSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';

import {
  EVA_TALK_NEUTRAL_LOCAL_BATCH_COUNT,
  EVA_TALK_NEUTRAL_LOCAL_CANDIDATE_COUNT,
  EVA_TALK_NEUTRAL_LOCAL_IMAGES_PER_BATCH,
  EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION,
  EVA_TALK_NEUTRAL_LOCAL_QUEUE_MANIFEST_SCHEMA,
  QUEUE_DIRECTORIES,
  assert,
  assertClosedAuthority,
  canonicalEvaTalkNeutralLocalQueueJson,
  closedAuthority,
  createQueueRoot,
  deepFreeze,
  directoryEntries,
  exactKeys,
  removeFileIfPresent,
  resolveInside,
  sha256EvaTalkNeutralLocalQueueDocument,
  snapshot,
  stableJson,
  timestamp,
  writeJsonCreateOnly,
  ensureDirectoryChain,
} from './eva-talk-neutral-local-queue-common.mjs';
import {
  compileEvaTalkNeutralLocalPackets,
  parseEvaTalkNeutralLocalCampaign,
  verifyEvaTalkNeutralLocalPacket,
} from './eva-talk-neutral-local-queue-campaign.mjs';

export function loadQueueManifest(queueRoot) {
  const input = stableJson(path.join(queueRoot, 'queue-manifest.json'), 'queue manifest');
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
    const storedCampaign = parseEvaTalkNeutralLocalCampaign(
      stableJson(campaignPath, 'stored campaign').value,
    );
    assert(
      storedCampaign.campaignSha256 === campaign.campaignSha256 &&
        manifest.campaignSha256 === campaign.campaignSha256,
      'EVA_TALK_NEUTRAL_QUEUE_ALREADY_INITIALIZED_DIFFERENT_CAMPAIGN',
    );
    return deepFreeze({
      status: 'already-initialized',
      queueRoot,
      campaignSha256: campaign.campaignSha256,
      queueManifestSha256: manifest.queueManifestSha256,
      pendingCount: directoryEntries(path.join(queueRoot, 'pending')).length,
    });
  }

  assert(
    directoryEntries(queueRoot).length === 0,
    'EVA_TALK_NEUTRAL_QUEUE_ROOT_NOT_EMPTY',
  );
  for (const relative of QUEUE_DIRECTORIES) ensureDirectoryChain(queueRoot, relative);
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
          Object.freeze({ jobId: packet.jobId, packetSha256: packet.packetSha256 }),
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
      pendingCount: packets.length,
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
        if (existsSync(directory) && directoryEntries(directory).length === 0) rmSync(directory);
      } catch {
        // Retain evidence if rollback cannot remove an empty directory cleanly.
      }
    }
    throw error;
  }
}

export function loadStoredCampaign(queueRoot) {
  return parseEvaTalkNeutralLocalCampaign(
    stableJson(path.join(queueRoot, 'campaign.json'), 'stored campaign').value,
  );
}
