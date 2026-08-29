#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { compileCouncilAvatarReviewHandoff } from './project-art/council-avatar-review-handoff.mjs';

function usage() {
  return [
    'Project Art Council avatar identity review handoff',
    '',
    'Usage:',
    '  node scripts/compile-project-art-council-avatar-review-handoff.mjs --execution-result <result.json> --artifact-root <artifact-root> --workspace-root <new-review-dir> [--compiled-at <canonical UTC>]',
    '',
    'The workspace must not already exist. Only verified, technically-passed, mastered, still-unapproved Council candidates are materialized.',
    'This command performs no provider calls and grants no approval, promotion, runtime activation, website activation, publication or deployment authority.',
  ].join('\n');
}

const REQUIRED = new Set(['--execution-result', '--artifact-root', '--workspace-root']);
const OPTIONAL = new Set(['--compiled-at']);
const SUPPORTED = new Set([...REQUIRED, ...OPTIONAL]);

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

export async function runCouncilAvatarReviewHandoffCli(argv = process.argv.slice(2)) {
  const values = parse(argv);
  const result = await compileCouncilAvatarReviewHandoff({
    executionResultPath: values.get('--execution-result'),
    artifactRoot: values.get('--artifact-root'),
    workspaceRoot: values.get('--workspace-root'),
    ...(values.get('--compiled-at') ? { compiledAt: values.get('--compiled-at') } : {}),
  });
  return Object.freeze({
    status: 'passed',
    schema: result.schema,
    reviewId: result.reviewId,
    planSha256: result.planSha256,
    handoffSha256: result.handoffSha256,
    characterIds: result.characterIds,
    candidateCount: result.candidateCount,
    workspaceRoot: result.workspaceRoot,
    requestPath: result.requestPath,
    planPath: result.planPath,
    independentVisualReviewRequired: true,
    candidateApprovalPerformed: false,
    candidatePromotionPerformed: false,
    runtimeActivationPerformed: false,
    providerExecutionPerformed: false,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(await runCouncilAvatarReviewHandoffCli())}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      status: 'failed',
      code: 'COUNCIL_AVATAR_REVIEW_HANDOFF_FAILED',
      error: error instanceof Error ? error.message : String(error),
    })}\n`);
    process.exitCode = 1;
  }
}
