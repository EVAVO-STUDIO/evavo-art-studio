#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { compileCouncilAvatarDirectionMasterReviewHandoff } from './project-art/council-avatar-direction-master-review-handoff.mjs';

function usage() {
  return [
    'Project Art Council avatar direction-master review handoff',
    '',
    'Usage:',
    '  node scripts/compile-project-art-council-avatar-direction-master-review-handoff.mjs --execution-result <result.json> --identity-approval <approval.json> --artifact-root <artifact-store> --workspace-root <new-review-dir> [--compiled-at <canonical-UTC>]',
    '',
    'The execution must cover all six required direction views with a consistent 2-4 candidates per view. Only technically-passed mastered candidates are materialized.',
    'This command performs no provider call and grants no direction approval, promotion, animation production, runtime activation, website activation, publication or deployment authority.',
  ].join('\n');
}

const REQUIRED = new Set([
  '--execution-result',
  '--identity-approval',
  '--artifact-root',
  '--workspace-root',
]);
const SUPPORTED = new Set([...REQUIRED, '--compiled-at']);

function parse(argv) {
  if (argv.length % 2 !== 0) throw new Error(usage());
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!SUPPORTED.has(name) || !value?.trim() || values.has(name)) throw new Error(usage());
    values.set(name, value.trim());
  }
  for (const name of REQUIRED) {
    if (!values.has(name)) throw new Error(`Missing ${name}.\n\n${usage()}`);
  }
  return values;
}

export async function runCouncilAvatarDirectionReviewHandoffCli(argv = process.argv.slice(2)) {
  const values = parse(argv);
  const result = await compileCouncilAvatarDirectionMasterReviewHandoff({
    executionResultPath: path.resolve(values.get('--execution-result')),
    identityApprovalPath: path.resolve(values.get('--identity-approval')),
    artifactRoot: path.resolve(values.get('--artifact-root')),
    workspaceRoot: path.resolve(values.get('--workspace-root')),
    ...(values.get('--compiled-at') ? { compiledAt: values.get('--compiled-at') } : {}),
  });
  return Object.freeze({
    status: 'passed',
    schema: result.schema,
    handoffSha256: result.handoffSha256,
    reviewId: result.reviewId,
    planSha256: result.planSha256,
    candidateCountPerView: result.candidateCountPerView,
    candidateCount: result.candidateCount,
    requiredViewCount: result.requiredViews.length,
    workspaceRoot: result.workspaceRoot,
    requestPath: result.requestPath,
    planPath: result.planPath,
    providerExecutionPerformed: false,
    directionMasterApprovalPerformed: false,
    candidatePromotionPerformed: false,
    runtimeActivationPerformed: false,
    websiteActivationPerformed: false,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(await runCouncilAvatarDirectionReviewHandoffCli())}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      status: 'failed',
      code: 'COUNCIL_AVATAR_DIRECTION_MASTER_REVIEW_HANDOFF_FAILED',
      error: error instanceof Error ? error.message : String(error),
    })}\n`);
    process.exitCode = 1;
  }
}
