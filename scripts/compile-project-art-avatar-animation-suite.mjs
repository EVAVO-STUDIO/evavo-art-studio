#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';

import {
  AVATAR_ANIMATION_SUITE_PLAN_SCHEMA,
  AVATAR_ANIMATION_SUITE_REQUEST_SCHEMA,
  compileProjectArtAvatarAnimationSuiteFile,
} from './project-art/avatar-animation-suite.mjs';

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length
    ? process.argv[index + 1]
    : undefined;
}

const requestPath = option('--request');
const outputPath = option('--output');
const compiledAt = option('--compiled-at') ?? new Date().toISOString();

if (!requestPath || !outputPath) {
  throw new Error(
    'usage: compile-project-art-avatar-animation-suite.mjs --request <request.json> --output <create-only-plan.json> [--compiled-at <canonical UTC>]',
  );
}

const plan = compileProjectArtAvatarAnimationSuiteFile({
  requestPath,
  outputPath,
  compiledAt,
});

console.log(
  JSON.stringify({
    status: 'passed',
    requestSchema: AVATAR_ANIMATION_SUITE_REQUEST_SCHEMA,
    planSchema: AVATAR_ANIMATION_SUITE_PLAN_SCHEMA,
    sessionId: plan.sessionId,
    characterId: plan.characterId,
    clipCount: plan.counts.clips,
    frameJobCount: plan.counts.fullCharacterFrames,
    poseLayerJobCount: plan.counts.registeredPoseLayers,
    idleVariants: plan.counts.idleVariants,
    talkVariants: plan.counts.talkVariants,
    productionReady: false,
    runtimeActivationAllowed: false,
    planSha256: plan.planSha256,
    output: path.resolve(outputPath),
  }),
);
