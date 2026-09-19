import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(
  ROOT,
  'scripts/eva-talk-neutral-local-materialization-queue.mjs',
);
const execFileAsync = promisify(execFile);
const CAMPAIGN = path.join(
  ROOT,
  'config/eva-talk-neutral-local-materialization-campaign-v1.json',
);

function run(args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false,
    env: { ...process.env },
  });
  assert.equal(
    result.status,
    expectedStatus,
    `command failed: ${args.join(' ')}\nstdout=${result.stdout}\nstderr=${result.stderr}`,
  );
  const source = expectedStatus === 0 ? result.stdout : result.stderr;
  assert.ok(source.trim().length > 0);
  return JSON.parse(source);
}

test('CLI exposes a closed capability surface and complete help', () => {
  const capabilities = run(['capabilities']);
  assert.equal(capabilities.exactBatchCount, 8);
  assert.equal(capabilities.exactImagesPerBatch, 10);
  assert.equal(capabilities.exactCandidateCount, 80);
  assert.equal(capabilities.networkAccess, false);
  assert.equal(capabilities.providerExecution, false);
  assert.equal(capabilities.runtimeActivation, false);
  assert.equal(capabilities.gitMutation, false);

  const help = run(['help']);
  for (const command of [
    'init',
    'claim',
    'heartbeat',
    'prepare',
    'complete',
    'fail',
    'recover-orphans',
    'requeue-expired',
    'status',
  ]) {
    assert.equal(typeof help.commands[command], 'string');
  }
});

test('CLI performs a real local init, claim, heartbeat, failure and status lifecycle', () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), 'eva-talk-neutral-cli-test-'));
  const queueRoot = path.join(parent, 'queue');
  try {
    const initialized = run([
      'init',
      '--queue-root',
      queueRoot,
      '--campaign',
      CAMPAIGN,
      '--at',
      '2026-08-28T00:01:00.000Z',
    ]);
    assert.equal(initialized.status, 'initialized');
    assert.equal(initialized.counts.pending, 8);

    const claimed = run([
      'claim',
      '--queue-root',
      queueRoot,
      '--worker-id',
      'cli-worker-01',
      '--lease-seconds',
      '300',
      '--at',
      '2026-08-28T00:02:00.000Z',
    ]);
    assert.equal(claimed.status, 'claimed');
    assert.match(
      claimed.claim.claimId,
      /^eva-talk-neutral-batch-01--[a-f0-9]{16}$/u,
    );

    const heartbeat = run([
      'heartbeat',
      '--queue-root',
      queueRoot,
      '--claim-id',
      claimed.claim.claimId,
      '--worker-id',
      'cli-worker-01',
      '--lease-seconds',
      '300',
      '--at',
      '2026-08-28T00:03:00.000Z',
    ]);
    assert.equal(heartbeat.status, 'heartbeat-recorded');
    assert.equal(heartbeat.heartbeat.heartbeatSequence, 1);

    const wrongWorker = run(
      [
        'fail',
        '--queue-root',
        queueRoot,
        '--claim-id',
        claimed.claim.claimId,
        '--worker-id',
        'cli-worker-wrong',
        '--failure-code',
        'LOCAL_RENDER_FAILED',
        '--failure-message',
        'Wrong worker must not close this claim.',
        '--at',
        '2026-08-28T00:03:10.000Z',
      ],
      1,
    );
    assert.equal(wrongWorker.ok, false);
    assert.equal(wrongWorker.code, 'EVA_TALK_NEUTRAL_QUEUE_WORKER_MISMATCH');

    const failed = run([
      'fail',
      '--queue-root',
      queueRoot,
      '--claim-id',
      claimed.claim.claimId,
      '--worker-id',
      'cli-worker-01',
      '--failure-code',
      'LOCAL_RENDER_FAILED',
      '--failure-message',
      'The bounded local worker stopped before producing all ten files.',
      '--at',
      '2026-08-28T00:03:20.000Z',
    ]);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.failure.retryAuthorized, false);
    assert.equal(failed.failure.candidateApprovalGranted, false);
    assert.ok(existsSync(path.join(failed.failedDirectory, 'failure.json')));

    const status = run([
      'status',
      '--queue-root',
      queueRoot,
      '--at',
      '2026-08-28T00:03:30.000Z',
    ]);
    assert.deepEqual(status.counts, {
      pending: 7,
      claimed: 0,
      completed: 0,
      failed: 1,
      orphans: 0,
      total: 8,
    });

    const storedFailure = JSON.parse(
      readFileSync(path.join(failed.failedDirectory, 'failure.json'), 'utf8'),
    );
    assert.equal(storedFailure.failureSha256, failed.failure.failureSha256);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('concurrent CLI workers atomically claim each packet at most once', async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), 'eva-talk-neutral-cli-race-'));
  const queueRoot = path.join(parent, 'queue');
  try {
    run([
      'init',
      '--queue-root',
      queueRoot,
      '--campaign',
      CAMPAIGN,
      '--at',
      '2026-08-28T00:01:00.000Z',
    ]);

    const results = await Promise.all(
      Array.from({ length: 12 }, async (_, index) => {
        const { stdout, stderr } = await execFileAsync(
          process.execPath,
          [
            CLI,
            'claim',
            '--queue-root',
            queueRoot,
            '--worker-id',
            `race-worker-${String(index + 1).padStart(2, '0')}`,
            '--lease-seconds',
            '300',
            '--at',
            '2026-08-28T00:02:00.000Z',
          ],
          { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 },
        );
        assert.equal(stderr, '');
        return JSON.parse(stdout);
      }),
    );

    const claimed = results.filter((result) => result.status === 'claimed');
    const empty = results.filter((result) => result.status === 'empty');
    assert.equal(claimed.length, 8);
    assert.equal(empty.length, 4);
    assert.equal(new Set(claimed.map((result) => result.claim.claimId)).size, 8);
    assert.equal(new Set(claimed.map((result) => result.packet.jobId)).size, 8);

    const status = run([
      'status',
      '--queue-root',
      queueRoot,
      '--at',
      '2026-08-28T00:02:01.000Z',
    ]);
    assert.equal(status.counts.pending, 0);
    assert.equal(status.counts.claimed, 8);
    assert.equal(status.counts.total, 8);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('CLI rejects unknown commands and invalid lease values as JSON errors', () => {
  const unknown = run(['not-a-command'], 1);
  assert.equal(unknown.ok, false);
  assert.equal(unknown.code, 'EVA_TALK_NEUTRAL_QUEUE_CLI_INVALID');

  const parent = mkdtempSync(path.join(os.tmpdir(), 'eva-talk-neutral-cli-invalid-'));
  const queueRoot = path.join(parent, 'queue');
  try {
    run([
      'init',
      '--queue-root',
      queueRoot,
      '--campaign',
      CAMPAIGN,
      '--at',
      '2026-08-28T00:01:00.000Z',
    ]);
    const invalidLease = run(
      [
        'claim',
        '--queue-root',
        queueRoot,
        '--worker-id',
        'cli-worker-02',
        '--lease-seconds',
        '59',
        '--at',
        '2026-08-28T00:02:00.000Z',
      ],
      1,
    );
    assert.equal(invalidLease.code, 'EVA_TALK_NEUTRAL_QUEUE_INTEGER_INVALID');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
