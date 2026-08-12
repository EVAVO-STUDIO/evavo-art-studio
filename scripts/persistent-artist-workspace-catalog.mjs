#!/usr/bin/env node
import process from 'node:process';

import {
  catalogCapabilities,
  compileWorkspaceCatalog,
  queryWorkspaceCatalog,
  readStableJsonFile,
  runWorkspaceCatalog,
  verifyWorkspaceCatalog,
} from './project-art/persistent-workspace-catalog.mjs';

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = rest[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for --${key}.`);
    if (options[key] !== undefined) throw new Error(`Duplicate option: --${key}.`);
    options[key] = value;
    index += 1;
  }
  return { command, options };
}

function requireOption(options, key) {
  const value = options[key];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing --${key}.`);
  return value;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  switch (command) {
    case 'capabilities':
      print(catalogCapabilities());
      return;
    case 'compile': {
      const requestPath = requireOption(options, 'request');
      const { value: request, bytes } = await readStableJsonFile(requestPath, 'catalog request');
      const plan = await compileWorkspaceCatalog({
        workspaceRoot: requireOption(options, 'workspace-root'),
        request,
        requestBytes: bytes,
        outputPath: requireOption(options, 'output'),
        ...(options['compiled-at'] ? { compiledAt: options['compiled-at'] } : {}),
      });
      print({
        schema: plan.schema,
        catalogId: plan.catalogId,
        workspaceId: plan.workspaceId,
        projectId: plan.projectId,
        fileCount: plan.statistics.fileCount,
        aggregateBytes: plan.statistics.aggregateBytes,
        duplicateGroupCount: plan.statistics.duplicateGroupCount,
        planSha256: plan.documentSha256,
        outputPath: options.output,
      });
      return;
    }
    case 'run': {
      const { value: plan } = await readStableJsonFile(requireOption(options, 'plan'), 'catalog plan');
      const result = await runWorkspaceCatalog(plan);
      print({
        schema: result.receipt.schema,
        catalogId: result.receipt.catalogId,
        workspaceId: result.receipt.workspaceId,
        fileCount: result.receipt.fileCount,
        aggregateBytes: result.receipt.aggregateBytes,
        catalogSha256: result.receipt.catalogSha256,
        receiptSha256: result.receipt.documentSha256,
        catalogPath: result.catalogPath,
        receiptPath: result.receiptPath,
      });
      return;
    }
    case 'query': {
      let query = {};
      if (options.query) {
        ({ value: query } = await readStableJsonFile(options.query, 'catalog query'));
      }
      const result = await queryWorkspaceCatalog({
        workspaceRoot: requireOption(options, 'workspace-root'),
        catalogId: requireOption(options, 'catalog-id'),
        query,
      });
      print(result);
      return;
    }
    case 'verify': {
      const result = await verifyWorkspaceCatalog({
        workspaceRoot: requireOption(options, 'workspace-root'),
        catalogId: requireOption(options, 'catalog-id'),
      });
      print(result);
      if (!result.current) process.exitCode = 2;
      return;
    }
    default:
      throw new Error(
        'Usage: persistent-artist-workspace-catalog.mjs ' +
        '<capabilities|compile|run|query|verify> [options]',
      );
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    ok: false,
    code: error?.code ?? 'PERSISTENT_WORKSPACE_CATALOG_CLI_ERROR',
    message: error instanceof Error ? error.message : String(error),
  })}\n`);
  process.exitCode = 1;
});
