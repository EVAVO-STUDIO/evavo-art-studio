import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  compileCouncilIdentityAnchorAdmissionPlan,
  councilIdentityAnchorAdmissionCapabilities,
  createCouncilIdentityAnchorAdmissionReviewTemplate,
} from './project-art/council-identity-anchor-admission.mjs';

function transact(messages, server = 'tools/project_art_council_identity_anchor_admission_mcp.mjs') {
  const result = spawnSync(process.execPath, [server], {
    input: `${messages.map((message) => JSON.stringify(message)).join('\n')}\n`,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
}

function readOnlyMessages() {
  return [
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' },
    },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'evavo_art_council_identity_anchor_admission_capabilities',
        arguments: {},
      },
    },
    {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'evavo_art_council_identity_anchor_admission_plan',
        arguments: {},
      },
    },
    {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'evavo_art_council_identity_anchor_admission_review_template',
        arguments: {},
      },
    },
  ];
}

function assertReadOnlyResponses(responses, expectedServerVersion) {
  assert.equal(responses[0].result.serverInfo.version, expectedServerVersion);
  const toolNames = responses[1].result.tools.map((tool) => tool.name);
  for (const name of [
    'evavo_art_council_identity_anchor_admission_capabilities',
    'evavo_art_council_identity_anchor_admission_plan',
    'evavo_art_council_identity_anchor_admission_review_template',
  ]) {
    assert.ok(toolNames.includes(name), name);
  }
  const capabilities = JSON.parse(responses[2].result.content[0].text);
  const plan = JSON.parse(responses[3].result.content[0].text);
  const template = JSON.parse(responses[4].result.content[0].text);
  assert.equal(
    capabilities.campaignSha256,
    councilIdentityAnchorAdmissionCapabilities().campaignSha256,
  );
  assert.equal(plan.planSha256, compileCouncilIdentityAnchorAdmissionPlan().planSha256);
  assert.equal(
    template.templateSha256,
    createCouncilIdentityAnchorAdmissionReviewTemplate().templateSha256,
  );
  assert.equal(capabilities.providerExecutionAvailable, false);
  assert.equal(plan.counts.providerAdmissionsCompiled, 0);
  assert.equal(template.constraints.providerAuthorizationGranted, false);
}

test('dedicated MCP exposes only read-only V4.5 capability, plan and review-template tools', () => {
  const responses = transact(readOnlyMessages());
  assert.deepEqual(
    responses[1].result.tools.map((tool) => tool.name),
    [
      'evavo_art_council_identity_anchor_admission_capabilities',
      'evavo_art_council_identity_anchor_admission_plan',
      'evavo_art_council_identity_anchor_admission_review_template',
    ],
  );
  assertReadOnlyResponses(responses, '1.0.0');
});

test('unified Council MCP exposes the same V4.5 read-only contracts without changing its version', () => {
  const responses = transact(
    readOnlyMessages(),
    'tools/project_art_council_avatar_production_mcp.mjs',
  );
  assertReadOnlyResponses(responses, '1.1.0');
});

test('dedicated MCP rejects unknown or state-changing tools', () => {
  const responses = transact([
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' },
    },
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'evavo_art_council_identity_anchor_provider_execute',
        arguments: {},
      },
    },
  ]);
  assert.match(responses[1].error.message, /Unknown tool/u);
});
