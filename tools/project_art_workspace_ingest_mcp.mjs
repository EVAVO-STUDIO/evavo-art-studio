#!/usr/bin/env node
import { lstatSync, realpathSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

import {
  compileWorkspaceIngest,
  ingestCapabilities,
  loadIngestPlan,
  loadIngestRequest,
  runWorkspaceIngest,
} from '../scripts/project-art/persistent-workspace-ingest.mjs';

export const SERVER_NAME = 'evavo-project-art-workspace-ingest';
export const SERVER_VERSION = '1.0.0';

function booleanEnv(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  throw new Error(`${name} must be true or false.`);
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function configuredRoots(name, { required = true } = {}) {
  const raw = process.env[name];
  const values = raw
    ? raw
        .split(process.platform === 'win32' ? ';' : ':')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
  if (required && values.length < 1) throw new Error(`${name} must contain at least one existing directory.`);
  return [...new Set(values.map((entry) => path.resolve(entry)))].map((lexical) => {
    const metadata = lstatSync(lexical);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error(`${name} contains a non-directory or symbolic root: ${lexical}.`);
    }
    return Object.freeze({ lexical, real: realpathSync(lexical) });
  });
}

function confined(value, label, roots, { mustExist = false } = {}) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.includes('\0')) {
    throw new Error(`${label} must be a non-empty path containing no NUL.`);
  }
  const candidate = path.resolve(value);
  const root = roots.find((entry) => inside(entry.lexical, candidate));
  if (!root) throw new Error(`${label} is outside its configured allowed roots.`);
  const relative = path.relative(root.lexical, candidate);
  const parts = relative === '' ? [] : relative.split(path.sep);
  let current = root.lexical;
  let existing = root.lexical;
  let missing = false;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    let metadata;
    try {
      metadata = lstatSync(current);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        missing = true;
        break;
      }
      throw error;
    }
    if (metadata.isSymbolicLink()) throw new Error(`${label} contains a symbolic-link component.`);
    if (index < parts.length - 1 && !metadata.isDirectory()) {
      throw new Error(`${label} contains a non-directory path component.`);
    }
    existing = current;
  }
  if (mustExist && missing) throw new Error(`${label} does not exist.`);
  const existingReal = realpathSync(existing);
  if (!inside(root.real, existingReal)) throw new Error(`${label} escaped its configured allowed root.`);
  return candidate;
}

const writeEnabled = booleanEnv('EVAVO_ART_WORKSPACE_INGEST_MCP_ALLOW_WRITE', false);
const workspaceRoots = configuredRoots('EVAVO_ART_WORKSPACE_INGEST_ROOTS');
const sourceRoots = configuredRoots('EVAVO_ART_WORKSPACE_INGEST_SOURCE_ROOTS');

export const policy = Object.freeze({
  writeEnabled,
  workspaceRootCount: workspaceRoots.length,
  sourceRootCount: sourceRoots.length,
  bytesFlowThroughMcp: false,
  arbitraryShell: false,
  storageWrite: false,
  repositoryMutation: false,
  publication: false,
  forcePush: false,
});

const objectSchema = (properties, required = []) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required,
});
const pathField = { type: 'string', minLength: 1, maxLength: 32_768 };
const timestampField = { type: 'string', minLength: 20, maxLength: 64 };

export const toolDefinitions = Object.freeze([
  {
    name: 'evavo_art_workspace_ingest_capabilities',
    description:
      'Describe persistent external asset ingest limits and authority boundaries. Performs no file read or write.',
    inputSchema: objectSchema({}),
  },
  ...(writeEnabled
    ? [
        {
          name: 'evavo_art_compile_workspace_ingest',
          description:
            'Compile a self-hashed external asset ingest plan for one existing persistent Artist Workspace. Requires confirmWrite=true.',
          inputSchema: objectSchema(
            {
              workspaceRoot: pathField,
              requestPath: pathField,
              outputPath: pathField,
              compiledAt: timestampField,
              confirmWrite: { type: 'boolean' },
            },
            ['workspaceRoot', 'requestPath', 'outputPath', 'confirmWrite'],
          ),
        },
        {
          name: 'evavo_art_run_workspace_ingest',
          description:
            'Run one exact compiled ingest plan, preserving immutable source copies, editable working copies and rollback-on-failure evidence. Requires confirmWrite=true.',
          inputSchema: objectSchema(
            {
              workspaceRoot: pathField,
              planPath: pathField,
              confirmWrite: { type: 'boolean' },
            },
            ['workspaceRoot', 'planPath', 'confirmWrite'],
          ),
        },
      ]
    : []),
]);

function requireWrite(args) {
  if (!writeEnabled) {
    throw new Error('Workspace ingest writes are disabled. Set EVAVO_ART_WORKSPACE_INGEST_MCP_ALLOW_WRITE=true on the trusted local deployment.');
  }
  if (args?.confirmWrite !== true) throw new Error('confirmWrite=true is required for persistent workspace ingest writes.');
}

function validateRequestSourceRoots(request) {
  if (!Array.isArray(request?.sourceRoots)) throw new Error('The ingest request must contain sourceRoots.');
  for (const [index, entry] of request.sourceRoots.entries()) {
    confined(entry?.path, `request.sourceRoots[${index}].path`, sourceRoots, { mustExist: true });
  }
}

export async function callTool(name, args = {}) {
  if (name === 'evavo_art_workspace_ingest_capabilities') {
    return {
      ...ingestCapabilities(),
      mcp: policy,
      writeToolsExposed: writeEnabled,
    };
  }
  if (name === 'evavo_art_compile_workspace_ingest') {
    requireWrite(args);
    const workspaceRoot = confined(args.workspaceRoot, 'workspaceRoot', workspaceRoots, { mustExist: true });
    const requestPath = confined(args.requestPath, 'requestPath', [...workspaceRoots, ...sourceRoots], { mustExist: true });
    const outputPath = confined(args.outputPath, 'outputPath', workspaceRoots);
    const { value: request, bytes: requestBytes } = await loadIngestRequest(requestPath);
    validateRequestSourceRoots(request);
    const plan = await compileWorkspaceIngest({
      workspaceRoot,
      request,
      requestBytes,
      outputPath,
      ...(args.compiledAt ? { compiledAt: args.compiledAt } : {}),
    });
    return {
      status: 'passed',
      schema: plan.schema,
      workspaceId: plan.workspaceId,
      projectId: plan.projectId,
      ingestId: plan.ingestId,
      itemCount: plan.itemCount,
      aggregateSourceBytes: plan.aggregateSourceBytes,
      outputPath,
      planSha256: plan.documentSha256,
      bytesFlowThroughMcp: false,
      storageWrite: false,
      repositoryMutation: false,
      publication: false,
    };
  }
  if (name === 'evavo_art_run_workspace_ingest') {
    requireWrite(args);
    const workspaceRoot = confined(args.workspaceRoot, 'workspaceRoot', workspaceRoots, { mustExist: true });
    const planPath = confined(args.planPath, 'planPath', workspaceRoots, { mustExist: true });
    const plan = await loadIngestPlan(planPath);
    for (const [index, item] of plan.items.entries()) {
      confined(item.sourceRoot, `plan.items[${index}].sourceRoot`, sourceRoots, { mustExist: true });
      confined(item.sourceAbsolutePath, `plan.items[${index}].sourceAbsolutePath`, sourceRoots, { mustExist: true });
    }
    return runWorkspaceIngest(workspaceRoot, plan);
  }
  throw new Error(`Unknown tool: ${name}.`);
}

export async function handleRequest(message) {
  if (!message || message.jsonrpc !== '2.0') throw new Error('MCP request must use JSON-RPC 2.0.');
  if (message.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: message.params?.protocolVersion ?? '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    };
  }
  if (message.method === 'ping') return { jsonrpc: '2.0', id: message.id, result: {} };
  if (message.method === 'tools/list') {
    return { jsonrpc: '2.0', id: message.id, result: { tools: toolDefinitions } };
  }
  if (message.method === 'tools/call') {
    try {
      const result = await callTool(message.params?.name, message.params?.arguments ?? {});
      return {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          isError: false,
        },
      };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                code: typeof error?.code === 'string' ? error.code : 'PERSISTENT_ARTIST_WORKSPACE_INGEST_MCP_ERROR',
                message: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        },
      };
    }
  }
  if (message.method?.startsWith('notifications/')) return null;
  return {
    jsonrpc: '2.0',
    id: message.id,
    error: { code: -32601, message: `Method not found: ${message.method}.` },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const interface_ = createInterface({ input: process.stdin, crlfDelay: Infinity });
  interface_.on('line', async (line) => {
    if (!line.trim()) return;
    let response;
    try {
      response = await handleRequest(JSON.parse(line));
    } catch (error) {
      response = {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
      };
    }
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  });
}
