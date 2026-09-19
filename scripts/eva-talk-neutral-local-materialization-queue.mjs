#!/usr/bin/env node
import process from 'node:process';

import {
  EvaTalkNeutralLocalQueueError,
  claimNextEvaTalkNeutralLocalJob,
  completeEvaTalkNeutralLocalClaim,
  evaTalkNeutralLocalQueueCapabilities,
  failEvaTalkNeutralLocalClaim,
  heartbeatEvaTalkNeutralLocalClaim,
  initializeEvaTalkNeutralLocalQueue,
  inspectEvaTalkNeutralLocalQueueStatus,
  loadEvaTalkNeutralLocalCampaign,
  prepareEvaTalkNeutralOutputManifest,
  recoverEvaTalkNeutralPacketOnlyOrphans,
  requeueExpiredEvaTalkNeutralLocalClaims,
} from './project-art/eva-talk-neutral-local-materialization-queue.mjs';

const args = process.argv.slice(2);
const command = args[0] ?? 'help';

function option(name, fallback = undefined) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (index + 1 >= args.length || args[index + 1].startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return args[index + 1];
}

function required(name) {
  const value = option(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function integerOption(name, fallback) {
  const raw = option(name, String(fallback));
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new Error(`${name} must be an integer`);
  return value;
}

function now(optionName) {
  return option(optionName, new Date().toISOString());
}

function usage() {
  return {
    schema: 'evavo.project-art-eva-talk-neutral-local-materialization-queue-cli.v1',
    commands: {
      capabilities: 'print the closed local queue capability surface',
      init: '--queue-root <absolute> --campaign <json> [--at <UTC>]',
      claim:
        '--queue-root <absolute> --worker-id <id> [--lease-seconds 300] [--at <UTC>]',
      heartbeat:
        '--queue-root <absolute> --claim-id <id> --worker-id <id> [--lease-seconds 300] [--at <UTC>]',
      prepare:
        '--queue-root <absolute> --claim-id <id> --worker-id <id> [--at <UTC>]',
      complete:
        '--queue-root <absolute> --claim-id <id> --worker-id <id> [--at <UTC>]',
      fail:
        '--queue-root <absolute> --claim-id <id> --worker-id <id> --failure-code <CODE> --failure-message <text> [--at <UTC>]',
      'recover-orphans': '--queue-root <absolute>',
      'requeue-expired': '--queue-root <absolute> [--at <UTC>]',
      status: '--queue-root <absolute> [--at <UTC>]',
    },
    authority: {
      networkAccess: false,
      providerExecution: false,
      candidateApproval: false,
      candidatePromotion: false,
      publication: false,
      runtimeActivation: false,
      deployment: false,
      gitMutation: false,
    },
  };
}

async function execute() {
  switch (command) {
    case 'help':
    case '--help':
    case '-h':
      return usage();
    case 'capabilities':
      return evaTalkNeutralLocalQueueCapabilities();
    case 'init':
      return initializeEvaTalkNeutralLocalQueue({
        queueRoot: required('--queue-root'),
        campaign: loadEvaTalkNeutralLocalCampaign(required('--campaign')),
        initializedAt: now('--at'),
      });
    case 'claim':
      return claimNextEvaTalkNeutralLocalJob({
        queueRoot: required('--queue-root'),
        workerId: required('--worker-id'),
        claimedAt: now('--at'),
        leaseSeconds: integerOption('--lease-seconds', 300),
      });
    case 'heartbeat':
      return heartbeatEvaTalkNeutralLocalClaim({
        queueRoot: required('--queue-root'),
        claimId: required('--claim-id'),
        workerId: required('--worker-id'),
        heartbeatAt: now('--at'),
        leaseSeconds: integerOption('--lease-seconds', 300),
      });
    case 'prepare':
      return prepareEvaTalkNeutralOutputManifest({
        queueRoot: required('--queue-root'),
        claimId: required('--claim-id'),
        workerId: required('--worker-id'),
        preparedAt: now('--at'),
      });
    case 'complete':
      return completeEvaTalkNeutralLocalClaim({
        queueRoot: required('--queue-root'),
        claimId: required('--claim-id'),
        workerId: required('--worker-id'),
        completedAt: now('--at'),
      });
    case 'fail':
      return failEvaTalkNeutralLocalClaim({
        queueRoot: required('--queue-root'),
        claimId: required('--claim-id'),
        workerId: required('--worker-id'),
        failedAt: now('--at'),
        failureCode: required('--failure-code'),
        failureMessage: required('--failure-message'),
      });
    case 'recover-orphans':
      return recoverEvaTalkNeutralPacketOnlyOrphans(required('--queue-root'));
    case 'requeue-expired':
      return requeueExpiredEvaTalkNeutralLocalClaims({
        queueRoot: required('--queue-root'),
        requeuedAt: now('--at'),
      });
    case 'status':
      return inspectEvaTalkNeutralLocalQueueStatus({
        queueRoot: required('--queue-root'),
        observedAt: now('--at'),
      });
    default:
      throw new Error(`unknown command: ${command}`);
  }
}

try {
  const result = await execute();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  const code =
    error instanceof EvaTalkNeutralLocalQueueError
      ? error.code
      : 'EVA_TALK_NEUTRAL_QUEUE_CLI_INVALID';
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      code,
      message: error instanceof Error ? error.message : String(error),
    })}\n`,
  );
  process.exitCode = 1;
}
