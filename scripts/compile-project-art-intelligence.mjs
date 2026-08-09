#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';

import {
  boundedInteger,
  parseCliArguments,
  parseRootBinding,
  writeJsonCreateOnly,
} from './project-art/common.mjs';
import { compileProjectArtIntelligence } from './project-art/intelligence.mjs';

const args = parseCliArguments(process.argv.slice(2), { repeated: new Set(['art-root']) });
if (!args['project-root'] || !args.output) {
  throw new Error(
    'usage: compile-project-art-intelligence.mjs --project-root <path> [--art-root id=path] [--config <path>] --output <file> [--project-id <id>] [--generated-at <ISO>] [--maximum-files <n>] [--maximum-text-bytes <n>] [--maximum-hash-bytes <n>]',
  );
}
const optionalInteger = (name) =>
  args[name] === undefined
    ? undefined
    : boundedInteger(Number(args[name]), name, 1, Number.MAX_SAFE_INTEGER);
const document = await compileProjectArtIntelligence({
  projectRoot: args['project-root'],
  artRoots: (args['art-root'] || []).map(parseRootBinding),
  ...(args.config ? { configPath: args.config } : {}),
  ...(args['project-id'] ? { projectId: args['project-id'] } : {}),
  ...(args['generated-at'] ? { generatedAt: args['generated-at'] } : {}),
  ...(optionalInteger('maximum-files') ? { maximumFiles: optionalInteger('maximum-files') } : {}),
  ...(optionalInteger('maximum-text-bytes') ? { maximumTextBytes: optionalInteger('maximum-text-bytes') } : {}),
  ...(optionalInteger('maximum-hash-bytes') ? { maximumHashBytes: optionalInteger('maximum-hash-bytes') } : {}),
});
const output = path.resolve(args.output);
await writeJsonCreateOnly(output, document);
console.log(
  JSON.stringify({
    status: 'passed',
    schema: document.schema,
    projectId: document.projectId,
    files: document.summary.totalFiles,
    actionableItems: document.summary.actionableItems,
    documentSha256: document.documentSha256,
    output,
  }),
);
