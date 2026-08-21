import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  compileCouncilAvatarProceduralReview,
  councilAvatarProceduralReviewCapabilities,
  validateCouncilAvatarProceduralReviewArtifact,
} from './project-art/council-avatar-procedural-review.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('procedural review binds four canonical seats and one preview-only guest', () => {
  const review = compileCouncilAvatarProceduralReview();
  assert.equal(review.version, '4.3.0');
  assert.equal(review.canonicalSeatCount, 4);
  assert.equal(review.characterCount, 5);
  assert.equal(review.previewOnlyCharacterCount, 1);
  assert.equal(review.totalReviewClipCount, 25);
  assert.deepEqual(
    review.characters.map((character) => [
      character.seatId,
      character.characterId,
      character.displayName,
      character.previewOnly,
    ]),
    [
      ['architect', 'top-hat-man', 'Top Hat Man', false],
      ['researcher', 'eva-female', 'EVA', false],
      ['critic', 'council-critic', 'Veyra', false],
      ['open-reviewer', 'council-open-reviewer', 'Moro Pell', false],
      [null, 'nymm-guest-arbiter', 'Nymm', true],
    ],
  );
  assert.equal(review.reviewRules.nymmMayOccupyCanonicalCouncilSeat, false);
});

test('procedural review hashes exact safe renderer and atlas source bytes', () => {
  const review = compileCouncilAvatarProceduralReview();
  assert.deepEqual(
    review.sourceFiles.map((source) => source.path),
    [
      'scripts/project-art/council-avatar-procedural-renderer.py',
      'scripts/project-art/compile-council-avatar-review-atlases.py',
    ],
  );
  for (const source of review.sourceFiles) {
    assert.ok(source.bytes > 1000);
    assert.match(source.sha256, /^[a-f0-9]{64}$/u);
    const bytes = readFileSync(path.join(ROOT, source.path));
    assert.equal(bytes.byteLength, source.bytes);
  }
  assert.match(review.reviewSha256, /^[a-f0-9]{64}$/u);
  const atlasSource = readFileSync(
    path.join(
      ROOT,
      'scripts/project-art/compile-council-avatar-review-atlases.py',
    ),
    'utf8',
  );
  assert.ok(atlasSource.includes('current["image"].paste(image, (x, y))'));
  assert.ok(!atlasSource.includes('current["image"].alpha_composite(image, (x, y))'));
});

test('procedural review remains previsualisation and cannot establish production truth', () => {
  const review = compileCouncilAvatarProceduralReview();
  assert.equal(review.renderer.externalImageGenerationUsed, false);
  assert.equal(review.renderer.deterministicCodeAuthoredGeometry, true);
  assert.equal(review.atlas.trimmedPixelHashRoundTripRequired, true);
  assert.equal(review.atlas.productionAtlasClaimAllowed, false);
  assert.equal(review.reviewRules.proceduralShapeMayBecomeIdentityMasterAutomatically, false);
  assert.equal(review.reviewRules.proceduralReviewMayApproveIdentity, false);
  assert.equal(review.reviewRules.proceduralReviewMayApproveAnimation, false);
  assert.equal(review.reviewRules.proceduralReviewMaySatisfyProductionMediaReadiness, false);
  assert.equal(review.reviewRules.proceduralReviewMayActivateRuntime, false);
  assert.equal(review.reviewRules.proceduralReviewMayActivateWebsite, false);
  assert.ok(Object.values(review.authority).every((value) => value === false));
});

test('procedural renderer source uses canonical Council IDs and exposes a no-video self-test', () => {
  const source = readFileSync(
    path.join(
      ROOT,
      'scripts/project-art/council-avatar-procedural-renderer.py',
    ),
    'utf8',
  );
  for (const token of [
    '"council-critic"',
    '"council-open-reviewer"',
    '"nymm-guest-arbiter"',
    'def self_test()',
    '"identityApprovalEstablished": False',
    '"runtimeActivationEstablished": False',
    '"websiteActivationEstablished": False',
  ]) {
    assert.ok(source.includes(token), token);
  }
  assert.ok(!source.includes('"veyra": render_veyra'));
  assert.ok(!source.includes('"moro-pell": render_moro'));
});

test('artifact validator rejects authority escalation and accepts bounded review evidence', () => {
  const review = compileCouncilAvatarProceduralReview();
  const artifact = {
    schema: 'evavo.project-art-council-avatar-procedural-review-artifact.v1',
    status: 'procedural-previsualisation-review-only',
    masterCanvas: { width: 1024, height: 1536 },
    videoCanvas: { width: 512, height: 768 },
    fps: 60,
    externalImageGenerationUsed: false,
    identityMasterCandidate: false,
    characters: review.characters.map((character) => ({
      characterId: character.characterId,
    })),
    authority: { ...review.authority },
    manifestSha256: 'a'.repeat(64),
  };
  assert.equal(validateCouncilAvatarProceduralReviewArtifact(artifact).valid, true);
  assert.throws(
    () =>
      validateCouncilAvatarProceduralReviewArtifact({
        ...artifact,
        authority: { ...artifact.authority, identityApproval: true },
      }),
    /AUTHORITY_INVALID/u,
  );
  assert.throws(
    () =>
      validateCouncilAvatarProceduralReviewArtifact({
        ...artifact,
        identityMasterCandidate: true,
      }),
    /BOUNDARY_INVALID/u,
  );
});

test('capabilities are reusable without execution or activation authority', () => {
  const capabilities = councilAvatarProceduralReviewCapabilities();
  assert.equal(capabilities.characterCount, 5);
  assert.equal(capabilities.canonicalSeatCount, 4);
  assert.equal(capabilities.previewOnlyCharacterCount, 1);
  assert.equal(capabilities.clipCountPerCharacter, 5);
  assert.equal(capabilities.totalReviewClipCount, 25);
  assert.equal(capabilities.providerExecution, false);
  assert.equal(capabilities.identityApproval, false);
  assert.equal(capabilities.productionAdmission, false);
  assert.equal(capabilities.runtimeActivation, false);
  assert.equal(capabilities.websiteActivation, false);
});
