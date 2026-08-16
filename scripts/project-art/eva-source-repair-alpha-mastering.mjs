import { randomBytes } from 'node:crypto';
import {
  closeSync,
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
  SHA1_PATTERN,
} from './avatar-final-pass-provider-candidate-constants.mjs';
import {
  assert,
  canonicalRelativePath,
  deepFreeze,
  exactKeys,
  sha256Bytes,
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
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_PNG_BYTES = 64 * 1024 * 1024;
const MATERIALIZATION_TRUE_KEYS = new Set([
  'artifactRead',
  'evidenceRead',
  'candidateMaterialization',
  'receiptPersistence',
  'finisherRequestPersistence',
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
  exactKeys(
    receipt.output,
    ['path', 'reviewedTargetPath', 'sha256', 'bytes', 'mediaType', 'width', 'height', 'createOnly', 'unapproved'],
    'provider materialization receipt.output',
  );
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
  timestamp(receipt.materializedAt, 'provider materializedAt');
  timestamp(request.createdAt, 'provider finisher createdAt');
  timestamp(receipt.authorization.occurredAt, 'provider authorization occurredAt');
  timestamp(masteredAt, 'masteredAt');
  const reviewedTarget = canonicalRelativePath(
    request.reviewedTargetPath,
    'provider reviewedTargetPath',
  );
  assert(
    receipt.schema === AVATAR_PROVIDER_CANDIDATE_MATERIALIZATION_SCHEMA &&
      request.schema === AVATAR_PROVIDER_CANDIDATE_FINISHER_REQUEST_SCHEMA &&
      receipt.protocolVersion === AVATAR_PROVIDER_CANDIDATE_PROTOCOL_VERSION &&
      request.protocolVersion === AVATAR_PROVIDER_CANDIDATE_PROTOCOL_VERSION &&
      receipt.status === 'candidate-materialized-awaiting-frame-finisher' &&
      SHA1_PATTERN.test(receipt.sourceCommit) &&
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
      receipt.png?.sha256 === candidateSha256 &&
      receipt.png?.byteLength === candidateBytes &&
      receipt.output.mediaType === 'image/png' &&
      request.sourceCandidate.mediaType === 'image/png' &&
      receipt.output.width === WIDTH && receipt.output.height === HEIGHT &&
      request.sourceCandidate.width === WIDTH && request.sourceCandidate.height === HEIGHT &&
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
  const paths = {};
  try {
    for (const [key, file] of Object.entries(files)) {
      const target = path.join(directory, `${key}${file.extension}`);
      const handle = openSync(target, 'wx', 0o600);
      try { writeFileSync(handle, file.bytes); } finally { closeSync(handle); }
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
  const root = realpathSync(path.resolve(input.workspaceRoot));
  const rootStat = lstatSync(root);
  assert(rootStat.isDirectory() && !rootStat.isSymbolicLink(), 'EVA_SOURCE_REPAIR_ALPHA_ROOT_INVALID');
  const resolveInput = (value, label) => {
    const lexical = path.isAbsolute(value)
      ? path.resolve(value)
      : path.join(root, ...canonicalRelativePath(value, label).split('/'));
    const absolute = realpathSync(lexical);
    const relative = path.relative(root, absolute);
    assert(relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)), 'EVA_SOURCE_REPAIR_ALPHA_PATH_ESCAPE');
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
    providerReceiptShapeValidated: true,
    providerAuthorityValidated: true,
    providerChronologyValidated: true,
    providerByteCountsValidated: true,
    rehashedTopLevelAndAuthorityDriftRejected: true,
    alphaAssociation: 'straight',
    premultiplied: false,
  });
}
