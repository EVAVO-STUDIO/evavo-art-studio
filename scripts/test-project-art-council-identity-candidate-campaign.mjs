import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runCouncilIdentityCandidateCampaignCompilerCli } from './compile-project-art-council-identity-candidate-campaign.mjs';
import {
  compileCouncilIdentityCandidateCampaign,
  councilIdentityCandidateCampaignCapabilities,
  validateCouncilIdentityCandidateCampaign,
} from './project-art/council-identity-candidate-campaign.mjs';

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(',')}}`;
}

function rehash(value) {
  const body = structuredClone(value);
  delete body.campaignSha256;
  return {
    ...body,
    campaignSha256: createHash('sha256').update(canonical(body)).digest('hex'),
  };
}

function clone(value) {
  return structuredClone(value);
}

function assertFalseAuthority(authority) {
  assert.ok(authority && typeof authority === 'object');
  assert.ok(Object.keys(authority).length >= 16);
  assert.ok(Object.values(authority).every((value) => value === false));
}

test('V4.4 campaign compiles the exact two-character 24-job matrix', () => {
  const campaign = compileCouncilIdentityCandidateCampaign();
  assert.equal(campaign.version, '4.4.0');
  assert.equal(campaign.status, 'compile-only-provider-admission-not-established');
  assert.deepEqual(
    campaign.source.characters.map((character) => character.characterId),
    ['council-critic', 'council-open-reviewer'],
  );
  assert.deepEqual(campaign.counts, {
    characters: 2,
    candidateSetsPerCharacter: 4,
    viewsPerCandidateSet: 3,
    jobsPerCharacter: 12,
    anchorJobs: 8,
    dependentJobs: 16,
    totalJobs: 24,
    maximumProviderCallsAfterSeparateAuthorization: 24,
    maximumRuntimeAttemptsAfterSeparateAuthorization: 24,
  });
  assert.equal(campaign.jobs.length, 24);
  assert.deepEqual(
    campaign.jobs.slice(0, 8).map((job) => job.viewId),
    Array(8).fill('full-body-right'),
  );
  assert.deepEqual(
    campaign.jobs.slice(8).map((job) => job.viewId),
    Array.from({ length: 8 }, () => ['full-body-left', 'neutral-bust']).flat(),
  );
  assert.ok(campaign.jobs.every((job, index) => job.ordinal === index + 1));
  assert.match(campaign.campaignSha256, /^[a-f0-9]{64}$/u);
});

test('provider selection is exact, single-adapter and fallback-free', () => {
  const campaign = compileCouncilIdentityCandidateCampaign();
  assert.deepEqual(campaign.providerSelection, {
    preferredAdapterId: 'openai-gpt-image',
    preferredModel: 'gpt-image-1',
    allowedAdapterIds: ['openai-gpt-image'],
    allowFallback: false,
    requireSeed: false,
    seed: null,
  });
  assert.equal(
    campaign.source.providerSelection.path,
    'config/council-avatar-identities/council-identity-provider-selection.v1.json',
  );
  assert.ok(campaign.source.providerSelection.bytes > 100);
  assert.match(campaign.source.providerSelection.sha256, /^[a-f0-9]{64}$/u);
  assert.equal(campaign.executionPolicy.providerFallbackAllowed, false);
  assert.equal(campaign.executionPolicy.automaticRetryAllowed, false);
  assert.equal(campaign.executionPolicy.automaticAuthorizationAllowed, false);
});

test('all dependent jobs bind only their exact same-character same-set anchor', () => {
  const campaign = compileCouncilIdentityCandidateCampaign();
  const anchors = new Map(
    campaign.jobs
      .slice(0, 8)
      .map((job) => [`${job.characterId}:${job.setId}`, job]),
  );
  assert.equal(anchors.size, 8);
  for (const job of campaign.jobs.slice(8)) {
    const anchor = anchors.get(`${job.characterId}:${job.setId}`);
    assert.ok(anchor);
    assert.equal(job.continuityKey, anchor.continuityKey);
    assert.equal(job.dependency.kind, 'same-character-same-set-anchor-execution');
    assert.equal(job.dependency.anchorCampaignJobId, anchor.campaignJobId);
    assert.equal(job.dependency.anchorJobId, anchor.jobId);
    assert.equal(job.dependency.anchorAdmissionItemId, anchor.admissionItemId);
    assert.equal(job.dependency.anchorCampaignOrdinal, anchor.ordinal);
    assert.equal(job.dependency.requiresSuccessfulExecutionReceipt, true);
    assert.equal(job.dependency.crossSetReuseAllowed, false);
    assert.equal(job.dependency.crossCharacterReuseAllowed, false);
    assert.ok(job.futureAdmissionCommand.includes('--anchor-execution-receipt'));
  }
  assert.ok(
    campaign.jobs
      .slice(0, 8)
      .every(
        (job) =>
          job.dependency === null &&
          !job.futureAdmissionCommand.includes('--anchor-execution-receipt'),
      ),
  );
});

test('campaign jobs are immutable candidate-only plans with unique identities', () => {
  const campaign = compileCouncilIdentityCandidateCampaign();
  for (const field of ['campaignJobId', 'admissionItemId', 'targetPath', 'jobSha256']) {
    assert.equal(new Set(campaign.jobs.map((job) => job[field])).size, 24, field);
  }
  for (const job of campaign.jobs) {
    assert.equal(job.status, 'planned-not-admitted');
    assert.equal(job.dimensions.width, 1024);
    assert.equal(job.dimensions.height, 1536);
    assert.equal(job.dimensions.alpha, 'transparent');
    assert.ok(job.prompt.length > 100);
    assert.match(job.promptSha256, /^[a-f0-9]{64}$/u);
    assert.equal(job.limits.candidates, 1);
    assert.equal(job.limits.providerCalls, 1);
    assert.equal(job.limits.runtimeAttempts, 1);
    assert.equal(job.limits.providerFallback, false);
    assert.equal(job.limits.automaticRetry, false);
    assertFalseAuthority(job.authority);
  }
  assertFalseAuthority(campaign.authority);
  assert.equal(campaign.reviewPolicy.selectionGrantsIdentityApproval, false);
  assert.equal(campaign.reviewPolicy.separateIdentityApprovalReceiptRequired, true);
  assert.equal(campaign.reviewPolicy.animationMayBeginBeforeIdentityApproval, false);
});

test('campaign compilation is deterministic and repository-bound', () => {
  const first = compileCouncilIdentityCandidateCampaign();
  const second = compileCouncilIdentityCandidateCampaign();
  assert.deepEqual(first, second);
  assert.equal(validateCouncilIdentityCandidateCampaign(first).valid, true);
  assert.equal(first.source.characters.length, 2);
  for (const character of first.source.characters) {
    assert.match(character.requestSha256, /^[a-f0-9]{64}$/u);
    assert.match(character.identityMasterPlanSha256, /^[a-f0-9]{64}$/u);
    assert.match(character.bootstrapAdmissionSha256, /^[a-f0-9]{64}$/u);
    assert.equal(character.candidateSetCount, 4);
    assert.equal(character.viewCount, 3);
    assert.equal(character.providerGenerationJobCount, 12);
  }
});

test('validator rejects a changed adapter even after attacker-controlled rehash', () => {
  const changed = clone(compileCouncilIdentityCandidateCampaign());
  changed.providerSelection.preferredAdapterId = 'fixture-image';
  changed.providerSelection.allowedAdapterIds = ['fixture-image'];
  for (const job of changed.jobs) {
    job.selection.preferredAdapterId = 'fixture-image';
    job.selection.allowedAdapterIds = ['fixture-image'];
  }
  assert.throws(
    () => validateCouncilIdentityCandidateCampaign(rehash(changed)),
    /REPOSITORY_BINDING_INVALID/u,
  );
});

test('validator rejects reordered phases and cross-set anchors after rehash', () => {
  const reordered = clone(compileCouncilIdentityCandidateCampaign());
  [reordered.jobs[0], reordered.jobs[8]] = [reordered.jobs[8], reordered.jobs[0]];
  assert.throws(
    () => validateCouncilIdentityCandidateCampaign(rehash(reordered)),
    /REPOSITORY_BINDING_INVALID/u,
  );

  const crossSet = clone(compileCouncilIdentityCandidateCampaign());
  const dependent = crossSet.jobs[8];
  const wrongAnchor = crossSet.jobs[1];
  dependent.dependency.anchorCampaignJobId = wrongAnchor.campaignJobId;
  dependent.dependency.anchorJobId = wrongAnchor.jobId;
  dependent.dependency.anchorAdmissionItemId = wrongAnchor.admissionItemId;
  dependent.dependency.anchorCampaignOrdinal = wrongAnchor.ordinal;
  assert.throws(
    () => validateCouncilIdentityCandidateCampaign(rehash(crossSet)),
    /REPOSITORY_BINDING_INVALID/u,
  );
});

test('validator rejects authority escalation and roster injection after rehash', () => {
  const escalated = clone(compileCouncilIdentityCandidateCampaign());
  escalated.jobs[0].authority.providerExecution = true;
  assert.throws(
    () => validateCouncilIdentityCandidateCampaign(rehash(escalated)),
    /REPOSITORY_BINDING_INVALID/u,
  );

  const injected = clone(compileCouncilIdentityCandidateCampaign());
  injected.jobs[0].characterId = 'nymm-guest-arbiter';
  assert.throws(
    () => validateCouncilIdentityCandidateCampaign(rehash(injected)),
    /REPOSITORY_BINDING_INVALID/u,
  );
});

test('capabilities expose the campaign without execution or approval authority', () => {
  const capabilities = councilIdentityCandidateCampaignCapabilities();
  assert.equal(capabilities.version, '4.4.0');
  assert.deepEqual(capabilities.characterIds, [
    'council-critic',
    'council-open-reviewer',
  ]);
  assert.equal(capabilities.anchorJobCount, 8);
  assert.equal(capabilities.dependentJobCount, 16);
  assert.equal(capabilities.totalJobCount, 24);
  assert.equal(capabilities.exactAdapterId, 'openai-gpt-image');
  assert.equal(capabilities.exactModel, 'gpt-image-1');
  assert.equal(capabilities.providerFallbackAllowed, false);
  assert.equal(capabilities.globalAnchorBarrierRequired, true);
  assert.equal(capabilities.sameSetAnchorReceiptRequired, true);
  assert.equal(capabilities.providerAdmission, false);
  assert.equal(capabilities.providerAuthorization, false);
  assert.equal(capabilities.providerExecution, false);
  assert.equal(capabilities.candidateApproval, false);
  assert.equal(capabilities.identityApproval, false);
  assert.equal(capabilities.runtimeActivation, false);
  assert.equal(capabilities.websiteActivation, false);
});

test('CLI compiles create-only, validates and rejects unknown flags', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'evavo-council-v44-'));
  try {
    const output = path.join(root, 'campaign.json');
    const compiled = runCouncilIdentityCandidateCampaignCompilerCli([
      'compile',
      '--output',
      output,
    ]);
    assert.equal(compiled.status, 'passed');
    assert.equal(compiled.totalJobs, 24);
    assert.equal(compiled.providerExecution, false);
    const value = JSON.parse(readFileSync(output, 'utf8'));
    assert.equal(value.campaignSha256, compiled.campaignSha256);
    const validated = runCouncilIdentityCandidateCampaignCompilerCli([
      'validate',
      '--input',
      output,
    ]);
    assert.equal(validated.valid, true);
    assert.equal(validated.totalJobs, 24);
    assert.throws(
      () =>
        runCouncilIdentityCandidateCampaignCompilerCli([
          'compile',
          '--output',
          output,
        ]),
      /create-only/u,
    );
    assert.throws(
      () =>
        runCouncilIdentityCandidateCampaignCompilerCli([
          'summary',
          '--provider-execution',
          'true',
        ]),
      /Unsupported|usage/u,
    );
    const tampered = clone(value);
    tampered.counts.totalJobs = 25;
    const tamperedPath = path.join(root, 'tampered.json');
    writeFileSync(tamperedPath, `${JSON.stringify(rehash(tampered), null, 2)}\n`);
    assert.throws(
      () =>
        runCouncilIdentityCandidateCampaignCompilerCli([
          'validate',
          '--input',
          tamperedPath,
        ]),
      /REPOSITORY_BINDING_INVALID/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
