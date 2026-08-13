#!/usr/bin/env node
import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

import {
  avatarSequenceReleaseCapabilities,
  sealAvatarSequenceReleaseFiles,
} from '../scripts/project-art/avatar-sequence-release.mjs';

export const SERVER_NAME = 'evavo-project-art-avatar-sequence-release';
export const SERVER_VERSION = '1.0.0';
export const CAPABILITIES_TOOL = 'evavo_art_avatar_sequence_release_capabilities';
export const SEAL_TOOL = 'evavo_art_seal_avatar_sequence_release';
const MAXIMUM_MESSAGE_BYTES = 256 * 1024;

function configuredRoots(environment) {
  const raw = environment.EVAVO_ART_AVATAR_SEQUENCE_RELEASE_ROOTS ?? '';
  const roots = raw
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => realpathSync(path.resolve(entry)));
  if (!roots.length) {
    throw new Error(
      'EVAVO_ART_AVATAR_SEQUENCE_RELEASE_ROOTS must contain at least one existing directory.',
    );
  }
  for (const root of roots) {
    const metadata = lstatSync(root);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error('Every configured avatar sequence release root must be a real directory.');
    }
  }
  return roots;
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function admittedWorkspaceRoot(value, roots) {
  if (typeof value !== 'string' || !value) throw new Error('workspaceRoot is required.');
  const resolved = realpathSync(path.resolve(value));
  if (!roots.some((root) => isInside(root, resolved))) {
    throw new Error('workspaceRoot is outside the configured avatar sequence release roots.');
  }
  const metadata = lstatSync(resolved);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error('workspaceRoot must be a real directory.');
  }
  return resolved;
}

function admittedRequestPath(value, workspaceRoot, roots) {
  if (typeof value !== 'string' || !value) throw new Error('requestPath is required.');
  const resolved = realpathSync(path.resolve(value));
  if (
    !isInside(workspaceRoot, resolved) ||
    !roots.some((root) => isInside(root, resolved))
  ) {
    throw new Error('requestPath is outside the admitted workspace and configured roots.');
  }
  const metadata = lstatSync(resolved);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) {
    throw new Error('requestPath must be a single-link regular file.');
  }
  return path.relative(workspaceRoot, resolved).split(path.sep).join('/');
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
        'Return the bounded reviewed-avatar sequence release capabilities. Image bytes remain in local files and runtime activation remains unavailable.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: SEAL_TOOL,
      description:
        'Seal one exact owner-declared avatar sequence only after every runtime frame has a final named-human admission, every true loop has a passed atomic loop receipt, exact timing is approved, and art, animation and runtime disciplines approve the same release basis. Produces a create-only release, runtime pack and receipt without activating or publishing it.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['workspaceRoot', 'requestPath'],
        properties: {
          workspaceRoot: pathProperty,
          requestPath: pathProperty,
          sealedAt: { type: 'string', minLength: 1 },
        },
      },
    },
  ]);
}

export function handleToolCall(params, environment = process.env) {
  const name = params?.name;
  const args = params?.arguments ?? {};
  if (name === CAPABILITIES_TOOL) {
    return {
      content: textContent(avatarSequenceReleaseCapabilities()),
      isError: false,
    };
  }
  if (name !== SEAL_TOOL) throw new Error(`Unknown tool: ${name}`);
  if (environment.EVAVO_ART_AVATAR_SEQUENCE_RELEASE_MCP_ALLOW_WRITE !== 'true') {
    throw new Error('EVAVO_ART_AVATAR_SEQUENCE_RELEASE_MCP_ALLOW_WRITE must be true.');
  }
  const roots = configuredRoots(environment);
  const workspaceRoot = admittedWorkspaceRoot(args.workspaceRoot, roots);
  const requestPath = admittedRequestPath(args.requestPath, workspaceRoot, roots);
  const result = sealAvatarSequenceReleaseFiles({
    workspaceRoot,
    requestPath,
    ...(args.sealedAt ? { sealedAt: args.sealedAt } : {}),
  });
  return {
    content: textContent({
      status: result.status,
      reused: result.reused,
      outputDirectoryPath: result.outputDirectoryPath,
      releasePath: result.releasePath,
      runtimePackPath: result.runtimePackPath,
      receiptPath: result.receiptPath,
      releaseSha256: result.release.releaseSha256,
      runtimePackSha256: result.runtimePack.packSha256,
      receiptSha256: result.receipt.receiptSha256,
      sequenceReleaseSealed: true,
      imageBytesThroughMcp: false,
      runtimeActivation: false,
      repositoryMutation: false,
      gitPublication: false,
      deployment: false,
      publication: false,
      forcePush: false,
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

export function startServer() {
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
}

const directlyInvoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (directlyInvoked) startServer();
