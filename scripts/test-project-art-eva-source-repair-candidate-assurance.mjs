#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { deflateSync } from 'node:zlib';

import {
  EVA_SOURCE_REPAIR_CANDIDATE_ASSURANCE_SCHEMA,
  EVA_SOURCE_REPAIR_MASK_ASSURANCE_SCHEMA,
  inspectEvaSourceRepairCandidate,
  inspectEvaSourceRepairMask,
  inspectEvaSourceRepairCandidateUnboundFileForTesting,
  verifyEvaSourceRepairAssuranceDocument,
} from './project-art/eva-source-repair-candidate-assurance.mjs';

const WIDTH = 1024;
const HEIGHT = 1536;
const FRAME_ID = 'eva-20260809-153620-frame-05';
const SOURCE_PATH =
  'assets/eva-female/ChatGPT Image Aug 9, 2026, 03_36_21 PM (5).png';
const MASK_PATH =
  'workfiles/eva-source-repairs/v1/redraw/eva-20260809-153620-frame-05/defect-mask.png';
const CANDIDATE_PATH =
  'workfiles/eva-source-repairs/v1/redraw/eva-20260809-153620-frame-05/candidate-01.png';
const INSPECTED_AT = '2026-08-15T13:00:00.000Z';

function sha256(bytes) {
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

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBytes.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return output;
}

function png(colourType, pixel) {
  const channels = colourType === 2 ? 3 : 4;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8;
  ihdr[9] = colourType;
  const raw = Buffer.alloc(HEIGHT * (1 + WIDTH * channels));
  for (let y = 0; y < HEIGHT; y += 1) {
    const rowStart = y * (1 + WIDTH * channels);
    raw[rowStart] = 0;
    for (let x = 0; x < WIDTH; x += 1) {
      const values = pixel(x, y);
      const offset = rowStart + 1 + x * channels;
      for (let channel = 0; channel < channels; channel += 1) {
        raw[offset + channel] = values[channel];
      }
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const inside = (x, y, rectangle) =>
  x >= rectangle.x &&
  x < rectangle.x + rectangle.width &&
  y >= rectangle.y &&
  y < rectangle.y + rectangle.height;

function maskPng(rectangles = [
  { x: 280, y: 650, width: 40, height: 40 },
  { x: 660, y: 650, width: 40, height: 40 },
], pixelOverride = null) {
  return png(6, (x, y) => {
    if (pixelOverride) {
      const overridden = pixelOverride(x, y);
      if (overridden) return overridden;
    }
    return rectangles.some((rectangle) => inside(x, y, rectangle))
      ? [255, 255, 255, 255]
      : [0, 0, 0, 0];
  });
}

function candidatePng({ protectedDrift = false } = {}) {
  return png(6, (x, y) => {
    if (protectedDrift && x === 500 && y === 500) return [99, 30, 40, 255];
    if (
      inside(x, y, { x: 280, y: 650, width: 12, height: 12 }) ||
      inside(x, y, { x: 660, y: 650, width: 12, height: 12 })
    ) {
      return [80, 70, 60, 255];
    }
    return [20, 30, 40, 255];
  });
}

const source = png(2, () => [20, 30, 40]);

function options(mask = maskPng(), candidate = candidatePng()) {
  return {
    frameId: FRAME_ID,
    sourceBytes: source,
    sourcePath: SOURCE_PATH,
    expectedSourceSha256: sha256(source),
    maskBytes: mask,
    maskPath: MASK_PATH,
    expectedMaskSha256: sha256(mask),
    candidateBytes: candidate,
    candidatePath: CANDIDATE_PATH,
    expectedCandidateSha256: sha256(candidate),
    inspectedAt: INSPECTED_AT,
  };
}

test('canonical bilateral mask and exact protected pixels pass pixel assurance without claiming sealed intake identity', () => {
  const input = options();
  const maskEvidence = inspectEvaSourceRepairMask(input);
  assert.equal(maskEvidence.schema, EVA_SOURCE_REPAIR_MASK_ASSURANCE_SCHEMA);
  assert.equal(maskEvidence.mask.components.length, 2);
  assert.deepEqual(maskEvidence.mask.components.map((entry) => entry.side), [
    'left',
    'right',
  ]);
  assert.equal(maskEvidence.mask.editablePixels, 3200);
  assert.equal(maskEvidence.gates.faceTorsoWardrobeProtected, true);
  assert.equal(maskEvidence.gates.exactSourceIdentityPassed, false);
  assert.equal(maskEvidence.gates.providerDispatchMaskReady, false);
  assert.equal(maskEvidence.gates.productionAlphaReady, false);
  verifyEvaSourceRepairAssuranceDocument(maskEvidence);

  const evidence = inspectEvaSourceRepairCandidate(input);
  assert.equal(evidence.schema, EVA_SOURCE_REPAIR_CANDIDATE_ASSURANCE_SCHEMA);
  assert.equal(evidence.comparison.changedEditablePixels, 288);
  assert.equal(evidence.comparison.changedProtectedPixels, 0);
  assert.equal(evidence.gates.sourceSpaceAssurancePassed, false);
  assert.equal(evidence.gates.protectedPixelInvariancePassed, true);
  assert.equal(evidence.gates.alphaMasteringRequired, true);
  assert.equal(evidence.gates.productionAlphaReady, false);
  assert.equal(evidence.gates.candidateApproval, false);
  assert.ok(
    evidence.nextRequiredActions.includes(
      'run-separate-alpha-mastering-with-non-target-evidence',
    ),
  );
  verifyEvaSourceRepairAssuranceDocument(evidence);
});

test('one changed protected pixel fails closed', () => {
  const candidate = candidatePng({ protectedDrift: true });
  assert.throws(
    () => inspectEvaSourceRepairCandidate(options(maskPng(), candidate)),
    (error) =>
      error?.code === 'EVA_SOURCE_REPAIR_ASSURANCE_PROTECTED_PIXEL_CHANGED',
  );
});

test('mask components outside the reviewed hand envelopes fail closed', () => {
  const invalid = maskPng([
    { x: 280, y: 650, width: 40, height: 40 },
    { x: 480, y: 650, width: 40, height: 40 },
  ]);
  assert.throws(
    () => inspectEvaSourceRepairMask(options(invalid)),
    (error) =>
      error?.code === 'EVA_SOURCE_REPAIR_ASSURANCE_MASK_ENVELOPE_INVALID',
  );
});

test('partial-alpha, grey and hidden-RGB mask pixels fail closed', () => {
  for (const invalidPixel of [
    [255, 255, 255, 128],
    [128, 128, 128, 255],
    [1, 0, 0, 0],
  ]) {
    const invalid = maskPng(undefined, (x, y) =>
      x === 0 && y === 0 ? invalidPixel : null,
    );
    assert.throws(
      () => inspectEvaSourceRepairMask(options(invalid)),
      (error) =>
        error?.code === 'EVA_SOURCE_REPAIR_ASSURANCE_MASK_PIXEL_INVALID',
    );
  }
});

test('tiny masks, fragmented masks and touching-edge masks fail closed', () => {
  const tiny = maskPng([
    { x: 280, y: 650, width: 8, height: 8 },
    { x: 660, y: 650, width: 8, height: 8 },
  ]);
  assert.throws(
    () => inspectEvaSourceRepairMask(options(tiny)),
    (error) => error?.code === 'EVA_SOURCE_REPAIR_ASSURANCE_MASK_AREA_INVALID',
  );

  const fragmented = maskPng([
    { x: 280, y: 650, width: 30, height: 30 },
    { x: 350, y: 650, width: 30, height: 30 },
    { x: 660, y: 650, width: 30, height: 30 },
  ]);
  assert.throws(
    () => inspectEvaSourceRepairMask(options(fragmented)),
    (error) =>
      error?.code === 'EVA_SOURCE_REPAIR_ASSURANCE_MASK_COMPONENT_COUNT_INVALID',
  );

  const edge = maskPng([
    { x: 0, y: 650, width: 40, height: 40 },
    { x: 660, y: 650, width: 40, height: 40 },
  ]);
  assert.throws(
    () => inspectEvaSourceRepairMask(options(edge)),
    (error) => error?.code === 'EVA_SOURCE_REPAIR_ASSURANCE_MASK_TOUCHES_EDGE',
  );
});

test('declared hashes are independently verified', () => {
  const input = options();
  assert.throws(
    () =>
      inspectEvaSourceRepairMask({
        ...input,
        expectedMaskSha256: 'f'.repeat(64),
      }),
    (error) =>
      error?.code === 'EVA_SOURCE_REPAIR_ASSURANCE_FILE_HASH_MISMATCH',
  );
});

test('unbound file primitive is stable, single-link, permission-restricted and create-only without dispatch authority', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'eva-source-assurance-'));
  try {
    const input = options();
    const sourceFile = path.join(root, 'source.png');
    const maskFile = path.join(root, 'mask.png');
    const candidateFile = path.join(root, 'candidate.png');
    const outputPath = path.join(root, 'evidence.json');
    writeFileSync(sourceFile, input.sourceBytes);
    writeFileSync(maskFile, input.maskBytes);
    writeFileSync(candidateFile, input.candidateBytes);
    const fileOptions = {
      frameId: FRAME_ID,
      sourceFile,
      sourcePath: SOURCE_PATH,
      expectedSourceSha256: input.expectedSourceSha256,
      maskFile,
      maskPath: MASK_PATH,
      expectedMaskSha256: input.expectedMaskSha256,
      candidateFile,
      candidatePath: CANDIDATE_PATH,
      expectedCandidateSha256: input.expectedCandidateSha256,
      inspectedAt: INSPECTED_AT,
      outputPath,
    };
    const result = inspectEvaSourceRepairCandidateUnboundFileForTesting(fileOptions);
    assert.equal(result.assurance.gates.sourceSpaceAssurancePassed, false);
    assert.equal(result.assurance.gates.protectedPixelInvariancePassed, true);
    assert.equal(
      JSON.parse(readFileSync(outputPath, 'utf8')).assuranceSha256,
      result.assurance.assuranceSha256,
    );
    assert.equal(statSync(outputPath).mode & 0o777, 0o600);
    assert.throws(
      () => inspectEvaSourceRepairCandidateUnboundFileForTesting(fileOptions),
      (error) => error?.code === 'EEXIST',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

console.log('Project Art EVA source-repair candidate assurance passed.');
console.log('- binary bilateral hand masks stay inside five reviewed frame envelopes');
console.log('- every protected RGBA source-space pixel is compared exactly');
console.log('- RGB source repair and production alpha mastering remain separate gates');
