import {
  ADAPTER_ID_PATTERN,
  ARTIFACT_ID_PATTERN,
  AVATAR_FINAL_PASS_PROVIDER_REQUEST_SCHEMA,
  MAXIMUM_BINDINGS_PER_JOB,
  MAXIMUM_JOBS,
} from './avatar-final-pass-provider-constants.mjs';
import {
  boundedText,
  canonicalPath,
  digest,
  exactKeys,
  fail,
  identifier,
  parseFalseAuthority,
  timestamp,
} from './avatar-final-pass-provider-common.mjs';

function parseSelection(value, label) {
  exactKeys(
    value,
    [
      'preferredAdapterId',
      'preferredModel',
      'allowedAdapterIds',
      'allowFallback',
      'requireSeed',
      'seed',
    ],
    label,
  );
  const parseAdapter = (entry, entryLabel) => {
    if (entry === null) return null;
    if (typeof entry !== 'string' || !ADAPTER_ID_PATTERN.test(entry)) {
      fail('AVATAR_FINAL_PASS_PROVIDER_ADAPTER_ID_INVALID', `${entryLabel} is invalid.`);
    }
    return entry;
  };
  if (!Array.isArray(value.allowedAdapterIds) || value.allowedAdapterIds.length > 32) {
    fail('AVATAR_FINAL_PASS_PROVIDER_ALLOWED_ADAPTERS_INVALID');
  }
  const allowedAdapterIds = value.allowedAdapterIds.map((entry, index) =>
    parseAdapter(entry, `${label}.allowedAdapterIds[${index}]`),
  );
  if (new Set(allowedAdapterIds).size !== allowedAdapterIds.length) {
    fail('AVATAR_FINAL_PASS_PROVIDER_ALLOWED_ADAPTERS_DUPLICATE');
  }
  if (value.allowFallback !== false) {
    fail('AVATAR_FINAL_PASS_PROVIDER_FALLBACK_FORBIDDEN');
  }
  if (value.requireSeed !== true && value.requireSeed !== false) {
    fail('AVATAR_FINAL_PASS_PROVIDER_REQUIRE_SEED_INVALID');
  }
  if (
    value.seed !== null &&
    (!Number.isSafeInteger(value.seed) || value.seed < 0 || value.seed > 0xffffffff)
  ) {
    fail('AVATAR_FINAL_PASS_PROVIDER_SEED_INVALID');
  }
  if (value.requireSeed === true && value.seed === null) {
    fail('AVATAR_FINAL_PASS_PROVIDER_SEED_REQUIRED');
  }
  return Object.freeze({
    preferredAdapterId: parseAdapter(
      value.preferredAdapterId,
      `${label}.preferredAdapterId`,
    ),
    preferredModel: parseAdapter(value.preferredModel, `${label}.preferredModel`),
    allowedAdapterIds: Object.freeze(allowedAdapterIds),
    allowFallback: false,
    requireSeed: value.requireSeed,
    seed: value.seed,
  });
}

function parseAuthorization(value, label) {
  if (value === null) return null;
  exactKeys(
    value,
    ['action', 'actorClass', 'actorId', 'occurredAt', 'evidenceSha256'],
    label,
  );
  if (value.action !== 'run-provider-once') {
    fail('AVATAR_FINAL_PASS_PROVIDER_AUTHORIZATION_ACTION_INVALID');
  }
  if (value.actorClass !== 'human') {
    fail('AVATAR_FINAL_PASS_PROVIDER_HUMAN_AUTHORIZATION_REQUIRED');
  }
  return Object.freeze({
    action: 'run-provider-once',
    actorClass: 'human',
    actorId: boundedText(value.actorId, `${label}.actorId`, {
      minimum: 1,
      maximum: 256,
    }),
    occurredAt: timestamp(value.occurredAt, `${label}.occurredAt`),
    evidenceSha256: digest(value.evidenceSha256, `${label}.evidenceSha256`),
  });
}

function parseBinding(value, label) {
  exactKeys(
    value,
    [
      'bindingKey',
      'sourcePath',
      'sourceSha256',
      'artifactId',
      'evidenceSha256',
      'actorClass',
      'actorId',
      'occurredAt',
    ],
    label,
  );
  const bindingKey = identifier(value.bindingKey, `${label}.bindingKey`);
  if (!ARTIFACT_ID_PATTERN.test(value.artifactId)) {
    fail('AVATAR_FINAL_PASS_PROVIDER_ARTIFACT_ID_INVALID');
  }
  if (value.actorClass !== 'human') {
    fail('AVATAR_FINAL_PASS_PROVIDER_HUMAN_ARTIFACT_ADMISSION_REQUIRED');
  }
  return Object.freeze({
    bindingKey,
    sourcePath: canonicalPath(value.sourcePath, `${label}.sourcePath`),
    sourceSha256: digest(value.sourceSha256, `${label}.sourceSha256`),
    artifactId: value.artifactId,
    evidenceSha256: digest(value.evidenceSha256, `${label}.evidenceSha256`),
    actorClass: 'human',
    actorId: boundedText(value.actorId, `${label}.actorId`, {
      minimum: 1,
      maximum: 256,
    }),
    occurredAt: timestamp(value.occurredAt, `${label}.occurredAt`),
  });
}

export function parseRequest(request, plan) {
  exactKeys(request, ['schema', 'requestId', 'planSha256', 'jobs', 'authority'], 'request');
  if (request.schema !== AVATAR_FINAL_PASS_PROVIDER_REQUEST_SCHEMA) {
    fail('AVATAR_FINAL_PASS_PROVIDER_REQUEST_SCHEMA_INVALID');
  }
  const requestId = identifier(request.requestId, 'request.requestId');
  if (digest(request.planSha256, 'request.planSha256') !== plan.planSha256) {
    fail('AVATAR_FINAL_PASS_PROVIDER_REQUEST_PLAN_MISMATCH');
  }
  const authority = parseFalseAuthority(request.authority);
  if (
    !Array.isArray(request.jobs) ||
    request.jobs.length < 1 ||
    request.jobs.length > MAXIMUM_JOBS
  ) {
    fail('AVATAR_FINAL_PASS_PROVIDER_REQUEST_JOBS_INVALID');
  }
  const seen = new Set();
  const jobs = request.jobs.map((entry, index) => {
    exactKeys(
      entry,
      [
        'jobId',
        'identityFrameId',
        'candidateOutputPath',
        'selection',
        'authorization',
        'artifactBindings',
        'notes',
      ],
      `request.jobs[${index}]`,
    );
    const jobId = identifier(entry.jobId, `request.jobs[${index}].jobId`);
    if (seen.has(jobId)) {
      fail('AVATAR_FINAL_PASS_PROVIDER_REQUEST_JOB_DUPLICATE');
    }
    seen.add(jobId);
    const upstream = plan.availableJobs.get(jobId);
    if (!upstream) {
      fail('AVATAR_FINAL_PASS_PROVIDER_REQUEST_JOB_UNKNOWN');
    }
    const identityFrameId = identifier(
      entry.identityFrameId,
      `request.jobs[${index}].identityFrameId`,
    );
    const identity = plan.descriptorsById.get(identityFrameId);
    if (!identity) {
      fail('AVATAR_FINAL_PASS_PROVIDER_IDENTITY_FRAME_UNKNOWN');
    }
    const candidateOutputPath = canonicalPath(
      entry.candidateOutputPath,
      `request.jobs[${index}].candidateOutputPath`,
    );
    const expectedCandidateOutputPath =
      `scratch/avatar-final-pass/${plan.sessionId}/${upstream.frameId}/candidate-01.png`;
    if (candidateOutputPath !== expectedCandidateOutputPath) {
      fail('AVATAR_FINAL_PASS_PROVIDER_CANDIDATE_PATH_INVALID');
    }
    const selection = parseSelection(entry.selection, `request.jobs[${index}].selection`);
    const authorization = parseAuthorization(
      entry.authorization,
      `request.jobs[${index}].authorization`,
    );
    if (
      !Array.isArray(entry.artifactBindings) ||
      entry.artifactBindings.length > MAXIMUM_BINDINGS_PER_JOB
    ) {
      fail('AVATAR_FINAL_PASS_PROVIDER_BINDINGS_INVALID');
    }
    const bindingKeys = new Set();
    const artifactBindings = entry.artifactBindings.map((binding, bindingIndex) => {
      const parsed = parseBinding(
        binding,
        `request.jobs[${index}].artifactBindings[${bindingIndex}]`,
      );
      if (bindingKeys.has(parsed.bindingKey)) {
        fail('AVATAR_FINAL_PASS_PROVIDER_BINDING_DUPLICATE');
      }
      bindingKeys.add(parsed.bindingKey);
      return parsed;
    });
    return Object.freeze({
      upstream,
      jobId,
      identityFrameId,
      identity,
      candidateOutputPath,
      selection,
      authorization,
      artifactBindings: Object.freeze(artifactBindings),
      notes: boundedText(entry.notes, `request.jobs[${index}].notes`, {
        maximum: 4096,
      }),
    });
  });
  return Object.freeze({ requestId, jobs: Object.freeze(jobs), authority });
}

