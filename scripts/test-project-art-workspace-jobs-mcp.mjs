#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const serverPath = path.join(root, 'tools', 'project_art_workspace_jobs_mcp.mjs');

function startServer(env) {
  const child = spawn(process.execPath, [serverPath], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env } });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const pending = new Map();
  lines.on('line', (line) => {
    const message = JSON.parse(line);
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  let nextId = 1;
  async function rpc(method, params = {}) {
    const id = nextId++;
    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`MCP timeout for ${method}`)), 5000);
      pending.set(id, (message) => { clearTimeout(timer); resolve(message); });
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    return response;
  }
  return { child, rpc };
}

const temp = await mkdtemp(path.join(os.tmpdir(), 'evavo-job-mcp-'));
await mkdir(path.join(temp, 'workspace', 'sources'), { recursive: true });
await mkdir(path.join(temp, 'workspace', 'working'), { recursive: true });
await writeFile(path.join(temp, 'workspace', 'sources', 'one.txt'), 'one\n');
const request = {
  schema: 'evavo.persistent-artist-workspace-job-request.v1',
  jobId: 'mcp-job',
  workspaceId: 'workspace-mcp',
  projectId: 'project-mcp',
  title: 'MCP resumable job',
  steps: [{ id: 'prepare', kind: 'workspace-operation', description: 'prepare', inputs: ['sources/one.txt'], outputs: ['working/out.txt'] }],
};
const requestPath = path.join(temp, 'request.json');
const planPath = path.join(temp, 'plan.json');
await writeFile(requestPath, `${JSON.stringify(request)}\n`);

try {
  {
    const server = startServer({ EVAVO_ART_WORKSPACE_JOB_ROOTS: temp, EVAVO_ART_WORKSPACE_JOBS_MCP_ALLOW_WRITE: 'false' });
    const initialize = await server.rpc('initialize', { protocolVersion: '2025-03-26' });
    assert.equal(initialize.result.serverInfo.name, 'evavo-project-art-workspace-jobs');
    const listed = await server.rpc('tools/list');
    assert.deepEqual(listed.result.tools.map((tool) => tool.name), [
      'evavo_art_workspace_job_capabilities',
      'evavo_art_compile_workspace_job',
      'evavo_art_create_workspace_job',
      'evavo_art_inspect_workspace_job',
      'evavo_art_checkpoint_workspace_job',
    ]);
    const capabilities = await server.rpc('tools/call', { name: 'evavo_art_workspace_job_capabilities', arguments: {} });
    assert.equal(capabilities.result.structuredContent.mcp.writeEnabled, false);
    assert.equal(capabilities.result.structuredContent.crashResumable, true);
    const blocked = await server.rpc('tools/call', { name: 'evavo_art_compile_workspace_job', arguments: { workspaceRoot: path.join(temp, 'workspace'), requestPath, outputPath: planPath } });
    assert.equal(blocked.error.code, -32012);
    server.child.kill();
  }

  {
    const server = startServer({ EVAVO_ART_WORKSPACE_JOB_ROOTS: temp, EVAVO_ART_WORKSPACE_JOBS_MCP_ALLOW_WRITE: 'true' });
    const compiled = await server.rpc('tools/call', {
      name: 'evavo_art_compile_workspace_job',
      arguments: { workspaceRoot: path.join(temp, 'workspace'), requestPath, outputPath: planPath, compiledAt: '2026-08-12T04:20:00.000Z' },
    });
    assert.equal(compiled.result.structuredContent.jobId, 'mcp-job');
    const created = await server.rpc('tools/call', { name: 'evavo_art_create_workspace_job', arguments: { workspaceRoot: path.join(temp, 'workspace'), planPath } });
    assert.equal(created.result.structuredContent.nextStepId, 'prepare');
    const claimed = await server.rpc('tools/call', {
      name: 'evavo_art_checkpoint_workspace_job',
      arguments: { workspaceRoot: path.join(temp, 'workspace'), jobId: 'mcp-job', actor: 'agent-mcp', action: 'claim', leaseSeconds: 300, now: '2026-08-12T04:20:01.000Z' },
    });
    assert.equal(claimed.result.structuredContent.activeLease.actor, 'agent-mcp');
    const started = await server.rpc('tools/call', {
      name: 'evavo_art_checkpoint_workspace_job',
      arguments: { workspaceRoot: path.join(temp, 'workspace'), jobId: 'mcp-job', actor: 'agent-mcp', action: 'start-step', stepId: 'prepare', now: '2026-08-12T04:20:02.000Z' },
    });
    assert.equal(started.result.structuredContent.status, 'in-progress');
    await writeFile(path.join(temp, 'workspace', 'working', 'out.txt'), 'out\n');
    const completed = await server.rpc('tools/call', {
      name: 'evavo_art_checkpoint_workspace_job',
      arguments: { workspaceRoot: path.join(temp, 'workspace'), jobId: 'mcp-job', actor: 'agent-mcp', action: 'complete-step', stepId: 'prepare', now: '2026-08-12T04:20:03.000Z' },
    });
    assert.equal(completed.result.structuredContent.status, 'completed');
    const inspected = await server.rpc('tools/call', { name: 'evavo_art_inspect_workspace_job', arguments: { workspaceRoot: path.join(temp, 'workspace'), jobId: 'mcp-job', now: '2026-08-12T04:20:04.000Z' } });
    assert.equal(inspected.result.structuredContent.evidenceDrift.length, 0);
    server.child.kill();
  }

  console.log('Persistent Artist Workspace job MCP regressions passed.');
  console.log('- read-only deployment exposes capabilities and blocks all mutations');
  console.log('- write-enabled deployment compiles, creates, claims, checkpoints and resumes by path');
  console.log('- MCP carries state metadata and hashes, not image bytes');
} finally {
  await rm(temp, { recursive: true, force: true });
}
