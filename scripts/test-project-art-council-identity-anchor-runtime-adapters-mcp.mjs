import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  compileCouncilIdentityAnchorRuntimeAdapterPlan,
  councilIdentityAnchorRuntimeAdapterCapabilities,
} from './project-art/council-identity-anchor-runtime-adapters.mjs';

const CAPABILITIES_TOOL =
  'evavo_art_council_identity_anchor_runtime_adapter_capabilities';
const PLAN_TOOL =
  'evavo_art_council_identity_anchor_runtime_adapter_plan';

function transact(
  messages,
  server = 'tools/project_art_council_identity_anchor_runtime_adapters_mcp.mjs',
) {
  const result = spawnSync(process.execPath, [server], {
    input: `${messages.map((message) => JSON.stringify(message)).join('\n')}\n`,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
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
  const expectedCapabilities = councilIdentityAnchorRuntimeAdapterCapabilities();
  const expectedPlan = compileCouncilIdentityAnchorRuntimeAdapterPlan();

  assert.equal(capabilities.version, '4.7.0');
  assert.equal(
    capabilities.sourceAuthorizationPlanSha256,
    expectedCapabilities.sourceAuthorizationPlanSha256,
  );
  assert.equal(capabilities.providerAuthorizationCountRequired, 8);
  assert.equal(capabilities.runtimeAdapterCount, 8);
  assert.equal(capabilities.runtimeAdapterCompilationAvailable, true);
  assert.equal(capabilities.separateAdapterFilePackagingAvailable, false);
  assert.equal(capabilities.durableRuntimeReservationEstablished, false);
  assert.equal(capabilities.providerExecutionAvailable, false);
  assert.equal(capabilities.identityApprovalAvailable, false);
  assert.equal(capabilities.runtimeActivationAvailable, false);
  assert.equal(capabilities.websiteActivationAvailable, false);

  assert.equal(plan.planSha256, expectedPlan.planSha256);
  assert.equal(plan.counts.providerAuthorizationsRequired, 8);
  assert.equal(plan.counts.runtimeAdaptersCompiled, 0);
  assert.equal(plan.counts.providerExecutionsPerformed, 0);
  assert.equal(plan.adapterPolicy.separateAdapterPerAuthorization, true);
  assert.equal(plan.adapterPolicy.authorizationMustBeActiveAtCompileTime, true);
  assert.equal(
    plan.adapterPolicy.authorizationMustBeRevalidatedAtExecutionTime,
    true,
  );
  assert.equal(plan.adapterPolicy.adapterCompilationPerformsProviderExecution, false);
  assert.equal(plan.adapterPolicy.adapterCompilationConsumesAuthorization, false);
  assert.ok(Object.values(plan.authority).every((value) => value === false));
}

test('dedicated MCP exposes only the two read-only V4.7 tools', () => {
  const responses = transact(readOnlyMessages());
  assert.deepEqual(
    responses[1].result.tools.map((tool) => tool.name),
    [CAPABILITIES_TOOL, PLAN_TOOL],
  );
  assertReadOnlyResponses(responses, '1.0.0');
});

test('unified Council MCP exposes V4.7 parity without changing its server version', () => {
  const responses = transact(
    readOnlyMessages(),
    'tools/project_art_council_avatar_production_mcp.mjs',
  );
  assertReadOnlyResponses(responses, '1.1.0');
});

test('MCP surfaces reject compilation, packaging and execution-shaped tools', () => {
  for (const name of [
    'evavo_art_council_identity_anchor_runtime_adapter_compile',
    'evavo_art_council_identity_anchor_runtime_adapter_package',
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
