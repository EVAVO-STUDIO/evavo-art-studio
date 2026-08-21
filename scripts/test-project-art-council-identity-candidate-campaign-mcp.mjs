import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import test from 'node:test';

function callMcp() {
  const messages = [
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
        name: 'evavo_art_council_identity_candidate_campaign_capabilities',
        arguments: {},
      },
    },
    {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'evavo_art_council_identity_candidate_campaign',
        arguments: {},
      },
    },
  ];
  const result = spawnSync(
    process.execPath,
    ['tools/project_art_council_avatar_production_mcp.mjs'],
    {
      input: `${messages.map((message) => JSON.stringify(message)).join('\n')}\n`,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
}

test('Council MCP exposes the V4.4 candidate campaign without changing its stable server version', () => {
  const responses = callMcp();
  assert.equal(responses[0].result.serverInfo.version, '1.1.0');
  const tools = responses[1].result.tools;
  assert.ok(
    tools.some(
      (tool) =>
        tool.name ===
        'evavo_art_council_identity_candidate_campaign_capabilities',
    ),
  );
  assert.ok(
    tools.some(
      (tool) =>
        tool.name === 'evavo_art_council_identity_candidate_campaign',
    ),
  );
  const capabilities = JSON.parse(responses[2].result.content[0].text);
  assert.equal(capabilities.version, '4.4.0');
  assert.equal(capabilities.anchorJobCount, 8);
  assert.equal(capabilities.dependentJobCount, 16);
  assert.equal(capabilities.totalJobCount, 24);
  assert.equal(capabilities.exactAdapterId, 'openai-gpt-image');
  assert.equal(capabilities.exactModel, 'gpt-image-1');
  assert.equal(capabilities.providerExecution, false);
  assert.equal(capabilities.identityApproval, false);

  const campaign = JSON.parse(responses[3].result.content[0].text);
  assert.equal(campaign.version, '4.4.0');
  assert.equal(campaign.jobs.length, 24);
  assert.equal(campaign.counts.anchorJobs, 8);
  assert.equal(campaign.counts.dependentJobs, 16);
  assert.ok(
    campaign.jobs.slice(0, 8).every((job) => job.viewId === 'full-body-right'),
  );
  assert.ok(
    campaign.jobs
      .slice(8)
      .every(
        (job) =>
          job.dependency?.requiresSuccessfulExecutionReceipt === true &&
          job.dependency?.crossSetReuseAllowed === false &&
          job.dependency?.crossCharacterReuseAllowed === false,
      ),
  );
  assert.ok(Object.values(campaign.authority).every((value) => value === false));
});
