import { createHash } from 'node:crypto';
import {
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

import {
  canonicalJson,
  canonicalRelativePath,
  safeId,
  sha256,
  withDocumentHash,
} from './common.mjs';
import { EVA_SOURCE_REPAIR_TASK_CATALOGUE } from './eva-source-repair-catalogue.mjs';
import {
  EVA_SOURCE_REPAIR_HAND_ENVELOPES,
} from './eva-source-repair-assurance-constants.mjs';
import {
  compileProjectArtEvaSourceRepairProviderAdmissionsTemplate,
} from './eva-source-repair-provider-package.mjs';

export const EVA_SOURCE_REPAIR_MASK_ASSURANCE_SCHEMA =
  'evavo.project-art-eva-source-repair-mask-assurance.v1';
export const EVA_SOURCE_REPAIR_CANDIDATE_ASSURANCE_SCHEMA =
  'evavo.project-art-eva-source-repair-candidate-assurance.v1';
export { EVA_SOURCE_REPAIR_HAND_ENVELOPES };

const WIDTH = 1024;
const HEIGHT = 1536;
const PIXELS = WIDTH * HEIGHT;
const MAXIMUM_PNG_BYTES = 64 * 1024 * 1024;
const MINIMUM_EDITABLE_PIXELS = Math.ceil(PIXELS * 0.0005);
const MAXIMUM_EDITABLE_PIXELS = Math.floor(PIXELS * 0.15);
const MINIMUM_COMPONENT_PIXELS = 64;
const MAXIMUM_COMPONENT_PIXELS = Math.floor(PIXELS * 0.1);
const MAXIMUM_COMPONENT_WIDTH = Math.floor(WIDTH * 0.5);
const MAXIMUM_COMPONENT_HEIGHT = Math.floor(HEIGHT * 0.45);
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const APNG_CHUNKS = new Set(['acTL', 'fcTL', 'fdAT']);
const ALLOWED_CRITICAL_CHUNKS = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND']);
const SHA256 = /^[a-f0-9]{64}$/u;

const SOURCE_TASKS = new Map(
  EVA_SOURCE_REPAIR_TASK_CATALOGUE
    .filter((task) => task.kind === 'masked-source-edit')
    .map((task) => [task.frameId, task]),
);

export class EvaSourceRepairCandidateAssuranceError extends Error {
  constructor(code, message = code) {
    super(`${code}: ${message}`);
    this.name = 'EvaSourceRepairCandidateAssuranceError';
    this.code = code;
  }
}

function fail(code, message = code) {
  throw new EvaSourceRepairCandidateAssuranceError(code, message);
}

function digest(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    fail('EVA_SOURCE_REPAIR_ASSURANCE_SHA256_INVALID', label);
  }
  return value;
}

function timestamp(value, label) {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    fail('EVA_SOURCE_REPAIR_ASSURANCE_TIMESTAMP_INVALID', label);
  }
  return value;
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1
        ? 0xedb88320 ^ (value >>> 1)
        : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function paeth(left, above, upperLeft) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function unfilter(inflated, width, height, bytesPerPixel) {
  const rowBytes = width * bytesPerPixel;
  const expected = height * (rowBytes + 1);
  if (inflated.byteLength !== expected) {
    fail(
      'EVA_SOURCE_REPAIR_ASSURANCE_PNG_DECODED_SIZE_INVALID',
      `decoded ${inflated.byteLength} bytes instead of ${expected}`,
    );
  }
  const output = Buffer.allocUnsafe(height * rowBytes);
  for (let row = 0; row < height; row += 1) {
    const sourceStart = row * (rowBytes + 1);
    const filter = inflated[sourceStart];
    if (filter > 4) {
      fail('EVA_SOURCE_REPAIR_ASSURANCE_PNG_FILTER_INVALID', `row ${row}`);
    }
    const targetStart = row * rowBytes;
    for (let column = 0; column < rowBytes; column += 1) {
      const raw = inflated[sourceStart + 1 + column];
      const left = column >= bytesPerPixel
        ? output[targetStart + column - bytesPerPixel]
        : 0;
      const above = row > 0 ? output[targetStart - rowBytes + column] : 0;
      const upperLeft = row > 0 && column >= bytesPerPixel
        ? output[targetStart - rowBytes + column - bytesPerPixel]
        : 0;
      let value = raw;
      if (filter === 1) value += left;
      else if (filter === 2) value += above;
      else if (filter === 3) value += Math.floor((left + above) / 2);
      else if (filter === 4) value += paeth(left, above, upperLeft);
      output[targetStart + column] = value & 0xff;
    }
  }
  return output;
}

function decodePng(input, allowedColourTypes, label) {
  const bytes = Buffer.from(input);
  if (
    bytes.byteLength < 57 ||
    bytes.byteLength > MAXIMUM_PNG_BYTES ||
    !bytes.subarray(0, 8).equals(PNG_SIGNATURE)
  ) {
    fail('EVA_SOURCE_REPAIR_ASSURANCE_PNG_INVALID', label);
  }

  let offset = 8;
  let ihdr = null;
  let sawIdat = false;
  let idatClosed = false;
  let sawIend = false;
  const idat = [];
  while (offset < bytes.byteLength) {
    if (offset + 12 > bytes.byteLength) {
      fail('EVA_SOURCE_REPAIR_ASSURANCE_PNG_TRUNCATED', label);
    }
    const length = bytes.readUInt32BE(offset);
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    const type = typeBytes.toString('ascii');
    if (!/^[A-Za-z]{4}$/u.test(type) || APNG_CHUNKS.has(type)) {
      fail('EVA_SOURCE_REPAIR_ASSURANCE_PNG_CHUNK_INVALID', `${label}.${type}`);
    }
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const next = dataEnd + 4;
    if (next > bytes.byteLength) {
      fail('EVA_SOURCE_REPAIR_ASSURANCE_PNG_TRUNCATED', `${label}.${type}`);
    }
    const data = bytes.subarray(dataStart, dataEnd);
    if (crc32(Buffer.concat([typeBytes, data])) !== bytes.readUInt32BE(dataEnd)) {
      fail('EVA_SOURCE_REPAIR_ASSURANCE_PNG_CRC_INVALID', `${label}.${type}`);
    }
    const critical = (typeBytes[0] & 0x20) === 0;
    if (critical && !ALLOWED_CRITICAL_CHUNKS.has(type)) {
      fail('EVA_SOURCE_REPAIR_ASSURANCE_PNG_CRITICAL_CHUNK_INVALID', `${label}.${type}`);
    }
    if (type === 'IHDR') {
      if (ihdr || offset !== 8 || length !== 13) {
        fail('EVA_SOURCE_REPAIR_ASSURANCE_PNG_IHDR_INVALID', label);
      }
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colourType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
    } else if (type === 'IDAT') {
      if (!ihdr || idatClosed || sawIend) {
        fail('EVA_SOURCE_REPAIR_ASSURANCE_PNG_IDAT_INVALID', label);
      }
      sawIdat = true;
      idat.push(data);
    } else if (sawIdat && type !== 'IEND') {
      idatClosed = true;
    }
    if (type === 'IEND') {
      if (length !== 0 || !sawIdat || sawIend || next !== bytes.byteLength) {
        fail('EVA_SOURCE_REPAIR_ASSURANCE_PNG_IEND_INVALID', label);
      }
      sawIend = true;
    }
    offset = next;
  }

  if (
    !ihdr ||
    !sawIend ||
    ihdr.width !== WIDTH ||
    ihdr.height !== HEIGHT ||
    ihdr.bitDepth !== 8 ||
    !allowedColourTypes.includes(ihdr.colourType) ||
    ihdr.compression !== 0 ||
    ihdr.filter !== 0 ||
    ihdr.interlace !== 0
  ) {
    fail('EVA_SOURCE_REPAIR_ASSURANCE_PNG_PROFILE_INVALID', label);
  }
  const bytesPerPixel = ihdr.colourType === 2 ? 3 : 4;
  const maximumInflated = HEIGHT * (WIDTH * bytesPerPixel + 1);
  let inflated;
  try {
    inflated = inflateSync(Buffer.concat(idat), { maxOutputLength: maximumInflated });
  } catch (error) {
    fail('EVA_SOURCE_REPAIR_ASSURANCE_PNG_INFLATE_INVALID', `${label}: ${error.message}`);
  }
  return Object.freeze({
    ...ihdr,
    sha256: sha256Bytes(bytes),
    pixels: unfilter(inflated, WIDTH, HEIGHT, bytesPerPixel),
  });
}

function rgbaPixels(decoded) {
  if (decoded.colourType === 6) return decoded.pixels;
  const output = Buffer.allocUnsafe(PIXELS * 4);
  for (let pixel = 0; pixel < PIXELS; pixel += 1) {
    output[pixel * 4] = decoded.pixels[pixel * 3];
    output[pixel * 4 + 1] = decoded.pixels[pixel * 3 + 1];
    output[pixel * 4 + 2] = decoded.pixels[pixel * 3 + 2];
    output[pixel * 4 + 3] = 255;
  }
  return output;
}

function boundsWithin(bounds, envelope) {
  return bounds.minimumX >= envelope.minimumX &&
    bounds.minimumY >= envelope.minimumY &&
    bounds.maximumX <= envelope.maximumX &&
    bounds.maximumY <= envelope.maximumY;
}

function inspectMaskPixels(decoded, frameId) {
  const editable = new Uint8Array(PIXELS);
  let editablePixels = 0;
  for (let pixel = 0; pixel < PIXELS; pixel += 1) {
    const offset = pixel * 4;
    const red = decoded.pixels[offset];
    const green = decoded.pixels[offset + 1];
    const blue = decoded.pixels[offset + 2];
    const alpha = decoded.pixels[offset + 3];
    const protectedPixel = red === 0 && green === 0 && blue === 0 && alpha === 0;
    const editablePixel = red === 255 && green === 255 && blue === 255 && alpha === 255;
    if (!protectedPixel && !editablePixel) {
      fail(
        'EVA_SOURCE_REPAIR_ASSURANCE_MASK_PIXEL_INVALID',
        `pixel ${pixel % WIDTH},${Math.floor(pixel / WIDTH)} is not transparent black or opaque white`,
      );
    }
    if (editablePixel) {
      editable[pixel] = 1;
      editablePixels += 1;
      const x = pixel % WIDTH;
      const y = Math.floor(pixel / WIDTH);
      if (x === 0 || y === 0 || x === WIDTH - 1 || y === HEIGHT - 1) {
        fail('EVA_SOURCE_REPAIR_ASSURANCE_MASK_TOUCHES_EDGE', frameId);
      }
    }
  }
  if (
    editablePixels < MINIMUM_EDITABLE_PIXELS ||
    editablePixels > MAXIMUM_EDITABLE_PIXELS
  ) {
    fail(
      'EVA_SOURCE_REPAIR_ASSURANCE_MASK_AREA_INVALID',
      `${editablePixels} editable pixels`,
    );
  }

  const visited = new Uint8Array(PIXELS);
  const queue = new Int32Array(editablePixels);
  const components = [];
  for (let start = 0; start < PIXELS; start += 1) {
    if (editable[start] === 0 || visited[start] === 1) continue;
    let head = 0;
    let tail = 1;
    queue[0] = start;
    visited[start] = 1;
    let pixelCount = 0;
    let minimumX = WIDTH;
    let minimumY = HEIGHT;
    let maximumX = -1;
    let maximumY = -1;
    while (head < tail) {
      const pixel = queue[head++];
      pixelCount += 1;
      const x = pixel % WIDTH;
      const y = Math.floor(pixel / WIDTH);
      minimumX = Math.min(minimumX, x);
      minimumY = Math.min(minimumY, y);
      maximumX = Math.max(maximumX, x);
      maximumY = Math.max(maximumY, y);
      const neighbours = [pixel - 1, pixel + 1, pixel - WIDTH, pixel + WIDTH];
      for (let index = 0; index < neighbours.length; index += 1) {
        const next = neighbours[index];
        if (
          next < 0 ||
          next >= PIXELS ||
          (index === 0 && x === 0) ||
          (index === 1 && x === WIDTH - 1) ||
          editable[next] === 0 ||
          visited[next] === 1
        ) continue;
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
    const bounds = { minimumX, minimumY, maximumX, maximumY };
    const componentWidth = maximumX - minimumX + 1;
    const componentHeight = maximumY - minimumY + 1;
    if (
      pixelCount < MINIMUM_COMPONENT_PIXELS ||
      pixelCount > MAXIMUM_COMPONENT_PIXELS ||
      componentWidth > MAXIMUM_COMPONENT_WIDTH ||
      componentHeight > MAXIMUM_COMPONENT_HEIGHT
    ) {
      fail('EVA_SOURCE_REPAIR_ASSURANCE_MASK_COMPONENT_INVALID', JSON.stringify(bounds));
    }
    components.push({ pixelCount, bounds });
  }
  if (components.length !== 2) {
    fail(
      'EVA_SOURCE_REPAIR_ASSURANCE_MASK_COMPONENT_COUNT_INVALID',
      `${components.length} components`,
    );
  }

  const envelopes = EVA_SOURCE_REPAIR_HAND_ENVELOPES[frameId];
  const assigned = new Map();
  for (const component of components) {
    const sides = Object.entries(envelopes)
      .filter(([, envelope]) => boundsWithin(component.bounds, envelope))
      .map(([side]) => side);
    if (sides.length !== 1 || assigned.has(sides[0])) {
      fail(
        'EVA_SOURCE_REPAIR_ASSURANCE_MASK_ENVELOPE_INVALID',
        JSON.stringify(component.bounds),
      );
    }
    assigned.set(sides[0], component);
  }
  if (!assigned.has('left') || !assigned.has('right')) {
    fail('EVA_SOURCE_REPAIR_ASSURANCE_MASK_ENVELOPE_INVALID', frameId);
  }
  return Object.freeze({
    editable,
    editablePixels,
    coverageRatio: editablePixels / PIXELS,
    components: Object.freeze(['left', 'right'].map((side) => Object.freeze({
      side,
      pixelCount: assigned.get(side).pixelCount,
      bounds: Object.freeze({ ...assigned.get(side).bounds }),
      envelope: envelopes[side],
    }))),
  });
}

function identity(frameId) {
  safeId(frameId, 'frameId');
  const task = SOURCE_TASKS.get(frameId);
  if (!task || !EVA_SOURCE_REPAIR_HAND_ENVELOPES[frameId]) {
    fail('EVA_SOURCE_REPAIR_ASSURANCE_FRAME_INVALID', frameId);
  }
  return task;
}

function verifyExpectedSha256(observed, expected, label) {
  digest(expected, label);
  if (observed !== expected) {
    fail('EVA_SOURCE_REPAIR_ASSURANCE_FILE_HASH_MISMATCH', label);
  }
}

function authority() {
  return Object.freeze({
    sourceMutation: false,
    providerExecution: false,
    candidateApproval: false,
    candidatePromotion: false,
    alphaMasteringApproval: false,
    runtimeActivation: false,
    publication: false,
    repositoryMutation: false,
    gitCommit: false,
    gitPush: false,
    forcePush: false,
  });
}

export function inspectEvaSourceRepairMask({
  frameId,
  sourceBytes,
  sourcePath,
  expectedSourceSha256,
  maskBytes,
  maskPath,
  expectedMaskSha256,
  intakeSha256 = null,
  inspectedAt = new Date().toISOString(),
}) {
  const task = identity(frameId);
  timestamp(inspectedAt, 'inspectedAt');
  const source = decodePng(sourceBytes, [2, 6], 'source');
  const mask = decodePng(maskBytes, [6], 'mask');
  verifyExpectedSha256(source.sha256, expectedSourceSha256, 'expectedSourceSha256');
  verifyExpectedSha256(mask.sha256, expectedMaskSha256, 'expectedMaskSha256');
  const maskInspection = inspectMaskPixels(mask, frameId);
  if (intakeSha256 !== null) digest(intakeSha256, 'intakeSha256');
  const sealedIntakeIdentity = intakeSha256 !== null;
  const body = {
    schema: EVA_SOURCE_REPAIR_MASK_ASSURANCE_SCHEMA,
    phase: 'pre-dispatch-mask-admission',
    frameId,
    taskId: task.taskId,
    inspectedAt,
    intakeSha256,
    canvas: Object.freeze({ width: WIDTH, height: HEIGHT }),
    source: Object.freeze({
      path: canonicalRelativePath(sourcePath, 'sourcePath'),
      sha256: source.sha256,
      gitBlobSha1: task.sourceGitBlobSha1,
      encoding: source.colourType === 2 ? 'rgb8' : 'rgba8',
      alphaChannelPresent: source.colourType === 6,
      identityAuthority: sealedIntakeIdentity
        ? 'sealed-eva-source-repair-intake'
        : 'caller-declared-library-input',
    }),
    mask: Object.freeze({
      path: canonicalRelativePath(maskPath, 'maskPath'),
      sha256: mask.sha256,
      semantics: 'transparent-black-protected__opaque-white-editable',
      connectivity: 4,
      editablePixels: maskInspection.editablePixels,
      protectedPixels: PIXELS - maskInspection.editablePixels,
      coverageRatio: maskInspection.coverageRatio,
      components: maskInspection.components,
      touchesCanvasEdge: false,
    }),
    gates: Object.freeze({
      exactSourceIdentityPassed: sealedIntakeIdentity,
      exactCanvasPassed: true,
      canonicalBinaryMaskPassed: true,
      bilateralHandEnvelopePassed: true,
      faceTorsoWardrobeProtected: true,
      providerDispatchMaskReady: sealedIntakeIdentity,
      candidateApproval: false,
      productionAlphaReady: false,
      runtimeActivationAllowed: false,
    }),
    authority: authority(),
  };
  return withDocumentHash(body, 'assuranceSha256');
}

export function inspectEvaSourceRepairCandidate({
  frameId,
  sourceBytes,
  sourcePath,
  expectedSourceSha256,
  maskBytes,
  maskPath,
  expectedMaskSha256,
  candidateBytes,
  candidatePath,
  expectedCandidateSha256,
  intakeSha256 = null,
  inspectedAt = new Date().toISOString(),
}) {
  const maskAssurance = inspectEvaSourceRepairMask({
    frameId,
    sourceBytes,
    sourcePath,
    expectedSourceSha256,
    maskBytes,
    maskPath,
    expectedMaskSha256,
    intakeSha256,
    inspectedAt,
  });
  const source = decodePng(sourceBytes, [2, 6], 'source');
  const mask = decodePng(maskBytes, [6], 'mask');
  const candidate = decodePng(candidateBytes, [6], 'candidate');
  verifyExpectedSha256(
    candidate.sha256,
    expectedCandidateSha256,
    'expectedCandidateSha256',
  );
  const maskInspection = inspectMaskPixels(mask, frameId);
  const sourceRgba = rgbaPixels(source);
  let changedEditablePixels = 0;
  let changedProtectedPixels = 0;
  let transparentCandidatePixels = 0;
  let partialAlphaCandidatePixels = 0;
  for (let pixel = 0; pixel < PIXELS; pixel += 1) {
    const offset = pixel * 4;
    let changed = false;
    for (let channel = 0; channel < 4; channel += 1) {
      if (sourceRgba[offset + channel] !== candidate.pixels[offset + channel]) {
        changed = true;
      }
    }
    if (changed) {
      if (maskInspection.editable[pixel] === 1) changedEditablePixels += 1;
      else changedProtectedPixels += 1;
    }
    const alpha = candidate.pixels[offset + 3];
    if (alpha === 0) transparentCandidatePixels += 1;
    else if (alpha !== 255) partialAlphaCandidatePixels += 1;
  }
  if (changedProtectedPixels !== 0) {
    fail(
      'EVA_SOURCE_REPAIR_ASSURANCE_PROTECTED_PIXEL_CHANGED',
      `${changedProtectedPixels} pixels outside the mask changed`,
    );
  }
  const minimumMeaningfulChanges = Math.max(
    64,
    Math.ceil(maskInspection.editablePixels * 0.01),
  );
  if (changedEditablePixels < minimumMeaningfulChanges) {
    fail(
      'EVA_SOURCE_REPAIR_ASSURANCE_EDIT_NOT_MEANINGFUL',
      `${changedEditablePixels} changed editable pixels; ${minimumMeaningfulChanges} required`,
    );
  }
  const alphaMasteringRequired = source.colourType === 2;
  const productionAlphaReady =
    !alphaMasteringRequired && transparentCandidatePixels > 0;
  const body = {
    schema: EVA_SOURCE_REPAIR_CANDIDATE_ASSURANCE_SCHEMA,
    phase: 'post-provider-source-space-candidate',
    frameId,
    taskId: SOURCE_TASKS.get(frameId).taskId,
    inspectedAt,
    canvas: Object.freeze({ width: WIDTH, height: HEIGHT }),
    maskAssuranceSha256: maskAssurance.assuranceSha256,
    source: maskAssurance.source,
    mask: Object.freeze({
      path: maskAssurance.mask.path,
      sha256: maskAssurance.mask.sha256,
      editablePixels: maskAssurance.mask.editablePixels,
      components: maskAssurance.mask.components,
    }),
    candidate: Object.freeze({
      path: canonicalRelativePath(candidatePath, 'candidatePath'),
      sha256: candidate.sha256,
      encoding: 'rgba8',
      transparentPixels: transparentCandidatePixels,
      partialAlphaPixels: partialAlphaCandidatePixels,
    }),
    comparison: Object.freeze({
      changedEditablePixels,
      minimumMeaningfulChanges,
      changedProtectedPixels,
      protectedPixelsCompared: PIXELS - maskInspection.editablePixels,
      protectedPixelPolicy: 'exact-rgba-source-space-invariance',
    }),
    gates: Object.freeze({
      maskAssurancePassed: maskAssurance.gates.providerDispatchMaskReady,
      sourceSpaceAssurancePassed:
        maskAssurance.gates.providerDispatchMaskReady,
      protectedPixelInvariancePassed: true,
      meaningfulMaskedEditPassed: true,
      alphaMasteringRequired,
      productionAlphaReady,
      creativeReviewRequired: true,
      candidateApproval: false,
      candidatePromotion: false,
      runtimeActivationAllowed: false,
      publicationAllowed: false,
    }),
    nextRequiredActions: Object.freeze([
      ...(alphaMasteringRequired
        ? ['run-separate-alpha-mastering-with-non-target-evidence']
        : []),
      'run-dual-independent-anatomy-and-identity-inspection',
      'record-separate-creative-approval',
      'regenerate-and-verify-atlas-and-sequence-release',
      'reverify-browser-playback-before-runtime-activation',
    ]),
    authority: authority(),
  };
  return withDocumentHash(body, 'assuranceSha256');
}

function stablePng(filePath, label) {
  const absolute = path.resolve(filePath);
  const before = lstatSync(absolute);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.size < 57 ||
    before.size > MAXIMUM_PNG_BYTES
  ) {
    fail('EVA_SOURCE_REPAIR_ASSURANCE_INPUT_FILE_INVALID', label);
  }
  const resolved = realpathSync(absolute);
  const bytes = readFileSync(resolved);
  const after = lstatSync(resolved);
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    if (before[field] !== after[field]) {
      fail('EVA_SOURCE_REPAIR_ASSURANCE_INPUT_FILE_CHANGED', label);
    }
  }
  return Object.freeze({ absolute: resolved, bytes });
}

function stableJson(filePath, label) {
  const absolute = path.resolve(filePath);
  const before = lstatSync(absolute);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.size < 2 ||
    before.size > 8 * 1024 * 1024
  ) {
    fail('EVA_SOURCE_REPAIR_ASSURANCE_INPUT_FILE_INVALID', label);
  }
  const resolved = realpathSync(absolute);
  const bytes = readFileSync(resolved);
  const after = lstatSync(resolved);
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    if (before[field] !== after[field]) {
      fail('EVA_SOURCE_REPAIR_ASSURANCE_INPUT_FILE_CHANGED', label);
    }
  }
  let value;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.startsWith('\uFEFF')) throw new Error('UTF-8 BOM is forbidden.');
    value = JSON.parse(text);
  } catch (error) {
    fail(
      'EVA_SOURCE_REPAIR_ASSURANCE_INTAKE_JSON_INVALID',
      `${label}: ${error.message}`,
    );
  }
  return Object.freeze({ absolute: resolved, value });
}

function sealedSourceIdentity(intakeFile, frameId) {
  const intake = stableJson(intakeFile, 'intakeFile').value;
  compileProjectArtEvaSourceRepairProviderAdmissionsTemplate(intake);
  const job = intake.providerPlan.repairJobs.find(
    (entry) => entry.frameId === frameId,
  );
  const task = identity(frameId);
  if (
    !job ||
    job.sourceGitBlobSha1 !== task.sourceGitBlobSha1 ||
    typeof job.sourceSha256 !== 'string' ||
    !SHA256.test(job.sourceSha256)
  ) {
    fail('EVA_SOURCE_REPAIR_ASSURANCE_INTAKE_SOURCE_IDENTITY_INVALID', frameId);
  }
  return Object.freeze({
    intakeSha256: intake.intakeSha256,
    sourcePath: job.sourcePath,
    sourceSha256: job.sourceSha256,
  });
}

function ensureDistinct(inputs) {
  const paths = inputs.map((input) => input.absolute);
  if (new Set(paths).size !== paths.length) {
    fail('EVA_SOURCE_REPAIR_ASSURANCE_INPUT_IDENTITY_CONFLICT');
  }
}

function writeCreateOnly(outputPath, value) {
  const absolute = path.resolve(outputPath);
  const handle = openSync(absolute, 'wx', 0o600);
  try {
    writeFileSync(handle, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  } finally {
    closeSync(handle);
  }
  return absolute;
}

export function inspectEvaSourceRepairMaskUnboundFileForTesting(options) {
  const source = stablePng(options.sourceFile, 'sourceFile');
  const mask = stablePng(options.maskFile, 'maskFile');
  ensureDistinct([source, mask]);
  const assurance = inspectEvaSourceRepairMask({
    frameId: options.frameId,
    sourceBytes: source.bytes,
    sourcePath: options.sourcePath,
    expectedSourceSha256: options.expectedSourceSha256,
    maskBytes: mask.bytes,
    maskPath: options.maskPath,
    expectedMaskSha256: options.expectedMaskSha256,
    ...(options.intakeSha256 ? { intakeSha256: options.intakeSha256 } : {}),
    ...(options.inspectedAt ? { inspectedAt: options.inspectedAt } : {}),
  });
  return Object.freeze({
    assurance,
    outputPath: writeCreateOnly(options.outputPath, assurance),
  });
}

export function inspectEvaSourceRepairCandidateUnboundFileForTesting(options) {
  const source = stablePng(options.sourceFile, 'sourceFile');
  const mask = stablePng(options.maskFile, 'maskFile');
  const candidate = stablePng(options.candidateFile, 'candidateFile');
  ensureDistinct([source, mask, candidate]);
  const assurance = inspectEvaSourceRepairCandidate({
    frameId: options.frameId,
    sourceBytes: source.bytes,
    sourcePath: options.sourcePath,
    expectedSourceSha256: options.expectedSourceSha256,
    maskBytes: mask.bytes,
    maskPath: options.maskPath,
    expectedMaskSha256: options.expectedMaskSha256,
    candidateBytes: candidate.bytes,
    candidatePath: options.candidatePath,
    expectedCandidateSha256: options.expectedCandidateSha256,
    ...(options.intakeSha256 ? { intakeSha256: options.intakeSha256 } : {}),
    ...(options.inspectedAt ? { inspectedAt: options.inspectedAt } : {}),
  });
  return Object.freeze({
    assurance,
    outputPath: writeCreateOnly(options.outputPath, assurance),
  });
}

export function inspectEvaSourceRepairMaskFile(options) {
  const sealed = sealedSourceIdentity(options.intakeFile, options.frameId);
  return inspectEvaSourceRepairMaskUnboundFileForTesting({
    ...options,
    sourcePath: sealed.sourcePath,
    expectedSourceSha256: sealed.sourceSha256,
    intakeSha256: sealed.intakeSha256,
  });
}

export function inspectEvaSourceRepairCandidateFile(options) {
  const sealed = sealedSourceIdentity(options.intakeFile, options.frameId);
  return inspectEvaSourceRepairCandidateUnboundFileForTesting({
    ...options,
    sourcePath: sealed.sourcePath,
    expectedSourceSha256: sealed.sourceSha256,
    intakeSha256: sealed.intakeSha256,
  });
}

export function verifyEvaSourceRepairAssuranceDocument(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![
      EVA_SOURCE_REPAIR_MASK_ASSURANCE_SCHEMA,
      EVA_SOURCE_REPAIR_CANDIDATE_ASSURANCE_SCHEMA,
    ].includes(value.schema)
  ) {
    fail('EVA_SOURCE_REPAIR_ASSURANCE_DOCUMENT_INVALID');
  }
  digest(value.assuranceSha256, 'assuranceSha256');
  const body = { ...value };
  delete body.assuranceSha256;
  if (sha256(canonicalJson(body)) !== value.assuranceSha256) {
    fail('EVA_SOURCE_REPAIR_ASSURANCE_DOCUMENT_HASH_MISMATCH');
  }
  identity(value.frameId);
  return value;
}
