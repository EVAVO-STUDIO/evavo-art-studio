#!/usr/bin/env node
import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';

import {
  AVATAR_FINAL_PASS_PLAN_SCHEMA,
  AVATAR_FINAL_PASS_REQUEST_SCHEMA,
  compileProjectArtAvatarFinalPassFile,
} from '../scripts/project-art/avatar-final-pass.mjs';

const SERVER_NAME = 'evavo-project-art-avatar-final-pass';
const SERVER_VERSION = '1.0.0';
const MAXIMUM_MESSAGE_BYTES = 128 * 1024;

function allowedRoots() {
  const raw = process.env.EVAVO_ART_AVATAR_FINAL_PASS_ROOTS ?? '';
  const roots = raw
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => realpathSync(path.resolve(entry)));
  if (roots.length === 0) {
    throw new Error('EVAVO_ART_AVATAR_FINAL_PASS_ROOTS must contain at least one existing directory.');
  }
  return roots;
}

const ROOTS = allowedRoots();
const WRITE_ALLOWED = process.env.EVAVO_ART_AVATAR_FINAL_PASS_MCP_ALLOW_WRITE === 'true';

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function existingPath(value, label) {
  if (typeof value !== 'string' || !value) throw new Error(`${label} is required.`);
  const resolved = realpathSync(path.resolve(value));
  if (!ROOTS.some((root) => isInside(root, resolved))) {
    throw new Error(`${label} is outside EVAVO_ART_AVATAR_FINAL_PASS_ROOTS.`);
  }
  return resolved;
}

function outputPath(value) {
  if (typeof value !== 'string' || !value) throw new Error('outputPath is required.');
  const resolved = path.resolve(value);
  const parent = realpathSync(path.dirname(resolved));
  if (!ROOTS.some((root) => isInside(root, parent))) {
    throw new Error('outputPath is outside EVAVO_ART_AVATAR_FINAL_PASS_ROOTS.');
  }
  if (lstatSync(parent).isSymbolicLink()) {
    throw new Error('outputPath parent cannot be a symlink.');
  }
  return resolved;
}

function textContent(value) {
  return [{ type: 'text', text: JSON.stringify(value) }];
}

function capabilities() {
  return {
    schema: 'evavo.project-art-avatar-final-pass-capabilities.v1',
    requestSchema: AVATAR_FINAL_PASS_REQUEST_SCHEMA,
    planSchema: AVATAR_FINAL_PASS_PLAN_SCHEMA,
    tools: [
      'evavo_art_avatar_final_pass_capabilities',
      'evavo_art_compile_avatar_final_pass',
    ],
    inputs: {
      repositoryMaterializationManifest: true,
      exactFrameSha256: true,
      explicitFrameDispositions: true,
      explicitRepairOperations: true,
      explicitInbetweens: true,
      explicitSequenceTiming: true,
    },
    outputs: {
      frameQualityJobs: true,
      deterministicRepairJobs: true,
      providerRedrawRequests: true,
      inbetweenRequests: true,
      sequenceMasteringTemplate: true,
      atlasTemplate: true,
      releaseRequirements: true,
    },
    writeGate: 'EVAVO_ART_AVATAR_FINAL_PASS_MCP_ALLOW_WRITE',
    roots: 'EVAVO_ART_AVATAR_FINAL_PASS_ROOTS',
    sourceImageBytesFlowThroughMcp: false,
    shellExecution: false,
    providerExecution: false,
    candidateApproval: false,
    repositoryMutation: false,
    gitCommit: false,
    gitPush: false,
    publication: false,
    runtimeActivation: false,
    forcePush: false,
  };
}

function toolDefinitions() {
  return [
    {
      name: 'evavo_art_avatar_final_pass_capabilities',
      description: 'Return the bounded avatar final-pass capability and authority contract.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'evavo_art_compile_avatar_final_pass',
      description:
        'Compile one explicit, SHA-bound avatar final-art request into quality, repair, in-between, timing, mastering, atlas and release handoffs. Performs no image editing or provider execution.',
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
  ];
}

function handleToolCall(params) {
  const name = params?.name;
  const args = params?.arguments ?? {};
  if (name === 'evavo_art_avatar_final_pass_capabilities') {
    return { content: textContent(capabilities()), isError: false };
  }
  if (name !== 'evavo_art_compile_avatar_final_pass') {
    throw new Error(`Unknown tool: ${name}`);
  }
  if (!WRITE_ALLOWED) {
    throw new Error('EVAVO_ART_AVATAR_FINAL_PASS_MCP_ALLOW_WRITE must be true to create a plan.');
  }
  const workspaceRoot = existingPath(args.workspaceRoot, 'workspaceRoot');
  const requestPath = existingPath(args.requestPath, 'requestPath');
  const target = outputPath(args.outputPath);
  const plan = compileProjectArtAvatarFinalPassFile({
    workspaceRoot,
    requestPath,
    outputPath: target,
    ...(args.compiledAt ? { compiledAt: args.compiledAt } : {}),
  });
  return {
    content: textContent({
      status: 'passed',
      schema: plan.schema,
      sessionId: plan.sessionId,
      characterId: plan.characterId,
      planSha256: plan.planSha256,
      selectedFrameCount: plan.materialization.selectedFrameCount,
      qualityJobCount: plan.qualityJobs.length,
      repairJobCount: plan.repairJobs.length,
      inbetweenJobCount: plan.inbetweenJobs.length,
      sequenceCount: plan.sequenceTimeline.length,
      productionReady: false,
      runtimeActivationAllowed: false,
      outputPath: target,
    }),
    isError: false,
  };
}

function response(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function errorResponse(id, error) {
  process.stdout.write(
    `${JSON.stringify({
      jsonrpc: '2.0',
      id: id ?? null,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : String(error),
      },
    })}\n`,
  );
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', (line) => {
  if (!line.trim()) return;
  if (Buffer.byteLength(line, 'utf8') > MAXIMUM_MESSAGE_BYTES) {
    errorResponse(null, new Error('MCP message exceeds the bounded input size.'));
    return;
  }
  let message;
  try {
    message = JSON.parse(line);
    if (message?.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      throw new Error('Invalid JSON-RPC request.');
    }
    if (message.method === 'initialize') {
      response(message.id, {
        protocolVersion: message.params?.protocolVersion ?? '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });
      return;
    }
    if (message.method === 'notifications/initialized') return;
    if (message.method === 'ping') {
      response(message.id, {});
      return;
    }
    if (message.method === 'tools/list') {
      response(message.id, { tools: toolDefinitions() });
      return;
    }
    if (message.method === 'tools/call') {
      response(message.id, handleToolCall(message.params));
      return;
    }
    throw new Error(`Unsupported method: ${message.method}`);
  } catch (error) {
    errorResponse(message?.id ?? null, error);
  }
});
