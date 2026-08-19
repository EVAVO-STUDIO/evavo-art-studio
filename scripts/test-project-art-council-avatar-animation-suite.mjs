import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AVATAR_ANIMATION_SUITE_REQUEST_SCHEMA,
  AVATAR_ANIMATION_SUITE_REQUEST_SCHEMA_V1,
  compileProjectArtAvatarAnimationSuite,
  projectArtAvatarAnimationSuiteCapabilities,
} from './project-art/avatar-animation-suite.mjs';

const FIXED_TIME = '2026-08-19T03:45:00.000Z';

function authority() {
  return {
    providerExecution: false,
    candidateApproval: false,
    candidatePromotion: false,
    sourceMutation: false,
    repositoryMutation: false,
    gitCommit: false,
    gitPush: false,
    publication: false,
    runtimeActivation: false,
    deployment: false,
    forcePush: false,
  };
}

function identityMaster(characterId) {
  return {
    provider: 'git-repository-asset',
    repository: 'EVAVO-STUDIO/evavo-avatar-runtime',
    commit: '38d99996f80c55774008e3064cfdb9a02fe2fb18',
    tree: '4c2f7f20e103825238d1067e272541c0a2a74b21',
    asset: {
      path: `assets/${characterId}/candidates/${characterId}-identity-master-v1.alpha.png`,
      mediaType: 'image/png',
      format: 'png',
      width: 1024,
      height: 1536,
      bytes: 1_500_000,
      sha256:
        characterId === 'council-critic'
          ? '1111111111111111111111111111111111111111111111111111111111111111'
          : '2222222222222222222222222222222222222222222222222222222222222222',
      alpha: 'rgba8-straight',
    },
    candidateManifest: {
      path: `assets/${characterId}/candidates/${characterId}-identity-master-v1.alpha.candidate.json`,
      sha256:
        characterId === 'council-critic'
          ? '3333333333333333333333333333333333333333333333333333333333333333'
          : '4444444444444444444444444444444444444444444444444444444444444444',
    },
    lifecycle: {
      approvalState: 'unapproved',
      productionReady: false,
      runtimeActivationEligible: false,
      maySeedAnimationGeneration: true,
    },
  };
}

function request(characterId) {
  const suffix = characterId === 'council-critic' ? 'critic' : 'reviewer';
  return {
    schema: AVATAR_ANIMATION_SUITE_REQUEST_SCHEMA,
    sessionId: `${characterId}-animation-001`,
    requestedAt: '2026-08-19T03:40:00Z',
    characterId,
    source: {
      provider: 'cloudinary',
      cloudName: 'dntogqtey',
      publicId: `evavo/avatar-runtime/${characterId}/identity-v1/${suffix}-identity-v1`,
      assetId:
        characterId === 'council-critic'
          ? '11111111111111111111111111111111'
          : '22222222222222222222222222222222',
      version: 1787110000,
      format: 'png',
      width: 1024,
      height: 1536,
      bytes: 1_500_000,
      assetFolder: `evavo/avatar-runtime/${characterId}/identity-v1`,
      secureUrl: `https://res.cloudinary.com/dntogqtey/image/upload/v1787110000/evavo/avatar-runtime/${characterId}/identity-v1/${suffix}-identity-v1.png`,
    },
    animationIdentityMaster: identityMaster(characterId),
    targetCanvas: { width: 1024, height: 1536 },
    requirements: {
      multipleIdleVariants: 4,
      multipleTalkVariants: 6,
      separatedMouthLayer: true,
      separatedEyeLayer: true,
      exactAudioTiming: true,
      genuineTransparency: true,
      fakeTransparencyGridAllowed: false,
      professionalFrameAssurance: true,
    },
    authority: authority(),
  };
}

function hasCode(code) {
  return (error) => Boolean(error && typeof error === 'object' && error.code === code);
}

for (const characterId of ['council-critic', 'council-open-reviewer']) {
  test(`${characterId} compiles through the canonical 749-image animation suite`, () => {
    const plan = compileProjectArtAvatarAnimationSuite(request(characterId), {
      compiledAt: FIXED_TIME,
    });
    assert.equal(plan.characterId, characterId);
    assert.equal(plan.counts.clips, 25);
    assert.equal(plan.counts.fullCharacterFrames, 732);
    assert.equal(plan.counts.registeredPoseLayers, 17);
    assert.equal(plan.counts.totalPlannedImages, 749);
    assert.equal(plan.presentationCadence.minimumAuthoredFps, 24);
    assert.equal(plan.presentationCadence.preferredAuthoredFps, 30);
    assert.equal(plan.presentationCadence.displayTargetFps, 60);
    assert.ok(plan.clips.some((clip) => clip.id === 'council-greeting'));
    assert.ok(
      plan.identityLock.some((line) =>
        line.includes('approved Council identity master'),
      ),
    );
    assert.ok(
      [...plan.frameJobs, ...plan.poseJobs].every(
        (job) =>
          job.referenceRoles.includes('canonical-identity') &&
          job.referenceRoles.includes('animation-identity-master') &&
          job.identityReferenceSetSha256 === plan.identityReferenceSetSha256,
      ),
    );
    assert.ok(
      plan.frameJobs.every(
        (job) => job.promptContract.animationIdentityMasterRequired === true,
      ),
    );
    assert.equal(plan.qualityGates.topHatGeometryDriftBlocking, false);
    assert.equal(plan.productionReady, false);
    assert.equal(plan.runtimeActivationAllowed, false);
  });
}

test('Council animation requires v2 and a hash-bound full-body identity master', () => {
  const missing = request('council-critic');
  missing.animationIdentityMaster = null;
  assert.throws(
    () => compileProjectArtAvatarAnimationSuite(missing, { compiledAt: FIXED_TIME }),
    hasCode('PROJECT_ART_AVATAR_ANIMATION_MASTER_REQUIRED'),
  );

  const legacy = request('council-critic');
  legacy.schema = AVATAR_ANIMATION_SUITE_REQUEST_SCHEMA_V1;
  delete legacy.animationIdentityMaster;
  assert.throws(
    () => compileProjectArtAvatarAnimationSuite(legacy, { compiledAt: FIXED_TIME }),
    hasCode('PROJECT_ART_AVATAR_ANIMATION_COUNCIL_V2_REQUIRED'),
  );
});

test('canonical capabilities advertise data-driven Council character support', () => {
  const capabilities = projectArtAvatarAnimationSuiteCapabilities();
  assert.deepEqual(capabilities.characters, ['eva-female', 'top-hat-man']);
  assert.equal(capabilities.characterIdPolicy, 'eva-female | top-hat-man | council-*');
  assert.equal(capabilities.councilCharactersSupported, true);
  assert.equal(capabilities.councilV2AnimationIdentityMasterRequired, true);
  assert.equal(capabilities.completeClipMatrix, true);
  assert.equal(capabilities.minimumAuthoredFps, 24);
  assert.equal(capabilities.preferredAuthoredFps, 30);
});

test('unrelated arbitrary character IDs remain rejected', () => {
  const invalid = request('council-critic');
  invalid.characterId = 'random-avatar';
  invalid.sessionId = 'random-avatar-animation-001';
  assert.throws(
    () => compileProjectArtAvatarAnimationSuite(invalid, { compiledAt: FIXED_TIME }),
    hasCode('PROJECT_ART_AVATAR_ANIMATION_CHARACTER_INVALID'),
  );
});
