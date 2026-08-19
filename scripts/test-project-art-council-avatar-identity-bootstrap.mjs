import assert from 'node:assert/strict';
import test from 'node:test';

import { compileCouncilAvatarIdentityBootstrap } from './project-art/council-avatar-identity-bootstrap.mjs';

test('Critic and Open Reviewer compile into exact native identity-master bootstrap plans', () => {
  const bootstrap = compileCouncilAvatarIdentityBootstrap();
  assert.equal(bootstrap.characterCount, 2);
  assert.deepEqual(bootstrap.characterIds, [
    'council-critic',
    'council-open-reviewer',
  ]);
  assert.equal(bootstrap.candidateSetsPerCharacter, 4);
  assert.equal(bootstrap.viewsPerCandidateSet, 3);
  assert.equal(bootstrap.providerGenerationJobsPerCharacter, 12);
  assert.equal(bootstrap.totalProviderGenerationJobs, 24);
  assert.match(bootstrap.bootstrapSha256, /^[a-f0-9]{64}$/u);
});

test('all 24 candidate generation jobs preserve provider authorization boundary', () => {
  const bootstrap = compileCouncilAvatarIdentityBootstrap();
  const requests = bootstrap.characters.flatMap(
    (character) => character.bootstrapAdmission.requests,
  );
  assert.equal(requests.length, 24);
  assert.ok(
    requests.every(
      (request) =>
        request.operation === 'generate' &&
        request.dimensions.width === 1024 &&
        request.dimensions.height === 1536 &&
        request.dimensions.alpha === 'transparent' &&
        request.providerSelectionDeferred === true &&
        request.providerExecution === false &&
        request.providerAuthorizationRequired === true &&
        request.runtimeAsset === false &&
        request.animationFamily === false &&
        request.approvalByGeneration === false &&
        request.promotion === false &&
        request.publication === false &&
        request.gitMutation === false,
    ),
  );
});

test('identity candidate prompts preserve continuity and reject generic AI styling', () => {
  const bootstrap = compileCouncilAvatarIdentityBootstrap();
  for (const character of bootstrap.characters) {
    const plan = character.identityMasterPlan;
    assert.equal(plan.candidateSetCount, 4);
    assert.equal(plan.viewCount, 3);
    assert.equal(plan.totalJobs, 12);
    for (const candidateSet of plan.candidateSets) {
      assert.equal(candidateSet.jobs.length, 3);
      assert.ok(
        candidateSet.jobs.every(
          (job) =>
            job.continuityKey === candidateSet.continuityKey &&
            job.prompt.includes('Preserve the same identity across every view') &&
            job.prompt.includes('generic AI assistant styling') &&
            job.prompt.includes('Transparent background') &&
            job.prompt.includes('No contact sheet'),
        ),
      );
    }
  }
});

test('identity bootstrap keeps review and animation closed after generation planning', () => {
  const bootstrap = compileCouncilAvatarIdentityBootstrap();
  assert.equal(bootstrap.requiredReview.exactlyOneSelectedSetRequiredForCompletion, true);
  assert.equal(bootstrap.requiredReview.separateIdentityApprovalReceiptRequired, true);
  assert.equal(bootstrap.requiredReview.generationDoesNotApproveIdentity, true);
  assert.ok(bootstrap.characters.every((character) => character.animationMayBegin === false));
  assert.equal(bootstrap.authority.providerExecution, false);
  assert.equal(bootstrap.authority.candidateApproval, false);
  assert.equal(bootstrap.authority.identityApproval, false);
  assert.equal(bootstrap.authority.animationFamily, false);
  assert.equal(bootstrap.authority.runtimeActivation, false);
});
