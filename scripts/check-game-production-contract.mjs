#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8');
const json = path => JSON.parse(read(path));

const integration = json('creative-production.integration.json');
const gateSchema = json('schemas/creative-production-gate-receipt-v1.schema.json');
const source = read('scripts/game-production-intake.mjs');
const cli = read('tools/game_production_intake_cli.mjs');

assert.equal(integration.contractVersion, 'evavo_creative_production_integration_v1');
assert.equal(integration.repository, 'EVAVO-STUDIO/evavo-art-studio');
assert.equal(integration.gateReceiptSchema, 'schemas/creative-production-gate-receipt-v1.schema.json');
assert.equal(integration.requirements.reviewedGateReceipts, true);
assert.equal(integration.requirements.bareGateIdsAccepted, false);
assert.equal(integration.requirements.completePredecessorReceiptChain, true);
assert.equal(integration.requirements.operationWhitelist, true);
assert.equal(gateSchema.properties.kind.const, 'creative-production-gate-receipt');

for (const legacy of ['approvedGates', 'completedPacketIds', '--approved-gate']) {
  assert.equal(source.includes(legacy) || cli.includes(legacy), false, `legacy Art production admission API remains: ${legacy}`);
}
for (const required of ['gateReceipts', 'GATE_RECEIPT_REQUIRED', 'PREDECESSOR_CHAIN_INVALID', 'unsupported Art Studio operation']) {
  assert.equal(source.includes(required), true, `missing governed Art intake invariant: ${required}`);
}
for (const operation of ['produce-environment-art', 'produce-game-art', 'produce-environment-key-art', 'produce-game-concept-art', 'produce-game-ui']) {
  assert.equal(source.includes(operation), true, `Art operation whitelist is missing ${operation}`);
}
assert.equal(cli.includes('--gate-receipt'), true, 'Art CLI must accept reviewed gate receipt files');

const test = spawnSync(process.execPath, ['--test', 'scripts/test-game-production-intake.mjs'], {
  cwd: root,
  encoding: 'utf8',
});
if (test.status !== 0) throw new Error(test.stderr || test.stdout || 'Art game production intake tests failed');
console.log('Art Studio creative-production contract, ancestry, operation whitelist and focused tests are valid.');
