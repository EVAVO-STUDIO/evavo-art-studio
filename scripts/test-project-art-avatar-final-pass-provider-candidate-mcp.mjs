#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CAPABILITIES_TOOL,
  MATERIALIZE_TOOL,
  createCandidateMcpServer,
} from '../tools/project_art_avatar_final_pass_provider_candidate_mcp.mjs';

function roots() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'evavo-avatar-mcp-'));
  const records = path.join(root, 'records');
  const artifacts = path.join(root, 'artifacts');
  const workspace = path.join(records, 'workspace');
  const outside = path.join(root, 'outside');
  for (const entry of [records, artifacts, workspace, outside]) {
    mkdirSync(entry, { recursive: true });
  }
  const files = {};
  for (const name of ['dispatch', 'binding', 'outcome']) {
    files[name] = path.join(records, `${name}.json`);
    writeFileSync(files[name], '{}\n');
  }
  const outsideFile = path.join(outside, 'outside.json');
  writeFileSync(outsideFile, '{}\n');
  return { root, records, artifacts, workspace, outsideFile, files };
}

test('MCP exposes bounded candidate capabilities with no byte payload', async () => {
  const fixture = roots();
  try {
    const server = createCandidateMcpServer({
      recordRoots: [fixture.records],
      artifactRoots: [fixture.artifacts],
      writeAllowed: false,
    });
    const definitions = server.toolDefinitions();
    assert.deepEqual(
      definitions.map((entry) => entry.name),
      [CAPABILITIES_TOOL, MATERIALIZE_TOOL],
    );
    const serialized = JSON.stringify(definitions);
    assert.equal(serialized.includes('imageBytes'), false);
    assert.equal(serialized.includes('base64'), false);
    assert.equal(serialized.includes('contentBytes'), false);

    const response = await server.handleToolCall({
      name: CAPABILITIES_TOOL,
      arguments: {},
    });
    const value = JSON.parse(response.content[0].text);
    assert.equal(value.imageBytesFlowThroughMcp, false);
    assert.equal(value.candidateMaterialization, false);
    assert.equal(value.candidateApproval, false);
    assert.equal(value.runtimeActivation, false);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('MCP materialization remains write-gated', async () => {
  const fixture = roots();
  try {
    const server = createCandidateMcpServer({
      recordRoots: [fixture.records],
      artifactRoots: [fixture.artifacts],
      writeAllowed: false,
    });
    await assert.rejects(
      server.handleToolCall({
        name: MATERIALIZE_TOOL,
        arguments: {},
      }),
      /MCP_ALLOW_WRITE must be true/u,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('write-enabled MCP resolves exact roots and delegates one materialization', async () => {
  const fixture = roots();
  try {
    const calls = [];
    const server = createCandidateMcpServer({
      recordRoots: [fixture.records],
      artifactRoots: [fixture.artifacts],
      writeAllowed: true,
      materialize: async (input) => {
        calls.push(input);
        return {
          status: 'candidate-materialized-awaiting-frame-finisher',
          reused: false,
          materializationId: 'avatar-candidate-materialization:fixture',
          candidatePath: path.join(fixture.workspace, 'candidate-01.png'),
          receiptPath: path.join(
            fixture.workspace,
            'candidate-01.materialization.json',
          ),
          finisherRequestPath: path.join(
            fixture.workspace,
            'candidate-01.finisher-request.json',
          ),
        };
      },
    });
    const authorization = {
      action: 'materialize-unapproved-provider-candidate',
      actorClass: 'agent',
      actorId: 'mcp-test-agent',
      occurredAt: '2026-08-13T00:00:00.000Z',
      evidenceSha256: 'a'.repeat(64),
    };
    const response = await server.handleToolCall({
      name: MATERIALIZE_TOOL,
      arguments: {
        dispatchPath: fixture.files.dispatch,
        bindingPath: fixture.files.binding,
        outcomePath: fixture.files.outcome,
        artifactRoot: fixture.artifacts,
        workspaceRoot: fixture.workspace,
        authorization,
        materializedAt: '2026-08-13T00:01:00.000Z',
      },
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].artifactRoot, fixture.artifacts);
    assert.equal(calls[0].workspaceRoot, fixture.workspace);
    assert.deepEqual(calls[0].authorization, authorization);
    const value = JSON.parse(response.content[0].text);
    assert.equal(
      value.status,
      'candidate-materialized-awaiting-frame-finisher',
    );
    assert.equal(value.imageBytesFlowThroughMcp, false);
    assert.equal(value.candidateApproval, false);
    assert.equal(value.candidatePromotion, false);
    assert.equal(value.runtimeActivation, false);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('record and artifact root escape attempts are rejected', async () => {
  const fixture = roots();
  try {
    const server = createCandidateMcpServer({
      recordRoots: [fixture.records],
      artifactRoots: [fixture.artifacts],
      writeAllowed: true,
      materialize: async () => {
        throw new Error('must not be called');
      },
    });
    const authorization = {
      action: 'materialize-unapproved-provider-candidate',
      actorClass: 'human',
      actorId: 'operator',
      occurredAt: '2026-08-13T00:00:00.000Z',
      evidenceSha256: 'b'.repeat(64),
    };
    await assert.rejects(
      server.handleToolCall({
        name: MATERIALIZE_TOOL,
        arguments: {
          dispatchPath: fixture.outsideFile,
          bindingPath: fixture.files.binding,
          outcomePath: fixture.files.outcome,
          artifactRoot: fixture.artifacts,
          workspaceRoot: fixture.workspace,
          authorization,
        },
      }),
      /outside the configured record roots/u,
    );
    await assert.rejects(
      server.handleToolCall({
        name: MATERIALIZE_TOOL,
        arguments: {
          dispatchPath: fixture.files.dispatch,
          bindingPath: fixture.files.binding,
          outcomePath: fixture.files.outcome,
          artifactRoot: fixture.records,
          workspaceRoot: fixture.workspace,
          authorization,
        },
      }),
      /outside its configured roots/u,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

console.log('Project Art avatar provider candidate MCP regressions passed.');
