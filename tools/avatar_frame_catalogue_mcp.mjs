#!/usr/bin/env node
import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';
import { readJson } from '../scripts/raw-art-folder/lib.mjs';
import {
  AVATAR_DECISIONS_SCHEMA,
  AVATAR_PLAN_SCHEMA,
  AVATAR_REVIEW_SCHEMA,
  buildAvatarFrameReviewPackets,
  compileAvatarFrameSequencePlan,
  reviewAvatarFrameRoot,
  verifyAvatarFrameSequencePlan,
} from '../scripts/avatar-frame-catalogue.mjs';

export const SERVER_NAME = 'evavo-avatar-frame-catalogue';
export const SERVER_VERSION = '1.0.0';
const p = { type: 'string', minLength: 1, maxLength: 32768 };
const object = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) });

function roots(environment = process.env) {
  const separator = process.platform === 'win32' ? ';' : ':';
  const configured = String(environment.EVAVO_AVATAR_FRAME_ALLOWED_ROOTS ?? '')
    .split(separator).map((value) => value.trim()).filter(Boolean).map((value) => path.resolve(value));
  if (!configured.length) throw new Error('EVAVO_AVATAR_FRAME_ALLOWED_ROOTS must not be empty.');
  return Object.freeze([...new Set(configured)].map((lexical) => {
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

function confined(value, label, allowed) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error(`${label} is required.`);
  const requested = path.resolve(value);
  const state = lstatSync(requested);
  if (state.isSymbolicLink()) throw new Error(`${label} must not be symbolic.`);
  const real = realpathSync(requested);
  if (!allowed.some((root) => inside(root.real, real) && inside(root.lexical, requested))) throw new Error(`${label} is outside allowed roots.`);
  return requested;
}

export function toolDefinitions() {
  return Object.freeze([
    {
      name: 'evavo_avatar_frame_capabilities',
      description: 'Describe read-only existing-avatar frame review and explicit sequence-planning capabilities. No image generation, editing, Storage write, repository mutation, Git or deployment authority.',
      inputSchema: object({}),
    },
    {
      name: 'evavo_avatar_frame_review_packets',
      description: 'Inspect an existing image root and return deterministic non-semantic review packets. Filename/timestamp/generation order never becomes animation meaning.',
      inputSchema: object({ rawArtRoot: p, characterId: p, packetSize: { type: 'integer', minimum: 2, maximum: 50 }, maximumFiles: { type: 'integer', minimum: 1 }, maximumBytes: { type: 'integer', minimum: 1 } }, ['rawArtRoot', 'characterId']),
    },
    {
      name: 'evavo_avatar_frame_compile_sequence_plan',
      description: 'Compile explicit owner-reviewed sequence decisions against one exact RAW_ART inventory and return a deterministic no-write plan with rename, Storage-path and repository-target metadata.',
      inputSchema: object({ inventoryPath: p, decisionsPath: p, compiledAt: p }, ['inventoryPath', 'decisionsPath']),
    },
    {
      name: 'evavo_avatar_frame_verify_sequence_plan',
      description: 'Verify the self-hash and withheld authority of one avatar frame sequence plan.',
      inputSchema: object({ planPath: p }, ['planPath']),
    },
  ]);
}

const effects = Object.freeze({
  imageGeneration: false,
  imageEditing: false,
  sourceMutation: false,
  storageWrite: false,
  repositoryMutation: false,
  gitCommit: false,
  gitPush: false,
  forcePush: false,
  publication: false,
  deployment: false,
  runtimeActivation: false,
});
const envelope = (summary) => Object.freeze({ summary, effects, bytesFlowThroughMcp: false, credentialsForwarded: false });

export async function callTool(name, input = {}, context = {}) {
  if (!toolDefinitions().some((tool) => tool.name === name)) throw new Error(`Unknown avatar-frame tool ${name}.`);
  const allowed = context.roots ?? roots(context.environment);
  if (name === 'evavo_avatar_frame_capabilities') return envelope({ server: SERVER_NAME, version: SERVER_VERSION, reviewSchema: AVATAR_REVIEW_SCHEMA, decisionsSchema: AVATAR_DECISIONS_SCHEMA, planSchema: AVATAR_PLAN_SCHEMA, semanticInferenceAuthoritative: false, tools: toolDefinitions().map((tool) => tool.name) });
  if (name === 'evavo_avatar_frame_review_packets') {
    const value = await reviewAvatarFrameRoot({ rawArtRoot: confined(input.rawArtRoot, 'rawArtRoot', allowed), characterId: input.characterId, packetSize: input.packetSize, maximumFiles: input.maximumFiles, maximumBytes: input.maximumBytes });
    return envelope(value);
  }
  if (name === 'evavo_avatar_frame_compile_sequence_plan') {
    const value = await compileAvatarFrameSequencePlan({ inventoryPath: confined(input.inventoryPath, 'inventoryPath', allowed), decisionsPath: confined(input.decisionsPath, 'decisionsPath', allowed), compiledAt: input.compiledAt });
    return envelope(value);
  }
  if (name === 'evavo_avatar_frame_verify_sequence_plan') {
    const { value } = await readJson(confined(input.planPath, 'planPath', allowed), 'planPath');
    return envelope(verifyAvatarFrameSequencePlan(value));
  }
  throw new Error(`Unknown avatar-frame tool ${name}.`);
}

const response = (id, result) => ({ jsonrpc: '2.0', id: id ?? null, result });
const content = (value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }];
export async function handleRequest(request, context = {}) {
  if (request?.jsonrpc !== '2.0' || typeof request.method !== 'string') throw new Error('Invalid JSON-RPC request.');
  if (request.method === 'initialize') return response(request.id, { protocolVersion: request.params?.protocolVersion ?? '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }, instructions: 'Existing image bytes remain outside MCP. Review packets are non-semantic; explicit owner-reviewed sequence decisions are required. No image generation, write, Git, publication or activation authority is granted.' });
  if (request.method === 'ping') return response(request.id, {});
  if (request.method === 'notifications/initialized') return null;
  if (request.method === 'tools/list') return response(request.id, { tools: toolDefinitions() });
  if (request.method === 'tools/call') {
    try {
      const value = await callTool(request.params?.name, request.params?.arguments ?? {}, context);
      return response(request.id, { content: content(value), structuredContent: value, isError: false });
    } catch (error) {
      return response(request.id, { content: content({ code: error?.code ?? 'AVATAR_FRAME_TOOL_REJECTED', message: error.message }), isError: true });
    }
  }
  throw new Error(`Unsupported MCP method ${request.method}.`);
}

export async function startServer(options = {}) {
  const context = { environment: options.environment ?? process.env, roots: options.roots };
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

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) startServer().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
