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
  allFalseAuthority,
  assert,
  canonicalRelativePath,
  deepFreeze,
  digest,
  exactKeys,
  identifier,
  isRecord,
  sha256Bytes,
  sha256Document,
  snapshotJsonValue,
  timestamp,
  verifySelfHash,
} from './avatar-final-pass-provider-candidate-common.mjs';
import {
  inspectAvatarProviderCandidatePng,
} from './avatar-final-pass-provider-candidate-png.mjs';
import {
  encodeAvatarProviderFramePng,
  inspectAvatarProviderFramePng,
} from './avatar-final-pass-provider-frame-finisher.mjs';

export const EVA_SOURCE_REPAIR_ALPHA_MASTERING_SCHEMA =
  'evavo.project-art-eva-source-repair-alpha-mastering.v1';
export const EVA_SOURCE_REPAIR_ALPHA_MASTERING_PROTOCOL_VERSION = '2026-08-15.1';
export const EVA_SOURCE_REPAIR_ALPHA_MASTERING_CAPABILITIES_SCHEMA =
  'evavo.project-art-eva-source-repair-alpha-mastering-capabilities.v1';
export const sha256EvaSourceRepairAlphaBytes = sha256Bytes;
export const sha256EvaSourceRepairAlphaDocument = sha256Document;

const CANDIDATE_ASSURANCE_SCHEMA =
  'evavo.project-art-eva-source-repair-candidate-assurance.v1';
const MATERIALIZATION_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-candidate-materialization.v1';
const FINISHER_REQUEST_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-candidate-finisher-request.v1';
const CANDIDATE_PROTOCOL_VERSION = '2026-08-13.2';
const WIDTH = 1024;
const HEIGHT = 1536;
const PIXELS = WIDTH * HEIGHT;
const MAXIMUM_PNG_BYTES = 64 * 1024 * 1024;
const AUTHORIZATION_ACTION = 'apply-production-alpha-once';
const OUTPUT_SUFFIX = '.alpha-mastered.png';
const REPORT_SUFFIX = '.alpha-mastering.json';
const MATERIALIZATION_SUFFIX = '.alpha-mastering.materialization.json';
const FINISHER_SUFFIX = '.alpha-mastering.finisher-request.json';

function falseAuthority() {
  return Object.freeze({
    providerExecution: false,
    creativeReview: false,
    candidateApproval: false,
    candidatePromotion: false,
    dependentInbetweenAdmission: false,
    sequenceRelease: false,
    repositoryMutation: false,
    gitMutation: false,
    deployment: false,
    publication: false,
    runtimeActivation: false,
    forcePush: false,
  });
}

function parseCandidateAssurance(input, frameId, candidatePath, candidateSha256) {
  const assurance = verifySelfHash(
    input,
    'assuranceSha256',
    'EVA source-repair candidate assurance',
  );
  exactKeys(
    assurance,
    [
      'schema',
      'phase',
      'frameId',
      'taskId',
      'inspectedAt',
      'canvas',
      'maskAssuranceSha256',
      'source',
      'mask',
      'candidate',
      'comparison',
      'gates',
      'nextRequiredActions',
      'authority',
      'assuranceSha256',
    ],
    'EVA source-repair candidate assurance',
  );
  assert(
    assurance.schema === CANDIDATE_ASSURANCE_SCHEMA &&
      assurance.phase === 'post-provider-source-space-candidate' &&
      assurance.frameId === frameId &&
      assurance.canvas?.width === WIDTH &&
      assurance.canvas?.height === HEIGHT &&
      assurance.candidate?.path === candidatePath &&
      assurance.candidate?.sha256 === candidateSha256 &&
      assurance.candidate?.encoding === 'rgba8' &&
      assurance.comparison?.changedProtectedPixels === 0 &&
      assurance.comparison?.protectedPixelPolicy ===
        'exact-rgba-source-space-invariance' &&
      assurance.gates?.sourceSpaceAssurancePassed === true &&
      assurance.gates?.protectedPixelInvariancePassed === true &&
      assurance.gates?.meaningfulMaskedEditPassed === true &&
      assurance.gates?.alphaMasteringRequired === true &&
      assurance.gates?.productionAlphaReady === false &&
      assurance.gates?.candidateApproval === false &&
      assurance.gates?.candidatePromotion === false &&
      assurance.gates?.runtimeActivationAllowed === false &&
      assurance.gates?.publicationAllowed === false,
    'EVA_SOURCE_REPAIR_ALPHA_CANDIDATE_ASSURANCE_INVALID',
  );
  allFalseAuthority(assurance.authority, 'candidate assurance.authority');
  return assurance;
}

function parseProviderSource(receiptInput, requestInput, frameId, candidatePath, candidateSha256) {
  const receipt = verifySelfHash(
    receiptInput,
    'materializationSha256',
    'provider materialization receipt',
  );
  const request = verifySelfHash(
    requestInput,
    'finisherRequestSha256',
    'provider finisher request',
  );
  assert(
    receipt.schema === MATERIALIZATION_SCHEMA &&
      receipt.protocolVersion === CANDIDATE_PROTOCOL_VERSION &&
      receipt.status === 'candidate-materialized-awaiting-frame-finisher' &&
      request.schema === FINISHER_REQUEST_SCHEMA &&
      request.protocolVersion === CANDIDATE_PROTOCOL_VERSION &&
      receipt.materializationId === request.materializationId &&
      receipt.output?.path === candidatePath &&
      receipt.output?.sha256 === candidateSha256 &&
      receipt.output?.width === WIDTH &&
      receipt.output?.height === HEIGHT &&
      receipt.output?.createOnly === true &&
      receipt.output?.unapproved === true &&
      request.frameId === frameId &&
      request.sourceCandidate?.path === candidatePath &&
      request.sourceCandidate?.sha256 === candidateSha256 &&
      request.sourceCandidate?.width === WIDTH &&
      request.sourceCandidate?.height === HEIGHT &&
      receipt.output?.reviewedTargetPath === request.reviewedTargetPath &&
      receipt.finisherHandoff?.finisherRequestSha256 ===
        request.finisherRequestSha256 &&
      request.finalSha256RequiredBeforeInbetweenOrSequenceUse === true &&
      request.candidateApproval === false &&
      request.candidatePromotion === false &&
      request.runtimeActivationAllowed === false,
    'EVA_SOURCE_REPAIR_ALPHA_PROVIDER_SOURCE_INVALID',
  );
  return Object.freeze({ receipt, request });
}

function parseAuthorization(input, frameId, assuranceSha256, matteSha256, masteredAt) {
  const value = snapshotJsonValue(input, 'alpha mastering authorization');
  exactKeys(
    value,
    [
      'action',
      'actorClass',
      'actorId',
      'occurredAt',
      'evidenceSha256',
      'frameId',
      'candidateAssuranceSha256',
      'alphaMatteSha256',
    ],
    'alpha mastering authorization',
  );
  identifier(value.actorId, 'alpha mastering authorization.actorId');
  timestamp(value.occurredAt, 'alpha mastering authorization.occurredAt');
  digest(value.evidenceSha256, 'alpha mastering authorization.evidenceSha256');
  assert(
    value.action === AUTHORIZATION_ACTION &&
      value.actorClass === 'human' &&
      value.frameId === frameId &&
      value.candidateAssuranceSha256 === assuranceSha256 &&
      value.alphaMatteSha256 === matteSha256 &&
      Date.parse(value.occurredAt) <= Date.parse(masteredAt),
    'EVA_SOURCE_REPAIR_ALPHA_AUTHORIZATION_INVALID',
  );
  return deepFreeze(value);
}

function idatPixels(bytes) {
  let offset = 8;
  const chunks = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'IDAT') chunks.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const stride = WIDTH * 4;
  const inflated = inflateSync(Buffer.concat(chunks), {
    maxOutputLength: HEIGHT * (stride + 1) + 1,
  });
  assert(
    inflated.length === HEIGHT * (stride + 1),
    'EVA_SOURCE_REPAIR_ALPHA_PNG_DECODED_SIZE_INVALID',
  );
  const pixels = Buffer.allocUnsafe(PIXELS * 4);
  for (let y = 0; y < HEIGHT; y += 1) {
    const source = y * (stride + 1);
    const filter = inflated[source];
    assert(filter >= 0 && filter <= 4, 'EVA_SOURCE_REPAIR_ALPHA_PNG_FILTER_INVALID');
    const target = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[source + 1 + x];
      const left = x >= 4 ? pixels[target + x - 4] : 0;
      const above = y > 0 ? pixels[target - stride + x] : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[target - stride + x - 4] : 0;
      let value;
      if (filter === 0) value = raw;
      else if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + above;
      else if (filter === 3) value = raw + Math.floor((left + above) / 2);
      else {
        const prediction = left + above - upperLeft;
        const dl = Math.abs(prediction - left);
        const da = Math.abs(prediction - above);
        const du = Math.abs(prediction - upperLeft);
        value = raw + (dl <= da && dl <= du ? left : da <= du ? above : upperLeft);
      }
      pixels[target + x] = value & 0xff;
    }
  }
  return pixels;
}

function inspectMatte(bytes, expectedSha256) {
  const png = inspectAvatarProviderCandidatePng(bytes, WIDTH, HEIGHT);
  assert(png.sha256 === expectedSha256, 'EVA_SOURCE_REPAIR_ALPHA_MATTE_HASH_MISMATCH');
  const pixels = idatPixels(Buffer.from(bytes));
  let foreground = 0;
  let partial = 0;
  let edge = 0;
  let minX = WIDTH;
  let minY = HEIGHT;
  let maxX = -1;
  let maxY = -1;
  const alpha = Buffer.allocUnsafe(PIXELS);
  for (let pixel = 0; pixel < PIXELS; pixel += 1) {
    const offset = pixel * 4;
    const a = pixels[offset + 3];
    alpha[pixel] = a;
    if (a === 0) {
      assert(
        pixels[offset] === 0 && pixels[offset + 1] === 0 && pixels[offset + 2] === 0,
        'EVA_SOURCE_REPAIR_ALPHA_MATTE_RGB_INVALID',
      );
      continue;
    }
    assert(
      pixels[offset] === 255 && pixels[offset + 1] === 255 && pixels[offset + 2] === 255,
      'EVA_SOURCE_REPAIR_ALPHA_MATTE_RGB_INVALID',
    );
    foreground += 1;
    if (a !== 255) partial += 1;
    const x = pixel % WIDTH;
    const y = Math.floor(pixel / WIDTH);
    if (x === 0 || y === 0 || x === WIDTH - 1 || y === HEIGHT - 1) edge += 1;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  assert(
    foreground >= Math.ceil(PIXELS * 0.01) &&
      foreground <= Math.floor(PIXELS * 0.95) &&
      edge === 0,
    'EVA_SOURCE_REPAIR_ALPHA_MATTE_PROFILE_INVALID',
  );
  return Object.freeze({
    png,
    pixels,
    alpha,
    foregroundPixels: foreground,
    transparentPixels: PIXELS - foreground,
    partialAlphaPixels: partial,
    edgeVisiblePixels: edge,
    visibleBounds: Object.freeze({
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    }),
    alphaSha256: sha256Bytes(alpha),
  });
}

function outputPaths(outputPath) {
  const mastered = canonicalRelativePath(outputPath, 'outputPath');
  assert(mastered.endsWith(OUTPUT_SUFFIX), 'EVA_SOURCE_REPAIR_ALPHA_OUTPUT_PATH_INVALID');
  const stem = mastered.slice(0, -OUTPUT_SUFFIX.length);
  return Object.freeze({
    mastered,
    report: `${stem}${REPORT_SUFFIX}`,
    materialization: `${stem}${MATERIALIZATION_SUFFIX}`,
    finisherRequest: `${stem}${FINISHER_SUFFIX}`,
  });
}

function buildDocuments({
  frameId,
  assurance,
  provider,
  candidatePath,
  candidate,
  mattePath,
  matte,
  outputPath,
  output,
  authorization,
  masteredAt,
}) {
  const paths = outputPaths(outputPath);
  const candidateVisibleRgb = Buffer.allocUnsafe(matte.foregroundPixels * 3);
  const outputVisibleRgb = Buffer.allocUnsafe(matte.foregroundPixels * 3);
  let visibleOffset = 0;
  let changedAlphaPixels = 0;
  let visibleRgbMismatches = 0;
  for (let pixel = 0; pixel < PIXELS; pixel += 1) {
    const sourceOffset = pixel * 4;
    const alpha = matte.alpha[pixel];
    if (alpha !== 255) changedAlphaPixels += 1;
    if (alpha > 0) {
      for (let channel = 0; channel < 3; channel += 1) {
        const candidateValue = candidate.pixels[sourceOffset + channel];
        const outputValue = output.pixels[sourceOffset + channel];
        candidateVisibleRgb[visibleOffset] = candidateValue;
        outputVisibleRgb[visibleOffset] = outputValue;
        if (candidateValue !== outputValue) visibleRgbMismatches += 1;
        visibleOffset += 1;
      }
    }
  }
  assert(
    visibleRgbMismatches === 0 &&
      sha256Bytes(candidateVisibleRgb) === sha256Bytes(outputVisibleRgb),
    'EVA_SOURCE_REPAIR_ALPHA_VISIBLE_RGB_DRIFT',
  );
  const body = {
    schema: EVA_SOURCE_REPAIR_ALPHA_MASTERING_SCHEMA,
    protocolVersion: EVA_SOURCE_REPAIR_ALPHA_MASTERING_PROTOCOL_VERSION,
    phase: 'source-space-to-production-alpha',
    status: 'alpha-mastered-awaiting-frame-finisher',
    frameId,
    masteredAt,
    source: Object.freeze({
      candidateAssuranceSha256: assurance.assuranceSha256,
      providerMaterializationSha256: provider.receipt.materializationSha256,
      providerFinisherRequestSha256: provider.request.finisherRequestSha256,
      candidatePath,
      candidateSha256: candidate.evidence.sha256,
      candidateDecodedRgbaSha256: sha256Bytes(candidate.pixels),
      sourceSpaceEncoding: 'opaque-rgba8',
    }),
    alphaMatte: Object.freeze({
      path: mattePath,
      sha256: matte.png.sha256,
      alphaSha256: matte.alphaSha256,
      foregroundPixels: matte.foregroundPixels,
      transparentPixels: matte.transparentPixels,
      partialAlphaPixels: matte.partialAlphaPixels,
      edgeVisiblePixels: matte.edgeVisiblePixels,
      visibleBounds: matte.visibleBounds,
      canonicalRgbProfile: 'transparent-black__visible-white',
    }),
    output: Object.freeze({
      path: paths.mastered,
      sha256: output.sha256,
      bytes: output.byteLength,
      width: WIDTH,
      height: HEIGHT,
      visiblePixels: output.visiblePixels,
      transparentPixels: output.transparentPixels,
      partialAlphaPixels: output.partialAlphaPixels,
      hiddenRgbTransparentPixels: output.hiddenRgbTransparentPixels,
      edgeVisiblePixels: output.edgeVisiblePixels,
      visibleBounds: output.visibleBounds,
      visiblePixelSha256: output.visiblePixelSha256,
      alphaSha256: output.alphaSha256,
      visibleRgbSha256: sha256Bytes(outputVisibleRgb),
      createOnly: true,
      approvalState: 'unapproved',
    }),
    comparison: Object.freeze({
      visibleRgbMismatches,
      alphaPlaneMatchesMatte: output.alphaSha256 === matte.alphaSha256,
      hiddenRgbTransparentPixels: output.hiddenRgbTransparentPixels,
      changedAlphaPixels,
      canvasUnchanged: true,
      registrationUnchanged: true,
    }),
    authorization,
    gates: Object.freeze({
      sourceSpaceCandidateAssurancePassed: true,
      alphaMatteProfilePassed: true,
      visibleRgbInvariancePassed: true,
      transparentRgbCleanPassed: true,
      productionAlphaReady: true,
      frameFinisherRequired: true,
      creativeReviewRequired: true,
      candidateApproval: false,
      candidatePromotion: false,
      sequenceReleaseAllowed: false,
      publicationAllowed: false,
      runtimeActivationAllowed: false,
    }),
    authority: falseAuthority(),
  };
  const report = deepFreeze({
    ...body,
    alphaMasteringSha256: sha256Document(body),
  });
  const materializationId = `eva-alpha-mastering:${report.alphaMasteringSha256.slice(0, 40)}`;
  const finisherBody = {
    schema: FINISHER_REQUEST_SCHEMA,
    protocolVersion: CANDIDATE_PROTOCOL_VERSION,
    requestId: `avatar-finisher:${sha256Document({
      alphaMasteringSha256: report.alphaMasteringSha256,
      outputSha256: output.sha256,
    }).slice(0, 40)}`,
    materializationId,
    createdAt: masteredAt,
    sourceCommit: provider.request.sourceCommit,
    sessionId: provider.request.sessionId,
    characterId: provider.request.characterId,
    jobId: provider.request.jobId,
    frameId,
    kind: provider.request.kind,
    operation: provider.request.operation,
    continuityPhase: provider.request.continuityPhase,
    sourceCandidate: Object.freeze({
      path: paths.mastered,
      sha256: output.sha256,
      bytes: output.byteLength,
      mediaType: 'image/png',
      width: WIDTH,
      height: HEIGHT,
      visiblePixels: output.visiblePixels,
      transparentPixels: output.transparentPixels,
      partialAlphaPixels: output.partialAlphaPixels,
      hiddenRgbTransparentPixels: output.hiddenRgbTransparentPixels,
      edgeVisiblePixels: output.edgeVisiblePixels,
      visibleBounds: output.visibleBounds,
      alphaMasteringSha256: report.alphaMasteringSha256,
    }),
    reviewedTargetPath: provider.request.reviewedTargetPath,
    requiredOperations: Object.freeze([
      'clear-hidden-rgb-under-fully-transparent-pixels',
      'preserve-canonical-canvas-and-registration',
      'run-avatar-frame-finisher',
      'run-native-scale-and-contact-sheet-inspection',
      'rerun-sequence-and-final-to-first-loop-closure-after-admission',
    ]),
    requiredReviewGates: Object.freeze([
      'technical',
      'hands-and-anatomy',
      'face-identity',
      'silhouette-and-registration',
      'adjacent-frame-continuity',
      'final-to-first-loop-closure-when-applicable',
    ]),
    finalSha256RequiredBeforeInbetweenOrSequenceUse: true,
    candidateApproval: false,
    candidatePromotion: false,
    runtimeActivationAllowed: false,
    authority: falseAuthority(),
  };
  const finisherRequest = deepFreeze({
    ...finisherBody,
    finisherRequestSha256: sha256Document(finisherBody),
  });
  const materializationBody = {
    schema: MATERIALIZATION_SCHEMA,
    protocolVersion: CANDIDATE_PROTOCOL_VERSION,
    status: 'candidate-materialized-awaiting-frame-finisher',
    materializationId,
    materializedAt: masteredAt,
    sourceCommit: provider.request.sourceCommit,
    source: Object.freeze({
      alphaMasteringSha256: report.alphaMasteringSha256,
      sourceCandidateSha256: candidate.evidence.sha256,
      alphaMatteSha256: matte.png.sha256,
      providerMaterializationSha256: provider.receipt.materializationSha256,
      providerFinisherRequestSha256: provider.request.finisherRequestSha256,
    }),
    output: Object.freeze({
      path: paths.mastered,
      reviewedTargetPath: provider.request.reviewedTargetPath,
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
    authorization,
    finisherHandoff: Object.freeze({
      path: paths.finisherRequest,
      finisherRequestSha256: finisherRequest.finisherRequestSha256,
    }),
    requiredNextSteps: Object.freeze([
      'rerun-avatar-frame-finisher',
      'review-hands-anatomy-face-identity-and-continuity',
      'record-final-reviewed-frame-sha256',
      'rerun-animation-timing-and-loop-closure',
    ]),
    approvals: Object.freeze({
      technical: false,
      creative: false,
      anatomy: false,
      identity: false,
      continuity: false,
      loop: false,
      runtime: false,
      publication: false,
    }),
    authority: falseAuthority(),
  };
  const materializationReceipt = deepFreeze({
    ...materializationBody,
    materializationSha256: sha256Document(materializationBody),
  });
  return Object.freeze({ paths, report, materializationReceipt, finisherRequest });
}

export function compileEvaSourceRepairAlphaMastering({
  frameId,
  candidateAssurance,
  providerMaterializationReceipt,
  providerFinisherRequest,
  sourceSpaceCandidateBytes,
  sourceSpaceCandidatePath,
  alphaMatteBytes,
  alphaMattePath,
  expectedAlphaMatteSha256,
  outputPath,
  authorization,
  masteredAt = new Date().toISOString(),
}) {
  identifier(frameId, 'frameId');
  timestamp(masteredAt, 'masteredAt');
  const candidatePath = canonicalRelativePath(
    sourceSpaceCandidatePath,
    'sourceSpaceCandidatePath',
  );
  const mattePath = canonicalRelativePath(alphaMattePath, 'alphaMattePath');
  digest(expectedAlphaMatteSha256, 'expectedAlphaMatteSha256');
  assert(candidatePath !== mattePath, 'EVA_SOURCE_REPAIR_ALPHA_INPUT_IDENTITY_CONFLICT');

  const candidateBytes = Buffer.from(sourceSpaceCandidateBytes);
  const candidateEvidence = inspectAvatarProviderCandidatePng(
    candidateBytes,
    WIDTH,
    HEIGHT,
    { requireTransparentPixels: false },
  );
  assert(
    candidateEvidence.transparentPixels === 0 &&
      candidateEvidence.partialAlphaPixels === 0 &&
      candidateEvidence.opaquePixels === PIXELS,
    'EVA_SOURCE_REPAIR_ALPHA_SOURCE_SPACE_CANDIDATE_INVALID',
  );
  const assurance = parseCandidateAssurance(
    candidateAssurance,
    frameId,
    candidatePath,
    candidateEvidence.sha256,
  );
  const provider = parseProviderSource(
    providerMaterializationReceipt,
    providerFinisherRequest,
    frameId,
    candidatePath,
    candidateEvidence.sha256,
  );
  const matte = inspectMatte(Buffer.from(alphaMatteBytes), expectedAlphaMatteSha256);
  const parsedAuthorization = parseAuthorization(
    authorization,
    frameId,
    assurance.assuranceSha256,
    matte.png.sha256,
    masteredAt,
  );
  const candidatePixels = idatPixels(candidateBytes);
  const outputPixels = Buffer.allocUnsafe(candidatePixels.length);
  for (let pixel = 0; pixel < PIXELS; pixel += 1) {
    const offset = pixel * 4;
    const alpha = matte.alpha[pixel];
    if (alpha === 0) {
      outputPixels[offset] = 0;
      outputPixels[offset + 1] = 0;
      outputPixels[offset + 2] = 0;
      outputPixels[offset + 3] = 0;
    } else {
      outputPixels[offset] = candidatePixels[offset];
      outputPixels[offset + 1] = candidatePixels[offset + 1];
      outputPixels[offset + 2] = candidatePixels[offset + 2];
      outputPixels[offset + 3] = alpha;
    }
  }
  const outputBytes = encodeAvatarProviderFramePng(WIDTH, HEIGHT, outputPixels);
  const output = inspectAvatarProviderFramePng(outputBytes, WIDTH, HEIGHT);
  assert(
    output.alphaSha256 === matte.alphaSha256 &&
      output.hiddenRgbTransparentPixels === 0 &&
      output.edgeVisiblePixels === 0 &&
      JSON.stringify(output.visibleBounds) === JSON.stringify(matte.visibleBounds),
    'EVA_SOURCE_REPAIR_ALPHA_OUTPUT_INVALID',
  );
  const documents = buildDocuments({
    frameId,
    assurance,
    provider,
    candidatePath,
    candidate: Object.freeze({ evidence: candidateEvidence, pixels: candidatePixels }),
    mattePath,
    matte,
    outputPath,
    output,
    authorization: parsedAuthorization,
    masteredAt,
  });
  return Object.freeze({
    status: documents.report.status,
    outputBytes,
    ...documents,
  });
}

function errorCode(error) {
  return error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : undefined;
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function realDirectory(value, label) {
  const absolute = realpathSync(path.resolve(value));
  const metadata = lstatSync(absolute);
  assert(
    metadata.isDirectory() && !metadata.isSymbolicLink(),
    'EVA_SOURCE_REPAIR_ALPHA_ROOT_INVALID',
    `${label} must be a real directory.`,
  );
  return absolute;
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
    'EVA_SOURCE_REPAIR_ALPHA_INPUT_FILE_INVALID',
    label,
  );
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    assert(before[key] === after[key], 'EVA_SOURCE_REPAIR_ALPHA_INPUT_CHANGED', label);
  }
  return Object.freeze({ absolute, bytes });
}

function stableJson(filePath, label) {
  const file = stableFile(filePath, label, 8 * 1024 * 1024, 2);
  let value;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes);
    assert(text.charCodeAt(0) !== 0xfeff, 'EVA_SOURCE_REPAIR_ALPHA_BOM_FORBIDDEN');
    value = JSON.parse(text);
  } catch (error) {
    if (error?.code) throw error;
    assert(false, 'EVA_SOURCE_REPAIR_ALPHA_JSON_INVALID', label);
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
      'EVA_SOURCE_REPAIR_ALPHA_OUTPUT_PARENT_INVALID',
    );
  }
  return current;
}

function absoluteOutputs(root, relativePaths) {
  const parent = path.posix.dirname(relativePaths.mastered);
  const parentAbsolute = ensureDirectoryChain(root, parent);
  const output = { parent: parentAbsolute };
  for (const [key, relative] of Object.entries(relativePaths)) {
    assert(path.posix.dirname(relative) === parent, 'EVA_SOURCE_REPAIR_ALPHA_BUNDLE_PATH_INVALID');
    const absolute = path.join(parentAbsolute, path.posix.basename(relative));
    assert(isInside(root, absolute), 'EVA_SOURCE_REPAIR_ALPHA_PATH_ESCAPE');
    output[key] = absolute;
  }
  return Object.freeze(output);
}

function safeUnlink(filePath) {
  try {
    unlinkSync(filePath);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
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

function publishBundle(absolute, result) {
  const entries = [
    [absolute.mastered, result.outputBytes],
    [absolute.report, Buffer.from(`${JSON.stringify(result.report, null, 2)}\n`)],
    [
      absolute.materialization,
      Buffer.from(`${JSON.stringify(result.materializationReceipt, null, 2)}\n`),
    ],
    [
      absolute.finisherRequest,
      Buffer.from(`${JSON.stringify(result.finisherRequest, null, 2)}\n`),
    ],
  ];
  assert(
    entries.every(([finalPath]) => !existsSync(finalPath)),
    'EVA_SOURCE_REPAIR_ALPHA_OUTPUT_ALREADY_EXISTS',
  );
  const token = randomBytes(12).toString('hex');
  const staged = entries.map(([finalPath], index) =>
    path.join(absolute.parent, `.${path.basename(finalPath)}.${token}.${index}.tmp`),
  );
  const linked = [];
  try {
    for (let index = 0; index < entries.length; index += 1) {
      writeStaged(staged[index], entries[index][1]);
    }
    for (let index = 0; index < entries.length; index += 1) {
      linkSync(staged[index], entries[index][0]);
      linked.push(entries[index][0]);
    }
    for (const temporary of staged) safeUnlink(temporary);
  } catch (error) {
    for (const finalPath of linked.reverse()) safeUnlink(finalPath);
    for (const temporary of staged) safeUnlink(temporary);
    throw error;
  }
  for (let index = 0; index < entries.length; index += 1) {
    const metadata = lstatSync(entries[index][0]);
    assert(
      metadata.isFile() &&
        !metadata.isSymbolicLink() &&
        metadata.nlink === 1 &&
        metadata.size === entries[index][1].length,
      'EVA_SOURCE_REPAIR_ALPHA_PUBLICATION_INVALID',
    );
  }
}

export function compileEvaSourceRepairAlphaMasteringFiles({
  workspaceRoot,
  frameId,
  candidateAssuranceFile,
  providerMaterializationReceiptFile,
  providerFinisherRequestFile,
  sourceSpaceCandidateFile,
  sourceSpaceCandidatePath,
  alphaMatteFile,
  alphaMattePath,
  expectedAlphaMatteSha256,
  outputPath,
  authorization,
  masteredAt,
}) {
  const root = realDirectory(workspaceRoot, 'workspaceRoot');
  const resolveInput = (value, label) => {
    const lexical = path.isAbsolute(value)
      ? path.resolve(value)
      : path.join(root, ...canonicalRelativePath(value, label).split('/'));
    const absolute = realpathSync(lexical);
    assert(isInside(root, absolute), 'EVA_SOURCE_REPAIR_ALPHA_PATH_ESCAPE');
    return absolute;
  };
  const assurance = stableJson(resolveInput(candidateAssuranceFile, 'candidateAssuranceFile'), 'candidate assurance');
  const receipt = stableJson(
    resolveInput(providerMaterializationReceiptFile, 'providerMaterializationReceiptFile'),
    'provider materialization receipt',
  );
  const request = stableJson(
    resolveInput(providerFinisherRequestFile, 'providerFinisherRequestFile'),
    'provider finisher request',
  );
  const candidate = stableFile(
    resolveInput(sourceSpaceCandidateFile, 'sourceSpaceCandidateFile'),
    'source-space candidate',
    MAXIMUM_PNG_BYTES,
    57,
  );
  const matte = stableFile(
    resolveInput(alphaMatteFile, 'alphaMatteFile'),
    'alpha matte',
    MAXIMUM_PNG_BYTES,
    57,
  );
  assert(
    new Set([
      assurance.absolute,
      receipt.absolute,
      request.absolute,
      candidate.absolute,
      matte.absolute,
    ]).size === 5,
    'EVA_SOURCE_REPAIR_ALPHA_INPUT_IDENTITY_CONFLICT',
  );
  const result = compileEvaSourceRepairAlphaMastering({
    frameId,
    candidateAssurance: assurance.value,
    providerMaterializationReceipt: receipt.value,
    providerFinisherRequest: request.value,
    sourceSpaceCandidateBytes: candidate.bytes,
    sourceSpaceCandidatePath,
    alphaMatteBytes: matte.bytes,
    alphaMattePath,
    expectedAlphaMatteSha256,
    outputPath,
    authorization: {
      ...authorization,
      frameId,
      candidateAssuranceSha256: assurance.value.assuranceSha256,
      alphaMatteSha256: sha256Bytes(matte.bytes),
    },
    ...(masteredAt ? { masteredAt } : {}),
  });
  const absolute = absoluteOutputs(root, result.paths);
  publishBundle(absolute, result);
  return Object.freeze({
    ...result,
    outputFiles: Object.freeze({
      mastered: absolute.mastered,
      report: absolute.report,
      materialization: absolute.materialization,
      finisherRequest: absolute.finisherRequest,
    }),
  });
}

export function verifyEvaSourceRepairAlphaMasteringDocument(value) {
  const report = verifySelfHash(
    value,
    'alphaMasteringSha256',
    'EVA source-repair alpha mastering report',
  );
  assert(
    report.schema === EVA_SOURCE_REPAIR_ALPHA_MASTERING_SCHEMA &&
      report.protocolVersion === EVA_SOURCE_REPAIR_ALPHA_MASTERING_PROTOCOL_VERSION &&
      report.status === 'alpha-mastered-awaiting-frame-finisher' &&
      report.gates?.productionAlphaReady === true &&
      report.gates?.candidateApproval === false &&
      report.gates?.candidatePromotion === false &&
      report.gates?.sequenceReleaseAllowed === false &&
      report.gates?.publicationAllowed === false &&
      report.gates?.runtimeActivationAllowed === false &&
      report.comparison?.visibleRgbMismatches === 0 &&
      report.comparison?.alphaPlaneMatchesMatte === true &&
      report.comparison?.hiddenRgbTransparentPixels === 0,
    'EVA_SOURCE_REPAIR_ALPHA_REPORT_INVALID',
  );
  allFalseAuthority(report.authority, 'alpha mastering report.authority');
  return report;
}

export function evaSourceRepairAlphaMasteringCapabilities() {
  return deepFreeze({
    schema: EVA_SOURCE_REPAIR_ALPHA_MASTERING_CAPABILITIES_SCHEMA,
    protocolVersion: EVA_SOURCE_REPAIR_ALPHA_MASTERING_PROTOCOL_VERSION,
    canvas: Object.freeze({ width: WIDTH, height: HEIGHT }),
    namedHumanAuthorizationRequired: true,
    sourceSpaceCandidateAssuranceRequired: true,
    canonicalAlphaMatteRequired: true,
    visibleRgbInvarianceRequired: true,
    transparentRgbCleared: true,
    createOnlyTransactionalBundle: true,
    frameFinisherCompatibleHandoff: true,
    providerExecution: false,
    creativeReview: false,
    candidateApproval: false,
    candidatePromotion: false,
    sequenceRelease: false,
    repositoryMutation: false,
    gitMutation: false,
    deployment: false,
    publication: false,
    runtimeActivation: false,
    forcePush: false,
  });
}
