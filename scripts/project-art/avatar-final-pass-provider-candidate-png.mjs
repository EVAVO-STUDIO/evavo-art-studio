import { inflateSync } from 'node:zlib';

import {
  MAXIMUM_CANDIDATE_BYTES,
  MAXIMUM_CANVAS_EDGE,
  MAXIMUM_DECODED_BYTES,
} from './avatar-final-pass-provider-candidate-constants.mjs';
import {
  assert,
  deepFreeze,
  sha256Bytes,
} from './avatar-final-pass-provider-candidate-common.mjs';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const APNG_CHUNKS = new Set(['acTL', 'fcTL', 'fdAT']);
const ALLOWED_CRITICAL_CHUNKS = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND']);

const CRC_TABLE = (() => {
  const values = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let current = index;
    for (let bit = 0; bit < 8; bit += 1) {
      current = (current & 1) !== 0
        ? (0xedb88320 ^ (current >>> 1))
        : (current >>> 1);
    }
    values[index] = current >>> 0;
  }
  return values;
})();

export function pngCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunkType(bytes) {
  const type = bytes.toString('ascii');
  assert(
    /^[A-Za-z]{4}$/u.test(type),
    'AVATAR_PROVIDER_CANDIDATE_PNG_CHUNK_TYPE_INVALID',
    'PNG chunk type must contain four ASCII letters.',
  );
  return type;
}

function paeth(left, above, upperLeft) {
  const prediction = left + above - upperLeft;
  const distanceLeft = Math.abs(prediction - left);
  const distanceAbove = Math.abs(prediction - above);
  const distanceUpperLeft = Math.abs(prediction - upperLeft);
  if (distanceLeft <= distanceAbove && distanceLeft <= distanceUpperLeft) return left;
  if (distanceAbove <= distanceUpperLeft) return above;
  return upperLeft;
}

function unfilterRows(inflated, width, height) {
  const bytesPerPixel = 4;
  const rowBytes = width * bytesPerPixel;
  const expected = height * (rowBytes + 1);
  assert(
    inflated.byteLength === expected,
    'AVATAR_PROVIDER_CANDIDATE_PNG_DECODED_SIZE_INVALID',
    `Decoded PNG length ${inflated.byteLength} does not match ${expected}.`,
  );

  const output = Buffer.allocUnsafe(height * rowBytes);
  for (let row = 0; row < height; row += 1) {
    const sourceStart = row * (rowBytes + 1);
    const filter = inflated[sourceStart];
    assert(
      filter >= 0 && filter <= 4,
      'AVATAR_PROVIDER_CANDIDATE_PNG_FILTER_INVALID',
      `PNG row ${row} uses unsupported filter ${filter}.`,
    );
    const targetStart = row * rowBytes;
    for (let column = 0; column < rowBytes; column += 1) {
      const raw = inflated[sourceStart + 1 + column];
      const left = column >= bytesPerPixel
        ? output[targetStart + column - bytesPerPixel]
        : 0;
      const above = row > 0
        ? output[targetStart - rowBytes + column]
        : 0;
      const upperLeft = row > 0 && column >= bytesPerPixel
        ? output[targetStart - rowBytes + column - bytesPerPixel]
        : 0;

      let value;
      if (filter === 0) value = raw;
      else if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + above;
      else if (filter === 3) value = raw + Math.floor((left + above) / 2);
      else value = raw + paeth(left, above, upperLeft);
      output[targetStart + column] = value & 0xff;
    }
  }
  return output;
}

function alphaEvidence(pixels, width, height, requireTransparentPixels) {
  let transparentPixels = 0;
  let partialAlphaPixels = 0;
  let opaquePixels = 0;
  let visiblePixels = 0;
  let hiddenRgbTransparentPixels = 0;
  let edgeVisiblePixels = 0;
  let minimumX = width;
  let minimumY = height;
  let maximumX = -1;
  let maximumY = -1;

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    const alpha = pixels[offset + 3];
    const x = pixel % width;
    const y = Math.floor(pixel / width);

    if (alpha === 0) {
      transparentPixels += 1;
      if (red !== 0 || green !== 0 || blue !== 0) {
        hiddenRgbTransparentPixels += 1;
      }
      continue;
    }

    visiblePixels += 1;
    if (alpha === 255) opaquePixels += 1;
    else partialAlphaPixels += 1;
    minimumX = Math.min(minimumX, x);
    minimumY = Math.min(minimumY, y);
    maximumX = Math.max(maximumX, x);
    maximumY = Math.max(maximumY, y);
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
      edgeVisiblePixels += 1;
    }
  }

  assert(
    visiblePixels > 0,
    'AVATAR_PROVIDER_CANDIDATE_PNG_EMPTY_ALPHA',
    'Candidate PNG is fully transparent.',
  );
  if (requireTransparentPixels) {
    assert(
      transparentPixels > 0,
      'AVATAR_PROVIDER_CANDIDATE_PNG_OPAQUE_BACKGROUND',
      'Candidate PNG has no transparent pixels.',
    );
  }

  return Object.freeze({
    visiblePixels,
    transparentPixels,
    partialAlphaPixels,
    opaquePixels,
    hiddenRgbTransparentPixels,
    edgeVisiblePixels,
    visibleBounds: Object.freeze({
      x: minimumX,
      y: minimumY,
      width: maximumX - minimumX + 1,
      height: maximumY - minimumY + 1,
    }),
  });
}

export function inspectAvatarProviderCandidatePng(
  input,
  expectedWidth,
  expectedHeight,
  { requireTransparentPixels = true } = {},
) {
  const bytes = Buffer.from(input);
  assert(
    bytes.byteLength >= 57 && bytes.byteLength <= MAXIMUM_CANDIDATE_BYTES,
    'AVATAR_PROVIDER_CANDIDATE_PNG_SIZE_INVALID',
    `Candidate PNG must contain 57 to ${MAXIMUM_CANDIDATE_BYTES} bytes.`,
  );
  assert(
    Number.isSafeInteger(expectedWidth) &&
      Number.isSafeInteger(expectedHeight) &&
      expectedWidth >= 1 &&
      expectedHeight >= 1 &&
      expectedWidth <= MAXIMUM_CANVAS_EDGE &&
      expectedHeight <= MAXIMUM_CANVAS_EDGE,
    'AVATAR_PROVIDER_CANDIDATE_CANVAS_INVALID',
    'Expected candidate canvas is outside the bounded range.',
  );
  assert(
    bytes.subarray(0, PNG_SIGNATURE.byteLength).equals(PNG_SIGNATURE),
    'AVATAR_PROVIDER_CANDIDATE_PNG_SIGNATURE_INVALID',
    'Candidate does not have the PNG signature.',
  );

  let offset = PNG_SIGNATURE.byteLength;
  let ihdr = null;
  let sawIend = false;
  let sawIdat = false;
  let idatClosed = false;
  let chunkCount = 0;
  const idat = [];

  while (offset < bytes.byteLength) {
    assert(
      offset + 12 <= bytes.byteLength,
      'AVATAR_PROVIDER_CANDIDATE_PNG_TRUNCATED',
      'Candidate PNG ends inside a chunk header.',
    );
    const length = bytes.readUInt32BE(offset);
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    const type = chunkType(typeBytes);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcOffset = dataEnd;
    const next = crcOffset + 4;
    assert(
      next <= bytes.byteLength,
      'AVATAR_PROVIDER_CANDIDATE_PNG_TRUNCATED',
      `Candidate PNG chunk ${type} exceeds the file boundary.`,
    );
    const data = bytes.subarray(dataStart, dataEnd);
    const expectedCrc = bytes.readUInt32BE(crcOffset);
    const actualCrc = pngCrc32(Buffer.concat([typeBytes, data]));
    assert(
      expectedCrc === actualCrc,
      'AVATAR_PROVIDER_CANDIDATE_PNG_CRC_INVALID',
      `Candidate PNG chunk ${type} failed CRC verification.`,
    );

    chunkCount += 1;
    assert(
      chunkCount <= 4096,
      'AVATAR_PROVIDER_CANDIDATE_PNG_CHUNK_LIMIT',
      'Candidate PNG contains too many chunks.',
    );
    assert(
      !APNG_CHUNKS.has(type),
      'AVATAR_PROVIDER_CANDIDATE_APNG_FORBIDDEN',
      'Animated PNG chunks are not allowed for one avatar frame.',
    );
    if (type[0] === type[0].toUpperCase()) {
      assert(
        ALLOWED_CRITICAL_CHUNKS.has(type),
        'AVATAR_PROVIDER_CANDIDATE_PNG_CRITICAL_CHUNK_INVALID',
        `Candidate PNG contains unsupported critical chunk ${type}.`,
      );
    }

    if (chunkCount === 1) {
      assert(
        type === 'IHDR',
        'AVATAR_PROVIDER_CANDIDATE_PNG_IHDR_ORDER_INVALID',
        'IHDR must be the first PNG chunk.',
      );
    }
    if (type === 'IHDR') {
      assert(
        ihdr === null && length === 13,
        'AVATAR_PROVIDER_CANDIDATE_PNG_IHDR_INVALID',
        'Candidate PNG must contain one 13-byte IHDR.',
      );
      ihdr = Object.freeze({
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      });
    } else if (type === 'IDAT') {
      assert(
        ihdr !== null && !idatClosed && !sawIend,
        'AVATAR_PROVIDER_CANDIDATE_PNG_IDAT_ORDER_INVALID',
        'IDAT chunks must be consecutive and precede IEND.',
      );
      sawIdat = true;
      idat.push(data);
    } else if (sawIdat && type !== 'IEND') {
      idatClosed = true;
    }

    if (type === 'IEND') {
      assert(
        !sawIend && length === 0 && sawIdat,
        'AVATAR_PROVIDER_CANDIDATE_PNG_IEND_INVALID',
        'Candidate PNG must contain one empty IEND after IDAT.',
      );
      sawIend = true;
      assert(
        next === bytes.byteLength,
        'AVATAR_PROVIDER_CANDIDATE_PNG_TRAILING_BYTES',
        'Candidate PNG contains bytes after IEND.',
      );
    }
    offset = next;
  }

  assert(
    ihdr !== null && sawIdat && sawIend,
    'AVATAR_PROVIDER_CANDIDATE_PNG_STRUCTURE_INVALID',
    'Candidate PNG is missing IHDR, IDAT or IEND.',
  );
  assert(
    ihdr.width === expectedWidth && ihdr.height === expectedHeight,
    'AVATAR_PROVIDER_CANDIDATE_PNG_DIMENSIONS_MISMATCH',
    `Candidate canvas ${ihdr.width}x${ihdr.height} does not match ${expectedWidth}x${expectedHeight}.`,
  );
  assert(
    ihdr.bitDepth === 8 &&
      ihdr.colorType === 6 &&
      ihdr.compression === 0 &&
      ihdr.filter === 0 &&
      ihdr.interlace === 0,
    'AVATAR_PROVIDER_CANDIDATE_PNG_FORMAT_INVALID',
    'Candidate must be non-interlaced 8-bit RGBA PNG using standard compression and filtering.',
  );

  const decodedLength = expectedHeight * (expectedWidth * 4 + 1);
  assert(
    decodedLength <= MAXIMUM_DECODED_BYTES,
    'AVATAR_PROVIDER_CANDIDATE_PNG_DECODED_SIZE_INVALID',
    'Candidate decoded image exceeds the bounded memory limit.',
  );
  let inflated;
  try {
    inflated = inflateSync(Buffer.concat(idat), {
      maxOutputLength: decodedLength + 1,
    });
  } catch (error) {
    assert(
      false,
      'AVATAR_PROVIDER_CANDIDATE_PNG_DEFLATE_INVALID',
      `Candidate PNG IDAT data could not be decoded: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const pixels = unfilterRows(inflated, expectedWidth, expectedHeight);
  const alpha = alphaEvidence(
    pixels,
    expectedWidth,
    expectedHeight,
    requireTransparentPixels,
  );

  return deepFreeze({
    mediaType: 'image/png',
    width: expectedWidth,
    height: expectedHeight,
    bitDepth: 8,
    colorType: 6,
    channels: 4,
    interlaced: false,
    animated: false,
    byteLength: bytes.byteLength,
    sha256: sha256Bytes(bytes),
    chunkCount,
    idatChunkCount: idat.length,
    ...alpha,
  });
}
