import fs from "node:fs";
import path from "node:path";
import { inside, safeRelative } from "./runtime-common.mjs";

function tarText(block, offset, length) {
  return block.subarray(offset, offset + length).toString("utf8").replace(/\0.*$/su, "").trim();
}

function tarOctal(block, offset, length) {
  const value = tarText(block, offset, length).replace(/^0+/u, "") || "0";
  if (!/^[0-7]+$/u.test(value)) throw new Error("Runtime tar contains an invalid numeric field.");
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Runtime tar numeric field exceeds the safe integer range.");
  return parsed;
}

function tarChecksum(header) {
  let sum = 0;
  for (let index = 0; index < header.length; index += 1) sum += index >= 148 && index < 156 ? 32 : header[index];
  return sum;
}

export function extractTar(bytes, root) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1024 || bytes.length % 512 !== 0) {
    throw new Error("Runtime tar must contain complete 512-byte records.");
  }
  let offset = 0;
  let entryCount = 0;
  let fileCount = 0;
  let totalFileBytes = 0;
  const installed = new Set();
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) {
      const second = bytes.subarray(offset + 512, offset + 1024);
      if (second.length !== 512 || !second.every((value) => value === 0)) throw new Error("Runtime tar terminal record is incomplete.");
      if (!bytes.subarray(offset + 1024).every((value) => value === 0)) throw new Error("Runtime tar contains data after its terminal records.");
      return Object.freeze({ entryCount, fileCount, totalFileBytes });
    }
    const magic = header.subarray(257, 263).toString("latin1");
    if (magic !== "ustar\0" && magic !== "ustar ") throw new Error("Runtime tar entry is not canonical USTAR.");
    if (tarChecksum(header) !== tarOctal(header, 148, 8)) throw new Error("Runtime tar header checksum verification failed.");
    const name = tarText(header, 0, 100);
    const prefix = tarText(header, 345, 155);
    const type = String.fromCharCode(header[156] || 48);
    const rawRelative = prefix ? `${prefix}/${name}` : name;
    const pathForValidation = type === "5" && rawRelative.endsWith("/") ? rawRelative.slice(0, -1) : rawRelative;
    if (type !== "5" && rawRelative.endsWith("/")) throw new Error("Runtime tar regular file has a directory-form path.");
    const relative = safeRelative(pathForValidation, "runtime tar path");
    if (installed.has(relative)) throw new Error(`Runtime tar repeats ${relative}.`);
    installed.add(relative);
    const size = tarOctal(header, 124, 12);
    if (tarText(header, 157, 100)) throw new Error(`Runtime tar entry ${relative} has a prohibited link target.`);
    const target = path.resolve(root, ...relative.split("/"));
    if (!inside(path.resolve(root), target)) throw new Error("Runtime tar escaped its extraction root.");
    if (type === "5") {
      if (size !== 0) throw new Error("Runtime tar directory has a nonzero size.");
      fs.mkdirSync(target, { recursive: true, mode: 0o700 });
    } else if (type === "0" || type === "\0") {
      const payloadStart = offset + 512;
      const payloadEnd = payloadStart + size;
      if (payloadEnd > bytes.length) throw new Error("Runtime tar is truncated.");
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      fs.writeFileSync(target, bytes.subarray(payloadStart, payloadEnd), { flag: "wx", mode: 0o600 });
      fileCount += 1;
      totalFileBytes += size;
    } else {
      throw new Error(`Runtime tar contains prohibited entry type ${JSON.stringify(type)}.`);
    }
    entryCount += 1;
    offset += 512 + Math.ceil(size / 512) * 512;
    if (offset > bytes.length) throw new Error("Runtime tar entry exceeds the archive.");
  }
  throw new Error("Runtime tar has no terminal record.");
}
