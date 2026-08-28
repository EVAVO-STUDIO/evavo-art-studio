import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

import {
  EvaTalkNeutralLocalQueueError,
  claimNextEvaTalkNeutralLocalJob,
  completeEvaTalkNeutralLocalClaim,
  failEvaTalkNeutralLocalClaim,
  heartbeatEvaTalkNeutralLocalClaim,
  initializeEvaTalkNeutralLocalQueue,
  inspectEvaTalkNeutralCandidatePng,
  inspectEvaTalkNeutralLocalQueueStatus,
  loadEvaTalkNeutralLocalCampaign,
  loadEvaTalkNeutralLocalClaim,
  prepareEvaTalkNeutralOutputManifest,
  recoverEvaTalkNeutralPacketOnlyOrphans,
  requeueExpiredEvaTalkNeutralLocalClaims,
  verifyQueuePacketSet,
} from './project-art/eva-talk-neutral-local-materialization-queue.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAMPAIGN_PATH = path.join(
  ROOT,
  'config/eva-talk-neutral-local-materialization-campaign-v1.json',
);
const CAMPAIGN = loadEvaTalkNeutralLocalCampaign(CAMPAIGN_PATH);
const BASE_TIME = '2026-08-28T00:01:00.000Z';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

function rgbaPng(seed) {
  const width = 1024;
  const height = 1536;
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let row = 0; row < height; row += 1) raw[row * stride] = 0;
  const pixel = 1;
  raw[pixel] = seed & 0xff;
  raw[pixel + 1] = (seed * 37) & 0xff;
  raw[pixel + 2] = (seed * 71) & 0xff;
  raw[pixel + 3] = 255;
  const secondRowPixel = stride + 1 + ((seed % 31) * 4);
  raw[secondRowPixel] = (seed * 11) & 0xff;
  raw[secondRowPixel + 1] = (seed * 19) & 0xff;
  raw[secondRowPixel + 2] = (seed * 23) & 0xff;
  raw[secondRowPixel + 3] = 255;

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function expectCode(code, operation) {
  assert.throws(operation, (error) => {
    assert.ok(error instanceof EvaTalkNeutralLocalQueueError);
    assert.equal(error.code, code);
    return true;
  });
}

function createQueue() {
  const parent = mkdtempSync(
    path.join(os.tmpdir(), 'eva-talk-neutral-queue-test-'),
  );
  const queueRoot = path.join(parent, 'queue');
  const initialized = initializeEvaTalkNeutralLocalQueue({
    queueRoot,
    campaign: CAMPAIGN,
    initializedAt: BASE_TIME,
  });
  assert.equal(initialized.status, 'initialized');
  return { parent, queueRoot };
}

function cleanup(parent) {
  rmSync(parent, { recursive: true, force: true });
}

function writeOutputs(claimResult, options = {}) {
  const outputRoot = path.join(claimResult.claimDirectory, 'outputs');
  mkdirSync(outputRoot, { mode: 0o700 });
  const count = options.count ?? claimResult.packet.slots.length;
  for (let index = 0; index < count; index += 1) {
    const slot = claimResult.packet.slots[index];
    const seed = options.duplicate ? 1 : (options.seedBase ?? 100) + index;
    writeFileSync(
      path.join(
        claimResult.claimDirectory,
        ...slot.outputRelativePath.split('/'),
      ),
      rgbaPng(seed),
      { flag: 'wx', mode: 0o600 },
    );
  }
  if (options.extraFile) {
    writeFileSync(path.join(outputRoot, 'unexpected.txt'), 'unexpected\n', {
      flag: 'wx',
      mode: 0o600,
    });
  }
  return outputRoot;
}

test('initializes the exact eight-packet queue and verifies replay', () => {
  const { parent, queueRoot } = createQueue();
  try {
    const packetSet = verifyQueuePacketSet(queueRoot);
    assert.equal(packetSet.packetCount, 8);
    assert.equal(packetSet.candidateCount, 80);
    const status = inspectEvaTalkNeutralLocalQueueStatus({
      queueRoot,
      observedAt: '2026-08-28T00:01:01.000Z',
    });
    assert.deepEqual(status.counts, {
      pending: 8,
      claimed: 0,
      completed: 0,
      failed: 0,
      orphans: 0,
      total: 8,
    });
    const replay = initializeEvaTalkNeutralLocalQueue({
      queueRoot,
      campaign: CAMPAIGN,
      initializedAt: '2026-08-28T00:01:02.000Z',
    });
    assert.equal(replay.status, 'already-initialized');
    assert.equal(replay.counts.pending, 8);
  } finally {
    cleanup(parent);
  }
});

test('claims atomically, binds the worker and extends the lease by heartbeat', () => {
  const { parent, queueRoot } = createQueue();
  try {
    const claimed = claimNextEvaTalkNeutralLocalJob({
      queueRoot,
      workerId: 'eva-worker-01',
      claimedAt: '2026-08-28T00:02:00.000Z',
      leaseSeconds: 300,
    });
    assert.equal(claimed.status, 'claimed');
    assert.equal(claimed.packet.jobId, 'eva-talk-neutral-batch-01');
    assert.ok(
      !existsSync(path.join(queueRoot, 'pending', claimed.packet.jobId)),
    );
    assert.ok(existsSync(claimed.claimDirectory));
    expectCode('EVA_TALK_NEUTRAL_QUEUE_WORKER_MISMATCH', () =>
      heartbeatEvaTalkNeutralLocalClaim({
        queueRoot,
        claimId: claimed.claim.claimId,
        workerId: 'other-worker',
        heartbeatAt: '2026-08-28T00:03:00.000Z',
        leaseSeconds: 300,
      }),
    );
    const heartbeat = heartbeatEvaTalkNeutralLocalClaim({
      queueRoot,
      claimId: claimed.claim.claimId,
      workerId: 'eva-worker-01',
      heartbeatAt: '2026-08-28T00:03:00.000Z',
      leaseSeconds: 300,
    });
    assert.equal(heartbeat.heartbeat.heartbeatSequence, 1);
    assert.equal(
      heartbeat.heartbeat.previousLeaseExpiresAt,
      '2026-08-28T00:07:00.000Z',
    );
    assert.equal(
      heartbeat.heartbeat.leaseExpiresAt,
      '2026-08-28T00:08:00.000Z',
    );
    const loaded = loadEvaTalkNeutralLocalClaim(
      queueRoot,
      claimed.claim.claimId,
    );
    assert.equal(loaded.claim.claimSha256, claimed.claim.claimSha256);
  } finally {
    cleanup(parent);
  }
});

test('prepares and completes only ten exact unique PNG bodies', () => {
  const { parent, queueRoot } = createQueue();
  try {
    const claimed = claimNextEvaTalkNeutralLocalJob({
      queueRoot,
      workerId: 'eva-worker-02',
      claimedAt: '2026-08-28T00:02:00.000Z',
      leaseSeconds: 600,
    });
    writeOutputs(claimed, { seedBase: 200 });
    const prepared = prepareEvaTalkNeutralOutputManifest({
      queueRoot,
      claimId: claimed.claim.claimId,
      workerId: 'eva-worker-02',
      preparedAt: '2026-08-28T00:03:00.000Z',
    });
    assert.equal(prepared.status, 'prepared');
    assert.equal(prepared.manifest.outputCount, 10);
    assert.equal(
      new Set(prepared.manifest.outputs.map((entry) => entry.sha256)).size,
      10,
    );
    for (const output of prepared.manifest.outputs) {
      assert.equal(output.png.width, 1024);
      assert.equal(output.png.height, 1536);
      assert.equal(output.png.colourType, 6);
      assert.equal(output.png.bitDepth, 8);
    }
    const replay = prepareEvaTalkNeutralOutputManifest({
      queueRoot,
      claimId: claimed.claim.claimId,
      workerId: 'eva-worker-02',
      preparedAt: '2026-08-28T00:03:01.000Z',
    });
    assert.equal(replay.status, 'already-prepared');

    const completed = completeEvaTalkNeutralLocalClaim({
      queueRoot,
      claimId: claimed.claim.claimId,
      workerId: 'eva-worker-02',
      completedAt: '2026-08-28T00:04:00.000Z',
    });
    assert.equal(completed.status, 'completed');
    assert.equal(completed.completion.candidateApprovalGranted, false);
    assert.equal(completed.completion.semanticOrderingAuthority, false);
    assert.ok(
      existsSync(path.join(completed.completedDirectory, 'completion.json')),
    );
    assert.ok(!existsSync(claimed.claimDirectory));

    const idempotent = completeEvaTalkNeutralLocalClaim({
      queueRoot,
      claimId: claimed.claim.claimId,
      workerId: 'eva-worker-02',
      completedAt: '2026-08-28T00:04:01.000Z',
    });
    assert.equal(idempotent.status, 'already-completed');

    const status = inspectEvaTalkNeutralLocalQueueStatus({
      queueRoot,
      observedAt: '2026-08-28T00:04:02.000Z',
    });
    assert.equal(status.counts.completed, 1);
    assert.equal(status.counts.pending, 7);
  } finally {
    cleanup(parent);
  }
});

test('rejects partial, extra, duplicate and malformed PNG output evidence', () => {
  const cases = [
    {
      name: 'partial',
      options: { count: 9 },
      code: 'EVA_TALK_NEUTRAL_QUEUE_OUTPUT_SET_INVALID',
    },
    {
      name: 'extra',
      options: { extraFile: true },
      code: 'EVA_TALK_NEUTRAL_QUEUE_OUTPUT_SET_INVALID',
    },
    {
      name: 'duplicate',
      options: { duplicate: true },
      code: 'EVA_TALK_NEUTRAL_QUEUE_OUTPUT_BODIES_NOT_UNIQUE',
    },
  ];
  for (const entry of cases) {
    const { parent, queueRoot } = createQueue();
    try {
      const claimed = claimNextEvaTalkNeutralLocalJob({
        queueRoot,
        workerId: `worker-${entry.name}`,
        claimedAt: '2026-08-28T00:02:00.000Z',
        leaseSeconds: 600,
      });
      writeOutputs(claimed, entry.options);
      expectCode(entry.code, () =>
        prepareEvaTalkNeutralOutputManifest({
          queueRoot,
          claimId: claimed.claim.claimId,
          workerId: `worker-${entry.name}`,
          preparedAt: '2026-08-28T00:03:00.000Z',
        }),
      );
    } finally {
      cleanup(parent);
    }
  }

  const valid = rgbaPng(991);
  const inspection = inspectEvaTalkNeutralCandidatePng(valid);
  assert.equal(inspection.rgba8StraightAlphaCompatible, true);
  const damaged = Buffer.from(valid);
  damaged[damaged.length - 1] ^= 0xff;
  expectCode('EVA_TALK_NEUTRAL_QUEUE_PNG_CRC_INVALID', () =>
    inspectEvaTalkNeutralCandidatePng(damaged),
  );
});

test('records a bounded failure receipt without authorising retry', () => {
  const { parent, queueRoot } = createQueue();
  try {
    const claimed = claimNextEvaTalkNeutralLocalJob({
      queueRoot,
      workerId: 'eva-worker-failure',
      claimedAt: '2026-08-28T00:02:00.000Z',
      leaseSeconds: 300,
    });
    const failed = failEvaTalkNeutralLocalClaim({
      queueRoot,
      claimId: claimed.claim.claimId,
      workerId: 'eva-worker-failure',
      failedAt: '2026-08-28T00:03:00.000Z',
      failureCode: 'LOCAL_RENDER_FAILED',
      failureMessage: 'The local renderer stopped before producing outputs.',
    });
    assert.equal(failed.status, 'failed');
    assert.equal(failed.failure.retryAuthorized, false);
    assert.equal(failed.failure.candidateApprovalGranted, false);
    assert.ok(existsSync(path.join(failed.failedDirectory, 'failure.json')));
    const idempotent = failEvaTalkNeutralLocalClaim({
      queueRoot,
      claimId: claimed.claim.claimId,
      workerId: 'eva-worker-failure',
      failedAt: '2026-08-28T00:03:01.000Z',
      failureCode: 'IGNORED_ON_IDEMPOTENT_REPLAY',
      failureMessage:
        'The original immutable failure receipt remains authoritative.',
    });
    assert.equal(idempotent.status, 'already-failed');
    assert.equal(idempotent.failure.failureSha256, failed.failure.failureSha256);
    const status = inspectEvaTalkNeutralLocalQueueStatus({
      queueRoot,
      observedAt: '2026-08-28T00:03:01.000Z',
    });
    assert.equal(status.counts.failed, 1);
    assert.equal(status.counts.pending, 7);
  } finally {
    cleanup(parent);
  }
});

test('requeues only expired claims with no worker evidence', () => {
  const { parent, queueRoot } = createQueue();
  try {
    const clean = claimNextEvaTalkNeutralLocalJob({
      queueRoot,
      workerId: 'eva-worker-clean-expiry',
      claimedAt: '2026-08-28T00:02:00.000Z',
      leaseSeconds: 60,
    });
    const evidenced = claimNextEvaTalkNeutralLocalJob({
      queueRoot,
      workerId: 'eva-worker-evidenced-expiry',
      claimedAt: '2026-08-28T00:02:00.000Z',
      leaseSeconds: 60,
    });
    writeFileSync(
      path.join(evidenced.claimDirectory, 'progress.json'),
      '{}\n',
      { flag: 'wx', mode: 0o600 },
    );
    const result = requeueExpiredEvaTalkNeutralLocalClaims({
      queueRoot,
      requeuedAt: '2026-08-28T00:04:00.000Z',
    });
    assert.equal(result.requeued.length, 1);
    assert.equal(result.requeued[0].claimId, clean.claim.claimId);
    assert.equal(result.blocked.length, 1);
    assert.equal(result.blocked[0].claimId, evidenced.claim.claimId);
    assert.equal(result.blocked[0].reason, 'worker-evidence-present');
    assert.ok(
      existsSync(
        path.join(queueRoot, 'pending', clean.packet.jobId, 'packet.json'),
      ),
    );
    assert.ok(
      existsSync(path.join(queueRoot, 'claimed', evidenced.claim.claimId)),
    );
    assert.ok(
      existsSync(
        path.join(
          queueRoot,
          'receipts',
          'requeue',
          `${clean.claim.claimId}.json`,
        ),
      ),
    );
  } finally {
    cleanup(parent);
  }
});

test('recovers only packet-only claim orphans', () => {
  const { parent, queueRoot } = createQueue();
  try {
    const claimed = claimNextEvaTalkNeutralLocalJob({
      queueRoot,
      workerId: 'eva-worker-orphan',
      claimedAt: '2026-08-28T00:02:00.000Z',
      leaseSeconds: 300,
    });
    unlinkSync(path.join(claimed.claimDirectory, 'claim.json'));
    const statusBefore = inspectEvaTalkNeutralLocalQueueStatus({
      queueRoot,
      observedAt: '2026-08-28T00:02:30.000Z',
    });
    assert.equal(statusBefore.counts.orphans, 1);
    const recovered = recoverEvaTalkNeutralPacketOnlyOrphans(queueRoot);
    assert.equal(recovered.recovered.length, 1);
    assert.equal(recovered.recovered[0].jobId, claimed.packet.jobId);
    assert.ok(
      existsSync(
        path.join(queueRoot, 'pending', claimed.packet.jobId, 'packet.json'),
      ),
    );
    assert.ok(!existsSync(claimed.claimDirectory));
  } finally {
    cleanup(parent);
  }
});

test('rejects stale workers and output mutation after manifest preparation', () => {
  const { parent, queueRoot } = createQueue();
  try {
    const claimed = claimNextEvaTalkNeutralLocalJob({
      queueRoot,
      workerId: 'eva-worker-mutation',
      claimedAt: '2026-08-28T00:02:00.000Z',
      leaseSeconds: 600,
    });
    writeOutputs(claimed, { seedBase: 500 });
    expectCode('EVA_TALK_NEUTRAL_QUEUE_WORKER_MISMATCH', () =>
      prepareEvaTalkNeutralOutputManifest({
        queueRoot,
        claimId: claimed.claim.claimId,
        workerId: 'wrong-worker',
        preparedAt: '2026-08-28T00:03:00.000Z',
      }),
    );
    prepareEvaTalkNeutralOutputManifest({
      queueRoot,
      claimId: claimed.claim.claimId,
      workerId: 'eva-worker-mutation',
      preparedAt: '2026-08-28T00:03:00.000Z',
    });
    const first = claimed.packet.slots[0];
    writeFileSync(
      path.join(
        claimed.claimDirectory,
        ...first.outputRelativePath.split('/'),
      ),
      rgbaPng(999),
      { flag: 'w', mode: 0o600 },
    );
    expectCode('EVA_TALK_NEUTRAL_QUEUE_OUTPUTS_CHANGED_AFTER_MANIFEST', () =>
      completeEvaTalkNeutralLocalClaim({
        queueRoot,
        claimId: claimed.claim.claimId,
        workerId: 'eva-worker-mutation',
        completedAt: '2026-08-28T00:04:00.000Z',
      }),
    );
  } finally {
    cleanup(parent);
  }
});

test('completed replay re-verifies the immutable claim, manifest and output bodies', () => {
  const { parent, queueRoot } = createQueue();
  try {
    const claimed = claimNextEvaTalkNeutralLocalJob({
      queueRoot,
      workerId: 'eva-worker-completed-integrity',
      claimedAt: '2026-08-28T00:02:00.000Z',
      leaseSeconds: 600,
    });
    writeOutputs(claimed, { seedBase: 800 });
    const completed = completeEvaTalkNeutralLocalClaim({
      queueRoot,
      claimId: claimed.claim.claimId,
      workerId: 'eva-worker-completed-integrity',
      completedAt: '2026-08-28T00:03:00.000Z',
    });
    const first = claimed.packet.slots[0];
    writeFileSync(
      path.join(
        completed.completedDirectory,
        ...first.outputRelativePath.split('/'),
      ),
      rgbaPng(1234),
      { flag: 'w', mode: 0o600 },
    );
    expectCode('EVA_TALK_NEUTRAL_QUEUE_OUTPUTS_CHANGED_AFTER_MANIFEST', () =>
      completeEvaTalkNeutralLocalClaim({
        queueRoot,
        claimId: claimed.claim.claimId,
        workerId: 'eva-worker-completed-integrity',
        completedAt: '2026-08-28T00:03:01.000Z',
      }),
    );
  } finally {
    cleanup(parent);
  }
});

test('rejects claims and completion after lease expiry', () => {
  const { parent, queueRoot } = createQueue();
  try {
    const claimed = claimNextEvaTalkNeutralLocalJob({
      queueRoot,
      workerId: 'eva-worker-expired',
      claimedAt: '2026-08-28T00:02:00.000Z',
      leaseSeconds: 60,
    });
    writeOutputs(claimed, { seedBase: 700 });
    expectCode('EVA_TALK_NEUTRAL_QUEUE_CLAIM_EXPIRED', () =>
      completeEvaTalkNeutralLocalClaim({
        queueRoot,
        claimId: claimed.claim.claimId,
        workerId: 'eva-worker-expired',
        completedAt: '2026-08-28T00:04:00.000Z',
      }),
    );
  } finally {
    cleanup(parent);
  }
});
