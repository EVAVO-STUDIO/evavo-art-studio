import {
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import {
  MAXIMUM_DOCUMENT_BYTES,
} from './avatar-final-pass-provider-constants.mjs';
import {
  canonicalPath,
  createAvatarFinalPassProviderAuthority,
  digest,
  exactKeys,
  fail,
  identifier,
  parseFalseAuthority,
  parseJsonBytes,
  sha256AvatarFinalPassProviderDocument,
  timestamp,
  verifyAllFalseAuthority,
} from './avatar-final-pass-provider-common.mjs';
import {
  compileProjectArtAvatarFinalPassProviderBatch,
} from './avatar-final-pass-provider.mjs';
import {
  EVA_SOURCE_REPAIR_INTAKE_SCHEMA,
} from './eva-source-repair-intake.mjs';

export const EVA_SOURCE_REPAIR_PROVIDER_ADMISSIONS_TEMPLATE_SCHEMA =
  'evavo.project-art-eva-source-repair-provider-admissions-template.v1';
export const EVA_SOURCE_REPAIR_PROVIDER_ADMISSIONS_SCHEMA =
  'evavo.project-art-eva-source-repair-provider-admissions.v1';
export const EVA_SOURCE_REPAIR_PROVIDER_PACKAGE_SCHEMA =
  'evavo.project-art-eva-source-repair-provider-package.v1';

const EXPECTED_SOURCE_FRAMES = 191;
const EXPECTED_REPAIR_JOBS = 5;
const EXPECTED_INBETWEEN_JOBS = 1;
const EXPECTED_TOTAL_JOBS = 6;
const MAXIMUM_AUTHORIZATION_WINDOW_MS = 24 * 60 * 60 * 1_000;

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freezeDeep(child);
  return value;
}

function stableBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function verifySelfHash(value, field, label) {
  digest(value?.[field], `${label}.${field}`);
  const body = { ...value };
  delete body[field];
  if (sha256AvatarFinalPassProviderDocument(body) !== value[field]) {
    fail('EVA_SOURCE_REPAIR_PROVIDER_SELF_HASH_MISMATCH', label);
  }
}

function validateIntake(input) {
  exactKeys(
    input,
    [
      'schema',
      'compiledAt',
      'handoffFingerprint',
      'sourcePlanFingerprint',
      'taskCatalogueSha256',
      'materializationManifestSha256',
      'counts',
      'providerPlan',
      'providerRequestTemplate',
      'nextRequiredActions',
      'sourceBytesEmbedded',
      'providerExecution',
      'candidateApproval',
      'candidatePromotion',
      'productionReady',
      'runtimeActivationAllowed',
      'topHatProductionMayStart',
      'authority',
      'intakeSha256',
    ],
    'intake',
  );
  if (input.schema !== EVA_SOURCE_REPAIR_INTAKE_SCHEMA) {
    fail('EVA_SOURCE_REPAIR_PROVIDER_INTAKE_SCHEMA_INVALID');
  }
  timestamp(input.compiledAt, 'intake.compiledAt');
  for (const field of [
    'handoffFingerprint',
    'sourcePlanFingerprint',
    'taskCatalogueSha256',
    'materializationManifestSha256',
  ]) {
    digest(input[field], `intake.${field}`);
  }
  exactKeys(
    input.counts,
    ['sourceFrames', 'repairJobs', 'inbetweenJobs', 'totalJobs'],
    'intake.counts',
  );
  if (
    input.counts.sourceFrames !== EXPECTED_SOURCE_FRAMES ||
    input.counts.repairJobs !== EXPECTED_REPAIR_JOBS ||
    input.counts.inbetweenJobs !== EXPECTED_INBETWEEN_JOBS ||
    input.counts.totalJobs !== EXPECTED_TOTAL_JOBS
  ) {
    fail('EVA_SOURCE_REPAIR_PROVIDER_INTAKE_COUNTS_INVALID');
  }
  if (
    input.sourceBytesEmbedded !== false ||
    input.providerExecution !== false ||
    input.candidateApproval !== false ||
    input.candidatePromotion !== false ||
    input.productionReady !== false ||
    input.runtimeActivationAllowed !== false ||
    input.topHatProductionMayStart !== false
  ) {
    fail('EVA_SOURCE_REPAIR_PROVIDER_INTAKE_AUTHORITY_INVALID');
  }
  verifyAllFalseAuthority(input.authority, 'intake.authority');
  verifySelfHash(input, 'intakeSha256', 'intake');

  const planSourceRepair = input.providerPlan?.sourceRepair;
  exactKeys(
    planSourceRepair,
    [
      'handoffFingerprint',
      'sourcePlanFingerprint',
      'taskCatalogueSha256',
      'materializationManifestSha256',
    ],
    'intake.providerPlan.sourceRepair',
  );
  for (const field of Object.keys(planSourceRepair)) {
    if (planSourceRepair[field] !== input[field]) {
      fail('EVA_SOURCE_REPAIR_PROVIDER_INTAKE_BINDING_MISMATCH', field);
    }
  }
  parseFalseAuthority(input.providerPlan.authority, 'intake.providerPlan.authority');
  parseFalseAuthority(
    input.providerRequestTemplate.authority,
    'intake.providerRequestTemplate.authority',
  );
  if (
    input.providerRequestTemplate.planSha256 !== input.providerPlan.planSha256 ||
    !Array.isArray(input.providerRequestTemplate.jobs) ||
    input.providerRequestTemplate.jobs.length !== EXPECTED_TOTAL_JOBS ||
    input.providerRequestTemplate.jobs.some(
      (job) => job.authorization !== null || job.artifactBindings?.length !== 0,
    )
  ) {
    fail('EVA_SOURCE_REPAIR_PROVIDER_TEMPLATE_INVALID');
  }

  const blockedBatch = compileProjectArtAvatarFinalPassProviderBatch({
    plan: input.providerPlan,
    planBytes: stableBytes(input.providerPlan),
    request: input.providerRequestTemplate,
    requestBytes: stableBytes(input.providerRequestTemplate),
    compiledAt: input.compiledAt,
  });
  if (
    blockedBatch.counts.requested !== EXPECTED_TOTAL_JOBS ||
    blockedBatch.counts.ready !== 0 ||
    blockedBatch.counts.blocked !== EXPECTED_TOTAL_JOBS ||
    blockedBatch.counts.redraws !== EXPECTED_REPAIR_JOBS ||
    blockedBatch.counts.inbetweens !== EXPECTED_INBETWEEN_JOBS
  ) {
    fail('EVA_SOURCE_REPAIR_PROVIDER_BLOCKED_TEMPLATE_INVALID');
  }
  return freezeDeep({ intake: structuredClone(input), blockedBatch });
}

function requiredBindingTemplates(job) {
  const templates = job.requiredReferences.map((reference) => ({
    bindingKey: reference.bindingKey,
    sourcePath: reference.sourcePath,
    sourceSha256: reference.sourceSha256,
    artifactId: null,
    evidenceSha256: null,
    actorClass: 'human',
    actorId: null,
    occurredAt: null,
  }));
  if (job.kind === 'provider-redraw') {
    templates.push({
      bindingKey: 'defect-mask',
      sourcePath: job.candidateOutputPath.replace(
        /candidate-01\.png$/u,
        'defect-mask.png',
      ),
      sourceSha256: null,
      artifactId: null,
      evidenceSha256: null,
      actorClass: 'human',
      actorId: null,
      occurredAt: null,
    });
  }
  return Object.freeze(templates);
}

export function compileProjectArtEvaSourceRepairProviderAdmissionsTemplate(
  intakeInput,
) {
  const { intake, blockedBatch } = validateIntake(intakeInput);
  const body = {
    schema: EVA_SOURCE_REPAIR_PROVIDER_ADMISSIONS_TEMPLATE_SCHEMA,
    intakeSha256: intake.intakeSha256,
    requestId: intake.providerRequestTemplate.requestId,
    authorization: null,
    jobs: blockedBatch.jobs.map((job) => ({
      jobId: job.jobId,
      selection: structuredClone(
        intake.providerRequestTemplate.jobs.find(
          (requestJob) => requestJob.jobId === job.jobId,
        ).selection,
      ),
      artifactBindings: requiredBindingTemplates(job),
    })),
    candidateCountPerJob: 1,
    allowFallback: false,
    providerExecution: false,
    candidateApproval: false,
    candidatePromotion: false,
    runtimeActivationAllowed: false,
    authority: createAvatarFinalPassProviderAuthority(),
  };
  return freezeDeep({
    ...body,
    templateSha256: sha256AvatarFinalPassProviderDocument(body),
  });
}

function parseAuthorization(value, expectedJobIds, compiledAt) {
  exactKeys(
    value,
    [
      'action',
      'actorClass',
      'actorId',
      'occurredAt',
      'expiresAt',
      'evidenceSha256',
      'authorizedJobIds',
      'maximumProviderCalls',
      'candidateCountPerJob',
      'allowFallback',
    ],
    'admissions.authorization',
  );
  identifier(value.actorId, 'admissions.authorization.actorId');
  timestamp(value.occurredAt, 'admissions.authorization.occurredAt');
  timestamp(value.expiresAt, 'admissions.authorization.expiresAt');
  digest(value.evidenceSha256, 'admissions.authorization.evidenceSha256');
  if (
    value.action !== 'run-provider-once' ||
    value.actorClass !== 'human' ||
    value.maximumProviderCalls !== EXPECTED_TOTAL_JOBS ||
    value.candidateCountPerJob !== 1 ||
    value.allowFallback !== false ||
    JSON.stringify(value.authorizedJobIds) !== JSON.stringify(expectedJobIds)
  ) {
    fail('EVA_SOURCE_REPAIR_PROVIDER_AUTHORIZATION_INVALID');
  }
  const occurredAt = Date.parse(value.occurredAt);
  const expiresAt = Date.parse(value.expiresAt);
  const compilationTime = Date.parse(compiledAt);
  if (
    occurredAt > compilationTime ||
    compilationTime >= expiresAt ||
    expiresAt - occurredAt > MAXIMUM_AUTHORIZATION_WINDOW_MS
  ) {
    fail('EVA_SOURCE_REPAIR_PROVIDER_AUTHORIZATION_WINDOW_INVALID');
  }
  return Object.freeze({
    action: 'run-provider-once',
    actorClass: 'human',
    actorId: value.actorId,
    occurredAt: value.occurredAt,
    evidenceSha256: value.evidenceSha256,
  });
}

function validateDefectMask(job, requestJob) {
  const maskBindings = requestJob.artifactBindings.filter(
    (binding) => binding.bindingKey === 'defect-mask',
  );
  if (job.jobId.startsWith('redraw:')) {
    const expectedPath = job.candidateOutputPath.replace(
      /candidate-01\.png$/u,
      'defect-mask.png',
    );
    if (
      maskBindings.length !== 1 ||
      canonicalPath(maskBindings[0].sourcePath, `${job.jobId}.defect-mask`) !==
        expectedPath
    ) {
      fail('EVA_SOURCE_REPAIR_PROVIDER_DEFECT_MASK_INVALID', job.jobId);
    }
  } else if (maskBindings.length !== 0) {
    fail('EVA_SOURCE_REPAIR_PROVIDER_DEFECT_MASK_FORBIDDEN', job.jobId);
  }
}

function validateAdmissions(input, intake, blockedBatch, compiledAt) {
  exactKeys(
    input,
    [
      'schema',
      'intakeSha256',
      'requestId',
      'authorization',
      'jobs',
      'authority',
      'admissionsSha256',
    ],
    'admissions',
  );
  if (
    input.schema !== EVA_SOURCE_REPAIR_PROVIDER_ADMISSIONS_SCHEMA ||
    input.intakeSha256 !== intake.intakeSha256 ||
    input.requestId !== intake.providerRequestTemplate.requestId
  ) {
    fail('EVA_SOURCE_REPAIR_PROVIDER_ADMISSIONS_BINDING_INVALID');
  }
  parseFalseAuthority(input.authority, 'admissions.authority');
  verifySelfHash(input, 'admissionsSha256', 'admissions');
  if (!Array.isArray(input.jobs) || input.jobs.length !== EXPECTED_TOTAL_JOBS) {
    fail('EVA_SOURCE_REPAIR_PROVIDER_ADMISSIONS_JOBS_INVALID');
  }
  const expectedJobIds = blockedBatch.jobs.map((job) => job.jobId);
  if (
    JSON.stringify(input.jobs.map((job) => job?.jobId)) !==
    JSON.stringify(expectedJobIds)
  ) {
    fail('EVA_SOURCE_REPAIR_PROVIDER_ADMISSIONS_JOBS_INVALID');
  }
  const authorization = parseAuthorization(
    input.authorization,
    expectedJobIds,
    compiledAt,
  );
  const jobs = input.jobs.map((job, index) => {
    exactKeys(
      job,
      ['jobId', 'selection', 'artifactBindings'],
      `admissions.jobs[${index}]`,
    );
    if (!Array.isArray(job.artifactBindings)) {
      fail('EVA_SOURCE_REPAIR_PROVIDER_BINDINGS_INVALID');
    }
    for (const [bindingIndex, binding] of job.artifactBindings.entries()) {
      timestamp(
        binding?.occurredAt,
        `admissions.jobs[${index}].artifactBindings[${bindingIndex}].occurredAt`,
      );
      if (Date.parse(binding.occurredAt) > Date.parse(compiledAt)) {
        fail('EVA_SOURCE_REPAIR_PROVIDER_FUTURE_ADMISSION_INVALID');
      }
    }
    validateDefectMask(blockedBatch.jobs[index], job);
    return {
      jobId: job.jobId,
      selection: structuredClone(job.selection),
      artifactBindings: structuredClone(job.artifactBindings),
    };
  });
  const artifacts = new Map();
  for (const job of jobs) {
    for (const binding of job.artifactBindings) {
      const previous = artifacts.get(binding.artifactId);
      const identity = `${binding.sourcePath}\0${binding.sourceSha256}`;
      if (previous && previous !== identity) {
        fail('EVA_SOURCE_REPAIR_PROVIDER_ARTIFACT_IDENTITY_CONFLICT');
      }
      artifacts.set(binding.artifactId, identity);
    }
  }
  return freezeDeep({ authorization, jobs });
}

export function parseProjectArtEvaSourceRepairProviderPackage(input) {
  exactKeys(
    input,
    [
      'schema',
      'compiledAt',
      'intakeSha256',
      'admissionsSha256',
      'authorization',
      'providerPlan',
      'providerRequest',
      'providerBatch',
      'counts',
      'explicitProviderSubmissionRequired',
      'providerExecution',
      'candidateApproval',
      'candidatePromotion',
      'productionReady',
      'runtimeActivationAllowed',
      'topHatProductionMayStart',
      'nextRequiredActions',
      'authority',
      'packageSha256',
    ],
    'provider package',
  );
  if (input.schema !== EVA_SOURCE_REPAIR_PROVIDER_PACKAGE_SCHEMA) {
    fail('EVA_SOURCE_REPAIR_PROVIDER_PACKAGE_SCHEMA_INVALID');
  }
  timestamp(input.compiledAt, 'provider package.compiledAt');
  digest(input.intakeSha256, 'provider package.intakeSha256');
  digest(input.admissionsSha256, 'provider package.admissionsSha256');
  parseFalseAuthority(input.authority, 'provider package.authority');
  verifySelfHash(input, 'packageSha256', 'provider package');
  const recomputedBatch = compileProjectArtAvatarFinalPassProviderBatch({
    plan: input.providerPlan,
    planBytes: stableBytes(input.providerPlan),
    request: input.providerRequest,
    requestBytes: stableBytes(input.providerRequest),
    compiledAt: input.compiledAt,
  });
  if (
    sha256AvatarFinalPassProviderDocument(recomputedBatch) !==
    sha256AvatarFinalPassProviderDocument(input.providerBatch)
  ) {
    fail('EVA_SOURCE_REPAIR_PROVIDER_PACKAGE_BATCH_MISMATCH');
  }
  exactKeys(
    input.counts,
    ['requested', 'ready', 'blocked', 'redraws', 'inbetweens'],
    'provider package.counts',
  );
  if (
    sha256AvatarFinalPassProviderDocument(input.counts) !==
    sha256AvatarFinalPassProviderDocument(recomputedBatch.counts)
  ) {
    fail('EVA_SOURCE_REPAIR_PROVIDER_PACKAGE_COUNTS_MISMATCH');
  }
  const jobIds = recomputedBatch.jobs.map((job) => job.jobId);
  const authorization = parseAuthorization(
    input.authorization,
    jobIds,
    input.compiledAt,
  );
  if (
    input.providerRequest.jobs.some(
      (job) =>
        sha256AvatarFinalPassProviderDocument(job.authorization) !==
        sha256AvatarFinalPassProviderDocument(authorization),
    )
  ) {
    fail('EVA_SOURCE_REPAIR_PROVIDER_PACKAGE_AUTHORIZATION_MISMATCH');
  }
  if (
    input.counts.requested !== EXPECTED_TOTAL_JOBS ||
    input.counts.ready !== EXPECTED_TOTAL_JOBS ||
    input.counts.blocked !== 0 ||
    input.explicitProviderSubmissionRequired !== true ||
    input.providerExecution !== false ||
    input.candidateApproval !== false ||
    input.candidatePromotion !== false ||
    input.productionReady !== false ||
    input.runtimeActivationAllowed !== false ||
    input.topHatProductionMayStart !== false
  ) {
    fail('EVA_SOURCE_REPAIR_PROVIDER_PACKAGE_STATE_INVALID');
  }
  return freezeDeep(structuredClone(input));
}

export function parseProjectArtEvaSourceRepairProviderPackageForDispatch(
  input,
  dispatchedAt = new Date().toISOString(),
) {
  timestamp(dispatchedAt, 'dispatchedAt');
  const providerPackage = parseProjectArtEvaSourceRepairProviderPackage(input);
  if (
    Date.parse(dispatchedAt) < Date.parse(providerPackage.authorization.occurredAt) ||
    Date.parse(dispatchedAt) >= Date.parse(providerPackage.authorization.expiresAt)
  ) {
    fail('EVA_SOURCE_REPAIR_PROVIDER_DISPATCH_AUTHORIZATION_EXPIRED');
  }
  return providerPackage;
}

export function compileProjectArtEvaSourceRepairProviderPackage({
  intake: intakeInput,
  admissions: admissionsInput,
  compiledAt = new Date().toISOString(),
}) {
  timestamp(compiledAt, 'compiledAt');
  const { intake, blockedBatch } = validateIntake(intakeInput);
  const admissions = validateAdmissions(
    admissionsInput,
    intake,
    blockedBatch,
    compiledAt,
  );
  const admittedById = new Map(
    admissions.jobs.map((job) => [job.jobId, job]),
  );
  const providerRequest = freezeDeep({
    ...structuredClone(intake.providerRequestTemplate),
    jobs: intake.providerRequestTemplate.jobs.map((templateJob) => {
      const admitted = admittedById.get(templateJob.jobId);
      return {
        ...structuredClone(templateJob),
        selection: structuredClone(admitted.selection),
        authorization: structuredClone(admissions.authorization),
        artifactBindings: structuredClone(admitted.artifactBindings),
      };
    }),
  });
  const providerBatch = compileProjectArtAvatarFinalPassProviderBatch({
    plan: intake.providerPlan,
    planBytes: stableBytes(intake.providerPlan),
    request: providerRequest,
    requestBytes: stableBytes(providerRequest),
    compiledAt,
  });
  if (
    providerBatch.counts.requested !== EXPECTED_TOTAL_JOBS ||
    providerBatch.counts.ready !== EXPECTED_TOTAL_JOBS ||
    providerBatch.counts.blocked !== 0 ||
    providerBatch.counts.redraws !== EXPECTED_REPAIR_JOBS ||
    providerBatch.counts.inbetweens !== EXPECTED_INBETWEEN_JOBS
  ) {
    fail('EVA_SOURCE_REPAIR_PROVIDER_PACKAGE_NOT_READY');
  }
  const body = {
    schema: EVA_SOURCE_REPAIR_PROVIDER_PACKAGE_SCHEMA,
    compiledAt,
    intakeSha256: intake.intakeSha256,
    admissionsSha256: admissionsInput.admissionsSha256,
    authorization: structuredClone(admissionsInput.authorization),
    providerPlan: structuredClone(intake.providerPlan),
    providerRequest,
    providerBatch,
    counts: providerBatch.counts,
    explicitProviderSubmissionRequired: true,
    providerExecution: false,
    candidateApproval: false,
    candidatePromotion: false,
    productionReady: false,
    runtimeActivationAllowed: false,
    topHatProductionMayStart: false,
    nextRequiredActions: Object.freeze([
      'compile-one-runtime-dispatch-per-job',
      'bind-compatible-mask-guided-provider-runtime',
      'explicitly-submit-each-authorized-job-once',
      'materialize-candidates-create-only',
      'run-frame-finisher-and-dual-inspector-assurance',
      'record-separate-creative-approval',
      'regenerate-atlas-and-sequence-release',
      'reverify-browser-playback-before-runtime-activation',
    ]),
    authority: createAvatarFinalPassProviderAuthority(),
  };
  const providerPackage = freezeDeep({
    ...body,
    packageSha256: sha256AvatarFinalPassProviderDocument(body),
  });
  return parseProjectArtEvaSourceRepairProviderPackage(providerPackage);
}

function stableJsonFile(filePath, label) {
  const absolute = path.resolve(filePath);
  const before = lstatSync(absolute);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.size < 2 ||
    before.size > MAXIMUM_DOCUMENT_BYTES
  ) {
    fail('EVA_SOURCE_REPAIR_PROVIDER_INPUT_FILE_INVALID', label);
  }
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    if (before[key] !== after[key]) {
      fail('EVA_SOURCE_REPAIR_PROVIDER_INPUT_FILE_CHANGED', label);
    }
  }
  return parseJsonBytes(bytes, label);
}

function writeCreateOnly(outputPath, value) {
  const absolute = path.resolve(outputPath);
  const handle = openSync(absolute, 'wx', 0o600);
  try {
    writeFileSync(handle, stableBytes(value));
  } finally {
    closeSync(handle);
  }
  return absolute;
}

export function compileProjectArtEvaSourceRepairProviderAdmissionsTemplateFile({
  intakePath,
  outputPath,
}) {
  const template = compileProjectArtEvaSourceRepairProviderAdmissionsTemplate(
    stableJsonFile(intakePath, 'intake file'),
  );
  return Object.freeze({
    template,
    outputPath: writeCreateOnly(outputPath, template),
  });
}

export function compileProjectArtEvaSourceRepairProviderPackageFile({
  intakePath,
  admissionsPath,
  outputPath,
  compiledAt,
}) {
  const providerPackage = compileProjectArtEvaSourceRepairProviderPackage({
    intake: stableJsonFile(intakePath, 'intake file'),
    admissions: stableJsonFile(admissionsPath, 'admissions file'),
    ...(compiledAt ? { compiledAt } : {}),
  });
  return Object.freeze({
    providerPackage,
    outputPath: writeCreateOnly(outputPath, providerPackage),
  });
}
