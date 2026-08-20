import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { deflateSync } from 'node:zlib';

import { inspectPngStructure, pngCrc32 } from './project-art/png-structure-v1.mjs';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function chunk(type, dataInput = Buffer.alloc(0)) {
  const data = Buffer.from(dataInput);
  const typeBytes = Buffer.from(type, 'ascii');
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBytes.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(pngCrc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return output;
}

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const dl = Math.abs(estimate - left);
  const da = Math.abs(estimate - above);
  const dul = Math.abs(estimate - upperLeft);
  if (dl <= da && dl <= dul) return left;
  if (da <= dul) return above;
  return upperLeft;
}

function filteredRows({ pixels, width, height, bytesPerPixel, filters }) {
  const rowBytes = width * bytesPerPixel;
  const output = Buffer.alloc(height * (rowBytes + 1));
  let outputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = filters[y % filters.length];
    output[outputOffset] = filter;
    outputOffset += 1;
    const rowOffset = y * rowBytes;
    const previousOffset = (y - 1) * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const value = pixels[rowOffset + x];
      const left = x >= bytesPerPixel ? pixels[rowOffset + x - bytesPerPixel] : 0;
      const above = y > 0 ? pixels[previousOffset + x] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? pixels[previousOffset + x - bytesPerPixel] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) predictor = paeth(left, above, upperLeft);
      output[outputOffset + x] = (value - predictor + 256) & 0xff;
    }
    outputOffset += rowBytes;
  }
  return output;
}

function png({
  width = 3,
  height = 5,
  colorType = 6,
  pixels,
  filters = [0, 1, 2, 3, 4],
  interlace = 0,
  splitIdat = false,
  betweenIdat = null,
  includeIdat = true,
  trailing = Buffer.alloc(0),
  transparencyKey = null,
} = {}) {
  const bytesPerPixel = { 2: 3, 4: 2, 6: 4 }[colorType];
  const source = pixels ?? Buffer.from({ length: width * height * bytesPerPixel }, (_, index) => (index * 37) & 0xff);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = interlace;
  const parts = [SIGNATURE, chunk('IHDR', ihdr)];
  if (transparencyKey) {
    const trns = Buffer.alloc(6);
    trns.writeUInt16BE(transparencyKey.red, 0);
    trns.writeUInt16BE(transparencyKey.green, 2);
    trns.writeUInt16BE(transparencyKey.blue, 4);
    parts.push(chunk('tRNS', trns));
  }
  if (includeIdat) {
    const compressed = deflateSync(filteredRows({ pixels: source, width, height, bytesPerPixel, filters }));
    if (splitIdat) {
      const split = Math.max(1, Math.floor(compressed.length / 2));
      parts.push(chunk('IDAT', compressed.subarray(0, split)));
      if (betweenIdat) parts.push(chunk(betweenIdat.type, betweenIdat.data));
      parts.push(chunk('IDAT', compressed.subarray(split)));
    } else {
      parts.push(chunk('IDAT', compressed));
    }
  }
  parts.push(chunk('IEND'));
  parts.push(Buffer.from(trailing));
  return { bytes: Buffer.concat(parts), pixels: source };
}

function inspect(bytes, options = {}) {
  return inspectPngStructure(bytes, {
    expectedWidth: options.width ?? 3,
    expectedHeight: options.height ?? 5,
    allowedColorTypes: options.allowedColorTypes ?? [2, 4, 6],
    expectedBitDepth: 8,
    requireNonInterlaced: true,
    errorPrefix: 'TEST_PNG',
  });
}

test('fully parses, CRC-checks, inflates and reconstructs all five scanline filters', () => {
  const fixture = png();
  const result = inspect(fixture.bytes);
  assert.equal(result.fullPngChunkStructureVerified, true);
  assert.equal(result.everyPngChunkCrcVerified, true);
  assert.equal(result.idatDecodeVerified, true);
  assert.equal(result.scanlineFiltersVerified, true);
  assert.equal(result.pixelReconstructionVerified, true);
  assert.equal(result.nonInterlacedVerified, true);
  assert.deepEqual(result.scanlineFilterCounts, {
    none: 1,
    sub: 1,
    up: 1,
    average: 1,
    paeth: 1,
  });
  assert.equal(
    result.pixelStatistics.decodedPixelSha256,
    createHash('sha256').update(fixture.pixels).digest('hex'),
  );
});

test('records alpha statistics and non-transparent bounds', () => {
  const width = 3;
  const height = 2;
  const pixels = Buffer.from([
    10, 20, 30, 0,
    10, 20, 30, 128,
    10, 20, 30, 255,
    10, 20, 30, 0,
    10, 20, 30, 0,
    10, 20, 30, 255,
  ]);
  const fixture = png({ width, height, pixels, filters: [0] });
  const result = inspect(fixture.bytes, { width, height });
  assert.deepEqual(result.pixelStatistics.nonTransparentBounds, {
    x: 1,
    y: 0,
    width: 2,
    height: 2,
  });
  assert.equal(result.pixelStatistics.transparentPixelCount, 3);
  assert.equal(result.pixelStatistics.translucentPixelCount, 1);
  assert.equal(result.pixelStatistics.opaquePixelCount, 2);
});

test('supports RGB colour-key transparency without pretending an alpha channel exists', () => {
  const width = 2;
  const height = 1;
  const pixels = Buffer.from([1, 2, 3, 9, 8, 7]);
  const fixture = png({
    width,
    height,
    colorType: 2,
    pixels,
    filters: [0],
    transparencyKey: { red: 1, green: 2, blue: 3 },
  });
  const result = inspect(fixture.bytes, { width, height });
  assert.equal(result.alphaChannelDeclared, false);
  assert.equal(result.transparencyMode, 'color-key');
  assert.equal(result.pixelStatistics.transparentPixelCount, 1);
  assert.equal(result.pixelStatistics.opaquePixelCount, 1);
});

test('rejects a corrupted chunk CRC', () => {
  const fixture = png();
  const corrupted = Buffer.from(fixture.bytes);
  corrupted[corrupted.length - 1] ^= 0xff;
  assert.throws(() => inspect(corrupted), /TEST_PNG_CHUNK_CRC_INVALID/u);
});

test('rejects trailing bytes after IEND', () => {
  const fixture = png({ trailing: Buffer.from('not-png') });
  assert.throws(() => inspect(fixture.bytes), /TEST_PNG_TRAILING_BYTES/u);
});

test('rejects an invalid scanline filter after successful zlib decode', () => {
  const fixture = png({ filters: [5] });
  assert.throws(() => inspect(fixture.bytes), /TEST_PNG_SCANLINE_FILTER_INVALID/u);
});

test('rejects interlaced sources because the governed source contract is non-interlaced', () => {
  const fixture = png({ interlace: 1 });
  assert.throws(() => inspect(fixture.bytes), /TEST_PNG_INTERLACE_UNSUPPORTED/u);
});

test('rejects a source with no IDAT data', () => {
  const fixture = png({ includeIdat: false });
  assert.throws(() => inspect(fixture.bytes), /TEST_PNG_IEND_INVALID|TEST_PNG_IDAT_MISSING/u);
});

test('rejects non-contiguous IDAT chunks', () => {
  const fixture = png({
    splitIdat: true,
    betweenIdat: { type: 'tEXt', data: Buffer.from('key\0value') },
  });
  assert.throws(() => inspect(fixture.bytes), /TEST_PNG_IDAT_ORDER_INVALID/u);
});
