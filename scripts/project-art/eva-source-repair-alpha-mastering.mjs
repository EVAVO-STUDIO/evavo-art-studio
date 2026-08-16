import { randomBytes } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import {
  AUTHORIZATION_ACTION as MATERIALIZATION_AUTHORIZATION_ACTION,
  AVATAR_PROVIDER_CANDIDATE_FINISHER_REQUEST_SCHEMA,
  AVATAR_PROVIDER_CANDIDATE_MATERIALIZATION_SCHEMA,
  AVATAR_PROVIDER_CANDIDATE_PROTOCOL_VERSION,
  CANDIDATE_MATERIALIZATION_AUTHORITY_KEYS,
  FINISHER_REQUEST_AUTHORITY_KEYS,
} from './avatar-final-pass-provider-candidate-constants.mjs';
import {
  artifactId,
  assert,
  boundedText,
  canonicalRelativePath,
  deepFreeze,
  digest,
  exactKeys,
  providerRequestId,
  sha256Bytes,
  sourceCommit,
  timestamp,
  verifySelfHash,
} from './avatar-final-pass-provider-candidate-common.mjs';
import {
  EVA_SOURCE_REPAIR_ALPHA_MASTERING_CAPABILITIES_SCHEMA,
  EVA_SOURCE_REPAIR_ALPHA_MASTERING_PROTOCOL_VERSION,
  EVA_SOURCE_REPAIR_ALPHA_MASTERING_SCHEMA,
  compileEvaSourceRepairAlphaMastering as compileCore,
  compileEvaSourceRepairAlphaMasteringFiles as compileFilesCore,
  evaSourceRepairAlphaMasteringCapabilities as coreCapabilities,
  sha256EvaSourceRepairAlphaBytes,
  sha256EvaSourceRepairAlphaDocument,
  verifyEvaSourceRepairAlphaMasteringDocument as verifyCoreReport,
} from './eva-source-repair-alpha-mastering-core.mjs';

export {
  EVA_SOURCE_REPAIR_ALPHA_MASTERING_CAPABILITIES_SCHEMA,
  EVA_SOURCE_REPAIR_ALPHA_MASTERING_PROTOCOL_VERSION,
  EVA_SOURCE_REPAIR_ALPHA_MASTERING_SCHEMA,
  sha256EvaSourceRepairAlphaBytes,
  sha256EvaSourceRepairAlphaDocument,
};

const WIDTH = 1024;
const HEIGHT = 1536;
const PIXELS = WIDTH * HEIGHT;
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_PNG_BYTES = 64 * 1024 * 1024;
const MATERIALIZATION_TRUE_KEYS = new Set([
  'artifactRead',
  'evidenceRead',
  'candidateMaterialization',
  'receiptPersistence',
  'finisherRequestPersistence',
]);
const MATERIALIZATION_SOURCE_KEYS = Object.freeze([
  'runtimeDispatchSha256',
  'runtimeBindingSha256',
  'runtimeOutcomeSha256',
  'providerRequestId',
  'providerRequestSha256',
  'compiledPromptSha256',
  'candidateArtifactId',
  'candidateArtifactDescriptorSha256',
  'evidenceArtifactId',
  'evidenceArtifactDescriptorSha256',
  'providerEvidenceContentSha256',
]);
const PNG_KEYS = Object.freeze([
  'mediaType',
  'width',
  'height',
  'bitDepth',
  'colorType',
  'channels',
  'interlaced',
  'animated',
  'byteLength',
  'sha256',
  'chunkCount',
  'idatChunkCount',
  'visiblePixels',
  'transparentPixels',
  'partialAlphaPixels',
  'opaquePixels',
  'hiddenRgbTransparentPixels',
  'edgeVisiblePixels',
  'visibleBounds',
]);
const APPROVAL_KEYS = Object.freeze([
  'technical',
  'creative',
  'anatomy',
  'identity',
  'continuity',
  'loop',
  'runtime',
  'publication',
]);
const REQUIRED_OPERATIONS = Object.freeze([
  'clear-hidden-rgb-under-fully-transparent-pixels',
  'preserve-canonical-canvas-and-registration',
  'run-avatar-frame-finisher',
  'run-native-scale-and-contact-sheet-inspection',
  'rerun-sequence-and-final-to-first-loop-closure-after-admission',
]);
const REQUIRED_REVIEW_GATES = Object.freeze([
  'technical',
  'hands-and-anatomy',
  'face-identity',
  'silhouette-and-registration',
  'adjacent-frame-continuity',
  'final-to-first-loop-closure-when-applicable',
]);
const REQUIRED_NEXT_STEPS = Object.freeze([
  'rerun-avatar-frame-finisher',
  'review-hands-anatomy-face-identity-and-continuity',
  'record-final-reviewed-frame-sha256',
  'rerun-animation-timing-and-loop-closure',
  'admit-frame-to-dependent-inbetween-or-sequence-only-after-review',
]);
const ALPHA_AUTHORITY_KEYS = Object.freeze([
  'providerExecution',
  'creativeReview',
  'candidateApproval',
  'candidatePromotion',
  'dependentInbetweenAdmission',
  'sequenceRelease',
  'repositoryMutation',
  'gitMutation',
  'deployment',
  'publication',
  'runtimeActivation',
  'forcePush',
]);

function exactAuthority(value, keys, enabled, label) {
  exactKeys(value, keys, label);
  for (const key of keys) {
    assert(
      typeof value[key] === 'boolean' && value[key] === enabled.has(key),
      'EVA_SOURCE_REPAIR_ALPHA_PROVIDER_AUTHORITY_INVALID',
      `${label}.${key}`,
    );
  }
}

function allFalse(value, keys, label) {
  exactAuthority(value, keys, new Set(), label);
}

function exactStringArray(value, expected, label) {
  assert(
    Array.isArray(value) &&
      value.length === expected.length &&
      value.every((entry, index) => entry === expected[index]),
    'EVA_SOURCE_REPAIR_ALPHA_PROVIDER_SEQUENCE_INVALID',
    label,
  );
}

function sameBounds(left, right) {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function strictProviderDocuments({
  receiptInput,
  requestInput,
  frameId,
  candidatePath,
  candidateSha256,
  candidateBytes,
  masteredAt,
}) {
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
  exactKeys(
    receipt,
    [
      'schema', 'protocolVersion', 'status', 'materializationId',
      'materializedAt', 'sourceCommit', 'source', 'output', 'png',
      'authorization', 'finisherHandoff', 'requiredNextSteps', 'approvals',
      'authority', 'materializationSha256',
    ],
    'provider materialization receipt',
  );
  exactKeys(
    request,
    [
      'schema', 'protocolVersion', 'requestId', 'materializationId',
      'createdAt', 'sourceCommit', 'sessionId', 'characterId', 'jobId',
      'frameId', 'kind', 'operation', 'continuityPhase', 'sourceCandidate',
      'reviewedTargetPath', 'requiredOperations', 'requiredReviewGates',
      'finalSha256RequiredBeforeInbetweenOrSequenceUse', 'candidateApproval',
      'candidatePromotion', 'runtimeActivationAllowed', 'authority',
      'finisherRequestSha256',
    ],
    'provider finisher request',
  );
  exactKeys(receipt.source, MATERIALIZATION_SOURCE_KEYS, 'provider materialization receipt.source');
  exactKeys(
    receipt.output,
    ['path', 'reviewedTargetPath', 'sha256', 'bytes', 'mediaType', 'width', 'height', 'createOnly', 'unapproved'],
    'provider materialization receipt.output',
  );
  exactKeys(receipt.png, PNG_KEYS, 'provider materialization receipt.png');
  exactKeys(
    receipt.finisherHandoff,
    ['path', 'finisherRequestSha256'],
    'provider materialization receipt.finisherHandoff',
  );
  exactKeys(
    receipt.authorization,
    ['action', 'actorClass', 'actorId', 'occurredAt', 'evidenceSha256'],
    'provider materialization receipt.authorization',
  );
  exactKeys(receipt.approvals, APPROVAL_KEYS, 'provider materialization receipt.approvals');
  exactKeys(
    request.sourceCandidate,
    [
      'path', 'sha256', 'bytes', 'mediaType', 'width', 'height',
      'visiblePixels', 'transparentPixels', 'partialAlphaPixels',
      'hiddenRgbTransparentPixels', 'edgeVisiblePixels', 'visibleBounds',
      'artifactId', 'artifactDescriptorSha256', 'evidenceArtifactId',
      'evidenceDescriptorSha256', 'runtimeOutcomeSha256',
    ],
    'provider finisher request.sourceCandidate',
  );
  exactKeys(receipt.png.visibleBounds, ['x', 'y', 'width', 'height'], 'provider materialization receipt.png.visibleBounds');
  exactKeys(request.sourceCandidate.visibleBounds, ['x', 'y', 'width', 'height'], 'provider finisher request.sourceCandidate.visibleBounds');
  exactAuthority(
    receipt.authority,
    CANDIDATE_MATERIALIZATION_AUTHORITY_KEYS,
    MATERIALIZATION_TRUE_KEYS,
    'provider materialization receipt.authority',
  );
  allFalse(
    request.authority,
    FINISHER_REQUEST_AUTHORITY_KEYS,
    'provider finisher request.authority',
  );
  exactStringArray(request.requiredOperations, REQUIRED_OPERATIONS, 'provider finisher request.requiredOperations');
  exactStringArray(request.requiredReviewGates, REQUIRED_REVIEW_GATES, 'provider finisher request.requiredReviewGates');
  exactStringArray(receipt.requiredNextSteps, REQUIRED_NEXT_STEPS, 'provider materialization receipt.requiredNextSteps');

  sourceCommit(receipt.sourceCommit, 'provider materialization receipt.sourceCommit');
  sourceCommit(request.sourceCommit, 'provider finisher request.sourceCommit');
  providerRequestId(receipt.source.providerRequestId, 'provider materialization receipt.source.providerRequestId');
  artifactId(receipt.source.candidateArtifactId, 'provider materialization receipt.source.candidateArtifactId');
  artifactId(receipt.source.evidenceArtifactId, 'provider materialization receipt.source.evidenceArtifactId');
  artifactId(request.sourceCandidate.artifactId, 'provider finisher request.sourceCandidate.artifactId');
  artifactId(request.sourceCandidate.evidenceArtifactId, 'provider finisher request.sourceCandidate.evidenceArtifactId');
  for (const key of [
    'runtimeDispatchSha256',
    'runtimeBindingSha256',
    'runtimeOutcomeSha256',
    'providerRequestSha256',
    'compiledPromptSha256',
    'candidateArtifactDescriptorSha256',
    'evidenceArtifactDescriptorSha256',
    'providerEvidenceContentSha256',
  ]) {
    digest(receipt.source[key], `provider materialization receipt.source.${key}`);
  }
  for (const key of [
    'artifactDescriptorSha256',
    'evidenceDescriptorSha256',
    'runtimeOutcomeSha256',
  ]) {
    digest(request.sourceCandidate[key], `provider finisher request.sourceCandidate.${key}`);
  }
  digest(receipt.authorization.evidenceSha256, 'provider materialization receipt.authorization.evidenceSha256');
  boundedText(receipt.authorization.actorId, 'provider materialization receipt.authorization.actorId', 1, 256);
  timestamp(receipt.materializedAt, 'provider materializedAt');
  timestamp(request.createdAt, 'provider finisher createdAt');
  timestamp(receipt.authorization.occurredAt, 'provider authorization occurredAt');
  timestamp(masteredAt, 'masteredAt');
  const reviewedTarget = canonicalRelativePath(
    request.reviewedTargetPath,
    'provider reviewedTargetPath',
  );
  canonicalRelativePath(receipt.finisherHandoff.path, 'provider finisher handoff path');

  assert(
    receipt.schema === AVATAR_PROVIDER_CANDIDATE_MATERIALIZATION_SCHEMA &&
      request.schema === AVATAR_PROVIDER_CANDIDATE_FINISHER_REQUEST_SCHEMA &&
      receipt.protocolVersion === AVATAR_PROVIDER_CANDIDATE_PROTOCOL_VERSION &&
      request.protocolVersion === AVATAR_PROVIDER_CANDIDATE_PROTOCOL_VERSION &&
      receipt.status === 'candidate-materialized-awaiting-frame-finisher' &&
      receipt.sourceCommit === request.sourceCommit &&
      receipt.materializationId === request.materializationId &&
      receipt.materializedAt === request.createdAt &&
      Date.parse(receipt.authorization.occurredAt) <= Date.parse(receipt.materializedAt) &&
      Date.parse(receipt.materializedAt) <= Date.parse(masteredAt) &&
      receipt.authorization.action === MATERIALIZATION_AUTHORIZATION_ACTION &&
      (receipt.authorization.actorClass === 'human' || receipt.authorization.actorClass === 'agent') &&
      canonicalRelativePath(receipt.output.path, 'provider output.path') === candidatePath &&
      canonicalRelativePath(request.sourceCandidate.path, 'provider sourceCandidate.path') === candidatePath &&
      canonicalRelativePath(receipt.output.reviewedTargetPath, 'provider output.reviewedTargetPath') === reviewedTarget &&
      receipt.output.sha256 === candidateSha256 &&
      request.sourceCandidate.sha256 === candidateSha256 &&
      receipt.output.bytes === candidateBytes &&
      request.sourceCandidate.bytes === candidateBytes &&
      receipt.png.sha256 === candidateSha256 &&
      receipt.png.byteLength === candidateBytes &&
      receipt.output.mediaType === 'image/png' &&
      request.sourceCandidate.mediaType === 'image/png' &&
      receipt.png.mediaType === 'image/png' &&
      receipt.output.width === WIDTH && receipt.output.height === HEIGHT &&
      request.sourceCandidate.width === WIDTH && request.sourceCandidate.height === HEIGHT &&
      receipt.png.width === WIDTH && receipt.png.height === HEIGHT &&
      receipt.png.bitDepth === 8 && receipt.png.colorType === 6 &&
      receipt.png.channels === 4 && receipt.png.interlaced === false &&
      receipt.png.animated === false &&
      receipt.png.visiblePixels === PIXELS &&
      receipt.png.transparentPixels === 0 &&
      receipt.png.partialAlphaPixels === 0 &&
      receipt.png.opaquePixels === PIXELS &&
      receipt.png.hiddenRgbTransparentPixels === 0 &&
      request.sourceCandidate.visiblePixels === receipt.png.visiblePixels &&
      request.sourceCandidate.transparentPixels === receipt.png.transparentPixels &&
      request.sourceCandidate.partialAlphaPixels === receipt.png.partialAlphaPixels &&
      request.sourceCandidate.hiddenRgbTransparentPixels === receipt.png.hiddenRgbTransparentPixels &&
      request.sourceCandidate.edgeVisiblePixels === receipt.png.edgeVisiblePixels &&
      sameBounds(request.sourceCandidate.visibleBounds, receipt.png.visibleBounds) &&
      receipt.source.runtimeOutcomeSha256 === request.sourceCandidate.runtimeOutcomeSha256 &&
      receipt.source.candidateArtifactId === request.sourceCandidate.artifactId &&
      receipt.source.candidateArtifactDescriptorSha256 === request.sourceCandidate.artifactDescriptorSha256 &&
      receipt.source.evidenceArtifactId === request.sourceCandidate.evidenceArtifactId &&
      receipt.source.evidenceArtifactDescriptorSha256 === request.sourceCandidate.evidenceDescriptorSha256 &&
      receipt.output.createOnly === true && receipt.output.unapproved === true &&
      receipt.finisherHandoff.finisherRequestSha256 === request.finisherRequestSha256 &&
      request.frameId === frameId &&
      request.finalSha256RequiredBeforeInbetweenOrSequenceUse === true &&
      request.candidateApproval === false && request.candidatePromotion === false &&
      request.runtimeActivationAllowed === false &&
      Object.values(receipt.approvals).every((value) => value === false),
    'EVA_SOURCE_REPAIR_ALPHA_PROVIDER_SOURCE_INVALID',
  );
  return Object.freeze({ receipt, request });
}

function strictReport(value) {
  const report = verifyCoreReport(value);
  exactKeys(
    report,
    [
      'schema', 'protocolVersion', 'phase', 'status', 'frameId', 'masteredAt',
      'source', 'alphaMatte', 'output', 'comparison', 'authorization',
      'gates', 'authority', 'alphaMasteringSha256',
    ],
    'EVA source-repair alpha mastering report',
  );
  allFalse(report.authority, ALPHA_AUTHORITY_KEYS, 'alpha mastering report.authority');
  assert(
    report.phase === 'source-space-to-production-alpha' &&
      report.output?.hiddenRgbTransparentPixels === 0 &&
      report.output?.createOnly === true &&
      report.output?.approvalState === 'unapproved' &&
      report.comparison?.visibleRgbMismatches === 0 &&
      report.comparison?.alphaPlaneMatchesMatte === true &&
      report.gates?.productionAlphaReady === true &&
      report.gates?.frameFinisherRequired === true &&
      report.gates?.creativeReviewRequired === true &&
      report.gates?.candidateApproval === false &&
      report.gates?.candidatePromotion === false &&
      report.gates?.sequenceReleaseAllowed === false &&
      report.gates?.publicationAllowed === false &&
      report.gates?.runtimeActivationAllowed === false,
    'EVA_SOURCE_REPAIR_ALPHA_REPORT_INVALID',
  );
  return report;
}

export function compileEvaSourceRepairAlphaMastering(input) {
  const masteredAt = input.masteredAt ?? new Date().toISOString();
  const candidatePath = canonicalRelativePath(
    input.sourceSpaceCandidatePath,
    'sourceSpaceCandidatePath',
  );
  const candidateBytes = Buffer.from(input.sourceSpaceCandidateBytes);
  strictProviderDocuments({
    receiptInput: input.providerMaterializationReceipt,
    requestInput: input.providerFinisherRequest,
    frameId: input.frameId,
    candidatePath,
    candidateSha256: sha256Bytes(candidateBytes),
    candidateBytes: candidateBytes.byteLength,
    masteredAt,
  });
  const result = compileCore({ ...input, masteredAt });
  strictReport(result.report);
  return result;
}

function stableFile(filePath, maximumBytes, minimumBytes, label) {
  const absolute = realpathSync(path.resolve(filePath));
  const before = lstatSync(absolute);
  assert(
    before.isFile() && !before.isSymbolicLink() && before.nlink === 1 &&
      before.size >= minimumBytes && before.size <= maximumBytes,
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

function parseJson(bytes, label) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    assert(text.charCodeAt(0) !== 0xfeff, 'EVA_SOURCE_REPAIR_ALPHA_BOM_FORBIDDEN');
    return JSON.parse(text);
  } catch (error) {
    if (error?.code) throw error;
    assert(false, 'EVA_SOURCE_REPAIR_ALPHA_JSON_INVALID', label);
  }
}

function safeUnlink(filePath) {
  try { unlinkSync(filePath); } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function snapshotInputs(root, files) {
  const directory = path.join(root, `.eva-alpha-input-${randomBytes(12).toString('hex')}`);
  mkdirSync(directory, { mode: 0o700 });
  const metadata = lstatSync(directory);
  assert(
    metadata.isDirectory() &&
      !metadata.isSymbolicLink() &&
      realpathSync(directory) === directory,
    'EVA_SOURCE_REPAIR_ALPHA_SNAPSHOT_ROOT_INVALID',
  );
  const paths = {};
  try {
    for (const [key, file] of Object.entries(files)) {
      const target = path.join(directory, `${key}${file.extension}`);
      const handle = openSync(target, 'wx', 0o600);
      try {
        writeFileSync(handle, file.bytes);
        fsyncSync(handle);
      } finally {
        closeSync(handle);
      }
      const targetMetadata = lstatSync(target);
      assert(
        targetMetadata.isFile() &&
          !targetMetadata.isSymbolicLink() &&
          targetMetadata.nlink === 1 &&
          targetMetadata.size === file.bytes.byteLength,
        'EVA_SOURCE_REPAIR_ALPHA_SNAPSHOT_FILE_INVALID',
      );
      paths[key] = target;
    }
    return Object.freeze({ directory, paths });
  } catch (error) {
    for (const target of Object.values(paths)) safeUnlink(target);
    try { rmdirSync(directory); } catch {}
    throw error;
  }
}

function cleanupSnapshot(snapshot) {
  for (const target of Object.values(snapshot.paths)) safeUnlink(target);
  rmdirSync(snapshot.directory);
}

export function compileEvaSourceRepairAlphaMasteringFiles(input) {
  const lexicalRoot = path.resolve(input.workspaceRoot);
  const lexicalRootStat = lstatSync(lexicalRoot);
  assert(
    lexicalRootStat.isDirectory() && !lexicalRootStat.isSymbolicLink(),
    'EVA_SOURCE_REPAIR_ALPHA_ROOT_INVALID',
  );
  const root = realpathSync(lexicalRoot);
  const resolveInput = (value, label) => {
    const lexical = path.isAbsolute(value)
      ? path.resolve(value)
      : path.join(root, ...canonicalRelativePath(value, label).split('/'));
    const lexicalStat = lstatSync(lexical);
    assert(
      lexicalStat.isFile() &&
        !lexicalStat.isSymbolicLink() &&
        lexicalStat.nlink === 1,
      'EVA_SOURCE_REPAIR_ALPHA_INPUT_FILE_INVALID',
      label,
    );
    const absolute = realpathSync(lexical);
    const relative = path.relative(root, absolute);
    assert(
      relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)),
      'EVA_SOURCE_REPAIR_ALPHA_PATH_ESCAPE',
    );
    return absolute;
  };
  const files = {
    assurance: stableFile(resolveInput(input.candidateAssuranceFile, 'candidateAssuranceFile'), MAX_JSON_BYTES, 2, 'candidate assurance'),
    receipt: stableFile(resolveInput(input.providerMaterializationReceiptFile, 'providerMaterializationReceiptFile'), MAX_JSON_BYTES, 2, 'provider materialization receipt'),
    request: stableFile(resolveInput(input.providerFinisherRequestFile, 'providerFinisherRequestFile'), MAX_JSON_BYTES, 2, 'provider finisher request'),
    candidate: stableFile(resolveInput(input.sourceSpaceCandidateFile, 'sourceSpaceCandidateFile'), MAX_PNG_BYTES, 57, 'source-space candidate'),
    matte: stableFile(resolveInput(input.alphaMatteFile, 'alphaMatteFile'), MAX_PNG_BYTES, 57, 'alpha matte'),
  };
  assert(new Set(Object.values(files).map((file) => file.absolute)).size === 5, 'EVA_SOURCE_REPAIR_ALPHA_INPUT_IDENTITY_CONFLICT');
  const masteredAt = input.masteredAt ?? new Date().toISOString();
  strictProviderDocuments({
    receiptInput: parseJson(files.receipt.bytes, 'provider materialization receipt'),
    requestInput: parseJson(files.request.bytes, 'provider finisher request'),
    frameId: input.frameId,
    candidatePath: canonicalRelativePath(input.sourceSpaceCandidatePath, 'sourceSpaceCandidatePath'),
    candidateSha256: sha256Bytes(files.candidate.bytes),
    candidateBytes: files.candidate.bytes.byteLength,
    masteredAt,
  });
  const snapshot = snapshotInputs(root, {
    assurance: { bytes: files.assurance.bytes, extension: '.json' },
    receipt: { bytes: files.receipt.bytes, extension: '.json' },
    request: { bytes: files.request.bytes, extension: '.json' },
    candidate: { bytes: files.candidate.bytes, extension: '.png' },
    matte: { bytes: files.matte.bytes, extension: '.png' },
  });
  try {
    const result = compileFilesCore({
      ...input,
      masteredAt,
      candidateAssuranceFile: snapshot.paths.assurance,
      providerMaterializationReceiptFile: snapshot.paths.receipt,
      providerFinisherRequestFile: snapshot.paths.request,
      sourceSpaceCandidateFile: snapshot.paths.candidate,
      alphaMatteFile: snapshot.paths.matte,
    });
    strictReport(result.report);
    return result;
  } finally {
    cleanupSnapshot(snapshot);
  }
}

export function verifyEvaSourceRepairAlphaMasteringDocument(value) {
  return strictReport(value);
}

export function evaSourceRepairAlphaMasteringCapabilities() {
  return deepFreeze({
    ...coreCapabilities(),
    inputSnapshotsBeforeExecution: true,
    directSymlinkInputsRejected: true,
    workspaceRootSymlinkRejected: true,
    providerReceiptShapeValidated: true,
    canonicalProviderNestedFieldsValidated: true,
    providerAuthorityValidated: true,
    providerChronologyValidated: true,
    providerByteCountsValidated: true,
    rehashedTopLevelAndAuthorityDriftRejected: true,
    alphaAssociation: 'straight',
    premultiplied: false,
  });
}
