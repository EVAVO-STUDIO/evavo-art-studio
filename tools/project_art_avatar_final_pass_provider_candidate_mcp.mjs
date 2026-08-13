#!/usr/bin/env node
import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

import {
  avatarFinalPassProviderCandidateCapabilities,
  materializeAvatarFinalPassProviderCandidateFiles,
} from '../scripts/project-art/avatar-final-pass-provider-candidate.mjs';

export const SERVER_NAME =
  'evavo-project-art-avatar-final-pass-provider-candidate';
export const SERVER_VERSION = '1.0.0';
export const CAPABILITIES_TOOL =
  'evavo_art_avatar_final_pass_provider_candidate_capabilities';
export const MATERIALIZE_TOOL =
  'evavo_art_materialize_avatar_final_pass_provider_candidate';

const MAXIMUM_MESSAGE_BYTES = 256 * 1024;

function isInside(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function rootsFrom(value, label) {
  const entries = (value ?? '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => realpathSync(path.resolve(entry)));
  if (entries.length === 0) {
    throw new Error(`${label} must contain at least one existing directory.`);
  }
  for (const root of entries) {
    const metadata = lstatSync(root);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error(`${label} contains a non-directory or symbolic root.`);
    }
  }
  return Object.freeze([...new Set(entries)]);
}

function existingFile(value, label, roots) {
  if (typeof value !== 'string' || !value) {
    throw new Error(`${label} is required.`);
  }
  const resolved = realpathSync(path.resolve(value));
  if (!roots.some((root) => isInside(root, resolved))) {
    throw new Error(`${label} is outside the configured record roots.`);
  }
  const metadata = lstatSync(resolved);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) {
    throw new Error(`${label} must be a single-link regular file.`);
  }
  return resolved;
}

function existingDirectory(value, label, roots) {
  if (typeof value !== 'string' || !value) {
    throw new Error(`${label} is required.`);
  }
  const resolved = realpathSync(path.resolve(value));
  if (!roots.some((root) => isInside(root, resolved))) {
    throw new Error(`${label} is outside its configured roots.`);
  }
  const metadata = lstatSync(resolved);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory.`);
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
        'Return the bounded post-provider avatar candidate admission capabilities. The default deployment transports no image bytes through MCP and grants no materialization, review, approval, promotion or activation authority.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: MATERIALIZE_TOOL,
      description:
        'Verify one exact immutable provider candidate and evidence artifact, validate a non-animated 8-bit RGBA PNG on the governed canvas, publish the unapproved candidate create-only under its sealed scratch path, and create hash-bound materialization and frame-finisher records. This tool does not approve, promote, publish or activate the candidate.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: [
          'dispatchPath',
          'bindingPath',
          'outcomePath',
          'artifactRoot',
          'workspaceRoot',
          'authorization',
        ],
        properties: {
          dispatchPath: pathProperty,
          bindingPath: pathProperty,
          outcomePath: pathProperty,
          artifactRoot: pathProperty,
          workspaceRoot: pathProperty,
          materializedAt: { type: 'string', minLength: 1 },
          authorization: {
            type: 'object',
            additionalProperties: false,
            required: [
              'action',
              'actorClass',
              'actorId',
              'occurredAt',
              'evidenceSha256',
            ],
            properties: {
              action: {
                type: 'string',
                const: 'materialize-unapproved-provider-candidate',
              },
              actorClass: {
                type: 'string',
                enum: ['human', 'agent'],
              },
              actorId: { type: 'string', minLength: 1, maxLength: 256 },
              occurredAt: { type: 'string', minLength: 1 },
              evidenceSha256: {
                type: 'string',
                pattern: '^[a-f0-9]{64}$',
              },
            },
          },
        },
      },
    },
  ]);
}

export function createCandidateMcpServer({
  recordRoots,
  artifactRoots,
  writeAllowed = false,
  materialize = materializeAvatarFinalPassProviderCandidateFiles,
}) {
  const records = Object.freeze(recordRoots.map((entry) => realpathSync(entry)));
  const artifacts = Object.freeze(
    artifactRoots.map((entry) => realpathSync(entry)),
  );

  return Object.freeze({
    toolDefinitions,
    async handleToolCall(params) {
      const name = params?.name;
      const args = params?.arguments ?? {};
      if (name === CAPABILITIES_TOOL) {
        return {
          content: textContent(
            avatarFinalPassProviderCandidateCapabilities(),
          ),
          isError: false,
        };
      }
      if (name !== MATERIALIZE_TOOL) {
        throw new Error(`Unknown tool: ${name}`);
      }
      if (!writeAllowed) {
        throw new Error(
          'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_CANDIDATE_MCP_ALLOW_WRITE must be true to materialize an unapproved candidate.',
        );
      }

      const result = await materialize({
        dispatchPath: existingFile(
          args.dispatchPath,
          'dispatchPath',
          records,
        ),
        bindingPath: existingFile(
          args.bindingPath,
          'bindingPath',
          records,
        ),
        outcomePath: existingFile(
          args.outcomePath,
          'outcomePath',
          records,
        ),
        artifactRoot: existingDirectory(
          args.artifactRoot,
          'artifactRoot',
          artifacts,
        ),
        workspaceRoot: existingDirectory(
          args.workspaceRoot,
          'workspaceRoot',
          records,
        ),
        authorization: args.authorization,
        ...(args.materializedAt
          ? { materializedAt: args.materializedAt }
          : {}),
      });

      return {
        content: textContent({
          status: result.status,
          reused: result.reused,
          materializationId: result.materializationId,
          candidatePath: result.candidatePath,
          receiptPath: result.receiptPath,
          finisherRequestPath: result.finisherRequestPath,
          imageBytesFlowThroughMcp: false,
          candidateApproval: false,
          candidatePromotion: false,
          runtimeActivation: false,
        }),
        isError: false,
      };
    },
  });
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

export function startCandidateMcpServer(environment = process.env) {
  const recordRoots = rootsFrom(
    environment.EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_CANDIDATE_ROOTS,
    'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_CANDIDATE_ROOTS',
  );
  const artifactRoots = rootsFrom(
    environment.EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_ARTIFACT_ROOTS,
    'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_ARTIFACT_ROOTS',
  );
  const server = createCandidateMcpServer({
    recordRoots,
    artifactRoots,
    writeAllowed:
      environment
        .EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_CANDIDATE_MCP_ALLOW_WRITE ===
      'true',
  });

  const input = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });
  input.on('line', async (line) => {
    if (!line.trim()) return;
    if (Buffer.byteLength(line, 'utf8') > MAXIMUM_MESSAGE_BYTES) {
      errorResponse(
        null,
        new Error('MCP message exceeds the bounded input size.'),
      );
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
          protocolVersion:
            message.params?.protocolVersion ?? '2024-11-05',
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
        response(message.id, { tools: server.toolDefinitions() });
        return;
      }
      if (message.method === 'tools/call') {
        response(message.id, await server.handleToolCall(message.params));
        return;
      }
      throw new Error(`Unsupported method: ${message.method}`);
    } catch (error) {
      errorResponse(message?.id ?? null, error);
    }
  });
}

const directPath = process.argv[1]
  ? path.resolve(process.argv[1])
  : null;
if (
  directPath &&
  directPath === path.resolve(fileURLToPath(import.meta.url))
) {
  startCandidateMcpServer();
}
