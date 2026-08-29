import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import path from 'node:path';

import { LocalArtifactStore } from '../../packages/artifacts/dist/index.js';
import { compileProjectArtReview } from './review-studio.mjs';
import { COUNCIL_AVATAR_PROVIDER_EXECUTION_RESULT_SCHEMA } from './council-avatar-provider-executor.mjs';

export const COUNCIL_AVATAR_REVIEW_HANDOFF_SCHEMA =
  'evavo.project-art-council-avatar-review-handoff.v1';

const REQUIRED_GATES = Object.freeze([
  'technical',
  'styleConsistency',
  'identityContinuity',
  'composition',
  'runtimeReadiness',
]);
const ALLOWED_CHARACTERS = new Set(['council-critic', 'council-open-reviewer']);
const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/u;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function sha256(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function safeCharacter(value) {
  if (typeof value !== 'string' || !ALLOWED_CHARACTERS.has(value)) {
    throw new Error(`unsupported Council avatar character: ${String(value)}`);
  }
  return value;
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

function passedMasterOutputs(execution) {
  if (
    !execution ||
    typeof execution !== 'object' ||
    execution.schema !== COUNCIL_AVATAR_PROVIDER_EXECUTION_RESULT_SCHEMA ||
    execution.candidateApprovalEstablished !== false ||
    execution.candidatePromotionEstablished !== false ||
    execution.runtimeActivationAllowed !== false ||
    execution.independentVisualReviewRequired !== true
  ) {
    throw new Error('Council avatar provider execution result is not review-handoff eligible');
  }
  const assuranceJobs = execution.technicalAssurance?.jobs;
  if (!Array.isArray(assuranceJobs)) {
    throw new Error('Council avatar execution result has no technical assurance jobs');
  }
  const result = [];
  for (const job of assuranceJobs) {
    const characterId = safeCharacter(job.characterId);
    if (job.state !== 'succeeded' || job.attempts !== 1) continue;
    for (const output of job.outputs ?? []) {
      if (
        output?.artifactRole === 'provider-candidate-alpha-master' &&
        output.approvalState === 'unapproved' &&
        output.qualityState === 'passed' &&
        typeof output.artifactId === 'string' &&
        ARTIFACT_ID.test(output.artifactId)
      ) {
        result.push(Object.freeze({
          characterId,
          sourceCandidateArtifactId: job.sourceCandidateArtifactId,
          artifactId: output.artifactId,
        }));
      }
    }
  }
  return Object.freeze(result);
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
    throw new Error(`Council review candidate artifact failed integrity/state validation: ${candidate.artifactId}`);
  }
  const bytes = await store.read(candidate.artifactId);
  const relativePath = `candidates/${candidate.characterId}/${String(index + 1).padStart(2, '0')}-${candidate.artifactId}.png`;
  await writeCreateOnly(path.join(workspaceRoot, ...relativePath.split('/')), bytes);
  return Object.freeze({
    ...candidate,
    relativePath,
    expectedSha256: descriptor.contentSha256,
    descriptorSha256: descriptor.descriptorSha256,
    contentSha256: descriptor.contentSha256,
    sizeBytes: descriptor.sizeBytes,
  });
}

function reviewNotes(characterId) {
  const name = characterId === 'council-critic' ? 'Veyra / Critic' : 'Moro Pell / Open Reviewer';
  return [
    `${name} identity-lock candidate.`,
    'Reject generic AI-assistant, startup mascot, glossy game-character, cyberpunk, robotic, or protected-character imitation cues.',
    'Check complete anatomy, stable intended eye/digit/appendage counts, clean silhouette, uncropped extremities, credible material logic and character-specific identity.',
    'Check that the design reads as a deliberate EVAVO Council character and can support a consistent multi-view animation system without hidden geometry or ambiguous anatomy.',
    'Technical pass is necessary but not identity approval. Record defects and required changes explicitly.',
  ].join(' ');
}

function buildReviewRequest(materialized, execution) {
  const byCharacter = new Map();
  for (const candidate of materialized) {
    const values = byCharacter.get(candidate.characterId) ?? [];
    values.push(candidate);
    byCharacter.set(candidate.characterId, values);
  }
  const groups = [];
  for (const characterId of ['council-critic', 'council-open-reviewer']) {
    const candidates = byCharacter.get(characterId) ?? [];
    if (candidates.length && candidates.length < 2) {
      throw new Error(`Council avatar review requires at least two technically-passed candidates for ${characterId}`);
    }
    if (!candidates.length) continue;
    groups.push(Object.freeze({
      id: `${characterId}-identity-candidates`,
      kind: 'candidate-set',
      title: characterId === 'council-critic'
        ? 'Veyra / Critic identity candidates'
        : 'Moro Pell / Open Reviewer identity candidates',
      description: reviewNotes(characterId),
      requiredGates: REQUIRED_GATES,
      items: Object.freeze(candidates.map((candidate, index) => Object.freeze({
        id: `${characterId}-candidate-${String(index + 1).padStart(2, '0')}`,
        role: 'candidate',
        label: `Candidate ${index + 1}`,
        notes: `${reviewNotes(characterId)} Source provider candidate: ${candidate.sourceCandidateArtifactId}. Mastered artifact: ${candidate.artifactId}.`,
        source: candidate.relativePath,
        expectedSha256: candidate.contentSha256,
      }))),
    }));
  }
  if (!groups.length) {
    throw new Error('No technically-passed Council avatar candidates are available for review');
  }
  return Object.freeze({
    schema: 'evavo.project-art-review-request.v1',
    reviewId: `council-avatar-identity-${execution.authorizationSha256.slice(0, 20)}`,
    projectId: 'evavo-council-avatars',
    title: 'EVAVO Council identity master review',
    purpose: 'Select or reject technically-passed identity-master candidates for Veyra and Moro Pell. Technical success does not authorize identity approval, candidate promotion, runtime activation, website activation, publication or deployment.',
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

export async function compileCouncilAvatarReviewHandoff({
  executionResultPath,
  artifactRoot,
  workspaceRoot,
  compiledAt = new Date().toISOString(),
} = {}) {
  const execution = JSON.parse(await readFile(path.resolve(executionResultPath), 'utf8'));
  const candidates = passedMasterOutputs(execution);
  const resolvedWorkspace = path.resolve(workspaceRoot);
  await mkdir(resolvedWorkspace, { recursive: false, mode: 0o700 });
  const store = new LocalArtifactStore({ root: path.resolve(artifactRoot) });
  const materialized = [];
  for (const [index, candidate] of candidates.entries()) {
    materialized.push(await materializeCandidate(store, candidate, resolvedWorkspace, index));
  }
  const request = buildReviewRequest(materialized, execution);
  const requestPath = path.join(resolvedWorkspace, 'review-request.json');
  await writeJsonCreateOnly(requestPath, request);
  const plan = await compileProjectArtReview(request, {
    workspaceRoot: resolvedWorkspace,
    compiledAt,
  });
  const planPath = path.join(resolvedWorkspace, 'review-plan.json');
  await writeJsonCreateOnly(planPath, plan);

  const body = Object.freeze({
    schema: COUNCIL_AVATAR_REVIEW_HANDOFF_SCHEMA,
    authorizationSha256: execution.authorizationSha256,
    runtimePackageSha256: execution.runtimePackageSha256,
    reviewId: plan.reviewId,
    planSha256: plan.planSha256,
    requestPath,
    planPath,
    workspaceRoot: resolvedWorkspace,
    characterIds: Object.freeze([...new Set(materialized.map((entry) => entry.characterId))]),
    candidateCount: materialized.length,
    requiredGates: REQUIRED_GATES,
    technicalAssuranceRequired: true,
    independentVisualReviewRequired: true,
    candidateApprovalPerformed: false,
    candidatePromotionPerformed: false,
    runtimeActivationPerformed: false,
    websiteActivationPerformed: false,
    providerExecutionPerformedByHandoff: false,
    materialized: Object.freeze(materialized),
    nextActions: Object.freeze([
      'Build the normal offline Project Art review bundle from review-plan.json.',
      'Complete every required gate for every candidate and record explicit dispositions.',
      'Reject generic AI aesthetics, anatomy drift, silhouette defects, identity ambiguity and animation-hostile geometry.',
      'Finalize the review through the existing Project Art review receipt path.',
      'Create identity-lock approval only from a valid finalized review receipt; this handoff grants no approval.',
    ]),
  });
  return Object.freeze({ ...body, handoffSha256: sha256(body) });
}
