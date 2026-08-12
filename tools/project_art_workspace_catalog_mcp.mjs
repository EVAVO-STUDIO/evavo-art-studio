#!/usr/bin/env node
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';

import {
  catalogCapabilities,
  compileWorkspaceCatalog,
  queryWorkspaceCatalog,
  readStableJsonFile,
  runWorkspaceCatalog,
  verifyWorkspaceCatalog,
} from '../scripts/project-art/persistent-workspace-catalog.mjs';

const SERVER_NAME = 'evavo-project-art-workspace-catalog';
const SERVER_VERSION = '1.0.0';
const WRITE_ENABLED = process.env.EVAVO_PERSISTENT_CATALOG_MCP_ALLOW_WRITE === 'true';
const ROOTS_ENV = process.env.EVAVO_PERSISTENT_CATALOG_ROOTS ?? '';
const MAXIMUM_ROOTS = 64;

function rpcError(code, message, data) {
  const error = new Error(message);
  error.rpcCode = code;
  error.rpcData = data;
  return error;
}

function insideRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function loadRoots() {
  const values = [...new Set(ROOTS_ENV.split(path.delimiter).map((entry) => entry.trim()).filter(Boolean))];
  if (values.length < 1 || values.length > MAXIMUM_ROOTS) {
    throw rpcError(-32010,
      `EVAVO_PERSISTENT_CATALOG_ROOTS must contain 1-${MAXIMUM_ROOTS} existing roots.`);
  }
  const roots = [];
  for (const value of values) {
    const lexical = path.resolve(value);
    const metadata = await lstat(lexical).catch((error) => {
      throw rpcError(-32010, `Configured root cannot be inspected: ${error.message}`);
    });
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw rpcError(-32010, 'Configured roots must be non-symbolic directories.');
    }
    roots.push(await realpath(lexical));
  }
  return roots.sort();
}

let rootsPromise;
function roots() {
  rootsPromise ??= loadRoots();
  return rootsPromise;
}

async function rejectSymbolicComponents(candidate, stopAtMissingLeaf = false) {
  const parsed = path.parse(candidate);
  const relativeParts = candidate.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let current = parsed.root;
  for (let index = 0; index < relativeParts.length; index += 1) {
    current = path.join(current, relativeParts[index]);
    let metadata;
    try {
      metadata = await lstat(current);
    } catch (error) {
      if (error?.code === 'ENOENT' && stopAtMissingLeaf && index === relativeParts.length - 1) return;
      throw rpcError(-32011, `Path cannot be inspected: ${error.message}`);
    }
    if (metadata.isSymbolicLink()) throw rpcError(-32011, 'Symbolic path components are not allowed.');
    if (index < relativeParts.length - 1 && !metadata.isDirectory()) {
      throw rpcError(-32011, 'Non-directory path component encountered.');
    }
  }
}

async function allowedPath(value, { future = false, directory = false } = {}) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 8192 || value.includes('\0')) {
    throw rpcError(-32602, 'Path argument must be a bounded non-empty string.');
  }
  const absolute = path.resolve(value);
  const configured = await roots();
  const owner = configured.find((root) => insideRoot(root, absolute));
  if (!owner) throw rpcError(-32011, 'Path is outside EVAVO_PERSISTENT_CATALOG_ROOTS.');
  await rejectSymbolicComponents(absolute, future);
  if (!future) {
    const metadata = await lstat(absolute).catch((error) => {
      throw rpcError(-32011, `Path cannot be inspected: ${error.message}`);
    });
    if (metadata.isSymbolicLink()) throw rpcError(-32011, 'Symbolic path targets are not allowed.');
    if (directory && !metadata.isDirectory()) throw rpcError(-32011, 'Expected a directory path.');
    if (!directory && !metadata.isFile()) throw rpcError(-32011, 'Expected a file path.');
    const resolved = await realpath(absolute);
    if (!insideRoot(owner, resolved)) throw rpcError(-32011, 'Path escaped its configured root.');
    return resolved;
  }
  return absolute;
}

function requireRecord(value, label = 'arguments') {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw rpcError(-32602, `${label} must be an object.`);
  }
  return value;
}

function requireWrite() {
  if (!WRITE_ENABLED) {
    throw rpcError(-32012,
      'Workspace catalog writes are disabled. Set EVAVO_PERSISTENT_CATALOG_MCP_ALLOW_WRITE=true in a trusted deployment.');
  }
}

function textResult(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

const TOOLS = Object.freeze([
  {
    name: 'evavo_art_workspace_catalog_capabilities',
    description: 'Describe the bounded, path-only persistent Artist Workspace catalog boundary.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'evavo_art_compile_workspace_catalog',
    description: 'Scan one exact workspace and create a self-hashed catalog plan at a create-only output path.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['workspaceRoot', 'requestPath', 'outputPath'],
      properties: {
        workspaceRoot: { type: 'string' },
        requestPath: { type: 'string' },
        outputPath: { type: 'string' },
        compiledAt: { type: 'string' },
      },
    },
  },
  {
    name: 'evavo_art_run_workspace_catalog',
    description: 'Revalidate a catalog plan and atomically publish its create-only workspace catalog.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['planPath'],
      properties: { planPath: { type: 'string' } },
    },
  },
  {
    name: 'evavo_art_query_workspace_catalog',
    description: 'Query one published catalog by exact path, area, kind, media type, dimensions, alpha, animation or duplicate status.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['workspaceRoot', 'catalogId'],
      properties: {
        workspaceRoot: { type: 'string' },
        catalogId: { type: 'string' },
        query: { type: 'object', additionalProperties: true },
      },
    },
  },
  {
    name: 'evavo_art_verify_workspace_catalog',
    description: 'Rescan a workspace and report missing, changed or unexpected files relative to a published catalog.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['workspaceRoot', 'catalogId'],
      properties: {
        workspaceRoot: { type: 'string' },
        catalogId: { type: 'string' },
      },
    },
  },
]);

async function callTool(name, rawArguments) {
  const args = requireRecord(rawArguments ?? {});
  switch (name) {
    case 'evavo_art_workspace_catalog_capabilities':
      return textResult({
        ...catalogCapabilities(),
        mcp: {
          server: SERVER_NAME,
          version: SERVER_VERSION,
          writeEnabled: WRITE_ENABLED,
          bytesFlowThroughMcp: false,
          imageBytesThroughMcp: false,
          storageWrite: false,
          targetRepositoryMutation: false,
          forcePush: false,
        },
      });
    case 'evavo_art_compile_workspace_catalog': {
      requireWrite();
      const workspaceRoot = await allowedPath(args.workspaceRoot, { directory: true });
      const requestPath = await allowedPath(args.requestPath);
      const outputPath = await allowedPath(args.outputPath, { future: true });
      const { value: request, bytes } = await readStableJsonFile(requestPath, 'catalog request');
      const plan = await compileWorkspaceCatalog({
        workspaceRoot,
        request,
        requestBytes: bytes,
        outputPath,
        ...(args.compiledAt ? { compiledAt: args.compiledAt } : {}),
      });
      return textResult({
        schema: plan.schema,
        catalogId: plan.catalogId,
        workspaceId: plan.workspaceId,
        projectId: plan.projectId,
        fileCount: plan.statistics.fileCount,
        aggregateBytes: plan.statistics.aggregateBytes,
        duplicateGroupCount: plan.statistics.duplicateGroupCount,
        planSha256: plan.documentSha256,
        outputPath,
      });
    }
    case 'evavo_art_run_workspace_catalog': {
      requireWrite();
      const planPath = await allowedPath(args.planPath);
      const { value: plan } = await readStableJsonFile(planPath, 'catalog plan');
      await allowedPath(plan.workspaceRoot, { directory: true });
      const result = await runWorkspaceCatalog(plan);
      return textResult({
        schema: result.receipt.schema,
        catalogId: result.receipt.catalogId,
        workspaceId: result.receipt.workspaceId,
        fileCount: result.receipt.fileCount,
        aggregateBytes: result.receipt.aggregateBytes,
        catalogSha256: result.receipt.catalogSha256,
        receiptSha256: result.receipt.documentSha256,
        catalogPath: result.catalogPath,
        receiptPath: result.receiptPath,
      });
    }
    case 'evavo_art_query_workspace_catalog': {
      const workspaceRoot = await allowedPath(args.workspaceRoot, { directory: true });
      const result = await queryWorkspaceCatalog({
        workspaceRoot,
        catalogId: args.catalogId,
        query: args.query ?? {},
      });
      return textResult(result);
    }
    case 'evavo_art_verify_workspace_catalog': {
      const workspaceRoot = await allowedPath(args.workspaceRoot, { directory: true });
      const result = await verifyWorkspaceCatalog({
        workspaceRoot,
        catalogId: args.catalogId,
      });
      return textResult(result);
    }
    default:
      throw rpcError(-32601, `Unknown tool: ${name}`);
  }
}

async function handle(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    throw rpcError(-32600, 'JSON-RPC request must be an object.');
  }
  switch (message.method) {
    case 'initialize':
      return {
        protocolVersion: message.params?.protocolVersion ?? '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      };
    case 'notifications/initialized':
      return null;
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: TOOLS };
    case 'tools/call':
      return callTool(message.params?.name, message.params?.arguments ?? {});
    default:
      throw rpcError(-32601, `Method not found: ${message.method}`);
  }
}

function send(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  if (line.trim().length === 0) continue;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error.' } });
    continue;
  }
  try {
    const result = await handle(message);
    if (message.id !== undefined && result !== null) {
      send({ jsonrpc: '2.0', id: message.id, result });
    }
  } catch (error) {
    if (message.id === undefined) continue;
    send({
      jsonrpc: '2.0',
      id: message.id,
      error: {
        code: error?.rpcCode ?? -32000,
        message: error instanceof Error ? error.message : String(error),
        ...(error?.rpcData === undefined ? {} : { data: error.rpcData }),
      },
    });
  }
}
