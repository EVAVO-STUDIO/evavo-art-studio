#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

export const SERVER_NAME = 'evavo-raw-art-visual-catalog';
export const SERVER_VERSION = '1.0.0';
const runFile = promisify(execFile);
const scriptPath = fileURLToPath(new URL('./raw_art_visual_catalog.py', import.meta.url));

const authority = Object.freeze({
  creativeApproval: false,
  styleApproval: false,
  provenanceApproval: false,
  sourceMutation: false,
  sourceDeletion: false,
  candidatePromotion: false,
  runtimeSubmission: false,
  repositoryMutation: false,
  gitCommit: false,
  gitPush: false,
  publication: false,
});

const bool = (value, fallback = false) => {
  if (value == null || value === '') return fallback;
  const normalized = String(value).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error('Boolean environment value is invalid.');
};

function policy(environment = process.env) {
  const value = String(environment.EVAVO_RAW_ART_VISUAL_MCP_MODE ?? 'read-only').toLowerCase();
  if (!['read-only', 'read-write'].includes(value)) throw new Error('EVAVO_RAW_ART_VISUAL_MCP_MODE must be read-only or read-write.');
  const writesEnabled = value === 'read-write' && bool(environment.EVAVO_RAW_ART_VISUAL_MCP_ALLOW_WRITES);
  if (value === 'read-write' && !writesEnabled) throw new Error('read-write mode requires EVAVO_RAW_ART_VISUAL_MCP_ALLOW_WRITES=true.');
  return Object.freeze({ value, writesEnabled });
}

function roots(environment = process.env) {
  const separator = process.platform === 'win32' ? ';' : ':';
  const values = String(environment.EVAVO_RAW_ART_VISUAL_ALLOWED_ROOTS ?? '')
    .split(separator).map((value) => value.trim()).filter(Boolean).map((value) => path.resolve(value));
  if (!values.length) throw new Error('EVAVO_RAW_ART_VISUAL_ALLOWED_ROOTS must not be empty.');
  return Object.freeze([...new Set(values)].map((lexical) => {
    const state = lstatSync(lexical);
    if (!state.isDirectory() || state.isSymbolicLink()) throw new Error(`Allowed root is invalid: ${lexical}.`);
    const real = realpathSync(lexical);
    if (path.normalize(real) !== path.normalize(lexical)) throw new Error(`Allowed root must be canonical: ${lexical}.`);
    return Object.freeze({ lexical, real });
  }));
}

const inside = (root, candidate) => {
  const value = path.relative(root, candidate);
  return value === '' || (value !== '..' && !value.startsWith(`..${path.sep}`) && !path.isAbsolute(value));
};

function confined(value, label, allowed, { future = false } = {}) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error(`${label} is required.`);
  const requested = path.resolve(value);
  let existing = requested;
  for (;;) {
    try {
      const state = lstatSync(existing);
      if (state.isSymbolicLink()) throw new Error(`${label} contains a symbolic link.`);
      break;
    } catch (error) {
      if (!future || error?.code !== 'ENOENT') throw error;
      const parent = path.dirname(existing);
      if (parent === existing) throw error;
      existing = parent;
    }
  }
  const real = realpathSync(existing);
  if (!allowed.some((root) => inside(root.real, real) && inside(root.lexical, requested))) throw new Error(`${label} is outside allowed roots.`);
  return requested;
}

const disjoint = (left, right) => !inside(left, right) && !inside(right, left);
const object = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) });
const filePath = { type: 'string', minLength: 1, maxLength: 32768 };
const confirm = { type: 'boolean', const: true };

export function toolDefinitions(current = policy()) {
  const tools = [
    {
      name: 'evavo_raw_art_visual_capabilities',
      description: 'Describe safe PNG contact-sheet, HTML gallery, technical style evidence and agent review-packet capabilities.',
      inputSchema: object({}),
    },
    {
      name: 'evavo_raw_art_visual_verify_catalog',
      description: 'Hash-verify an existing visual catalog and optionally revalidate every immutable RAW_ART source PNG.',
      inputSchema: object({ outputRoot: filePath, rawArtRoot: filePath }, ['outputRoot']),
    },
  ];
  if (current.writesEnabled) tools.push({
    name: 'evavo_raw_art_visual_build_catalog',
    description: 'Create disposable thumbnails, complete contact sheets, an HTML gallery, technical style evidence and review packets outside immutable RAW_ART. Requires confirmWrite=true.',
    inputSchema: object({
      rawArtRoot: filePath,
      outputRoot: filePath,
      projectId: { type: 'string', minLength: 1, maxLength: 128 },
      packetSize: { type: 'integer', minimum: 4, maximum: 100 },
      thumbnailSize: { type: 'integer', minimum: 128, maximum: 512 },
      maximumFiles: { type: 'integer', minimum: 1, maximum: 1000000 },
      maximumBytes: { type: 'integer', minimum: 1 },
      confirmWrite: confirm,
    }, ['rawArtRoot', 'outputRoot', 'confirmWrite']),
  });
  return Object.freeze(tools);
}

function envelope(summary, visualCatalogWrite = false) {
  return Object.freeze({
    summary,
    effects: Object.freeze({ visualCatalogWrite, ...authority }),
    imageBytesFlowThroughMcp: false,
    visualArtifactPathsReturned: true,
    originalsRemainReadOnly: true,
  });
}

async function python(argumentsList, environment = process.env) {
  const executable = environment.EVAVO_RAW_ART_VISUAL_PYTHON || environment.EVAVO_PYTHON || 'python';
  const { stdout } = await runFile(executable, [scriptPath, ...argumentsList], {
    encoding: 'utf8',
    env: environment,
    windowsHide: true,
    shell: false,
    maxBuffer: 8 * 1024 * 1024,
  });
  return JSON.parse(stdout.trim());
}

export async function callTool(name, input = {}, context = {}) {
  const current = context.policy ?? context.mode ?? policy(context.environment);
  const allowed = context.roots ?? roots(context.environment);
  if (!toolDefinitions(current).some((tool) => tool.name === name)) throw new Error(`Unknown or prohibited RAW_ART visual tool ${name}.`);
  if (name === 'evavo_raw_art_visual_capabilities') return envelope({
    schema: 'evavo.raw-art-visual-catalog-capabilities.v1',
    version: SERVER_VERSION,
    mode: current.value,
    writesEnabled: current.writesEnabled,
    allowedRootCount: allowed.length,
    artifacts: ['manifest.json', 'index.html', 'AGENT_REVIEW_QUEUE.md', 'thumbnails/*.png', 'contact-sheets/*.png'],
    workflow: ['open-contact-sheet', 'inspect-selected-original', 'record-creative-decision', 'create-working-copy', 'edit-or-generate-derivative', 'review-in-game'],
  });
  if (name === 'evavo_raw_art_visual_verify_catalog') {
    const outputRoot = confined(input.outputRoot, 'outputRoot', allowed);
    const command = ['verify', '--output-root', outputRoot];
    if (input.rawArtRoot) command.push('--raw-art-root', confined(input.rawArtRoot, 'rawArtRoot', allowed));
    return envelope(await python(command, context.environment));
  }
  if (input.confirmWrite !== true) throw new Error(`${name} requires confirmWrite=true.`);
  const rawArtRoot = confined(input.rawArtRoot, 'rawArtRoot', allowed);
  const outputRoot = confined(input.outputRoot, 'outputRoot', allowed, { future: true });
  if (!disjoint(rawArtRoot, outputRoot)) throw new Error('outputRoot and rawArtRoot must be completely disjoint.');
  const command = ['build', '--raw-art-root', rawArtRoot, '--output-root', outputRoot];
  if (input.projectId) command.push('--project-id', input.projectId);
  if (input.packetSize) command.push('--packet-size', String(input.packetSize));
  if (input.thumbnailSize) command.push('--thumbnail-size', String(input.thumbnailSize));
  if (input.maximumFiles) command.push('--maximum-files', String(input.maximumFiles));
  if (input.maximumBytes) command.push('--maximum-bytes', String(input.maximumBytes));
  return envelope(await python(command, context.environment), true);
}

const response = (id, result) => ({ jsonrpc: '2.0', id: id ?? null, result });
const content = (value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }];

export async function handleRequest(request, context = {}) {
  if (request?.jsonrpc !== '2.0' || typeof request.method !== 'string') throw new Error('Invalid JSON-RPC request.');
  const current = context.policy ?? context.mode ?? policy(context.environment);
  if (request.method === 'initialize') return response(request.id, {
    protocolVersion: request.params?.protocolVersion ?? '2025-03-26',
    capabilities: { tools: {} },
    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    instructions: 'Build visual artifacts outside RAW_ART, inspect every contact sheet, then inspect selected originals. Preview generation never grants creative, provenance, runtime or publication authority.',
  });
  if (request.method === 'ping') return response(request.id, {});
  if (request.method === 'notifications/initialized') return null;
  if (request.method === 'tools/list') return response(request.id, { tools: toolDefinitions(current) });
  if (request.method === 'tools/call') {
    try {
      const value = await callTool(request.params?.name, request.params?.arguments ?? {}, context);
      return response(request.id, { content: content(value), structuredContent: value, isError: false });
    } catch (error) {
      return response(request.id, { content: content({ code: error?.code ?? 'RAW_ART_VISUAL_TOOL_REJECTED', message: error.message }), isError: true });
    }
  }
  throw new Error(`Unsupported MCP method ${request.method}.`);
}

export async function startServer(options = {}) {
  const context = { environment: options.environment ?? process.env, policy: options.policy, roots: options.roots };
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
  for await (const line of input) {
    if (!line.trim()) continue;
    let request;
    try {
      request = JSON.parse(line);
      const result = await handleRequest(request, context);
      if (result) process.stdout.write(`${JSON.stringify(result)}\n`);
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32000, message: error.message } })}\n`);
    }
  }
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) startServer().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
