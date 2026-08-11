#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = path.join(root, 'tools', 'project_art_avatar_sequence_mcp.mjs');
const temporary = await mkdtemp(path.join(os.tmpdir(), 'evavo-avatar-sequence-mcp-'));
const workspace = path.join(temporary, 'workspace');
const fixedTime = '2026-08-11T06:40:00.000Z';
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBytes.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return output;
}

function png(red) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const row = (offset) => Buffer.from([0, red + offset, 20, 30, 255, red + offset, 20, 30, 255]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat([row(0), row(1)]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function rpc(toolName, argumentsValue, { write = false } = {}) {
  const requests = [
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'fixture', version: '1' },
      },
    },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: toolName, arguments: argumentsValue },
    },
  ];
  const result = spawnSync(process.execPath, [server], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
    input: `${requests.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
    env: {
      ...process.env,
      EVAVO_ART_AVATAR_SEQUENCE_ROOTS: temporary,
      EVAVO_ART_AVATAR_SEQUENCE_MCP_ALLOW_WRITE: write ? 'true' : 'false',
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const messages = result.stdout
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return {
    initialize: messages.find((entry) => entry.id === 1),
    list: messages.find((entry) => entry.id === 2),
    call: messages.find((entry) => entry.id === 3),
  };
}

try {
  await mkdir(path.join(workspace, 'raw'), { recursive: true });
  const definitions = [
    ['idle-a', 10],
    ['idle-b', 20],
    ['talk-a', 30],
    ['talk-b', 40],
  ];
  const frames = [];
  for (const [id, red] of definitions) {
    const bytes = png(red);
    const sourcePath = `raw/${id}.png`;
    await writeFile(path.join(workspace, sourcePath), bytes);
    frames.push({
      id,
      sourcePath,
      targetPath: `assets/eva-female/reviewed/${id}.png`,
      expectedSha256: sha256(bytes),
    });
  }
  const loopThresholds = {
    maximumChangedFraction: 0.25,
    maximumMeanChannelDelta: 48,
    maximumAlphaChangedFraction: 0.2,
    maximumCentroidShiftPixels: 24,
  };
  const request = {
    schema: 'evavo.project-art-avatar-sequence-request.v1',
    assignmentId: 'mcp-eva-assignment-v1',
    characterId: 'eva-female',
    revision: 1,
    purpose: 'Compile an explicit MCP fixture sequence without semantic inference.',
    assignmentMode: 'owner-declared-only',
    semanticInferencePerformed: false,
    timestampOrderingUsedAsSemantics: false,
    canvas: { width: 2, height: 2, requireAlpha: true },
    frames,
    clips: [
      {
        id: 'idle-main',
        kind: 'idle',
        loopMode: 'loop',
        frames: [
          { frameId: 'idle-a', durationMs: 80 },
          { frameId: 'idle-b', durationMs: 80 },
        ],
        neutralFrameId: 'idle-a',
        emotion: null,
        loopThresholds,
      },
      {
        id: 'talk-enter',
        kind: 'talk-in',
        loopMode: 'once',
        frames: [
          { frameId: 'idle-a', durationMs: 80 },
          { frameId: 'talk-a', durationMs: 80 },
        ],
        neutralFrameId: 'idle-a',
        emotion: null,
        loopThresholds: null,
      },
      {
        id: 'talk-main',
        kind: 'talk-loop',
        loopMode: 'loop',
        frames: [
          { frameId: 'talk-a', durationMs: 80 },
          { frameId: 'talk-b', durationMs: 80 },
        ],
        neutralFrameId: 'talk-a',
        emotion: null,
        loopThresholds,
      },
      {
        id: 'talk-exit',
        kind: 'talk-out',
        loopMode: 'once',
        frames: [
          { frameId: 'talk-b', durationMs: 80 },
          { frameId: 'idle-a', durationMs: 80 },
        ],
        neutralFrameId: 'idle-a',
        emotion: null,
        loopThresholds: null,
      },
    ],
    defaults: {
      idleClipId: 'idle-main',
      talk: {
        inClipId: 'talk-enter',
        loopClipId: 'talk-main',
        outClipId: 'talk-exit',
      },
      presence: { idle: 'idle-main' },
      events: {},
      emotions: {},
    },
    authority: {
      providerExecution: false,
      sourceMutation: false,
      sourceDeletion: false,
      candidateApproval: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitCommit: false,
      gitPush: false,
      publication: false,
      deployment: false,
      forcePush: false,
    },
  };
  const requestPath = path.join(workspace, 'avatar-sequence-request.json');
  const planPath = path.join(workspace, 'avatar-sequence-plan.json');
  await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`);

  const capabilitiesResponse = rpc(
    'evavo_art_avatar_sequence_capabilities',
    {},
  );
  assert.equal(
    capabilitiesResponse.initialize.result.serverInfo.name,
    'evavo-project-art-avatar-sequence',
  );
  assert.deepEqual(
    capabilitiesResponse.list.result.tools.map((tool) => tool.name),
    [
      'evavo_art_avatar_sequence_capabilities',
      'evavo_art_compile_avatar_sequence',
    ],
  );
  const capabilities = capabilitiesResponse.call.result.structuredContent;
  assert.equal(
    capabilities.summary.schema,
    'evavo.project-art-avatar-sequence-capabilities.v1',
  );
  assert.equal(capabilities.summary.writeEnabled, false);
  assert.equal(capabilities.summary.assignmentMode, 'owner-declared-only');
  assert.equal(capabilities.summary.runtimeActivationAllowed, false);
  assert.equal(capabilities.bytesFlowThroughMcp, false);
  assert.equal(capabilities.credentialsForwardedToSubprocess, false);

  const gated = rpc('evavo_art_compile_avatar_sequence', {
    workspaceRoot: workspace,
    requestPath,
    planPath,
    compiledAt: fixedTime,
  });
  assert.match(gated.call.error.message, /plan writes are disabled/iu);

  const compiledResponse = rpc(
    'evavo_art_compile_avatar_sequence',
    {
      workspaceRoot: workspace,
      requestPath,
      planPath,
      compiledAt: fixedTime,
    },
    { write: true },
  );
  const compiled = compiledResponse.call.result.structuredContent;
  assert.equal(
    compiled.summary.schema,
    'evavo.project-art-avatar-sequence-mastering-plan.v1',
  );
  assert.equal(compiled.summary.frameCount, 4);
  assert.equal(compiled.summary.loopClipCount, 2);
  assert.equal(compiled.summary.semanticInferencePerformed, false);
  assert.equal(compiled.effects.planWrite, true);
  assert.equal(compiled.effects.sourceMutation, false);
  assert.equal(compiled.effects.repositoryMutation, false);
  assert.equal(compiled.effects.gitPush, false);
  assert.equal(compiled.effects.publication, false);
  assert.equal(compiled.command.shell, false);
  assert.equal(compiled.command.credentialsForwarded, false);
  const plan = JSON.parse(await readFile(planPath, 'utf8'));
  assert.equal(plan.runtimeDraft.review, null);
  assert.equal(plan.finalizationRequirements.runtimeActivationAlowed, false);
  assert.equal(plan.workspaceFilePlanRequest.operations.length, 4);

  const replay = rpc(
    'evavo_art_compile_avatar_sequence',
    { workspaceRoot: workspace, requestPath, planPath, compiledAt: fixedTime },
    { write: true },
  );
  assert.match(replay.call.error.message, /create-only and already exists/iu);

  const escaped = rpc(
    'evavo_art_compile_avatar_sequence',
   {
      workspaceRoot: workspace,
      requestPath,
      planPath: path.join(os.tmpdir(), 'escaped-avatar-sequence-plan.json'),
    },
   { write: true },
  );
  assert.match(
    escaped.call.error.message,
    /outside EVAVO_ART_AVATAR_SEQUENCE_ROOTS/u,
  );

  const unknown = rpc(
    'evavo_art_avatar_sequence_capabilities',
    { unexpected: true },
  );
  assert.match(unknown.call.error.message, /unknown argument unexpected/u);

  console.log('Project Art avatar-sequence MCP tests passed.');
  console.log('- the compiler is callable through a bounded path-only MCP surface');
  console.log('- plan writes remain opt-in and create-only');
  console.log('- credentials and image bytes do not flow through MCP');
  console.log('- runtime activation, provider, repository, Git and publication authority remain false');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
