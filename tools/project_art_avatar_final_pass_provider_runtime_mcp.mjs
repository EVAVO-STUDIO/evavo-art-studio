#!/usr/bin/env node
import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';

import {
  avatarFinalPassProviderRuntimeCapabilities,
  bindAvatarFinalPassProviderRuntimeContractFile,
  compileAvatarFinalPassProviderRuntimeDispatchFile,
  compileAvatarFinalPassProviderRuntimeOutcomeFile,
} from '../scripts/project-art/avatar-final-pass-provider-runtime.mjs';

export const SERVER_NAME =
  'evavo-project-art-avatar-final-pass-provider-runtime';
export const SERVER_VERSION = '1.0.0';
export const CAPABILITIES_TOOL =
  'evavo_art_avatar_final_pass_provider_runtime_capabilities';
export const DISPATCH_TOOL =
  'evavo_art_compile_avatar_final_pass_provider_runtime_dispatch';
export const BIND_TOOL =
  'evavo_art_bind_avatar_final_pass_provider_runtime_contract';
export const OUTCOME_TOOL =
  'evavo_art_compile_avatar_final_pass_provider_runtime_outcome';

const MAXIMUM_MESSAGE_BYTES = 256 * 1024;

function allowedRoots() {
  const raw =
    process.env.EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_RUNTIME_ROOTS ?? '';
  const roots = raw
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => realpathSync(path.resolve(entry)));
  if (roots.length === 0) {
    throw new Error(
      'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_RUNTIME_ROOTS must contain at least one existing directory.',
    );
  }
  return roots;
}

const ROOTS = allowedRoots();
const WRITE_ALLOWED =
  process.env
    .EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_RUNTIME_MCP_ALLOW_WRITE === 'true';

function isInside(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function existingFile(value, label) {
  if (typeof value !== 'string' || !value) {
    throw new Error(`${label} is required.`);
  }
  const resolved = realpathSync(path.resolve(value));
  if (!ROOTS.some((root) => isInside(root, resolved))) {
    throw new Error(
      `${label} is outside EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_RUNTIME_ROOTS.`,
    );
  }
  const metadata = lstatSync(resolved);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) {
    throw new Error(`${label} must be a single-link regular file.`);
  }
  return resolved;
}

function outputFile(value) {
  if (typeof value !== 'string' || !value) {
    throw new Error('outputPath is required.');
  }
  const resolved = path.resolve(value);
  const parent = realpathSync(path.dirname(resolved));
  if (!ROOTS.some((root) => isInside(root, parent))) {
    throw new Error(
      'outputPath is outside EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_RUNTIME_ROOTS.',
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

export function toolDefinitions() {
  const pathProperty = { type: 'string', minLength: 1 };
  return Object.freeze([
    {
      name: CAPABILITIES_TOOL,
      description:
        'Return the bounded avatar final-pass provider runtime bridge capabilities and entirely separate execution, materialization, approval and publication authority.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: DISPATCH_TOOL,
      description:
        'Compile one exact ready job from a sealed avatar provider batch into a self-hashed dispatch for @evavo/art-providers compileProviderCandidateRuntimeContract. This tool does not compile or enqueue the generic runtime job.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['batchPath', 'jobId', 'outputPath'],
        properties: {
          batchPath: pathProperty,
          jobId: { type: 'string', minLength: 1 },
          outputPath: pathProperty,
          compiledAt: { type: 'string', minLength: 1 },
        },
      },
    },
    {
      name: BIND_TOOL,
      description:
        'Validate the exact generic provider runtime contract compiled for one avatar dispatch and publish a create-only binding. This tool does not enqueue or execute the runtime job.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: [
          'dispatchPath',
          'compiledRuntimeContractPath',
          'outputPath',
        ],
        properties: {
          dispatchPath: pathProperty,
          compiledRuntimeContractPath: pathProperty,
          outputPath: pathProperty,
        },
      },
    },
    {
      name: OUTCOME_TOOL,
      description:
        'Normalize one exact provider candidate result or provider failure into a create-only materialization or failure record. This tool does not materialize, approve, promote or activate the candidate.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: [
          'dispatchPath',
          'bindingPath',
          'runtimeOutcomePath',
          'outputPath',
        ],
        properties: {
          dispatchPath: pathProperty,
          bindingPath: pathProperty,
          runtimeOutcomePath: pathProperty,
          outputPath: pathProperty,
        },
      },
    },
  ]);
}

export function handleToolCall(params) {
  const name = params?.name;
  const args = params?.arguments ?? {};
  if (name === CAPABILITIES_TOOL) {
    return {
      content: textContent(avatarFinalPassProviderRuntimeCapabilities()),
      isError: false,
    };
  }
  if (![DISPATCH_TOOL, BIND_TOOL, OUTCOME_TOOL].includes(name)) {
    throw new Error(`Unknown tool: ${name}`);
  }
  if (!WRITE_ALLOWED) {
    throw new Error(
      'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_RUNTIME_MCP_ALLOW_WRITE must be true to create runtime records.',
    );
  }

  if (name === DISPATCH_TOOL) {
    const { dispatch, outputPath } =
      compileAvatarFinalPassProviderRuntimeDispatchFile({
        batchPath: existingFile(args.batchPath, 'batchPath'),
        jobId: args.jobId,
        outputPath: outputFile(args.outputPath),
        ...(args.compiledAt ? { compiledAt: args.compiledAt } : {}),
      });
    return {
      content: textContent({
        status: 'passed',
        schema: dispatch.schema,
        jobId: dispatch.jobId,
        operation: dispatch.operation,
        runtimeDispatchSha256: dispatch.runtimeDispatchSha256,
        runtimeEnqueue: false,
        providerExecution: false,
        candidateApproval: false,
        outputPath,
      }),
      isError: false,
    };
  }

  if (name === BIND_TOOL) {
    const { binding, outputPath } =
      bindAvatarFinalPassProviderRuntimeContractFile({
        dispatchPath: existingFile(args.dispatchPath, 'dispatchPath'),
        compiledRuntimeContractPath: existingFile(
          args.compiledRuntimeContractPath,
          'compiledRuntimeContractPath',
        ),
        outputPath: outputFile(args.outputPath),
      });
    return {
      content: textContent({
        status: 'passed',
        schema: binding.schema,
        jobId: binding.jobId,
        normalizedProviderRequestId: binding.normalizedProviderRequestId,
        runtimeBindingSha256: binding.runtimeBindingSha256,
        runtimeEnqueue: false,
        providerExecution: false,
        outputPath,
      }),
      isError: false,
    };
  }

  const { outcome, outputPath } =
    compileAvatarFinalPassProviderRuntimeOutcomeFile({
      dispatchPath: existingFile(args.dispatchPath, 'dispatchPath'),
      bindingPath: existingFile(args.bindingPath, 'bindingPath'),
      runtimeOutcomePath: existingFile(
        args.runtimeOutcomePath,
        'runtimeOutcomePath',
      ),
      outputPath: outputFile(args.outputPath),
    });
  return {
    content: textContent({
      status: 'passed',
      schema: outcome.schema,
      jobId: outcome.jobId,
      resultStatus: outcome.result.status,
      runtimeOutcomeSha256: outcome.runtimeOutcomeSha256,
      candidateMaterialization: false,
      candidateApproval: false,
      runtimeActivation: false,
      outputPath,
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

const input = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});
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
