#!/usr/bin/env node
import process from 'node:process';

import {
  avatarFinalPassProviderCandidateCapabilities,
  materializeAvatarFinalPassProviderCandidateFiles,
} from './project-art/avatar-final-pass-provider-candidate.mjs';

function usage() {
  return [
    'Usage:',
    '  node scripts/avatar-final-pass-provider-candidate-cli.mjs capabilities',
    '  node scripts/avatar-final-pass-provider-candidate-cli.mjs materialize',
    '    --dispatch <runtime-dispatch.json>',
    '    --binding <runtime-binding.json>',
    '    --outcome <runtime-outcome.json>',
    '    --artifact-root <artifact-store-root>',
    '    --workspace-root <persistent-workspace-root>',
    '    --actor-class <human|agent>',
    '    --actor-id <id>',
    '    --authorization-evidence-sha256 <sha256>',
    '    --authorized-at <ISO timestamp>',
    '    [--materialized-at <ISO timestamp>]',
    '',
    'Build @evavo/art-artifacts before materialization:',
    '  pnpm --filter @evavo/art-artifacts build',
  ].join('\n');
}

function parseOptions(values) {
  const options = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error(`Invalid option sequence near ${key ?? '<end>'}.`);
    }
    const name = key.slice(2);
    if (options.has(name)) {
      throw new Error(`Duplicate option --${name}.`);
    }
    options.set(name, value);
  }
  return options;
}

function required(options, name) {
  const value = options.get(name);
  if (!value) throw new Error(`--${name} is required.`);
  return value;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'capabilities') {
    if (rest.length) throw new Error('capabilities accepts no options.');
    process.stdout.write(
      `${JSON.stringify(
        avatarFinalPassProviderCandidateCapabilities(),
        null,
        2,
      )}\n`,
    );
    return;
  }
  if (command !== 'materialize') {
    throw new Error(usage());
  }

  const options = parseOptions(rest);
  const result = await materializeAvatarFinalPassProviderCandidateFiles({
    dispatchPath: required(options, 'dispatch'),
    bindingPath: required(options, 'binding'),
    outcomePath: required(options, 'outcome'),
    artifactRoot: required(options, 'artifact-root'),
    workspaceRoot: required(options, 'workspace-root'),
    authorization: {
      action: 'materialize-unapproved-provider-candidate',
      actorClass: required(options, 'actor-class'),
      actorId: required(options, 'actor-id'),
      occurredAt: required(options, 'authorized-at'),
      evidenceSha256: required(
        options,
        'authorization-evidence-sha256',
      ),
    },
    ...(options.get('materialized-at')
      ? { materializedAt: options.get('materialized-at') }
      : {}),
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        status: result.status,
        reused: result.reused,
        materializationId: result.materializationId,
        candidatePath: result.candidatePath,
        receiptPath: result.receiptPath,
        finisherRequestPath: result.finisherRequestPath,
        candidateApproval: false,
        candidatePromotion: false,
        runtimeActivation: false,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify(
      {
        status: 'failed',
        code: error?.code ?? 'AVATAR_PROVIDER_CANDIDATE_CLI_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
});
