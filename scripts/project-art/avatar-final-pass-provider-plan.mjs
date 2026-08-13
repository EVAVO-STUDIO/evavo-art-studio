import { FINAL_PASS_PLAN_SCHEMA } from './avatar-final-pass-provider-constants.mjs';
import {
  boundedText,
  canonicalPath,
  digest,
  fail,
  identifier,
  isRecord,
  sha256AvatarFinalPassProviderDocument,
  sourceRef,
  verifyAllFalseAuthority,
} from './avatar-final-pass-provider-common.mjs';

export function parsePlan(plan) {
  if (!isRecord(plan) || plan.schema !== FINAL_PASS_PLAN_SCHEMA) {
    fail('AVATAR_FINAL_PASS_PROVIDER_PLAN_SCHEMA_INVALID');
  }
  const planSha256 = digest(plan.planSha256, 'plan.planSha256');
  const body = { ...plan };
  delete body.planSha256;
  if (sha256AvatarFinalPassProviderDocument(body) !== planSha256) {
    fail('AVATAR_FINAL_PASS_PROVIDER_PLAN_HASH_MISMATCH');
  }
  if (plan.productionReady !== false || plan.runtimeActivationAllowed !== false) {
    fail('AVATAR_FINAL_PASS_PROVIDER_PLAN_READINESS_INVALID');
  }
  verifyAllFalseAuthority(plan.authority, 'plan.authority');
  const sessionId = identifier(plan.sessionId, 'plan.sessionId');
  const characterId = identifier(plan.characterId, 'plan.characterId');
  const sourceCommit = sourceRef(plan.sourceCommit, 'plan.sourceCommit');
  const width = plan.canvas?.width;
  const height = plan.canvas?.height;
  if (
    !Number.isSafeInteger(width) ||
    width < 1 ||
    width > 32768 ||
    !Number.isSafeInteger(height) ||
    height < 1 ||
    height > 32768
  ) {
    fail('AVATAR_FINAL_PASS_PROVIDER_CANVAS_INVALID');
  }
  if (!Array.isArray(plan.repairJobs) || !Array.isArray(plan.inbetweenJobs)) {
    fail('AVATAR_FINAL_PASS_PROVIDER_PLAN_JOBS_INVALID');
  }
  const descriptors = plan.sequenceMasteringRequestTemplate?.frames;
  if (!Array.isArray(descriptors)) {
    fail('AVATAR_FINAL_PASS_PROVIDER_FRAME_DESCRIPTORS_INVALID');
  }
  const descriptorsById = new Map();
  for (const [index, descriptor] of descriptors.entries()) {
    if (!isRecord(descriptor)) {
      fail(
        'AVATAR_FINAL_PASS_PROVIDER_FRAME_DESCRIPTOR_INVALID',
        `plan frame descriptor ${index} is invalid.`,
      );
    }
    const id = identifier(descriptor.id, `plan.frames[${index}].id`);
    if (descriptorsById.has(id)) {
      fail('AVATAR_FINAL_PASS_PROVIDER_FRAME_DESCRIPTOR_DUPLICATE');
    }
    const targetPath = canonicalPath(
      descriptor.targetPath,
      `plan.frames[${index}].targetPath`,
    );
    const sourcePath =
      descriptor.sourcePath === null
        ? null
        : canonicalPath(
            descriptor.sourcePath,
            `plan.frames[${index}].sourcePath`,
          );
    if (descriptor.pendingOutput !== true && descriptor.pendingOutput !== false) {
      fail('AVATAR_FINAL_PASS_PROVIDER_FRAME_PENDING_INVALID');
    }
    let expectedSha256 = null;
    if (descriptor.expectedSha256 !== null) {
      expectedSha256 = digest(
        descriptor.expectedSha256,
        `plan.frames[${index}].expectedSha256`,
      );
    }
    if (
      descriptor.pendingOutput === false &&
      (expectedSha256 === null || sourcePath === null)
    ) {
      fail('AVATAR_FINAL_PASS_PROVIDER_FRAME_HASH_REQUIRED');
    }
    descriptorsById.set(
      id,
      Object.freeze({
        id,
        sourcePath,
        targetPath,
        expectedSha256,
        pendingOutput: descriptor.pendingOutput,
      }),
    );
  }

  const availableJobs = new Map();
  for (const [index, job] of plan.repairJobs.entries()) {
    if (!isRecord(job) || job.mode !== 'provider-redraw') continue;
    const frameId = identifier(job.frameId, `plan.repairJobs[${index}].frameId`);
    const jobId = `redraw:${frameId}`;
    if (availableJobs.has(jobId)) {
      fail('AVATAR_FINAL_PASS_PROVIDER_JOB_DUPLICATE');
    }
    const issues = Array.isArray(job.issues)
      ? Object.freeze(
          job.issues.map((issue, issueIndex) =>
            boundedText(
              issue,
              `plan.repairJobs[${index}].issues[${issueIndex}]`,
              { minimum: 1, maximum: 128 },
            ),
          ),
        )
      : fail('AVATAR_FINAL_PASS_PROVIDER_JOB_ISSUES_INVALID');
    if (issues.length < 1) {
      fail('AVATAR_FINAL_PASS_PROVIDER_JOB_ISSUES_INVALID');
    }
    availableJobs.set(
      jobId,
      Object.freeze({
        jobId,
        frameId,
        kind: 'provider-redraw',
        operation: 'edit',
        continuityPhase: 'key-pose',
        sourcePath: canonicalPath(
          job.sourcePath,
          `plan.repairJobs[${index}].sourcePath`,
        ),
        sourceSha256: digest(
          job.sourceSha256,
          `plan.repairJobs[${index}].sourceSha256`,
        ),
        targetPath: canonicalPath(
          job.targetPath,
          `plan.repairJobs[${index}].targetPath`,
        ),
        issues,
        constraints: Object.freeze([
          'hands',
          'fingers',
          'anatomy',
          'face-identity',
          'silhouette',
          'style',
        ]),
        upstreamJobSha256: sha256AvatarFinalPassProviderDocument(job),
      }),
    );
  }

  for (const [index, job] of plan.inbetweenJobs.entries()) {
    if (!isRecord(job) || job.method !== 'provider-generated') continue;
    const frameId = identifier(job.frameId, `plan.inbetweenJobs[${index}].frameId`);
    const beforeFrameId = identifier(
      job.before?.frameId,
      `plan.inbetweenJobs[${index}].before.frameId`,
    );
    const afterFrameId = identifier(
      job.after?.frameId,
      `plan.inbetweenJobs[${index}].after.frameId`,
    );
    const jobId = `inbetween:${frameId}`;
    if (availableJobs.has(jobId)) {
      fail('AVATAR_FINAL_PASS_PROVIDER_JOB_DUPLICATE');
    }
    const constraints = Array.isArray(job.constraints)
      ? Object.freeze(
          job.constraints.map((constraint, constraintIndex) =>
            boundedText(
              constraint,
              `plan.inbetweenJobs[${index}].constraints[${constraintIndex}]`,
              { minimum: 1, maximum: 128 },
            ),
          ),
        )
      : fail('AVATAR_FINAL_PASS_PROVIDER_JOB_CONSTRAINTS_INVALID');
    if (constraints.length < 1) {
      fail('AVATAR_FINAL_PASS_PROVIDER_JOB_CONSTRAINTS_INVALID');
    }
    availableJobs.set(
      jobId,
      Object.freeze({
        jobId,
        frameId,
        kind: 'provider-generated-inbetween',
        operation: 'generate',
        continuityPhase: 'in-between',
        beforeFrameId,
        afterFrameId,
        targetPath: canonicalPath(
          job.targetPath,
          `plan.inbetweenJobs[${index}].targetPath`,
        ),
        issues: Object.freeze([]),
        constraints,
        upstreamJobSha256: sha256AvatarFinalPassProviderDocument(job),
      }),
    );
  }
  if (availableJobs.size === 0) {
    fail('AVATAR_FINAL_PASS_PROVIDER_NO_PROVIDER_JOBS');
  }
  return Object.freeze({
    value: plan,
    planSha256,
    sessionId,
    characterId,
    sourceCommit,
    canvas: Object.freeze({ width, height }),
    descriptorsById,
    availableJobs,
  });
}

