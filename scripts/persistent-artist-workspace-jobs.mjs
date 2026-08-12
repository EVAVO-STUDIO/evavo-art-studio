#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  cancelWorkspaceJob,
  claimWorkspaceJob,
  compileWorkspaceJob,
  completeWorkspaceJobStep,
  createWorkspaceJob,
  failWorkspaceJobStep,
  inspectWorkspaceJob,
  jobCapabilities,
  pauseWorkspaceJob,
  readStableJsonFile,
  releaseWorkspaceJob,
  resumeWorkspaceJob,
  startWorkspaceJobStep,
} from './project-art/persistent-workspace-jobs.mjs';

function fail(message) {
  console.error(message);
  process.exitCode = 2;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = rest[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    options[key] = value;
    index += 1;
  }
  return { command, options };
}

function requireOption(options, name) {
  const value = options[name];
  if (!value) throw new Error(`Missing required --${name}`);
  return value;
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  switch (command) {
    case 'capabilities':
      console.log(JSON.stringify(jobCapabilities(), null, 2));
      return;
    case 'compile': {
      const workspaceRoot = path.resolve(requireOption(options, 'workspace'));
      const requestPath = path.resolve(requireOption(options, 'request'));
      const outputPath = path.resolve(requireOption(options, 'output'));
      const { value: request, bytes } = await readStableJsonFile(requestPath, 'job request');
      const plan = await compileWorkspaceJob({
        workspaceRoot,
        request,
        requestBytes: bytes,
        outputPath,
        ...(options['compiled-at'] ? { compiledAt: options['compiled-at'] } : {}),
      });
      console.log(JSON.stringify({ schema: plan.schema, jobId: plan.jobId, planSha256: plan.documentSha256, outputPath }, null, 2));
      return;
    }
    case 'create': {
      const workspaceRoot = path.resolve(requireOption(options, 'workspace'));
      const planPath = path.resolve(requireOption(options, 'plan'));
      const { value: plan } = await readStableJsonFile(planPath, 'job plan');
      console.log(JSON.stringify(await createWorkspaceJob({ workspaceRoot, plan }), null, 2));
      return;
    }
    case 'inspect':
      console.log(JSON.stringify(await inspectWorkspaceJob({
        workspaceRoot: path.resolve(requireOption(options, 'workspace')),
        jobId: requireOption(options, 'job-id'),
        ...(options.now ? { now: options.now } : {}),
      }), null, 2));
      return;
    case 'checkpoint': {
      const workspaceRoot = path.resolve(requireOption(options, 'workspace'));
      const jobId = requireOption(options, 'job-id');
      const actor = requireOption(options, 'actor');
      const action = requireOption(options, 'action');
      const common = { workspaceRoot, jobId, actor, ...(options.now ? { now: options.now } : {}) };
      let result;
      switch (action) {
        case 'claim': result = await claimWorkspaceJob({ ...common, leaseSeconds: options['lease-seconds'] ? Number(options['lease-seconds']) : 900 }); break;
        case 'release': result = await releaseWorkspaceJob(common); break;
        case 'start-step': result = await startWorkspaceJobStep({ ...common, stepId: requireOption(options, 'step-id') }); break;
        case 'complete-step': result = await completeWorkspaceJobStep({ ...common, stepId: requireOption(options, 'step-id') }); break;
        case 'fail-step': result = await failWorkspaceJobStep({ ...common, stepId: requireOption(options, 'step-id'), message: requireOption(options, 'message') }); break;
        case 'pause': result = await pauseWorkspaceJob(common); break;
        case 'resume': result = await resumeWorkspaceJob(common); break;
        case 'cancel': result = await cancelWorkspaceJob({ ...common, reason: requireOption(options, 'reason') }); break;
        default: throw new Error(`Unsupported checkpoint action: ${action}`);
      }
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    default:
      throw new Error('Usage: persistent-artist-workspace-jobs.mjs capabilities|compile|create|inspect|checkpoint ...');
  }
}

main().catch((error) => {
  fail(`${error?.code ? `${error.code}: ` : ''}${error instanceof Error ? error.message : String(error)}`);
});
