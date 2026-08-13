import { inflateSync } from "node:zlib";

import { assert, freeze } from "./provider-candidate-admission-common.mjs";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
let crcTable;

function crc32(bytes) {
  if (!crcTable) {
    crcTable = Array.from({ length: 256 }, (_, index) => {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      return value >>> 0;
    });
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
    return left;
  }
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

export function inspectAdmissionPng(bytes) {
  assert(
    Buffer.isBuffer(bytes) && bytes.subarray(0, 8).equals(PNG_SIGNATURE),
    "candidate object is not a PNG.",
  );
  let offset = 8;
  let ihdr = null;
  let sawIend = false;
  const idat = [];
  let chunkIndex = 0;
  while (offset < bytes.length) {
    assert(
      offset + 12 <= bytes.length,
      "candidate PNG contains a truncated chunk header.",
    );
    const length = bytes.readUInt32BE(offset);
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    const type = typeBytes.toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    assert(dataEnd + 4 <= bytes.length, `candidate PNG ${type} chunk is truncated.`);
    const data = bytes.subarray(dataStart, dataEnd);
    assert(
      crc32(Buffer.concat([typeBytes, data])) === bytes.readUInt32BE(dataEnd),
      `candidate PNG ${type} CRC is invalid.`,
    );
    if (chunkIndex === 0) {
      assert(type === "IHDR", "candidate PNG must begin with IHDR.");
    }
    if (type === "IHDR") {
      assert(
        ihdr === null && length === 13,
        "candidate PNG must contain one 13-byte IHDR.",
      );
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colourType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
    } else if (type === "IDAT") {
      assert(!sawIend, "candidate PNG contains IDAT after IEND.");
      idat.push(data);
    } else if (type === "IEND") {
      assert(length === 0 && !sawIend, "candidate PNG contains an invalid IEND.");
      sawIend = true;
      offset = dataEnd + 4;
      assert(
        offset === bytes.length,
        "candidate PNG contains trailing bytes after IEND.",
      );
      break;
    }
    offset = dataEnd + 4;
    chunkIndex += 1;
  }
  assert(
    ihdr && sawIend && idat.length >= 1,
    "candidate PNG is missing IHDR, IDAT or IEND.",
  );
  assert(
    ihdr.width === 160 && ihdr.height === 160,
    "candidate PNG must be exactly 160x160.",
  );
  assert(
    ihdr.bitDepth === 8 && ihdr.colourType === 6,
    "candidate PNG must be non-indexed 8-bit RGBA.",
  );
  assert(
    ihdr.compression === 0 && ihdr.filter === 0 && ihdr.interlace === 0,
    "candidate PNG must use standard compression, filtering and non-interlaced storage.",
  );

  const bytesPerPixel = 4;
  const rowBytes = ihdr.width * bytesPerPixel;
  const expectedInflated = ihdr.height * (rowBytes + 1);
  let inflated;
  try {
    inflated = inflateSync(Buffer.concat(idat), {
      maxOutputLength: expectedInflated,
    });
  } catch {
    assert(false, "candidate PNG IDAT stream could not be inflated safely.");
  }
  assert(
    inflated.byteLength === expectedInflated,
    "candidate PNG inflated byte length is invalid.",
  );
  const previous = Buffer.alloc(rowBytes);
  const current = Buffer.alloc(rowBytes);
  let transparentPixels = 0;
  let visiblePixels = 0;
  for (let y = 0; y < ihdr.height; y += 1) {
    const rowOffset = y * (rowBytes + 1);
    const filter = inflated[rowOffset];
    assert(
      filter >= 0 && filter <= 4,
      `candidate PNG row ${y} uses unsupported filter ${filter}.`,
    );
    for (let x = 0; x < rowBytes; x += 1) {
      const raw = inflated[rowOffset + 1 + x];
      const left = x >= bytesPerPixel ? current[x - bytesPerPixel] : 0;
      const above = previous[x];
      const upperLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      if (filter === 0) current[x] = raw;
      else if (filter === 1) current[x] = (raw + left) & 0xff;
      else if (filter === 2) current[x] = (raw + above) & 0xff;
      else if (filter === 3) {
        current[x] = (raw + Math.floor((left + above) / 2)) & 0xff;
      } else {
        current[x] = (raw + paeth(left, above, upperLeft)) & 0xff;
      }
    }
    for (let x = 3; x < rowBytes; x += 4) {
      if (current[x] < 255) transparentPixels += 1;
      if (current[x] > 0) visiblePixels += 1;
    }
    current.copy(previous);
  }
  assert(transparentPixels > 0, "candidate PNG does not contain transparent pixels.");
  assert(visiblePixels > 0, "candidate PNG does not contain any visible subject pixels.");
  return freeze({
    width: ihdr.width,
    height: ihdr.height,
    bitDepth: ihdr.bitDepth,
    colourType: ihdr.colourType,
    interlace: ihdr.interlace,
    transparentPixels,
    visiblePixels,
    structuralValidationOnly: true,
    deterministicQaPassed: false,
  });
}
