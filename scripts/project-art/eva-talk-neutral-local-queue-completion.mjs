import { existsSync } from 'node:fs';
import path from 'node:path';

import {
  EVA_TALK_NEUTRAL_LOCAL_COMPLETION_SCHEMA,
  EVA_TALK_NEUTRAL_LOCAL_FAILURE_SCHEMA,
  EVA_TALK_NEUTRAL_LOCAL_IMAGES_PER_BATCH,
  EVA_TALK_NEUTRAL_LOCAL_OUTPUT_MANIFEST_SCHEMA,
  EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION,
  FAILURE_CODE,
  MAXIMUM_PNG_BYTES,
  SHA256,
  assert,
  assertClosedAuthority,
  claimIdentifier,
  closedAuthority,
  deepFreeze,
  directoryEntries,
  exactKeys,
  identifier,
  moveDirectoryAtomic,
  openQueueRoot,
  requireNotExpired,
  sha256EvaTalkNeutralLocalQueueDocument,
  snapshot,
  stableFile,
  stableJson,
  timestamp,
  writeJsonCreateOnly,
} from './eva-talk-neutral-local-queue-common.mjs';
import { inspectEvaTalkNeutralCandidatePng } from './eva-talk-neutral-local-queue-png.mjs';
import {
  currentEvaTalkNeutralLocalLease,
  loadEvaTalkNeutralLocalClaim,
  verifyEvaTalkNeutralLocalClaim,
} from './eva-talk-neutral-local-queue-claims.mjs';
import {
  loadStoredCampaign,
  readPacketFromDirectory,
} from './eva-talk-neutral-local-queue-init.mjs';

function expectedOutputFiles(packet) {
  return packet.slots
    .map((slot) => path.posix.basename(slot.outputRelativePath))
    .sort();
}

function outputEntry(slot, file) {
  const png = inspectEvaTalkNeutralCandidatePng(file.bytes);
  return deepFreeze({
    slotOrdinal: slot.slotOrdinal,
    candidateOrdinal: slot.candidateOrdinal,
    candidateId: slot.candidateId,
    outputRelativePath: slot.outputRelativePath,
    bytes: file.bytes.length,
    sha256: file.sha256,
    mediaType: 'image/png',
    png,
  });
}

function verifyOutputEntry(entry, slot) {
  exactKeys(
    entry,
    [
      'slotOrdinal',
      'candidateOrdinal',
      'candidateId',
      'outputRelativePath',
      'bytes',
      'sha256',
      'mediaType',
      'png',
    ],
    'EVA_TALK_NEUTRAL_QUEUE_OUTPUT_ENTRY_INVALID',
  );
  assert(
    entry.slotOrdinal === slot.slotOrdinal &&
      entry.candidateOrdinal === slot.candidateOrdinal &&
      entry.candidateId === slot.candidateId &&
      entry.outputRelativePath === slot.outputRelativePath &&
      Number.isSafeInteger(entry.bytes) &&
      entry.bytes > 0 &&
      entry.bytes <= MAXIMUM_PNG_BYTES &&
      typeof entry.sha256 === 'string' &&
      SHA256.test(entry.sha256) &&
      entry.mediaType === 'image/png' &&
      entry.png?.width === 1024 &&
      entry.png?.height === 1536 &&
      entry.png?.bitDepth === 8 &&
      entry.png?.colourType === 6 &&
      entry.png?.interlace === 0 &&
      entry.png?.rgba8StraightAlphaCompatible === true,
    'EVA_TALK_NEUTRAL_QUEUE_OUTPUT_ENTRY_INVALID',
  );
}

export function verifyEvaTalkNeutralOutputManifest(input, claim, packet) {
  const value = snapshot(input, 'output manifest');
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
      'preparedAt',
      'outputCount',
      'totalBytes',
      'outputs',
      'uniqueOutputBodies',
      'semanticOrderingAuthority',
      'authority',
      'outputManifestSha256',
    ],
    'EVA_TALK_NEUTRAL_QUEUE_OUTPUT_MANIFEST_INVALID',
  );
  assert(
    value.schema === EVA_TALK_NEUTRAL_LOCAL_OUTPUT_MANIFEST_SCHEMA &&
      value.protocolVersion === EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION &&
      value.claimId === claim.claimId &&
      value.claimSha256 === claim.claimSha256 &&
      value.jobId === packet.jobId &&
      value.packetSha256 === packet.packetSha256 &&
      value.workerId === claim.workerId &&
      value.outputCount === EVA_TALK_NEUTRAL_LOCAL_IMAGES_PER_BATCH &&
      Array.isArray(value.outputs) &&
      value.outputs.length === EVA_TALK_NEUTRAL_LOCAL_IMAGES_PER_BATCH &&
      value.uniqueOutputBodies === true &&
      value.semanticOrderingAuthority === false,
    'EVA_TALK_NEUTRAL_QUEUE_OUTPUT_MANIFEST_INVALID',
  );
  timestamp(value.preparedAt, 'preparedAt');
  let totalBytes = 0;
  const hashes = new Set();
  value.outputs.forEach((entry, index) => {
    verifyOutputEntry(entry, packet.slots[index]);
    totalBytes += entry.bytes;
    hashes.add(entry.sha256);
  });
  assert(
    value.totalBytes === totalBytes &&
      hashes.size === EVA_TALK_NEUTRAL_LOCAL_IMAGES_PER_BATCH,
    'EVA_TALK_NEUTRAL_QUEUE_OUTPUT_MANIFEST_INVALID',
  );
  assertClosedAuthority(value.authority);
  const body = { ...value };
  delete body.outputManifestSha256;
  assert(
    typeof value.outputManifestSha256 === 'string' &&
      SHA256.test(value.outputManifestSha256) &&
      value.outputManifestSha256 ===
        sha256EvaTalkNeutralLocalQueueDocument(body),
    'EVA_TALK_NEUTRAL_QUEUE_OUTPUT_MANIFEST_HASH_INVALID',
  );
  return deepFreeze(value);
}

function inspectCurrentOutputs(loaded) {
  const outputRoot = path.join(loaded.directory, 'outputs');
  assert(
    existsSync(outputRoot),
    'EVA_TALK_NEUTRAL_QUEUE_OUTPUT_DIRECTORY_MISSING',
  );
  const observedFiles = directoryEntries(outputRoot);
  const expectedFiles = expectedOutputFiles(loaded.packet);
  assert(
    observedFiles.length === expectedFiles.length &&
      observedFiles.every((file, index) => file === expectedFiles[index]),
    'EVA_TALK_NEUTRAL_QUEUE_OUTPUT_SET_INVALID',
  );
  const outputs = loaded.packet.slots.map((slot) => {
    const filePath = path.join(
      loaded.directory,
      ...slot.outputRelativePath.split('/'),
    );
    return outputEntry(
      slot,
      stableFile(
        filePath,
        `output ${slot.candidateId}`,
        MAXIMUM_PNG_BYTES,
        57,
      ),
    );
  });
  assert(
    new Set(outputs.map((entry) => entry.sha256)).size ===
      EVA_TALK_NEUTRAL_LOCAL_IMAGES_PER_BATCH,
    'EVA_TALK_NEUTRAL_QUEUE_OUTPUT_BODIES_NOT_UNIQUE',
  );
  return deepFreeze(outputs);
}

function assertManifestMatchesCurrentOutputs(manifest, outputs) {
  assert(
    manifest.outputs.length === outputs.length &&
      manifest.outputs.every(
        (entry, index) =>
          entry.outputRelativePath === outputs[index].outputRelativePath &&
          entry.bytes === outputs[index].bytes &&
          entry.sha256 === outputs[index].sha256,
      ),
    'EVA_TALK_NEUTRAL_QUEUE_OUTPUTS_CHANGED_AFTER_MANIFEST',
  );
}

export function prepareEvaTalkNeutralOutputManifest({
  queueRoot: queueRootInput,
  claimId,
  workerId: workerIdInput,
  preparedAt: preparedAtInput,
}) {
  const loaded = loadEvaTalkNeutralLocalClaim(queueRootInput, claimId);
  const workerId = identifier(workerIdInput, 'workerId');
  const preparedAt = timestamp(preparedAtInput, 'preparedAt');
  assert(
    loaded.claim.workerId === workerId,
    'EVA_TALK_NEUTRAL_QUEUE_WORKER_MISMATCH',
  );
  const lease = currentEvaTalkNeutralLocalLease(
    loaded.directory,
    loaded.claim,
  );
  requireNotExpired(lease.leaseExpiresAt, preparedAt);
  const outputs = inspectCurrentOutputs(loaded);
  const manifestPath = path.join(loaded.directory, 'output-manifest.json');

  if (existsSync(manifestPath)) {
    const manifest = verifyEvaTalkNeutralOutputManifest(
      stableJson(manifestPath, 'output manifest').value,
      loaded.claim,
      loaded.packet,
    );
    assertManifestMatchesCurrentOutputs(manifest, outputs);
    return deepFreeze({ status: 'already-prepared', manifest });
  }

  const body = {
    schema: EVA_TALK_NEUTRAL_LOCAL_OUTPUT_MANIFEST_SCHEMA,
    protocolVersion: EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION,
    claimId: loaded.claim.claimId,
    claimSha256: loaded.claim.claimSha256,
    jobId: loaded.packet.jobId,
    packetSha256: loaded.packet.packetSha256,
    workerId,
    preparedAt,
    outputCount: outputs.length,
    totalBytes: outputs.reduce((sum, entry) => sum + entry.bytes, 0),
    outputs,
    uniqueOutputBodies: true,
    semanticOrderingAuthority: false,
    authority: closedAuthority(),
  };
  const manifest = deepFreeze({
    ...body,
    outputManifestSha256: sha256EvaTalkNeutralLocalQueueDocument(body),
  });
  writeJsonCreateOnly(manifestPath, manifest);
  return deepFreeze({ status: 'prepared', manifest });
}

export function verifyEvaTalkNeutralCompletion(input, claim, packet, manifest) {
  const value = snapshot(input, 'completion receipt');
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
      'completedAt',
      'outputManifestSha256',
      'outputCount',
      'candidateApprovalGranted',
      'semanticOrderingAuthority',
      'authority',
      'completionSha256',
    ],
    'EVA_TALK_NEUTRAL_QUEUE_COMPLETION_INVALID',
  );
  assert(
    value.schema === EVA_TALK_NEUTRAL_LOCAL_COMPLETION_SCHEMA &&
      value.protocolVersion === EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION &&
      value.claimId === claim.claimId &&
      value.claimSha256 === claim.claimSha256 &&
      value.jobId === packet.jobId &&
      value.packetSha256 === packet.packetSha256 &&
      value.workerId === claim.workerId &&
      value.outputManifestSha256 === manifest.outputManifestSha256 &&
      value.outputCount === EVA_TALK_NEUTRAL_LOCAL_IMAGES_PER_BATCH &&
      value.candidateApprovalGranted === false &&
      value.semanticOrderingAuthority === false,
    'EVA_TALK_NEUTRAL_QUEUE_COMPLETION_INVALID',
  );
  timestamp(value.completedAt, 'completedAt');
  assertClosedAuthority(value.authority);
  const body = { ...value };
  delete body.completionSha256;
  assert(
    typeof value.completionSha256 === 'string' &&
      SHA256.test(value.completionSha256) &&
      value.completionSha256 === sha256EvaTalkNeutralLocalQueueDocument(body),
    'EVA_TALK_NEUTRAL_QUEUE_COMPLETION_HASH_INVALID',
  );
  return deepFreeze(value);
}

function completedReceipt(queueRoot, claimId) {
  const directory = path.join(queueRoot, 'completed', claimIdentifier(claimId));
  if (!existsSync(directory)) return null;
  const campaign = loadStoredCampaign(queueRoot);
  const packet = readPacketFromDirectory(directory, campaign);
  const claim = verifyEvaTalkNeutralLocalClaim(
    stableJson(path.join(directory, 'claim.json'), 'claim').value,
    packet,
  );
  const manifest = verifyEvaTalkNeutralOutputManifest(
    stableJson(
      path.join(directory, 'output-manifest.json'),
      'output manifest',
    ).value,
    claim,
    packet,
  );
  const outputs = inspectCurrentOutputs({ directory, packet });
  assertManifestMatchesCurrentOutputs(manifest, outputs);
  const completion = verifyEvaTalkNeutralCompletion(
    stableJson(
      path.join(directory, 'completion.json'),
      'completion receipt',
    ).value,
    claim,
    packet,
    manifest,
  );
  return deepFreeze({
    directory,
    campaign,
    packet,
    claim,
    manifest,
    completion,
  });
}

export function completeEvaTalkNeutralLocalClaim({
  queueRoot: queueRootInput,
  claimId,
  workerId: workerIdInput,
  completedAt: completedAtInput,
}) {
  const queueRoot = openQueueRoot(queueRootInput);
  const existing = completedReceipt(queueRoot, claimId);
  if (existing) {
    const workerId = identifier(workerIdInput, 'workerId');
    assert(
      existing.claim.workerId === workerId,
      'EVA_TALK_NEUTRAL_QUEUE_WORKER_MISMATCH',
    );
    return deepFreeze({
      status: 'already-completed',
      completion: existing.completion,
    });
  }

  const loaded = loadEvaTalkNeutralLocalClaim(queueRoot, claimId);
  const workerId = identifier(workerIdInput, 'workerId');
  const completedAt = timestamp(completedAtInput, 'completedAt');
  assert(
    loaded.claim.workerId === workerId,
    'EVA_TALK_NEUTRAL_QUEUE_WORKER_MISMATCH',
  );
  const lease = currentEvaTalkNeutralLocalLease(
    loaded.directory,
    loaded.claim,
  );
  requireNotExpired(lease.leaseExpiresAt, completedAt);
  const prepared = prepareEvaTalkNeutralOutputManifest({
    queueRoot,
    claimId,
    workerId,
    preparedAt: completedAt,
  });
  const manifest = prepared.manifest;
  const body = {
    schema: EVA_TALK_NEUTRAL_LOCAL_COMPLETION_SCHEMA,
    protocolVersion: EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION,
    claimId: loaded.claim.claimId,
    claimSha256: loaded.claim.claimSha256,
    jobId: loaded.packet.jobId,
    packetSha256: loaded.packet.packetSha256,
    workerId,
    completedAt,
    outputManifestSha256: manifest.outputManifestSha256,
    outputCount: manifest.outputCount,
    candidateApprovalGranted: false,
    semanticOrderingAuthority: false,
    authority: closedAuthority(),
  };
  const completion = deepFreeze({
    ...body,
    completionSha256: sha256EvaTalkNeutralLocalQueueDocument(body),
  });
  const completionPath = path.join(loaded.directory, 'completion.json');
  if (existsSync(completionPath)) {
    verifyEvaTalkNeutralCompletion(
      stableJson(completionPath, 'completion receipt').value,
      loaded.claim,
      loaded.packet,
      manifest,
    );
  } else {
    writeJsonCreateOnly(completionPath, completion);
  }
  const target = path.join(queueRoot, 'completed', loaded.claim.claimId);
  moveDirectoryAtomic(loaded.directory, target);
  return deepFreeze({
    status: 'completed',
    completion,
    completedDirectory: target,
  });
}

export function verifyEvaTalkNeutralFailure(input, claim, packet) {
  const value = snapshot(input, 'failure receipt');
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
      'failedAt',
      'failureCode',
      'failureMessage',
      'retryAuthorized',
      'candidateApprovalGranted',
      'authority',
      'failureSha256',
    ],
    'EVA_TALK_NEUTRAL_QUEUE_FAILURE_INVALID',
  );
  assert(
    value.schema === EVA_TALK_NEUTRAL_LOCAL_FAILURE_SCHEMA &&
      value.protocolVersion === EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION &&
      value.claimId === claim.claimId &&
      value.claimSha256 === claim.claimSha256 &&
      value.jobId === packet.jobId &&
      value.packetSha256 === packet.packetSha256 &&
      value.workerId === claim.workerId &&
      typeof value.failureCode === 'string' &&
      FAILURE_CODE.test(value.failureCode) &&
      typeof value.failureMessage === 'string' &&
      value.failureMessage.length >= 1 &&
      value.failureMessage.length <= 1000 &&
      value.retryAuthorized === false &&
      value.candidateApprovalGranted === false,
    'EVA_TALK_NEUTRAL_QUEUE_FAILURE_INVALID',
  );
  timestamp(value.failedAt, 'failedAt');
  assertClosedAuthority(value.authority);
  const body = { ...value };
  delete body.failureSha256;
  assert(
    typeof value.failureSha256 === 'string' &&
      SHA256.test(value.failureSha256) &&
      value.failureSha256 === sha256EvaTalkNeutralLocalQueueDocument(body),
    'EVA_TALK_NEUTRAL_QUEUE_FAILURE_HASH_INVALID',
  );
  return deepFreeze(value);
}

function failedReceipt(queueRoot, claimId) {
  const directory = path.join(queueRoot, 'failed', claimIdentifier(claimId));
  if (!existsSync(directory)) return null;
  const campaign = loadStoredCampaign(queueRoot);
  const packet = readPacketFromDirectory(directory, campaign);
  const claim = verifyEvaTalkNeutralLocalClaim(
    stableJson(path.join(directory, 'claim.json'), 'claim').value,
    packet,
  );
  const failure = verifyEvaTalkNeutralFailure(
    stableJson(path.join(directory, 'failure.json'), 'failure receipt').value,
    claim,
    packet,
  );
  return deepFreeze({ directory, campaign, packet, claim, failure });
}

export function failEvaTalkNeutralLocalClaim({
  queueRoot: queueRootInput,
  claimId,
  workerId: workerIdInput,
  failedAt: failedAtInput,
  failureCode,
  failureMessage,
}) {
  const queueRoot = openQueueRoot(queueRootInput);
  const existing = failedReceipt(queueRoot, claimId);
  if (existing) {
    const workerId = identifier(workerIdInput, 'workerId');
    assert(
      existing.claim.workerId === workerId,
      'EVA_TALK_NEUTRAL_QUEUE_WORKER_MISMATCH',
    );
    return deepFreeze({
      status: 'already-failed',
      failure: existing.failure,
    });
  }
  const loaded = loadEvaTalkNeutralLocalClaim(queueRoot, claimId);
  const workerId = identifier(workerIdInput, 'workerId');
  const failedAt = timestamp(failedAtInput, 'failedAt');
  assert(
    loaded.claim.workerId === workerId,
    'EVA_TALK_NEUTRAL_QUEUE_WORKER_MISMATCH',
  );
  const lease = currentEvaTalkNeutralLocalLease(
    loaded.directory,
    loaded.claim,
  );
  requireNotExpired(lease.leaseExpiresAt, failedAt);
  assert(
    typeof failureCode === 'string' && FAILURE_CODE.test(failureCode),
    'EVA_TALK_NEUTRAL_QUEUE_FAILURE_CODE_INVALID',
  );
  assert(
    typeof failureMessage === 'string' &&
      failureMessage.trim() === failureMessage &&
      failureMessage.length >= 1 &&
      failureMessage.length <= 1000,
    'EVA_TALK_NEUTRAL_QUEUE_FAILURE_MESSAGE_INVALID',
  );
  const body = {
    schema: EVA_TALK_NEUTRAL_LOCAL_FAILURE_SCHEMA,
    protocolVersion: EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION,
    claimId: loaded.claim.claimId,
    claimSha256: loaded.claim.claimSha256,
    jobId: loaded.packet.jobId,
    packetSha256: loaded.packet.packetSha256,
    workerId,
    failedAt,
    failureCode,
    failureMessage,
    retryAuthorized: false,
    candidateApprovalGranted: false,
    authority: closedAuthority(),
  };
  const failure = deepFreeze({
    ...body,
    failureSha256: sha256EvaTalkNeutralLocalQueueDocument(body),
  });
  writeJsonCreateOnly(path.join(loaded.directory, 'failure.json'), failure);
  const target = path.join(loaded.queueRoot, 'failed', loaded.claim.claimId);
  moveDirectoryAtomic(loaded.directory, target);
  return deepFreeze({
    status: 'failed',
    failure,
    failedDirectory: target,
  });
}
