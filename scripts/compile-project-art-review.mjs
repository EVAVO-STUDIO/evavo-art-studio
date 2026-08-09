#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';

import { compileProjectArtReviewFile } from './project-art/review-studio.mjs';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : undefined;
}

const workspaceRoot = argument('--workspace-root');
const request = argument('--request');
const output = argument('--output');
const compiledAt = argument('--compiled-at');
if (!workspaceRoot || !request || !output) {
  throw new Error(
    'usage: compile-project-art-review.mjs --workspace-root <root> --request <request.json> --output <plan.json> [--compiled-at <canonical UTC>]',
  );
}

const plan = await compileProjectArtReviewFile(request, output, {
  workspaceRoot,
  ...(compiledAt ? { compiledAt } : {}),
});
console.log(JSON.stringify({
  status: 'passed',
  schema: plan.schema,
  reviewId: plan.reviewId,
  groupCount: plan.groups.length,
  itemCount: plan.sourceSummary.itemCount,
  planSha256: plan.planSha256,
  output: path.resolve(output),
  providerExecution: false,
  approvalPerformed: false,
  repositoryMutation: false,
}));
