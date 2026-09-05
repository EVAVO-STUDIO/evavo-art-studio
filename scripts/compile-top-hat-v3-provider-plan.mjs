#!/usr/bin/env node

import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import path from 'node:path';

import {
  compileTopHatV3ProviderPlan,
  inspectTopHatV3ProviderPlan,
} from './project-art/top-hat-v3-animation-provider-plan.mjs';

function fail(code, detail = code) {
  const error = new Error(`${code}:${detail}`);
  error.code = code;
  throw error;
}

function parseArgs(argv) {
  const args = {
    generationPlan: null,
    bindings: null,
    output: null,
    allowedAdapterIds: [],
    preferredAdapterId: null,
    preferredModel: null,
    seed: null,
    foundationCandidateCount: 3,
    anchorCandidateCount: 2,
    inbetweenCandidateCount: 1,
    layerCandidateCount: 2,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = argv[index + 1];
    if (flag === '--generation-plan') args.generationPlan = next;
    else if (flag === '--bindings') args.bindings = next;
    else if (flag === '--output') args.output = next;
    else if (flag === '--allowed-adapter') args.allowedAdapterIds.push(next);
    else if (flag === '--preferred-adapter') args.preferredAdapterId = next;
    else if (flag === '--preferred-model') args.preferredModel = next;
    else if (flag === '--seed') args.seed = Number(next);
    else if (flag === '--foundation-candidates') args.foundationCandidateCount = Number(next);
    else if (flag === '--anchor-candidates') args.anchorCandidateCount = Number(next);
    else if (flag === '--inbetween-candidates') args.inbetweenCandidateCount = Number(next);
    else if (flag === '--layer-candidates') args.layerCandidateCount = Number(next);
    else fail('TOP_HAT_V3_PROVIDER_CLI_ARGUMENT_INVALID', flag);
    index += 1;
  }
  if (!args.generationPlan || !args.output) {
    fail(
      'TOP_HAT_V3_PROVIDER_CLI_ARGUMENT_REQUIRED',
      '--generation-plan and --output are required',
    );
  }
  return args;
}

function positiveInteger(value, label, maximum = 16) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    fail('TOP_HAT_V3_PROVIDER_CLI_INTEGER_INVALID', label);
  }
  return value;
}

async function existingFile(value, label) {
  const resolved = path.resolve(value);
  const state = await lstat(resolved);
  if (!state.isFile() || state.isSymbolicLink()) {
    fail('TOP_HAT_V3_PROVIDER_CLI_FILE_INVALID', label);
  }
  return resolved;
}

async function outputFile(value) {
  const resolved = path.resolve(value);
  const parent = path.dirname(resolved);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  try {
    await lstat(resolved);
    fail('TOP_HAT_V3_PROVIDER_CLI_OUTPUT_EXISTS', resolved);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return resolved;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

const args = parseArgs(process.argv.slice(2));
const generationPlanPath = await existingFile(args.generationPlan, 'generationPlan');
const bindingsPath = args.bindings
  ? await existingFile(args.bindings, 'bindings')
  : null;
const outputPath = await outputFile(args.output);

const options = {
  allowedAdapterIds: args.allowedAdapterIds,
  preferredAdapterId: args.preferredAdapterId,
  preferredModel: args.preferredModel,
  seed: Number.isSafeInteger(args.seed) ? args.seed : null,
  foundationCandidateCount: positiveInteger(args.foundationCandidateCount, 'foundationCandidateCount'),
  anchorCandidateCount: positiveInteger(args.anchorCandidateCount, 'anchorCandidateCount'),
  inbetweenCandidateCount: positiveInteger(args.inbetweenCandidateCount, 'inbetweenCandidateCount'),
  layerCandidateCount: positiveInteger(args.layerCandidateCount, 'layerCandidateCount'),
};

const compiled = compileTopHatV3ProviderPlan({
  generationPlan: await readJson(generationPlanPath),
  bindings: bindingsPath ? await readJson(bindingsPath) : {},
  options,
});
const readiness = inspectTopHatV3ProviderPlan(compiled);
await writeFile(outputPath, `${JSON.stringify(compiled, null, 2)}\n`, {
  encoding: 'utf8',
  flag: 'wx',
  mode: 0o600,
});

console.log(
  JSON.stringify({
    ok: true,
    outputPath,
    generationPlanSha256: readiness.generationPlanSha256,
    providerPlanSha256: readiness.providerPlanSha256,
    totalJobs: readiness.totalJobs,
    readyJobs: readiness.readyJobs,
    blockedJobs: readiness.blockedJobs,
    localFirst: readiness.localFirst,
    continuityFirst: readiness.continuityFirst,
    executionPerformed: false,
  }),
);
