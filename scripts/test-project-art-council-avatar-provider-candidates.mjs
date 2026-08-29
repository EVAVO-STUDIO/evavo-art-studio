import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COUNCIL_AVATAR_PROVIDER_CANDIDATE_PLAN_SCHEMA,
  compileCouncilAvatarProviderCandidatePlan,
  councilAvatarProviderCandidateCapabilities,
} from './project-art/council-avatar-provider-candidates.mjs';

const HEX64 = /^[a-f0-9]{64}$/u;

test('Council identity candidate plan targets only missing identity masters', () => {
  const plan = compileCouncilAvatarProviderCandidatePlan();

  assert.equal(plan.schema, COUNCIL_AVATAR_PROVIDER_CANDIDATE_PLAN_SCHEMA);
  assert.equal(plan.eligibleCharacterCount, 2);
  assert.deepEqual(plan.eligibleCharacterIds, [
    'council-critic',
    'council-open-reviewer',
  ]);
  assert.equal(plan.jobs.length, 2);
  assert.ok(HEX64.test(plan.productionProgramSha256));
  assert.ok(HEX64.test(plan.planSha256));

  const generated = new Set(plan.jobs.map((job) => job.characterId));
  assert.equal(generated.has('top-hat-man'), false);
  assert.equal(generated.has('eva-female'), false);
});

test('Council identity requests are high quality, bounded and explicitly routed', () => {
  const plan = compileCouncilAvatarProviderCandidatePlan();

  for (const job of plan.jobs) {
    assert.ok(HEX64.test(job.identityBriefSha256));
    assert.ok(HEX64.test(job.requestSha256));
    assert.equal(job.request.schemaVersion, '1.0');
    assert.equal(job.request.operation, 'generate');
    assert.equal(job.request.assetKind, 'illustration');
    assert.equal(job.request.continuityPhase, 'identity-master');
    assert.equal(job.request.quality, 'high');
    assert.equal(job.request.candidateCount, 4);
    assert.deepEqual(job.request.target, {
      width: 1024,
      height: 1536,
      transparency: 'required',
      outputFormat: 'png',
    });
    assert.equal(job.request.background.strategy, 'provider-auto');
    assert.equal(job.request.selection.preferredAdapterId, 'openai-gpt-image');
    assert.equal(job.request.selection.preferredModel, 'gpt-image-2');
    assert.deepEqual(job.request.selection.allowedAdapterIds, ['openai-gpt-image']);
    assert.equal(job.request.selection.allowFallback, false);
    assert.equal(job.request.metadata.identityBriefSha256, job.identityBriefSha256);
    assert.equal(
      job.request.metadata.productionProgramSha256,
      plan.productionProgramSha256,
    );
    assert.equal(job.request.metadata.providerExecutionAuthorized, false);
    assert.equal(job.request.metadata.candidateApprovalEstablished, false);
    assert.equal(job.request.metadata.candidatePromotionEstablished, false);
    assert.equal(job.request.metadata.runtimeActivationEstablished, false);
    assert.equal(job.request.metadata.websiteActivationEstablished, false);
    assert.equal(job.candidateApprovalEstablished, false);
    assert.equal(job.candidatePromotionEstablished, false);
    assert.equal(job.runtimeActivationEstablished, false);
    assert.match(job.candidateOutputDirectory, /^artifacts\/council-avatar-candidates\//u);
  }
});

test('provider generation grants no approval, promotion or activation authority', () => {
  const plan = compileCouncilAvatarProviderCandidatePlan();

  assert.equal(plan.providerExecution, false);
  assert.equal(plan.candidateApproval, false);
  assert.equal(plan.candidatePromotion, false);
  assert.equal(plan.runtimeActivationAllowed, false);
  assert.equal(plan.websiteActivationAllowed, false);
  assert.equal(plan.reviewPolicy.candidateGenerationMayApproveIdentity, false);
  assert.equal(plan.reviewPolicy.providerSuccessMayApproveIdentity, false);
  assert.equal(plan.reviewPolicy.candidateGenerationMayPromoteRuntime, false);
  assert.ok(Object.values(plan.authority).every((value) => value === false));
  assert.ok(
    plan.jobs.every((job) =>
      Object.values(job.authority).every((value) => value === false),
    ),
  );
});

test('candidate count and provider identifiers are fail-closed', () => {
  assert.throws(
    () => compileCouncilAvatarProviderCandidatePlan({ candidateCount: 0 }),
    /candidateCount/u,
  );
  assert.throws(
    () => compileCouncilAvatarProviderCandidatePlan({ candidateCount: 9 }),
    /candidateCount/u,
  );
  assert.throws(
    () =>
      compileCouncilAvatarProviderCandidatePlan({
        preferredAdapterId: 'openai-gpt-image bad',
      }),
    /preferredAdapterId/u,
  );
});

test('candidate plan is deterministic for the same production program and options', () => {
  const left = compileCouncilAvatarProviderCandidatePlan();
  const right = compileCouncilAvatarProviderCandidatePlan();
  assert.equal(left.planSha256, right.planSha256);
  assert.deepEqual(left, right);
});

test('capabilities expose compilation without pretending execution is authorized', () => {
  const capabilities = councilAvatarProviderCandidateCapabilities();
  assert.equal(capabilities.eligibleCharacterCount, 2);
  assert.deepEqual(capabilities.eligibleCharacterIds, [
    'council-critic',
    'council-open-reviewer',
  ]);
  assert.equal(capabilities.providerRequestCompilationAvailable, true);
  assert.equal(capabilities.providerExecutionAuthorized, false);
  assert.equal(capabilities.candidateApprovalEstablished, false);
  assert.equal(capabilities.candidatePromotionEstablished, false);
  assert.equal(capabilities.runtimeActivationAllowed, false);
  assert.equal(capabilities.websiteActivationAllowed, false);
});
