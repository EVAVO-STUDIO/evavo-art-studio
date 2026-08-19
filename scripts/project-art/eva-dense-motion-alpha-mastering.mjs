import { randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

import {
  AVATAR_PROVIDER_CANDIDATE_FINISHER_REQUEST_SCHEMA,
  AVATAR_PROVIDER_CANDIDATE_MATERIALIZATION_SCHEMA,
  AVATAR_PROVIDER_CANDIDATE_PROTOCOL_VERSION,
} from './avatar-final-pass-provider-candidate-constants.mjs';
import {
  assert,
  canonicalRelativePath,
  deepFreeze,
  digest,
  exactKeys,
  identifier,
  sha256Bytes,
  sha256Document,
  snapshotJsonValue,
  timestamp,
} from './avatar-final-pass-provider-candidate-common.mjs';
import {
  inspectAvatarProviderCandidatePng,
} from './avatar-final-pass-provider-candidate-png.mjs';
import {
  encodeAvatarProviderFramePng,
  inspectAvatarProviderFramePng,
} from './avatar-final-pass-provider-frame-finisher.mjs';
import {
  verifyEvaDenseMotionCandidateAssurance,
} from './eva-dense-motion-candidate-assurance.mjs';
import {
  verifyEvaDenseMotionTenMasterProgram,
} from './eva-dense-motion-ten-master-program.mjs';

export const EVA_DENSE_MOTION_ALPHA_MATTE_REVIEW_SCHEMA =
  'evavo.project-art-eva-dense-motion-alpha-matte-review.v1';
export const EVA_DENSE_MOTION_ALPHA_MASTERING_AUTHORIZATION_SCHEMA =
  'evavo.project-art-eva-dense-motion-alpha-mastering-authorization.v1';
export const EVA_DENSE_MOTION_ALPHA_MASTERING_SCHEMA =
  'evavo.project-art-eva-dense-motion-alpha-mastering.v1';
export const EVA_DENSE_MOTION_ALPHA_MASTERING_CAPABILITIES_SCHEMA =
  'evavo.project-art-eva-dense-motion-alpha-mastering-capabilities.v1';
export const EVA_DENSE_MOTION_ALPHA_MASTERING_PROTOCOL_VERSION = '2026-08-20.1';
export const EVA_DENSE_MOTION_ALPHA_MASTERING_ACTION =
  'apply-eva-dense-production-alpha-once';
export const EVA_DENSE_MOTION_MAXIMUM_AUTHORIZATION_MS = 24 * 60 * 60 * 1000;

const WIDTH = 1024;
const HEIGHT = 1536;
const PIXELS = WIDTH * HEIGHT;
const MAXIMUM_PNG_BYTES = 64 * 1024 * 1024;
const MAXIMUM_JSON_BYTES = 8 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const REQUIRED_MATTE_GATES = Object.freeze([
  'subject-silhouette',
  'hair-and-fine-edge',
  'hands-and-fingers',
  'face-and-neck',
  'wardrobe-boundary',
  'checkerboard-and-matte-rejection',
  'canvas-edge-clearance',
]);
const REQUIRED_REVIEW_GATES = Object.freeze([
  'technical',
  'hands-and-anatomy',
  'face-identity',
  'silhouette-and-registration',
  'adjacent-frame-continuity',
  'final-to-first-loop-closure-when-applicable',
]);
const REQUIRED_OPERATIONS = Object.freeze([
  'clear-hidden-rgb-under-fully-transparent-pixels',
  'preserve-canonical-canvas-and-registration',
  'run-avatar-frame-finisher',
  'run-native-scale-and-contact-sheet-inspection',
  'rerun-sequence-and-final-to-first-loop-closure-after-admission',
]);

function authority() {
  return Object.freeze({
    sourceRead: true,
    alphaMatteRead: true,
    deterministicAlphaMutation: true,
    alphaMasterPersistence: true,
    masteringReceiptPersistence: true,
    finisherHandoffPersistence: true,
    visibleRgbMutation: false,
    canvasMutation: false,
    creativeReview: false,
    candidateApproval: false,
    candidatePromotion: false,
    cloudinaryUpload: false,
    sequenceRelease: false,
    repositoryMutation: false,
    gitMutation: false,
    deployment: false,
    publication: false,
    runtimeActivation: false,
    forcePush: false,
  });
}

function allFalseApproval() {
  return Object.freeze({
    technical: false,
    creative: false,
    anatomy: false,
    identity: false,
    continuity: false,
    loop: false,
    runtime: false,
    publication: false,
  });
}

function jobFor(program, ordinal) {
  assert(
    Number.isSafeInteger(ordinal) && ordinal >= 1 && ordinal <= 10,
    'EVA_DENSE_ALPHA_ORDINAL_INVALID',
  );
  const job = program.production.jobs.find((entry) => entry.ordinal === ordinal);
  assert(job, 'EVA_DENSE_ALPHA_JOB_NOT_FOUND');
  return job;
}

function paeth(left, above, upperLeft) {
  const prediction = left + above - upperLeft;
  const dl = Math.abs(prediction - left);
  const da = Math.abs(prediction - above);
  const du = Math.abs(prediction - upperLeft);
  if (dl <= da && dl <= du) return left;
  return da <= du ? above : upperLeft;
}

function decodeValidatedRgbaPng(bytesInput) {
  const bytes = Buffer.from(bytesInput);
  assert(
    bytes.length >= 57 &&
      bytes.length <= MAXIMUM_PNG_BYTES &&
      bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE),
    'EVA_DENSE_ALPHA_PNG_INVALID',
  );
  let offset = PNG_SIGNATURE.length;
  const idat = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'IDAT') idat.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const stride = WIDTH * 4;
  const inflated = inflateSync(Buffer.concat(idat), {
    maxOutputLength: HEIGHT * (stride + 1),
  });
  assert(
    inflated.length === HEIGHT * (stride + 1),
    'EVA_DENSE_ALPHA_PNG_DECODED_SIZE_INVALID',
  );
  const pixels = Buffer.allocUnsafe(PIXELS * 4);
  for (let y = 0; y < HEIGHT; y += 1) {
    const source = y * (stride + 1);
    const filter = inflated[source];
    assert(filter >= 0 && filter <= 4, 'EVA_DENSE_ALPHA_PNG_FILTER_INVALID');
    const target = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[source + 1 + x];
      const left = x >= 4 ? pixels[target + x - 4] : 0;
      const above = y > 0 ? pixels[target - stride + x] : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[target - stride + x - 4] : 0;
      let value = raw;
      if (filter === 1) value += left;
      else if (filter === 2) value += above;
      else if (filter === 3) value += Math.floor((left + above) / 2);
      else if (filter === 4) value += paeth(left, above, upperLeft);
      pixels[target + x] = value & 0xff;
    }
  }
  return pixels;
}

function inspectSourceCandidate(bytesInput) {
  const bytes = Buffer.from(bytesInput);
  const evidence = inspectAvatarProviderCandidatePng(bytes, WIDTH, HEIGHT, {
    requireTransparentPixels: false,
  });
  assert(
    evidence.transparentPixels === 0 &&
      evidence.partialAlphaPixels === 0 &&
      evidence.opaquePixels === PIXELS,
    'EVA_DENSE_ALPHA_SOURCE_SPACE_CANDIDATE_INVALID',
    'Dense source-space candidate must be fully opaque before production alpha is applied.',
  );
  return Object.freeze({ evidence, pixels: decodeValidatedRgbaPng(bytes) });
}

function inspectAlphaMatte(bytesInput) {
  const bytes = Buffer.from(bytesInput);
  const evidence = inspectAvatarProviderCandidatePng(bytes, WIDTH, HEIGHT, {
    requireTransparentPixels: true,
  });
  const pixels = decodeValidatedRgbaPng(bytes);
  let foregroundPixels = 0;
  let partialAlphaPixels = 0;
  let edgeVisiblePixels = 0;
  const alpha = Buffer.allocUnsafe(PIXELS);
  for (let pixel = 0; pixel < PIXELS; pixel += 1) {
    const offset = pixel * 4;
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    const value = pixels[offset + 3];
    alpha[pixel] = value;
    if (value === 0) {
      assert(
        red === 0 && green === 0 && blue === 0,
        'EVA_DENSE_ALPHA_MATTE_RGB_PROFILE_INVALID',
      );
      continue;
    }
    assert(
      red === 255 && green === 255 && blue === 255,
      'EVA_DENSE_ALPHA_MATTE_RGB_PROFILE_INVALID',
    );
    foregroundPixels += 1;
    if (value !== 255) partialAlphaPixels += 1;
    const x = pixel % WIDTH;
    const y = Math.floor(pixel / WIDTH);
    if (x === 0 || y === 0 || x === WIDTH - 1 || y === HEIGHT - 1) {
      edgeVisiblePixels += 1;
    }
  }
  assert(
    foregroundPixels >= Math.ceil(PIXELS * 0.01) &&
      foregroundPixels <= Math.floor(PIXELS * 0.95) &&
      edgeVisiblePixels === 0 &&
      evidence.hiddenRgbTransparentPixels === 0,
    'EVA_DENSE_ALPHA_MATTE_PROFILE_INVALID',
  );
  return Object.freeze({
    evidence,
    pixels,
    alpha,
    foregroundPixels,
    transparentPixels: PIXELS - foregroundPixels,
    partialAlphaPixels,
    edgeVisiblePixels,
    alphaSha256: sha256Bytes(alpha),
  });
}

function selfHash(value, field, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label}_INVALID`);
  digest(value[field], `${label}.${field}`);
  const body = { ...value };
  delete body[field];
  assert(sha256Document(body) === value[field], `${label}_HASH_MISMATCH`);
  return deepFreeze(value);
}

export function compileEvaDenseMotionAlphaMatteReview({
  tenMasterProgram,
  ordinal,
  candidateAssurance,
  alphaMatteSha256,
  reviewer,
  evidenceSha256,
  reviewedAt,
  gateResults,
}) {
  const program = verifyEvaDenseMotionTenMasterProgram(tenMasterProgram);
  const job = jobFor(program, ordinal);
  const assurance = verifyEvaDenseMotionCandidateAssurance(candidateAssurance, {
    program,
  });
  digest(alphaMatteSha256, 'alphaMatteSha256');
  digest(evidenceSha256, 'evidenceSha256');
  timestamp(reviewedAt, 'reviewedAt');
  assert(
    reviewer?.actorClass === 'human' && typeof reviewer.actorId === 'string',
    'EVA_DENSE_ALPHA_MATTE_REVIEWER_INVALID',
  );
  identifier(reviewer.actorId, 'reviewer.actorId');
  exactKeys(gateResults, REQUIRED_MATTE_GATES, 'alpha matte gateResults');
  assert(
    REQUIRED_MATTE_GATES.every((gate) => gateResults[gate] === true),
    'EVA_DENSE_ALPHA_MATTE_REVIEW_GATE_FAILED',
  );
  const body = {
    schema: EVA_DENSE_MOTION_ALPHA_MATTE_REVIEW_SCHEMA,
    decision: 'approve-alpha-matte-for-deterministic-mastering',
    reviewedAt,
    programSha256: program.programSha256,
    ordinal,
    frameId: job.frameId,
    candidateAssuranceSha256: assurance.assuranceSha256,
    alphaMatteSha256,
    reviewer: Object.freeze({
      actorClass: 'human',
      actorId: reviewer.actorId,
      evidenceSha256,
    }),
    gateResults: Object.freeze({ ...gateResults }),
    grants: Object.freeze({
      deterministicAlphaMastering: true,
      creativeApproval: false,
      candidatePromotion: false,
      cloudinaryUpload: false,
      sequenceRelease: false,
      publication: false,
      runtimeActivation: false,
    }),
  };
  return deepFreeze({ ...body, reviewSha256: sha256Document(body) });
}

export function verifyEvaDenseMotionAlphaMatteReview(input, { program, assurance } = {}) {
  const value = selfHash(
    snapshotJsonValue(input, 'alpha matte review'),
    'reviewSha256',
    'EVA_DENSE_ALPHA_MATTE_REVIEW',
  );
  assert(
    value.schema === EVA_DENSE_MOTION_ALPHA_MATTE_REVIEW_SCHEMA &&
      value.decision === 'approve-alpha-matte-for-deterministic-mastering' &&
      value.reviewer?.actorClass === 'human' &&
      value.grants?.deterministicAlphaMastering === true &&
      value.grants?.creativeApproval === false &&
      value.grants?.cloudinaryUpload === false &&
      value.grants?.runtimeActivation === false,
    'EVA_DENSE_ALPHA_MATTE_REVIEW_INVALID',
  );
  timestamp(value.reviewedAt, 'reviewedAt');
  digest(value.programSha256, 'programSha256');
  digest(value.candidateAssuranceSha256, 'candidateAssuranceSha256');
  digest(value.alphaMatteSha256, 'alphaMatteSha256');
  digest(value.reviewer.evidenceSha256, 'reviewer.evidenceSha256');
  identifier(value.reviewer.actorId, 'reviewer.actorId');
  exactKeys(value.gateResults, REQUIRED_MATTE_GATES, 'alpha matte gateResults');
  assert(
    REQUIRED_MATTE_GATES.every((gate) => value.gateResults[gate] === true),
    'EVA_DENSE_ALPHA_MATTE_REVIEW_GATE_FAILED',
  );
  if (program) {
    const verifiedProgram = verifyEvaDenseMotionTenMasterProgram(program);
    const job = jobFor(verifiedProgram, value.ordinal);
    assert(
      value.programSha256 === verifiedProgram.programSha256 &&
        value.frameId === job.frameId,
      'EVA_DENSE_ALPHA_MATTE_REVIEW_PROGRAM_MISMATCH',
    );
  }
  if (assurance) {
    assert(
      value.candidateAssuranceSha256 === assurance.assuranceSha256,
      'EVA_DENSE_ALPHA_MATTE_REVIEW_ASSURANCE_MISMATCH',
    );
  }
  return value;
}

export function compileEvaDenseMotionAlphaMasteringAuthorization({
  tenMasterProgram,
  ordinal,
  candidateAssurance,
  alphaMatteReview,
  actorId,
  evidenceSha256,
  occurredAt,
  notAfter,
}) {
  const program = verifyEvaDenseMotionTenMasterProgram(tenMasterProgram);
  const job = jobFor(program, ordinal);
  const assurance = verifyEvaDenseMotionCandidateAssurance(candidateAssurance, {
    program,
  });
  const review = verifyEvaDenseMotionAlphaMatteReview(alphaMatteReview, {
    program,
    assurance,
  });
  identifier(actorId, 'actorId');
  digest(evidenceSha256, 'evidenceSha256');
  timestamp(occurredAt, 'occurredAt');
  timestamp(notAfter, 'notAfter');
  const lifetime = Date.parse(notAfter) - Date.parse(occurredAt);
  assert(
    lifetime >= 0 && lifetime <= EVA_DENSE_MOTION_MAXIMUM_AUTHORIZATION_MS,
    'EVA_DENSE_ALPHA_AUTHORIZATION_WINDOW_INVALID',
  );
  const body = {
    schema: EVA_DENSE_MOTION_ALPHA_MASTERING_AUTHORIZATION_SCHEMA,
    action: EVA_DENSE_MOTION_ALPHA_MASTERING_ACTION,
    actorClass: 'human',
    actorId,
    occurredAt,
    notAfter,
    evidenceSha256,
    programSha256: program.programSha256,
    ordinal,
    frameId: job.frameId,
    candidateAssuranceSha256: assurance.assuranceSha256,
    alphaMatteReviewSha256: review.reviewSha256,
    alphaMatteSha256: review.alphaMatteSha256,
    maximumExecutions: 1,
    grants: Object.freeze({
      deterministicAlphaMastering: true,
      frameFinisherHandoff: true,
      creativeApproval: false,
      cloudinaryUpload: false,
      sequenceRelease: false,
      publication: false,
      runtimeActivation: false,
    }),
  };
  return deepFreeze({ ...body, authorizationSha256: sha256Document(body) });
}

export function verifyEvaDenseMotionAlphaMasteringAuthorization(
  input,
  { program, assurance, review, masteredAt } = {},
) {
  const value = selfHash(
    snapshotJsonValue(input, 'alpha mastering authorization'),
    'authorizationSha256',
    'EVA_DENSE_ALPHA_AUTHORIZATION',
  );
  assert(
    value.schema === EVA_DENSE_MOTION_ALPHA_MASTERING_AUTHORIZATION_SCHEMA &&
      value.action === EVA_DENSE_MOTION_ALPHA_MASTERING_ACTION &&
      value.actorClass === 'human' &&
      value.maximumExecutions === 1 &&
      value.grants?.deterministicAlphaMastering === true &&
      value.grants?.frameFinisherHandoff === true &&
      value.grants?.creativeApproval === false &&
      value.grants?.runtimeActivation === false,
    'EVA_DENSE_ALPHA_AUTHORIZATION_INVALID',
  );
  identifier(value.actorId, 'actorId');
  timestamp(value.occurredAt, 'occurredAt');
  timestamp(value.notAfter, 'notAfter');
  digest(value.evidenceSha256, 'evidenceSha256');
  digest(value.programSha256, 'programSha256');
  digest(value.candidateAssuranceSha256, 'candidateAssuranceSha256');
  digest(value.alphaMatteReviewSha256, 'alphaMatteReviewSha256');
  digest(value.alphaMatteSha256, 'alphaMatteSha256');
  const lifetime = Date.parse(value.notAfter) - Date.parse(value.occurredAt);
  assert(
    lifetime >= 0 && lifetime <= EVA_DENSE_MOTION_MAXIMUM_AUTHORIZATION_MS,
    'EVA_DENSE_ALPHA_AUTHORIZATION_WINDOW_INVALID',
  );
  if (masteredAt) {
    timestamp(masteredAt, 'masteredAt');
    assert(
      Date.parse(masteredAt) >= Date.parse(value.occurredAt) &&
        Date.parse(masteredAt) <= Date.parse(value.notAfter),
      'EVA_DENSE_ALPHA_AUTHORIZATION_EXPIRED',
    );
  }
  if (program) {
    const verifiedProgram = verifyEvaDenseMotionTenMasterProgram(program);
    const job = jobFor(verifiedProgram, value.ordinal);
    assert(
      value.programSha256 === verifiedProgram.programSha256 &&
        value.frameId === job.frameId,
      'EVA_DENSE_ALPHA_AUTHORIZATION_PROGRAM_MISMATCH',
    );
  }
  if (assurance) {
    assert(
      value.candidateAssuranceSha256 === assurance.assuranceSha256,
      'EVA_DENSE_ALPHA_AUTHORIZATION_ASSURANCE_MISMATCH',
    );
  }
  if (review) {
    assert(
      value.alphaMatteReviewSha256 === review.reviewSha256 &&
        value.alphaMatteSha256 === review.alphaMatteSha256,
      'EVA_DENSE_ALPHA_AUTHORIZATION_REVIEW_MISMATCH',
    );
  }
  return value;
}

function outputPaths(job) {
  const mastered = canonicalRelativePath(job.outputs.alphaMastered, 'alphaMastered');
  const stem = mastered.slice(0, -4);
  return Object.freeze({
    mastered,
    report: canonicalRelativePath(job.outputs.alphaMasteringReceipt, 'alphaMasteringReceipt'),
    materialization: `${stem}.materialization.json`,
    finisherRequest: `${stem}.finisher-request.json`,
    finished: `${stem}.finished.png`,
    genericFinisherReport: `${stem}.frame-finisher.json`,
    genericReviewRequest: `${stem}.frame-review-request.json`,
  });
}

function buildHandoff({ program, job, assurance, matte, review, authorization, output, masteredAt }) {
  const paths = outputPaths(job);
  const visibleCandidateRgb = Buffer.allocUnsafe(matte.foregroundPixels * 3);
  const visibleOutputRgb = Buffer.allocUnsafe(matte.foregroundPixels * 3);
  const candidatePixels = assurance.candidatePixels;
  let visibleOffset = 0;
  let visibleRgbMismatches = 0;
  for (let pixel = 0; pixel < PIXELS; pixel += 1) {
    if (matte.alpha[pixel] === 0) continue;
    const offset = pixel * 4;
    for (let channel = 0; channel < 3; channel += 1) {
      const source = candidatePixels[offset + channel];
      const finished = output.pixels[offset + channel];
      visibleCandidateRgb[visibleOffset] = source;
      visibleOutputRgb[visibleOffset] = finished;
      if (source !== finished) visibleRgbMismatches += 1;
      visibleOffset += 1;
    }
  }
  assert(
    visibleRgbMismatches === 0 &&
      sha256Bytes(visibleCandidateRgb) === sha256Bytes(visibleOutputRgb),
    'EVA_DENSE_ALPHA_VISIBLE_RGB_DRIFT',
  );
  const reportBody = {
    schema: EVA_DENSE_MOTION_ALPHA_MASTERING_SCHEMA,
    protocolVersion: EVA_DENSE_MOTION_ALPHA_MASTERING_PROTOCOL_VERSION,
    status: 'alpha-mastered-awaiting-frame-finisher',
    masteredAt,
    programSha256: program.programSha256,
    jobId: job.jobId,
    ordinal: job.ordinal,
    frameId: job.frameId,
    source: Object.freeze({
      candidateAssuranceSha256: assurance.document.assuranceSha256,
      candidatePath: assurance.document.candidate.path,
      candidateSha256: assurance.document.candidate.sha256,
      sourceGitBlobSha1: job.source.gitBlobSha1,
      sourceSpaceEncoding: 'opaque-rgba8',
    }),
    alphaMatte: Object.freeze({
      path: paths.matte ?? job.outputs.alphaMatte,
      sha256: matte.evidence.sha256,
      alphaSha256: matte.alphaSha256,
      foregroundPixels: matte.foregroundPixels,
      transparentPixels: matte.transparentPixels,
      partialAlphaPixels: matte.partialAlphaPixels,
      edgeVisiblePixels: matte.edgeVisiblePixels,
      reviewSha256: review.reviewSha256,
    }),
    output: Object.freeze({
      path: paths.mastered,
      sha256: output.sha256,
      bytes: output.byteLength,
      width: output.width,
      height: output.height,
      visiblePixels: output.visiblePixels,
      transparentPixels: output.transparentPixels,
      partialAlphaPixels: output.partialAlphaPixels,
      hiddenRgbTransparentPixels: output.hiddenRgbTransparentPixels,
      edgeVisiblePixels: output.edgeVisiblePixels,
      visibleBounds: output.visibleBounds,
      visiblePixelSha256: output.visiblePixelSha256,
      alphaSha256: output.alphaSha256,
      visibleRgbSha256: sha256Bytes(visibleOutputRgb),
      createOnly: true,
      approvalState: 'unapproved',
    }),
    comparison: Object.freeze({
      visibleRgbMismatches,
      alphaPlaneMatchesReviewedMatte: output.alphaSha256 === matte.alphaSha256,
      hiddenRgbTransparentPixels: output.hiddenRgbTransparentPixels,
      canvasUnchanged: output.width === WIDTH && output.height === HEIGHT,
      registrationUnchanged: true,
    }),
    authorization: Object.freeze({
      action: authorization.action,
      actorClass: authorization.actorClass,
      actorId: authorization.actorId,
      occurredAt: authorization.occurredAt,
      notAfter: authorization.notAfter,
      evidenceSha256: authorization.evidenceSha256,
      authorizationSha256: authorization.authorizationSha256,
    }),
    gates: Object.freeze({
      denseCandidateAssurancePassed: true,
      reviewedAlphaMattePassed: true,
      visibleRgbInvariancePassed: true,
      transparentRgbCleanPassed: true,
      productionAlphaReady: true,
      frameFinisherRequired: true,
      creativeReviewRequired: true,
      candidateApproval: false,
      cloudinaryUploadAllowed: false,
      sequenceReleaseAllowed: false,
      publicationAllowed: false,
      runtimeActivationAllowed: false,
    }),
    authority: authority(),
  };
  const report = deepFreeze({
    ...reportBody,
    alphaMasteringSha256: sha256Document(reportBody),
  });
  const materializationId = `eva-dense-alpha:${report.alphaMasteringSha256.slice(0, 40)}`;
  const reviewedTargetPath = paths.finished;
  const finisherBody = {
    schema: AVATAR_PROVIDER_CANDIDATE_FINISHER_REQUEST_SCHEMA,
    protocolVersion: AVATAR_PROVIDER_CANDIDATE_PROTOCOL_VERSION,
    requestId: `avatar-finisher:${sha256Document({
      alphaMasteringSha256: report.alphaMasteringSha256,
      outputSha256: output.sha256,
    }).slice(0, 40)}`,
    materializationId,
    createdAt: masteredAt,
    sourceCommit: job.source.runtimeCommit,
    sessionId: `eva-dense:${program.programSha256.slice(0, 32)}`,
    characterId: 'eva-female',
    jobId: job.jobId,
    frameId: job.frameId,
    kind: 'sprite-frame',
    operation: 'dense-alpha-mastering',
    continuityPhase: 'dense-motion-final-master',
    sourceCandidate: Object.freeze({
      path: paths.mastered,
      sha256: output.sha256,
      bytes: output.byteLength,
      mediaType: 'image/png',
      width: WIDTH,
      height: HEIGHT,
      alphaMasteringSha256: report.alphaMasteringSha256,
    }),
    reviewedTargetPath,
    requiredOperations: REQUIRED_OPERATIONS,
    requiredReviewGates: REQUIRED_REVIEW_GATES,
    finalSha256RequiredBeforeInbetweenOrSequenceUse: true,
    candidateApproval: false,
    candidatePromotion: false,
    runtimeActivationAllowed: false,
    authority: authority(),
  };
  const finisherRequest = deepFreeze({
    ...finisherBody,
    finisherRequestSha256: sha256Document(finisherBody),
  });
  const materializationBody = {
    schema: AVATAR_PROVIDER_CANDIDATE_MATERIALIZATION_SCHEMA,
    protocolVersion: AVATAR_PROVIDER_CANDIDATE_PROTOCOL_VERSION,
    status: 'candidate-materialized-awaiting-frame-finisher',
    materializationId,
    materializedAt: masteredAt,
    sourceCommit: job.source.runtimeCommit,
    source: Object.freeze({
      programSha256: program.programSha256,
      alphaMasteringSha256: report.alphaMasteringSha256,
      candidateAssuranceSha256: assurance.document.assuranceSha256,
      alphaMatteReviewSha256: review.reviewSha256,
    }),
    output: Object.freeze({
      path: paths.mastered,
      reviewedTargetPath,
      sha256: output.sha256,
      bytes: output.byteLength,
      mediaType: 'image/png',
      width: WIDTH,
      height: HEIGHT,
      createOnly: true,
      unapproved: true,
    }),
    png: Object.freeze({
      mediaType: 'image/png',
      width: WIDTH,
      height: HEIGHT,
      bitDepth: 8,
      colorType: 6,
      channels: 4,
      interlaced: false,
      animated: false,
      byteLength: output.byteLength,
      sha256: output.sha256,
      visiblePixels: output.visiblePixels,
      transparentPixels: output.transparentPixels,
      partialAlphaPixels: output.partialAlphaPixels,
      hiddenRgbTransparentPixels: output.hiddenRgbTransparentPixels,
      edgeVisiblePixels: output.edgeVisiblePixels,
      visibleBounds: output.visibleBounds,
    }),
    authorization: Object.freeze({
      action: authorization.action,
      actorClass: authorization.actorClass,
      actorId: authorization.actorId,
      occurredAt: authorization.occurredAt,
      evidenceSha256: authorization.evidenceSha256,
    }),
    finisherHandoff: Object.freeze({
      path: paths.finisherRequest,
      finisherRequestSha256: finisherRequest.finisherRequestSha256,
    }),
    requiredNextSteps: Object.freeze([
      'run-avatar-frame-finisher',
      'perform-independent-technical-inspection',
      'record-named-human-creative-frame-review',
      'review-adjacent-frame-continuity',
      'review-final-to-first-loop-closure-when-applicable',
    ]),
    approvals: allFalseApproval(),
    authority: authority(),
  };
  const materializationReceipt = deepFreeze({
    ...materializationBody,
    materializationSha256: sha256Document(materializationBody),
  });
  return Object.freeze({
    paths,
    report,
    materializationReceipt,
    finisherRequest,
  });
}

export function compileEvaDenseMotionAlphaMastering({
  tenMasterProgram,
  ordinal,
  candidateAssurance,
  sourceSpaceCandidateBytes,
  sourceSpaceCandidatePath,
  alphaMatteBytes,
  alphaMattePath,
  alphaMatteReview,
  authorization,
  masteredAt = new Date().toISOString(),
}) {
  const program = verifyEvaDenseMotionTenMasterProgram(tenMasterProgram);
  const job = jobFor(program, ordinal);
  timestamp(masteredAt, 'masteredAt');
  const candidatePath = canonicalRelativePath(
    sourceSpaceCandidatePath,
    'sourceSpaceCandidatePath',
  );
  const mattePath = canonicalRelativePath(alphaMattePath, 'alphaMattePath');
  assert(
    candidatePath === job.outputs.denseCandidate &&
      mattePath === job.outputs.alphaMatte,
    'EVA_DENSE_ALPHA_INPUT_PATH_MISMATCH',
  );
  const candidate = inspectSourceCandidate(sourceSpaceCandidateBytes);
  const assuranceDocument = verifyEvaDenseMotionCandidateAssurance(
    candidateAssurance,
    { program },
  );
  assert(
    assuranceDocument.ordinal === ordinal &&
      assuranceDocument.candidate.sha256 === candidate.evidence.sha256,
    'EVA_DENSE_ALPHA_CANDIDATE_ASSURANCE_MISMATCH',
  );
  const matte = inspectAlphaMatte(alphaMatteBytes);
  const review = verifyEvaDenseMotionAlphaMatteReview(alphaMatteReview, {
    program,
    assurance: assuranceDocument,
  });
  assert(
    review.ordinal === ordinal && review.alphaMatteSha256 === matte.evidence.sha256,
    'EVA_DENSE_ALPHA_MATTE_REVIEW_MISMATCH',
  );
  const parsedAuthorization = verifyEvaDenseMotionAlphaMasteringAuthorization(
    authorization,
    { program, assurance: assuranceDocument, review, masteredAt },
  );

  const outputPixels = Buffer.allocUnsafe(candidate.pixels.length);
  for (let pixel = 0; pixel < PIXELS; pixel += 1) {
    const offset = pixel * 4;
    const alpha = matte.alpha[pixel];
    if (alpha === 0) {
      outputPixels[offset] = 0;
      outputPixels[offset + 1] = 0;
      outputPixels[offset + 2] = 0;
      outputPixels[offset + 3] = 0;
    } else {
      outputPixels[offset] = candidate.pixels[offset];
      outputPixels[offset + 1] = candidate.pixels[offset + 1];
      outputPixels[offset + 2] = candidate.pixels[offset + 2];
      outputPixels[offset + 3] = alpha;
    }
  }
  const outputBytes = encodeAvatarProviderFramePng(WIDTH, HEIGHT, outputPixels);
  const output = inspectAvatarProviderFramePng(outputBytes, WIDTH, HEIGHT);
  assert(
    output.alphaSha256 === matte.alphaSha256 &&
      output.hiddenRgbTransparentPixels === 0 &&
      output.edgeVisiblePixels === 0,
    'EVA_DENSE_ALPHA_OUTPUT_INVALID',
  );
  const handoff = buildHandoff({
    program,
    job,
    assurance: Object.freeze({
      document: assuranceDocument,
      candidatePixels: candidate.pixels,
    }),
    matte,
    review,
    authorization: parsedAuthorization,
    output,
    masteredAt,
  });
  return Object.freeze({
    status: handoff.report.status,
    outputBytes,
    ...handoff,
  });
}

function realDirectory(value, label) {
  const absolute = realpathSync(path.resolve(value));
  const metadata = lstatSync(absolute);
  assert(
    metadata.isDirectory() && !metadata.isSymbolicLink(),
    'EVA_DENSE_ALPHA_ROOT_INVALID',
    `${label} must be a real directory.`,
  );
  return absolute;
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function stableFile(filePath, label, maximumBytes, minimumBytes) {
  const absolute = realpathSync(path.resolve(filePath));
  const before = lstatSync(absolute);
  assert(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1 &&
      before.size >= minimumBytes &&
      before.size <= maximumBytes,
    'EVA_DENSE_ALPHA_INPUT_FILE_INVALID',
    label,
  );
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    assert(before[key] === after[key], 'EVA_DENSE_ALPHA_INPUT_CHANGED', label);
  }
  return Object.freeze({ absolute, bytes });
}

function stableJson(filePath, label) {
  const file = stableFile(filePath, label, MAXIMUM_JSON_BYTES, 2);
  let value;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes);
    assert(text.charCodeAt(0) !== 0xfeff, 'EVA_DENSE_ALPHA_BOM_FORBIDDEN');
    value = JSON.parse(text);
  } catch (error) {
    if (error?.code) throw error;
    assert(false, 'EVA_DENSE_ALPHA_JSON_INVALID', label);
  }
  return Object.freeze({ ...file, value });
}

function ensureDirectoryChain(root, relativeDirectory) {
  let current = root;
  if (!relativeDirectory || relativeDirectory === '.') return current;
  for (const part of relativeDirectory.split('/')) {
    current = path.join(current, part);
    if (!existsSync(current)) mkdirSync(current, { mode: 0o700 });
    const metadata = lstatSync(current);
    assert(
      metadata.isDirectory() &&
        !metadata.isSymbolicLink() &&
        isInside(root, realpathSync(current)),
      'EVA_DENSE_ALPHA_OUTPUT_PARENT_INVALID',
    );
  }
  return current;
}

function resolveWorkspace(root, relative, label, mustExist = true) {
  const canonical = canonicalRelativePath(relative, label);
  const absolute = path.join(root, ...canonical.split('/'));
  assert(isInside(root, absolute), 'EVA_DENSE_ALPHA_PATH_ESCAPE');
  if (!mustExist) return absolute;
  const real = realpathSync(absolute);
  assert(isInside(root, real), 'EVA_DENSE_ALPHA_PATH_ESCAPE');
  return real;
}

function safeUnlink(filePath) {
  try {
    unlinkSync(filePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function writeStaged(filePath, bytes) {
  const handle = openSync(filePath, 'wx', 0o600);
  try {
    writeFileSync(handle, bytes);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}

function publishBundle(root, entries) {
  const parentRelative = path.posix.dirname(entries[0].relative);
  assert(
    entries.every((entry) => path.posix.dirname(entry.relative) === parentRelative),
    'EVA_DENSE_ALPHA_BUNDLE_PARENT_MISMATCH',
  );
  const parent = ensureDirectoryChain(root, parentRelative);
  const finals = entries.map((entry) => ({
    ...entry,
    absolute: path.join(parent, path.posix.basename(entry.relative)),
  }));
  assert(
    finals.every((entry) => !existsSync(entry.absolute)),
    'EVA_DENSE_ALPHA_OUTPUT_ALREADY_EXISTS',
  );
  const token = randomBytes(12).toString('hex');
  const staged = finals.map((entry, index) =>
    path.join(parent, `.${path.basename(entry.absolute)}.${token}.${index}.tmp`),
  );
  const linked = [];
  try {
    for (let index = 0; index < finals.length; index += 1) {
      writeStaged(staged[index], finals[index].bytes);
    }
    for (let index = 0; index < finals.length; index += 1) {
      linkSync(staged[index], finals[index].absolute);
      linked.push(finals[index].absolute);
    }
    for (const temporary of staged) safeUnlink(temporary);
  } catch (error) {
    for (const finalPath of linked.reverse()) safeUnlink(finalPath);
    for (const temporary of staged) safeUnlink(temporary);
    throw error;
  }
  return Object.freeze(Object.fromEntries(finals.map((entry) => [entry.key, entry.absolute])));
}

export function masterEvaDenseMotionAlphaFiles({
  tenMasterProgram,
  ordinal,
  workspaceRoot: workspaceRootInput,
  candidateAssurancePath,
  alphaMatteReviewPath,
  authorizationPath,
  masteredAt,
}) {
  const program = verifyEvaDenseMotionTenMasterProgram(tenMasterProgram);
  const job = jobFor(program, ordinal);
  const root = realDirectory(workspaceRootInput, 'workspaceRoot');
  const expectedCandidate = resolveWorkspace(root, job.outputs.denseCandidate, 'denseCandidate');
  const expectedMatte = resolveWorkspace(root, job.outputs.alphaMatte, 'alphaMatte');
  const assuranceRecord = stableJson(candidateAssurancePath, 'candidate assurance');
  const reviewRecord = stableJson(alphaMatteReviewPath, 'alpha matte review');
  const authorizationRecord = stableJson(authorizationPath, 'alpha mastering authorization');
  assert(
    assuranceRecord.absolute === resolveWorkspace(root, job.outputs.candidateAssurance, 'candidateAssurance') &&
      reviewRecord.absolute === resolveWorkspace(root, job.outputs.alphaMatteReview, 'alphaMatteReview'),
    'EVA_DENSE_ALPHA_SEMANTIC_INPUT_PATH_MISMATCH',
  );
  const candidate = stableFile(expectedCandidate, 'dense candidate', MAXIMUM_PNG_BYTES, 57);
  const matte = stableFile(expectedMatte, 'alpha matte', MAXIMUM_PNG_BYTES, 57);
  const result = compileEvaDenseMotionAlphaMastering({
    tenMasterProgram: program,
    ordinal,
    candidateAssurance: assuranceRecord.value,
    sourceSpaceCandidateBytes: candidate.bytes,
    sourceSpaceCandidatePath: job.outputs.denseCandidate,
    alphaMatteBytes: matte.bytes,
    alphaMattePath: job.outputs.alphaMatte,
    alphaMatteReview: reviewRecord.value,
    authorization: authorizationRecord.value,
    ...(masteredAt ? { masteredAt } : {}),
  });
  const paths = publishBundle(root, [
    { key: 'mastered', relative: result.paths.mastered, bytes: result.outputBytes },
    { key: 'report', relative: result.paths.report, bytes: Buffer.from(`${JSON.stringify(result.report, null, 2)}\n`) },
    { key: 'materialization', relative: result.paths.materialization, bytes: Buffer.from(`${JSON.stringify(result.materializationReceipt, null, 2)}\n`) },
    { key: 'finisherRequest', relative: result.paths.finisherRequest, bytes: Buffer.from(`${JSON.stringify(result.finisherRequest, null, 2)}\n`) },
  ]);
  return deepFreeze({
    status: result.status,
    reused: false,
    ordinal,
    frameId: job.frameId,
    paths,
    alphaMasteringSha256: result.report.alphaMasteringSha256,
    materializationSha256: result.materializationReceipt.materializationSha256,
    finisherRequestSha256: result.finisherRequest.finisherRequestSha256,
    nextRequiredStage: 'avatar-frame-finisher',
    authority: authority(),
  });
}

export function evaDenseMotionAlphaMasteringCapabilities() {
  return deepFreeze({
    schema: EVA_DENSE_MOTION_ALPHA_MASTERING_CAPABILITIES_SCHEMA,
    protocolVersion: EVA_DENSE_MOTION_ALPHA_MASTERING_PROTOCOL_VERSION,
    exactTenMasterProgramBinding: true,
    exactCanvas: Object.freeze({ width: WIDTH, height: HEIGHT }),
    sourceSpaceCandidateMustBeOpaqueRgba8: true,
    namedHumanReviewedAlphaMatteRequired: true,
    maximumAuthorizationLifetimeHours: 24,
    maximumExecutionsPerAuthorization: 1,
    visibleRgbMutationAllowed: false,
    alphaMutationDeterministic: true,
    hiddenRgbTransparentPixelsMustBeZero: true,
    canvasEdgeVisiblePixelsMustBeZero: true,
    createOnlyOutputBundle: true,
    genericAvatarFrameFinisherHandoff: true,
    creativeApproval: false,
    cloudinaryUpload: false,
    sequenceRelease: false,
    publication: false,
    runtimeActivation: false,
    authority: authority(),
  });
}
