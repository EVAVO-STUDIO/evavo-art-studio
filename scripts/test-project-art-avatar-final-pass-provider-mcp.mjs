#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  AVATAR_FINAL_PASS_PROVIDER_REQUEST_SCHEMA,
  createAvatarFinalPassProviderAuthority,
  sha256AvatarFinalPassProviderDocument,
} from './project-art/avatar-final-pass-provider.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tool = path.join(root, 'tools', 'project_art_avatar_final_pass_provider_mcp.mjs');
const hash = (character) => character.repeat(64);
const occurredAt = '2026-08-13T02:00:00.000Z';

function plan() {
  const body = {
    schema: 'evavo.project-art-avatar-final-pass-plan.v1',
    sessionId: 'eva-final-pass-v1',
    characterId: 'eva-female',
    sourceCommit: '1'.repeat(40),
    canvas: { width: 1024, height: 1024 },
    repairJobs: [
      {
        frameId: 'talk-a',
        mode: 'provider-redraw',
        sourcePath: 'frames/talk-a.png',
        sourceSha256: hash('a'),
        targetPath: 'assets/eva-female/reviewed/talk-a.png',
        issues: ['hands'],
      },
    ],
    inbetweenJobs: [],
    sequenceMasteringRequestTemplate: {
      frames: [
        {
          id: 'idle-a',
          sourcePath: 'frames/idle-a.png',
          targetPath: 'assets/eva-female/reviewed/idle-a.png',
          expectedSha256: hash('b'),
          pendingOutput: false,
        },
        {
          id: 'talk-a',
          sourcePath: 'frames/talk-a.png',
          targetPath: 'assets/eva-female/reviewed/talk-a.png',
          expectedSha256: null,
          pendingOutput: true,
        },
      ],
    },
    productionReady: false,
    runtimeActivationAllowed: false,
    authority: {
      semanticAssignment: false,
      providerExecution: false,
      candidateApproval: false,
      repositoryMutation: false,
      gitPush: false,
      runtimeActivation: false,
      forcePush: false,
    },
  };
  return { ...body, planSha256: sha256AvatarFinalPassProviderDocument(body) };
}

function request(planValue) {
  return {
    schema: AVATAR_FINAL_PASS_PROVIDER_REQUEST_SCHEMA,
    requestId: 'eva-provider-run-001',
    planSha256: planValue.planSha256,
    jobs: [
      {
        jobId: 'redraw:talk-a',
        identityFrameId: 'idle-a',
        candidateOutputPath:
          'scratch/avatar-final-pass/eva-final-pass-v1/talk-a/candidate-01.png',
        selection: {
          preferredAdapterId: null,
          preferredModel: null,
          allowedAdapterIds: [],
          allowFallback: false,
          requireSeed: false,
          seed: null,
        },
        authorization: {
          action: 'run-provider-once',
          actorClass: 'human',
          actorId: 'greg-parker',
          occurredAt,
          evidenceSha256: hash('9'),
        },
        artifactBindings: [
          {
            bindingKey: 'canonical-identity',
            sourcePath: 'frames/idle-a.png',
            sourceSha256: hash('b'),
            artifactId: `artifact_${hash('c')}`,
            evidenceSha256: hash('d'),
            actorClass: 'human',
            actorId: 'greg-parker',
            occurredAt,
          },
          {
            bindingKey: 'base-image',
            sourcePath: 'frames/talk-a.png',
            sourceSha256: hash('a'),
            artifactId: `artifact_${hash('e')}`,
            evidenceSha256: hash('f'),
            actorClass: 'human',
            actorId: 'greg-parker',
            occurredAt,
          },
          {
            bindingKey: 'defect-mask',
            sourcePath: 'masks/talk-a-hands.png',
            sourceSha256: hash('0'),
            artifactId: `artifact_${hash('1')}`,
            evidenceSha256: hash('2'),
            actorClass: 'human',
            actorId: 'greg-parker',
            occurredAt,
          },
        ],
        notes: 'Repair only the malformed hand.',
      },
    ],
    authority: { ...createAvatarFinalPassProviderAuthority() },
  };
}

function callServer(workspace, allowWrite, messages) {
  const result = spawnSync(process.execPath, [tool], {
    cwd: root,
    input: `${messages.map((message) => JSON.stringify(message)).join('\n')}\n`,
    encoding: 'utf8',
    env: {
      ...process.env,
      EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_ROOTS: workspace,
      EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_MCP_ALLOW_WRITE: allowWrite
        ? 'true'
        : 'false',
    },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test('MCP exposes provider tools and entirely false execution authority', () => {
  const workspace = mkdtempSync(path.join(os.tmpdir(), 'evavo-avatar-provider-mcp-'));
  try {
    const responses = callServer(workspace, false, [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'evavo_art_avatar_final_pass_provider_capabilities',
          arguments: {},
        },
      },
    ]);
    assert.equal(responses[0].result.serverInfo.version, '1.0.0');
    const names = responses[1].result.tools.map((entry) => entry.name);
    assert.deepEqual(names, [
      'evavo_art_avatar_final_pass_provider_capabilities',
      'evavo_art_compile_avatar_final_pass_provider_batch',
    ]);
    const capabilities = JSON.parse(responses[2].result.content[0].text);
    assert.equal(capabilities.providerExecution, false);
    assert.equal(capabilities.candidateApproval, false);
    assert.equal(capabilities.runtimeActivation, false);
    assert.equal(capabilities.sourceImageBytesFlowThroughMcp, false);
    assert.equal(capabilities.shellExecution, false);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('MCP compile is write-gated and creates one exact provider batch when enabled', () => {
  const workspace = mkdtempSync(path.join(os.tmpdir(), 'evavo-avatar-provider-mcp-'));
  try {
    const planValue = plan();
    const requestValue = request(planValue);
    const planPath = path.join(workspace, 'plan.json');
    const requestPath = path.join(workspace, 'request.json');
    const outputPath = path.join(workspace, 'batch.json');
    writeFileSync(planPath, `${JSON.stringify(planValue, null, 2)}\n`);
    writeFileSync(requestPath, `${JSON.stringify(requestValue, null, 2)}\n`);
    const message = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'evavo_art_compile_avatar_final_pass_provider_batch',
        arguments: {
          planPath,
          requestPath,
          outputPath,
          compiledAt: occurredAt,
        },
      },
    };
    const blocked = callServer(workspace, false, [message]);
    assert.match(blocked[0].error.message, /ALLOW_WRITE must be true/u);
    const passed = callServer(workspace, true, [message]);
    const summary = JSON.parse(passed[0].result.content[0].text);
    assert.equal(summary.status, 'passed');
    assert.equal(summary.ready, 1);
    assert.equal(summary.blocked, 0);
    assert.equal(summary.providerExecution, false);
    assert.equal(summary.candidateApproval, false);
    assert.equal(summary.runtimeActivationAllowed, false);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

console.log('Project Art avatar final-pass provider MCP regressions passed.');
