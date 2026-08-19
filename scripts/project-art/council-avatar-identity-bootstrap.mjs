import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileIdentityMasterPlan } from '../character-identity-master-plan.mjs';
import { compileIdentityBootstrapAdmission } from '../character-identity-bootstrap-admission.mjs';

export const COUNCIL_AVATAR_IDENTITY_BOOTSTRAP_SCHEMA =
  'evavo.project-art-council-avatar-identity-bootstrap.v1';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REQUEST_PATHS = Object.freeze([
  'config/council-avatar-identities/council-critic.identity-request.json',
  'config/council-avatar-identities/council-open-reviewer.identity-request.json',
]);

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
};
const sha256 = (value) =>
  createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

function readRequest(relativePath) {
  const absolute = path.resolve(ROOT, relativePath);
  const relative = path.relative(ROOT, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('COUNCIL_AVATAR_IDENTITY_REQUEST_PATH_ESCAPE');
  }
  return JSON.parse(readFileSync(absolute, 'utf8'));
}

export function compileCouncilAvatarIdentityBootstrap() {
  const characters = REQUEST_PATHS.map((requestPath) => {
    const request = readRequest(requestPath);
    const identityMasterPlan = compileIdentityMasterPlan(request);
    const bootstrapAdmission = compileIdentityBootstrapAdmission(identityMasterPlan);
    if (
      identityMasterPlan.candidateSetCount !== 4 ||
      identityMasterPlan.viewCount !== 3 ||
      identityMasterPlan.totalJobs !== 12 ||
      bootstrapAdmission.requestCount !== 12
    ) {
      throw new Error('COUNCIL_AVATAR_IDENTITY_BOOTSTRAP_COVERAGE_DRIFT');
    }
    if (
      identityMasterPlan.authority.providerExecution !== false ||
      bootstrapAdmission.authority.providerExecution !== false ||
      bootstrapAdmission.authority.providerAuthorizationRequired !== true
    ) {
      throw new Error('COUNCIL_AVATAR_IDENTITY_BOOTSTRAP_AUTHORITY_DRIFT');
    }
    return Object.freeze({
      characterId: identityMasterPlan.character.id,
      requestPath,
      identityMasterPlan,
      bootstrapAdmission,
      candidateSetCount: identityMasterPlan.candidateSetCount,
      viewCount: identityMasterPlan.viewCount,
      providerGenerationJobCount: bootstrapAdmission.requestCount,
      candidateReviewRequired: true,
      identityApprovalRequiredAfterReview: true,
      animationMayBegin: false,
    });
  });

  const base = Object.freeze({
    schema: COUNCIL_AVATAR_IDENTITY_BOOTSTRAP_SCHEMA,
    project: 'council-avatars',
    characterCount: characters.length,
    characterIds: Object.freeze(characters.map((character) => character.characterId)),
    candidateSetsPerCharacter: 4,
    viewsPerCandidateSet: 3,
    providerGenerationJobsPerCharacter: 12,
    totalProviderGenerationJobs: characters.reduce(
      (sum, character) => sum + character.providerGenerationJobCount,
      0,
    ),
    characters: Object.freeze(characters),
    requiredReview: Object.freeze({
      candidateEvidenceKind: 'evavo-character-identity-candidate-evidence',
      planner: 'scripts/character-identity-candidate-review-plan.mjs',
      exactlyThreeEvidenceViewsPerSet: true,
      exactlyOneSelectedSetRequiredForCompletion: true,
      separateIdentityApprovalReceiptRequired: true,
      generationDoesNotApproveIdentity: true,
    }),
    nextGate:
      'select concrete provider runtime profiles, admit the exact 24 generation jobs, apply time-bounded provider authorization, generate candidate artifacts, then conduct identity candidate review before animation',
    authority: Object.freeze({
      requestCompilation: true,
      providerSelection: false,
      providerExecution: false,
      providerAuthorizationRequired: true,
      candidateApproval: false,
      identityApproval: false,
      animationFamily: false,
      promotion: false,
      publication: false,
      repositoryMutation: false,
      gitCommit: false,
      gitPush: false,
      runtimeActivation: false,
      forcePush: false,
    }),
  });
  return Object.freeze({ ...base, bootstrapSha256: sha256(base) });
}
