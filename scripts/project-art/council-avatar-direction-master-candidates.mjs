import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCouncilAvatarIdentityLockApproval } from './council-avatar-identity-lock-approval.mjs';

export const COUNCIL_AVATAR_DIRECTION_MASTER_PLAN_SCHEMA =
  'evavo.project-art-council-avatar-direction-master-plan.v1';
export const COUNCIL_AVATAR_DIRECTION_MASTER_REQUEST_SCHEMA =
  'evavo.project-art-council-avatar-direction-master-request.v1';

const DEFAULT_ADAPTER_ID = 'openai-gpt-image';
const DEFAULT_MODEL = 'gpt-image-2';
const DEFAULT_CANDIDATE_COUNT = 2;
const MAXIMUM_CANDIDATE_COUNT = 4;
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_ROOT = path.resolve(MODULE_DIR, '../../config/council-avatar-identities');

const AUTHORITY = Object.freeze({
  providerExecution: false,
  candidateApproval: false,
  candidatePromotion: false,
  identityLockMutation: false,
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

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function sha256(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function boundedCandidateCount(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAXIMUM_CANDIDATE_COUNT) {
    throw new Error(`candidateCount must be an integer between 1 and ${MAXIMUM_CANDIDATE_COUNT}`);
  }
  return value;
}

function providerIdentifier(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function identityRequest(characterId) {
  const fileName = `${characterId}.identity-request.json`;
  const filePath = path.join(CONFIG_ROOT, fileName);
  const request = JSON.parse(readFileSync(filePath, 'utf8'));
  if (
    request?.schema !== 'evavo.character-identity-master-request.v1' ||
    request.character?.id !== characterId ||
    !Array.isArray(request.views) ||
    request.views.length < 2 ||
    request.policy?.providerAuthorizationRequired !== true ||
    request.policy?.reviewRequired !== true
  ) {
    throw new Error(`Council identity request contract drift: ${characterId}`);
  }
  return Object.freeze(request);
}

function directionRequest(lock, identity, view, options, approval) {
  const request = Object.freeze({
    schemaVersion: '1.0',
    operation: 'generate',
    assetKind: 'illustration',
    continuityPhase: 'direction-master',
    assetId: `council-avatar:${lock.characterId}:direction-master:${view.id}`,
    candidateFamilyId: `council-avatar:${lock.characterId}:direction-master:${view.id}`,
    creativeIntent: [
      identity.style.lock,
      identity.style.continuity,
      view.prompt,
      'This is a direction master derived from the approved canonical identity. Preserve the exact same individual rather than redesigning the character.',
    ].join(' '),
    negativeIntent: identity.style.mustAvoid.join('. '),
    style: Object.freeze({
      styleName: 'EVAVO Council approved-identity direction master',
      intent: 'Extend one approved immutable Council identity into a continuity-locked production view without redesigning anatomy, materials, proportions or character language.',
      mustHave: Object.freeze([...identity.style.mustHave]),
      mustAvoid: Object.freeze([...identity.style.mustAvoid]),
      identityLocks: Object.freeze([
        identity.style.continuity,
        `approved identity content SHA-256 ${lock.masteredContentSha256}`,
        `approved identity descriptor SHA-256 ${lock.masteredDescriptorSha256}`,
      ]),
      palette: Object.freeze(['preserve the approved identity palette exactly']),
      lineTreatment: Object.freeze(['preserve approved authored edge/material treatment', 'no synthetic detail drift']),
      materials: Object.freeze(['preserve approved garment and creature material construction exactly']),
      cameraRules: Object.freeze(['eye level', 'no dramatic perspective', 'no fisheye or wide-angle distortion']),
      compositionRules: Object.freeze(['one character only', 'complete intended anatomy readable', 'safe transparent clearance', 'no scenery or shadow plate']),
      eraRules: Object.freeze([]),
    }),
    shot: Object.freeze({
      subject: `${identity.character.label}; exact same approved individual`,
      action: 'neutral direction-master continuity pose',
      direction: view.label,
      include: Object.freeze([...identity.style.mustHave, view.prompt]),
      exclude: Object.freeze([...identity.style.mustAvoid]),
      separateAssets: Object.freeze([]),
      framing: Object.freeze([
        view.id === 'neutral-bust' ? 'chest-up identity continuity framing' : 'complete full-body framing',
        `${identity.canvas.width}x${identity.canvas.height} transparent canvas`,
        'no cropped anatomy required by the view',
      ]),
    }),
    target: Object.freeze({
      width: identity.canvas.width,
      height: identity.canvas.height,
      transparency: 'required',
      outputFormat: 'png',
    }),
    background: Object.freeze({ strategy: 'provider-auto' }),
    quality: 'high',
    candidateCount: options.candidateCount,
    references: Object.freeze([
      Object.freeze({
        artifactId: lock.masteredArtifactId,
        role: 'canonical-identity',
        strength: 1,
        required: true,
        note: `Approved identity lock ${approval.approvalSha256}; exact character ${lock.characterId}.`,
      }),
    ]),
    selection: Object.freeze({
      preferredAdapterId: options.preferredAdapterId,
      preferredModel: options.preferredModel,
      allowedAdapterIds: Object.freeze([options.preferredAdapterId]),
      allowFallback: false,
      requireSeed: false,
    }),
    metadata: Object.freeze({
      schema: COUNCIL_AVATAR_DIRECTION_MASTER_REQUEST_SCHEMA,
      characterId: lock.characterId,
      viewId: view.id,
      identityApprovalSha256: approval.approvalSha256,
      identityReviewItemId: lock.reviewItemId,
      identityMasteredArtifactId: lock.masteredArtifactId,
      identityMasteredContentSha256: lock.masteredContentSha256,
      providerExecutionAuthorized: false,
      directionMasterApprovalEstablished: false,
      candidatePromotionEstablished: false,
      runtimeActivationEstablished: false,
      websiteActivationEstablished: false,
    }),
  });
  return Object.freeze({
    characterId: lock.characterId,
    characterLabel: identity.character.label,
    viewId: view.id,
    viewLabel: view.label,
    identityMasteredArtifactId: lock.masteredArtifactId,
    identityMasteredContentSha256: lock.masteredContentSha256,
    request,
    requestSha256: sha256(request),
    expectedCandidateCount: options.candidateCount,
    candidateApprovalEstablished: false,
    candidatePromotionEstablished: false,
    runtimeActivationAllowed: false,
    websiteActivationAllowed: false,
    authority: AUTHORITY,
  });
}

export function compileCouncilAvatarDirectionMasterPlan({
  identityLockApproval,
  candidateCount = DEFAULT_CANDIDATE_COUNT,
  preferredAdapterId = DEFAULT_ADAPTER_ID,
  preferredModel = DEFAULT_MODEL,
} = {}) {
  const approval = validateCouncilAvatarIdentityLockApproval(identityLockApproval);
  const options = Object.freeze({
    candidateCount: boundedCandidateCount(candidateCount),
    preferredAdapterId: providerIdentifier(preferredAdapterId, 'preferredAdapterId'),
    preferredModel: providerIdentifier(preferredModel, 'preferredModel'),
  });
  const jobs = [];
  for (const lock of approval.locks) {
    const identity = identityRequest(lock.characterId);
    for (const view of identity.views) {
      jobs.push(directionRequest(lock, identity, view, options, approval));
    }
  }
  if (!jobs.length) throw new Error('Council direction-master plan requires at least one approved identity lock');
  const body = Object.freeze({
    schema: COUNCIL_AVATAR_DIRECTION_MASTER_PLAN_SCHEMA,
    identityApprovalSha256: approval.approvalSha256,
    approvedCharacterIds: Object.freeze(approval.locks.map((lock) => lock.characterId)),
    providerProtocolTarget: 'packages/providers',
    preferredAdapterId: options.preferredAdapterId,
    preferredModel: options.preferredModel,
    candidateCountPerView: options.candidateCount,
    viewCount: jobs.length,
    maximumCandidateOutputs: jobs.length * options.candidateCount,
    jobs: Object.freeze(jobs),
    reviewPolicy: Object.freeze({
      canonicalIdentityReferenceRequired: true,
      referenceStrength: 1,
      crossViewIdentityContinuityRequired: true,
      exactAnatomyRegistrationRequired: true,
      materialContinuityRequired: true,
      silhouetteContinuityRequired: true,
      independentVisualReviewRequired: true,
      directionMasterGenerationMayApproveDirection: false,
      providerSuccessMayPromoteRuntime: false,
    }),
    nextActions: Object.freeze([
      'Compile each request through the canonical @evavo/art-providers contract and verify the canonical-identity reference capability before any provider execution.',
      'Use the same artifact store containing the approved mastered identity artifact or materialize that exact artifact with verified content/descriptor hashes before execution.',
      'Create a separate bounded provider execution authorization; this plan grants none.',
      'Technically master every result and compare all views against the approved identity master.',
      'Approve one direction master per required view only after independent continuity review.',
      'Do not author or promote production animation until direction-master approval is complete.',
    ]),
    providerExecution: false,
    directionMasterApproval: false,
    candidatePromotion: false,
    runtimeActivationAllowed: false,
    websiteActivationAllowed: false,
    authority: AUTHORITY,
  });
  return Object.freeze({ ...body, planSha256: sha256(body) });
}

export function councilAvatarDirectionMasterCapabilities() {
  return Object.freeze({
    schema: 'evavo.project-art-council-avatar-direction-master-capabilities.v1',
    defaultCandidateCountPerView: DEFAULT_CANDIDATE_COUNT,
    maximumCandidateCountPerView: MAXIMUM_CANDIDATE_COUNT,
    preferredAdapterId: DEFAULT_ADAPTER_ID,
    preferredModel: DEFAULT_MODEL,
    canonicalIdentityReferenceRequired: true,
    providerExecutionAuthorized: false,
    directionMasterApprovalEstablished: false,
    candidatePromotionEstablished: false,
    runtimeActivationAllowed: false,
    websiteActivationAllowed: false,
  });
}
