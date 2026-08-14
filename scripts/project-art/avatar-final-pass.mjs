import { createHash } from 'node:crypto';
import {
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  closeSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

export const AVATAR_FINAL_PASS_REQUEST_SCHEMA =
  'evavo.project-art-avatar-final-pass-request.v1';
export const AVATAR_FINAL_PASS_PLAN_SCHEMA =
  'evavo.project-art-avatar-final-pass-plan.v1';
export const AVATAR_FRAME_QUALITY_REPORT_SCHEMA =
  'evavo.project-art-avatar-frame-quality-report.v1';
export const AVATAR_FRAME_REPAIR_REQUEST_SCHEMA =
  'evavo.project-art-avatar-frame-repair-request.v1';
export const AVATAR_INBETWEEN_REQUEST_SCHEMA =
  'evavo.project-art-avatar-inbetween-request.v1';

export const AVATAR_FINAL_PASS_ISSUES = Object.freeze([
  'hands',
  'fingers',
  'anatomy',
  'face-identity',
  'silhouette',
  'crop',
  'transparency',
  'edge-halo',
  'jitter',
  'lighting',
  'style',
  'background',
  'artefact',
  'other',
]);

export const AVATAR_FINAL_PASS_DISPOSITIONS = Object.freeze([
  'accept',
  'deterministic-repair',
  'provider-redraw',
  'exclude',
]);

export const AVATAR_FINAL_PASS_OPERATIONS = Object.freeze([
  'canvas-normalize',
  'crop-normalize',
  'align-centroid',
  'edge-decontaminate',
  'defringe',
  'alpha-feather',
  'fill-transparent-edge',
  'denoise',
  'sharpen',
  'curves',
  'channel-mixer',
  'colour-match',
]);

export const AVATAR_FINAL_PASS_AUTHORITY_KEYS = Object.freeze([
  'semanticAssignment',
  'sourceMutation',
  'sourceDeletion',
  'imageEditing',
  'providerExecution',
  'candidateApproval',
  'candidatePromotion',
  'repositoryMutation',
  'gitCommit',
  'gitPush',
  'deployment',
  'publication',
  'runtimeActivation',
  'forcePush',
]);

const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._-]{0,95}$/u;
const SHA1_PATTERN = /^[a-f0-9]{40}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const MATERIALIZATION_SCHEMAS = new Set([
  'evavo.avatar.art-materialization-manifest.v1',
  'evavo.avatar.art-materialization-manifest.v2',
]);
const MAXIMUM_REQUEST_BYTES = 2 * 1024 * 1024;
const MAXIMUM_FRAMES = 512;
const MAXIMUM_SEQUENCES = 128;
const MAXIMUM_INBETWEENS = 512;
const MAXIMUM_FILE_BYTES = 128 * 1024 * 1024;

export class ProjectArtAvatarFinalPassError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ProjectArtAvatarFinalPassError';
    this.code = code;
  }
}

function fail(code, message = code) {
  throw new ProjectArtAvatarFinalPassError(code, message);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!isRecord(value)) fail('PROJECT_ART_AVATAR_FINAL_PASS_OBJECT_INVALID', `${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_KEYS_INVALID', `${label} has unexpected or missing fields.`);
  }
}

function identifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_IDENTIFIER_INVALID', `${label} is invalid.`);
  }
  return value;
}

function digest(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_SHA256_INVALID', `${label} is invalid.`);
  }
  return value;
}

function sourceRef(value, label) {
  if (typeof value !== 'string' || !SHA1_PATTERN.test(value)) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_SOURCE_REF_INVALID', `${label} is invalid.`);
  }
  return value;
}

function boundedInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_INTEGER_INVALID', `${label} is invalid.`);
  }
  return value;
}

function boundedNumber(value, label, minimum, maximum) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_NUMBER_INVALID', `${label} is invalid.`);
  }
  return value;
}

function canonicalPath(value, label) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 1024 ||
    value.includes('\\') ||
    value.includes('\0') ||
    value.startsWith('/') ||
    value.startsWith('../') ||
    value.includes('/../') ||
    value.includes('//') ||
    /^[A-Za-z]:/u.test(value)
  ) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_PATH_INVALID', `${label} must be a canonical relative path.`);
  }
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

export function canonicalAvatarFinalPassJson(value) {
  return JSON.stringify(canonical(value));
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sha256AvatarFinalPassDocument(value) {
  return sha256Bytes(Buffer.from(canonicalAvatarFinalPassJson(value), 'utf8'));
}

function parseJsonBytes(bytes, label) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 2 || bytes.length > MAXIMUM_REQUEST_BYTES) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_REQUEST_BYTES_INVALID', `${label} is outside the request boundary.`);
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_UTF8_INVALID', `${label} is not valid UTF-8.`);
  }
  if (text.charCodeAt(0) === 0xfeff) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_BOM_FORBIDDEN', `${label} contains a UTF-8 BOM.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_JSON_INVALID', `${label} is not valid JSON.`);
  }
}

function parseFalseAuthority(value, label = 'authority') {
  exactKeys(value, AVATAR_FINAL_PASS_AUTHORITY_KEYS, label);
  for (const key of AVATAR_FINAL_PASS_AUTHORITY_KEYS) {
    if (value[key] !== false) {
      fail('PROJECT_ART_AVATAR_FINAL_PASS_FALSE_AUTHORITY_REQUIRED', `${label}.${key} must remain false.`);
    }
  }
  return Object.freeze(Object.fromEntries(AVATAR_FINAL_PASS_AUTHORITY_KEYS.map((key) => [key, false])));
}

export function createAvatarFinalPassAuthority() {
  return parseFalseAuthority(
    Object.fromEntries(AVATAR_FINAL_PASS_AUTHORITY_KEYS.map((key) => [key, false])),
  );
}

function stableFile(filePath, label) {
  const before = lstatSync(filePath);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_SOURCE_FILE_INVALID', `${label} must be a single-link regular file.`);
  }
  if (before.size < 33 || before.size > MAXIMUM_FILE_BYTES) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_SOURCE_SIZE_INVALID', `${label} is outside the file boundary.`);
  }
  const bytes = readFileSync(filePath);
  const after = lstatSync(filePath);
  for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    if (before[key] !== after[key]) {
      fail('PROJECT_ART_AVATAR_FINAL_PASS_SOURCE_CHANGED', `${label} changed while being read.`);
    }
  }
  return Object.freeze({ bytes, sha256: sha256Bytes(bytes), sizeBytes: bytes.length });
}

function parsePngHeader(bytes, label) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(signature) || bytes.toString('ascii', 12, 16) !== 'IHDR') {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_PNG_INVALID', `${label} is not a supported PNG.`);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const bitDepth = bytes[24];
  const colourType = bytes[25];
  const compression = bytes[26];
  const filter = bytes[27];
  const interlace = bytes[28];
  if (
    width < 1 ||
    height < 1 ||
    width > 32768 ||
    height > 32768 ||
    bitDepth !== 8 ||
    ![4, 6].includes(colourType) ||
    compression !== 0 ||
    filter !== 0 ||
    interlace !== 0
  ) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_PNG_PROFILE_INVALID', `${label} must be a non-interlaced 8-bit alpha PNG.`);
  }
  return Object.freeze({ width, height, bitDepth, colourType, alpha: true, interlaced: false });
}

function resolveInside(root, relativePath, label) {
  const safe = canonicalPath(relativePath, label);
  const absolute = path.resolve(root, ...safe.split('/'));
  const relation = path.relative(root, absolute);
  if (relation.startsWith('..') || path.isAbsolute(relation)) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_PATH_ESCAPE', `${label} escapes the workspace.`);
  }
  return { relative: safe, absolute };
}

function parseCanvas(value) {
  exactKeys(value, ['width', 'height'], 'canvas');
  return Object.freeze({
    width: boundedInteger(value.width, 'canvas.width', 1, 32768),
    height: boundedInteger(value.height, 'canvas.height', 1, 32768),
  });
}

function parseQualityGates(value) {
  exactKeys(
    value,
    [
      'maximumCentroidShiftPixels',
      'maximumChangedFraction',
      'maximumMeanChannelDelta',
      'maximumAlphaChangedFraction',
      'minimumFrameDurationMs',
      'maximumFrameDurationMs',
      'requireHandsReview',
      'requireFaceIdentityReview',
      'requireLoopClosureForLoops',
    ],
    'qualityGates',
  );
  const minimumFrameDurationMs = boundedInteger(
    value.minimumFrameDurationMs,
    'qualityGates.minimumFrameDurationMs',
    16,
    2000,
  );
  const maximumFrameDurationMs = boundedInteger(
    value.maximumFrameDurationMs,
    'qualityGates.maximumFrameDurationMs',
    minimumFrameDurationMs,
    10000,
  );
  for (const key of ['requireHandsReview', 'requireFaceIdentityReview', 'requireLoopClosureForLoops']) {
    if (value[key] !== true) {
      fail('PROJECT_ART_AVATAR_FINAL_PASS_QUALITY_GATE_INVALID', `qualityGates.${key} must remain true.`);
    }
  }
  return Object.freeze({
    maximumCentroidShiftPixels: boundedNumber(
      value.maximumCentroidShiftPixels,
      'qualityGates.maximumCentroidShiftPixels',
      0,
      4096,
    ),
    maximumChangedFraction: boundedNumber(
      value.maximumChangedFraction,
      'qualityGates.maximumChangedFraction',
      0,
      1,
    ),
    maximumMeanChannelDelta: boundedNumber(
      value.maximumMeanChannelDelta,
      'qualityGates.maximumMeanChannelDelta',
      0,
      255,
    ),
    maximumAlphaChangedFraction: boundedNumber(
      value.maximumAlphaChangedFraction,
      'qualityGates.maximumAlphaChangedFraction',
      0,
      1,
    ),
    minimumFrameDurationMs,
    maximumFrameDurationMs,
    requireHandsReview: true,
    requireFaceIdentityReview: true,
    requireLoopClosureForLoops: true,
  });
}

function parseMaterializationManifest(value, expectedPath, expectedSha256, sourceCommit) {
  if (!isRecord(value) || !MATERIALIZATION_SCHEMAS.has(value.schema)) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_MANIFEST_INVALID');
  }
  if (
    value.sourceRef !== sourceCommit ||
    value.semanticStatus !== 'unreviewed' ||
    value.semanticAssignmentPerformed !== false ||
    value.timestampOrderUsedAsMeaning !== false ||
    value.generationOrderUsedAsMeaning !== false ||
    !Array.isArray(value.frames) ||
    value.frames.length < 1 ||
    value.frameCount !== value.frames.length ||
    value.authority?.semanticAssignment !== false ||
    value.authority?.imageEditing !== false ||
    value.authority?.repositoryMutation !== false ||
    value.authority?.forcePush !== false
  ) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_MANIFEST_BOUNDARY_INVALID');
  }
  const body = { ...value };
  delete body.manifestSha256;
  if (
    digest(value.manifestSha256, 'materializationManifest.manifestSha256') !==
      sha256AvatarFinalPassDocument(body) ||
    digest(expectedSha256, 'materializationManifestSha256') !== value.manifestSha256
  ) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_MANIFEST_HASH_MISMATCH');
  }
  return Object.freeze({ ...value, path: expectedPath });
}

function issueList(value, label) {
  if (!Array.isArray(value) || value.length > AVATAR_FINAL_PASS_ISSUES.length) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_ISSUES_INVALID', `${label} is invalid.`);
  }
  const unique = new Set();
  return Object.freeze(
    value.map((issue, index) => {
      if (!AVATAR_FINAL_PASS_ISSUES.includes(issue) || unique.has(issue)) {
        fail('PROJECT_ART_AVATAR_FINAL_PASS_ISSUES_INVALID', `${label}[${index}] is invalid or duplicated.`);
      }
      unique.add(issue);
      return issue;
    }),
  );
}

function operationList(value, label) {
  if (!Array.isArray(value) || value.length > AVATAR_FINAL_PASS_OPERATIONS.length) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_OPERATIONS_INVALID', `${label} is invalid.`);
  }
  const unique = new Set();
  return Object.freeze(
    value.map((operation, index) => {
      if (!AVATAR_FINAL_PASS_OPERATIONS.includes(operation) || unique.has(operation)) {
        fail('PROJECT_ART_AVATAR_FINAL_PASS_OPERATIONS_INVALID', `${label}[${index}] is invalid or duplicated.`);
      }
      unique.add(operation);
      return operation;
    }),
  );
}

function parseFrameDecision(value, index, manifestFrames, workspaceRoot, canvas) {
  exactKeys(
    value,
    [
      'frameId',
      'materializedPath',
      'expectedSha256',
      'targetPath',
      'disposition',
      'issues',
      'repairOperations',
      'reviewNotes',
    ],
    `frames[${index}]`,
  );
  const frameId = identifier(value.frameId, `frames[${index}].frameId`);
  const materializedPath = canonicalPath(value.materializedPath, `frames[${index}].materializedPath`);
  const targetPath = canonicalPath(value.targetPath, `frames[${index}].targetPath`);
  if (!targetPath.endsWith(`/${frameId}.png`)) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_TARGET_ID_MISMATCH');
  }
  if (!AVATAR_FINAL_PASS_DISPOSITIONS.includes(value.disposition)) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_DISPOSITION_INVALID');
  }
  const issues = issueList(value.issues, `frames[${index}].issues`);
  const repairOperations = operationList(
    value.repairOperations,
    `frames[${index}].repairOperations`,
  );
  if (typeof value.reviewNotes !== 'string' || value.reviewNotes.length > 4096) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_REVIEW_NOTES_INVALID');
  }
  if (value.disposition === 'accept' && (issues.length !== 0 || repairOperations.length !== 0)) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_ACCEPT_NOT_CLEAN');
  }
  if (
    value.disposition === 'deterministic-repair' &&
    (issues.length === 0 || repairOperations.length === 0)
  ) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_REPAIR_INCOMPLETE');
  }
  if (
    ['provider-redraw', 'exclude'].includes(value.disposition) &&
    (issues.length === 0 || repairOperations.length !== 0)
  ) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_DISPOSITION_INCOMPLETE');
  }
  const manifestFrame = manifestFrames.get(materializedPath);
  if (!manifestFrame) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_FRAME_NOT_IN_MANIFEST');
  }
  const expectedSha256 = digest(value.expectedSha256, `frames[${index}].expectedSha256`);
  if (manifestFrame.sha256 !== expectedSha256) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_FRAME_MANIFEST_HASH_MISMATCH');
  }
  const resolved = resolveInside(workspaceRoot, materializedPath, `frames[${index}].materializedPath`);
  const identity = stableFile(resolved.absolute, `frames[${index}]`);
  if (identity.sha256 !== expectedSha256 || identity.sizeBytes !== manifestFrame.sizeBytes) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_FRAME_SOURCE_HASH_MISMATCH');
  }
  const png = parsePngHeader(identity.bytes, `frames[${index}]`);
  if (png.width !== canvas.width || png.height !== canvas.height) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_FRAME_CANVAS_MISMATCH');
  }
  return Object.freeze({
    frameId,
    materializedPath,
    sourcePath: manifestFrame.sourcePath,
    sourceBatchId: manifestFrame.sourceBatchId,
    ordinal: manifestFrame.ordinal,
    sourceSha256: expectedSha256,
    sourceBytes: identity.sizeBytes,
    targetPath,
    disposition: value.disposition,
    issues,
    repairOperations,
    reviewNotes: value.reviewNotes,
    png,
  });
}

function parseInbetween(value, index, frameIds, canvas, qualityGates) {
  exactKeys(
    value,
    [
      'frameId',
      'beforeFrameId',
      'afterFrameId',
      'targetPath',
      'method',
      'durationMs',
      'constraints',
    ],
    `inbetweens[${index}]`,
  );
  const frameId = identifier(value.frameId, `inbetweens[${index}].frameId`);
  const beforeFrameId = identifier(value.beforeFrameId, `inbetweens[${index}].beforeFrameId`);
  const afterFrameId = identifier(value.afterFrameId, `inbetweens[${index}].afterFrameId`);
  if (!frameIds.has(beforeFrameId) || !frameIds.has(afterFrameId) || beforeFrameId === afterFrameId) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_INBETWEEN_ENDPOINT_INVALID');
  }
  const targetPath = canonicalPath(value.targetPath, `inbetweens[${index}].targetPath`);
  if (!targetPath.endsWith(`/${frameId}.png`)) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_TARGET_ID_MISMATCH');
  }
  if (!['provider-generated', 'deterministic-morph-preview'].includes(value.method)) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_INBETWEEN_METHOD_INVALID');
  }
  const durationMs = boundedInteger(
    value.durationMs,
    `inbetweens[${index}].durationMs`,
    qualityGates.minimumFrameDurationMs,
    qualityGates.maximumFrameDurationMs,
  );
  const constraints = issueList(value.constraints, `inbetweens[${index}].constraints`);
  if (constraints.length === 0) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_INBETWEEN_CONSTRAINTS_REQUIRED');
  }
  return Object.freeze({
    frameId,
    beforeFrameId,
    afterFrameId,
    targetPath,
    method: value.method,
    durationMs,
    constraints,
    canvas,
  });
}

function parseSequences(value, allFrameIds, qualityGates) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAXIMUM_SEQUENCES) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_SEQUENCES_INVALID');
  }
  const ids = new Set();
  return Object.freeze(
    value.map((sequence, index) => {
      exactKeys(
        sequence,
        ['id', 'kind', 'loopMode', 'frames', 'neutralFrameId', 'emotion', 'loopThresholds'],
        `sequences[${index}]`,
      );
      const id = identifier(sequence.id, `sequences[${index}].id`);
      if (ids.has(id)) fail('PROJECT_ART_AVATAR_FINAL_PASS_SEQUENCE_ID_DUPLICATE');
      ids.add(id);
      if (
        ![
          'idle',
          'blink',
          'talk-in',
          'talk-loop',
          'talk-out',
          'talk-emotion',
          'listening',
          'thinking',
          'gesture',
          'wave',
          'sleep',
          'dance',
          'emotion',
        ].includes(sequence.kind)
      ) {
        fail('PROJECT_ART_AVATAR_FINAL_PASS_SEQUENCE_KIND_INVALID');
      }
      if (!['once', 'loop', 'ping-pong'].includes(sequence.loopMode)) {
        fail('PROJECT_ART_AVATAR_FINAL_PASS_LOOP_MODE_INVALID');
      }
      if (!Array.isArray(sequence.frames) || sequence.frames.length < 1 || sequence.frames.length > 512) {
        fail('PROJECT_ART_AVATAR_FINAL_PASS_SEQUENCE_FRAMES_INVALID');
      }
      const ordered = sequence.frames.map((entry, frameIndex) => {
        exactKeys(entry, ['frameId', 'durationMs'], `sequences[${index}].frames[${frameIndex}]`);
        const frameId = identifier(entry.frameId, `sequences[${index}].frames[${frameIndex}].frameId`);
        if (!allFrameIds.has(frameId)) {
          fail('PROJECT_ART_AVATAR_FINAL_PASS_SEQUENCE_FRAME_MISSING');
        }
        return Object.freeze({
          frameId,
          durationMs: boundedInteger(
            entry.durationMs,
            `sequences[${index}].frames[${frameIndex}].durationMs`,
            qualityGates.minimumFrameDurationMs,
            qualityGates.maximumFrameDurationMs,
          ),
        });
      });
      const neutralFrameId = identifier(sequence.neutralFrameId, `sequences[${index}].neutralFrameId`);
      if (!ordered.some((entry) => entry.frameId === neutralFrameId)) {
        fail('PROJECT_ART_AVATAR_FINAL_PASS_NEUTRAL_FRAME_INVALID');
      }
      if (sequence.emotion !== null) identifier(sequence.emotion, `sequences[${index}].emotion`);
      if (sequence.loopMode === 'loop') {
        if (ordered.length < 2 || new Set(ordered.map((entry) => entry.frameId)).size < 2) {
          fail('PROJECT_ART_AVATAR_FINAL_PASS_LOOP_VARIATION_REQUIRED');
        }
        exactKeys(
          sequence.loopThresholds,
          [
            'maximumChangedFraction',
            'maximumMeanChannelDelta',
            'maximumAlphaChangedFraction',
            'maximumCentroidShiftPixels',
          ],
          `sequences[${index}].loopThresholds`,
        );
      } else if (sequence.loopThresholds !== null) {
        fail('PROJECT_ART_AVATAR_FINAL_PASS_FALSE_LOOP_THRESHOLD_FORBIDDEN');
      }
      const loopThresholds =
        sequence.loopMode === 'loop'
          ? Object.freeze({
              maximumChangedFraction: boundedNumber(
                sequence.loopThresholds.maximumChangedFraction,
                `sequences[${index}].loopThresholds.maximumChangedFraction`,
                0,
                Math.min(1, qualityGates.maximumChangedFraction),
              ),
              maximumMeanChannelDelta: boundedNumber(
                sequence.loopThresholds.maximumMeanChannelDelta,
                `sequences[${index}].loopThresholds.maximumMeanChannelDelta`,
                0,
                qualityGates.maximumMeanChannelDelta,
              ),
              maximumAlphaChangedFraction: boundedNumber(
                sequence.loopThresholds.maximumAlphaChangedFraction,
                `sequences[${index}].loopThresholds.maximumAlphaChangedFraction`,
                0,
                Math.min(1, qualityGates.maximumAlphaChangedFraction),
              ),
              maximumCentroidShiftPixels: boundedNumber(
                sequence.loopThresholds.maximumCentroidShiftPixels,
                `sequences[${index}].loopThresholds.maximumCentroidShiftPixels`,
                0,
                qualityGates.maximumCentroidShiftPixels,
              ),
            })
          : null;
      return Object.freeze({
        id,
        kind: sequence.kind,
        loopMode: sequence.loopMode,
        frames: Object.freeze(ordered),
        neutralFrameId,
        emotion: sequence.emotion,
        loopThresholds,
        durationMs: ordered.reduce((sum, entry) => sum + entry.durationMs, 0),
      });
    }),
  );
}

function createQualityJob(frame, qualityGates) {
  return Object.freeze({
    schema: AVATAR_FRAME_QUALITY_REPORT_SCHEMA,
    frameId: frame.frameId,
    sourcePath: frame.materializedPath,
    sourceSha256: frame.sourceSha256,
    canvas: frame.png,
    checks: Object.freeze([
      'hands-and-fingers',
      'anatomy',
      'face-identity',
      'silhouette',
      'crop-and-canvas',
      'transparency-and-edge-halo',
      'background-contamination',
      'style-and-lighting-consistency',
      'frame-to-frame-jitter',
    ]),
    thresholds: qualityGates,
    automatedAssurance: Object.freeze({
      schema: 'evavo.project-art-avatar-frame-assurance.v1',
      minimumIndependentInspectors: 2,
      minimumConfidence: 0.9,
      uncertainDisposition: 'quarantine',
      sourceIdentityMustMatch: true,
      candidateApproval: false,
    }),
    manualReviewRequired: true,
    candidateApproval: false,
  });
}

function createRepairJob(frame) {
  if (frame.disposition === 'accept' || frame.disposition === 'exclude') return null;
  if (frame.disposition === 'deterministic-repair') {
    return Object.freeze({
      schema: AVATAR_FRAME_REPAIR_REQUEST_SCHEMA,
      frameId: frame.frameId,
      mode: 'deterministic',
      sourcePath: frame.materializedPath,
      sourceSha256: frame.sourceSha256,
      targetPath: frame.targetPath,
      issues: frame.issues,
      operations: frame.repairOperations,
      sourceMutationAllowed: false,
      providerExecutionAllowed: false,
      candidateApproval: false,
    });
  }
  return Object.freeze({
    schema: AVATAR_FRAME_REPAIR_REQUEST_SCHEMA,
    frameId: frame.frameId,
    mode: 'provider-redraw',
    sourcePath: frame.materializedPath,
    sourceSha256: frame.sourceSha256,
    targetPath: frame.targetPath,
    issues: frame.issues,
    operations: Object.freeze([]),
    referenceImages: Object.freeze([frame.materializedPath]),
    providerExecutionAllowed: false,
    candidateApproval: false,
  });
}

function createInbetweenJob(entry, framesById) {
  const before = framesById.get(entry.beforeFrameId);
  const after = framesById.get(entry.afterFrameId);
  return Object.freeze({
    schema: AVATAR_INBETWEEN_REQUEST_SCHEMA,
    frameId: entry.frameId,
    method: entry.method,
    before: Object.freeze({
      frameId: before.frameId,
      path: before.targetPath,
      sourceSha256: before.sourceSha256,
    }),
    after: Object.freeze({
      frameId: after.frameId,
      path: after.targetPath,
      sourceSha256: after.sourceSha256,
    }),
    targetPath: entry.targetPath,
    durationMs: entry.durationMs,
    constraints: entry.constraints,
    canvas: entry.canvas,
    productionEligible: false,
    providerExecutionAllowed: false,
    candidateApproval: false,
  });
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freezeDeep(child);
  return value;
}

export function compileProjectArtAvatarFinalPass({
  workspaceRoot,
  request,
  requestBytes,
  compiledAt = new Date().toISOString(),
}) {
  const root = realpathSync(path.resolve(workspaceRoot));
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_WORKSPACE_INVALID');
  }
  if (!Number.isFinite(Date.parse(compiledAt)) || new Date(compiledAt).toISOString() !== compiledAt) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_TIMESTAMP_INVALID');
  }
  const fromBytes = parseJsonBytes(requestBytes, 'requestBytes');
  if (canonicalAvatarFinalPassJson(fromBytes) !== canonicalAvatarFinalPassJson(request)) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_REQUEST_BYTES_MISMATCH');
  }
  exactKeys(
    request,
    [
      'schema',
      'sessionId',
      'characterId',
      'sourceCommit',
      'materializationManifestPath',
      'materializationManifestSha256',
      'assignmentMode',
      'semanticInferencePerformed',
      'timestampOrderingUsedAsSemantics',
      'generationOrderingUsedAsSemantics',
      'canvas',
      'frames',
      'inbetweens',
      'sequences',
      'qualityGates',
      'authority',
    ],
    'request',
  );
  if (request.schema !== AVATAR_FINAL_PASS_REQUEST_SCHEMA) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_SCHEMA_INVALID');
  }
  if (
    request.assignmentMode !== 'owner-declared-only' ||
    request.semanticInferencePerformed !== false ||
    request.timestampOrderingUsedAsSemantics !== false ||
    request.generationOrderingUsedAsSemantics !== false
  ) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_EXPLICIT_ASSIGNMENT_REQUIRED');
  }
  const sessionId = identifier(request.sessionId, 'sessionId');
  const characterId = identifier(request.characterId, 'characterId');
  const commit = sourceRef(request.sourceCommit, 'sourceCommit');
  const canvas = parseCanvas(request.canvas);
  const qualityGates = parseQualityGates(request.qualityGates);
  const authority = parseFalseAuthority(request.authority);
  const manifestPath = resolveInside(
    root,
    request.materializationManifestPath,
    'materializationManifestPath',
  );
  const manifestIdentity = stableFile(manifestPath.absolute, 'materialization manifest');
  const manifestValue = parseJsonBytes(manifestIdentity.bytes, 'materialization manifest');
  const manifest = parseMaterializationManifest(
    manifestValue,
    manifestPath.relative,
    request.materializationManifestSha256,
    commit,
  );
  if (manifest.characterId !== characterId) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_CHARACTER_MISMATCH');
  }
  const manifestFrames = new Map(manifest.frames.map((frame) => [frame.materializedPath, frame]));
  if (!Array.isArray(request.frames) || request.frames.length < 1 || request.frames.length > MAXIMUM_FRAMES) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_FRAMES_INVALID');
  }
  const frameIds = new Set();
  const targetPaths = new Set();
  const frames = request.frames.map((frame, index) => {
    const parsed = parseFrameDecision(frame, index, manifestFrames, root, canvas);
    if (frameIds.has(parsed.frameId)) fail('PROJECT_ART_AVATAR_FINAL_PASS_FRAME_ID_DUPLICATE');
    if (targetPaths.has(parsed.targetPath)) fail('PROJECT_ART_AVATAR_FINAL_PASS_TARGET_DUPLICATE');
    frameIds.add(parsed.frameId);
    targetPaths.add(parsed.targetPath);
    return parsed;
  });
  if (!Array.isArray(request.inbetweens) || request.inbetweens.length > MAXIMUM_INBETWEENS) {
    fail('PROJECT_ART_AVATAR_FINAL_PASS_INBETWEENS_INVALID');
  }
  const inbetweens = request.inbetweens.map((entry, index) => {
    const parsed = parseInbetween(entry, index, frameIds, canvas, qualityGates);
    if (frameIds.has(parsed.frameId)) fail('PROJECT_ART_AVATAR_FINAL_PASS_FRAME_ID_DUPLICATE');
    if (targetPaths.has(parsed.targetPath)) fail('PROJECT_ART_AVATAR_FINAL_PASS_TARGET_DUPLICATE');
    frameIds.add(parsed.frameId);
    targetPaths.add(parsed.targetPath);
    return parsed;
  });
  const sequences = parseSequences(request.sequences, frameIds, qualityGates);
  const framesById = new Map(frames.map((frame) => [frame.frameId, frame]));
  const qualityJobs = Object.freeze(frames.map((frame) => createQualityJob(frame, qualityGates)));
  const repairJobs = Object.freeze(frames.map(createRepairJob).filter(Boolean));
  const inbetweenJobs = Object.freeze(inbetweens.map((entry) => createInbetweenJob(entry, framesById)));
  const pendingOutputIds = new Set([
    ...repairJobs.map((job) => job.frameId),
    ...inbetweenJobs.map((job) => job.frameId),
  ]);
  const excludedIds = new Set(
    frames.filter((frame) => frame.disposition === 'exclude').map((frame) => frame.frameId),
  );
  for (const sequence of sequences) {
    for (const entry of sequence.frames) {
      if (excludedIds.has(entry.frameId)) {
        fail('PROJECT_ART_AVATAR_FINAL_PASS_EXCLUDED_FRAME_REFERENCED');
      }
    }
  }
  const acceptedFrames = frames.filter((frame) => frame.disposition !== 'exclude');
  const finalFrameDescriptors = Object.freeze([
    ...acceptedFrames.map((frame) =>
      Object.freeze({
        id: frame.frameId,
        sourcePath: frame.materializedPath,
        targetPath: frame.targetPath,
        expectedSha256:
          frame.disposition === 'accept' ? frame.sourceSha256 : null,
        pendingOutput: frame.disposition !== 'accept',
      }),
    ),
    ...inbetweens.map((entry) =>
      Object.freeze({
        id: entry.frameId,
        sourcePath: null,
        targetPath: entry.targetPath,
        expectedSha256: null,
        pendingOutput: true,
      }),
    ),
  ]);
  const blockers = [];
  if (pendingOutputIds.size > 0) blockers.push('pending-mastered-or-generated-frame-bytes');
  if (repairJobs.some((job) => job.mode === 'provider-redraw')) blockers.push('provider-redraw-review-required');
  if (inbetweenJobs.length > 0) blockers.push('inbetween-review-required');
  blockers.push('independent-art-review-required');
  blockers.push('automated-frame-assurance-required');
  blockers.push('independent-animation-review-required');
  blockers.push('independent-runtime-review-required');
  blockers.push('loop-closure-evidence-required-for-loops');
  blockers.push('sequence-release-seal-required');
  const body = {
    schema: AVATAR_FINAL_PASS_PLAN_SCHEMA,
    sessionId,
    characterId,
    sourceCommit: commit,
    compiledAt,
    requestSha256: sha256Bytes(requestBytes),
    requestCanonicalSha256: sha256AvatarFinalPassDocument(request),
    materialization: Object.freeze({
      path: manifestPath.relative,
      manifestSha256: manifest.manifestSha256,
      sourceFrameCount: manifest.frameCount,
      selectedFrameCount: frames.length,
      selectedSourceBytes: frames.reduce((sum, frame) => sum + frame.sourceBytes, 0),
      semanticStatus: manifest.semanticStatus,
      sourceBytesEmbeddedInPlan: false,
    }),
    canvas,
    qualityGates,
    qualityJobs,
    repairJobs,
    inbetweenJobs,
    sequenceTimeline: sequences,
    sequenceMasteringRequestTemplate: Object.freeze({
      schema: 'evavo.project-art-avatar-sequence-request.v1',
      assignmentId: sessionId,
      characterId,
      revision: 1,
      purpose: 'Reviewed EVA avatar final art, timing and animation mastering.',
      assignmentMode: 'owner-declared-only',
      semanticInferencePerformed: false,
      timestampOrderingUsedAsSemantics: false,
      canvas,
      frames: finalFrameDescriptors,
      clips: sequences,
      defaults: null,
      authority,
      requiresOutputHashesBeforeCompile: pendingOutputIds.size > 0,
    }),
    atlasRequestTemplate: Object.freeze({
      schema: 'evavo.project-art-atlas-request.v1',
      atlasId: `${sessionId}-atlas`,
      characterId,
      frames: finalFrameDescriptors,
      wholeRunAtomicPublication: true,
      repositoryMutation: false,
    }),
    finalizationRequirements: Object.freeze([
      'execute-frame-quality-review',
      'complete-explicit-repairs-and-redraws',
      'complete-and-review-explicit-inbetweens',
      'bind-final-output-sha256-identities',
      'run-professional-mastering-and-motion',
      'compile-and-build-sequence-review',
      'run-final-to-first-loop-review-for-every-loop',
      'obtain-independent-art-animation-runtime-approvals',
      'seal-avatar-sequence-release',
      'publish-through-managed-non-force-path',
    ]),
    blockers: Object.freeze([...new Set(blockers)]),
    productionReady: false,
    runtimeActivationAllowed: false,
    authority,
  };
  return freezeDeep({
    ...body,
    planSha256: sha256AvatarFinalPassDocument(body),
  });
}

export function compileProjectArtAvatarFinalPassFile({
  workspaceRoot,
  requestPath,
  outputPath,
  compiledAt,
}) {
  const requestAbsolute = path.resolve(requestPath);
  const requestBytes = readFileSync(requestAbsolute);
  const request = parseJsonBytes(requestBytes, 'request file');
  const plan = compileProjectArtAvatarFinalPass({
    workspaceRoot,
    request,
    requestBytes,
    ...(compiledAt ? { compiledAt } : {}),
  });
  const outputAbsolute = path.resolve(outputPath);
  const handle = openSync(outputAbsolute, 'wx', 0o600);
  try {
    writeFileSync(handle, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  } finally {
    closeSync(handle);
  }
  return plan;
}
