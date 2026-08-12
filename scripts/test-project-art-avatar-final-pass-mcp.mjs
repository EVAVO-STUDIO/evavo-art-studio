#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

const serverPath = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../tools/project_art_avatar_final_pass_mcp.mjs',
);

function session(root, writeAllowed = false) {
  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      EVAVO_ART_AVATAR_FINAL_PASS_ROOTS: root,
      EVAVO_ART_AVATAR_FINAL_PASS_MCP_ALLOW_WRITE: writeAllowed ? 'true' : 'false',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    errors += chunk;
  });
  return {
    child,
    send(message) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    },
    async waitFor(count) {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const lines = output.trim().split('\n').filter(Boolean);
        if (lines.length >= count) return lines.map((line) => JSON.parse(line));
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(`Timed out waiting for MCP output. stderr=${errors}`);
    },
    close() {
      child.stdin.end();
      child.kill();
    },
  };
}

test('MCP exposes bounded final-pass tools and false authority', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'evavo-avatar-final-pass-mcp-'));
  const active = session(root);
  try {
    active.send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' },
    });
    active.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    active.send({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'evavo_art_avatar_final_pass_capabilities',
        arguments: {},
      },
    });
    const responses = await active.waitFor(3);
    assert.equal(responses[0].result.serverInfo.name, 'evavo-project-art-avatar-final-pass');
    assert.deepEqual(
      responses[1].result.tools.map((tool) => tool.name),
      [
        'evavo_art_avatar_final_pass_capabilities',
        'evavo_art_compile_avatar_final_pass',
      ],
    );
    const capability = JSON.parse(responses[2].result.content[0].text);
    assert.equal(capability.sourceImageBytesFlowThroughMcp, false);
    assert.equal(capability.providerExecution, false);
    assert.equal(capability.repositoryMutation, false);
    assert.equal(capability.forcePush, false);
  } finally {
    active.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('MCP compile operation is disabled without the explicit write gate', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'evavo-avatar-final-pass-mcp-'));
  const active = session(root, false);
  try {
    active.send({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'evavo_art_compile_avatar_final_pass',
        arguments: {
          workspaceRoot: root,
          requestPath: path.join(root, 'request.json'),
          outputPath: path.join(root, 'plan.json'),
        },
      },
    });
    const [response] = await active.waitFor(1);
    assert.match(response.error.message, /MCP_ALLOW_WRITE must be true/u);
  } finally {
    active.close();
    rmSync(root, { recursive: true, force: true });
  }
});

console.log('Project Art avatar final-pass MCP regressions passed.');
