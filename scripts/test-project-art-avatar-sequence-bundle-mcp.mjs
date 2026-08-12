#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createAvatarSequenceBundleFixture } from './project-art/avatar-sequence-bundle-fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = path.join(root, 'tools', 'project_art_avatar_sequence_bundle_mcp.mjs');
const FIXED_TIME = '2026-08-12T00:00:00.000Z';

function rpc(toolName, argumentsValue, fixture, { write = false } = {}) {
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
      GITHUB_TOKEN: 'must-not-reach-subprocess',
      EVAVO_ART_AVATAR_SEQUENCE_BUNDLE_ROOTS: fixture.root,
      EVAVO_ART_AVATAR_SEQUENCE_BUNDLE_MCP_ALLOW_WRITE: write ? 'true' : 'false',
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

const fixture = await createAvatarSequenceBundleFixture();
try {
  const capabilitiesResponse = rpc(
    'evavo_art_avatar_sequence_bundle_capabilities',
    {},
    fixture,
  );
  assert.equal(
    capabilitiesResponse.initialize.result.serverInfo.name,
    'evavo-project-art-avatar-sequence-bundle',
  );
  assert.deepEqual(
    capabilitiesResponse.list.result.tools.map((tool) => tool.name),
    [
      'evavo_art_avatar_sequence_bundle_capabilities',
      'evavo_art_write_avatar_sequence_bundle',
    ],
  );
  const capabilities = capabilitiesResponse.call.result.structuredContent;
  assert.equal(
    capabilities.summary.schema,
    'evavo.project-art-avatar-sequence-bundle-capabilities.v1',
  );
  assert.equal(capabilities.summary.writeEnabled, false);
  assert.equal(capabilities.summary.wholeRunAtomicPublication, true);
  assert.equal(capabilities.summary.runtimeActivationAllowed, false);
  assert.equal(capabilities.bytesFlowThroughMcp, false);
  assert.equal(capabilities.credentialsForwardedToSubprocess, false);

  const outputRoot = path.join(fixture.workspace, 'bundles', 'mcp-eva-v1');
  const input = {
    workspaceRoot: fixture.workspace,
    planPath: fixture.planPath,
    outputRoot,
    createdAt: FIXED_TIME,
  };
  const gated = rpc(
    'evavo_art_write_avatar_sequence_bundle',
    input,
    fixture,
  );
  assert.match(gated.call.error.message, /bundle writes are disabled/iu);

  const written = rpc(
    'evavo_art_write_avatar_sequence_bundle',
    input,
    fixture,
    { write: true },
  );
  const result = written.call.result.structuredContent;
  assert.equal(result.summary.status, 'passed');
  assert.equal(result.summary.frameCount, 4);
  assert.equal(result.summary.loopClosureRequestCount, 2);
  assert.equal(result.summary.sourcePlanRevalidatedBeforePublication, true);
  assert.equal(result.summary.wholeRunAtomicPublication, true);
  assert.equal(result.effects.bundleWrite, true);
  assert.equal(result.effects.targetImageWrite, false);
  assert.equal(result.effects.repositoryMutation, false);
  assert.equal(result.effects.gitPush, false);
  assert.equal(result.effects.publication, false);
  assert.equal(result.effects.runtimeActivation, false);
  assert.equal(result.bytesFlowThroughMcp, false);
  assert.equal(result.command.shell, false);
  assert.equal(result.command.credentialsForwarded, false);
  const receipt = JSON.parse(
    await readFile(path.join(outputRoot, 'receipt.json'), 'utf8'),
  );
  assert.equal(receipt.sourcePlanRevalidatedBeforePublication, true);
  assert.equal(receipt.wholeRunAtomicPublication, true);

  const replay = rpc(
    'evavo_art_write_avatar_sequence_bundle',
    input,
    fixture,
    { write: true },
  );
  assert.match(replay.call.error.message, /create-only and already exists/iu);

  const escaped = rpc(
    'evavo_art_write_avatar_sequence_bundle',
    {
      ...input,
      outputRoot: path.join(os.tmpdir(), 'escaped-avatar-sequence-bundle'),
    },
    fixture,
    { write: true },
  );
  assert.match(
    escaped.call.error.message,
    /outside EVAVO_ART_AVATAR_SEQUENCE_BUNDLE_ROOTS/u,
  );

  const unknown = rpc(
    'evavo_art_avatar_sequence_bundle_capabilities',
    { unexpected: true },
    fixture,
  );
  assert.match(unknown.call.error.message, /unknown argument unexpected/u);

  console.log('Project Art avatar-sequence bundle MCP tests passed.');
  console.log('- exact mastering plans can be materialized through a bounded MCP surface');
  console.log('- bundle writes remain opt-in, create-only, and whole-run atomic');
  console.log('- credentials and image bytes do not flow through MCP');
  console.log('- runtime activation, provider, repository, Git and publication authority remain false');
} finally {
  await rm(fixture.root, { recursive: true, force: true });
}
