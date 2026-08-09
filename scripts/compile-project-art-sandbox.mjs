#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  parseCliArguments,
  readJsonFileBounded,
  writeJsonCreateOnly,
} from './project-art/common.mjs';
import { compileProjectArtSandbox } from './project-art/sandbox.mjs';

const args = parseCliArguments(process.argv.slice(2));
if (!args['workspace-root'] || !args.request || !args.output) {
  throw new Error(
    'usage: compile-project-art-sandbox.mjs --workspace-root <path> --request <request.json> --output <plan.json> [--compiled-at <ISO>] [--registry <registry.json>]',
  );
}
const requestPath = path.resolve(args.request);
const registryPath = path.resolve(
  args.registry || fileURLToPath(new URL('../config/project-art-operations.v1.json', import.meta.url)),
);
const [{ value: request, bytes: requestBytes }, { value: registry, bytes: registryBytes }] =
  await Promise.all([
    readJsonFileBounded(requestPath, 'sandbox request'),
    readJsonFileBounded(registryPath, 'project-art operation registry'),
  ]);
const plan = await compileProjectArtSandbox({
  workspaceRoot: args['workspace-root'],
  request,
  requestBytes,
  registry,
  registryBytes,
  ...(args['compiled-at'] ? { compiledAt: args['compiled-at'] } : {}),
});
const output = path.resolve(args.output);
await writeJsonCreateOnly(output, plan);
console.log(
  JSON.stringify({
    status: 'passed',
    schema: plan.schema,
    sandboxId: plan.sandboxId,
    tasks: plan.tasks.length,
    externalSources: plan.externalSources.length,
    documentSha256: plan.documentSha256,
    output,
  }),
);
