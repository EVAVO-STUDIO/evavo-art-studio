#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';

import {
  AVATAR_FINAL_PASS_PLAN_SCHEMA,
  AVATAR_FINAL_PASS_REQUEST_SCHEMA,
  compileProjectArtAvatarFinalPassFile,
} from './project-art/avatar-final-pass.mjs';

function value(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) return undefined;
  return process.argv[index + 1];
}

const workspaceRoot = value('--workspace-root');
const requestPath = value('--request');
const outputPath = value('--output');
const compiledAt = value('--compiled-at');

if (!workspaceRoot || !requestPath || !outputPath) {
  throw new Error(
    'usage: compile-project-art-avatar-final-pass.mjs --workspace-root <materialized workspace> --request <request.json> --output <create-only plan.json> [--compiled-at <canonical UTC>]',
  );
}

const plan = compileProjectArtAvatarFinalPassFile({
  workspaceRoot,
  requestPath,
  outputPath,
  ...(compiledAt ? { compiledAt } : {}),
});

console.log(
  JSON.stringify({
    status: 'passed',
    requestSchema: AVATAR_FINAL_PASS_REQUEST_SCHEMA,
    planSchema: AVATAR_FINAL_PASS_PLAN_SCHEMA,
    sessionId: plan.sessionId,
    characterId: plan.characterId,
    selectedFrameCount: plan.materialization.selectedFrameCount,
    qualityJobCount: plan.qualityJobs.length,
    repairJobCount: plan.repairJobs.length,
    inbetweenJobCount: plan.inbetweenJobs.length,
    sequenceCount: plan.sequenceTimeline.length,
    productionReady: plan.productionReady,
    runtimeActivationAllowed: plan.runtimeActivationAllowed,
    planSha256: plan.planSha256,
    output: path.resolve(outputPath),
  }),
);
