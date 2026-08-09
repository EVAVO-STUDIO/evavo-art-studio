#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';

import {
  parseCliArguments,
  readJsonFileBounded,
  writeJsonCreateOnly,
} from './project-art/common.mjs';
import { compileReferenceDerivedImagePlan } from './project-art/reference-derived.mjs';

const args = parseCliArguments(process.argv.slice(2));
if (!args['workspace-root'] || !args.request || !args.output) {
  throw new Error(
    'usage: compile-reference-derived-image-plan.mjs --workspace-root <path> --request <request.json> --output <plan.json> [--bindings <bindings.json>] [--compiled-at <ISO>]',
  );
}
const { value: request, bytes: requestBytes } = await readJsonFileBounded(
  path.resolve(args.request),
  'reference-derived request',
);
let bindings;
let bindingsBytes;
if (args.bindings) {
  const loaded = await readJsonFileBounded(path.resolve(args.bindings), 'reference-derived bindings');
  bindings = loaded.value;
  bindingsBytes = loaded.bytes;
}
const plan = await compileReferenceDerivedImagePlan({
  workspaceRoot: args['workspace-root'],
  request,
  requestBytes,
  ...(bindings === undefined ? {} : { bindings, bindingsBytes }),
  ...(args['compiled-at'] ? { compiledAt: args['compiled-at'] } : {}),
});
const output = path.resolve(args.output);
await writeJsonCreateOnly(output, plan);
console.log(
  JSON.stringify({
    status: 'passed',
    schema: plan.schema,
    requestId: plan.requestId,
    operation: plan.referenceOperation,
    providerCompilable: plan.providerCompilable,
    missingArtifactReferences: plan.missingArtifactReferenceIds.length,
    documentSha256: plan.documentSha256,
    output,
  }),
);
