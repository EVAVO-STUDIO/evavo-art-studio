import { deflateSync, inflateSync } from "node:zlib";

import { integer } from "./contracts.mjs";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length, 0);
  const check = Buffer.alloc(4); check.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, check]);
}

export function encodePng(width, height, rgba) {
  integer(width, "PNG width", 1, 16384); integer(height, "PNG height", 1, 16384);
  if (!Buffer.isBuffer(rgba) || rgba.length !== width * height * 4) throw new Error("PNG RGBA byte length differs from dimensions.");
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1); raw[row] = 0;
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header), pngChunk("IDAT", deflateSync(raw, { level: 9 })), pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export function decodePng(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 45) throw new Error("PNG is too small.");
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!bytes.subarray(0, 8).equals(signature)) throw new Error("PNG signature differs.");
  let offset = 8; let width; let height; const idat = []; let sawEnd = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error("PNG chunk is truncated.");
    const length = bytes.readUInt32BE(offset); const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const start = offset + 8; const end = start + length;
    if (end + 4 > bytes.length) throw new Error("PNG chunk data is truncated.");
    const data = bytes.subarray(start, end); const expected = bytes.readUInt32BE(end);
    const actual = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
    if (actual !== expected) throw new Error(`PNG ${type} CRC differs.`);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error("PNG must be non-interlaced 8-bit RGBA.");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") { sawEnd = true; offset = end + 4; break; }
    offset = end + 4;
  }
  if (!sawEnd || offset !== bytes.length || !width || !height || idat.length < 1) throw new Error("PNG structure is incomplete or contains trailing bytes.");
  const raw = inflateSync(Buffer.concat(idat)); const stride = width * 4;
  if (raw.length !== height * (stride + 1)) throw new Error("PNG inflated byte length differs.");
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const source = y * (stride + 1);
    if (raw[source] !== 0) throw new Error("PNG uses a non-zero scanline filter.");
    raw.copy(rgba, y * stride, source + 1, source + 1 + stride);
  }
  return { width, height, rgba };
}

export function nextPowerOfTwo(value) { let result = 1; while (result < value) result *= 2; return result; }
