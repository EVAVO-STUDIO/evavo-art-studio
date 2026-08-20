import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';

export const PNG_STRUCTURE_PROTOCOL_VERSION = '1.0.0';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const KNOWN_CRITICAL_CHUNKS = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND']);
const DEFAULT_ALLOWED_COLOR_TYPES = Object.freeze([2, 4, 6]);
const CHANNELS_BY_COLOR_TYPE = Object.freeze({ 2: 3, 4: 2, 6: 4 });
const FILTER_NAMES = Object.freeze(['none', 'sub', 'up', 'average', 'paeth']);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function fail(prefix, code, detail) {
  const fullCode = `${prefix}_${code}`;
  const error = new Error(detail ? `${fullCode}: ${detail}` : fullCode);
  error.code = fullCode;
  throw error;
}

function positiveSafeInteger(value, label, prefix) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail(prefix, 'OPTION_INVALID', label);
  }
  return value;
}

function canonicalPrefix(value) {
  if (typeof value !== 'string' || !/^[A-Z][A-Z0-9_]{2,95}$/u.test(value)) {
    throw new TypeError('PNG_STRUCTURE_ERROR_PREFIX_INVALID');
  }
  return value;
}

export function pngCrc32(bytesInput) {
  const bytes = Buffer.from(bytesInput ?? []);
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function paethPredictor(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const distanceLeft = Math.abs(estimate - left);
  const distanceAbove = Math.abs(estimate - above);
  const distanceUpperLeft = Math.abs(estimate - upperLeft);
  if (distanceLeft <= distanceAbove && distanceLeft <= distanceUpperLeft) return left;
  if (distanceAbove <= distanceUpperLeft) return above;
  return upperLeft;
}

function reconstructScanlines({
  inflated,
  width,
  height,
  bytesPerPixel,
  prefix,
}) {
  const rowBytes = width * bytesPerPixel;
  const expectedInflatedBytes = height * (rowBytes + 1);
  if (inflated.length !== expectedInflatedBytes) {
    fail(
      prefix,
      'DECODED_LENGTH_INVALID',
      `expected ${expectedInflatedBytes}, received ${inflated.length}`,
    );
  }

  const pixels = Buffer.allocUnsafe(height * rowBytes);
  const filterCounts = [0, 0, 0, 0, 0];
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    if (!Number.isInteger(filter) || filter < 0 || filter > 4) {
      fail(prefix, 'SCANLINE_FILTER_INVALID', `row ${y} uses filter ${filter}`);
    }
    filterCounts[filter] += 1;
    const rowOffset = y * rowBytes;
    const previousRowOffset = (y - 1) * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const encoded = inflated[inputOffset + x];
      const left = x >= bytesPerPixel ? pixels[rowOffset + x - bytesPerPixel] : 0;
      const above = y > 0 ? pixels[previousRowOffset + x] : 0;
      const upperLeft =
        y > 0 && x >= bytesPerPixel
          ? pixels[previousRowOffset + x - bytesPerPixel]
          : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) predictor = paethPredictor(left, above, upperLeft);
      pixels[rowOffset + x] = (encoded + predictor) & 0xff;
    }
    inputOffset += rowBytes;
  }

  return Object.freeze({
    pixels,
    rowBytes,
    expectedInflatedBytes,
    filterCounts: Object.freeze(
      Object.fromEntries(FILTER_NAMES.map((name, index) => [name, filterCounts[index]])),
    ),
  });
}

function transparencyKeyFromChunk({ colorType, bitDepth, chunk, prefix }) {
  if (!chunk) return null;
  if (colorType !== 2 || bitDepth !== 8 || chunk.length !== 6) {
    fail(prefix, 'TRNS_INVALID');
  }
  const red = chunk.readUInt16BE(0);
  const green = chunk.readUInt16BE(2);
  const blue = chunk.readUInt16BE(4);
  if (red > 255 || green > 255 || blue > 255) {
    fail(prefix, 'TRNS_SAMPLE_INVALID');
  }
  return Object.freeze({ red, green, blue });
}

function inspectPixels({
  pixels,
  width,
  height,
  colorType,
  bytesPerPixel,
  transparencyKey,
}) {
  let transparentPixelCount = 0;
  let translucentPixelCount = 0;
  let opaquePixelCount = 0;
  let alphaMinimum = 255;
  let alphaMaximum = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  const alphaForPixel = (offset) => {
    if (colorType === 4) return pixels[offset + 1];
    if (colorType === 6) return pixels[offset + 3];
    if (
      transparencyKey &&
      pixels[offset] === transparencyKey.red &&
      pixels[offset + 1] === transparencyKey.green &&
      pixels[offset + 2] === transparencyKey.blue
    ) {
      return 0;
    }
    return 255;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * bytesPerPixel;
      const alpha = alphaForPixel(offset);
      if (alpha < alphaMinimum) alphaMinimum = alpha;
      if (alpha > alphaMaximum) alphaMaximum = alpha;
      if (alpha === 0) transparentPixelCount += 1;
      else if (alpha === 255) opaquePixelCount += 1;
      else translucentPixelCount += 1;
      if (alpha > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const nonTransparentBounds =
    maxX < minX || maxY < minY
      ? null
      : Object.freeze({
          x: minX,
          y: minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
        });
  const pixelCount = width * height;
  return Object.freeze({
    pixelCount,
    opaquePixelCount,
    translucentPixelCount,
    transparentPixelCount,
    alphaMinimum,
    alphaMaximum,
    nonTransparentBounds,
    decodedPixelSha256: createHash('sha256').update(pixels).digest('hex'),
  });
}

export function inspectPngStructure(bytesInput, options = {}) {
  const prefix = canonicalPrefix(options.errorPrefix ?? 'EVAVO_PNG');
  const bytes = Buffer.from(bytesInput ?? []);
  const maximumBytes = positiveSafeInteger(
    options.maximumBytes ?? 64 * 1024 * 1024,
    'maximumBytes',
    prefix,
  );
  if (bytes.length < 45) fail(prefix, 'TOO_SHORT');
  if (bytes.length > maximumBytes) fail(prefix, 'TOO_LARGE');
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    fail(prefix, 'SIGNATURE_INVALID');
  }

  const expectedWidth = positiveSafeInteger(
    options.expectedWidth,
    'expectedWidth',
    prefix,
  );
  const expectedHeight = positiveSafeInteger(
    options.expectedHeight,
    'expectedHeight',
    prefix,
  );
  const expectedBitDepth = options.expectedBitDepth ?? 8;
  const requireNonInterlaced = options.requireNonInterlaced !== false;
  const allowedColorTypeValues =
    options.allowedColorTypes ?? DEFAULT_ALLOWED_COLOR_TYPES;
  if (
    !Array.isArray(allowedColorTypeValues) ||
    allowedColorTypeValues.length === 0 ||
    !Number.isSafeInteger(expectedBitDepth) ||
    !allowedColorTypeValues.every((value) => Number.isSafeInteger(value))
  ) {
    fail(prefix, 'OPTION_INVALID', 'bit depth or color types');
  }
  const allowedColorTypes = new Set(allowedColorTypeValues);

  let offset = PNG_SIGNATURE.length;
  let chunkIndex = 0;
  let ihdr = null;
  let seenPlte = false;
  let seenTrns = false;
  let transparencyChunk = null;
  let seenIdat = false;
  let idatClosed = false;
  let seenIend = false;
  let idatChunkCount = 0;
  let ancillaryChunkCount = 0;
  const idatParts = [];
  const chunkTypes = [];

  while (offset < bytes.length) {
    if (bytes.length - offset < 12) fail(prefix, 'CHUNK_TRUNCATED');
    const length = bytes.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = typeStart + 4;
    const dataEnd = dataStart + length;
    const crcOffset = dataEnd;
    const nextOffset = crcOffset + 4;
    if (length > maximumBytes || nextOffset > bytes.length) {
      fail(prefix, 'CHUNK_TRUNCATED');
    }
    const typeBytes = bytes.subarray(typeStart, dataStart);
    const type = typeBytes.toString('ascii');
    if (!/^[A-Za-z]{4}$/u.test(type)) fail(prefix, 'CHUNK_TYPE_INVALID');
    if ((typeBytes[2] & 0x20) !== 0) fail(prefix, 'CHUNK_RESERVED_BIT_INVALID', type);
    const data = bytes.subarray(dataStart, dataEnd);
    const expectedCrc = bytes.readUInt32BE(crcOffset);
    const actualCrc = pngCrc32(bytes.subarray(typeStart, dataEnd));
    if (expectedCrc !== actualCrc) fail(prefix, 'CHUNK_CRC_INVALID', type);
    chunkTypes.push(type);

    const critical = (typeBytes[0] & 0x20) === 0;
    if (critical && !KNOWN_CRITICAL_CHUNKS.has(type)) {
      fail(prefix, 'UNKNOWN_CRITICAL_CHUNK', type);
    }
    if (!critical) ancillaryChunkCount += 1;

    if (chunkIndex === 0 && type !== 'IHDR') fail(prefix, 'IHDR_NOT_FIRST');
    if (type === 'IHDR') {
      if (ihdr || chunkIndex !== 0 || length !== 13) fail(prefix, 'IHDR_INVALID');
      ihdr = Object.freeze({
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compressionMethod: data[10],
        filterMethod: data[11],
        interlaceMethod: data[12],
      });
    } else if (type === 'PLTE') {
      if (!ihdr || seenPlte || seenIdat || length === 0 || length % 3 !== 0 || length > 768) {
        fail(prefix, 'PLTE_INVALID');
      }
      seenPlte = true;
    } else if (type === 'tRNS') {
      if (!ihdr || seenTrns || seenIdat) fail(prefix, 'TRNS_ORDER_INVALID');
      seenTrns = true;
      transparencyChunk = Buffer.from(data);
    } else if (type === 'IDAT') {
      if (!ihdr || idatClosed) fail(prefix, 'IDAT_ORDER_INVALID');
      seenIdat = true;
      idatChunkCount += 1;
      idatParts.push(Buffer.from(data));
    } else if (type === 'IEND') {
      if (!ihdr || seenIend || !seenIdat || length !== 0) fail(prefix, 'IEND_INVALID');
      seenIend = true;
      if (nextOffset !== bytes.length) fail(prefix, 'TRAILING_BYTES');
    } else if (seenIdat) {
      idatClosed = true;
    }

    offset = nextOffset;
    chunkIndex += 1;
    if (seenIend) break;
  }

  if (!ihdr) fail(prefix, 'IHDR_MISSING');
  if (!seenIdat || idatChunkCount === 0) fail(prefix, 'IDAT_MISSING');
  if (!seenIend) fail(prefix, 'IEND_MISSING');
  if (offset !== bytes.length) fail(prefix, 'TRAILING_BYTES');
  if (
    ihdr.width !== expectedWidth ||
    ihdr.height !== expectedHeight ||
    ihdr.bitDepth !== expectedBitDepth ||
    !allowedColorTypes.has(ihdr.colorType) ||
    ihdr.compressionMethod !== 0 ||
    ihdr.filterMethod !== 0
  ) {
    fail(prefix, 'ENCODING_INVALID');
  }
  if (requireNonInterlaced && ihdr.interlaceMethod !== 0) {
    fail(prefix, 'INTERLACE_UNSUPPORTED');
  }
  if (![0, 1].includes(ihdr.interlaceMethod)) fail(prefix, 'INTERLACE_INVALID');
  if (ihdr.colorType === 4 && seenPlte) fail(prefix, 'PLTE_FORBIDDEN');
  if ([4, 6].includes(ihdr.colorType) && seenTrns) fail(prefix, 'TRNS_FORBIDDEN');

  const bytesPerPixel = CHANNELS_BY_COLOR_TYPE[ihdr.colorType];
  if (!bytesPerPixel) fail(prefix, 'COLOR_TYPE_UNSUPPORTED');
  const expectedInflatedBytes = ihdr.height * (ihdr.width * bytesPerPixel + 1);
  if (!Number.isSafeInteger(expectedInflatedBytes)) fail(prefix, 'DECODED_LENGTH_UNSAFE');
  let inflated;
  try {
    inflated = inflateSync(Buffer.concat(idatParts), {
      maxOutputLength: expectedInflatedBytes + 1,
    });
  } catch (error) {
    fail(prefix, 'IDAT_DECODE_INVALID', error instanceof Error ? error.message : String(error));
  }
  const reconstructed = reconstructScanlines({
    inflated,
    width: ihdr.width,
    height: ihdr.height,
    bytesPerPixel,
    prefix,
  });
  const transparencyKey = transparencyKeyFromChunk({
    colorType: ihdr.colorType,
    bitDepth: ihdr.bitDepth,
    chunk: transparencyChunk,
    prefix,
  });
  const pixelStatistics = inspectPixels({
    pixels: reconstructed.pixels,
    width: ihdr.width,
    height: ihdr.height,
    colorType: ihdr.colorType,
    bytesPerPixel,
    transparencyKey,
  });

  return Object.freeze({
    protocolVersion: PNG_STRUCTURE_PROTOCOL_VERSION,
    width: ihdr.width,
    height: ihdr.height,
    bitDepth: ihdr.bitDepth,
    colorType: ihdr.colorType,
    channels: bytesPerPixel,
    bytesPerPixel,
    alphaChannelDeclared: ihdr.colorType === 4 || ihdr.colorType === 6,
    transparencyMode:
      ihdr.colorType === 4 || ihdr.colorType === 6
        ? 'alpha-channel'
        : transparencyKey
          ? 'color-key'
          : 'opaque',
    transparencyKey,
    compressionMethod: ihdr.compressionMethod,
    filterMethod: ihdr.filterMethod,
    interlaceMethod: ihdr.interlaceMethod,
    chunkCount: chunkIndex,
    chunkTypes: Object.freeze(chunkTypes),
    idatChunkCount,
    ancillaryChunkCount,
    compressedIdatBytes: idatParts.reduce((total, part) => total + part.length, 0),
    inflatedScanlineBytes: inflated.length,
    decodedPixelBytes: reconstructed.pixels.length,
    scanlineFilterCounts: reconstructed.filterCounts,
    pixelStatistics,
    exactCanvasVerified: true,
    fullPngChunkStructureVerified: true,
    everyPngChunkCrcVerified: true,
    idatDecodeVerified: true,
    scanlineFiltersVerified: true,
    pixelReconstructionVerified: true,
    nonInterlacedVerified: ihdr.interlaceMethod === 0,
    noTrailingBytesVerified: true,
  });
}
