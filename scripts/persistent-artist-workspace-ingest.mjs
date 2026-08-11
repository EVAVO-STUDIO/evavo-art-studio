#!/usr/bin/env node
import process from 'node:process';

import {
  compileWorkspaceIngest,
  ingestCapabilities,
  loadIngestPlan,
  loadIngestRequest,
  runWorkspaceIngest,
} from './project-art/persistent-workspace-ingest.mjs';

function parseArguments(argv) {
  const [command, ...rest] = argv;
  if (!command) throw new Error('Command is required: capabilities, compile-ingest, or run-ingest.');
  const values = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!flag?.startsWith('--') || value === undefined) {
      throw new Error(`Invalid argument pair near ${flag ?? '<end>'}.`);
    }
    if (values.has(flag)) throw new Error(`Duplicate argument: ${flag}.`);
    values.set(flag, value);
  }
  return { command, values };
}

function required(values, flag) {
  const value = values.get(flag);
  if (!value) throw new Error(`${flag} is required.`);
  return value;
}

function optional(values, flag) {
  return values.get(flag);
}

async function main() {
  const { command, values } = parseArguments(process.argv.slice(2));
  let result;
  if (command === 'capabilities') {
    if (values.size > 0) throw new Error('capabilities accepts no arguments.');
    result = ingestCapabilities();
  } else if (command === 'compile-ingest') {
    const workspaceRoot = required(values, '--workspace-root');
    const requestPath = required(values, '--request');
    const outputPath = required(values, '--output');
    const { value: request, bytes: requestBytes } = await loadIngestRequest(requestPath);
    const plan = await compileWorkspaceIngest({
      workspaceRoot,
      request,
      requestBytes,
      outputPath,
      ...(optional(values, '--compiled-at') ? { compiledAt: optional(values, '--compiled-at') } : {}),
    });
    result = {
      status: 'passed',
      schema: plan.schema,
      workspaceId: plan.workspaceId,
      projectId: plan.projectId,
      ingestId: plan.ingestId,
      itemCount: plan.itemCount,
      aggregateSourceBytes: plan.aggregateSourceBytes,
      outputPath,
      planSha256: plan.documentSha256,
      sourceMutation: false,
      sourceDeletion: false,
      storageWrite: false,
      repositoryMutation: false,
      publication: false,
    };
  } else if (command === 'run-ingest') {
    const workspaceRoot = required(values, '--workspace-root');
    const planPath = required(values, '--plan');
    const plan = await loadIngestPlan(planPath);
    result = await runWorkspaceIngest(workspaceRoot, plan);
  } else {
    throw new Error(`Unsupported command: ${command}.`);
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  const code = typeof error?.code === 'string' ? error.code : 'PERSISTENT_ARTIST_WORKSPACE_INGEST_ERROR';
  process.stderr.write(`${code}: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
