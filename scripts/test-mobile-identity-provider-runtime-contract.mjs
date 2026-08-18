#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const engine = readFileSync('scripts/mobile-identity-provider-runtime.mjs', 'utf8');
const entry = readFileSync('scripts/mobile-identity-provider-runtime-entry.mjs', 'utf8');

assert.match(engine, /evavo\.mobile-identity-provider-runtime-batch\.v1/u);
assert.match(engine, /evavo\.mobile-identity-provider-runtime-selection\.v1/u);
assert.match(engine, /evavo\.mobile-identity-provider-runtime-admission\.v1/u);
assert.match(engine, /evavo\.mobile-identity-provider-runtime-authorization\.v1/u);
assert.match(engine, /evavo\.mobile-identity-provider-runtime-execution\.v1/u);
assert.match(engine, /mobile-identity\.execution-authorized/u);

for (const command of ['prepare', 'select', 'admit', 'authorize', 'execute']) {
  assert.match(engine, new RegExp(`command === '${command}'|command must be[^\\n]*${command}`, 'u'));
  assert.match(entry, new RegExp(`${command}: Object\\.freeze`, 'u'));
}

assert.doesNotMatch(engine, /\bgameHead\b/u);
assert.doesNotMatch(engine, /\bcampaignSha256\b/u);
assert.doesNotMatch(engine, /\bcampaignItemId\b/u);
assert.doesNotMatch(engine, /\btechnicalAdmissionSha256\b/u);
assert.doesNotMatch(engine, /\bstyleBankSha256\b/u);

assert.match(engine, /maximumAttempts:\s*1/u);
assert.match(engine, /genericProviderWorkerMayClaim:\s*false/u);
assert.match(engine, /MAX_AUTH_MS\s*=\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/u);
assert.match(engine, /active\(authorization\);/u);
assert.match(engine, /context\.job\.id !== authorization\.job\.jobId/u);
assert.match(engine, /MOBILE_IDENTITY_EXECUTION_CAPABILITY/u);
assert.match(engine, /providerRequestSha256\(validateProviderCandidateRequest\(context\.job\.spec\.payload\)\)/u);

assert.match(engine, /descriptor\.labels\.approvalState !== 'unapproved'/u);
assert.match(engine, /descriptor\.metadata\.finalDeliverable !== false/u);
assert.match(engine, /candidateApproval:\s*false/u);
assert.match(engine, /candidatePromotion:\s*false/u);
assert.match(engine, /targetRepositoryMutation:\s*false/u);
assert.match(engine, /publication:\s*false/u);
assert.match(engine, /forcePush:\s*false/u);
assert.doesNotMatch(engine, /candidateApproval:\s*true/u);
assert.doesNotMatch(engine, /publication:\s*true/u);
assert.doesNotMatch(engine, /forcePush:\s*true/u);

assert.match(entry, /const ENGINE = 'scripts\/mobile-identity-provider-runtime\.mjs'/u);
assert.match(entry, /must provide exactly its reviewed option set/u);
assert.match(entry, /providerRequestSha256 mismatch/u);
assert.match(entry, /authorization requests an adapter outside the provider request allowlist/u);
assert.match(entry, /safeRelative\(values\.get\(name\)/u);
assert.match(entry, /values\.set\(name, resolve\(safeRelative/u);
assert.match(entry, /shell:\s*false/u);
assert.match(entry, /stdio:\s*'inherit'/u);
assert.match(entry, /publicationAuthority:\s*false/u);
assert.match(entry, /forcePush:\s*false/u);
assert.doesNotMatch(entry, /OPENAI_API_KEY/u);
assert.doesNotMatch(entry, /GITHUB_TOKEN/u);

console.log('Native mobile identity provider runtime and reviewed entry contracts passed.');
