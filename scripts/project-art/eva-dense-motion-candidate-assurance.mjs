import {
  AVATAR_FRAME_ASSURANCE_CHECKS,
  inspectAvatarFrameAssurance,
} from './avatar-frame-assurance.mjs';
import {
  inspectAvatarProviderCandidatePng,
} from './avatar-final-pass-provider-candidate-png.mjs';
import {
  EVA_DENSE_MOTION_CLOSED_AUTHORITY,
} from './eva-dense-motion-work-order.mjs';
import {
  canonicalRelativePath,
  deepFreeze,
  exactClosedAuthority,
  exactKeys,
  fail,
  sha256EvaDenseMotionWorkOrderDocument,
  snapshot,
  timestamp,
} from './eva-dense-motion-work-order-common.mjs';
import {
  verifyEvaDenseMotionTenMasterProgram,
} from './eva-dense-motion-ten-master-program.mjs';

export const EVA_DENSE_MOTION_CANDIDATE_ASSURANCE_SCHEMA =
  'evavo.project-art-eva-dense-motion-candidate-assurance.v1';
export const EVA_DENSE_MOTION_CANDIDATE_ASSURANCE_CAPABILITIES_SCHEMA =
  'evavo.project-art-eva-dense-motion-candidate-assurance-capabilities.v1';
export const EVA_DENSE_MOTION_MINIMUM_INSPECTOR_CONFIDENCE = 0.95;

const SHA256 = /^[a-f0-9]{64}$/u;
const WIDTH = 1024;
const HEIGHT = 1536;

function digest(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    fail('EVA_DENSE_MOTION_CANDIDATE_ASSURANCE_SHA256_INVALID', label);
  }
  return value;
}

function jobFor(program, ordinal) {
  if (!Number.isSafeInteger(ordinal) || ordinal < 1 || ordinal > 10) {
    fail('EVA_DENSE_MOTION_CANDIDATE_ASSURANCE_ORDINAL_INVALID');
  }
  const job = program.production.jobs.find((entry) => entry.ordinal === ordinal);
  if (!job || job.frameId !== `eva-20260809-153620-frame-${String(ordinal).padStart(2, '0')}`) {
    fail('EVA_DENSE_MOTION_CANDIDATE_ASSURANCE_JOB_INVALID');
  }
  return job;
}

function inspectIndependentFrameReport(input, frameId, candidateSha256) {
  const report = inspectAvatarFrameAssurance(input, {
    frameId,
    sourceSha256: candidateSha256,
  });
  if (
    report.status !== 'review-ready' ||
    report.candidateApproval !== false ||
    report.publicationAuthority !== false ||
    report.checks.length !== AVATAR_FRAME_ASSURANCE_CHECKS.length
  ) {
    fail('EVA_DENSE_MOTION_CANDIDATE_ASSURANCE_FRAME_REPORT_INVALID');
  }
  const inspectorIds = new Set();
  for (const check of report.checks) {
    for (const observation of check.observations) {
      inspectorIds.add(observation.inspectorId);
      if (
        observation.verdict !== 'pass' ||
        observation.confidence < EVA_DENSE_MOTION_MINIMUM_INSPECTOR_CONFIDENCE
      ) {
        fail('EVA_DENSE_MOTION_CANDIDATE_ASSURANCE_CONFIDENCE_TOO_LOW');
      }
    }
  }
  if (inspectorIds.size < 2) {
    fail('EVA_DENSE_MOTION_CANDIDATE_ASSURANCE_INDEPENDENCE_REQUIRED');
  }
  return Object.freeze({ report, inspectorIds: Object.freeze([...inspectorIds].sort()) });
}

export function compileEvaDenseMotionCandidateAssurance({
  tenMasterProgram,
  ordinal,
  candidateBytes,
  candidatePath,
  frameAssurance,
  inspectedAt = new Date().toISOString(),
}) {
  const program = verifyEvaDenseMotionTenMasterProgram(tenMasterProgram);
  const job = jobFor(program, ordinal);
  timestamp(inspectedAt, 'inspectedAt');
  const path = canonicalRelativePath(candidatePath, 'candidatePath');
  if (path !== job.outputs.denseCandidate) {
    fail('EVA_DENSE_MOTION_CANDIDATE_ASSURANCE_PATH_MISMATCH');
  }
  const candidate = inspectAvatarProviderCandidatePng(
    Buffer.from(candidateBytes),
    WIDTH,
    HEIGHT,
    { requireTransparentPixels: false },
  );
  const inspection = inspectIndependentFrameReport(
    frameAssurance,
    job.frameId,
    candidate.sha256,
  );
  const body = {
    schema: EVA_DENSE_MOTION_CANDIDATE_ASSURANCE_SCHEMA,
    status: 'dense-candidate-assured-awaiting-reviewed-alpha-matte',
    inspectedAt,
    programSha256: program.programSha256,
    jobId: job.jobId,
    ordinal,
    frameId: job.frameId,
    source: Object.freeze({
      repository: job.source.repository,
      path: job.source.path,
      gitBlobSha1: job.source.gitBlobSha1,
      readOnly: true,
      runtimeDeliveryAllowed: false,
    }),
    candidate: Object.freeze({
      path,
      sha256: candidate.sha256,
      bytes: candidate.byteLength,
      width: candidate.width,
      height: candidate.height,
      visiblePixels: candidate.visiblePixels,
      transparentPixels: candidate.transparentPixels,
      partialAlphaPixels: candidate.partialAlphaPixels,
      hiddenRgbTransparentPixels: candidate.hiddenRgbTransparentPixels,
      edgeVisiblePixels: candidate.edgeVisiblePixels,
      visibleBounds: candidate.visibleBounds,
    }),
    independentInspection: Object.freeze({
      schema: frameAssurance.schema,
      reportSha256: inspection.report.reportSha256,
      inspectorIds: inspection.inspectorIds,
      inspectorCount: inspection.inspectorIds.length,
      minimumConfidence: EVA_DENSE_MOTION_MINIMUM_INSPECTOR_CONFIDENCE,
      checks: AVATAR_FRAME_ASSURANCE_CHECKS,
      allObservationsPassed: true,
    }),
    gates: Object.freeze({
      exactProgramJobBound: true,
      canonicalCanvasPassed: true,
      independentInspectorMinimumPassed: true,
      minimumConfidencePassed: true,
      denseCandidateAssurancePassed: true,
      alphaMatteReviewRequired: true,
      alphaMasteringRequired: true,
      candidateApproval: false,
      candidatePromotion: false,
      publicationAllowed: false,
      runtimeActivationAllowed: false,
    }),
    authority: EVA_DENSE_MOTION_CLOSED_AUTHORITY,
  };
  return deepFreeze({
    ...body,
    assuranceSha256: sha256EvaDenseMotionWorkOrderDocument(body),
  });
}

export function verifyEvaDenseMotionCandidateAssurance(input, { program } = {}) {
  const value = snapshot(input, 'dense candidate assurance');
  exactKeys(
    value,
    [
      'schema', 'status', 'inspectedAt', 'programSha256', 'jobId', 'ordinal',
      'frameId', 'source', 'candidate', 'independentInspection', 'gates',
      'authority', 'assuranceSha256',
    ],
    'EVA_DENSE_MOTION_CANDIDATE_ASSURANCE_KEYS_INVALID',
  );
  if (
    value.schema !== EVA_DENSE_MOTION_CANDIDATE_ASSURANCE_SCHEMA ||
    value.status !== 'dense-candidate-assured-awaiting-reviewed-alpha-matte'
  ) {
    fail('EVA_DENSE_MOTION_CANDIDATE_ASSURANCE_INVALID');
  }
  timestamp(value.inspectedAt, 'inspectedAt');
  digest(value.programSha256, 'programSha256');
  digest(value.assuranceSha256, 'assuranceSha256');
  const body = { ...value };
  delete body.assuranceSha256;
  if (sha256EvaDenseMotionWorkOrderDocument(body) !== value.assuranceSha256) {
    fail('EVA_DENSE_MOTION_CANDIDATE_ASSURANCE_HASH_MISMATCH');
  }
  const candidatePath = canonicalRelativePath(value.candidate?.path, 'candidate.path');
  digest(value.candidate?.sha256, 'candidate.sha256');
  if (
    value.candidate?.width !== WIDTH ||
    value.candidate?.height !== HEIGHT ||
    value.independentInspection?.inspectorCount < 2 ||
    value.independentInspection?.minimumConfidence !==
      EVA_DENSE_MOTION_MINIMUM_INSPECTOR_CONFIDENCE ||
    value.independentInspection?.allObservationsPassed !== true ||
    value.gates?.denseCandidateAssurancePassed !== true ||
    value.gates?.alphaMatteReviewRequired !== true ||
    value.gates?.alphaMasteringRequired !== true ||
    value.gates?.candidateApproval !== false ||
    value.gates?.publicationAllowed !== false ||
    value.gates?.runtimeActivationAllowed !== false
  ) {
    fail('EVA_DENSE_MOTION_CANDIDATE_ASSURANCE_INVALID');
  }
  exactClosedAuthority(value.authority, 'authority');
  if (program) {
    const verifiedProgram = verifyEvaDenseMotionTenMasterProgram(program);
    const job = jobFor(verifiedProgram, value.ordinal);
    if (
      value.programSha256 !== verifiedProgram.programSha256 ||
      value.jobId !== job.jobId ||
      value.frameId !== job.frameId ||
      candidatePath !== job.outputs.denseCandidate ||
      value.source?.path !== job.source.path ||
      value.source?.gitBlobSha1 !== job.source.gitBlobSha1
    ) {
      fail('EVA_DENSE_MOTION_CANDIDATE_ASSURANCE_PROGRAM_BINDING_MISMATCH');
    }
  }
  return value;
}

export function evaDenseMotionCandidateAssuranceCapabilities() {
  return deepFreeze({
    schema: EVA_DENSE_MOTION_CANDIDATE_ASSURANCE_CAPABILITIES_SCHEMA,
    exactTenMasterProgramBinding: true,
    canonicalCanvas: Object.freeze({ width: WIDTH, height: HEIGHT }),
    minimumIndependentInspectors: 2,
    minimumInspectorConfidence: EVA_DENSE_MOTION_MINIMUM_INSPECTOR_CONFIDENCE,
    allFrameAssuranceChecksRequired: AVATAR_FRAME_ASSURANCE_CHECKS,
    opaqueSourceSpaceCandidateAllowedBeforeAlphaMastering: true,
    alphaMatteReviewRequiredAfterAssurance: true,
    candidateApproval: false,
    publicationAuthority: false,
    runtimeActivationAuthority: false,
    authority: EVA_DENSE_MOTION_CLOSED_AUTHORITY,
  });
}
