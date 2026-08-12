#!/usr/bin/env node
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';

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
} from '../scripts/project-art/persistent-workspace-jobs.mjs';

const SERVER_NAME = 'evavo-project-art-workspace-jobs';
const SERVER_VERSION = '1.0.0';
const WRITE_ENABLED = process.env.EVAVO_ART_WORKSPACE_JOBS_MCP_ALLOW_WRITE === 'true';
const ROOTS_ENV = process.env.EVAVO_ART_WORKSPACE_JOB_ROOTS ?? '';
const MAXIMUM_ROOTS = 64;

function rpcError(code, message, data) {
  const error = new Error(message);
  error.rpcCode = code;
  error.rpcData = data;
  return error;
}

function insideRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function loadRoots() {
  const values = [...new Set(ROOTS_ENV.split(path.delimiter).map((entry) => entry.trim()).filter(Boolean))];
  if (values.length < 1 || values.length > MAXIMUM_ROOTS) {
    throw rpcError(-32010, `EVAVO_ART_WORKSPACE_JOB_ROOTS must contain 1-${MAXIMUM_ROOTS} existing roots.`);
  }
  const roots = [];
  for (const value of values) {
    const lexical = path.resolve(value);
    const metadata = await lstat(lexical).catch((error) => { throw rpcError(-32010, `Configured root cannot be inspected: ${error.message}`); });
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw rpcError(-32010, 'Configured roots must be non-symbolic directories.');
    roots.push(await realpath(lexical));
  }
  return roots.sort();
}

let rootsPromise;
function roots() { rootsPromise ??= loadRoots(); return rootsPromise; }

async function rejectSymbolicComponents(candidate, stopAtMissingLeaf = false) {
  const parsed = path.parse(candidate);
  const parts = candidate.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let current = parsed.root;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    let metadata;
    try { metadata = await lstat(current); }
    catch (error) {
      if (error?.code === 'ENOENT' && stopAtMissingLeaf && index === parts.length - 1) return;
      throw rpcError(-32011, `Path cannot be inspected: ${error.message}`);
    }
    if (metadata.isSymbolicLink()) throw rpcError(-32011, 'Symbolic path components are not allowed.');
    if (index < parts.length - 1 && !metadata.isDirectory()) throw rpcError(-32011, 'Non-directory path component encountered.');
  }
}

async function allowedPath(value, { future = false, directory = false } = {}) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 8192 || value.includes('\0')) throw rpcError(-32602, 'Path argument must be a bounded non-empty string.');
  const absolute = path.resolve(value);
  const configured = await roots();
  const owner = configured.find((root) => insideRoot(root, absolute));
  if (!owner) throw rpcError(-32011, 'Path is outside EVAVO_ART_WORKSPACE_JOB_ROOTS.');
  await rejectSymbolicComponents(absolute, future);
  if (future) return absolute;
  const metadata = await lstat(absolute).catch((error) => { throw rpcError(-32011, `Path cannot be inspected: ${error.message}`); });
  if (metadata.isSymbolicLink()) throw rpcError(-32011, 'Symbolic path targets are not allowed.');
  if (directory && !metadata.isDirectory()) throw rpcError(-32011, 'Expected a directory path.');
  if (!directory && !metadata.isFile()) throw rpcError(-32011, 'Expected a file path.');
  const resolved = await realpath(absolute);
  if (!insideRoot(owner, resolved)) throw rpcError(-32011, 'Path escaped its configured root.');
  return resolved;
}

function requireRecord(value, label = 'arguments') {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw rpcError(-32602, `${label} must be an object.`);
  return value;
}

function requireWrite() {
  if (!WRITE_ENABLED) throw rpcError(-32012, 'Workspace job writes are disabled. Set EVAVO_ART_WORKSPACE_JOBS_MCP_ALLOW_WRITE=true only in a trusted local deployment.');
}

function textResult(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: value };
}

const TOOLS = Object.freeze([
  {
    name: 'evavo_art_workspace_job_capabilities',
    description: 'Describe the append-only, crash-resumable persistent Artist Workspace job boundary.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'evavo_art_compile_workspace_job',
    description: 'Compile exact step dependencies and input fingerprints into a create-only resumable job plan.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['workspaceRoot', 'requestPath', 'outputPath'],
      properties: { workspaceRoot: { type: 'string' }, requestPath: { type: 'string' }, outputPath: { type: 'string' }, compiledAt: { type: 'string' } },
    },
  },
  {
    name: 'evavo_art_create_workspace_job',
    description: 'Publish one validated job plan under journals/jobs using exclusive directory reservation and a create-only commit marker.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['workspaceRoot', 'planPath'], properties: { workspaceRoot: { type: 'string' }, planPath: { type: 'string' } } },
  },
  {
    name: 'evavo_art_inspect_workspace_job',
    description: 'Read the hash-chained job journal, verify succeeded output evidence, and return the exact next resumable step.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['workspaceRoot', 'jobId'], properties: { workspaceRoot: { type: 'string' }, jobId: { type: 'string' }, now: { type: 'string' } } },
  },
  {
    name: 'evavo_art_checkpoint_workspace_job',
    description: 'Append one bounded job checkpoint: claim, release, start-step, complete-step, fail-step, pause, resume or cancel.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['workspaceRoot', 'jobId', 'actor', 'action'],
      properties: {
        workspaceRoot: { type: 'string' }, jobId: { type: 'string' }, actor: { type: 'string' },
        action: { type: 'string', enum: ['claim', 'release', 'start-step', 'complete-step', 'fail-step', 'pause', 'resume', 'cancel'] },
        stepId: { type: 'string' }, message: { type: 'string' }, reason: { type: 'string' }, leaseSeconds: { type: 'integer', minimum: 30, maximum: 86400 }, now: { type: 'string' },
      },
    },
  },
]);

async function callTool(name, rawArguments) {
  const args = requireRecord(rawArguments ?? {});
  switch (name) {
    case 'evavo_art_workspace_job_capabilities':
      return textResult({ ...jobCapabilities(), mcp: { server: SERVER_NAME, version: SERVER_VERSION, writeEnabled: WRITE_ENABLED, imageBytesThroughMcp: false, providerExecution: false, storageWrite: false, targetRepositoryMutation: false, gitPublication: false, forcePush: false } });
    case 'evavo_art_compile_workspace_job': {
      requireWrite();
      const workspaceRoot = await allowedPath(args.workspaceRoot, { directory: true });
      const requestPath = await allowedPath(args.requestPath);
      const outputPath = await allowedPath(args.outputPath, { future: true });
      const { value: request, bytes } = await readStableJsonFile(requestPath, 'job request');
      const plan = await compileWorkspaceJob({ workspaceRoot, request, requestBytes: bytes, outputPath, ...(args.compiledAt ? { compiledAt: args.compiledAt } : {}) });
      return textResult({ schema: plan.schema, jobId: plan.jobId, workspaceId: plan.workspaceId, projectId: plan.projectId, stepCount: plan.steps.length, planSha256: plan.documentSha256, outputPath });
    }
    case 'evavo_art_create_workspace_job': {
      requireWrite();
      const workspaceRoot = await allowedPath(args.workspaceRoot, { directory: true });
      const planPath = await allowedPath(args.planPath);
      const { value: plan } = await readStableJsonFile(planPath, 'job plan');
      return textResult(await createWorkspaceJob({ workspaceRoot, plan }));
    }
    case 'evavo_art_inspect_workspace_job': {
      const workspaceRoot = await allowedPath(args.workspaceRoot, { directory: true });
      return textResult(await inspectWorkspaceJob({ workspaceRoot, jobId: args.jobId, ...(args.now ? { now: args.now } : {}) }));
    }
    case 'evavo_art_checkpoint_workspace_job': {
      requireWrite();
      const workspaceRoot = await allowedPath(args.workspaceRoot, { directory: true });
      const common = { workspaceRoot, jobId: args.jobId, actor: args.actor, ...(args.now ? { now: args.now } : {}) };
      let result;
      switch (args.action) {
        case 'claim': result = await claimWorkspaceJob({ ...common, leaseSeconds: args.leaseSeconds ?? 900 }); break;
        case 'release': result = await releaseWorkspaceJob(common); break;
        case 'start-step': result = await startWorkspaceJobStep({ ...common, stepId: args.stepId }); break;
        case 'complete-step': result = await completeWorkspaceJobStep({ ...common, stepId: args.stepId }); break;
        case 'fail-step': result = await failWorkspaceJobStep({ ...common, stepId: args.stepId, message: args.message }); break;
        case 'pause': result = await pauseWorkspaceJob(common); break;
        case 'resume': result = await resumeWorkspaceJob(common); break;
        case 'cancel': result = await cancelWorkspaceJob({ ...common, reason: args.reason }); break;
        default: throw rpcError(-32602, `Unsupported checkpoint action: ${args.action}`);
      }
      return textResult(result);
    }
    default: throw rpcError(-32601, `Unknown tool: ${name}`);
  }
}

async function handle(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) throw rpcError(-32600, 'JSON-RPC request must be an object.');
  switch (message.method) {
    case 'initialize': return { protocolVersion: message.params?.protocolVersion ?? '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } };
    case 'notifications/initialized': return null;
    case 'ping': return {};
    case 'tools/list': return { tools: TOOLS };
    case 'tools/call': return callTool(message.params?.name, message.params?.arguments ?? {});
    default: throw rpcError(-32601, `Method not found: ${message.method}`);
  }
}

function send(payload) { process.stdout.write(`${JSON.stringify(payload)}\n`); }
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  if (line.trim().length === 0) continue;
  let message;
  try { message = JSON.parse(line); }
  catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error.' } }); continue; }
  try {
    const result = await handle(message);
    if (message.id !== undefined && result !== null) send({ jsonrpc: '2.0', id: message.id, result });
  } catch (error) {
    if (message.id === undefined) continue;
    send({ jsonrpc: '2.0', id: message.id, error: { code: error?.rpcCode ?? -32000, message: error instanceof Error ? error.message : String(error), ...(error?.rpcData === undefined ? {} : { data: error.rpcData }) } });
  }
}
