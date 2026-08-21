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

function boundedArtifact(review) {
  return {
    schema: 'evavo.project-art-council-avatar-procedural-review-artifact.v1',
    status: 'procedural-previsualisation-review-only',
    renderer: 'scripts/project-art/council-avatar-procedural-renderer.py',
    masterCanvas: { width: 1024, height: 1536 },
    videoCanvas: { width: 512, height: 768 },
    fps: 60,
    externalImageGenerationUsed: false,
    identityMasterCandidate: false,
    characters: review.characters.map((character) => ({
      characterId: character.characterId,
      displayName: character.displayName,
      seatId: character.seatId,
      canonicalSeat: character.canonicalSeat,
      previewOnly: character.previewOnly,
      clips: review.clips.map((clip) => {
        const frameCount = Math.round(clip.durationSeconds * 60);
        return {
          clipId: clip.clipId,
          purpose: clip.purpose,
          durationSeconds: clip.durationSeconds,
          fps: 60,
          frameCount,
          loop: true,
          video: `${clip.clipId}.mp4`,
          poster: `${clip.clipId}.poster.png`,
          contactSheet: `${clip.clipId}.contact.png`,
          uniqueFrameCount: frameCount,
          duplicateFrameCount: 0,
          normalisedSeamEnergy: 0,
          sha256: 'b'.repeat(64),
        };
      }),
    })),
    authority: { ...review.authority },
    manifestSha256: 'a'.repeat(64),
  };
}

test('artifact validator accepts exact bounded renderer evidence', () => {
  const review = compileCouncilAvatarProceduralReview();
  const validation = validateCouncilAvatarProceduralReviewArtifact(
    boundedArtifact(review),
  );
  assert.equal(validation.valid, true);
  assert.equal(validation.characterCount, 5);
  assert.equal(validation.manifestHashSyntaxValidated, true);
  assert.equal(validation.manifestHashRecomputed, false);
  assert.equal(validation.providerExecution, false);
  assert.equal(validation.identityApproval, false);
  assert.equal(validation.productionAdmission, false);
  assert.equal(validation.runtimeActivation, false);
  assert.equal(validation.websiteActivation, false);
});

test('artifact validator rejects known, nested and unknown authority escalation', () => {
  const review = compileCouncilAvatarProceduralReview();
  const artifact = boundedArtifact(review);
  assert.throws(
    () =>
      validateCouncilAvatarProceduralReviewArtifact({
        ...artifact,
        authority: { ...artifact.authority, identityApproval: true },
      }),
    /ARTIFACT_ESCALATION/u,
  );
  assert.throws(
    () =>
      validateCouncilAvatarProceduralReviewArtifact({
        ...artifact,
        authority: {
          ...artifact.authority,
          unrecognisedPublicationAuthority: false,
        },
      }),
    /AUTHORITY_INVALID/u,
  );
  assert.throws(
    () =>
      validateCouncilAvatarProceduralReviewArtifact({
        ...artifact,
        characters: artifact.characters.map((character, characterIndex) => ({
          ...character,
          clips: character.clips.map((clip, clipIndex) =>
            characterIndex === 0 && clipIndex === 0
              ? { ...clip, runtimeActivationEstablished: true }
              : clip,
          ),
        })),
      }),
    /ARTIFACT_ESCALATION/u,
  );
  assert.throws(
    () =>
      validateCouncilAvatarProceduralReviewArtifact({
        ...artifact,
        identityMasterCandidate: true,
      }),
    /ARTIFACT_ESCALATION/u,
  );
});

test('artifact validator binds canonical roster, Nymm boundary and complete clip order', () => {
  const review = compileCouncilAvatarProceduralReview();
  const artifact = boundedArtifact(review);
  assert.throws(
    () =>
      validateCouncilAvatarProceduralReviewArtifact({
        ...artifact,
        characters: artifact.characters.map((character) =>
          character.characterId === 'nymm-guest-arbiter'
            ? { ...character, seatId: 'guest-arbiter', canonicalSeat: true }
            : character,
        ),
      }),
    /CHARACTER_BOUNDARY_INVALID/u,
  );
  assert.throws(
    () =>
      validateCouncilAvatarProceduralReviewArtifact({
        ...artifact,
        characters: artifact.characters.map((character, index) =>
          index === 0
            ? { ...character, clips: character.clips.slice(0, -1) }
            : character,
        ),
      }),
    /CLIP_COUNT_INVALID/u,
  );
  assert.throws(
    () =>
      validateCouncilAvatarProceduralReviewArtifact({
        ...artifact,
        characters: artifact.characters.map((character, index) =>
          index === 0
            ? {
                ...character,
                clips: [
                  character.clips[1],
                  character.clips[0],
                  ...character.clips.slice(2),
                ],
              }
            : character,
        ),
      }),
    /CLIP_BOUNDARY_INVALID/u,
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
