import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  compileCouncilIdentityAnchorAuthorizationPlan,
  councilIdentityAnchorAuthorizationCapabilities,
} from './project-art/council-identity-anchor-authorization.mjs';

const CAPABILITIES_TOOL =
  'evavo_art_council_identity_anchor_authorization_capabilities';
const PLAN_TOOL = 'evavo_art_council_identity_anchor_authorization_plan';

function transact(
  messages,
  server = 'tools/project_art_council_identity_anchor_authorization_mcp.mjs',
) {
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
      params: { name: CAPABILITIES_TOOL, arguments: {} },
    },
    {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: PLAN_TOOL, arguments: {} },
    },
  ];
}

function assertReadOnlyResponses(responses, expectedServerVersion) {
  assert.equal(responses[0].result.serverInfo.version, expectedServerVersion);
  const toolNames = responses[1].result.tools.map((tool) => tool.name);
  assert.ok(toolNames.includes(CAPABILITIES_TOOL));
  assert.ok(toolNames.includes(PLAN_TOOL));

  const capabilities = JSON.parse(responses[2].result.content[0].text);
  const plan = JSON.parse(responses[3].result.content[0].text);
  const expectedCapabilities = councilIdentityAnchorAuthorizationCapabilities();
  const expectedPlan = compileCouncilIdentityAnchorAuthorizationPlan();

  assert.equal(capabilities.version, '4.6.0');
  assert.equal(
    capabilities.sourceAdmissionPlanSha256,
    expectedCapabilities.sourceAdmissionPlanSha256,
  );
  assert.equal(capabilities.providerAuthorizationCount, 8);
  assert.equal(capabilities.maximumProviderCallsTotal, 8);
  assert.equal(capabilities.providerAuthorizationCompilationAvailable, true);
  assert.equal(capabilities.runtimeAdapterCompilationAvailable, false);
  assert.equal(capabilities.durableConsumptionLedgerEstablished, false);
  assert.equal(capabilities.providerExecutionAvailable, false);
  assert.equal(capabilities.identityApprovalAvailable, false);
  assert.equal(capabilities.runtimeActivationAvailable, false);
  assert.equal(capabilities.websiteActivationAvailable, false);

  assert.equal(plan.planSha256, expectedPlan.planSha256);
  assert.equal(plan.counts.providerAdmissionsRequired, 8);
  assert.equal(plan.counts.providerAuthorizationsCompiled, 0);
  assert.equal(plan.counts.runtimeAdaptersCompiled, 0);
  assert.equal(plan.counts.providerExecutionsPerformed, 0);
  assert.equal(plan.authorizationPolicy.separateAuthorizationPerAdmission, true);
  assert.equal(plan.authorizationPolicy.oneShotPerAuthorization, true);
  assert.equal(plan.authorizationPolicy.maximumProviderCallsTotal, 8);
  assert.equal(
    plan.authorizationPolicy.durableConsumptionLedgerRequiredBeforeExecution,
    true,
  );
  assert.ok(Object.values(plan.authority).every((value) => value === false));
}

test('dedicated MCP exposes only the two read-only V4.6 tools', () => {
  const responses = transact(readOnlyMessages());
  assert.deepEqual(
    responses[1].result.tools.map((tool) => tool.name),
    [CAPABILITIES_TOOL, PLAN_TOOL],
  );
  assertReadOnlyResponses(responses, '1.0.0');
});

test('unified Council MCP exposes V4.6 parity without changing its server version', () => {
  const responses = transact(
    readOnlyMessages(),
    'tools/project_art_council_avatar_production_mcp.mjs',
  );
  assertReadOnlyResponses(responses, '1.1.0');
});

test('dedicated MCP rejects mutation, review and execution-shaped tools', () => {
  for (const name of [
    'evavo_art_council_identity_anchor_authorization_review',
    'evavo_art_council_identity_anchor_authorization_compile',
    'evavo_art_council_identity_anchor_provider_execute',
  ]) {
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
        params: { name, arguments: {} },
      },
    ]);
    assert.match(responses[1].error.message, /Unknown tool/u);
  }
});
