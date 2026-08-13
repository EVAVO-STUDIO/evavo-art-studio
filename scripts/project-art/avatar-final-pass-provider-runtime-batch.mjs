import {
  AVATAR_FINAL_PASS_PROVIDER_BATCH_SCHEMA,
  PROVIDER_BATCH_AUTHORITY_KEYS,
  PROVIDER_JOB_KINDS,
  PROVIDER_OPERATIONS,
} from './avatar-final-pass-provider-runtime-constants.mjs';
import {
  artifactId,
  assert,
  boundedText,
  canonicalPath,
  deepFreeze,
  digest,
  exactKeys,
  identifier,
  isRecord,
  parseAllFalseAuthority,
  sameCanonical,
  sha256Document,
  sha256Text,
  snapshotJsonValue,
  sourceRef,
  timestamp,
  verifySelfHash,
} from './avatar-final-pass-provider-runtime-common.mjs';

const BATCH_KEYS = Object.freeze([
  'schema',
  'requestId',
  'compiledAt',
  'plan',
  'requestSha256',
  'requestCanonicalSha256',
  'jobs',
  'readySubmissions',
  'counts',
  'candidateCountPerJob',
  'explicitProviderSubmissionRequired',
  'providerExecution',
  'candidateApproval',
  'candidatePromotion',
  'productionReady',
  'runtimeActivationAllowed',
  'authority',
  'batchSha256',
]);

const JOB_KEYS = Object.freeze([
  'jobId',
  'frameId',
  'kind',
  'operation',
  'continuityPhase',
  'status',
  'blockers',
  'identityFrameId',
  'targetPath',
  'candidateOutputPath',
  'upstreamJobSha256',
  'requiredReferences',
  'admittedReferences',
  'authorization',
  'composedPrompt',
  'promptSha256',
  'providerRequestInput',
  'providerRequestSha256',
  'candidateCount',
  'providerExecution',
  'candidateApproval',
  'candidatePromotion',
  'targetPublication',
  'jobEnvelopeSha256',
]);

const PLAN_KEYS = Object.freeze([
  'schema',
  'planSha256',
  'sourceCommit',
  'sessionId',
  'characterId',
  'canvas',
]);

const READY_SUBMISSION_KEYS = Object.freeze([
  'jobId',
  'candidateOutputPath',
  'providerRequestSha256',
  'providerRequestInput',
]);

function positiveInteger(value, label, maximum = 32_768) {
  assert(
    Number.isSafeInteger(value) && value >= 1 && value <= maximum,
    'AVATAR_PROVIDER_RUNTIME_INTEGER_INVALID',
    `${label} is invalid.`,
  );
  return value;
}

function stringArray(value, label, maximum = 64) {
  assert(
    Array.isArray(value) && value.length <= maximum,
    'AVATAR_PROVIDER_RUNTIME_ARRAY_INVALID',
    `${label} must be a bounded array.`,
  );
  return Object.freeze(
    value.map((entry, index) => boundedText(entry, `${label}[${index}]`, 1, 1024)),
  );
}

function parsePlan(value) {
  exactKeys(value, PLAN_KEYS, 'batch.plan');
  assert(
    value.schema === 'evavo.project-art-avatar-final-pass-plan.v1',
    'AVATAR_PROVIDER_RUNTIME_PLAN_SCHEMA_INVALID',
  );
  exactKeys(value.canvas, ['width', 'height'], 'batch.plan.canvas');
  return Object.freeze({
    schema: value.schema,
    planSha256: digest(value.planSha256, 'batch.plan.planSha256'),
    sourceCommit: sourceRef(value.sourceCommit, 'batch.plan.sourceCommit'),
    sessionId: identifier(value.sessionId, 'batch.plan.sessionId'),
    characterId: identifier(value.characterId, 'batch.plan.characterId'),
    canvas: Object.freeze({
      width: positiveInteger(value.canvas.width, 'batch.plan.canvas.width'),
      height: positiveInteger(value.canvas.height, 'batch.plan.canvas.height'),
    }),
  });
}

function parseReference(value, label, admitted) {
  const baseKeys = [
    'bindingKey',
    'role',
    'sourcePath',
    'sourceSha256',
    'required',
    'note',
  ];
  const admittedKeys = [
    ...baseKeys,
    'artifactId',
    'evidenceSha256',
    'actorClass',
    'actorId',
    'occurredAt',
  ];
  exactKeys(value, admitted ? admittedKeys : baseKeys, label);
  assert(value.required === true, 'AVATAR_PROVIDER_RUNTIME_REFERENCE_INVALID');
  const output = {
    bindingKey: identifier(value.bindingKey, `${label}.bindingKey`),
    role: identifier(value.role, `${label}.role`),
    sourcePath: canonicalPath(value.sourcePath, `${label}.sourcePath`),
    sourceSha256: digest(value.sourceSha256, `${label}.sourceSha256`),
    required: true,
    note: boundedText(value.note, `${label}.note`, 1, 1024),
  };
  if (admitted) {
    assert(
      value.actorClass === 'human',
      'AVATAR_PROVIDER_RUNTIME_HUMAN_ADMISSION_REQUIRED',
      `${label}.actorClass must be human.`,
    );
    Object.assign(output, {
      artifactId: artifactId(value.artifactId, `${label}.artifactId`),
      evidenceSha256: digest(value.evidenceSha256, `${label}.evidenceSha256`),
      actorClass: 'human',
      actorId: boundedText(value.actorId, `${label}.actorId`, 1, 256),
      occurredAt: timestamp(value.occurredAt, `${label}.occurredAt`),
    });
  }
  return Object.freeze(output);
}

function parseAuthorization(value, label) {
  exactKeys(
    value,
    ['action', 'actorClass', 'actorId', 'occurredAt', 'evidenceSha256'],
    label,
  );
  assert(
    value.action === 'run-provider-once' && value.actorClass === 'human',
    'AVATAR_PROVIDER_RUNTIME_AUTHORIZATION_INVALID',
    `${label} must be a named-human run-provider-once authorization.`,
  );
  return Object.freeze({
    action: 'run-provider-once',
    actorClass: 'human',
    actorId: boundedText(value.actorId, `${label}.actorId`, 1, 256),
    occurredAt: timestamp(value.occurredAt, `${label}.occurredAt`),
    evidenceSha256: digest(value.evidenceSha256, `${label}.evidenceSha256`),
  });
}

function parseProviderRequest(input, job, plan) {
  assert(isRecord(input), 'AVATAR_PROVIDER_RUNTIME_PROVIDER_REQUEST_INVALID');
  const request = deepFreeze(snapshotJsonValue(input, `${job.jobId}.providerRequestInput`));
  assert(request.schemaVersion === '1.0', 'AVATAR_PROVIDER_RUNTIME_PROVIDER_REQUEST_INVALID');
  assert(
    request.operation === job.operation && PROVIDER_OPERATIONS.includes(request.operation),
    'AVATAR_PROVIDER_RUNTIME_PROVIDER_REQUEST_OPERATION_MISMATCH',
  );
  assert(request.assetKind === 'sprite-frame', 'AVATAR_PROVIDER_RUNTIME_PROVIDER_REQUEST_INVALID');
  assert(
    request.continuityPhase === job.continuityPhase,
    'AVATAR_PROVIDER_RUNTIME_PROVIDER_REQUEST_CONTINUITY_MISMATCH',
  );
  identifier(request.assetId, `${job.jobId}.providerRequestInput.assetId`);
  identifier(
    request.candidateFamilyId,
    `${job.jobId}.providerRequestInput.candidateFamilyId`,
  );
  boundedText(
    request.creativeIntent,
    `${job.jobId}.providerRequestInput.creativeIntent`,
  );
  assert(isRecord(request.style), 'AVATAR_PROVIDER_RUNTIME_PROVIDER_REQUEST_INVALID');
  assert(isRecord(request.shot), 'AVATAR_PROVIDER_RUNTIME_PROVIDER_REQUEST_INVALID');
  exactKeys(request.target, ['width', 'height', 'transparency', 'outputFormat'], `${job.jobId}.providerRequestInput.target`);
  assert(
    request.target.width === plan.canvas.width &&
      request.target.height === plan.canvas.height &&
      request.target.transparency === 'required' &&
      request.target.outputFormat === 'png',
    'AVATAR_PROVIDER_RUNTIME_PROVIDER_TARGET_MISMATCH',
  );
  exactKeys(request.sourceCanvas, ['width', 'height'], `${job.jobId}.providerRequestInput.sourceCanvas`);
  assert(
    request.sourceCanvas.width === plan.canvas.width &&
      request.sourceCanvas.height === plan.canvas.height,
    'AVATAR_PROVIDER_RUNTIME_PROVIDER_SOURCE_CANVAS_MISMATCH',
  );
  exactKeys(request.background, ['strategy'], `${job.jobId}.providerRequestInput.background`);
  assert(
    request.background.strategy === 'native-alpha',
    'AVATAR_PROVIDER_RUNTIME_PROVIDER_BACKGROUND_INVALID',
  );
  assert(request.quality === 'high', 'AVATAR_PROVIDER_RUNTIME_PROVIDER_QUALITY_INVALID');
  assert(request.candidateCount === 1, 'AVATAR_PROVIDER_RUNTIME_CANDIDATE_COUNT_INVALID');
  assert(isRecord(request.selection), 'AVATAR_PROVIDER_RUNTIME_PROVIDER_SELECTION_INVALID');
  assert(
    request.selection.allowFallback === false,
    'AVATAR_PROVIDER_RUNTIME_FALLBACK_FORBIDDEN',
  );
  assert(
    Array.isArray(request.references),
    'AVATAR_PROVIDER_RUNTIME_PROVIDER_REFERENCES_INVALID',
  );
  const roles = request.references.map((reference, index) => {
    assert(isRecord(reference), 'AVATAR_PROVIDER_RUNTIME_PROVIDER_REFERENCES_INVALID');
    artifactId(reference.artifactId, `${job.jobId}.references[${index}].artifactId`);
    assert(reference.required === true, 'AVATAR_PROVIDER_RUNTIME_PROVIDER_REFERENCES_INVALID');
    return reference.role;
  });
  assert(
    roles.includes('canonical-identity'),
    'AVATAR_PROVIDER_RUNTIME_CANONICAL_IDENTITY_REQUIRED',
  );
  if (job.operation === 'edit') {
    assert(
      job.kind === 'provider-redraw' &&
        job.continuityPhase === 'key-pose' &&
        roles.includes('base-image'),
      'AVATAR_PROVIDER_RUNTIME_EDIT_REFERENCES_INVALID',
    );
  } else {
    assert(
      job.kind === 'provider-generated-inbetween' &&
        job.continuityPhase === 'in-between' &&
        roles.includes('previous-key-pose') &&
        roles.includes('next-key-pose'),
      'AVATAR_PROVIDER_RUNTIME_INBETWEEN_REFERENCES_INVALID',
    );
  }
  assert(isRecord(request.metadata), 'AVATAR_PROVIDER_RUNTIME_PROVIDER_METADATA_INVALID');
  assert(
    request.metadata.jobId === job.jobId &&
      request.metadata.frameId === job.frameId &&
      request.metadata.candidateOutputPath === job.candidateOutputPath &&
      request.metadata.targetPath === job.targetPath,
    'AVATAR_PROVIDER_RUNTIME_PROVIDER_METADATA_MISMATCH',
  );
  assert(isRecord(request.metadata.approvals), 'AVATAR_PROVIDER_RUNTIME_PROVIDER_APPROVALS_INVALID');
  for (const [key, value] of Object.entries(request.metadata.approvals)) {
    assert(
      value === false,
      'AVATAR_PROVIDER_RUNTIME_PROVIDER_APPROVAL_ESCALATED',
      `${job.jobId}.metadata.approvals.${key} must remain false.`,
    );
  }
  return request;
}

function parseJob(value, index, plan) {
  const label = `batch.jobs[${index}]`;
  exactKeys(value, JOB_KEYS, label);
  const verified = verifySelfHash(value, 'jobEnvelopeSha256', label);
  const jobId = identifier(verified.jobId, `${label}.jobId`);
  const frameId = identifier(verified.frameId, `${label}.frameId`);
  assert(
    PROVIDER_JOB_KINDS.includes(verified.kind),
    'AVATAR_PROVIDER_RUNTIME_JOB_KIND_INVALID',
  );
  assert(
    PROVIDER_OPERATIONS.includes(verified.operation),
    'AVATAR_PROVIDER_RUNTIME_JOB_OPERATION_INVALID',
  );
  assert(
    verified.status === 'ready-for-explicit-provider-submission',
    'AVATAR_PROVIDER_RUNTIME_JOB_NOT_READY',
    `${jobId} is not ready for explicit provider submission.`,
  );
  assert(
    Array.isArray(verified.blockers) && verified.blockers.length === 0,
    'AVATAR_PROVIDER_RUNTIME_JOB_NOT_READY',
  );
  const candidateOutputPath = canonicalPath(
    verified.candidateOutputPath,
    `${label}.candidateOutputPath`,
  );
  const expectedPrefix = `scratch/avatar-final-pass/${plan.sessionId}/${frameId}/`;
  assert(
    candidateOutputPath === `${expectedPrefix}candidate-01.png`,
    'AVATAR_PROVIDER_RUNTIME_CANDIDATE_PATH_INVALID',
  );
  const requiredReferences = Object.freeze(
    verified.requiredReferences.map((entry, referenceIndex) =>
      parseReference(entry, `${label}.requiredReferences[${referenceIndex}]`, false),
    ),
  );
  const admittedReferences = Object.freeze(
    verified.admittedReferences.map((entry, referenceIndex) =>
      parseReference(entry, `${label}.admittedReferences[${referenceIndex}]`, true),
    ),
  );
  assert(
    requiredReferences.length === admittedReferences.length &&
      requiredReferences.every((required) => {
        const admitted = admittedReferences.find(
          (entry) => entry.bindingKey === required.bindingKey,
        );
        return (
          admitted &&
          admitted.role === required.role &&
          admitted.sourcePath === required.sourcePath &&
          admitted.sourceSha256 === required.sourceSha256
        );
      }),
    'AVATAR_PROVIDER_RUNTIME_REFERENCE_ADMISSION_INCOMPLETE',
  );
  const authorization = parseAuthorization(verified.authorization, `${label}.authorization`);
  const composedPrompt = boundedText(
    verified.composedPrompt,
    `${label}.composedPrompt`,
  );
  assert(
    sha256Text(composedPrompt) === digest(verified.promptSha256, `${label}.promptSha256`),
    'AVATAR_PROVIDER_RUNTIME_PROMPT_HASH_MISMATCH',
  );
  assert(
    verified.candidateCount === 1 &&
      verified.providerExecution === false &&
      verified.candidateApproval === false &&
      verified.candidatePromotion === false &&
      verified.targetPublication === false,
    'AVATAR_PROVIDER_RUNTIME_JOB_AUTHORITY_INVALID',
  );
  const providerRequestInput = parseProviderRequest(verified.providerRequestInput, verified, plan);
  const providerRequestSha256 = digest(
    verified.providerRequestSha256,
    `${label}.providerRequestSha256`,
  );
  assert(
    sha256Document(providerRequestInput) === providerRequestSha256,
    'AVATAR_PROVIDER_RUNTIME_PROVIDER_REQUEST_HASH_MISMATCH',
  );
  return Object.freeze({
    ...verified,
    jobId,
    frameId,
    targetPath: canonicalPath(verified.targetPath, `${label}.targetPath`),
    candidateOutputPath,
    upstreamJobSha256: digest(
      verified.upstreamJobSha256,
      `${label}.upstreamJobSha256`,
    ),
    requiredReferences,
    admittedReferences,
    authorization,
    composedPrompt,
    providerRequestInput,
    providerRequestSha256,
  });
}

function parseReadySubmission(value, index) {
  const label = `batch.readySubmissions[${index}]`;
  exactKeys(value, READY_SUBMISSION_KEYS, label);
  return Object.freeze({
    jobId: identifier(value.jobId, `${label}.jobId`),
    candidateOutputPath: canonicalPath(
      value.candidateOutputPath,
      `${label}.candidateOutputPath`,
    ),
    providerRequestSha256: digest(
      value.providerRequestSha256,
      `${label}.providerRequestSha256`,
    ),
    providerRequestInput: deepFreeze(
      snapshotJsonValue(value.providerRequestInput, `${label}.providerRequestInput`),
    ),
  });
}

export function parseAvatarFinalPassProviderBatch(input) {
  exactKeys(input, BATCH_KEYS, 'provider batch');
  assert(
    input.schema === AVATAR_FINAL_PASS_PROVIDER_BATCH_SCHEMA,
    'AVATAR_PROVIDER_RUNTIME_BATCH_SCHEMA_INVALID',
  );
  const batch = verifySelfHash(input, 'batchSha256', 'provider batch');
  const plan = parsePlan(batch.plan);
  const authority = parseAllFalseAuthority(
    batch.authority,
    PROVIDER_BATCH_AUTHORITY_KEYS,
    'provider batch.authority',
  );
  assert(
    batch.candidateCountPerJob === 1 &&
      batch.explicitProviderSubmissionRequired === true &&
      batch.providerExecution === false &&
      batch.candidateApproval === false &&
      batch.candidatePromotion === false &&
      batch.productionReady === false &&
      batch.runtimeActivationAllowed === false,
    'AVATAR_PROVIDER_RUNTIME_BATCH_AUTHORITY_INVALID',
  );
  const jobs = Object.freeze(
    batch.jobs.map((entry, index) => parseJob(entry, index, plan)),
  );
  assert(jobs.length >= 1, 'AVATAR_PROVIDER_RUNTIME_BATCH_EMPTY');
  assert(
    new Set(jobs.map((entry) => entry.jobId)).size === jobs.length,
    'AVATAR_PROVIDER_RUNTIME_JOB_DUPLICATE',
  );
  const readySubmissions = Object.freeze(
    batch.readySubmissions.map(parseReadySubmission),
  );
  assert(
    readySubmissions.length === jobs.length,
    'AVATAR_PROVIDER_RUNTIME_READY_SUBMISSIONS_INVALID',
  );
  for (const job of jobs) {
    const submission = readySubmissions.find((entry) => entry.jobId === job.jobId);
    assert(submission, 'AVATAR_PROVIDER_RUNTIME_READY_SUBMISSION_MISSING');
    assert(
      submission.candidateOutputPath === job.candidateOutputPath &&
        submission.providerRequestSha256 === job.providerRequestSha256 &&
        sameCanonical(submission.providerRequestInput, job.providerRequestInput),
      'AVATAR_PROVIDER_RUNTIME_READY_SUBMISSION_MISMATCH',
    );
  }
  exactKeys(
    batch.counts,
    ['requested', 'ready', 'blocked', 'redraws', 'inbetweens'],
    'provider batch.counts',
  );
  assert(
    batch.counts.requested === jobs.length &&
      batch.counts.ready === jobs.length &&
      batch.counts.blocked === 0 &&
      batch.counts.redraws ===
        jobs.filter((entry) => entry.kind === 'provider-redraw').length &&
      batch.counts.inbetweens ===
        jobs.filter((entry) => entry.kind === 'provider-generated-inbetween').length,
    'AVATAR_PROVIDER_RUNTIME_BATCH_COUNTS_INVALID',
  );
  return Object.freeze({
    value: batch,
    batchSha256: batch.batchSha256,
    requestId: identifier(batch.requestId, 'provider batch.requestId'),
    compiledAt: timestamp(batch.compiledAt, 'provider batch.compiledAt'),
    requestSha256: digest(batch.requestSha256, 'provider batch.requestSha256'),
    requestCanonicalSha256: digest(
      batch.requestCanonicalSha256,
      'provider batch.requestCanonicalSha256',
    ),
    plan,
    jobs,
    jobsById: new Map(jobs.map((entry) => [entry.jobId, entry])),
    authority,
  });
}

export function selectReadyAvatarProviderJob(parsedBatch, jobIdInput) {
  const jobId = identifier(jobIdInput, 'jobId');
  const job = parsedBatch.jobsById.get(jobId);
  assert(
    job,
    'AVATAR_PROVIDER_RUNTIME_JOB_UNKNOWN',
    `Provider batch does not contain ready job ${jobId}.`,
  );
  return job;
}
