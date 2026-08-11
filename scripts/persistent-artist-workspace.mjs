#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';

import {
  WORKSPACE_CREATE_PLAN_SCHEMA,
  WORKSPACE_SNAPSHOT_PLAN_SCHEMA,
  compileWorkspaceCreate,
  compileWorkspaceSnapshot,
  loadPlanFile,
  loadRequestFile,
  prepareWorkspaceStorageHandoff,
  runWorkspaceCreate,
  runWorkspaceSnapshot,
} from './project-art/persistent-workspace.mjs';

function value(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) return undefined;
  return process.argv[index + 1];
}

const command = process.argv[2];
const requestPath = value('--request');
const outputPath = value('--output');
const workspaceRoot = value('--workspace-root');
const parentRoot = value('--parent-root');
const planPath = value('--plan');
const compiledAt = value('--compiled-at');

if (command === 'capabilities') {
  console.log(JSON.stringify({
    schema: 'evavo.persistent-artist-workspace-capabilities.v1',
    version: '2026-08-11.1',
    commands: ['compile-create', 'run-create', 'compile-snapshot', 'run-snapshot', 'storage-handoff'],
    layout: ['sources', 'working', 'versions', 'masks', 'scratch', 'review', 'masters', 'exports', 'manifests', 'journals'],
    appendOnlyVersions: true,
    exactEvavoStorageHandoff: true,
    bytesFlowThroughMcp: false,
    providerExecution: false,
    candidateApproval: false,
    candidatePromotion: false,
    repositoryMutation: false,
    publication: false,
  }));
} else if (command === 'compile-create') {
  if (!parentRoot || !requestPath || !outputPath) {
    throw new Error('usage: persistent-artist-workspace.mjs compile-create --parent-root <dir> --request <request.json> --output <plan.json> [--compiled-at <UTC>]');
  }
  const { value: request, bytes } = await loadRequestFile(requestPath);
  const plan = await compileWorkspaceCreate({
    parentRoot,
    request,
    requestBytes: bytes,
    outputPath,
    ...(compiledAt ? { compiledAt } : {}),
  });
  console.log(JSON.stringify({
    status: 'passed',
    schema: plan.schema,
    workspaceId: plan.workspaceId,
    projectId: plan.projectId,
    outputRoot: plan.outputRoot,
    planSha256: plan.documentSha256,
    output: path.resolve(outputPath),
  }));
} else if (command === 'run-create') {
  if (!planPath) throw new Error('usage: persistent-artist-workspace.mjs run-create --plan <plan.json>');
  const plan = await loadPlanFile(planPath, WORKSPACE_CREATE_PLAN_SCHEMA);
  console.log(JSON.stringify(await runWorkspaceCreate(plan)));
} else if (command === 'compile-snapshot') {
  if (!workspaceRoot || !requestPath || !outputPath) {
    throw new Error('usage: persistent-artist-workspace.mjs compile-snapshot --workspace-root <dir> --request <request.json> --output <plan.json> [--compiled-at <UTC>]');
  }
  const { value: request, bytes } = await loadRequestFile(requestPath);
  const plan = await compileWorkspaceSnapshot({
    workspaceRoot,
    request,
    requestBytes: bytes,
    outputPath,
    ...(compiledAt ? { compiledAt } : {}),
  });
  console.log(JSON.stringify({
    status: 'passed',
    schema: plan.schema,
    workspaceId: plan.workspaceId,
    assetId: plan.assetId,
    versionId: plan.versionId,
    sourceSha256: plan.source.sha256,
    planSha256: plan.documentSha256,
    output: path.resolve(outputPath),
  }));
} else if (command === 'run-snapshot') {
  if (!workspaceRoot || !planPath) {
    throw new Error('usage: persistent-artist-workspace.mjs run-snapshot --workspace-root <dir> --plan <plan.json>');
  }
  const plan = await loadPlanFile(planPath, WORKSPACE_SNAPSHOT_PLAN_SCHEMA);
  console.log(JSON.stringify(await runWorkspaceSnapshot(workspaceRoot, plan)));
} else if (command === 'storage-handoff') {
  if (!workspaceRoot || !requestPath) {
    throw new Error('usage: persistent-artist-workspace.mjs storage-handoff --workspace-root <dir> --request <request.json> [--output <request.json>] [--compiled-at <UTC>]');
  }
  const { value: request, bytes } = await loadRequestFile(requestPath);
  console.log(JSON.stringify(await prepareWorkspaceStorageHandoff({
    workspaceRoot,
    request,
    requestBytes: bytes,
    ...(outputPath ? { outputPath } : {}),
    ...(compiledAt ? { compiledAt } : {}),
  })));
} else {
  throw new Error('usage: persistent-artist-workspace.mjs <capabilities|compile-create|run-create|compile-snapshot|run-snapshot|storage-handoff> ...');
}
