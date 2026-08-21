import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const COUNCIL_AVATAR_PROCEDURAL_REVIEW_SCHEMA =
  'evavo.project-art-council-avatar-procedural-review.v1';
export const COUNCIL_AVATAR_PROCEDURAL_REVIEW_CAPABILITIES_SCHEMA =
  'evavo.project-art-council-avatar-procedural-review-capabilities.v1';
export const COUNCIL_AVATAR_PROCEDURAL_REVIEW_ARTIFACT_SCHEMA =
  'evavo.project-art-council-avatar-procedural-review-artifact.v1';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHA256 = /^[a-f0-9]{64}$/u;
const AUTHORITY = Object.freeze({
  providerExecution: false,
  creativeApproval: false,
  identityApproval: false,
  candidateApproval: false,
  candidatePromotion: false,
  productionAdmission: false,
  sourceMutation: false,
  repositoryMutation: false,
  gitCommit: false,
  gitPush: false,
  publication: false,
  runtimeActivation: false,
  websiteActivation: false,
  deployment: false,
  forcePush: false,
});
const AUTHORITY_KEYS = Object.freeze(Object.keys(AUTHORITY).sort());
const FORBIDDEN_TRUE_KEYS = new Set([
  'providerExecution',
  'providerExecutionPerformed',
  'creativeApproval',
  'creativeApprovalEstablished',
  'creativeReviewPerformed',
  'identityApproval',
  'identityApprovalEstablished',
  'identityApprovalPerformed',
  'candidateApproval',
  'candidateApprovalEstablished',
  'candidateApprovalPerformed',
  'candidatePromotion',
  'candidatePromotionPerformed',
  'productionAdmission',
  'productionAdmissionEstablished',
  'productionAdmissionPerformed',
  'animationApproval',
  'animationApprovalEstablished',
  'animationProductionPerformed',
  'sourceMutation',
  'repositoryMutation',
  'gitCommit',
  'gitPush',
  'publication',
  'publicationGranted',
  'publicationPerformed',
  'runtimeActivation',
  'runtimeActivationGranted',
  'runtimeActivationEstablished',
  'runtimeActivationPerformed',
  'websiteActivation',
  'websiteActivationGranted',
  'websiteActivationEstablished',
  'websiteActivationPerformed',
  'deployment',
  'deploymentGranted',
  'deploymentPerformed',
  'forcePush',
  'identityMasterCandidate',
]);

const SOURCE_PATHS = Object.freeze([
  'scripts/project-art/council-avatar-procedural-renderer.py',
  'scripts/project-art/compile-council-avatar-review-atlases.py',
]);

const CLIPS = Object.freeze([
  Object.freeze({
    clipId: 'idle-primary',
    durationSeconds: 4,
    loop: true,
    purpose: 'primary presence and breathing proof',
  }),
  Object.freeze({
    clipId: 'idle-b',
    durationSeconds: 5,
    loop: true,
    purpose: 'secondary idle, blink and weight-shift proof',
  }),
  Object.freeze({
    clipId: 'listening',
    durationSeconds: 3.5,
    loop: true,
    purpose: 'attentive listening proof',
  }),
  Object.freeze({
    clipId: 'talk-neutral',
    durationSeconds: 3.5,
    loop: true,
    purpose: 'neutral body-speech cadence proof without production viseme claims',
  }),
  Object.freeze({
    clipId: 'run-loop',
    durationSeconds: 1.2,
    loop: true,
    purpose: 'locomotion and centre-of-mass proof; not a required Council chat state',
  }),
]);

const CHARACTERS = Object.freeze([
  Object.freeze({
    seatId: 'architect',
    seatLabel: 'Architect',
    characterId: 'top-hat-man',
    displayName: 'Top Hat Man',
    proceduralCodename: null,
    canonicalSeat: true,
    previewOnly: false,
    identityStatus: 'existing-reviewed-identity',
    direction: Object.freeze([
      'preserve the established Top Hat Man identity rather than redesigning him',
      'keep the top hat, moustache, cane and long tailored silhouette registered',
      'use restrained coat, hat and cane follow-through rather than synthetic whole-body wobble',
    ]),
  }),
  Object.freeze({
    seatId: 'researcher',
    seatLabel: 'Researcher',
    characterId: 'eva-female',
    displayName: 'EVA',
    proceduralCodename: null,
    canonicalSeat: true,
    previewOnly: false,
    identityStatus: 'existing-reviewed-identity',
    direction: Object.freeze([
      'preserve EVA’s established face, sculptural black dress and restrained EVAVO palette',
      'prove articulated limbs, head stabilisation and delayed dress-panel motion',
      'include a real opposing-limb run cycle as a mechanics test without implying website activation',
    ]),
  }),
  Object.freeze({
    seatId: 'critic',
    seatLabel: 'Critic',
    characterId: 'council-critic',
    displayName: 'Veyra',
    proceduralCodename: 'veyra',
    canonicalSeat: true,
    previewOnly: false,
    identityStatus: 'identity-master-required',
    direction: Object.freeze([
      'original four-eyed tribunal elder with a tall narrow cranial sail',
      'bone-white skin, black mineral garments and one faded Council-red construction detail',
      'precise and formidable without villain coding, weapons, armour, glow or protected-character imitation',
      'cranial sail follows head motion with restrained delayed secondary movement',
    ]),
  }),
  Object.freeze({
    seatId: 'open-reviewer',
    seatLabel: 'Open Reviewer',
    characterId: 'council-open-reviewer',
    displayName: 'Moro Pell',
    proceduralCodename: 'moro-pell',
    canonicalSeat: true,
    previewOnly: false,
    identityStatus: 'identity-master-required',
    direction: Object.freeze([
      'original broad amphibious scholar elder with three eyes and an articulated throat membrane',
      'moss-grey skin, worn ivory work layers and one repaired cherry-red seam',
      'open, practical and independent rather than polished-corporate, cute mascot or generic AI assistant',
      'heavy grounded centre of mass, stable oversized hands and restrained membrane articulation',
    ]),
  }),
  Object.freeze({
    seatId: null,
    seatLabel: 'Guest Arbiter preview',
    characterId: 'nymm-guest-arbiter',
    displayName: 'Nymm',
    proceduralCodename: 'nymm',
    canonicalSeat: false,
    previewOnly: true,
    identityStatus: 'non-roster-previsualisation-only',
    direction: Object.freeze([
      'original long-necked lateral-eyed elder with a living crown fan',
      'small body, oversized ceremonial sleeves and one cherry-red glove',
      'preview-only silhouette exploration with no Council seat, identity approval or Runtime eligibility',
    ]),
  }),
]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Json(value) {
  return sha256Bytes(JSON.stringify(canonical(value)));
}

function sourceEvidence(relativePath) {
  const absolute = path.resolve(ROOT, relativePath);
  const relative = path.relative(ROOT, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('COUNCIL_AVATAR_PROCEDURAL_REVIEW_SOURCE_PATH_ESCAPE');
  }
  const metadata = lstatSync(absolute, { throwIfNoEntry: false });
  if (
    !metadata?.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.nlink !== 1 ||
    realpathSync(absolute) !== absolute
  ) {
    throw new Error(
      `COUNCIL_AVATAR_PROCEDURAL_REVIEW_SOURCE_UNSAFE:${relativePath}`,
    );
  }
  const bytes = readFileSync(absolute);
  return Object.freeze({
    path: relativePath,
    bytes: bytes.byteLength,
    sha256: sha256Bytes(bytes),
  });
}

function hasExactDeniedAuthority(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return (
    keys.length === AUTHORITY_KEYS.length &&
    keys.every(
      (key, index) => key === AUTHORITY_KEYS[index] && value[key] === false,
    )
  );
}

function assertNoEscalation(value, location = 'artifact') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertNoEscalation(entry, `${location}[${index}]`),
    );
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (child === true && FORBIDDEN_TRUE_KEYS.has(key)) {
      throw new Error(
        `COUNCIL_AVATAR_PROCEDURAL_REVIEW_ARTIFACT_ESCALATION:${location}.${key}`,
      );
    }
    assertNoEscalation(child, `${location}.${key}`);
  }
}

export function compileCouncilAvatarProceduralReview() {
  const sourceFiles = Object.freeze(SOURCE_PATHS.map(sourceEvidence));
  const canonicalCharacters = CHARACTERS.filter((character) => character.canonicalSeat);
  const previewOnlyCharacters = CHARACTERS.filter((character) => character.previewOnly);
  const review = Object.freeze({
    schema: COUNCIL_AVATAR_PROCEDURAL_REVIEW_SCHEMA,
    version: '4.3.0',
    status: 'procedural-previsualisation-review-only',
    purpose:
      'Prove character silhouette, articulated motion, loop cadence, alpha rendering and atlas transport before any new Council identity is approved.',
    sourceFiles,
    renderer: Object.freeze({
      language: 'python',
      minimumPython: '3.11',
      dependency: 'Pillow',
      ffmpegRequiredForReviewVideo: true,
      externalImageGenerationUsed: false,
      deterministicCodeAuthoredGeometry: true,
      masterCanvas: Object.freeze({
        width: 1024,
        height: 1536,
        pixelFormat: 'rgba8-straight',
      }),
      reviewVideo: Object.freeze({
        width: 512,
        height: 768,
        fps: 60,
        codec: 'h264',
        pixelFormat: 'yuv420p',
      }),
    }),
    atlas: Object.freeze({
      compilerPath:
        'scripts/project-art/compile-council-avatar-review-atlases.py',
      frameCanvas: Object.freeze({ width: 256, height: 384 }),
      fps: 30,
      pageSize: Object.freeze({ width: 2048, height: 2048 }),
      padding: 4,
      rotationAllowed: false,
      stableBottomCentrePivotRequired: true,
      trimmedPixelHashRoundTripRequired: true,
      productionAtlasClaimAllowed: false,
    }),
    canonicalSeatCount: canonicalCharacters.length,
    characterCount: CHARACTERS.length,
    previewOnlyCharacterCount: previewOnlyCharacters.length,
    characters: CHARACTERS,
    clips: CLIPS,
    totalReviewClipCount: CHARACTERS.length * CLIPS.length,
    reviewRules: Object.freeze({
      normalSpeedReviewRequired: true,
      repeatedLoopReviewRequired: true,
      slowMotionReviewRequired: true,
      fullResolutionAlphaPosterReviewRequired: true,
      contactSheetMayApproveCharacter: false,
      proceduralShapeMayBecomeIdentityMasterAutomatically: false,
      proceduralReviewMayApproveIdentity: false,
      proceduralReviewMayApproveAnimation: false,
      proceduralReviewMaySatisfyProductionMediaReadiness: false,
      proceduralReviewMayActivateRuntime: false,
      proceduralReviewMayActivateWebsite: false,
      nymmMayOccupyCanonicalCouncilSeat: false,
    }),
    commands: Object.freeze({
      selfTest: Object.freeze([
        'python3',
        'scripts/project-art/council-avatar-procedural-renderer.py',
        '--self-test',
      ]),
      renderReview: Object.freeze([
        'python3',
        'scripts/project-art/council-avatar-procedural-renderer.py',
        '--output',
        '<create-only-output-directory>',
      ]),
      compileAtlases: Object.freeze([
        'python3',
        'scripts/project-art/compile-council-avatar-review-atlases.py',
        '--renderer',
        'scripts/project-art/council-avatar-procedural-renderer.py',
        '--output',
        '<create-only-atlas-directory>',
      ]),
    }),
    authority: AUTHORITY,
  });
  return Object.freeze({ ...review, reviewSha256: sha256Json(review) });
}

export function councilAvatarProceduralReviewCapabilities() {
  const review = compileCouncilAvatarProceduralReview();
  return Object.freeze({
    schema: COUNCIL_AVATAR_PROCEDURAL_REVIEW_CAPABILITIES_SCHEMA,
    version: review.version,
    canonicalSeatCount: review.canonicalSeatCount,
    characterCount: review.characterCount,
    previewOnlyCharacterCount: review.previewOnlyCharacterCount,
    clipCountPerCharacter: review.clips.length,
    totalReviewClipCount: review.totalReviewClipCount,
    sourceFiles: review.sourceFiles,
    externalImageGenerationUsed: false,
    deterministicCodeAuthoredGeometry: true,
    providerExecution: false,
    identityApproval: false,
    productionAdmission: false,
    runtimeActivation: false,
    websiteActivation: false,
  });
}

export function validateCouncilAvatarProceduralReviewArtifact(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('COUNCIL_AVATAR_PROCEDURAL_REVIEW_ARTIFACT_INVALID');
  }
  assertNoEscalation(value);
  if (value.schema !== COUNCIL_AVATAR_PROCEDURAL_REVIEW_ARTIFACT_SCHEMA) {
    throw new Error('COUNCIL_AVATAR_PROCEDURAL_REVIEW_ARTIFACT_SCHEMA_INVALID');
  }
  if (
    value.status !== 'procedural-previsualisation-review-only' ||
    value.renderer !==
      'scripts/project-art/council-avatar-procedural-renderer.py' ||
    value.masterCanvas?.width !== 1024 ||
    value.masterCanvas?.height !== 1536 ||
    value.videoCanvas?.width !== 512 ||
    value.videoCanvas?.height !== 768 ||
    value.fps !== 60 ||
    value.externalImageGenerationUsed !== false ||
    value.identityMasterCandidate !== false
  ) {
    throw new Error('COUNCIL_AVATAR_PROCEDURAL_REVIEW_ARTIFACT_BOUNDARY_INVALID');
  }
  const expected = compileCouncilAvatarProceduralReview();
  if (!Array.isArray(value.characters) || value.characters.length !== expected.characterCount) {
    throw new Error('COUNCIL_AVATAR_PROCEDURAL_REVIEW_ARTIFACT_CHARACTER_COUNT_INVALID');
  }
  for (let characterIndex = 0; characterIndex < expected.characters.length; characterIndex += 1) {
    const actualCharacter = value.characters[characterIndex];
    const expectedCharacter = expected.characters[characterIndex];
    if (
      !actualCharacter ||
      typeof actualCharacter !== 'object' ||
      Array.isArray(actualCharacter) ||
      actualCharacter.characterId !== expectedCharacter.characterId ||
      actualCharacter.displayName !== expectedCharacter.displayName ||
      actualCharacter.seatId !== expectedCharacter.seatId ||
      actualCharacter.canonicalSeat !== expectedCharacter.canonicalSeat ||
      actualCharacter.previewOnly !== expectedCharacter.previewOnly
    ) {
      throw new Error(
        'COUNCIL_AVATAR_PROCEDURAL_REVIEW_ARTIFACT_CHARACTER_BOUNDARY_INVALID',
      );
    }
    if (
      !Array.isArray(actualCharacter.clips) ||
      actualCharacter.clips.length !== expected.clips.length
    ) {
      throw new Error(
        'COUNCIL_AVATAR_PROCEDURAL_REVIEW_ARTIFACT_CLIP_COUNT_INVALID',
      );
    }
    for (let clipIndex = 0; clipIndex < expected.clips.length; clipIndex += 1) {
      const actualClip = actualCharacter.clips[clipIndex];
      const expectedClip = expected.clips[clipIndex];
      const expectedFrameCount = Math.round(expectedClip.durationSeconds * 60);
      if (
        !actualClip ||
        typeof actualClip !== 'object' ||
        Array.isArray(actualClip) ||
        actualClip.clipId !== expectedClip.clipId ||
        actualClip.purpose !== expectedClip.purpose ||
        actualClip.durationSeconds !== expectedClip.durationSeconds ||
        actualClip.fps !== 60 ||
        actualClip.frameCount !== expectedFrameCount ||
        actualClip.loop !== true ||
        actualClip.video !== `${expectedClip.clipId}.mp4` ||
        actualClip.poster !== `${expectedClip.clipId}.poster.png` ||
        actualClip.contactSheet !== `${expectedClip.clipId}.contact.png` ||
        !Number.isInteger(actualClip.uniqueFrameCount) ||
        actualClip.uniqueFrameCount < 1 ||
        actualClip.uniqueFrameCount > expectedFrameCount ||
        !Number.isInteger(actualClip.duplicateFrameCount) ||
        actualClip.duplicateFrameCount !==
          expectedFrameCount - actualClip.uniqueFrameCount ||
        !Number.isFinite(actualClip.normalisedSeamEnergy) ||
        actualClip.normalisedSeamEnergy < 0 ||
        actualClip.normalisedSeamEnergy > 1 ||
        typeof actualClip.sha256 !== 'string' ||
        !SHA256.test(actualClip.sha256)
      ) {
        throw new Error(
          'COUNCIL_AVATAR_PROCEDURAL_REVIEW_ARTIFACT_CLIP_BOUNDARY_INVALID',
        );
      }
    }
  }
  if (!hasExactDeniedAuthority(value.authority)) {
    throw new Error('COUNCIL_AVATAR_PROCEDURAL_REVIEW_ARTIFACT_AUTHORITY_INVALID');
  }
  if (typeof value.manifestSha256 !== 'string' || !SHA256.test(value.manifestSha256)) {
    throw new Error('COUNCIL_AVATAR_PROCEDURAL_REVIEW_ARTIFACT_HASH_INVALID');
  }
  return Object.freeze({
    valid: true,
    schema: value.schema,
    characterCount: value.characters.length,
    manifestHashSyntaxValidated: true,
    manifestHashRecomputed: false,
    providerExecution: false,
    identityApproval: false,
    productionAdmission: false,
    runtimeActivation: false,
    websiteActivation: false,
  });
}
