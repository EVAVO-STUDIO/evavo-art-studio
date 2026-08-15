#!/usr/bin/env node
import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';

import {
  compileProjectArtAvatarAnimationSuiteFile,
  projectArtAvatarAnimationSuiteCapabilities,
} from '../scripts/project-art/avatar-animation-suite.mjs';

const SERVER_NAME = 'evavo-project-art-avatar-animation-suite';
const SERVER_VERSION = '1.0.0';
const MAXIMUM_MESSAGE_BYTES = 128 * 1024;

function roots() {
  const configured = process.env.EVAVO_ART_AVATAR_ANIMATION_ROOTS ?? '';
  const values = configured
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => realpathSync(path.resolve(entry)));
  if (!values.length) {
    throw new Error(
      'EVAVO_ART_AVATAR_ANIMATION_ROOTS must contain at least one existing directory.',
    );
  }
  return [...new Set(values)];
}

const ROOTS = roots();
const WRITE_ALLOWED =
  process.env.EVAVO_ART_AVATAR_ANIMATION_MCP_ALLOW_WRITE === 'true';

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function inputPath(value) {
  if (typeof value !== 'string' || !value) throw new Error('requestPath is required.');
  const target = realpathSync(path.resolve(value));
  if (!ROOTS.some((root) => inside(root, target))) {
    throw new Error('requestPath is outside EVAVO_ART_AVATAR_ANIMATION_ROOTS.');
  }
  return target;
}

function outputPath(value) {
  if (typeof value !== 'string' || !value) throw new Error('outputPath is required.');
  const target = path.resolve(value);
  const parent = realpathSync(path.dirname(target));
  if (
    !ROOTS.some((root) => inside(root, parent)) ||
    lstatSync(parent).isSymbolicLink()
  ) {
    throw new Error('outputPath is outside EVAVO_ART_AVATAR_ANIMATION_ROOTS.');
  }
  return target;
}

function text(value) {
  return [{ type: 'text', text: JSON.stringify(value) }];
}

function definitions() {
  return [
    {
      name: 'evavo_art_avatar_animation_suite_capabilities',
      description:
        'Return the professional avatar animation, real-alpha, layer, continuity and authority contract.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'evavo_art_compile_avatar_animation_suite',
      description:
        'Compile EVA or Top Hat into a complete multi-idle, multi-talk, lip-sync-layer, frame-assurance, sequence and atlas production plan.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['requestPath', 'outputPath'],
        properties: {
          requestPath: { type: 'string' },
          outputPath: { type: 'string' },
          compiledAt: { type: 'string' },
        },
      },
    },
  ];
}

function call(params) {
  const name = params?.name;
  const args = params?.arguments ?? {};
  if (name === 'evavo_art_avatar_animation_suite_capabilities') {
    return {
      content: text(projectArtAvatarAnimationSuiteCapabilities()),
      isError: false,
    };
  }
  if (name !== 'evavo_art_compile_avatar_animation_suite') {
    throw new Error(`Unknown tool: ${name}`);
  }
  if (!WRITE_ALLOWED) {
    throw new Error(
      'EVAVO_ART_AVATAR_ANIMATION_MCP_ALLOW_WRITE must be true to create a plan.',
    );
  }
  const plan = compileProjectArtAvatarAnimationSuiteFile({
    requestPath: inputPath(args.requestPath),
    outputPath: outputPath(args.outputPath),
    compiledAt: args.compiledAt ?? new Date().toISOString(),
  });
  return {
    content: text({
      status: 'passed',
      sessionId: plan.sessionId,
      characterId: plan.characterId,
      clipCount: plan.counts.clips,
      frameJobCount: plan.counts.fullCharacterFrames,
      poseLayerJobCount: plan.counts.registeredPoseLayers,
      idleVariants: plan.counts.idleVariants,
      talkVariants: plan.counts.talkVariants,
      productionReady: false,
      runtimeActivationAllowed: false,
      planSha256: plan.planSha256,
      outputPath: path.resolve(args.outputPath),
    }),
    isError: false,
  };
}

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function reject(id, error) {
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
    reject(null, new Error('MCP message exceeds the bounded input size.'));
    return;
  }
  let message;
  try {
    message = JSON.parse(line);
    if (message?.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      throw new Error('Invalid JSON-RPC request.');
    }
    if (message.method === 'initialize') {
      respond(message.id, {
        protocolVersion: message.params?.protocolVersion ?? '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });
      return;
    }
    if (message.method === 'notifications/initialized') return;
    if (message.method === 'ping') {
      respond(message.id, {});
      return;
    }
    if (message.method === 'tools/list') {
      respond(message.id, { tools: definitions() });
      return;
    }
    if (message.method === 'tools/call') {
      respond(message.id, call(message.params));
      return;
    }
    throw new Error(`Unsupported method: ${message.method}`);
  } catch (error) {
    reject(message?.id ?? null, error);
  }
});
