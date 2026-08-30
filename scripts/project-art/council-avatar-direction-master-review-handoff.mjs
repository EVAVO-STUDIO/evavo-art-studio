import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import path from 'node:path';

import { LocalArtifactStore } from '../../packages/artifacts/dist/index.js';
import { compileProjectArtReview } from './review-studio.mjs';
import { validateCouncilAvatarIdentityLockApproval } from './council-avatar-identity-lock-approval.mjs';
import { compileCouncilAvatarDirectionMasterRuntimePackage } from './council-avatar-direction-master-runtime.mjs';
import { COUNCIL_AVATAR_DIRECTION_MASTER_EXECUTION_RESULT_SCHEMA } from './council-avatar-direction-master-executor.mjs';

export const COUNCIL_AVATAR_DIRECTION_MASTER_REVIEW_HANDOFF_SCHEMA =
  'evavo.project-art-council-avatar-direction-master-review-handoff.v1';

const REQUIRED_GATES = Object.freeze([
  'technical',
  'styleConsistency',
  'identityContinuity',
  'composition',
  'runtimeReadiness',
]);
const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/u;

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

async function writeCreateOnly(filePath, bytes) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const handle = await open(filePath, 'wx', 0o600);
  try {
    await handle.writeFile(bytes);
  } finally {
    await handle.close();
  }
}

async function writeJsonCreateOnly(filePath, value) {
  await writeCreateOnly(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function expectedKey(characterId, viewId) {
  return `${characterId}:${viewId}`;
}

function validateCompleteExecution(execution, runtimePackage) {
  if (
    !execution ||
    execution.schema !== COUNCIL_AVATAR_DIRECTION_MASTER_EXECUTION_RESULT_SCHEMA ||
    execution.runtimePackageSha256 !== runtimePackage.runtimePackageSha256 ||
    execution.identityApprovalSha256 !== runtimePackage.identityApprovalSha256 ||
    execution.directionMasterPlanSha256 !== runtimePackage.directionMasterPlanSha256 ||
    execution.selectedCharacterId !== null ||
    execution.selectedViewId !== null ||
    execution.submittedJobCount !== runtimePackage.jobs.length ||
    execution.maximumAttemptsPerJob !== 1 ||
    execution.fallbackAllowed !== false ||
    execution.directionMasterApprovalEstablished !== false ||
    execution.candidatePromotionEstablished !== false ||
    execution.runtimeActivationAllowed !== false ||
    execution.websiteActivationAllowed !== false ||
    execution.independentVisualReviewRequired !== true
  ) {
    throw new Error('Council direction execution result is not complete-review eligible');
  }
  const expected = new Set(runtimePackage.jobs.map((job) => expectedKey(job.characterId, job.viewId)));
  const completed = new Set();
  for (const job of execution.jobs ?? []) {
    const key = expectedKey(job.characterId, job.viewId);
    if (!expected.has(key) || completed.has(key) || job.state !== 'succeeded' || job.attempts !== 1) {
      throw new Error(`Council direction execution job set is incomplete or invalid: ${key}`);
    }
    completed.add(key);
  }
  if (completed.size !== expected.size) {
    throw new Error('Council direction execution did not complete every required view');
  }
  return expected;
}

function passedMasterOutputs(execution, expected) {
  const assurance = execution.technicalAssurance;
  if (!assurance || assurance.failed !== 0 || !Array.isArray(assurance.jobs)) {
    throw new Error('Council direction technical assurance is incomplete');
  }
  const byView = new Map();
  for (const job of assurance.jobs) {
    const key = expectedKey(job.characterId, job.viewId);
    if (!expected.has(key) || job.state !== 'succeeded' || job.attempts !== 1) continue;
    for (const output of job.outputs ?? []) {
      if (
        output?.artifactRole === 'provider-candidate-alpha-master' &&
        output.approvalState === 'unapproved' &&
        output.qualityState === 'passed' &&
        typeof output.artifactId === 'string' &&
        ARTIFACT_ID.test(output.artifactId)
      ) {
        const values = byView.get(key) ?? [];
        values.push(Object.freeze({
          characterId: job.characterId,
          viewId: job.viewId,
          sourceCandidateArtifactId: job.sourceCandidateArtifactId,
          artifactId: output.artifactId,
        }));
        byView.set(key, values);
      }
    }
  }
  for (const key of expected) {
    const values = byView.get(key) ?? [];
    if (values.length < 2) {
      throw new Error(`Council direction review requires at least two technically-passed candidates for ${key}`);
    }
  }
  return byView;
}

async function materializeCandidate(store, candidate, workspaceRoot, index) {
  const [descriptor, verification] = await Promise.all([
    store.get(candidate.artifactId),
    store.verify(candidate.artifactId),
  ]);
  if (
    !descriptor ||
    !verification.exists ||
    !verification.descriptorValid ||
    !verification.contentValid ||
    descriptor.mediaType !== 'image/png' ||
    descriptor.storageClass !== 'intermediate' ||
    descriptor.labels.artifactRole !== 'provider-candidate-alpha-master' ||
    descriptor.labels.approvalState !== 'unapproved' ||
    descriptor.labels.qualityState !== 'passed'
  ) {
    throw new Error(`Council direction review candidate failed integrity/state validation: ${candidate.artifactId}`);
  }
  const bytes = await store.read(candidate.artifactId);
  const relativePath = `candidates/${candidate.characterId}/${candidate.viewId}/${String(index + 1).padStart(2, '0')}-${candidate.artifactId}.png`;
  await writeCreateOnly(path.join(workspaceRoot, ...relativePath.split('/')), bytes);
  return Object.freeze({
    ...candidate,
    relativePath,
    descriptorSha256: descriptor.descriptorSha256,
    contentSha256: descriptor.contentSha256,
    sizeBytes: descriptor.sizeBytes,
  });
}

function viewLabel(viewId) {
  if (viewId === 'full-body-right') return 'slight right three-quarter';
  if (viewId === 'full-body-left') return 'slight left three-quarter';
  if (viewId === 'neutral-bust') return 'neutral identity bust';
  return viewId;
}

function buildReviewRequest(materialized, approval, runtimePackage) {
  const groups = [];
  for (const characterId of runtimePackage.approvedCharacterIds) {
    const characterItems = materialized.filter((entry) => entry.characterId === characterId);
    const expectedViews = runtimePackage.jobs
      .filter((job) => job.characterId === characterId)
      .map((job) => job.viewId);
    groups.push(Object.freeze({
      id: `${characterId}-direction-master-candidates`,
      kind: 'candidate-set',
      title: `${characterId} direction-master candidates`,
      description: [
        'Select exactly one candidate for each required direction view while preserving the already-approved identity lock.',
        'Compare anatomy, proportions, facial structure, material language, silhouette and character-specific details across all views.',
        'Reject redesigns, generic AI styling, anatomy drift, view-to-view identity changes, cropped anatomy, fake transparency or animation-hostile geometry.',
        `Required views: ${expectedViews.join(', ')}.`,
      ].join(' '),
      requiredGates: REQUIRED_GATES,
      items: Object.freeze(characterItems.map((candidate, index) => Object.freeze({
        id: `${candidate.characterId}-${candidate.viewId}-candidate-${String(index + 1).padStart(2, '0')}`,
        role: 'candidate',
        label: `${viewLabel(candidate.viewId)} · candidate ${index + 1}`,
        notes: `Direction view ${candidate.viewId}. Approved identity lock ${approval.approvalSha256}. Source provider candidate ${candidate.sourceCandidateArtifactId}. Mastered artifact ${candidate.artifactId}.`,
        source: candidate.relativePath,
        expectedSha256: candidate.contentSha256,
      }))),
    }));
  }
  return Object.freeze({
    schema: 'evavo.project-art-review-request.v1',
    reviewId: `council-avatar-direction-${runtimePackage.directionMasterPlanSha256.slice(0, 20)}`,
    projectId: 'evavo-council-avatars',
    title: 'EVAVO Council direction-master review',
    purpose: 'Select continuity-safe direction masters for every required Veyra and Moro Pell view. Technical success does not authorize direction-master approval, animation production, candidate promotion, runtime activation, website activation, publication or deployment.',
    ui: Object.freeze({
      defaultBackground: 'checker',
      defaultFit: 'contain',
      defaultMode: 'grid',
      showPixelGrid: false,
      allowLinearSampling: true,
    }),
    groups: Object.freeze(groups),
  });
}

export async function compileCouncilAvatarDirectionMasterReviewHandoff({
  executionResultPath,
  identityApprovalPath,
  artifactRoot,
  workspaceRoot,
  compiledAt = new Date().toISOString(),
} = {}) {
  const [execution, approvalRecord] = await Promise.all([
    readFile(path.resolve(executionResultPath), 'utf8').then(JSON.parse),
    readFile(path.resolve(identityApprovalPath), 'utf8').then(JSON.parse),
  ]);
  const approval = validateCouncilAvatarIdentityLockApproval(approvalRecord);
  const runtimePackage = compileCouncilAvatarDirectionMasterRuntimePackage({
    identityLockApproval: approval,
    candidateCount: execution.adapter?.id ? execution.technicalAssurance?.jobs?.length > 0 ? undefined : undefined : undefined,
  });
  if (execution.runtimePackageSha256 !== runtimePackage.runtimePackageSha256) {
    const candidateCounts = new Set((execution.jobs ?? []).map(() => null));
    void candidateCounts;
    throw new Error('Council direction review runtime package must be reproduced from the exact execution settings');
  }
  const expected = validateCompleteExecution(execution, runtimePackage);
  const passed = passedMasterOutputs(execution, expected);
  const resolvedWorkspace = path.resolve(workspaceRoot);
  await mkdir(resolvedWorkspace, { recursive: false, mode: 0o700 });
  const store = new LocalArtifactStore({ root: path.resolve(artifactRoot) });
  const materialized = [];
  for (const job of runtimePackage.jobs) {
    const key = expectedKey(job.characterId, job.viewId);
    for (const [index, candidate] of (passed.get(key) ?? []).entries()) {
      materialized.push(await materializeCandidate(store, candidate, resolvedWorkspace, index));
    }
  }
  const request = buildReviewRequest(materialized, approval, runtimePackage);
  const requestPath = path.join(resolvedWorkspace, 'review-request.json');
  await writeJsonCreateOnly(requestPath, request);
  const plan = await compileProjectArtReview(request, {
    workspaceRoot: resolvedWorkspace,
    compiledAt,
  });
  const planPath = path.join(resolvedWorkspace, 'review-plan.json');
  await writeJsonCreateOnly(planPath, plan);
  const body = Object.freeze({
    schema: COUNCIL_AVATAR_DIRECTION_MASTER_REVIEW_HANDOFF_SCHEMA,
    authorizationSha256: execution.authorizationSha256,
    identityApprovalSha256: approval.approvalSha256,
    directionMasterPlanSha256: runtimePackage.directionMasterPlanSha256,
    runtimePackageSha256: runtimePackage.runtimePackageSha256,
    reviewId: plan.reviewId,
    planSha256: plan.planSha256,
    requestPath,
    planPath,
    workspaceRoot: resolvedWorkspace,
    characterIds: runtimePackage.approvedCharacterIds,
    requiredViews: Object.freeze(runtimePackage.jobs.map((job) => Object.freeze({ characterId: job.characterId, viewId: job.viewId }))),
    candidateCount: materialized.length,
    requiredGates: REQUIRED_GATES,
    technicalAssuranceRequired: true,
    independentVisualReviewRequired: true,
    directionMasterApprovalPerformed: false,
    candidatePromotionPerformed: false,
    runtimeActivationPerformed: false,
    websiteActivationPerformed: false,
    providerExecutionPerformedByHandoff: false,
    materialized: Object.freeze(materialized),
    nextActions: Object.freeze([
      'Build the normal offline Project Art review bundle from review-plan.json.',
      'Complete every required gate for every direction candidate and compare all three views against the approved identity lock.',
      'Keep exactly one fully-passed candidate per required character/view and reject or repair the rest.',
      'Finalize the review through the standard Project Art review receipt path.',
      'Create a separate direction-master approval record; this handoff grants no approval or promotion.',
    ]),
  });
  return Object.freeze({ ...body, handoffSha256: sha256(body) });
}
