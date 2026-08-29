import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
  compileCouncilAvatarProviderRuntimePackage,
} from './project-art/council-avatar-provider-runtime.mjs';

const HEX64 = /^[a-f0-9]{64}$/u;

test('Council runtime jobs preserve canonical provider contracts but fail closed for generic workers', () => {
  const runtimePackage = compileCouncilAvatarProviderRuntimePackage();

  assert.equal(runtimePackage.jobs.length, 2);
  assert.equal(
    runtimePackage.executionCapability,
    COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
  );
  assert.equal(runtimePackage.executionPolicy.genericProviderWorkerMayClaim, false);
  assert.equal(runtimePackage.providerCallBudget.maximumAttemptsPerJob, 1);
  assert.equal(runtimePackage.providerCallBudget.retriesAuthorizedByThisPackage, 0);
  assert.equal(runtimePackage.providerCallBudget.fallbackAuthorizedByThisPackage, false);

  for (const job of runtimePackage.jobs) {
    assert.ok(HEX64.test(job.canonicalContractSha256));
    assert.ok(HEX64.test(job.runtimeJobSha256));
    assert.equal(job.canonicalContract.executionMode, 'submit-runtime-job');
    assert.equal(job.runtimeJob.queue, 'provider');
    assert.equal(job.runtimeJob.kind, 'art.candidate.generate');
    assert.equal(job.runtimeJob.maximumAttempts, 1);
    assert.ok(
      job.runtimeJob.requiredCapabilities.includes(
        COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
      ),
    );
    assert.ok(job.runtimeJob.requiredCapabilities.includes('provider.generate'));
    assert.ok(job.runtimeJob.requiredCapabilities.includes('provider.candidate-store'));
    assert.ok(job.runtimeJob.requiredCapabilities.includes('evidence.bundle'));
    assert.match(job.runtimeJob.idempotencyKey, /^council-avatar:provider:/u);
    assert.equal(job.executionAuthorization, null);
    assert.equal(job.providerExecution, false);
    assert.equal(job.candidateApproval, false);
    assert.equal(job.candidatePromotion, false);
    assert.equal(job.runtimeActivationAllowed, false);
  }
});

test('Council governed runtime removes canonical automatic retries without mutating canonical contract evidence', () => {
  const runtimePackage = compileCouncilAvatarProviderRuntimePackage();

  for (const job of runtimePackage.jobs) {
    assert.equal(job.canonicalContract.runtimeJob.maximumAttempts, 3);
    assert.equal(job.runtimeJob.maximumAttempts, 1);
    assert.notEqual(job.runtimeJobSha256, job.canonicalContractSha256);
    assert.deepEqual(
      job.runtimeJob.payload,
      job.canonicalContract.runtimeJob.payload,
    );
    assert.deepEqual(
      job.runtimeJob.requiredCapabilityProfile,
      job.canonicalContract.runtimeJob.requiredCapabilityProfile,
    );
  }
});

test('Council runtime package is deterministic', () => {
  const left = compileCouncilAvatarProviderRuntimePackage();
  const right = compileCouncilAvatarProviderRuntimePackage();
  assert.equal(left.runtimePackageSha256, right.runtimePackageSha256);
  assert.deepEqual(left, right);
});
