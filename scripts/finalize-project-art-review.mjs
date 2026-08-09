#!/usr/bin/env node
import process from 'node:process';

import { finalizeProjectArtReviewFiles } from './project-art/review-studio.mjs';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : undefined;
}

const plan = argument('--plan');
const decisions = argument('--decisions');
const outputRoot = argument('--output-root');
if (!plan || !decisions || !outputRoot) {
  throw new Error(
    'usage: finalize-project-art-review.mjs --plan <plan.json> --decisions <draft.json> --output-root <workspace-relative-or-confined-absolute-path>',
  );
}
const result = await finalizeProjectArtReviewFiles(plan, decisions, outputRoot);
console.log(JSON.stringify({
  status: 'passed',
  schema: result.receipt.schema,
  reviewId: result.receipt.reviewId,
  decisionSha256: result.decisions.decisionSha256,
  receiptSha256: result.receipt.receiptSha256,
  outputRoot: result.outputRoot,
  independentApprovalPerformed: false,
  promotionPerformed: false,
  repositoryMutation: false,
}));
