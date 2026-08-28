import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';

import {
  EVA_TALK_NEUTRAL_LOCAL_CLAIM_SCHEMA,
  EVA_TALK_NEUTRAL_LOCAL_HEARTBEAT_SCHEMA,
  EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION,
  EVA_TALK_NEUTRAL_LOCAL_REQUEUE_SCHEMA,
  EVA_TALK_NEUTRAL_LOCAL_STATUS_SCHEMA,
  MAXIMUM_LEASE_SECONDS,
  MINIMUM_LEASE_SECONDS,
  SHA256,
  assert,
  assertClosedAuthority,
  claimIdentifier,
  closedAuthority,
  deepFreeze,
  directoryChildDirectories,
  directoryEntries,
  ensureDirectoryChain,
  exactKeys,
  heartbeatFilename,
  identifier,
  moveDirectoryAtomic,
  openQueueRoot,
  removeDirectoryIfPresent,
  requireNotExpired,
  safeInteger,
  sha256EvaTalkNeutralLocalQueueDocument,
  snapshot,
  stableJson,
  timestamp,
  writeJsonCreateOnly,
} from './eva-talk-neutral-local-queue-common.mjs';
import {
  loadQueueManifest,
  loadStoredCampaign,
  readPacketFromDirectory,
} from './eva-talk-neutral-local-queue-init.mjs';

function leaseExpiry(startedAt, leaseSeconds) {
  return new Date(Date.parse(startedAt) + leaseSeconds * 1000).toISOString();
}

function claimDirectory(queueRoot, claimId) {
  return path.join(queueRoot, 'claimed', claimIdentifier(claimId));
}

function claimBody({ packet, workerId, claimId, claimedAt, leaseSeconds }) {
  const body = {
    schema: EVA_TALK_NEUTRAL_LOCAL_CLAIM_SCHEMA,
    protocolVersion: EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION,
    claimId,
    campaignId: packet.campaignId,
    campaignSha256: packet.campaignSha256,
    jobId: packet.jobId,
    packetSha256: packet.packetSha256,
    workerId,
    claimedAt,
    leaseSeconds,
    leaseExpiresAt: leaseExpiry(claimedAt, leaseSeconds),
    authority: closedAuthority(),
  };
  return deepFreeze({
    ...body,
    claimSha256: sha256EvaTalkNeutralLocalQueueDocument(body),
  });
}

export function verifyEvaTalkNeutralLocalClaim(input, packet) {
  const value = snapshot(input, 'claim');
  exactKeys(
    value,
    [
      'schema',
      'protocolVersion',
      'claimId',
      'campaignId',
      'campaignSha256',
      'jobId',
      'packetSha256',
      'workerId',
      'claimedAt',
      'leaseSeconds',
      'leaseExpiresAt',
      'authority',
      'claimSha256',
    ],
    'EVA_TALK_NEUTRAL_QUEUE_CLAIM_INVALID',
  );
  assert(
    value.schema === EVA_TALK_NEUTRAL_LOCAL_CLAIM_SCHEMA &&
      value.protocolVersion === EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION,
    'EVA_TALK_NEUTRAL_QUEUE_CLAIM_INVALID',
  );
  claimIdentifier(value.claimId);
  identifier(value.workerId, 'workerId');
  const claimedAt = timestamp(value.claimedAt, 'claimedAt');
  const leaseSeconds = safeInteger(
    value.leaseSeconds,
    'leaseSeconds',
    MINIMUM_LEASE_SECONDS,
    MAXIMUM_LEASE_SECONDS,
  );
  assert(
    value.leaseExpiresAt === leaseExpiry(claimedAt, leaseSeconds),
    'EVA_TALK_NEUTRAL_QUEUE_CLAIM_LEASE_INVALID',
  );
  assert(
    value.campaignId === packet.campaignId &&
      value.campaignSha256 === packet.campaignSha256 &&
      value.jobId === packet.jobId &&
      value.packetSha256 === packet.packetSha256,
    'EVA_TALK_NEUTRAL_QUEUE_CLAIM_PACKET_MISMATCH',
  );
  assertClosedAuthority(value.authority);
  assert(
    typeof value.claimSha256 === 'string' && SHA256.test(value.claimSha256),
    'EVA_TALK_NEUTRAL_QUEUE_CLAIM_HASH_INVALID',
  );
  const body = { ...value };
  delete body.claimSha256;
  assert(
    value.claimSha256 === sha256EvaTalkNeutralLocalQueueDocument(body),
    'EVA_TALK_NEUTRAL_QUEUE_CLAIM_HASH_INVALID',
  );
  return deepFreeze(value);
}

function heartbeatBody({
  claim,
  sequence,
  heartbeatAt,
  previousLeaseExpiresAt,
  leaseSeconds,
}) {
  const body = {
    schema: EVA_TALK_NEUTRAL_LOCAL_HEARTBEAT_SCHEMA,
    protocolVersion: EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION,
    claimId: claim.claimId,
    claimSha256: claim.claimSha256,
    jobId: claim.jobId,
    workerId: claim.workerId,
    heartbeatSequence: sequence,
    heartbeatAt,
    previousLeaseExpiresAt,
    leaseSeconds,
    leaseExpiresAt: leaseExpiry(heartbeatAt, leaseSeconds),
    authority: closedAuthority(),
  };
  return deepFreeze({
    ...body,
    heartbeatSha256: sha256EvaTalkNeutralLocalQueueDocument(body),
  });
}

function verifyHeartbeat(input, claim, previous) {
  const value = snapshot(input, 'heartbeat');
  exactKeys(
    value,
    [
      'schema',
      'protocolVersion',
      'claimId',
      'claimSha256',
      'jobId',
      'workerId',
      'heartbeatSequence',
      'heartbeatAt',
      'previousLeaseExpiresAt',
      'leaseSeconds',
      'leaseExpiresAt',
      'authority',
      'heartbeatSha256',
    ],
    'EVA_TALK_NEUTRAL_QUEUE_HEARTBEAT_INVALID',
  );
  assert(
    value.schema === EVA_TALK_NEUTRAL_LOCAL_HEARTBEAT_SCHEMA &&
      value.protocolVersion === EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION &&
      value.claimId === claim.claimId &&
      value.claimSha256 === claim.claimSha256 &&
      value.jobId === claim.jobId &&
      value.workerId === claim.workerId,
    'EVA_TALK_NEUTRAL_QUEUE_HEARTBEAT_INVALID',
  );
  safeInteger(value.heartbeatSequence, 'heartbeatSequence', 1, 999999);
  const heartbeatAt = timestamp(value.heartbeatAt, 'heartbeatAt');
  const leaseSeconds = safeInteger(
    value.leaseSeconds,
    'leaseSeconds',
    MINIMUM_LEASE_SECONDS,
    MAXIMUM_LEASE_SECONDS,
  );
  assert(
    value.heartbeatSequence === previous.sequence + 1 &&
      value.previousLeaseExpiresAt === previous.leaseExpiresAt &&
      Date.parse(heartbeatAt) <= Date.parse(previous.leaseExpiresAt) &&
      value.leaseExpiresAt === leaseExpiry(heartbeatAt, leaseSeconds) &&
      Date.parse(value.leaseExpiresAt) > Date.parse(previous.leaseExpiresAt),
    'EVA_TALK_NEUTRAL_QUEUE_HEARTBEAT_LEASE_INVALID',
  );
  assertClosedAuthority(value.authority);
  const body = { ...value };
  delete body.heartbeatSha256;
  assert(
    typeof value.heartbeatSha256 === 'string' &&
      SHA256.test(value.heartbeatSha256) &&
      value.heartbeatSha256 === sha256EvaTalkNeutralLocalQueueDocument(body),
    'EVA_TALK_NEUTRAL_QUEUE_HEARTBEAT_HASH_INVALID',
  );
  return deepFreeze(value);
}

export function loadEvaTalkNeutralLocalClaim(queueRootInput, claimIdInput) {
  const queueRoot = openQueueRoot(queueRootInput);
  const campaign = loadStoredCampaign(queueRoot);
  const directory = claimDirectory(queueRoot, claimIdInput);
  assert(existsSync(directory), 'EVA_TALK_NEUTRAL_QUEUE_CLAIM_NOT_FOUND');
  const packet = readPacketFromDirectory(directory, campaign);
  const claimInput = stableJson(path.join(directory, 'claim.json'), 'claim');
  const claim = verifyEvaTalkNeutralLocalClaim(claimInput.value, packet);
  assert(
    path.basename(directory) === claim.claimId,
    'EVA_TALK_NEUTRAL_QUEUE_CLAIM_DIRECTORY_MISMATCH',
  );
  return deepFreeze({ queueRoot, directory, campaign, packet, claim });
}

export function currentEvaTalkNeutralLocalLease(claimDirectoryInput, claim) {
  const heartbeatRoot = path.join(claimDirectoryInput, 'heartbeats');
  let previous = Object.freeze({
    sequence: 0,
    leaseExpiresAt: claim.leaseExpiresAt,
    heartbeat: null,
  });
  if (!existsSync(heartbeatRoot)) return previous;
  const files = directoryEntries(heartbeatRoot);
  files.forEach(heartbeatFilename);
  for (const [index, file] of files.entries()) {
    assert(
      file === `heartbeat-${String(index + 1).padStart(6, '0')}.json`,
      'EVA_TALK_NEUTRAL_QUEUE_HEARTBEAT_SEQUENCE_INVALID',
    );
    const heartbeat = verifyHeartbeat(
      stableJson(path.join(heartbeatRoot, file), 'heartbeat').value,
      claim,
      previous,
    );
    previous = Object.freeze({
      sequence: heartbeat.heartbeatSequence,
      leaseExpiresAt: heartbeat.leaseExpiresAt,
      heartbeat,
    });
  }
  return previous;
}

function manifestPacketHash(manifest, jobId) {
  return manifest.jobs.find((job) => job.jobId === jobId)?.packetSha256 ?? null;
}

export function claimNextEvaTalkNeutralLocalJob({
  queueRoot: queueRootInput,
  workerId: workerIdInput,
  claimedAt: claimedAtInput,
  leaseSeconds: leaseSecondsInput = 300,
}) {
  const queueRoot = openQueueRoot(queueRootInput);
  const workerId = identifier(workerIdInput, 'workerId');
  const claimedAt = timestamp(claimedAtInput, 'claimedAt');
  const leaseSeconds = safeInteger(
    leaseSecondsInput,
    'leaseSeconds',
    MINIMUM_LEASE_SECONDS,
    MAXIMUM_LEASE_SECONDS,
  );
  const campaign = loadStoredCampaign(queueRoot);
  const manifest = loadQueueManifest(queueRoot);
  const pendingRoot = path.join(queueRoot, 'pending');
  const claimedRoot = path.join(queueRoot, 'claimed');

  for (const jobId of directoryChildDirectories(pendingRoot)) {
    const pendingDirectory = path.join(pendingRoot, jobId);
    let packet;
    try {
      assert(
        directoryEntries(pendingDirectory).join('\n') === 'packet.json',
        'EVA_TALK_NEUTRAL_QUEUE_PENDING_JOB_DIRTY',
      );
      packet = readPacketFromDirectory(pendingDirectory, campaign);
      assert(
        packet.jobId === jobId &&
          manifestPacketHash(manifest, jobId) === packet.packetSha256,
        'EVA_TALK_NEUTRAL_QUEUE_PENDING_PACKET_INVALID',
      );
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    const claimId = `${jobId}--${randomBytes(8).toString('hex')}`;
    claimIdentifier(claimId);
    const target = path.join(claimedRoot, claimId);
    try {
      renameSync(pendingDirectory, target);
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'EEXIST') continue;
      throw error;
    }
    const claim = claimBody({
      packet,
      workerId,
      claimId,
      claimedAt,
      leaseSeconds,
    });
    try {
      writeJsonCreateOnly(path.join(target, 'claim.json'), claim);
    } catch (error) {
      try {
        moveDirectoryAtomic(target, pendingDirectory);
      } catch {
        // Packet-only orphan recovery handles a crash in this narrow window.
      }
      throw error;
    }
    return deepFreeze({
      status: 'claimed',
      queueRoot,
      claimDirectory: target,
      claim,
      packet,
    });
  }
  return deepFreeze({
    status: 'empty',
    queueRoot,
    claim: null,
    packet: null,
  });
}

export function heartbeatEvaTalkNeutralLocalClaim({
  queueRoot: queueRootInput,
  claimId,
  workerId: workerIdInput,
  heartbeatAt: heartbeatAtInput,
  leaseSeconds: leaseSecondsInput = 300,
}) {
  const loaded = loadEvaTalkNeutralLocalClaim(queueRootInput, claimId);
  const workerId = identifier(workerIdInput, 'workerId');
  const heartbeatAt = timestamp(heartbeatAtInput, 'heartbeatAt');
  const leaseSeconds = safeInteger(
    leaseSecondsInput,
    'leaseSeconds',
    MINIMUM_LEASE_SECONDS,
    MAXIMUM_LEASE_SECONDS,
  );
  assert(
    loaded.claim.workerId === workerId,
    'EVA_TALK_NEUTRAL_QUEUE_WORKER_MISMATCH',
  );
  const previous = currentEvaTalkNeutralLocalLease(
    loaded.directory,
    loaded.claim,
  );
  requireNotExpired(previous.leaseExpiresAt, heartbeatAt);
  const candidateExpiry = leaseExpiry(heartbeatAt, leaseSeconds);
  assert(
    Date.parse(candidateExpiry) > Date.parse(previous.leaseExpiresAt),
    'EVA_TALK_NEUTRAL_QUEUE_HEARTBEAT_NOT_EXTENDING_LEASE',
  );
  const sequence = previous.sequence + 1;
  const heartbeat = heartbeatBody({
    claim: loaded.claim,
    sequence,
    heartbeatAt,
    previousLeaseExpiresAt: previous.leaseExpiresAt,
    leaseSeconds,
  });
  const heartbeatRoot = ensureDirectoryChain(loaded.directory, 'heartbeats');
  const filename = `heartbeat-${String(sequence).padStart(6, '0')}.json`;
  writeJsonCreateOnly(path.join(heartbeatRoot, filename), heartbeat);
  return deepFreeze({ status: 'heartbeat-recorded', heartbeat });
}

function packetOnly(entries) {
  return entries.length === 1 && entries[0] === 'packet.json';
}

export function recoverEvaTalkNeutralPacketOnlyOrphans(queueRootInput) {
  const queueRoot = openQueueRoot(queueRootInput);
  const campaign = loadStoredCampaign(queueRoot);
  const claimedRoot = path.join(queueRoot, 'claimed');
  const pendingRoot = path.join(queueRoot, 'pending');
  const recovered = [];
  for (const directoryName of directoryChildDirectories(claimedRoot)) {
    claimIdentifier(directoryName);
    const source = path.join(claimedRoot, directoryName);
    const entries = directoryEntries(source);
    if (!packetOnly(entries)) continue;
    const packet = readPacketFromDirectory(source, campaign);
    const target = path.join(pendingRoot, packet.jobId);
    assert(
      !existsSync(target),
      'EVA_TALK_NEUTRAL_QUEUE_ORPHAN_TARGET_EXISTS',
    );
    moveDirectoryAtomic(source, target);
    recovered.push(
      Object.freeze({ claimId: directoryName, jobId: packet.jobId }),
    );
  }
  return deepFreeze({
    status: 'orphan-recovery-complete',
    recovered: Object.freeze(recovered),
  });
}

function verifyRequeueReceipt(value, claim, packet) {
  exactKeys(
    value,
    [
      'schema',
      'protocolVersion',
      'claimId',
      'claimSha256',
      'jobId',
      'packetSha256',
      'workerId',
      'leaseExpiresAt',
      'requeuedAt',
      'reason',
      'authority',
      'requeueSha256',
    ],
    'EVA_TALK_NEUTRAL_QUEUE_REQUEUE_INVALID',
  );
  assert(
    value.schema === EVA_TALK_NEUTRAL_LOCAL_REQUEUE_SCHEMA &&
      value.protocolVersion === EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION &&
      value.claimId === claim.claimId &&
      value.claimSha256 === claim.claimSha256 &&
      value.jobId === packet.jobId &&
      value.packetSha256 === packet.packetSha256 &&
      value.workerId === claim.workerId &&
      value.reason === 'expired-claim-with-no-worker-evidence',
    'EVA_TALK_NEUTRAL_QUEUE_REQUEUE_INVALID',
  );
  timestamp(value.leaseExpiresAt, 'leaseExpiresAt');
  timestamp(value.requeuedAt, 'requeuedAt');
  assertClosedAuthority(value.authority);
  const body = { ...value };
  delete body.requeueSha256;
  assert(
    typeof value.requeueSha256 === 'string' &&
      SHA256.test(value.requeueSha256) &&
      value.requeueSha256 === sha256EvaTalkNeutralLocalQueueDocument(body),
    'EVA_TALK_NEUTRAL_QUEUE_REQUEUE_HASH_INVALID',
  );
  return deepFreeze(value);
}

function requeueReceipt({ claim, packet, leaseExpiresAt, requeuedAt }) {
  const body = {
    schema: EVA_TALK_NEUTRAL_LOCAL_REQUEUE_SCHEMA,
    protocolVersion: EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION,
    claimId: claim.claimId,
    claimSha256: claim.claimSha256,
    jobId: packet.jobId,
    packetSha256: packet.packetSha256,
    workerId: claim.workerId,
    leaseExpiresAt,
    requeuedAt,
    reason: 'expired-claim-with-no-worker-evidence',
    authority: closedAuthority(),
  };
  return deepFreeze({
    ...body,
    requeueSha256: sha256EvaTalkNeutralLocalQueueDocument(body),
  });
}

function hasWorkerEvidence(entries) {
  return entries.some((entry) => !['packet.json', 'claim.json'].includes(entry));
}

export function requeueExpiredEvaTalkNeutralLocalClaims({
  queueRoot: queueRootInput,
  requeuedAt: requeuedAtInput,
}) {
  const queueRoot = openQueueRoot(queueRootInput);
  const requeuedAt = timestamp(requeuedAtInput, 'requeuedAt');
  const claimedRoot = path.join(queueRoot, 'claimed');
  const pendingRoot = path.join(queueRoot, 'pending');
  const receiptRoot = ensureDirectoryChain(queueRoot, 'receipts/requeue');
  const requeued = [];
  const blocked = [];

  for (const claimId of directoryChildDirectories(claimedRoot)) {
    const loaded = loadEvaTalkNeutralLocalClaim(queueRoot, claimId);
    const lease = currentEvaTalkNeutralLocalLease(
      loaded.directory,
      loaded.claim,
    );
    if (Date.parse(requeuedAt) <= Date.parse(lease.leaseExpiresAt)) continue;
    const entries = directoryEntries(loaded.directory);
    if (hasWorkerEvidence(entries)) {
      blocked.push(
        Object.freeze({
          claimId,
          jobId: loaded.packet.jobId,
          reason: 'worker-evidence-present',
        }),
      );
      continue;
    }
    assert(
      entries.join('\n') === 'claim.json\npacket.json',
      'EVA_TALK_NEUTRAL_QUEUE_REQUEUE_CLAIM_DIRTY',
    );
    const target = path.join(pendingRoot, loaded.packet.jobId);
    const receiptPath = path.join(receiptRoot, `${claimId}.json`);

    if (existsSync(receiptPath)) {
      const receipt = verifyRequeueReceipt(
        stableJson(receiptPath, 'requeue receipt').value,
        loaded.claim,
        loaded.packet,
      );
      assert(
        existsSync(target),
        'EVA_TALK_NEUTRAL_QUEUE_REQUEUE_RECEIPT_WITHOUT_PENDING_JOB',
      );
      const pendingPacket = readPacketFromDirectory(target, loaded.campaign);
      assert(
        pendingPacket.packetSha256 === loaded.packet.packetSha256,
        'EVA_TALK_NEUTRAL_QUEUE_REQUEUE_PENDING_PACKET_MISMATCH',
      );
      removeDirectoryIfPresent(loaded.directory);
      requeued.push(receipt);
      continue;
    }

    assert(
      !existsSync(target),
      'EVA_TALK_NEUTRAL_QUEUE_REQUEUE_TARGET_EXISTS',
    );
    const temporary = path.join(
      pendingRoot,
      `.requeue-${loaded.packet.jobId}-${randomBytes(6).toString('hex')}`,
    );
    mkdirSync(temporary, { mode: 0o700 });
    try {
      writeJsonCreateOnly(path.join(temporary, 'packet.json'), loaded.packet);
      moveDirectoryAtomic(temporary, target);
      const receipt = requeueReceipt({
        claim: loaded.claim,
        packet: loaded.packet,
        leaseExpiresAt: lease.leaseExpiresAt,
        requeuedAt,
      });
      try {
        writeJsonCreateOnly(receiptPath, receipt);
      } catch (error) {
        removeDirectoryIfPresent(target);
        throw error;
      }
      removeDirectoryIfPresent(loaded.directory);
      requeued.push(receipt);
    } catch (error) {
      removeDirectoryIfPresent(temporary);
      throw error;
    }
  }

  return deepFreeze({
    status: 'expired-claim-requeue-complete',
    requeued: Object.freeze(requeued),
    blocked: Object.freeze(blocked),
  });
}

export function inspectEvaTalkNeutralLocalQueueStatus({
  queueRoot: queueRootInput,
  observedAt: observedAtInput,
}) {
  const queueRoot = openQueueRoot(queueRootInput);
  const observedAt = timestamp(observedAtInput, 'observedAt');
  const campaign = loadStoredCampaign(queueRoot);
  const manifest = loadQueueManifest(queueRoot);
  const pending = directoryChildDirectories(path.join(queueRoot, 'pending'));
  const completed = directoryChildDirectories(path.join(queueRoot, 'completed'));
  const failed = directoryChildDirectories(path.join(queueRoot, 'failed'));
  const claimed = [];
  const orphans = [];

  for (const claimId of directoryChildDirectories(
    path.join(queueRoot, 'claimed'),
  )) {
    const directory = path.join(queueRoot, 'claimed', claimId);
    const entries = directoryEntries(directory);
    if (packetOnly(entries)) {
      orphans.push(Object.freeze({ claimId, reason: 'packet-only-orphan' }));
      continue;
    }
    const loaded = loadEvaTalkNeutralLocalClaim(queueRoot, claimId);
    const lease = currentEvaTalkNeutralLocalLease(
      loaded.directory,
      loaded.claim,
    );
    claimed.push(
      Object.freeze({
        claimId,
        jobId: loaded.packet.jobId,
        workerId: loaded.claim.workerId,
        leaseExpiresAt: lease.leaseExpiresAt,
        heartbeatCount: lease.sequence,
        expired: Date.parse(observedAt) > Date.parse(lease.leaseExpiresAt),
        workerEvidencePresent: hasWorkerEvidence(entries),
      }),
    );
  }

  const body = {
    schema: EVA_TALK_NEUTRAL_LOCAL_STATUS_SCHEMA,
    protocolVersion: EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION,
    observedAt,
    campaignId: campaign.campaignId,
    campaignSha256: campaign.campaignSha256,
    queueManifestSha256: manifest.queueManifestSha256,
    counts: Object.freeze({
      pending: pending.length,
      claimed: claimed.length,
      completed: completed.length,
      failed: failed.length,
      orphans: orphans.length,
      total:
        pending.length +
        claimed.length +
        completed.length +
        failed.length +
        orphans.length,
    }),
    pending: Object.freeze(pending),
    claimed: Object.freeze(claimed),
    completed: Object.freeze(completed),
    failed: Object.freeze(failed),
    orphans: Object.freeze(orphans),
    authority: closedAuthority(),
  };
  return deepFreeze({
    ...body,
    statusSha256: sha256EvaTalkNeutralLocalQueueDocument(body),
  });
}
