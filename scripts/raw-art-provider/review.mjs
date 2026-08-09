import { LocalArtifactStore } from '../../packages/artifacts/dist/index.js';
import {
  compileProviderCandidateRuntimeContract,
  providerRequestSha256,
  validateProviderCandidateRequest,
} from '../../packages/providers/dist/index.js';
import { LocalRuntimeRepository } from '../../packages/runtime/dist/index.js';

import {
  validateRawArtProviderRuntimeExecutionAuthorization,
} from './execution.mjs';
import {
  ARTIFACT_ID,
  assertFalseAuthority,
  boundedText,
  canonical,
  fail,
  hashObject,
  isObject,
  safeId,
  stringList,
  verifySelfHash,
} from './shared.mjs';

export const RAW_ART_PROVIDER_RUNTIME_EXECUTION_RECEIPT_SCHEMA =
  'evavo.raw-art-provider-runtime-execution-receipt.v1';
export const RAW_ART_PROVIDER_CANDIDATE_REVIEW_DECISIONS_SCHEMA =
  'evavo.raw-art-provider-candidate-review-decisions.v1';
export const RAW_ART_PROVIDER_CANDIDATE_REVIEW_PLAN_SCHEMA =
  'evavo.raw-art-provider-candidate-review-plan.v1';

const MAXIMUM_JOBS = 100;
const MAXIMUM_CANDIDATES = 800;
const MAXIMUM_ARTIFACTS_PER_JOB = 32;
const MAXIMUM_EVIDENCE_ARTIFACTS = 32;
const REVIEW_MODES = new Set([
  'human',
  'agent-assisted',
  'automated-technical',
  'hybrid',
]);
const REVIEW_DECISIONS = new Set([
  'keep',
  'edit',
  'recreate',
  'generate-variation',
  'reference-only',
  'reject',
]);
const REPAIR_DECISIONS = new Set([
  'edit',
  'recreate',
  'generate-variation',
]);
const REVIEW_GATE_NAMES = Object.freeze([
  'technical',
  'styleConsistency',
  'identityContinuity',
  'animationContinuity',
  'historicalAccuracy',
  'composition',
  'gameplayReadability',
  'runtimeReadiness',
]);
const REVIEW_GATE_STATES = new Set([
  'pass',
  'fail',
  'not-reviewed',
  'not-applicable',
]);
const DEFECT_SEVERITIES = new Set(['blocking', 'major', 'minor']);
const IMAGE_MEDIA_TYPES = new Set([
  'image/png',
  'image/webp',
  'image/jpeg',
]);

function boundedArray(value, label, maximum) {
  if (!Array.isArray(value) || value.length > maximum) {
    fail(`${label} must contain at most ${maximum} entries`);
  }
  return value;
}

function canonicalTimestamp(value, label) {
  const timestamp = boundedText(value, label, 20, 40);
  const milliseconds = Date.parse(timestamp);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== timestamp
  ) {
    fail(`${label} must be a canonical UTC timestamp`);
  }
  return timestamp;
}

function boundedInteger(value, label, minimum, maximum, fallback) {
  const candidate = value === undefined ? fallback : value;
  if (
    !Number.isSafeInteger(candidate) ||
    candidate < minimum ||
    candidate > maximum
  ) {
    fail(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return candidate;
}

function boundedConfidence(value, label) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    fail(`${label} must be a finite number between 0 and 1`);
  }
  return value;
}

function contentHash(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    fail(`${label} must use sha256:<64 lowercase hex characters>`);
  }
  return value;
}

function artifactId(value, label) {
  if (typeof value !== 'string' || !ARTIFACT_ID.test(value)) {
    fail(`${label} must use artifact_<sha256> format`);
  }
  return value;
}

function exactSource(value, record, documentSha256, runId, label) {
  const expected = {
    path: record.path,
    fileSha256: record.fileSha256,
    documentSha256,
    runId,
  };
  if (!isObject(value) || canonical(value) !== canonical(expected)) {
    fail(`${label} does not bind the exact source file`);
  }
}

function executionAuthority() {
  return Object.freeze({
    providerExecution: true,
    workerClaim: true,
    candidateArtifactCreation: true,
    evidenceArtifactCreation: true,
    runtimeCompletion: true,
    runtimeSubmission: false,
    runtimeRedrive: false,
    deliveryPublication: false,
    sourceMutation: false,
    sourceDeletion: false,
    targetRepositoryMutation: false,
    candidateApproval: false,
    candidatePromotion: false,
    publication: false,
    forcePush: false,
  });
}

function reviewPlanAuthority() {
  return Object.freeze({
    reviewCompilation: false,
    providerExecution: false,
    workerClaim: false,
    runtimeSubmission: false,
    runtimeRedrive: false,
    deliveryPublication: false,
    sourceMutation: false,
    sourceDeletion: false,
    targetRepositoryMutation: false,
    artifactReferenceMutation: false,
    candidateApproval: false,
    candidatePromotion: false,
    gameIntegration: false,
    publication: false,
    deployment: false,
    forcePush: false,
  });
}

function assertExactAuthority(value, expected, label) {
  if (!isObject(value) || canonical(value) !== canonical(expected)) {
    fail(`${label} authority is invalid`);
  }
}

function outputArtifact(value, label) {
  if (!isObject(value)) fail(`${label} must be an object`);
  return Object.freeze({
    artifactId: artifactId(value.artifactId, `${label}.artifactId`),
    contentHash: contentHash(value.contentHash, `${label}.contentHash`),
    mediaType: boundedText(value.mediaType, `${label}.mediaType`, 3, 256),
    storageClass: boundedText(
      value.storageClass,
      `${label}.storageClass`,
      1,
      64,
    ),
    artifactRole:
      value.artifactRole === null
        ? null
        : boundedText(value.artifactRole, `${label}.artifactRole`, 1, 128),
    approvalState:
      value.approvalState === null
        ? null
        : boundedText(value.approvalState, `${label}.approvalState`, 1, 128),
  });
}

export function validateRawArtProviderRuntimeExecutionReceipt(
  executionReceiptRecord,
  authorization,
  authorizationRecord,
) {
  if (!isObject(executionReceiptRecord) || !isObject(executionReceiptRecord.value)) {
    fail('RAW_ART provider runtime execution receipt record is invalid');
  }
  const value = executionReceiptRecord.value;
  if (
    value.schema !== RAW_ART_PROVIDER_RUNTIME_EXECUTION_RECEIPT_SCHEMA ||
    value.status !== 'succeeded'
  ) {
    fail('RAW_ART provider review requires a succeeded execution receipt v1');
  }
  const executionSha256 = verifySelfHash(
    value,
    'executionSha256',
    'RAW_ART provider runtime execution receipt',
  );
  assertExactAuthority(
    value.authority,
    executionAuthority(),
    'RAW_ART provider execution receipt',
  );
  canonicalTimestamp(value.completedAt, 'execution receipt completedAt');
  safeId(value.workerId, 'execution receipt workerId');
  exactSource(
    value.sourceAuthorization,
    authorizationRecord,
    authorization.authorizationSha256,
    authorization.runId,
    'sourceAuthorization',
  );
  if (
    !isObject(value.runtime) ||
    value.runtime.root !== authorization.runtimeRoot ||
    value.runtime.protocolVersion !== authorization.value.runtimeProtocolVersion ||
    !isObject(value.artifacts) ||
    value.artifacts.root !== authorization.artifactRoot
  ) {
    fail('execution receipt storage or runtime binding is invalid');
  }
  if (
    !isObject(value.counts) ||
    value.counts.authorizedRuntimeJobs !== authorization.jobs.length ||
    value.counts.succeededRuntimeJobs !== authorization.jobs.length ||
    value.counts.failedRuntimeJobs !== 0
  ) {
    fail('execution receipt counts do not reconcile with authorization');
  }

  const adapterValues = boundedArray(
    value.providerAdapters,
    'execution receipt providerAdapters',
    16,
  );
  const authorizedAdapters = new Set(authorization.allowedAdapterIds);
  const adapters = [];
  const adapterIds = new Set();
  for (const [index, entry] of adapterValues.entries()) {
    if (!isObject(entry)) fail(`providerAdapters[${index}] is invalid`);
    const id = safeId(entry.id, `providerAdapters[${index}].id`);
    if (!authorizedAdapters.has(id) || adapterIds.has(id)) {
      fail(`providerAdapters[${index}] is unavailable, unauthorized or duplicated`);
    }
    adapterIds.add(id);
    adapters.push(entry);
  }
  if (adapterIds.size === 0) {
    fail('execution receipt must record at least one exact authorized adapter');
  }

  const jobValues = boundedArray(value.jobs, 'execution receipt jobs', MAXIMUM_JOBS);
  if (jobValues.length !== authorization.jobs.length) {
    fail('execution receipt job count differs from authorization');
  }
  const jobs = authorization.jobs.map((expected, index) => {
    const entry = jobValues[index];
    if (!isObject(entry)) fail(`execution receipt jobs[${index}] is invalid`);
    if (
      entry.workOrderId !== expected.workOrderId ||
      entry.campaignItemId !== expected.campaignItemId ||
      entry.providerRequestId !== expected.providerRequestId ||
      entry.requestSha256 !== expected.requestSha256 ||
      entry.jobId !== expected.jobId ||
      entry.specSha256 !== expected.specSha256 ||
      entry.state !== 'succeeded' ||
      entry.attempts !== 1 ||
      entry.redriveCount !== 0 ||
      entry.failure !== undefined
    ) {
      fail(`execution receipt jobs[${index}] does not bind the exact successful job`);
    }
    const outputValues = boundedArray(
      entry.outputArtifacts,
      `execution receipt jobs[${index}].outputArtifacts`,
      MAXIMUM_ARTIFACTS_PER_JOB,
    );
    if (outputValues.length < 2) {
      fail(`execution receipt jobs[${index}] lacks candidates and provider evidence`);
    }
    const outputs = outputValues.map((output, outputIndex) =>
      outputArtifact(
        output,
        `execution receipt jobs[${index}].outputArtifacts[${outputIndex}]`,
      ),
    );
    const ids = new Set(outputs.map((output) => output.artifactId));
    if (ids.size !== outputs.length) {
      fail(`execution receipt jobs[${index}] duplicates output artifacts`);
    }
    return Object.freeze({
      ...expected,
      receipt: entry,
      outputs: Object.freeze(outputs),
    });
  });

  return Object.freeze({
    value,
    executionSha256,
    runId: value.runId,
    completedAt: value.completedAt,
    adapters: Object.freeze(adapters),
    adapterIds,
    jobs: Object.freeze(jobs),
    authorization,
  });
}

function strictJson(bytes, label) {
  let value;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail(`${label} is not strict JSON UTF-8`);
  }
  if (!isObject(value)) fail(`${label} root must be an object`);
  return value;
}

function exactArtifactEvidence(receiptOutput, descriptor, label) {
  const actual = {
    artifactId: descriptor.artifactId,
    contentHash: descriptor.contentHash,
    mediaType: descriptor.mediaType,
    storageClass: descriptor.storageClass,
    artifactRole: descriptor.labels.artifactRole ?? null,
    approvalState: descriptor.labels.approvalState ?? null,
  };
  if (canonical(receiptOutput) !== canonical(actual)) {
    fail(`${label} differs from the immutable artifact descriptor`);
  }
}

function candidateIndex(descriptor, label) {
  const value = Number(descriptor.labels.candidateIndex);
  if (!Number.isSafeInteger(value) || value < 1 || value > 8) {
    fail(`${label} has an invalid candidateIndex`);
  }
  return value;
}

export async function verifyRawArtProviderReviewEvidence(execution) {
  const runtime = new LocalRuntimeRepository({
    root: execution.authorization.runtimeRoot,
  });
  const artifacts = new LocalArtifactStore({
    root: execution.authorization.artifactRoot,
  });
  const jobs = [];

  for (const [jobIndex, expected] of execution.jobs.entries()) {
    const runtimeRecord = await runtime.get(expected.jobId);
    const expectedOutputIds = expected.outputs.map((entry) => entry.artifactId);
    if (
      !runtimeRecord ||
      runtimeRecord.state !== 'succeeded' ||
      runtimeRecord.specHash !== expected.specSha256 ||
      canonical(runtimeRecord.spec) !==
        canonical(expected.admissionJob.normalized.spec) ||
      runtimeRecord.attempts.length !== 1 ||
      runtimeRecord.redriveCount !== 0 ||
      canonical(runtimeRecord.outputArtifacts) !== canonical(expectedOutputIds)
    ) {
      fail(`review runtime job ${jobIndex} drifted from its successful execution`);
    }

    const request = expected.admissionJob.selectionJob.batchEntry.contract.request;
    if (
      request.requestId !== expected.providerRequestId ||
      providerRequestSha256(request) !== expected.requestSha256
    ) {
      fail(`review runtime job ${jobIndex} provider request identity drifted`);
    }

    const descriptors = [];
    for (const [outputIndex, receiptOutput] of expected.outputs.entries()) {
      const verification = await artifacts.verify(receiptOutput.artifactId);
      const descriptor = await artifacts.get(receiptOutput.artifactId);
      if (
        !descriptor ||
        !verification.exists ||
        !verification.descriptorValid ||
        !verification.contentValid
      ) {
        fail(`review output artifact failed immutable verification: ${receiptOutput.artifactId}`);
      }
      exactArtifactEvidence(
        receiptOutput,
        descriptor,
        `review output artifact ${jobIndex}:${outputIndex}`,
      );
      descriptors.push(descriptor);
    }

    const candidates = descriptors
      .filter((entry) => entry.labels.artifactRole === 'provider-candidate')
      .sort((left, right) =>
        candidateIndex(left, 'provider candidate') -
        candidateIndex(right, 'provider candidate'),
      );
    const evidenceArtifacts = descriptors.filter(
      (entry) => entry.labels.artifactRole === 'provider-candidate-evidence',
    );
    if (
      candidates.length !== request.candidateCount ||
      evidenceArtifacts.length !== 1
    ) {
      fail(`review runtime job ${jobIndex} candidate or evidence count is invalid`);
    }

    for (const [candidatePosition, candidate] of candidates.entries()) {
      if (
        candidateIndex(candidate, 'provider candidate') !== candidatePosition + 1 ||
        candidate.storageClass !== 'intermediate' ||
        candidate.labels.approvalState !== 'unapproved' ||
        candidate.labels.providerRequestId !== request.requestId ||
        candidate.labels.candidateFamilyId !== request.candidateFamilyId ||
        candidate.labels.assetId !== request.assetId ||
        candidate.metadata?.finalDeliverable !== false ||
        candidate.metadata?.requiresMastering !== true ||
        candidate.metadata?.requiresBlockingQa !== true ||
        candidate.metadata?.requestSha256 !== expected.requestSha256
      ) {
        fail(`review provider candidate ${candidate.artifactId} crossed or drifted from its boundary`);
      }
    }

    const providerEvidenceDescriptor = evidenceArtifacts[0];
    if (
      providerEvidenceDescriptor.storageClass !== 'evidence' ||
      providerEvidenceDescriptor.labels.providerRequestId !== request.requestId ||
      !candidates.every((candidate) =>
        providerEvidenceDescriptor.sourceArtifacts.includes(candidate.artifactId),
      )
    ) {
      fail(`review provider evidence for job ${jobIndex} is not bound to every candidate`);
    }
    const providerEvidence = strictJson(
      await artifacts.read(providerEvidenceDescriptor.artifactId),
      `provider evidence for job ${jobIndex}`,
    );
    const candidateIds = candidates.map((entry) => entry.artifactId);
    if (
      providerEvidence.requestId !== request.requestId ||
      providerEvidence.requestSha256 !== expected.requestSha256 ||
      canonical(providerEvidence.request) !== canonical(request) ||
      providerEvidence.outcome !== 'candidate-produced' ||
      canonical(providerEvidence.candidateArtifacts) !== canonical(candidateIds) ||
      !isObject(providerEvidence.selection) ||
      !isObject(providerEvidence.selection.adapter) ||
      !execution.adapterIds.has(providerEvidence.selection.adapter.id)
    ) {
      fail(`provider evidence for job ${jobIndex} does not bind the exact provider result`);
    }
    for (const candidate of candidates) {
      if (
        candidate.labels.providerAdapter !== providerEvidence.selection.adapter.id ||
        candidate.labels.providerModel !== providerEvidence.selection.model
      ) {
        fail(`provider candidate ${candidate.artifactId} adapter or model differs from evidence`);
      }
    }

    jobs.push(Object.freeze({
      ...expected,
      runtimeRecord,
      request,
      candidates: Object.freeze(candidates),
      providerEvidenceDescriptor,
      providerEvidence,
    }));
  }

  return Object.freeze({
    execution,
    runtime,
    artifacts,
    jobs: Object.freeze(jobs),
  });
}

function reviewGateMap(value, label) {
  if (!isObject(value)) fail(`${label} must be an object`);
  const keys = Object.keys(value).sort();
  const expectedKeys = [...REVIEW_GATE_NAMES].sort();
  if (canonical(keys) !== canonical(expectedKeys)) {
    fail(`${label} must contain every exact review gate and no unknown gates`);
  }
  const result = {};
  for (const gate of REVIEW_GATE_NAMES) {
    if (!REVIEW_GATE_STATES.has(value[gate])) {
      fail(`${label}.${gate} has an unsupported state`);
    }
    result[gate] = value[gate];
  }
  return Object.freeze(result);
}

function reviewDefects(value, label) {
  const values = boundedArray(value ?? [], label, 64);
  const seen = new Set();
  return Object.freeze(values.map((entry, index) => {
    if (!isObject(entry)) fail(`${label}[${index}] must be an object`);
    const id = safeId(entry.id, `${label}[${index}].id`);
    if (seen.has(id)) fail(`${label} duplicates defect ${id}`);
    seen.add(id);
    if (!DEFECT_SEVERITIES.has(entry.severity)) {
      fail(`${label}[${index}].severity is unsupported`);
    }
    return Object.freeze({
      id,
      severity: entry.severity,
      summary: boundedText(
        entry.summary,
        `${label}[${index}].summary`,
        1,
        2_048,
      ),
      evidenceArtifactIds: Object.freeze(
        boundedArray(
          entry.evidenceArtifactIds ?? [],
          `${label}[${index}].evidenceArtifactIds`,
          MAXIMUM_EVIDENCE_ARTIFACTS,
        ).map((artifact, artifactIndex) =>
          artifactId(
            artifact,
            `${label}[${index}].evidenceArtifactIds[${artifactIndex}]`,
          ),
        ),
      ),
    });
  }));
}

function adapterIdList(value, label) {
  if (value === undefined) return undefined;
  const values = boundedArray(value, label, 16);
  if (values.length === 0) fail(`${label} must not be empty when supplied`);
  const result = values.map((entry, index) =>
    safeId(entry, `${label}[${index}]`),
  );
  if (new Set(result).size !== result.length) {
    fail(`${label} duplicates an adapter id`);
  }
  return Object.freeze(result.sort());
}

function normalizeReviewDecision(value, expected, index) {
  const label = `review candidates[${index}]`;
  if (!isObject(value)) fail(`${label} must be an object`);
  const decision = value.decision;
  if (!REVIEW_DECISIONS.has(decision)) {
    fail(`${label}.decision is unsupported`);
  }
  if (
    value.jobId !== expected.jobId ||
    value.providerRequestId !== expected.providerRequestId ||
    value.artifactId !== expected.artifactId ||
    value.contentHash !== expected.contentHash ||
    value.candidateIndex !== expected.candidateIndex
  ) {
    fail(`${label} does not bind the exact immutable candidate`);
  }
  const gates = reviewGateMap(value.gates, `${label}.gates`);
  const failedGates = REVIEW_GATE_NAMES.filter((gate) => gates[gate] === 'fail');
  const defects = reviewDefects(value.defects, `${label}.defects`);
  const strengths = Object.freeze(stringList(value.strengths ?? [], 64));
  const preserve = Object.freeze(stringList(value.preserve ?? [], 64));
  const change = Object.freeze(stringList(value.change ?? [], 64));
  const avoid = Object.freeze(stringList(value.avoid ?? [], 64));
  const reason = boundedText(value.reason, `${label}.reason`, 1, 4_096);
  const confidence = boundedConfidence(value.confidence, `${label}.confidence`);
  const evidenceArtifactIds = Object.freeze(
    boundedArray(
      value.evidenceArtifactIds ?? [],
      `${label}.evidenceArtifactIds`,
      MAXIMUM_EVIDENCE_ARTIFACTS,
    ).map((entry, evidenceIndex) =>
      artifactId(entry, `${label}.evidenceArtifactIds[${evidenceIndex}]`),
    ),
  );
  const maskArtifactId = value.maskArtifactId === undefined
    ? undefined
    : artifactId(value.maskArtifactId, `${label}.maskArtifactId`);
  const candidateCount = value.candidateCount === undefined
    ? undefined
    : boundedInteger(value.candidateCount, `${label}.candidateCount`, 1, 8);
  const allowedAdapterIds = adapterIdList(
    value.allowedAdapterIds,
    `${label}.allowedAdapterIds`,
  );
  const preferredAdapterId = value.preferredAdapterId === undefined
    ? undefined
    : safeId(value.preferredAdapterId, `${label}.preferredAdapterId`);

  if (decision === 'keep') {
    if (
      failedGates.length ||
      defects.length ||
      change.length ||
      avoid.length ||
      maskArtifactId ||
      candidateCount !== undefined ||
      allowedAdapterIds !== undefined ||
      preferredAdapterId !== undefined
    ) {
      fail(`${label} keep decisions cannot carry failures or repair authority`);
    }
  } else if (REPAIR_DECISIONS.has(decision)) {
    if (!failedGates.length || !defects.length || !change.length) {
      fail(`${label} repair decisions require failed gates, defects and explicit changes`);
    }
    if (decision !== 'edit' && maskArtifactId !== undefined) {
      fail(`${label} only edit decisions may provide an inpaint mask`);
    }
  } else {
    if (
      maskArtifactId ||
      candidateCount !== undefined ||
      allowedAdapterIds !== undefined ||
      preferredAdapterId !== undefined ||
      change.length
    ) {
      fail(`${label} non-repair decisions cannot carry repair authority`);
    }
    if (decision === 'reject' && (!failedGates.length || !defects.length)) {
      fail(`${label} reject decisions require failed gates and defects`);
    }
  }
  if (
    preferredAdapterId !== undefined &&
    allowedAdapterIds !== undefined &&
    !allowedAdapterIds.includes(preferredAdapterId)
  ) {
    fail(`${label}.preferredAdapterId must be included in allowedAdapterIds`);
  }

  return Object.freeze({
    jobId: expected.jobId,
    providerRequestId: expected.providerRequestId,
    artifactId: expected.artifactId,
    contentHash: expected.contentHash,
    candidateIndex: expected.candidateIndex,
    decision,
    gates,
    failedGates: Object.freeze(failedGates),
    defects,
    strengths,
    preserve,
    change,
    avoid,
    reason,
    confidence,
    evidenceArtifactIds,
    ...(maskArtifactId === undefined ? {} : { maskArtifactId }),
    ...(candidateCount === undefined ? {} : { candidateCount }),
    ...(allowedAdapterIds === undefined ? {} : { allowedAdapterIds }),
    ...(preferredAdapterId === undefined ? {} : { preferredAdapterId }),
  });
}

function candidateExpectation(job, descriptor) {
  return Object.freeze({
    jobId: job.jobId,
    providerRequestId: job.providerRequestId,
    campaignItemId: job.campaignItemId,
    artifactId: descriptor.artifactId,
    contentHash: descriptor.contentHash,
    candidateIndex: candidateIndex(descriptor, 'review candidate'),
    descriptor,
    job,
  });
}

export function validateRawArtProviderCandidateReviewDecisions(
  reviewRecord,
  evidence,
  executionReceiptRecord,
) {
  if (!isObject(reviewRecord) || !isObject(reviewRecord.value)) {
    fail('RAW_ART provider candidate review decisions record is invalid');
  }
  const value = reviewRecord.value;
  if (
    value.schema !== RAW_ART_PROVIDER_CANDIDATE_REVIEW_DECISIONS_SCHEMA ||
    value.status !== 'reviewed'
  ) {
    fail('unexpected RAW_ART provider candidate review decisions v1');
  }
  const reviewedAt = canonicalTimestamp(value.reviewedAt, 'reviewedAt');
  const reviewedBy = boundedText(value.reviewedBy, 'reviewedBy', 1, 256);
  if (!REVIEW_MODES.has(value.reviewMode)) {
    fail('reviewMode is unsupported');
  }
  assertFalseAuthority(value.authority, 'RAW_ART provider candidate review decisions');
  exactSource(
    value.sourceExecutionReceipt,
    executionReceiptRecord,
    evidence.execution.executionSha256,
    evidence.execution.runId,
    'sourceExecutionReceipt',
  );

  const expectations = evidence.jobs.flatMap((job) =>
    job.candidates.map((candidate) => candidateExpectation(job, candidate)),
  );
  const byArtifactId = new Map(
    expectations.map((entry) => [entry.artifactId, entry]),
  );
  const candidateValues = boundedArray(
    value.candidates,
    'review candidates',
    MAXIMUM_CANDIDATES,
  );
  if (candidateValues.length !== expectations.length) {
    fail('review decisions must cover every exact candidate once');
  }
  const decisionsByArtifactId = new Map();
  for (const [index, candidateValue] of candidateValues.entries()) {
    if (!isObject(candidateValue)) fail(`review candidates[${index}] is invalid`);
    const expected = byArtifactId.get(candidateValue.artifactId);
    if (!expected || decisionsByArtifactId.has(candidateValue.artifactId)) {
      fail(`review candidates[${index}] is unknown or duplicated`);
    }
    decisionsByArtifactId.set(
      expected.artifactId,
      normalizeReviewDecision(candidateValue, expected, index),
    );
  }
  for (const expected of expectations) {
    if (!decisionsByArtifactId.has(expected.artifactId)) {
      fail(`review decision is missing candidate ${expected.artifactId}`);
    }
  }

  return Object.freeze({
    value,
    reviewedAt,
    reviewedBy,
    reviewMode: value.reviewMode,
    expectations: Object.freeze(expectations),
    decisionsByArtifactId,
  });
}

async function verifySupportingArtifacts(review, evidence) {
  const verified = new Map();
  const requested = new Set();
  for (const decision of review.decisionsByArtifactId.values()) {
    for (const artifact of decision.evidenceArtifactIds) requested.add(artifact);
    for (const defect of decision.defects) {
      for (const artifact of defect.evidenceArtifactIds) requested.add(artifact);
    }
    if (decision.maskArtifactId) requested.add(decision.maskArtifactId);
  }
  for (const artifact of requested) {
    const verification = await evidence.artifacts.verify(artifact);
    const descriptor = await evidence.artifacts.get(artifact);
    if (
      !descriptor ||
      !verification.exists ||
      !verification.descriptorValid ||
      !verification.contentValid
    ) {
      fail(`review supporting artifact failed immutable verification: ${artifact}`);
    }
    verified.set(artifact, descriptor);
  }
  for (const decision of review.decisionsByArtifactId.values()) {
    if (decision.maskArtifactId) {
      const descriptor = verified.get(decision.maskArtifactId);
      if (!descriptor || !IMAGE_MEDIA_TYPES.has(descriptor.mediaType)) {
        fail(`review inpaint mask is not a supported image artifact: ${decision.maskArtifactId}`);
      }
    }
  }
  return verified;
}

function intersectAdapterIds(authorization, request, decision) {
  let allowed = new Set(authorization.allowedAdapterIds);
  if (request.selection.allowedAdapterIds.length > 0) {
    allowed = new Set(
      [...allowed].filter((entry) =>
        request.selection.allowedAdapterIds.includes(entry),
      ),
    );
  }
  if (decision.allowedAdapterIds !== undefined) {
    allowed = new Set(
      [...allowed].filter((entry) => decision.allowedAdapterIds.includes(entry)),
    );
  }
  if (allowed.size === 0) {
    fail(`review repair candidate ${decision.artifactId} has no exact authorized adapter intersection`);
  }
  const values = [...allowed].sort();
  const preferred = decision.preferredAdapterId ?? request.selection.preferredAdapterId;
  if (preferred !== undefined && !allowed.has(preferred)) {
    fail(`review repair candidate ${decision.artifactId} preferred adapter is not authorized`);
  }
  return Object.freeze({
    allowedAdapterIds: Object.freeze(values),
    ...(preferred === undefined ? {} : { preferredAdapterId: preferred }),
    ...(request.selection.preferredModel === undefined
      ? {}
      : { preferredModel: request.selection.preferredModel }),
    allowFallback: false,
    requireSeed: request.selection.requireSeed,
  });
}

function uniqueStrings(...groups) {
  return [...new Set(groups.flat().filter(Boolean))];
}

function repairCandidateFamilyId(request, decision, reviewRecord) {
  const decisionCode = decision.decision === 'generate-variation'
    ? 'variation'
    : decision.decision;
  const suffix = `review-${decisionCode}-${decision.artifactId.slice(-10)}-${reviewRecord.fileSha256.slice(0, 10)}`;
  const available = Math.max(1, 128 - suffix.length - 1);
  return `${request.candidateFamilyId.slice(0, available)}-${suffix}`;
}

function repairMetadata(request, decision, review, evidence, reviewRecord) {
  if (!isObject(request.metadata)) {
    fail(`RAW_ART repair request ${decision.artifactId} lacks object metadata`);
  }
  if (
    request.metadata.schema !== 'evavo.raw-art-provider-request-metadata.v2' ||
    !isObject(request.metadata.approvals) ||
    Object.values(request.metadata.approvals).some((entry) => entry !== false)
  ) {
    fail(`RAW_ART repair request ${decision.artifactId} metadata authority drifted`);
  }
  return {
    ...request.metadata,
    reviewRepair: {
      schema: 'evavo.raw-art-provider-review-repair-link.v1',
      sourceExecutionSha256: evidence.execution.executionSha256,
      sourceExecutionRunId: evidence.execution.runId,
      sourceReviewFileSha256: reviewRecord.fileSha256,
      sourceCandidateArtifactId: decision.artifactId,
      sourceCandidateContentHash: decision.contentHash,
      decision: decision.decision,
      reviewedAt: review.reviewedAt,
      reviewedBy: review.reviewedBy,
      reviewMode: review.reviewMode,
      failedGates: decision.failedGates,
      defectIds: decision.defects.map((entry) => entry.id),
      independentApprovalPerformed: false,
    },
  };
}

function repairReferences(request, decision) {
  const references = request.references.filter(
    (entry) => entry.role !== 'base-image' && entry.role !== 'mask',
  );
  if (decision.decision === 'edit' || decision.decision === 'generate-variation') {
    references.push({
      artifactId: decision.artifactId,
      role: 'base-image',
      strength: 1,
      required: true,
      note: 'Exact reviewed provider candidate selected as the repair base.',
    });
  }
  if (decision.maskArtifactId) {
    references.push({
      artifactId: decision.maskArtifactId,
      role: 'mask',
      strength: 1,
      required: true,
      note: 'Exact immutable review mask for bounded inpaint repair.',
    });
  }
  return references;
}

function compileRepairRequest(
  authorization,
  job,
  decision,
  review,
  evidence,
  reviewRecord,
) {
  const request = job.request;
  const operation = decision.decision === 'recreate'
    ? 'generate'
    : decision.maskArtifactId
      ? 'inpaint'
      : 'edit';
  const repairIntent = [
    request.creativeIntent,
    `Review-directed ${decision.decision} for candidate ${decision.candidateIndex}: ${decision.reason}`,
    `Required changes: ${decision.change.join('; ')}`,
    decision.preserve.length
      ? `Preserve exactly: ${decision.preserve.join('; ')}`
      : null,
  ].filter(Boolean).join('\n');
  const negativeIntent = uniqueStrings(
    request.negativeIntent ? [request.negativeIntent] : [],
    decision.avoid,
    decision.defects.map((entry) => entry.summary),
  ).join('; ');
  const input = {
    schemaVersion: '1.0',
    operation,
    assetKind: request.assetKind,
    continuityPhase: 'repair',
    assetId: request.assetId,
    candidateFamilyId: repairCandidateFamilyId(request, decision, reviewRecord),
    ...(request.frameId === undefined ? {} : { frameId: request.frameId }),
    ...(request.layerId === undefined ? {} : { layerId: request.layerId }),
    creativeIntent: repairIntent,
    ...(negativeIntent ? { negativeIntent } : {}),
    style: {
      ...request.style,
      mustHave: uniqueStrings(request.style.mustHave, decision.preserve),
      mustAvoid: uniqueStrings(request.style.mustAvoid, decision.avoid),
    },
    shot: request.shot,
    target: request.target,
    ...(request.sourceCanvas === undefined
      ? {}
      : { sourceCanvas: request.sourceCanvas }),
    background: request.background,
    quality: 'high',
    candidateCount: decision.candidateCount ?? 2,
    ...(request.seed === undefined ? {} : { seed: request.seed }),
    references: repairReferences(request, decision),
    selection: intersectAdapterIds(authorization, request, decision),
    metadata: repairMetadata(
      request,
      decision,
      review,
      evidence,
      reviewRecord,
    ),
  };
  const normalized = validateProviderCandidateRequest(input);
  const contract = compileProviderCandidateRuntimeContract(normalized);
  if (providerRequestSha256(normalized) !== contract.requestSha256) {
    fail(`compiled repair request drifted for candidate ${decision.artifactId}`);
  }
  return Object.freeze({
    repairId: `raw-art-review-repair:${decision.artifactId.slice('artifact_'.length, 22)}`,
    decision: decision.decision,
    operation,
    sourceCandidateArtifactId: decision.artifactId,
    sourceCandidateContentHash: decision.contentHash,
    request: normalized,
    requestSha256: contract.requestSha256,
    contract,
    contractSha256: hashObject(contract),
    runtimeJobSha256: hashObject(contract.runtimeJob),
    requiresFreshAdmission: true,
    requiresFreshExecutionAuthorization: true,
  });
}

function downstreamState(decision) {
  if (decision.decision === 'keep') return 'retain-for-mastering-and-evaluation';
  if (REPAIR_DECISIONS.has(decision.decision)) return 'repair-request-ready';
  if (decision.decision === 'reference-only') return 'retain-as-reference-only';
  return 'rejected';
}

export async function compileRawArtProviderCandidateReviewPlan(
  runtimeBatchRecord,
  selectionRecord,
  admissionReceiptRecord,
  authorizationRecord,
  executionReceiptRecord,
  reviewRecord,
  options = {},
) {
  const authorization = validateRawArtProviderRuntimeExecutionAuthorization(
    authorizationRecord,
    runtimeBatchRecord,
    selectionRecord,
    admissionReceiptRecord,
  );
  const execution = validateRawArtProviderRuntimeExecutionReceipt(
    executionReceiptRecord,
    authorization,
    authorizationRecord,
  );
  const evidence = await verifyRawArtProviderReviewEvidence(execution);
  const review = validateRawArtProviderCandidateReviewDecisions(
    reviewRecord,
    evidence,
    executionReceiptRecord,
  );
  const supportingArtifacts = await verifySupportingArtifacts(review, evidence);
  const compiledAt = canonicalTimestamp(
    options.compiledAt ?? new Date().toISOString(),
    'compiledAt',
  );

  const candidates = [];
  const repairRequests = [];
  const counts = {
    candidates: 0,
    keep: 0,
    edit: 0,
    recreate: 0,
    generateVariation: 0,
    referenceOnly: 0,
    reject: 0,
    repairRequests: 0,
    generateRequests: 0,
    editRequests: 0,
    inpaintRequests: 0,
  };

  for (const job of evidence.jobs) {
    for (const descriptor of job.candidates) {
      const decision = review.decisionsByArtifactId.get(descriptor.artifactId);
      if (!decision) fail(`review decision disappeared for ${descriptor.artifactId}`);
      let repair;
      if (REPAIR_DECISIONS.has(decision.decision)) {
        repair = compileRepairRequest(
          authorization,
          job,
          decision,
          review,
          evidence,
          reviewRecord,
        );
        repairRequests.push(repair);
        counts.repairRequests += 1;
        if (repair.operation === 'generate') counts.generateRequests += 1;
        if (repair.operation === 'edit') counts.editRequests += 1;
        if (repair.operation === 'inpaint') counts.inpaintRequests += 1;
      }
      counts.candidates += 1;
      if (decision.decision === 'keep') counts.keep += 1;
      if (decision.decision === 'edit') counts.edit += 1;
      if (decision.decision === 'recreate') counts.recreate += 1;
      if (decision.decision === 'generate-variation') counts.generateVariation += 1;
      if (decision.decision === 'reference-only') counts.referenceOnly += 1;
      if (decision.decision === 'reject') counts.reject += 1;
      candidates.push(Object.freeze({
        workOrderId: job.workOrderId,
        campaignItemId: job.campaignItemId,
        providerRequestId: job.providerRequestId,
        jobId: job.jobId,
        artifactId: descriptor.artifactId,
        contentHash: descriptor.contentHash,
        descriptorSha256: descriptor.descriptorSha256,
        mediaType: descriptor.mediaType,
        candidateIndex: candidateIndex(descriptor, 'review plan candidate'),
        providerAdapter: descriptor.labels.providerAdapter,
        providerModel: descriptor.labels.providerModel,
        decision: decision.decision,
        downstreamState: downstreamState(decision),
        gates: decision.gates,
        defects: decision.defects,
        strengths: decision.strengths,
        preserve: decision.preserve,
        change: decision.change,
        avoid: decision.avoid,
        reason: decision.reason,
        confidence: decision.confidence,
        evidenceArtifactIds: decision.evidenceArtifactIds,
        ...(decision.maskArtifactId === undefined
          ? {}
          : {
              maskArtifactId: decision.maskArtifactId,
              maskContentHash:
                supportingArtifacts.get(decision.maskArtifactId)?.contentHash,
            }),
        ...(repair === undefined ? {} : { repair }),
      }));
    }
  }

  const plan = {
    schema: RAW_ART_PROVIDER_CANDIDATE_REVIEW_PLAN_SCHEMA,
    status: repairRequests.length ? 'review-complete-repair-ready' : 'review-complete',
    compiledAt,
    sourceAuthorization: {
      path: authorizationRecord.path,
      fileSha256: authorizationRecord.fileSha256,
      documentSha256: authorization.authorizationSha256,
      runId: authorization.runId,
    },
    sourceExecutionReceipt: {
      path: executionReceiptRecord.path,
      fileSha256: executionReceiptRecord.fileSha256,
      documentSha256: execution.executionSha256,
      runId: execution.runId,
    },
    sourceReviewDecisions: {
      path: reviewRecord.path,
      fileSha256: reviewRecord.fileSha256,
    },
    campaign: {
      gameHead: authorization.admission.selection.batch.gameHead,
      queueSha256: authorization.admission.selection.batch.queueSha256,
      campaignSha256: authorization.admission.selection.batch.campaignSha256,
      campaignRunId: authorization.admission.selection.batch.campaignRunId,
      technicalAdmissionSha256:
        authorization.admission.selection.batch.technicalAdmissionSha256,
      styleBankSha256: authorization.admission.selection.batch.styleBankSha256,
      bindingsSha256: authorization.admission.selection.batch.bindingsSha256,
    },
    review: {
      reviewedAt: review.reviewedAt,
      reviewedBy: review.reviewedBy,
      reviewMode: review.reviewMode,
      independentApprovalPerformed: false,
    },
    counts,
    candidates,
    repairRequests,
    nextActions: [
      'Master and run blocking quality evaluation for every retained candidate before independent approval.',
      'Treat each compiled repair request as a new request that requires fresh selection, durable admission and short-lived execution authorization.',
      'Re-run exact candidate review after every repair or recreation; never inherit approval from the source candidate.',
      'Keep candidate approval, promotion, target-repository mutation, game integration and publication behind their separate governed boundaries.',
    ],
    authority: reviewPlanAuthority(),
  };
  const reviewPlanSha256 = hashObject(plan);
  return Object.freeze({
    ...plan,
    reviewPlanSha256,
    runId: reviewPlanSha256.slice(0, 20),
  });
}
