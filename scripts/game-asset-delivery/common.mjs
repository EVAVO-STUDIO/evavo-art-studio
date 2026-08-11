import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { deflateSync, inflateSync } from "node:zlib";

export const HASH64 = /^[0-9a-f]{64}$/u;
export const HEAD40 = /^[0-9a-f]{40}$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;

export function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export const sha256 = (value) =>
  createHash("sha256")
    .update(Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8"))
    .digest("hex");

export const hashObject = (value) => sha256(stable(value));

export function objectValue(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

export function arrayValue(value, label, { minimum = 0, maximum = 10000 } = {}) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new Error(`${label} must contain ${minimum}..${maximum} entries.`);
  }
  return value;
}

export function text(value, label, { minimum = 1, maximum = 4096, pattern } = {}) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < minimum ||
    value.length > maximum ||
    CONTROL.test(value) ||
    (pattern && !pattern.test(value))
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

export function integer(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

export function booleanValue(value, label) {
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean.`);
  return value;
}

export function exactKeys(value, expected, label) {
  const actual = Object.keys(objectValue(value, label)).sort();
  const wanted = [...expected].sort();
  if (stable(actual) !== stable(wanted)) {
    throw new Error(`${label} keys differ; expected ${wanted.join(", ")}.`);
  }
}

export function verifyFalseAuthority(value, expectedKeys, label = "authority") {
  exactKeys(value, expectedKeys, label);
  if (Object.values(value).some((entry) => entry !== false)) {
    throw new Error(`${label} must remain all false.`);
  }
  return value;
}

export function posixRelative(value, label, { allowedExtensions, deniedParts = [] } = {}) {
  const result = text(value, label, { maximum: 2048 });
  if (result.includes("\\") || path.posix.isAbsolute(result)) {
    throw new Error(`${label} must be a relative POSIX path.`);
  }
  const normalized = path.posix.normalize(result);
  if (
    normalized !== result ||
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.split("/").some((part) => part === "." || part === ".." || part === "")
  ) {
    throw new Error(`${label} must be canonical and may not escape its root.`);
  }
  const foldedParts = normalized.split("/").map((part) => part.toLowerCase());
  for (const denied of deniedParts.map((part) => part.toLowerCase())) {
    if (foldedParts.includes(denied)) throw new Error(`${label} contains denied path component ${denied}.`);
  }
  if (allowedExtensions) {
    const extension = path.posix.extname(normalized).toLowerCase();
    if (!allowedExtensions.has(extension)) throw new Error(`${label} has unsupported extension ${extension || "<none>"}.`);
  }
  return normalized;
}

export const normalizedPath = (value) =>
  process.platform === "win32"
    ? path.resolve(value).toLocaleLowerCase("en-US")
    : path.resolve(value);

export function pathInside(root, candidate) {
  const relative = path.relative(normalizedPath(root), normalizedPath(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function sameIdentity(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

export async function stableRegularFile(filePath, label, maximumBytes = 2 * 1024 * 1024 * 1024) {
  const lexical = path.resolve(filePath);
  const before = await lstat(lexical);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) {
    throw new Error(`${label} must be a one-link regular non-symlink file.`);
  }
  if (before.size < 1 || before.size > maximumBytes) {
    throw new Error(`${label} must contain 1..${maximumBytes} bytes.`);
  }
  const canonical = await realpath(lexical);
  if (normalizedPath(canonical) !== normalizedPath(lexical)) {
    throw new Error(`${label} must use its canonical path.`);
  }
  const bytes = await readFile(canonical);
  const after = await lstat(canonical);
  if (!sameIdentity(before, after) || bytes.length !== before.size) {
    throw new Error(`${label} changed while being read.`);
  }
  return Object.freeze({ path: canonical, bytes, sizeBytes: bytes.length, sha256: sha256(bytes) });
}

export async function readJson(filePath, label, maximumBytes = 64 * 1024 * 1024) {
  const file = await stableRegularFile(filePath, label, maximumBytes);
  let value;
  try {
    value = JSON.parse(file.bytes.toString("utf8").replace(/^\uFEFF/u, ""));
  } catch (error) {
    throw new Error(`${label} is invalid UTF-8 JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return Object.freeze({ ...file, value: objectValue(value, label) });
}

export function verifySelfHash(value, hashKey, { runIdKey = "runId" } = {}) {
  const stored = text(value[hashKey], hashKey, { pattern: HASH64, maximum: 64 });
  const unsigned = { ...value };
  delete unsigned[hashKey];
  if (runIdKey) delete unsigned[runIdKey];
  const actual = hashObject(unsigned);
  if (actual !== stored) throw new Error(`${hashKey} does not match canonical content.`);
  if (runIdKey && value[runIdKey] !== stored.slice(0, 20)) {
    throw new Error(`${runIdKey} does not match ${hashKey}.`);
  }
  return stored;
}

export async function writeCreateOnly(filePath, bytes, allowedRoot, mode = 0o600) {
  const destination = path.resolve(filePath);
  const root = path.resolve(allowedRoot);
  if (!pathInside(root, destination)) throw new Error(`Output escapes allowed root: ${destination}`);
  await mkdir(path.dirname(destination), { recursive: true });
  const parent = await realpath(path.dirname(destination));
  const canonicalRoot = await realpath(root);
  if (!pathInside(canonicalRoot, parent)) throw new Error(`Output parent escapes allowed root: ${destination}`);
  try {
    await access(destination, constants.F_OK);
    throw new Error(`Output already exists: ${destination}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const temporary = path.join(parent, `.${path.basename(destination)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
  try {
    const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, mode);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await link(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
  return destination;
}

export const writeJsonCreateOnly = (filePath, value, allowedRoot) =>
  writeCreateOnly(filePath, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"), allowedRoot);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let current = index;
    for (let bit = 0; bit < 8; bit += 1) current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
    table[index] = current >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let current = 0xffffffff;
  for (const byte of bytes) current = CRC_TABLE[(current ^ byte) & 0xff] ^ (current >>> 8);
  return (current ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

export function encodeRgbaPng(width, height, rgba) {
  integer(width, "PNG width", 1, 16384);
  integer(height, "PNG height", 1, 16384);
  if (!Buffer.isBuffer(rgba) || rgba.length !== width * height * 4) {
    throw new Error("RGBA byte length differs from PNG dimensions.");
  }
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export function inspectPng(bytes, label = "PNG") {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!Buffer.isBuffer(bytes) || bytes.length < 45 || !bytes.subarray(0, 8).equals(signature)) {
    throw new Error(`${label} signature differs.`);
  }
  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  const idat = [];
  let sawEnd = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error(`${label} chunk is truncated.`);
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > bytes.length) throw new Error(`${label} ${type} data is truncated.`);
    const data = bytes.subarray(start, end);
    const expected = bytes.readUInt32BE(end);
    const actual = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
    if (expected !== actual) throw new Error(`${label} ${type} CRC differs.`);
    if (type === "IHDR") {
      if (length !== 13) throw new Error(`${label} IHDR length differs.`);
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error(`${label} must not be interlaced.`);
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") {
      sawEnd = true;
      offset = end + 4;
      break;
    }
    offset = end + 4;
  }
  if (!sawEnd || offset !== bytes.length || !width || !height || idat.length < 1) {
    throw new Error(`${label} structure is incomplete or has trailing bytes.`);
  }
  if (bitDepth !== 8 || colorType !== 6) throw new Error(`${label} must be non-interlaced 8-bit RGBA.`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  if (raw.length !== height * (stride + 1)) throw new Error(`${label} inflated size differs.`);
  let transparentPixels = 0;
  let opaquePixels = 0;
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1);
    if (raw[row] !== 0) throw new Error(`${label} uses unsupported scanline filter ${raw[row]}.`);
    for (let x = 0; x < width; x += 1) {
      const alpha = raw[row + 1 + x * 4 + 3];
      if (alpha === 0) transparentPixels += 1;
      if (alpha === 255) opaquePixels += 1;
    }
  }
  return Object.freeze({ width, height, bitDepth, colorType, transparentPixels, opaquePixels, hasAlpha: transparentPixels > 0 });
}

function parseKeyValues(line) {
  const result = {};
  const pattern = /([A-Za-z0-9_]+)=("[^"]*"|[^\s]+)/gu;
  for (const match of line.matchAll(pattern)) {
    const raw = match[2];
    result[match[1]] = raw.startsWith('"') ? raw.slice(1, -1) : raw;
  }
  return result;
}

export function inspectBmFont(bytes, label = "BMFont") {
  const source = bytes.toString("utf8").replace(/^\uFEFF/u, "");
  if (source.includes("\r")) throw new Error(`${label} must use LF line endings.`);
  const lines = source.split("\n").filter(Boolean);
  const infoLine = lines.find((line) => line.startsWith("info "));
  const commonLine = lines.find((line) => line.startsWith("common "));
  const pageLines = lines.filter((line) => line.startsWith("page "));
  const charsLine = lines.find((line) => line.startsWith("chars "));
  const charLines = lines.filter((line) => line.startsWith("char "));
  if (!infoLine || !commonLine || pageLines.length !== 1 || !charsLine || charLines.length < 1) {
    throw new Error(`${label} structure is incomplete.`);
  }
  const info = parseKeyValues(infoLine);
  const common = parseKeyValues(commonLine);
  const page = parseKeyValues(pageLines[0]);
  const chars = parseKeyValues(charsLine);
  if (info.smooth !== "0" || info.aa !== "1") {
    throw new Error(`${label} must use smooth=0 and aa=1 for hard pixel rendering.`);
  }
  if (common.pages !== "1" || common.packed !== "0") {
    throw new Error(`${label} must use exactly one unpacked atlas page.`);
  }
  if (Number(chars.count) !== charLines.length) throw new Error(`${label} declared glyph count differs.`);
  const glyphs = [];
  const ids = new Set();
  for (const [index, line] of charLines.entries()) {
    const record = parseKeyValues(line);
    const id = Number(record.id);
    const width = Number(record.width);
    const height = Number(record.height);
    const x = Number(record.x);
    const y = Number(record.y);
    const advance = Number(record.xadvance);
    for (const [name, value] of Object.entries({ id, width, height, x, y, advance })) {
      if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} char[${index}].${name} is invalid.`);
    }
    if (ids.has(id)) throw new Error(`${label} duplicates codepoint ${id}.`);
    ids.add(id);
    glyphs.push(Object.freeze({ id, x, y, width, height, advance }));
  }
  return Object.freeze({
    face: info.face ?? "",
    lineHeight: Number(common.lineHeight),
    base: Number(common.base),
    scaleW: Number(common.scaleW),
    scaleH: Number(common.scaleH),
    pageFile: page.file,
    glyphs: Object.freeze(glyphs),
  });
}

export function inspectGodotTextResource(bytes, label = "Godot resource") {
  const source = bytes.toString("utf8").replace(/^\uFEFF/u, "");
  if (!source.startsWith("[gd_resource") && !source.startsWith("[resource")) {
    throw new Error(`${label} must be a text Godot resource.`);
  }
  const references = [...source.matchAll(/(?:path|resource_path)\s*=\s*"(res:\/\/[^"\r\n]+)"/gu)].map((match) => match[1]);
  if (references.some((value) => value.includes("..") || value.includes("\\"))) {
    throw new Error(`${label} contains unsafe res:// reference.`);
  }
  return Object.freeze({ references: Object.freeze([...new Set(references)].sort()) });
}
