import { inflateSync } from 'node:zlib';

import {
  EVA_TALK_NEUTRAL_CANVAS,
  MAXIMUM_PNG_BYTES,
  PNG_SIGNATURE,
  assert,
  deepFreeze,
  fail,
} from './eva-talk-neutral-local-queue-common.mjs';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function inspectEvaTalkNeutralCandidatePng(bytesInput) {
  const bytes = Buffer.from(bytesInput ?? []);
  assert(
    bytes.length >= 57 && bytes.length <= MAXIMUM_PNG_BYTES,
    'EVA_TALK_NEUTRAL_QUEUE_PNG_INVALID',
  );
  assert(
    bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE),
    'EVA_TALK_NEUTRAL_QUEUE_PNG_SIGNATURE_INVALID',
  );
  let offset = PNG_SIGNATURE.length;
  let ihdr = null;
  const idat = [];
  let iendSeen = false;
  let idatStarted = false;
  let idatEnded = false;
  let chunkCount = 0;
  while (offset < bytes.length) {
    assert(offset + 12 <= bytes.length, 'EVA_TALK_NEUTRAL_QUEUE_PNG_TRUNCATED');
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    assert(/^[A-Za-z]{4}$/u.test(type), 'EVA_TALK_NEUTRAL_QUEUE_PNG_CHUNK_TYPE_INVALID');
    if (/^[A-Z]/u.test(type)) {
      assert(
        ['IHDR', 'PLTE', 'IDAT', 'IEND'].includes(type),
        'EVA_TALK_NEUTRAL_QUEUE_PNG_CRITICAL_CHUNK_INVALID',
      );
    }
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcOffset = dataEnd;
    assert(dataEnd + 4 <= bytes.length, 'EVA_TALK_NEUTRAL_QUEUE_PNG_TRUNCATED');
    const expectedCrc = bytes.readUInt32BE(crcOffset);
    const observedCrc = crc32(bytes.subarray(offset + 4, dataEnd));
    assert(expectedCrc === observedCrc, 'EVA_TALK_NEUTRAL_QUEUE_PNG_CRC_INVALID');
    const data = bytes.subarray(dataStart, dataEnd);
    chunkCount += 1;
    if (type !== 'IDAT' && idatStarted && type !== 'IEND') idatEnded = true;
    if (type === 'IHDR') {
      assert(ihdr === null && length === 13 && chunkCount === 1, 'EVA_TALK_NEUTRAL_QUEUE_PNG_IHDR_INVALID');
      ihdr = Object.freeze({
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colourType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      });
    } else if (type === 'IDAT') {
      assert(
        ihdr !== null && !iendSeen && !idatEnded && length > 0,
        'EVA_TALK_NEUTRAL_QUEUE_PNG_IDAT_INVALID',
      );
      idatStarted = true;
      idat.push(data);
    } else if (type === 'IEND') {
      assert(length === 0 && !iendSeen, 'EVA_TALK_NEUTRAL_QUEUE_PNG_IEND_INVALID');
      iendSeen = true;
      offset = dataEnd + 4;
      break;
    }
    offset = dataEnd + 4;
  }
  assert(
    ihdr !== null &&
      ihdr.width === EVA_TALK_NEUTRAL_CANVAS.width &&
      ihdr.height === EVA_TALK_NEUTRAL_CANVAS.height &&
      ihdr.bitDepth === 8 &&
      ihdr.colourType === 6 &&
      ihdr.compression === 0 &&
      ihdr.filter === 0 &&
      ihdr.interlace === 0,
    'EVA_TALK_NEUTRAL_QUEUE_PNG_PROFILE_INVALID',
  );
  assert(iendSeen && offset === bytes.length, 'EVA_TALK_NEUTRAL_QUEUE_PNG_TRAILING_BYTES');
  assert(idat.length >= 1, 'EVA_TALK_NEUTRAL_QUEUE_PNG_IDAT_MISSING');
  let inflated;
  try {
    inflated = inflateSync(Buffer.concat(idat), {
      maxOutputLength:
        (EVA_TALK_NEUTRAL_CANVAS.width * 4 + 1) * EVA_TALK_NEUTRAL_CANVAS.height,
    });
  } catch {
    fail('EVA_TALK_NEUTRAL_QUEUE_PNG_IDAT_INVALID');
  }
  const expectedInflated =
    (EVA_TALK_NEUTRAL_CANVAS.width * 4 + 1) * EVA_TALK_NEUTRAL_CANVAS.height;
  assert(inflated.length === expectedInflated, 'EVA_TALK_NEUTRAL_QUEUE_PNG_SCANLINES_INVALID');
  const stride = EVA_TALK_NEUTRAL_CANVAS.width * 4 + 1;
  for (let row = 0; row < EVA_TALK_NEUTRAL_CANVAS.height; row += 1) {
    assert(inflated[row * stride] <= 4, 'EVA_TALK_NEUTRAL_QUEUE_PNG_FILTER_INVALID');
  }
  return deepFreeze({
    width: ihdr.width,
    height: ihdr.height,
    bitDepth: ihdr.bitDepth,
    colourType: ihdr.colourType,
    idatChunkCount: idat.length,
    chunkCount,
    decodedScanlineBytes: inflated.length,
    rgba8StraightAlphaCompatible: true,
  });
}
