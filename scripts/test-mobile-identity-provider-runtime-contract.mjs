#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('scripts/mobile-identity-provider-runtime.mjs', 'utf8');

assert.match(source, /evavo\.mobile-identity-provider-runtime-batch\.v1/u);
assert.match(source, /evavo\.mobile-identity-provider-runtime-selection\.v1/u);
assert.match(source, /evavo\.mobile-identity-provider-runtime-admission\.v1/u);
assert.match(source, /evavo\.mobile-identity-provider-runtime-authorization\.v1/u);
assert.match(source, /evavo\.mobile-identity-provider-runtime-execution\.v1/u);
assert.match(source, /mobile-identity\.execution-authorized/u);

for (const command of ['prepare', 'select', 'admit', 'authorize', 'execute']) {
  assert.match(source, new RegExp(`command === '${command}'|command must be[^\\n]*${command}`, 'u'));
}

assert.doesNotMatch(source, /\bgameHead\b/u);
assert.doesNotMatch(source, /\bcampaignSha256\b/u);
assert.doesNotMatch(source, /\bcampaignItemId\b/u);
assert.doesNotMatch(source, /\btechnicalAdmissionSha256\b/u);
assert.doesNotMatch(source, /\bstyleBankSha256\b/u);

assert.match(source, /maximumAttempts:\s*1/u);
assert.match(source, /genericProviderWorkerMayClaim:\s*false/u);
assert.match(source, /MAX_AUTH_MS\s*=\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/u);
assert.match(source, /active\(authorization\);/u);
assert.match(source, /context\.job\.id !== authorization\.job\.jobId/u);
assert.match(source, /MOBILE_IDENTITY_EXECUTION_CAPABILITY/u);
assert.match(source, /providerRequestSha256\(validateProviderCandidateRequest\(context\.job\.spec\.payload\)\)/u);

assert.match(source, /descriptor\.labels\.approvalState !== 'unapproved'/u);
assert.match(source, /descriptor\.metadata\.finalDeliverable !== false/u);
assert.match(source, /candidateApproval:\s*false/u);
assert.match(source, /candidatePromotion:\s*false/u);
assert.match(source, /targetRepositoryMutation:\s*false/u);
assert.match(source, /publication:\s*false/u);
assert.match(source, /forcePush:\s*false/u);
assert.doesNotMatch(source, /candidateApproval:\s*true/u);
assert.doesNotMatch(source, /publication:\s*true/u);
assert.doesNotMatch(source, /forcePush:\s*true/u);

console.log('Native mobile identity provider runtime source contract passed.');
