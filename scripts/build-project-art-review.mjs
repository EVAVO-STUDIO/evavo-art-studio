#!/usr/bin/env node
import process from 'node:process';

import { buildProjectArtReviewBundleFile } from './project-art/review-studio.mjs';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : undefined;
}

const plan = argument('--plan');
const outputRoot = argument('--output-root');
if (!plan || !outputRoot) {
  throw new Error(
    'usage: build-project-art-review.mjs --plan <plan.json> --output-root <workspace-relative-or-confined-absolute-path>',
  );
}
const result = await buildProjectArtReviewBundleFile(plan, outputRoot);
console.log(JSON.stringify({
  status: 'passed',
  schema: result.manifest.schema,
  reviewId: result.manifest.reviewId,
  manifestSha256: result.manifest.manifestSha256,
  receiptSha256: result.receipt.receiptSha256,
  outputRoot: result.outputRoot,
  offline: true,
  approvalPerformed: false,
  repositoryMutation: false,
}));
