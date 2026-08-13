#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  candidateRunOutcome,
  compiledRuntimeContract,
  fixtureTime,
  providerBatch,
} from './project-art/avatar-final-pass-provider-runtime-fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tool = path.join(
  root,
  'tools',
  'project_art_avatar_final_pass_provider_runtime_mcp.mjs',
);

function callServer(workspace, allowWrite, messages) {
  const result = spawnSync(process.execPath, [tool], {
    cwd: root,
    input: `${messages.map((message) => JSON.stringify(message)).join('\n')}\n`,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    env: {
      ...process.env,
      EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_RUNTIME_ROOTS: workspace,
      EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_RUNTIME_MCP_ALLOW_WRITE:
        allowWrite ? 'true' : 'false',
    },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function toolCall(id, name, args) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: args },
  };
}

test('MCP exposes four bounded runtime tools with entirely separate authority', () => {
  const workspace = mkdtempSync(
    path.join(os.tmpdir(), 'evavo-avatar-runtime-mcp-'),
  );
  try {
    const responses = callServer(workspace, false, [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      toolCall(
        3,
        'evavo_art_avatar_final_pass_provider_runtime_capabilities',
        {},
      ),
    ]);
    assert.equal(responses[0].result.serverInfo.version, '1.0.0');
    assert.deepEqual(
      responses[1].result.tools.map((entry) => entry.name),
      [
        'evavo_art_avatar_final_pass_provider_runtime_capabilities',
        'evavo_art_compile_avatar_final_pass_provider_runtime_dispatch',
        'evavo_art_bind_avatar_final_pass_provider_runtime_contract',
        'evavo_art_compile_avatar_final_pass_provider_runtime_outcome',
      ],
    );
    const capabilities = JSON.parse(responses[2].result.content[0].text);
    assert.equal(capabilities.sourceImageBytesFlowThroughMcp, false);
    assert.equal(capabilities.shellExecution, false);
    assert.equal(capabilities.runtimeEnqueue, false);
    assert.equal(capabilities.providerExecution, false);
    assert.equal(capabilities.candidateMaterialization, false);
    assert.equal(capabilities.candidateApproval, false);
    assert.equal(capabilities.runtimeActivation, false);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('MCP is write-gated and compiles dispatch, binding and outcome records create-only', () => {
  const workspace = mkdtempSync(
    path.join(os.tmpdir(), 'evavo-avatar-runtime-mcp-'),
  );
  try {
    const batchPath = path.join(workspace, 'batch.json');
    const dispatchPath = path.join(workspace, 'dispatch.json');
    const compiledPath = path.join(workspace, 'compiled.json');
    const bindingPath = path.join(workspace, 'binding.json');
    const runtimeOutcomePath = path.join(workspace, 'runtime-outcome.json');
    const normalizedOutcomePath = path.join(workspace, 'normalized-outcome.json');
    writeFileSync(batchPath, `${JSON.stringify(providerBatch(), null, 2)}\n`);

    const dispatchMessage = toolCall(
      1,
      'evavo_art_compile_avatar_final_pass_provider_runtime_dispatch',
      {
        batchPath,
        jobId: 'redraw:talk-a',
        outputPath: dispatchPath,
        compiledAt: fixtureTime,
      },
    );
    const blocked = callServer(workspace, false, [dispatchMessage]);
    assert.match(blocked[0].error.message, /ALLOW_WRITE must be true/u);

    const dispatched = callServer(workspace, true, [dispatchMessage]);
    const dispatchSummary = JSON.parse(dispatched[0].result.content[0].text);
    assert.equal(dispatchSummary.status, 'passed');
    assert.equal(dispatchSummary.operation, 'edit');
    assert.equal(dispatchSummary.runtimeEnqueue, false);
    assert.equal(dispatchSummary.providerExecution, false);

    const dispatch = JSON.parse(readFileSync(dispatchPath, 'utf8'));
    writeFileSync(
      compiledPath,
      `${JSON.stringify(compiledRuntimeContract(dispatch), null, 2)}\n`,
    );
    const bound = callServer(workspace, true, [
      toolCall(
        2,
        'evavo_art_bind_avatar_final_pass_provider_runtime_contract',
        {
          dispatchPath,
          compiledRuntimeContractPath: compiledPath,
          outputPath: bindingPath,
        },
      ),
    ]);
    const bindingSummary = JSON.parse(bound[0].result.content[0].text);
    assert.equal(bindingSummary.status, 'passed');
    assert.equal(bindingSummary.runtimeEnqueue, false);
    assert.equal(bindingSummary.providerExecution, false);

    const binding = JSON.parse(readFileSync(bindingPath, 'utf8'));
    writeFileSync(
      runtimeOutcomePath,
      `${JSON.stringify(candidateRunOutcome(dispatch, binding), null, 2)}\n`,
    );
    const normalized = callServer(workspace, true, [
      toolCall(
        3,
        'evavo_art_compile_avatar_final_pass_provider_runtime_outcome',
        {
          dispatchPath,
          bindingPath,
          runtimeOutcomePath,
          outputPath: normalizedOutcomePath,
        },
      ),
    ]);
    const outcomeSummary = JSON.parse(normalized[0].result.content[0].text);
    assert.equal(outcomeSummary.status, 'passed');
    assert.equal(
      outcomeSummary.resultStatus,
      'candidate-materialization-required',
    );
    assert.equal(outcomeSummary.candidateMaterialization, false);
    assert.equal(outcomeSummary.candidateApproval, false);
    assert.equal(outcomeSummary.runtimeActivation, false);

    const replay = callServer(workspace, true, [dispatchMessage]);
    assert.match(replay[0].error.message, /EEXIST/u);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

console.log('Project Art avatar final-pass provider runtime MCP regressions passed.');
