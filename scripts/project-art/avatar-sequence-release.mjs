import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

export const AVATAR_SEQUENCE_RELEASE_PROTOCOL_VERSION = '2026-08-13.4';
export const AVATAR_SEQUENCE_RELEASE_CAPABILITIES_SCHEMA =
  'evavo.project-art-avatar-sequence-release-capabilities.v1';
export const AVATAR_SEQUENCE_RELEASE_REQUEST_SCHEMA =
  'evavo.project-art-avatar-sequence-release-request.v1';
export const AVATAR_SEQUENCE_RELEASE_SCHEMA =
  'evavo.project-art-avatar-sequence-release.v1';
export const AVATAR_SEQUENCE_RELEASE_RECEIPT_SCHEMA =
  'evavo.project-art-avatar-sequence-release-receipt.v1';
export const AVATAR_SEQUENCE_RUNTIME_PACK_SCHEMA = 'evavo_avatar_sequence_pack_v2';

const MASTERING_PLAN_SCHEMA =
  'evavo.project-art-avatar-sequence-mastering-plan.v1';
const FRAME_REVIEW_REQUEST_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-frame-review-request.v1';
const FRAME_REVIEW_OUTCOME_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-frame-review-outcome.v1';
const FRAME_FINISHER_PROTOCOL_VERSION = '2026-08-13.3';
const LOOP_PLAN_SCHEMA = 'evavo.project-art-loop-closure-plan.v1';
const LOOP_REVIEW_SCHEMA = 'evavo.project-art-loop-closure-review.v1';
const LOOP_RECEIPT_SCHEMA = 'evavo.project-art-loop-closure-receipt.v1';
const LOOP_REQUEST_SCHEMA = 'evavo.project-art-loop-closure-request.v1';
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,191}$/u;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAXIMUM_DOCUMENT_BYTES = 32 * 1024 * 1024;
const MAXIMUM_FRAME_BYTES = 256 * 1024 * 1024;
const MAXIMUM_CANVAS_EDGE = 32_768;
const MAXIMUM_FRAMES = 2_048;
const MAXIMUM_CLIPS = 256;
const APPROVAL_DISCIPLINES = Object.freeze(['art', 'animation', 'runtime']);
const APPROVAL_DECISION = 'approve-sequence-release';
const RELEASE_STATUS = 'sequence-release-sealed-awaiting-runtime-activation';
const OUTPUT_FILES = Object.freeze([
  'sequence-release.json',
  'runtime-pack.json',
  'receipt.json',
]);
const REQUEST_AUTHORITY_KEYS = Object.freeze([
  'semanticAssignment',
  'sourceMutation',
  'sourceDeletion',
  'imageMutation',
  'providerExecution',
  'candidateApproval',
  'candidatePromotion',
  'sequenceRelease',
  'runtimeActivation',
  'repositoryMutation',
  'gitMutation',
  'deployment',
  'publication',
  'forcePush',
]);
const RELEASE_AUTHORITY_KEYS = Object.freeze([
  'evidenceRead',
  'reviewedFrameRead',
  'loopEvidenceRead',
  'releaseSealPersistence',
  'runtimePackPersistence',
  'receiptPersistence',
  'semanticAssignment',
  'sourceMutation',
  'sourceDeletion',
  'imageMutation',
  'providerExecution',
  'candidateApproval',
  'candidatePromotion',
  'runtimeActivation',
  'repositoryMutation',
  'gitMutation',
  'deployment',
  'publication',
  'forcePush',
]);

export class AvatarSequenceReleaseError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'AvatarSequenceReleaseError';
    this.code = code;
  }
}

function fail(code, message = code) {
  throw new AvatarSequenceReleaseError(code, message);
}

function assert(condition, code, message = code) {
  if (!condition) fail(code, message);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected, label, code = 'AVATAR_SEQUENCE_RELEASE_KEYS_INVALID') {
  assert(isRecord(value), code, `${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assert(
    actual.length === wanted.length &&
      actual.every((entry, index) => entry === wanted[index]),
    code,
    `${label} has unsupported or missing fields.`,
  );
}

function boundedText(value, label, minimum = 1, maximum = 32_000) {
  assert(
    typeof value === 'string' &&
      value.length >= minimum &&
      value.length <= maximum &&
      !value.includes('\0') &&
      !/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value),
    'AVATAR_SEQUENCE_RELEASE_TEXT_INVALID',
    `${label} is invalid.`,
  );
  return value;
}

function identifier(value, label) {
  assert(
    typeof value === 'string' && IDENTIFIER_PATTERN.test(value),
    'AVATAR_SEQUENCE_RELEASE_IDENTIFIER_INVALID',
    `${label} is invalid.`,
  );
  return value;
}

function digest(value, label) {
  assert(
    typeof value === 'string' && SHA256_PATTERN.test(value),
    'AVATAR_SEQUENCE_RELEASE_SHA256_INVALID',
    `${label} must be a lowercase SHA-256 digest.`,
  );
  return value;
}

function integer(value, label, minimum, maximum) {
  assert(
    Number.isSafeInteger(value) && value >= minimum && value <= maximum,
    'AVATAR_SEQUENCE_RELEASE_NUMBER_INVALID',
    `${label} is outside the admitted integer range.`,
  );
  return value;
}

function timestamp(value, label) {
  assert(
    typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value,
    'AVATAR_SEQUENCE_RELEASE_TIMESTAMP_INVALID',
    `${label} must be a canonical UTC timestamp.`,
  );
  return value;
}

function canonicalRelativePath(value, label) {
  boundedText(value, label, 1, 4096);
  assert(
    !path.posix.isAbsolute(value) &&
      !path.win32.isAbsolute(value) &&
      !value.includes('\\') &&
      !value.includes('\0') &&
      path.posix.normalize(value) === value &&
      value.split('/').every((part) => part && part !== '.' && part !== '..'),
    'AVATAR_SEQUENCE_RELEASE_PATH_INVALID',
    `${label} must be a canonical forward-slash relative path.`,
  );
  return value;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => {
          assert(
            value[key] !== undefined,
            'AVATAR_SEQUENCE_RELEASE_CANONICAL_JSON_INVALID',
          );
          return [key, canonicalize(value[key])];
        }),
    );
  }
  assert(
    value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value)),
    'AVATAR_SEQUENCE_RELEASE_CANONICAL_JSON_INVALID',
  );
  return Object.is(value, -0) ? 0 : value;
}

export function canonicalAvatarSequenceReleaseJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256AvatarSequenceReleaseBytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function sha256AvatarSequenceReleaseDocument(value) {
  return sha256AvatarSequenceReleaseBytes(
    Buffer.from(canonicalAvatarSequenceReleaseJson(value), 'utf8'),
  );
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

export function withAvatarSequenceReleaseHash(value, field) {
  const body = { ...canonicalize(value) };
  delete body[field];
  return deepFreeze({
    ...body,
    [field]: sha256AvatarSequenceReleaseDocument(body),
  });
}

function verifySelfHash(value, field, label) {
  assert(isRecord(value), 'AVATAR_SEQUENCE_RELEASE_DOCUMENT_INVALID');
  const recorded = digest(value[field], `${label}.${field}`);
  const body = { ...value };
  delete body[field];
  assert(
    sha256AvatarSequenceReleaseDocument(body) === recorded,
    'AVATAR_SEQUENCE_RELEASE_SELF_HASH_MISMATCH',
    `${label}.${field} does not match canonical content.`,
  );
  return deepFreeze(canonicalize(value));
}

function allFalseAuthority(value, keys, label) {
  exactKeys(value, keys, label, 'AVATAR_SEQUENCE_RELEASE_AUTHORITY_INVALID');
  for (const key of keys) {
    assert(
      value[key] === false,
      'AVATAR_SEQUENCE_RELEASE_AUTHORITY_INVALID',
      `${label}.${key} must remain false.`,
    );
  }
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, false])));
}

function releaseAuthority() {
  const trueKeys = new Set([
    'evidenceRead',
    'reviewedFrameRead',
    'loopEvidenceRead',
    'releaseSealPersistence',
    'runtimePackPersistence',
    'receiptPersistence',
  ]);
  return Object.freeze(
    Object.fromEntries(
      RELEASE_AUTHORITY_KEYS.map((key) => [key, trueKeys.has(key)]),
    ),
  );
}

function realDirectory(value, label) {
  let absolute;
  try {
    absolute = realpathSync(path.resolve(value));
  } catch {
    fail('AVATAR_SEQUENCE_RELEASE_DIRECTORY_MISSING', `${label} is missing.`);
  }
  const metadata = lstatSync(absolute);
  assert(
    metadata.isDirectory() && !metadata.isSymbolicLink(),
    'AVATAR_SEQUENCE_RELEASE_DIRECTORY_INVALID',
    `${label} must be a real non-symbolic directory.`,
  );
  return absolute;
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveWorkspacePath(root, relative, label, { requireExisting = true } = {}) {
  const canonical = canonicalRelativePath(relative, label);
  let current = root;
  const parts = canonical.split('/');
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    if (!existsSync(current)) {
      assert(
        requireExisting === false,
        'AVATAR_SEQUENCE_RELEASE_FILE_MISSING',
        `${label} is missing.`,
      );
      for (const remaining of parts.slice(index + 1)) current = path.join(current, remaining);
      break;
    }
    const metadata = lstatSync(current);
    assert(
      !metadata.isSymbolicLink(),
      'AVATAR_SEQUENCE_RELEASE_PATH_SYMLINK',
      `${label} contains a symbolic path component.`,
    );
  }
  const absolute = path.resolve(current);
  assert(
    isInside(root, absolute) && absolute !== root,
    'AVATAR_SEQUENCE_RELEASE_PATH_ESCAPE',
    `${label} escaped workspaceRoot.`,
  );
  return Object.freeze({ relative: canonical, absolute });
}

function stableFile(root, relative, label, maximumBytes, expectedFileSha256 = null) {
  const resolved = resolveWorkspacePath(root, relative, label);
  const before = lstatSync(resolved.absolute);
  assert(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1 &&
      before.size >= 1 &&
      before.size <= maximumBytes,
    'AVATAR_SEQUENCE_RELEASE_FILE_INVALID',
    `${label} must be a bounded single-link regular file.`,
  );
  const bytes = readFileSync(resolved.absolute);
  const after = lstatSync(resolved.absolute);
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs', 'nlink']) {
    assert(
      before[field] === after[field],
      'AVATAR_SEQUENCE_RELEASE_FILE_CHANGED',
      `${label} changed while being read.`,
    );
  }
  const sha256 = sha256AvatarSequenceReleaseBytes(bytes);
  if (expectedFileSha256 !== null) {
    assert(
      sha256 === digest(expectedFileSha256, `${label} expected file SHA-256`),
      'AVATAR_SEQUENCE_RELEASE_FILE_HASH_MISMATCH',
      `${label} file SHA-256 does not match.`,
    );
  }
  return Object.freeze({
    ...resolved,
    bytes,
    sha256,
    byteLength: bytes.byteLength,
    metadata: before,
  });
}

function parseJsonFile(root, descriptor, label, hashField) {
  const file = stableFile(
    root,
    descriptor.path,
    label,
    MAXIMUM_DOCUMENT_BYTES,
    descriptor.fileSha256,
  );
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes);
  } catch {
    fail('AVATAR_SEQUENCE_RELEASE_UTF8_INVALID', `${label} is not UTF-8.`);
  }
  assert(text.charCodeAt(0) !== 0xfeff, 'AVATAR_SEQUENCE_RELEASE_BOM_FORBIDDEN');
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail('AVATAR_SEQUENCE_RELEASE_JSON_INVALID', `${label} is not valid JSON.`);
  }
  const verified = verifySelfHash(value, hashField, label);
  assert(
    verified[hashField] === descriptor.documentSha256,
    'AVATAR_SEQUENCE_RELEASE_DOCUMENT_HASH_MISMATCH',
    `${label} canonical hash differs from the release request.`,
  );
  return Object.freeze({ file, value: verified });
}

function pngHeader(bytes, label) {
  assert(
    bytes.byteLength >= 33 && bytes.byteLength <= MAXIMUM_FRAME_BYTES &&
      bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) &&
      bytes.readUInt32BE(8) === 13 &&
      bytes.toString('ascii', 12, 16) === 'IHDR',
    'AVATAR_SEQUENCE_RELEASE_PNG_INVALID',
    `${label} is not a canonical PNG frame.`,
  );
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const bitDepth = bytes[24];
  const colourType = bytes[25];
  const compression = bytes[26];
  const filter = bytes[27];
  const interlace = bytes[28];
  assert(
    width >= 1 &&
      height >= 1 &&
      width <= MAXIMUM_CANVAS_EDGE &&
      height <= MAXIMUM_CANVAS_EDGE &&
      bitDepth === 8 &&
      colourType === 6 &&
      compression === 0 &&
      filter === 0 &&
      interlace === 0,
    'AVATAR_SEQUENCE_RELEASE_PNG_INVALID',
    `${label} must be a non-interlaced eight-bit RGBA PNG.`,
  );
  return Object.freeze({ width, height, bitDepth, colourType, alphaChannel: true });
}

function validateMasteringPlan(plan) {
  assert(
    plan.schema === MASTERING_PLAN_SCHEMA &&
      typeof plan.planId === 'string' &&
      plan.assignment?.mode === 'owner-declared-only' &&
      plan.assignment.semanticInferencePerformed === false &&
      plan.assignment.timestampOrderingUsedAsSemantics === false &&
      plan.runtimeDraft?.targetSchema === AVATAR_SEQUENCE_RUNTIME_PACK_SCHEMA &&
      plan.runtimeDraft.review === null &&
      Array.isArray(plan.runtimeDraft.loopClosures) &&
      plan.runtimeDraft.loopClosures.length === 0 &&
      plan.runtimeDraft.runtimeActivationAllowed === false &&
      plan.finalizationRequirements?.releaseSealRequired === true &&
      plan.finalizationRequirements.independentReviewRequired === true &&
      plan.finalizationRequirements.runtimeActivationAllowed === false,
    'AVATAR_SEQUENCE_RELEASE_MASTERING_PLAN_INVALID',
    'Mastering plan is not a sealed owner-declared pre-release plan.',
  );
  allFalseAuthority(plan.authority, REQUEST_AUTHORITY_KEYS.filter((key) =>
    [
      'providerExecution',
      'sourceMutation',
      'sourceDeletion',
      'candidateApproval',
      'candidatePromotion',
      'repositoryMutation',
      'gitMutation',
      'deployment',
      'publication',
      'forcePush',
    ].includes(key),
  ).map((key) => {
    if (key === 'repositoryMutation') return 'targetRepositoryMutation';
    if (key === 'gitMutation') return 'gitCommit';
    return key;
  }).concat(['gitPush']).filter((value, index, array) => array.indexOf(value) === index), 'mastering plan authority');
  assert(
    Array.isArray(plan.runtimeDraft.frames) &&
      plan.runtimeDraft.frames.length >= 1 &&
      plan.runtimeDraft.frames.length <= MAXIMUM_FRAMES &&
      Array.isArray(plan.runtimeDraft.clips) &&
      plan.runtimeDraft.clips.length >= 1 &&
      plan.runtimeDraft.clips.length <= MAXIMUM_CLIPS &&
      Array.isArray(plan.loopClosureRequests),
    'AVATAR_SEQUENCE_RELEASE_MASTERING_PLAN_INVALID',
  );
  return plan;
}

function runtimeAuthorityFalse(value, label) {
  assert(isRecord(value), 'AVATAR_SEQUENCE_RELEASE_AUTHORITY_INVALID');
  for (const [key, entry] of Object.entries(value)) {
    assert(entry === false, 'AVATAR_SEQUENCE_RELEASE_AUTHORITY_INVALID', `${label}.${key} must remain false.`);
  }
}

function parseReleaseRequest(input) {
  const request = verifySelfHash(input, 'requestSha256', 'sequence release request');
  exactKeys(
    request,
    [
      'schema',
      'protocolVersion',
      'releaseId',
      'characterId',
      'revision',
      'masteringPlan',
      'frameEvidence',
      'loopEvidence',
      'timingSha256',
      'releaseBasisSha256',
      'approvals',
      'outputDirectory',
      'authority',
      'requestSha256',
    ],
    'sequence release request',
  );
  assert(
    request.schema === AVATAR_SEQUENCE_RELEASE_REQUEST_SCHEMA &&
      request.protocolVersion === AVATAR_SEQUENCE_RELEASE_PROTOCOL_VERSION,
    'AVATAR_SEQUENCE_RELEASE_REQUEST_INVALID',
  );
  const releaseId = identifier(request.releaseId, 'releaseId');
  const characterId = identifier(request.characterId, 'characterId');
  const revision = integer(request.revision, 'revision', 1, 1_000_000);
  exactKeys(
    request.masteringPlan,
    ['path', 'fileSha256', 'documentSha256'],
    'masteringPlan descriptor',
  );
  canonicalRelativePath(request.masteringPlan.path, 'masteringPlan.path');
  digest(request.masteringPlan.fileSha256, 'masteringPlan.fileSha256');
  digest(request.masteringPlan.documentSha256, 'masteringPlan.documentSha256');
  assert(
    Array.isArray(request.frameEvidence) &&
      request.frameEvidence.length >= 1 &&
      request.frameEvidence.length <= MAXIMUM_FRAMES,
    'AVATAR_SEQUENCE_RELEASE_FRAME_EVIDENCE_INVALID',
  );
  const frameIds = new Set();
  const frameEvidence = request.frameEvidence.map((entry, index) => {
    exactKeys(
      entry,
      [
        'frameId',
        'reviewRequestPath',
        'reviewRequestFileSha256',
        'reviewRequestSha256',
        'reviewOutcomePath',
        'reviewOutcomeFileSha256',
        'reviewOutcomeSha256',
      ],
      `frameEvidence[${index}]`,
    );
    const frameId = identifier(entry.frameId, `frameEvidence[${index}].frameId`);
    assert(!frameIds.has(frameId), 'AVATAR_SEQUENCE_RELEASE_FRAME_EVIDENCE_DUPLICATE');
    frameIds.add(frameId);
    return Object.freeze({
      frameId,
      reviewRequestPath: canonicalRelativePath(
        entry.reviewRequestPath,
        `frameEvidence[${index}].reviewRequestPath`,
      ),
      reviewRequestFileSha256: digest(
        entry.reviewRequestFileSha256,
        `frameEvidence[${index}].reviewRequestFileSha256`,
      ),
      reviewRequestSha256: digest(
        entry.reviewRequestSha256,
        `frameEvidence[${index}].reviewRequestSha256`,
      ),
      reviewOutcomePath: canonicalRelativePath(
        entry.reviewOutcomePath,
        `frameEvidence[${index}].reviewOutcomePath`,
      ),
      reviewOutcomeFileSha256: digest(
        entry.reviewOutcomeFileSha256,
        `frameEvidence[${index}].reviewOutcomeFileSha256`,
      ),
      reviewOutcomeSha256: digest(
        entry.reviewOutcomeSha256,
        `frameEvidence[${index}].reviewOutcomeSha256`,
      ),
    });
  });
  assert(
    Array.isArray(request.loopEvidence) && request.loopEvidence.length <= MAXIMUM_CLIPS,
    'AVATAR_SEQUENCE_RELEASE_LOOP_EVIDENCE_INVALID',
  );
  const loopIds = new Set();
  const loopEvidence = request.loopEvidence.map((entry, index) => {
    exactKeys(
      entry,
      [
        'clipId',
        'planPath',
        'planFileSha256',
        'planDocumentSha256',
        'reviewPath',
        'reviewFileSha256',
        'reviewDocumentSha256',
        'receiptPath',
        'receiptFileSha256',
        'receiptDocumentSha256',
      ],
      `loopEvidence[${index}]`,
    );
    const clipId = identifier(entry.clipId, `loopEvidence[${index}].clipId`);
    assert(!loopIds.has(clipId), 'AVATAR_SEQUENCE_RELEASE_LOOP_EVIDENCE_DUPLICATE');
    loopIds.add(clipId);
    const output = { clipId };
    for (const prefix of ['plan', 'review', 'receipt']) {
      output[`${prefix}Path`] = canonicalRelativePath(
        entry[`${prefix}Path`],
        `loopEvidence[${index}].${prefix}Path`,
      );
      output[`${prefix}FileSha256`] = digest(
        entry[`${prefix}FileSha256`],
        `loopEvidence[${index}].${prefix}FileSha256`,
      );
      output[`${prefix}DocumentSha256`] = digest(
        entry[`${prefix}DocumentSha256`],
        `loopEvidence[${index}].${prefix}DocumentSha256`,
      );
    }
    return Object.freeze(output);
  });
  const timingSha256 = digest(request.timingSha256, 'timingSha256');
  const releaseBasisSha256 = digest(
    request.releaseBasisSha256,
    'releaseBasisSha256',
  );
  assert(
    Array.isArray(request.approvals) &&
      request.approvals.length === APPROVAL_DISCIPLINES.length,
    'AVATAR_SEQUENCE_RELEASE_APPROVALS_INVALID',
  );
  const disciplines = new Set();
  const approvals = request.approvals.map((entry, index) => {
    exactKeys(
      entry,
      [
        'discipline',
        'actorClass',
        'actorId',
        'occurredAt',
        'decision',
        'releaseBasisSha256',
        'timingSha256',
        'evidenceSha256',
      ],
      `approvals[${index}]`,
    );
    assert(
      APPROVAL_DISCIPLINES.includes(entry.discipline) &&
        !disciplines.has(entry.discipline) &&
        entry.actorClass === 'human' &&
        entry.decision === APPROVAL_DECISION &&
        entry.releaseBasisSha256 === releaseBasisSha256 &&
        entry.timingSha256 === timingSha256,
      'AVATAR_SEQUENCE_RELEASE_APPROVAL_INVALID',
    );
    disciplines.add(entry.discipline);
    return Object.freeze({
      discipline: entry.discipline,
      actorClass: 'human',
      actorId: boundedText(entry.actorId, `approvals[${index}].actorId`, 1, 256),
      occurredAt: timestamp(entry.occurredAt, `approvals[${index}].occurredAt`),
      decision: APPROVAL_DECISION,
      releaseBasisSha256,
      timingSha256,
      evidenceSha256: digest(entry.evidenceSha256, `approvals[${index}].evidenceSha256`),
    });
  });
  assert(
    APPROVAL_DISCIPLINES.every((entry) => disciplines.has(entry)),
    'AVATAR_SEQUENCE_RELEASE_APPROVALS_INVALID',
  );
  const outputDirectory = canonicalRelativePath(
    request.outputDirectory,
    'outputDirectory',
  );
  assert(
    outputDirectory.startsWith(`releases/${characterId}/`) &&
      path.posix.basename(outputDirectory) === releaseId,
    'AVATAR_SEQUENCE_RELEASE_OUTPUT_PATH_INVALID',
    'outputDirectory must be releases/<characterId>/<releaseId>.',
  );
  const authority = allFalseAuthority(
    request.authority,
    REQUEST_AUTHORITY_KEYS,
    'sequence release request authority',
  );
  return deepFreeze({
    ...request,
    releaseId,
    characterId,
    revision,
    frameEvidence: Object.freeze(frameEvidence),
    loopEvidence: Object.freeze(loopEvidence),
    approvals: Object.freeze(approvals),
    outputDirectory,
    authority,
  });
}

export function avatarSequenceTimingSha256(planInput) {
  const plan = validateMasteringPlan(planInput);
  return sha256AvatarSequenceReleaseDocument({
    characterId: plan.characterId,
    revision: plan.revision,
    clips: plan.runtimeDraft.clips,
    defaults: plan.runtimeDraft.defaults,
  });
}

export function avatarSequenceReleaseBasisSha256({
  plan: planInput,
  loopEvidence,
  timingSha256,
}) {
  const plan = validateMasteringPlan(planInput);
  digest(timingSha256, 'timingSha256');
  assert(Array.isArray(loopEvidence), 'AVATAR_SEQUENCE_RELEASE_LOOP_EVIDENCE_INVALID');
  return sha256AvatarSequenceReleaseDocument({
    masteringPlanDocumentSha256: plan.documentSha256,
    characterId: plan.characterId,
    revision: plan.revision,
    frames: plan.runtimeDraft.frames.map((frame) => ({
      id: frame.id,
      path: frame.path,
      sha256: frame.sha256,
      bytes: frame.bytes,
      width: frame.width,
      height: frame.height,
    })),
    clips: plan.runtimeDraft.clips,
    defaults: plan.runtimeDraft.defaults,
    loopEvidence: loopEvidence.map((entry) => ({
      clipId: entry.clipId,
      reviewDocumentSha256: entry.reviewDocumentSha256,
      receiptDocumentSha256: entry.receiptDocumentSha256,
    })),
    timingSha256,
  });
}

function validateFrameReviewAuthority(value, label) {
  assert(isRecord(value), 'AVATAR_SEQUENCE_RELEASE_FRAME_REVIEW_INVALID');
  for (const [key, entry] of Object.entries(value)) {
    const permitted = key === 'namedHumanReviewEvidence' || key === 'finalFrameHashAdmission';
    assert(
      entry === (permitted ? true : false),
      'AVATAR_SEQUENCE_RELEASE_FRAME_REVIEW_AUTHORITY_INVALID',
      `${label}.${key} is invalid.`,
    );
  }
  assert(
    value.namedHumanReviewEvidence === true && value.finalFrameHashAdmission === true,
    'AVATAR_SEQUENCE_RELEASE_FRAME_REVIEW_AUTHORITY_INVALID',
  );
}

function validateFrameEvidence(root, plan, descriptor, frame) {
  const requestRecord = parseJsonFile(
    root,
    {
      path: descriptor.reviewRequestPath,
      fileSha256: descriptor.reviewRequestFileSha256,
      documentSha256: descriptor.reviewRequestSha256,
    },
    `frame ${frame.id} review request`,
    'reviewRequestSha256',
  );
  const outcomeRecord = parseJsonFile(
    root,
    {
      path: descriptor.reviewOutcomePath,
      fileSha256: descriptor.reviewOutcomeFileSha256,
      documentSha256: descriptor.reviewOutcomeSha256,
    },
    `frame ${frame.id} review outcome`,
    'reviewOutcomeSha256',
  );
  const request = requestRecord.value;
  const outcome = outcomeRecord.value;
  assert(
    request.schema === FRAME_REVIEW_REQUEST_SCHEMA &&
      request.protocolVersion === FRAME_FINISHER_PROTOCOL_VERSION &&
      request.frameId === frame.id &&
      request.characterId === plan.characterId &&
      request.reviewedTargetPath === frame.path &&
      request.finishedFrame.sha256 === frame.sha256 &&
      request.finishedFrame.bytes === frame.bytes &&
      request.finishedFrame.width === frame.width &&
      request.finishedFrame.height === frame.height &&
      request.finalSha256RequiredBeforeInbetweenOrSequenceUse === true &&
      request.sequenceReleaseAllowed === false &&
      request.runtimeActivationAllowed === false,
    'AVATAR_SEQUENCE_RELEASE_FRAME_REVIEW_REQUEST_INVALID',
    `Frame ${frame.id} review request does not bind the mastering plan.`,
  );
  assert(
    outcome.schema === FRAME_REVIEW_OUTCOME_SCHEMA &&
      outcome.protocolVersion === FRAME_FINISHER_PROTOCOL_VERSION &&
      outcome.status === 'final-frame-admitted' &&
      outcome.frameId === frame.id &&
      outcome.characterId === plan.characterId &&
      outcome.reviewRequestSha256 === request.reviewRequestSha256 &&
      outcome.finishedFrame.sha256 === frame.sha256 &&
      outcome.finishedFrame.bytes === frame.bytes &&
      outcome.finishedFrame.width === frame.width &&
      outcome.finishedFrame.height === frame.height &&
      outcome.finalFrameSha256 === frame.sha256 &&
      outcome.dependentInbetweenEndpointAllowed === true &&
      outcome.sequenceDraftUseAllowed === true &&
      outcome.sequenceReleaseAllowed === false &&
      outcome.runtimeActivationAllowed === false &&
      outcome.reviewer?.actorClass === 'human',
    'AVATAR_SEQUENCE_RELEASE_FRAME_NOT_ADMITTED',
    `Frame ${frame.id} is not a final admitted frame.`,
  );
  timestamp(outcome.reviewedAt, `frame ${frame.id} reviewedAt`);
  timestamp(outcome.reviewer.occurredAt, `frame ${frame.id} reviewer.occurredAt`);
  assert(
    Date.parse(outcome.reviewer.occurredAt) <= Date.parse(outcome.reviewedAt),
    'AVATAR_SEQUENCE_RELEASE_FRAME_REVIEW_TIME_INVALID',
  );
  assert(isRecord(outcome.gates), 'AVATAR_SEQUENCE_RELEASE_FRAME_REVIEW_INVALID');
  for (const [gate, state] of Object.entries(outcome.gates)) {
    assert(
      state === 'pass' || (gate === 'loopClosure' && state === 'not-applicable'),
      'AVATAR_SEQUENCE_RELEASE_FRAME_REVIEW_GATE_FAILED',
      `Frame ${frame.id} gate ${gate} did not pass.`,
    );
  }
  validateFrameReviewAuthority(outcome.authority, `frame ${frame.id} authority`);

  const target = stableFile(
    root,
    frame.path,
    `reviewed target frame ${frame.id}`,
    MAXIMUM_FRAME_BYTES,
    frame.sha256,
  );
  assert(
    target.byteLength === frame.bytes,
    'AVATAR_SEQUENCE_RELEASE_FRAME_TARGET_MISMATCH',
  );
  const header = pngHeader(target.bytes, `reviewed target frame ${frame.id}`);
  assert(
    header.width === frame.width &&
      header.height === frame.height &&
      header.width === plan.runtimeDraft.canvas.width &&
      header.height === plan.runtimeDraft.canvas.height,
    'AVATAR_SEQUENCE_RELEASE_FRAME_TARGET_MISMATCH',
  );
  return deepFreeze({
    frameId: frame.id,
    path: frame.path,
    sha256: frame.sha256,
    bytes: frame.bytes,
    width: frame.width,
    height: frame.height,
    reviewRequestSha256: request.reviewRequestSha256,
    reviewOutcomeSha256: outcome.reviewOutcomeSha256,
    reviewedAt: outcome.reviewedAt,
    reviewer: outcome.reviewer,
    gates: outcome.gates,
    evidence: outcome.evidence,
  });
}

function sameCanonical(left, right) {
  return canonicalAvatarSequenceReleaseJson(left) === canonicalAvatarSequenceReleaseJson(right);
}

function validateLoopEvidence(root, plan, descriptor, expected) {
  const planRecord = parseJsonFile(
    root,
    {
      path: descriptor.planPath,
      fileSha256: descriptor.planFileSha256,
      documentSha256: descriptor.planDocumentSha256,
    },
    `loop ${descriptor.clipId} plan`,
    'documentSha256',
  );
  const reviewRecord = parseJsonFile(
    root,
    {
      path: descriptor.reviewPath,
      fileSha256: descriptor.reviewFileSha256,
      documentSha256: descriptor.reviewDocumentSha256,
    },
    `loop ${descriptor.clipId} review`,
    'documentSha256',
  );
  const receiptRecord = parseJsonFile(
    root,
    {
      path: descriptor.receiptPath,
      fileSha256: descriptor.receiptFileSha256,
      documentSha256: descriptor.receiptDocumentSha256,
    },
    `loop ${descriptor.clipId} receipt`,
    'documentSha256',
  );
  const loopPlan = planRecord.value;
  const review = reviewRecord.value;
  const receipt = receiptRecord.value;
  assert(
    loopPlan.schema === LOOP_PLAN_SCHEMA &&
      loopPlan.reviewId === expected.request.reviewId &&
      loopPlan.projectId === expected.request.projectId &&
      sameCanonical(loopPlan.expected, expected.request.expected) &&
      sameCanonical(loopPlan.thresholds, expected.request.thresholds) &&
      Array.isArray(loopPlan.frames) &&
      loopPlan.frames.length === expected.request.frames.length &&
      loopPlan.frames.every((entry, index) =>
        entry.path === expected.request.frames[index].path &&
        entry.sha256 === expected.request.frames[index].expectedSha256
      ),
    'AVATAR_SEQUENCE_RELEASE_LOOP_PLAN_INVALID',
    `Loop plan for ${descriptor.clipId} does not bind the mastering plan.`,
  );
  runtimeAuthorityFalse(loopPlan.authority, `loop ${descriptor.clipId} plan authority`);
  assert(
    review.schema === LOOP_REVIEW_SCHEMA &&
      review.reviewId === expected.request.reviewId &&
      review.projectId === expected.request.projectId &&
      review.planSha256 === loopPlan.documentSha256 &&
      review.status === 'passed' &&
      Array.isArray(review.issues) &&
      review.issues.length === 0 &&
      review.creativeApprovalPerformed === false &&
      review.runtimeApprovalPerformed === false &&
      sameCanonical(review.thresholds, expected.request.thresholds),
    'AVATAR_SEQUENCE_RELEASE_LOOP_REVIEW_FAILED',
    `Loop review for ${descriptor.clipId} did not pass.`,
  );
  runtimeAuthorityFalse(review.authority, `loop ${descriptor.clipId} review authority`);
  assert(
    receipt.schema === LOOP_RECEIPT_SCHEMA &&
      receipt.reviewId === expected.request.reviewId &&
      receipt.projectId === expected.request.projectId &&
      receipt.planSha256 === loopPlan.documentSha256 &&
      receipt.reviewSha256 === review.documentSha256 &&
      receipt.status === 'passed' &&
      receipt.sourceHashesRevalidatedBeforeExecution === true &&
      receipt.sourceHashesRevalidatedAfterExecution === true &&
      receipt.wholeRunAtomicPublication === true &&
      Array.isArray(receipt.outputs),
    'AVATAR_SEQUENCE_RELEASE_LOOP_RECEIPT_INVALID',
  );
  runtimeAuthorityFalse(receipt.authority, `loop ${descriptor.clipId} receipt authority`);
  const reviewOutput = receipt.outputs.find(
    (entry) => entry.role === 'loop-closure-review',
  );
  assert(
    reviewOutput &&
      reviewOutput.sha256 === reviewRecord.file.sha256 &&
      reviewOutput.bytes === reviewRecord.file.byteLength,
    'AVATAR_SEQUENCE_RELEASE_LOOP_RECEIPT_INVALID',
    `Loop receipt for ${descriptor.clipId} does not bind its review file.`,
  );
  assert(
    expected.request.schema === LOOP_REQUEST_SCHEMA &&
      expected.requestCanonicalSha256 ===
        sha256AvatarSequenceReleaseDocument(expected.request),
    'AVATAR_SEQUENCE_RELEASE_LOOP_REQUEST_INVALID',
  );
  return deepFreeze({
    clipId: descriptor.clipId,
    reviewId: review.reviewId,
    planDocumentSha256: loopPlan.documentSha256,
    reviewDocumentSha256: review.documentSha256,
    receiptDocumentSha256: receipt.documentSha256,
    status: 'passed',
    metrics: review.metrics,
  });
}

function outputPath(root, relativeDirectory) {
  const resolved = resolveWorkspacePath(
    root,
    relativeDirectory,
    'outputDirectory',
    { requireExisting: false },
  );
  const parentRelative = path.posix.dirname(relativeDirectory);
  let current = root;
  if (parentRelative !== '.') {
    for (const part of parentRelative.split('/')) {
      current = path.join(current, part);
      if (!existsSync(current)) {
        mkdirSync(current, { mode: 0o700 });
      }
      const metadata = lstatSync(current);
      assert(
        metadata.isDirectory() && !metadata.isSymbolicLink(),
        'AVATAR_SEQUENCE_RELEASE_OUTPUT_PARENT_INVALID',
      );
      assert(isInside(root, realpathSync(current)), 'AVATAR_SEQUENCE_RELEASE_PATH_ESCAPE');
    }
  }
  return Object.freeze({
    root,
    parent: current,
    relative: relativeDirectory,
    absolute: resolved.absolute,
  });
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeCreateOnly(filePath, bytes) {
  const descriptor = openSync(filePath, 'wx', 0o600);
  try {
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function publishedFileRecord(directory, name, role) {
  const file = path.join(directory, name);
  const metadata = lstatSync(file);
  assert(
    metadata.isFile() && !metadata.isSymbolicLink() && metadata.nlink === 1,
    'AVATAR_SEQUENCE_RELEASE_PUBLICATION_INVALID',
  );
  const bytes = readFileSync(file);
  return Object.freeze({
    role,
    path: name,
    sha256: sha256AvatarSequenceReleaseBytes(bytes),
    bytes: bytes.byteLength,
  });
}

function buildRuntimePack(plan, releaseId, sealedAt, basis, timing, frames, loops, approvals) {
  const body = {
    targetSchema: AVATAR_SEQUENCE_RUNTIME_PACK_SCHEMA,
    characterId: plan.characterId,
    revision: plan.revision,
    canvas: plan.runtimeDraft.canvas,
    review: Object.freeze({
      releaseId,
      releaseBasisSha256: basis,
      timingSha256: timing,
      sealedAt,
      sequenceReleaseSealed: true,
      approvalDisciplines: APPROVAL_DISCIPLINES,
      approvals: approvals.map((entry) => ({
        discipline: entry.discipline,
        actorId: entry.actorId,
        occurredAt: entry.occurredAt,
        evidenceSha256: entry.evidenceSha256,
      })),
    }),
    frames: plan.runtimeDraft.frames,
    clips: plan.runtimeDraft.clips,
    loopClosures: loops.map((entry) => ({
      clipId: entry.clipId,
      reviewId: entry.reviewId,
      status: 'passed',
      reviewSha256: entry.reviewDocumentSha256,
      receiptSha256: entry.receiptDocumentSha256,
    })),
    runtimeActivationAllowed: false,
    defaults: plan.runtimeDraft.defaults,
    authority: plan.runtimeDraft.authority,
  };
  runtimeAuthorityFalse(body.authority, 'runtime pack authority');
  return withAvatarSequenceReleaseHash(body, 'packSha256');
}

function buildRelease(plan, request, sealedAt, frames, loops, runtimePack) {
  const body = {
    schema: AVATAR_SEQUENCE_RELEASE_SCHEMA,
    protocolVersion: AVATAR_SEQUENCE_RELEASE_PROTOCOL_VERSION,
    status: RELEASE_STATUS,
    releaseId: request.releaseId,
    sealedAt,
    characterId: request.characterId,
    revision: request.revision,
    masteringPlan: Object.freeze({
      path: request.masteringPlan.path,
      fileSha256: request.masteringPlan.fileSha256,
      documentSha256: plan.documentSha256,
      planId: plan.planId,
      assignmentId: plan.assignmentId,
    }),
    releaseBasisSha256: request.releaseBasisSha256,
    timingSha256: request.timingSha256,
    frames,
    clips: plan.runtimeDraft.clips,
    defaults: plan.runtimeDraft.defaults,
    loopEvidence: loops,
    approvals: request.approvals,
    runtimePack: Object.freeze({
      path: 'runtime-pack.json',
      packSha256: runtimePack.packSha256,
    }),
    sequenceReleaseSealed: true,
    runtimeActivationPrerequisitesSatisfied: true,
    runtimeActivationAllowed: false,
    requiredNextSteps: Object.freeze([
      'independently-inspect-sealed-runtime-pack',
      'create-a-separate-runtime-activation-decision',
      'publish-only-through-governed-storage-or-reviewed-non-force-git-path',
      'update-the-website-consumer-after-runtime-admission',
    ]),
    authority: releaseAuthority(),
  };
  return withAvatarSequenceReleaseHash(body, 'releaseSha256');
}

function buildReceipt(request, release, runtimePack, outputs, sealedAt) {
  const body = {
    schema: AVATAR_SEQUENCE_RELEASE_RECEIPT_SCHEMA,
    protocolVersion: AVATAR_SEQUENCE_RELEASE_PROTOCOL_VERSION,
    status: RELEASE_STATUS,
    releaseId: request.releaseId,
    sealedAt,
    releaseBasisSha256: request.releaseBasisSha256,
    releaseSha256: release.releaseSha256,
    runtimePackSha256: runtimePack.packSha256,
    outputDirectory: request.outputDirectory,
    outputDirectoryWasCreateOnly: true,
    wholeReleaseAtomicPublication: true,
    frameHashesRevalidatedBeforePublication: true,
    loopEvidenceRevalidatedBeforePublication: true,
    outputs,
    runtimeActivationAllowed: false,
    authority: releaseAuthority(),
  };
  return withAvatarSequenceReleaseHash(body, 'receiptSha256');
}

function expectedOutputDocuments(plan, request, sealedAt, frames, loops) {
  const runtimePack = buildRuntimePack(
    plan,
    request.releaseId,
    sealedAt,
    request.releaseBasisSha256,
    request.timingSha256,
    frames,
    loops,
    request.approvals,
  );
  const release = buildRelease(plan, request, sealedAt, frames, loops, runtimePack);
  const provisional = [
    { name: 'sequence-release.json', role: 'sequence-release', bytes: jsonBytes(release) },
    { name: 'runtime-pack.json', role: 'runtime-pack', bytes: jsonBytes(runtimePack) },
  ];
  const outputRecords = provisional.map((entry) => ({
    role: entry.role,
    path: entry.name,
    sha256: sha256AvatarSequenceReleaseBytes(entry.bytes),
    bytes: entry.bytes.byteLength,
  }));
  const receipt = buildReceipt(request, release, runtimePack, outputRecords, sealedAt);
  return deepFreeze({ release, runtimePack, receipt });
}

function readExistingRelease(output, expected) {
  if (!existsSync(output.absolute)) return null;
  const metadata = lstatSync(output.absolute);
  assert(
    metadata.isDirectory() && !metadata.isSymbolicLink(),
    'AVATAR_SEQUENCE_RELEASE_OUTPUT_COLLISION',
  );
  const names = readdirSync(output.absolute).sort();
  assert(
    sameCanonical(names, [...OUTPUT_FILES].sort()),
    'AVATAR_SEQUENCE_RELEASE_EXISTING_BUNDLE_INVALID',
    'Existing release directory is partial or contains unexpected files.',
  );
  const documents = {};
  for (const [name, field] of [
    ['sequence-release.json', 'releaseSha256'],
    ['runtime-pack.json', 'packSha256'],
    ['receipt.json', 'receiptSha256'],
  ]) {
    const filePath = path.join(output.absolute, name);
    const fileMetadata = lstatSync(filePath);
    assert(
      fileMetadata.isFile() &&
        !fileMetadata.isSymbolicLink() &&
        fileMetadata.nlink === 1 &&
        fileMetadata.size >= 2 &&
        fileMetadata.size <= MAXIMUM_DOCUMENT_BYTES,
      'AVATAR_SEQUENCE_RELEASE_EXISTING_BUNDLE_INVALID',
    );
    let value;
    try {
      value = JSON.parse(readFileSync(filePath, 'utf8'));
    } catch {
      fail('AVATAR_SEQUENCE_RELEASE_EXISTING_BUNDLE_INVALID');
    }
    documents[name] = verifySelfHash(value, field, `existing ${name}`);
  }
  assert(
    sameCanonical(documents['sequence-release.json'], expected.release) &&
      sameCanonical(documents['runtime-pack.json'], expected.runtimePack) &&
      sameCanonical(documents['receipt.json'], expected.receipt),
    'AVATAR_SEQUENCE_RELEASE_EXISTING_BUNDLE_MISMATCH',
  );
  return deepFreeze({
    status: expected.release.status,
    reused: true,
    outputDirectoryPath: output.absolute,
    releasePath: path.join(output.absolute, 'sequence-release.json'),
    runtimePackPath: path.join(output.absolute, 'runtime-pack.json'),
    receiptPath: path.join(output.absolute, 'receipt.json'),
    ...expected,
  });
}

function publishRelease(output, documents) {
  assert(!existsSync(output.absolute), 'AVATAR_SEQUENCE_RELEASE_OUTPUT_COLLISION');
  const staging = path.join(
    output.parent,
    `.${path.basename(output.absolute)}.staging-${randomBytes(12).toString('hex')}`,
  );
  assert(!existsSync(staging), 'AVATAR_SEQUENCE_RELEASE_STAGING_COLLISION');
  mkdirSync(staging, { mode: 0o700 });
  try {
    writeCreateOnly(
      path.join(staging, 'sequence-release.json'),
      jsonBytes(documents.release),
    );
    writeCreateOnly(
      path.join(staging, 'runtime-pack.json'),
      jsonBytes(documents.runtimePack),
    );
    const outputRecords = [
      publishedFileRecord(staging, 'sequence-release.json', 'sequence-release'),
      publishedFileRecord(staging, 'runtime-pack.json', 'runtime-pack'),
    ];
    const receipt = buildReceipt(
      documents.request,
      documents.release,
      documents.runtimePack,
      outputRecords,
      documents.release.sealedAt,
    );
    assert(
      receipt.receiptSha256 === documents.receipt.receiptSha256,
      'AVATAR_SEQUENCE_RELEASE_RECEIPT_DRIFT',
    );
    writeCreateOnly(path.join(staging, 'receipt.json'), jsonBytes(receipt));
    renameSync(staging, output.absolute);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  for (const name of OUTPUT_FILES) {
    const metadata = lstatSync(path.join(output.absolute, name));
    assert(
      metadata.isFile() && !metadata.isSymbolicLink() && metadata.nlink === 1,
      'AVATAR_SEQUENCE_RELEASE_PUBLICATION_INVALID',
    );
  }
}

export function sealAvatarSequenceRelease({
  workspaceRoot,
  request: requestInput,
  sealedAt = new Date().toISOString(),
}) {
  const root = realDirectory(workspaceRoot, 'workspaceRoot');
  const request = parseReleaseRequest(requestInput);
  timestamp(sealedAt, 'sealedAt');
  for (const approval of request.approvals) {
    assert(
      Date.parse(approval.occurredAt) <= Date.parse(sealedAt),
      'AVATAR_SEQUENCE_RELEASE_APPROVAL_TIME_INVALID',
      'Sequence release cannot precede an approval.',
    );
  }
  const planRecord = parseJsonFile(
    root,
    request.masteringPlan,
    'avatar sequence mastering plan',
    'documentSha256',
  );
  const plan = validateMasteringPlan(planRecord.value);
  assert(
    plan.characterId === request.characterId &&
      plan.revision === request.revision &&
      plan.documentSha256 === request.masteringPlan.documentSha256,
    'AVATAR_SEQUENCE_RELEASE_MASTERING_PLAN_BINDING_INVALID',
  );
  runtimeAuthorityFalse(plan.runtimeDraft.authority, 'mastering runtime draft authority');

  const byFrame = new Map(request.frameEvidence.map((entry) => [entry.frameId, entry]));
  assert(
    byFrame.size === plan.runtimeDraft.frames.length &&
      plan.runtimeDraft.frames.every((frame) => byFrame.has(frame.id)),
    'AVATAR_SEQUENCE_RELEASE_FRAME_EVIDENCE_SET_INVALID',
    'Release request must contain exactly one review outcome for every runtime frame.',
  );
  const frames = plan.runtimeDraft.frames.map((frame) =>
    validateFrameEvidence(root, plan, byFrame.get(frame.id), frame),
  );
  const latestFrameReview = Math.max(
    ...frames.map((entry) => Date.parse(entry.reviewedAt)),
  );
  for (const approval of request.approvals) {
    assert(
      Date.parse(approval.occurredAt) >= latestFrameReview,
      'AVATAR_SEQUENCE_RELEASE_APPROVAL_TIME_INVALID',
      'Release approvals must follow all final-frame admissions.',
    );
  }

  const expectedLoops = plan.loopClosureRequests;
  const byLoop = new Map(request.loopEvidence.map((entry) => [entry.clipId, entry]));
  assert(
    byLoop.size === expectedLoops.length &&
      expectedLoops.every((entry) => byLoop.has(entry.clipId)),
    'AVATAR_SEQUENCE_RELEASE_LOOP_EVIDENCE_SET_INVALID',
    'Release request must contain exactly one passed loop receipt for every true loop.',
  );
  const loops = expectedLoops.map((entry) =>
    validateLoopEvidence(root, plan, byLoop.get(entry.clipId), entry),
  );
  const timingSha256 = avatarSequenceTimingSha256(plan);
  assert(
    timingSha256 === request.timingSha256,
    'AVATAR_SEQUENCE_RELEASE_TIMING_HASH_MISMATCH',
  );
  const basis = avatarSequenceReleaseBasisSha256({
    plan,
    loopEvidence: loops,
    timingSha256,
  });
  assert(
    basis === request.releaseBasisSha256,
    'AVATAR_SEQUENCE_RELEASE_BASIS_HASH_MISMATCH',
  );

  const output = outputPath(root, request.outputDirectory);
  const expected = expectedOutputDocuments(plan, request, sealedAt, frames, loops);
  const existing = readExistingRelease(output, expected);
  if (existing) return existing;

  for (const frame of plan.runtimeDraft.frames) {
    stableFile(
      root,
      frame.path,
      `reviewed target frame ${frame.id} pre-publication recheck`,
      MAXIMUM_FRAME_BYTES,
      frame.sha256,
    );
  }
  for (const loop of request.loopEvidence) {
    stableFile(
      root,
      loop.reviewPath,
      `loop ${loop.clipId} review pre-publication recheck`,
      MAXIMUM_DOCUMENT_BYTES,
      loop.reviewFileSha256,
    );
    stableFile(
      root,
      loop.receiptPath,
      `loop ${loop.clipId} receipt pre-publication recheck`,
      MAXIMUM_DOCUMENT_BYTES,
      loop.receiptFileSha256,
    );
  }
  publishRelease(output, { ...expected, request });
  return deepFreeze({
    status: expected.release.status,
    reused: false,
    outputDirectoryPath: output.absolute,
    releasePath: path.join(output.absolute, 'sequence-release.json'),
    runtimePackPath: path.join(output.absolute, 'runtime-pack.json'),
    receiptPath: path.join(output.absolute, 'receipt.json'),
    ...expected,
  });
}

export function sealAvatarSequenceReleaseFiles({
  workspaceRoot,
  requestPath,
  sealedAt,
}) {
  const root = realDirectory(workspaceRoot, 'workspaceRoot');
  const requestFile = stableFile(
    root,
    requestPath,
    'sequence release request',
    MAXIMUM_DOCUMENT_BYTES,
  );
  let request;
  try {
    request = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(requestFile.bytes));
  } catch {
    fail('AVATAR_SEQUENCE_RELEASE_REQUEST_INVALID');
  }
  return sealAvatarSequenceRelease({
    workspaceRoot: root,
    request,
    ...(sealedAt ? { sealedAt } : {}),
  });
}

export function avatarSequenceReleaseCapabilities() {
  return deepFreeze({
    schema: AVATAR_SEQUENCE_RELEASE_CAPABILITIES_SCHEMA,
    protocolVersion: AVATAR_SEQUENCE_RELEASE_PROTOCOL_VERSION,
    tools: Object.freeze([
      'evavo_art_avatar_sequence_release_capabilities',
      'evavo_art_seal_avatar_sequence_release',
    ]),
    requiredInputs: Object.freeze({
      exactMasteringPlan: true,
      finalFrameAdmissionForEveryRuntimeFrame: true,
      passedLoopReceiptForEveryTrueLoop: true,
      exactTimingHash: true,
      namedHumanArtAnimationAndRuntimeApprovals: true,
    }),
    verification: Object.freeze({
      frameReviewRequestAndOutcomeHashes: true,
      reviewedTargetPngBytes: true,
      loopPlanReviewAndReceiptHashes: true,
      loopThresholdPassRequired: true,
      onceAndPingPongDoNotRequireFalseLoopEvidence: true,
      releaseBasisHash: true,
      atomicCreateOnlyThreeFileBundle: true,
      exactIdempotentReadback: true,
    }),
    outputs: Object.freeze({
      sealedSequenceRelease: true,
      sealedRuntimePack: true,
      releaseReceipt: true,
      runtimeActivationAllowed: false,
    }),
    imageBytesThroughMcp: false,
    arbitraryShell: false,
    semanticAssignment: false,
    imageMutation: false,
    providerExecution: false,
    candidateApproval: false,
    candidatePromotion: false,
    sequenceReleaseSealing: false,
    repositoryMutation: false,
    gitPublication: false,
    deployment: false,
    publication: false,
    runtimeActivation: false,
    forcePush: false,
  });
}
