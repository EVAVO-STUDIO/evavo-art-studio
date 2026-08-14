#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CAPABILITIES_TOOL,
  SEAL_TOOL,
  handleToolCall,
  toolDefinitions,
} from '../tools/project_art_avatar_sequence_release_mcp.mjs';

function parseResult(result) {
  assert.equal(result.isError, false);
  assert.equal(Array.isArray(result.content), true);
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, 'text');
  return JSON.parse(result.content[0].text);
}

test('MCP exposes bounded capabilities without transporting image bytes', () => {
  assert.deepEqual(toolDefinitions().map((entry) => entry.name), [
    CAPABILITIES_TOOL,
    SEAL_TOOL,
  ]);
  const capabilities = parseResult(handleToolCall({
    name: CAPABILITIES_TOOL,
    arguments: {},
  }, {}));
  assert.equal(capabilities.imageBytesThroughMcp, false);
  assert.equal(capabilities.arbitraryShell, false);
  assert.equal(capabilities.sequenceReleaseSealing, false);
  assert.equal(capabilities.runtimeActivation, false);
  assert.equal(capabilities.repositoryMutation, false);
  assert.equal(capabilities.gitPublication, false);
  assert.equal(capabilities.forcePush, false);
});

test('MCP seal remains disabled until the dedicated write gate is true', () => {
  assert.throws(
    () => handleToolCall({
      name: SEAL_TOOL,
      arguments: {
        workspaceRoot: '/not-used',
        requestPath: '/not-used/request.json',
      },
    }, {
      EVAVO_ART_AVATAR_SEQUENCE_RELEASE_MCP_ALLOW_WRITE: 'false',
    }),
    /MCP_ALLOW_WRITE must be true/u,
  );
});

test('MCP rejects workspace and request path escapes', () => {
  const allowed = mkdtempSync(path.join(os.tmpdir(), 'evavo-sequence-release-mcp-allowed-'));
  const outside = mkdtempSync(path.join(os.tmpdir(), 'evavo-sequence-release-mcp-outside-'));
  const outsideRequest = path.join(outside, 'request.json');
  writeFileSync(outsideRequest, '{}\n', { mode: 0o600 });
  const environment = {
    EVAVO_ART_AVATAR_SEQUENCE_RELEASE_ROOTS: allowed,
    EVAVO_ART_AVATAR_SEQUENCE_RELEASE_MCP_ALLOW_WRITE: 'true',
  };
  assert.throws(
    () => handleToolCall({
      name: SEAL_TOOL,
      arguments: { workspaceRoot: outside, requestPath: outsideRequest },
    }, environment),
    /workspaceRoot is outside/u,
  );
  mkdirSync(path.join(allowed, 'requests'), { recursive: true, mode: 0o700 });
  assert.throws(
    () => handleToolCall({
      name: SEAL_TOOL,
      arguments: { workspaceRoot: allowed, requestPath: outsideRequest },
    }, environment),
    /requestPath is outside/u,
  );
});

test('MCP rejects unknown tools and never gains hidden execution authority', () => {
  assert.throws(
    () => handleToolCall({ name: 'evavo_art_unknown', arguments: {} }, {}),
    /Unknown tool/u,
  );
});
