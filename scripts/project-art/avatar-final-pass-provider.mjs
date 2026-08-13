import {
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import {
  AVATAR_FINAL_PASS_PROVIDER_BATCH_SCHEMA,
  FINAL_PASS_PLAN_SCHEMA,
  MAXIMUM_DOCUMENT_BYTES,
} from './avatar-final-pass-provider-constants.mjs';
import {
  canonicalAvatarFinalPassProviderJson,
  fail,
  parseJsonBytes,
  sha256AvatarFinalPassProviderDocument,
  sha256Bytes,
  timestamp,
} from './avatar-final-pass-provider-common.mjs';
import { parsePlan } from './avatar-final-pass-provider-plan.mjs';
import { compileJob } from './avatar-final-pass-provider-protocol.mjs';
import { parseRequest } from './avatar-final-pass-provider-request.mjs';

export {
  AVATAR_FINAL_PASS_PROVIDER_AUTHORITY_KEYS,
  AVATAR_FINAL_PASS_PROVIDER_BATCH_SCHEMA,
  AVATAR_FINAL_PASS_PROVIDER_METADATA_SCHEMA,
  AVATAR_FINAL_PASS_PROVIDER_REQUEST_SCHEMA,
} from './avatar-final-pass-provider-constants.mjs';
export {
  ProjectArtAvatarFinalPassProviderError,
  canonicalAvatarFinalPassProviderJson,
  createAvatarFinalPassProviderAuthority,
  sha256AvatarFinalPassProviderDocument,
} from './avatar-final-pass-provider-common.mjs';

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freezeDeep(child);
  return value;
}

export function compileProjectArtAvatarFinalPassProviderBatch({
  plan,
  planBytes,
  request,
  requestBytes,
  compiledAt = new Date().toISOString(),
}) {
  timestamp(compiledAt, 'compiledAt');
  const parsedPlanBytes = parseJsonBytes(planBytes, 'planBytes');
  const parsedRequestBytes = parseJsonBytes(requestBytes, 'requestBytes');
  if (
    canonicalAvatarFinalPassProviderJson(parsedPlanBytes) !==
    canonicalAvatarFinalPassProviderJson(plan)
  ) {
    fail('AVATAR_FINAL_PASS_PROVIDER_PLAN_BYTES_MISMATCH');
  }
  if (
    canonicalAvatarFinalPassProviderJson(parsedRequestBytes) !==
    canonicalAvatarFinalPassProviderJson(request)
  ) {
    fail('AVATAR_FINAL_PASS_PROVIDER_REQUEST_BYTES_MISMATCH');
  }
  const parsedPlan = parsePlan(plan);
  const parsedRequest = parseRequest(request, parsedPlan);
  const jobs = Object.freeze(
    parsedRequest.jobs.map((entry) => compileJob(entry, parsedPlan)),
  );
  const readyJobs = jobs.filter(
    (entry) => entry.status === 'ready-for-explicit-provider-submission',
  );
  const body = {
    schema: AVATAR_FINAL_PASS_PROVIDER_BATCH_SCHEMA,
    requestId: parsedRequest.requestId,
    compiledAt,
    plan: Object.freeze({
      schema: FINAL_PASS_PLAN_SCHEMA,
      planSha256: parsedPlan.planSha256,
      sourceCommit: parsedPlan.sourceCommit,
      sessionId: parsedPlan.sessionId,
      characterId: parsedPlan.characterId,
      canvas: parsedPlan.canvas,
    }),
    requestSha256: sha256Bytes(requestBytes),
    requestCanonicalSha256:
      sha256AvatarFinalPassProviderDocument(request),
    jobs,
    readySubmissions: Object.freeze(
      readyJobs.map((entry) =>
        Object.freeze({
          jobId: entry.jobId,
          candidateOutputPath: entry.candidateOutputPath,
          providerRequestSha256: entry.providerRequestSha256,
          providerRequestInput: entry.providerRequestInput,
        }),
      ),
    ),
    counts: Object.freeze({
      requested: jobs.length,
      ready: readyJobs.length,
      blocked: jobs.length - readyJobs.length,
      redraws: jobs.filter((entry) => entry.kind === 'provider-redraw').length,
      inbetweens: jobs.filter(
        (entry) => entry.kind === 'provider-generated-inbetween',
      ).length,
    }),
    candidateCountPerJob: 1,
    explicitProviderSubmissionRequired: true,
    providerExecution: false,
    candidateApproval: false,
    candidatePromotion: false,
    productionReady: false,
    runtimeActivationAllowed: false,
    authority: parsedRequest.authority,
  };
  return freezeDeep({
    ...body,
    batchSha256: sha256AvatarFinalPassProviderDocument(body),
  });
}

function stableJsonFile(filePath, label) {
  const before = lstatSync(filePath);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) {
    fail(
      'AVATAR_FINAL_PASS_PROVIDER_INPUT_FILE_INVALID',
      `${label} must be a single-link regular file.`,
    );
  }
  if (before.size < 2 || before.size > MAXIMUM_DOCUMENT_BYTES) {
    fail('AVATAR_FINAL_PASS_PROVIDER_INPUT_SIZE_INVALID');
  }
  const bytes = readFileSync(filePath);
  const after = lstatSync(filePath);
  for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    if (before[key] !== after[key]) {
      fail(
        'AVATAR_FINAL_PASS_PROVIDER_INPUT_CHANGED',
        `${label} changed while being read.`,
      );
    }
  }
  return Object.freeze({ bytes, value: parseJsonBytes(bytes, label) });
}

export function compileProjectArtAvatarFinalPassProviderBatchFile({
  planPath,
  requestPath,
  outputPath,
  compiledAt,
}) {
  const planInput = stableJsonFile(path.resolve(planPath), 'plan file');
  const requestInput = stableJsonFile(path.resolve(requestPath), 'request file');
  const batch = compileProjectArtAvatarFinalPassProviderBatch({
    plan: planInput.value,
    planBytes: planInput.bytes,
    request: requestInput.value,
    requestBytes: requestInput.bytes,
    ...(compiledAt ? { compiledAt } : {}),
  });
  const absolute = path.resolve(outputPath);
  const handle = openSync(absolute, 'wx', 0o600);
  try {
    writeFileSync(handle, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
  } finally {
    closeSync(handle);
  }
  return batch;
}
