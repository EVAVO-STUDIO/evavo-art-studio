#!/usr/bin/env node
import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';

import {
  AVATAR_FINAL_PASS_PROVIDER_BATCH_SCHEMA,
  AVATAR_FINAL_PASS_PROVIDER_REQUEST_SCHEMA,
  compileProjectArtAvatarFinalPassProviderBatchFile,
} from '../scripts/project-art/avatar-final-pass-provider.mjs';

export const SERVER_NAME = 'evavo-project-art-avatar-final-pass-provider';
export const SERVER_VERSION = '1.0.0';
export const CAPABILITIES_TOOL =
  'evavo_art_avatar_final_pass_provider_capabilities';
export const COMPILE_TOOL =
  'evavo_art_compile_avatar_final_pass_provider_batch';

const MAXIMUM_MESSAGE_BYTES = 256 * 1024;

function allowedRoots() {
  const raw = process.env.EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_ROOTS ?? '';
  const roots = raw
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => realpathSync(path.resolve(entry)));
  if (roots.length === 0) {
    throw new Error(
      'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_ROOTS must contain at least one existing directory.',
    );
  }
  return roots;
}

const ROOTS = allowedRoots();
const WRITE_ALLOWED =
  process.env.EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_MCP_ALLOW_WRITE === 'true';

function isInside(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function existingPath(value, label) {
  if (typeof value !== 'string' || !value) {
    throw new Error(`${label} is required.`);
  }
  const resolved = realpathSync(path.resolve(value));
  if (!ROOTS.some((root) => isInside(root, resolved))) {
    throw new Error(
      `${label} is outside EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_ROOTS.`,
    );
  }
  const metadata = lstatSync(resolved);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) {
    throw new Error(`${label} must be a single-link regular file.`);
  }
  return resolved;
}

function outputPath(value) {
  if (typeof value !== 'string' || !value) {
    throw new Error('outputPath is required.');
  }
  const resolved = path.resolve(value);
  const parent = realpathSync(path.dirname(resolved));
  if (!ROOTS.some((root) => isInside(root, parent))) {
    throw new Error(
      'outputPath is outside EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_ROOTS.',
    );
  }
  const metadata = lstatSync(parent);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error('outputPath parent must be a real directory.');
  }
  return resolved;
}

function textContent(value) {
  return [{ type: 'text', text: JSON.stringify(value) }];
}

export function capabilities() {
  return Object.freeze({
    schema: 'evavo.project-art-avatar-final-pass-provider-capabilities.v1',
    requestSchema: AVATAR_FINAL_PASS_PROVIDER_REQUEST_SCHEMA,
    batchSchema: AVATAR_FINAL_PASS_PROVIDER_BATCH_SCHEMA,
    tools: Object.freeze([CAPABILITIES_TOOL, COMPILE_TOOL]),
    inputs: Object.freeze({
      sealedFinalPassPlan: true,
      explicitSelectedProviderJobs: true,
      humanRunOnceAuthorization: true,
      humanAdmittedReferenceArtifacts: true,
      finalEndpointHashesForInbetweens: true,
      exactCandidateOutputPaths: true,
      noFallbackProviderSelection: true,
    }),
    outputs: Object.freeze({
      blockedJobEnvelopes: true,
      oneCandidateProviderRequests: true,
      redrawRequests: true,
      anatomySafeInbetweenRequests: true,
      promptHashes: true,
      providerRequestHashes: true,
      batchHash: true,
    }),
    writeGate: 'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_MCP_ALLOW_WRITE',
    roots: 'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_ROOTS',
    sourceImageBytesFlowThroughMcp: false,
    shellExecution: false,
    providerExecution: false,
    referenceArtifactAdmission: false,
    authorizationPersistence: false,
    candidateApproval: false,
    candidatePromotion: false,
    repositoryMutation: false,
    gitCommit: false,
    gitPush: false,
    publication: false,
    runtimeActivation: false,
    forcePush: false,
  });
}

export function toolDefinitions() {
  return Object.freeze([
    {
      name: CAPABILITIES_TOOL,
      description:
        'Return the bounded provider-submission compiler capabilities and false authority contract for avatar final-pass redraws and in-betweens.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: COMPILE_TOOL,
      description:
        'Compile explicitly selected provider-redraw and provider-generated in-between jobs from a sealed avatar final-pass plan. A job becomes submit-ready only after a named human run-once authorization, exact human-admitted reference artifacts, and final endpoint hashes. This tool never invokes a provider.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['planPath', 'requestPath', 'outputPath'],
        properties: {
          planPath: { type: 'string' },
          requestPath: { type: 'string' },
          outputPath: { type: 'string' },
          compiledAt: { type: 'string' },
        },
      },
    },
  ]);
}

export function handleToolCall(params) {
  const name = params?.name;
  const args = params?.arguments ?? {};
  if (name === CAPABILITIES_TOOL) {
    return { content: textContent(capabilities()), isError: false };
  }
  if (name !== COMPILE_TOOL) {
    throw new Error(`Unknown tool: ${name}`);
  }
  if (!WRITE_ALLOWED) {
    throw new Error(
      'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_MCP_ALLOW_WRITE must be true to create a provider batch.',
    );
  }
  const planPath = existingPath(args.planPath, 'planPath');
  const requestPath = existingPath(args.requestPath, 'requestPath');
  const target = outputPath(args.outputPath);
  const batch = compileProjectArtAvatarFinalPassProviderBatchFile({
    planPath,
    requestPath,
    outputPath: target,
    ...(args.compiledAt ? { compiledAt: args.compiledAt } : {}),
  });
  return {
    content: textContent({
      status: 'passed',
      schema: batch.schema,
      requestId: batch.requestId,
      batchSha256: batch.batchSha256,
      requested: batch.counts.requested,
      ready: batch.counts.ready,
      blocked: batch.counts.blocked,
      candidateCountPerJob: 1,
      providerExecution: false,
      candidateApproval: false,
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
