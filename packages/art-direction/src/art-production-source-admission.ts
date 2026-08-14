import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

import {
  fail,
  freeze,
  sha256,
} from "./layered-production-internal.js";
import type { CompiledLayeredProductionPlan } from "./layered-production-types.js";
import {
  ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION,
  ART_PRODUCTION_SOURCE_ADMISSION_RECEIPT_KIND,
} from "./art-production-contract.js";
import type { ArtProductionHumanApprovalReceipt } from "./art-production-human-approval-types.js";
import type { ArtProductionLoop } from "./art-production-loop-types.js";
import type { ArtProductionPackagingPlan } from "./art-production-packaging-types.js";
import type {
  ArtProductionRuntimeAssemblyHandoff,
  ArtProductionRuntimeAssemblySourceBinding,
} from "./art-production-runtime-assembly-types.js";
import type {
  ArtProductionPngEvidence,
  ArtProductionSourceAdmission,
  ArtProductionSourceAdmissionReceipt,
  ArtProductionSourceArtifactInput,
} from "./art-production-source-admission-types.js";
import { verifyArtProductionRuntimeAssemblyHandoff } from "./art-production-runtime-assembly.js";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const ARTIFACT_ID_PATTERN = /^artifact_[0-9a-f]{64}$/u;
const ID_PATTERN = /^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$/u;
const PNG_CHUNK_TYPE_PATTERN = /^[A-Za-z]{4}$/u;
const APNG_CHUNKS = new Set(["acTL", "fcTL", "fdAT"]);
const MAXIMUM_SOURCE_BYTES = 256 * 1024 * 1024;
const MAXIMUM_DECODED_BYTES = 512 * 1024 * 1024;

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function invalid(message: string, details?: unknown): never {
  fail("ART_PRODUCTION_SOURCE_ADMISSION_INVALID", message, details);
}

function gated(message: string): never {
  fail("ART_PRODUCTION_SOURCE_ADMISSION_GATED", message);
}

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid(`${label} must be a plain object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    invalid(`${label} must use a plain object prototype.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (descriptor.get || descriptor.set) {
      invalid(`${label}.${key} must be a data property.`);
    }
  }
  return value as Record<string, unknown>;
}

function exactFields(
  value: Record<string, unknown>,
  label: string,
  expected: readonly string[],
): void {
  const expectedSet = new Set(expected);
  const unknown = Object.keys(value).filter((key) => !expectedSet.has(key));
  const missing = expected.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length > 0 || missing.length > 0) {
    invalid(`${label} fields are incomplete or unsupported.`, {
      ...(missing.length > 0 ? { missing } : {}),
      ...(unknown.length > 0 ? { unknown } : {}),
    });
  }
}

function stringValue(value: unknown, label: string, maximum = 1000): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim() !== value
  ) {
    invalid(`${label} must be a non-empty canonical string.`);
  }
  return value;
}

function idValue(value: unknown, label: string): string {
  const output = stringValue(value, label, 160);
  if (!ID_PATTERN.test(output) || output.includes("..")) {
    invalid(`${label} must be a canonical lowercase identifier.`);
  }
  return output;
}

function sha256Value(value: unknown, label: string): string {
  const output = stringValue(value, label, 64);
  if (!SHA256_PATTERN.test(output)) {
    invalid(`${label} must be lowercase SHA-256.`);
  }
  return output;
}

function artifactIdValue(
  value: unknown,
  label: string,
  expectedSha256: string,
): string {
  const output = stringValue(value, label, 73);
  if (
    !ARTIFACT_ID_PATTERN.test(output) ||
    output !== `artifact_${expectedSha256}`
  ) {
    invalid(`${label} must identify the exact declared SHA-256.`);
  }
  return output;
}

function integerValue(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    invalid(`${label} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function byteSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function crc32(typeBytes: Uint8Array, data: Uint8Array): number {
  let value = 0xffffffff;
  for (const source of [typeBytes, data]) {
    for (const byte of source) {
      value = CRC32_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function paethPredictor(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

function decodeRgbaScanlines(
  compressed: Uint8Array,
  width: number,
  height: number,
): Buffer {
  const stride = width * 4;
  const expectedInflatedBytes = height * (stride + 1);
  const decodedBytes = width * height * 4;
  if (
    !Number.isSafeInteger(expectedInflatedBytes) ||
    !Number.isSafeInteger(decodedBytes) ||
    expectedInflatedBytes > MAXIMUM_DECODED_BYTES ||
    decodedBytes > MAXIMUM_DECODED_BYTES
  ) {
    invalid("PNG decoded dimensions exceed the bounded source-admission limit.");
  }

  let inflated: Buffer;
  try {
    inflated = inflateSync(compressed, {
      maxOutputLength: expectedInflatedBytes,
    });
  } catch (error: unknown) {
    invalid("PNG IDAT data could not be decoded as one bounded zlib stream.", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (inflated.length !== expectedInflatedBytes) {
    invalid("PNG decoded scanline length does not match its IHDR dimensions.", {
      expectedInflatedBytes,
      observedInflatedBytes: inflated.length,
    });
  }

  const rgba = Buffer.allocUnsafe(decodedBytes);
  let inputOffset = 0;
  let outputOffset = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = inflated[inputOffset++];
    if (filter === undefined || filter > 4) {
      invalid(`PNG scanline ${row} uses unsupported filter ${String(filter)}.`);
    }
    for (let columnByte = 0; columnByte < stride; columnByte += 1) {
      const raw = inflated[inputOffset++];
      if (raw === undefined) {
        invalid(`PNG scanline ${row} ended before its declared width.`);
      }
      const left = columnByte >= 4 ? rgba[outputOffset + columnByte - 4]! : 0;
      const up = row > 0 ? rgba[outputOffset - stride + columnByte]! : 0;
      const upLeft =
        row > 0 && columnByte >= 4
          ? rgba[outputOffset - stride + columnByte - 4]!
          : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = raw;
          break;
        case 1:
          value = raw + left;
          break;
        case 2:
          value = raw + up;
          break;
        case 3:
          value = raw + Math.floor((left + up) / 2);
          break;
        case 4:
          value = raw + paethPredictor(left, up, upLeft);
          break;
        default:
          invalid(`PNG scanline ${row} uses an impossible filter state.`);
      }
      rgba[outputOffset + columnByte] = value & 0xff;
    }
    outputOffset += stride;
  }
  return rgba;
}

function inspectPng(
  binding: ArtProductionRuntimeAssemblySourceBinding,
  sourceBytes: Uint8Array,
): ArtProductionPngEvidence {
  if (sourceBytes.byteLength !== binding.sourceBytes) {
    invalid(`Source ${binding.unitId} byte count does not match its handoff.`, {
      expectedBytes: binding.sourceBytes,
      observedBytes: sourceBytes.byteLength,
    });
  }
  const observedSha256 = byteSha256(sourceBytes);
  if (
    observedSha256 !== binding.sourceSha256 ||
    binding.sourceArtifactId !== `artifact_${observedSha256}`
  ) {
    invalid(`Source ${binding.unitId} bytes do not match its content address.`, {
      expectedSha256: binding.sourceSha256,
      observedSha256,
    });
  }

  const bytes = Buffer.from(
    sourceBytes.buffer,
    sourceBytes.byteOffset,
    sourceBytes.byteLength,
  );
  if (
    bytes.length < PNG_SIGNATURE.length + 12 ||
    !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    invalid(`Source ${binding.unitId} is not a PNG with the exact signature.`);
  }

  let offset = PNG_SIGNATURE.length;
  let chunkCount = 0;
  let idatChunkCount = 0;
  let compressedBytes = 0;
  let width = 0;
  let height = 0;
  let bitDepth = -1;
  let colorType = -1;
  let compressionMethod = -1;
  let filterMethod = -1;
  let interlaceMethod = -1;
  let sawIhdr = false;
  let sawIdat = false;
  let sawIend = false;
  let closedIdatSequence = false;
  const idatChunks: Buffer[] = [];

  while (offset < bytes.length) {
    if (sawIend) {
      invalid(`Source ${binding.unitId} contains data after IEND.`);
    }
    if (offset + 12 > bytes.length) {
      invalid(`Source ${binding.unitId} has truncated PNG chunk framing.`);
    }
    const length = bytes.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = typeStart + 4;
    const dataEnd = dataStart + length;
    const crcOffset = dataEnd;
    const nextOffset = crcOffset + 4;
    if (
      !Number.isSafeInteger(dataEnd) ||
      dataEnd < dataStart ||
      nextOffset > bytes.length
    ) {
      invalid(`Source ${binding.unitId} has an out-of-bounds PNG chunk.`);
    }
    const typeBytes = bytes.subarray(typeStart, dataStart);
    const type = typeBytes.toString("ascii");
    if (!PNG_CHUNK_TYPE_PATTERN.test(type)) {
      invalid(`Source ${binding.unitId} has invalid PNG chunk type ${type}.`);
    }
    const data = bytes.subarray(dataStart, dataEnd);
    const expectedCrc = bytes.readUInt32BE(crcOffset);
    const observedCrc = crc32(typeBytes, data);
    if (expectedCrc !== observedCrc) {
      invalid(`Source ${binding.unitId} PNG chunk ${type} has an invalid CRC.`, {
        expectedCrc,
        observedCrc,
      });
    }

    chunkCount += 1;
    if (chunkCount === 1 && type !== "IHDR") {
      invalid(`Source ${binding.unitId} PNG must begin with IHDR.`);
    }
    if (APNG_CHUNKS.has(type)) {
      invalid(`Source ${binding.unitId} must be a static PNG, not APNG.`);
    }
    const isCritical = type.charCodeAt(0) >= 65 && type.charCodeAt(0) <= 90;
    if (isCritical && !["IHDR", "IDAT", "IEND"].includes(type)) {
      invalid(`Source ${binding.unitId} uses unsupported critical PNG chunk ${type}.`);
    }

    if (type === "IHDR") {
      if (sawIhdr || chunkCount !== 1 || length !== 13) {
        invalid(`Source ${binding.unitId} must contain one 13-byte leading IHDR.`);
      }
      sawIhdr = true;
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
      compressionMethod = data[10]!;
      filterMethod = data[11]!;
      interlaceMethod = data[12]!;
      if (width !== binding.width || height !== binding.height) {
        invalid(`Source ${binding.unitId} PNG dimensions do not match its handoff.`, {
          expectedWidth: binding.width,
          expectedHeight: binding.height,
          observedWidth: width,
          observedHeight: height,
        });
      }
      if (
        bitDepth !== 8 ||
        colorType !== 6 ||
        compressionMethod !== 0 ||
        filterMethod !== 0 ||
        interlaceMethod !== 0
      ) {
        invalid(
          `Source ${binding.unitId} must use eight-bit non-interlaced RGBA PNG encoding.`,
          {
            bitDepth,
            colorType,
            compressionMethod,
            filterMethod,
            interlaceMethod,
          },
        );
      }
    } else if (type === "IDAT") {
      if (!sawIhdr || sawIend || closedIdatSequence) {
        invalid(`Source ${binding.unitId} has invalid or non-contiguous IDAT order.`);
      }
      sawIdat = true;
      idatChunkCount += 1;
      compressedBytes += data.length;
      if (
        !Number.isSafeInteger(compressedBytes) ||
        compressedBytes > MAXIMUM_SOURCE_BYTES
      ) {
        invalid(`Source ${binding.unitId} PNG compressed data exceeds its limit.`);
      }
      idatChunks.push(Buffer.from(data));
    } else {
      if (sawIdat && type !== "IEND") closedIdatSequence = true;
      if (type === "IEND") {
        if (!sawIhdr || !sawIdat || sawIend || length !== 0) {
          invalid(`Source ${binding.unitId} has invalid IEND framing.`);
        }
        sawIend = true;
        if (nextOffset !== bytes.length) {
          invalid(`Source ${binding.unitId} contains trailing bytes after IEND.`);
        }
      }
    }
    offset = nextOffset;
  }

  if (!sawIhdr || !sawIdat || !sawIend || offset !== bytes.length) {
    invalid(`Source ${binding.unitId} PNG is incomplete.`);
  }

  const rgba = decodeRgbaScanlines(
    Buffer.concat(idatChunks, compressedBytes),
    width,
    height,
  );
  let opaquePixels = 0;
  let translucentPixels = 0;
  let transparentPixels = 0;
  let visiblePixels = 0;
  let unsafeTransparentPixels = 0;
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const red = rgba[offset]!;
    const green = rgba[offset + 1]!;
    const blue = rgba[offset + 2]!;
    const alpha = rgba[offset + 3]!;
    if (alpha === 255) opaquePixels += 1;
    else if (alpha === 0) transparentPixels += 1;
    else translucentPixels += 1;
    if (alpha > 0) visiblePixels += 1;
    if (alpha === 0 && (red !== 0 || green !== 0 || blue !== 0)) {
      unsafeTransparentPixels += 1;
    }
  }

  if (visiblePixels === 0) {
    invalid(`Source ${binding.unitId} PNG has no visible pixels.`);
  }
  if (unsafeTransparentPixels > 0) {
    invalid(`Source ${binding.unitId} PNG contains unsafe transparent RGB.`, {
      unsafeTransparentPixels,
    });
  }
  if (
    binding.alpha === "opaque" &&
    (translucentPixels !== 0 || transparentPixels !== 0)
  ) {
    invalid(`Source ${binding.unitId} must be fully opaque.`);
  }
  if (
    binding.alpha === "transparent" &&
    (transparentPixels === 0 || translucentPixels !== 0)
  ) {
    invalid(
      `Source ${binding.unitId} transparent policy requires binary alpha with a transparent background.`,
    );
  }
  if (
    binding.alpha === "mixed" &&
    translucentPixels === 0 &&
    transparentPixels === 0
  ) {
    invalid(`Source ${binding.unitId} mixed alpha policy requires non-opaque pixels.`);
  }

  return freeze({
    format: "png" as const,
    bitDepth: 8 as const,
    colorType: 6 as const,
    compressionMethod: 0 as const,
    filterMethod: 0 as const,
    interlaceMethod: 0 as const,
    chunkCount,
    idatChunkCount,
    compressedBytes,
    decodedBytes: rgba.length,
    decodedRgbaSha256: byteSha256(rgba),
    opaquePixels,
    translucentPixels,
    transparentPixels,
    visiblePixels,
    unsafeTransparentPixels: 0 as const,
  });
}

function normalizeSourceArtifacts(
  handoff: ArtProductionRuntimeAssemblyHandoff,
  input: unknown,
): ReadonlyMap<string, Uint8Array> {
  if (!Array.isArray(input) || input.length !== handoff.sourceBindings.length) {
    gated(
      "Source admission requires exactly one caller-supplied PNG byte payload for every runtime assembly source binding.",
    );
  }
  const expectedUnits = new Set(
    handoff.sourceBindings.map((binding) => binding.unitId),
  );
  const output = new Map<string, Uint8Array>();
  for (const [index, value] of input.entries()) {
    const label = `sources[${index}]`;
    const entry = plainRecord(value, label);
    exactFields(entry, label, ["unitId", "bytes"]);
    const unitId = idValue(entry.unitId, `${label}.unitId`);
    if (!expectedUnits.has(unitId)) {
      invalid(`${label}.unitId is not present in the exact runtime handoff.`);
    }
    if (output.has(unitId)) {
      invalid(`Source admission duplicates unit ${unitId}.`);
    }
    if (!(entry.bytes instanceof Uint8Array)) {
      invalid(`${label}.bytes must be a Uint8Array.`);
    }
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(entry.bytes);
    } catch (error: unknown) {
      invalid(`${label}.bytes could not be captured immutably.`, {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
    if (bytes.byteLength < PNG_SIGNATURE.length + 12) {
      invalid(`${label}.bytes is too short to contain a PNG.`);
    }
    if (bytes.byteLength > MAXIMUM_SOURCE_BYTES) {
      invalid(`${label}.bytes exceeds the bounded source size.`);
    }
    output.set(unitId, bytes);
  }
  for (const unitId of expectedUnits) {
    if (!output.has(unitId)) {
      gated(`Source admission is missing exact source unit ${unitId}.`);
    }
  }
  return output;
}

function sourceAdmissionAuthority() {
  return freeze({
    callerSuppliedByteRead: true as const,
    autonomousArtifactFetch: false as const,
    artifactWrite: false as const,
    providerExecution: false as const,
    imageMutation: false as const,
    creativeDecision: false as const,
    packagingExecution: false as const,
    automaticAssembly: false as const,
    targetRepositoryMutation: false as const,
    runtimeActivation: false as const,
    gitCommit: false as const,
    gitPush: false as const,
    deployment: false as const,
    publication: false as const,
    forcePush: false as const,
  });
}

function compileAdmission(
  binding: ArtProductionRuntimeAssemblySourceBinding,
  bytes: Uint8Array,
): ArtProductionSourceAdmission {
  const partial = {
    unitId: binding.unitId,
    layerId: binding.layerId,
    layerRole: binding.layerRole,
    sourceArtifactId: binding.sourceArtifactId,
    sourceSha256: binding.sourceSha256,
    sourceBytes: binding.sourceBytes,
    width: binding.width,
    height: binding.height,
    alpha: binding.alpha,
    targetPath: binding.targetPath,
    technicalReviewAttemptSha256: binding.technicalReviewAttemptSha256,
    approvalRequestSha256: binding.approvalRequestSha256,
    approvalBasisSha256: binding.approvalBasisSha256,
    approvalReceiptArtifactId: binding.approvalReceiptArtifactId,
    approvalReceiptSha256: binding.approvalReceiptSha256,
    png: inspectPng(binding, bytes),
  };
  return freeze({
    ...partial,
    admissionSha256: sha256(partial),
  });
}

function validatePngEvidence(
  input: unknown,
  label: string,
): ArtProductionPngEvidence {
  const value = plainRecord(input, label);
  exactFields(value, label, [
    "format",
    "bitDepth",
    "colorType",
    "compressionMethod",
    "filterMethod",
    "interlaceMethod",
    "chunkCount",
    "idatChunkCount",
    "compressedBytes",
    "decodedBytes",
    "decodedRgbaSha256",
    "opaquePixels",
    "translucentPixels",
    "transparentPixels",
    "visiblePixels",
    "unsafeTransparentPixels",
  ]);
  if (
    value.format !== "png" ||
    value.bitDepth !== 8 ||
    value.colorType !== 6 ||
    value.compressionMethod !== 0 ||
    value.filterMethod !== 0 ||
    value.interlaceMethod !== 0 ||
    value.unsafeTransparentPixels !== 0
  ) {
    invalid(`${label} PNG protocol identity is invalid.`);
  }
  return freeze({
    format: "png" as const,
    bitDepth: 8 as const,
    colorType: 6 as const,
    compressionMethod: 0 as const,
    filterMethod: 0 as const,
    interlaceMethod: 0 as const,
    chunkCount: integerValue(value.chunkCount, `${label}.chunkCount`, 3, 100000),
    idatChunkCount: integerValue(
      value.idatChunkCount,
      `${label}.idatChunkCount`,
      1,
      100000,
    ),
    compressedBytes: integerValue(
      value.compressedBytes,
      `${label}.compressedBytes`,
      1,
      MAXIMUM_SOURCE_BYTES,
    ),
    decodedBytes: integerValue(
      value.decodedBytes,
      `${label}.decodedBytes`,
      4,
      MAXIMUM_DECODED_BYTES,
    ),
    decodedRgbaSha256: sha256Value(
      value.decodedRgbaSha256,
      `${label}.decodedRgbaSha256`,
    ),
    opaquePixels: integerValue(
      value.opaquePixels,
      `${label}.opaquePixels`,
      0,
      MAXIMUM_DECODED_BYTES / 4,
    ),
    translucentPixels: integerValue(
      value.translucentPixels,
      `${label}.translucentPixels`,
      0,
      MAXIMUM_DECODED_BYTES / 4,
    ),
    transparentPixels: integerValue(
      value.transparentPixels,
      `${label}.transparentPixels`,
      0,
      MAXIMUM_DECODED_BYTES / 4,
    ),
    visiblePixels: integerValue(
      value.visiblePixels,
      `${label}.visiblePixels`,
      1,
      MAXIMUM_DECODED_BYTES / 4,
    ),
    unsafeTransparentPixels: 0 as const,
  });
}

function validateAdmission(
  input: unknown,
  index: number,
): ArtProductionSourceAdmission {
  const label = `sourceAdmissionReceipt.admissions[${index}]`;
  const value = plainRecord(input, label);
  exactFields(value, label, [
    "unitId",
    "layerId",
    "layerRole",
    "sourceArtifactId",
    "sourceSha256",
    "sourceBytes",
    "width",
    "height",
    "alpha",
    "targetPath",
    "technicalReviewAttemptSha256",
    "approvalRequestSha256",
    "approvalBasisSha256",
    "approvalReceiptArtifactId",
    "approvalReceiptSha256",
    "png",
    "admissionSha256",
  ]);
  const sourceSha256 = sha256Value(value.sourceSha256, `${label}.sourceSha256`);
  const approvalReceiptSha256 = sha256Value(
    value.approvalReceiptSha256,
    `${label}.approvalReceiptSha256`,
  );
  const alpha = stringValue(value.alpha, `${label}.alpha`, 20);
  if (!new Set(["opaque", "transparent", "mixed"]).has(alpha)) {
    invalid(`${label}.alpha is unsupported.`);
  }
  const normalized = freeze({
    unitId: idValue(value.unitId, `${label}.unitId`),
    layerId: idValue(value.layerId, `${label}.layerId`),
    layerRole: stringValue(value.layerRole, `${label}.layerRole`, 80) as ArtProductionSourceAdmission["layerRole"],
    sourceArtifactId: artifactIdValue(
      value.sourceArtifactId,
      `${label}.sourceArtifactId`,
      sourceSha256,
    ),
    sourceSha256,
    sourceBytes: integerValue(
      value.sourceBytes,
      `${label}.sourceBytes`,
      1,
      MAXIMUM_SOURCE_BYTES,
    ),
    width: integerValue(value.width, `${label}.width`, 1, 8192),
    height: integerValue(value.height, `${label}.height`, 1, 8192),
    alpha: alpha as ArtProductionSourceAdmission["alpha"],
    targetPath: stringValue(value.targetPath, `${label}.targetPath`, 1000),
    technicalReviewAttemptSha256: sha256Value(
      value.technicalReviewAttemptSha256,
      `${label}.technicalReviewAttemptSha256`,
    ),
    approvalRequestSha256: sha256Value(
      value.approvalRequestSha256,
      `${label}.approvalRequestSha256`,
    ),
    approvalBasisSha256: sha256Value(
      value.approvalBasisSha256,
      `${label}.approvalBasisSha256`,
    ),
    approvalReceiptArtifactId: artifactIdValue(
      value.approvalReceiptArtifactId,
      `${label}.approvalReceiptArtifactId`,
      approvalReceiptSha256,
    ),
    approvalReceiptSha256,
    png: validatePngEvidence(value.png, `${label}.png`),
    admissionSha256: sha256Value(
      value.admissionSha256,
      `${label}.admissionSha256`,
    ),
  });
  const { admissionSha256, ...payload } = normalized;
  if (sha256(payload) !== admissionSha256) {
    invalid(`${label}.admissionSha256 does not match its submitted payload.`);
  }
  const pixels = normalized.width * normalized.height;
  if (
    normalized.png.decodedBytes !== pixels * 4 ||
    normalized.png.opaquePixels +
      normalized.png.translucentPixels +
      normalized.png.transparentPixels !==
      pixels ||
    normalized.png.visiblePixels !==
      normalized.png.opaquePixels + normalized.png.translucentPixels
  ) {
    invalid(`${label}.png pixel totals do not match its dimensions.`);
  }
  return normalized;
}

function validateSubmittedReceipt(input: unknown): ArtProductionSourceAdmissionReceipt {
  const receipt = plainRecord(input, "sourceAdmissionReceipt");
  exactFields(receipt, "sourceAdmissionReceipt", [
    "schemaVersion",
    "kind",
    "protocolVersion",
    "handoff",
    "admissions",
    "totals",
    "authority",
    "receiptSha256",
  ]);
  if (
    receipt.schemaVersion !== "1.0" ||
    receipt.kind !== ART_PRODUCTION_SOURCE_ADMISSION_RECEIPT_KIND ||
    receipt.protocolVersion !== ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION
  ) {
    invalid("Source admission receipt protocol identity is invalid.");
  }

  const handoff = plainRecord(receipt.handoff, "sourceAdmissionReceipt.handoff");
  exactFields(handoff, "sourceAdmissionReceipt.handoff", [
    "planId",
    "planSha256",
    "loopSha256",
    "profileSha256",
    "packagingSha256",
    "assemblyId",
    "assemblyRequestSha256",
    "assemblyManifestSha256",
    "handoffSha256",
  ]);
  const normalizedHandoff = freeze({
    planId: idValue(handoff.planId, "sourceAdmissionReceipt.handoff.planId"),
    planSha256: sha256Value(
      handoff.planSha256,
      "sourceAdmissionReceipt.handoff.planSha256",
    ),
    loopSha256: sha256Value(
      handoff.loopSha256,
      "sourceAdmissionReceipt.handoff.loopSha256",
    ),
    profileSha256: sha256Value(
      handoff.profileSha256,
      "sourceAdmissionReceipt.handoff.profileSha256",
    ),
    packagingSha256: sha256Value(
      handoff.packagingSha256,
      "sourceAdmissionReceipt.handoff.packagingSha256",
    ),
    assemblyId: idValue(
      handoff.assemblyId,
      "sourceAdmissionReceipt.handoff.assemblyId",
    ),
    assemblyRequestSha256: sha256Value(
      handoff.assemblyRequestSha256,
      "sourceAdmissionReceipt.handoff.assemblyRequestSha256",
    ),
    assemblyManifestSha256: sha256Value(
      handoff.assemblyManifestSha256,
      "sourceAdmissionReceipt.handoff.assemblyManifestSha256",
    ),
    handoffSha256: sha256Value(
      handoff.handoffSha256,
      "sourceAdmissionReceipt.handoff.handoffSha256",
    ),
  });

  if (!Array.isArray(receipt.admissions) || receipt.admissions.length === 0) {
    invalid("Source admission receipt must contain at least one admission.");
  }
  const admissions = freeze(
    receipt.admissions.map((entry, index) => validateAdmission(entry, index)),
  );
  if (new Set(admissions.map((entry) => entry.unitId)).size !== admissions.length) {
    invalid("Source admission receipt contains duplicate source units.");
  }

  const totals = plainRecord(receipt.totals, "sourceAdmissionReceipt.totals");
  exactFields(totals, "sourceAdmissionReceipt.totals", [
    "sources",
    "sourceBytes",
    "decodedBytes",
    "visiblePixels",
    "opaquePixels",
    "translucentPixels",
    "transparentPixels",
    "unsafeTransparentPixels",
  ]);
  if (totals.unsafeTransparentPixels !== 0) {
    invalid("Source admission receipt cannot retain unsafe transparent pixels.");
  }
  const normalizedTotals = freeze({
    sources: integerValue(totals.sources, "sourceAdmissionReceipt.totals.sources", 1, 100000),
    sourceBytes: integerValue(
      totals.sourceBytes,
      "sourceAdmissionReceipt.totals.sourceBytes",
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    decodedBytes: integerValue(
      totals.decodedBytes,
      "sourceAdmissionReceipt.totals.decodedBytes",
      4,
      Number.MAX_SAFE_INTEGER,
    ),
    visiblePixels: integerValue(
      totals.visiblePixels,
      "sourceAdmissionReceipt.totals.visiblePixels",
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    opaquePixels: integerValue(
      totals.opaquePixels,
      "sourceAdmissionReceipt.totals.opaquePixels",
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    translucentPixels: integerValue(
      totals.translucentPixels,
      "sourceAdmissionReceipt.totals.translucentPixels",
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    transparentPixels: integerValue(
      totals.transparentPixels,
      "sourceAdmissionReceipt.totals.transparentPixels",
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    unsafeTransparentPixels: 0 as const,
  });

  const authority = plainRecord(
    receipt.authority,
    "sourceAdmissionReceipt.authority",
  );
  const expectedAuthority = sourceAdmissionAuthority();
  exactFields(
    authority,
    "sourceAdmissionReceipt.authority",
    Object.keys(expectedAuthority),
  );
  for (const [key, expected] of Object.entries(expectedAuthority)) {
    if (authority[key] !== expected) {
      invalid("Source admission receipt authority is invalid or escalated.", {
        key,
        expected,
        observed: authority[key],
      });
    }
  }

  const calculatedTotals = {
    sources: admissions.length,
    sourceBytes: admissions.reduce((sum, entry) => sum + entry.sourceBytes, 0),
    decodedBytes: admissions.reduce((sum, entry) => sum + entry.png.decodedBytes, 0),
    visiblePixels: admissions.reduce((sum, entry) => sum + entry.png.visiblePixels, 0),
    opaquePixels: admissions.reduce((sum, entry) => sum + entry.png.opaquePixels, 0),
    translucentPixels: admissions.reduce(
      (sum, entry) => sum + entry.png.translucentPixels,
      0,
    ),
    transparentPixels: admissions.reduce(
      (sum, entry) => sum + entry.png.transparentPixels,
      0,
    ),
    unsafeTransparentPixels: 0,
  };
  if (sha256(calculatedTotals) !== sha256(normalizedTotals)) {
    invalid("Source admission receipt totals do not match its admissions.");
  }

  const normalized = freeze({
    schemaVersion: "1.0" as const,
    kind: ART_PRODUCTION_SOURCE_ADMISSION_RECEIPT_KIND,
    protocolVersion: ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION,
    handoff: normalizedHandoff,
    admissions,
    totals: normalizedTotals,
    authority: expectedAuthority,
    receiptSha256: sha256Value(
      receipt.receiptSha256,
      "sourceAdmissionReceipt.receiptSha256",
    ),
  });
  const { receiptSha256, ...payload } = normalized;
  const calculatedReceiptSha256 = sha256(payload);
  if (calculatedReceiptSha256 !== receiptSha256) {
    invalid("Source admission receipt SHA-256 does not match its submitted payload.", {
      calculatedReceiptSha256,
      submittedReceiptSha256: receiptSha256,
    });
  }
  return normalized;
}

export function compileArtProductionSourceAdmissionReceipt(
  plan: CompiledLayeredProductionPlan,
  loop: ArtProductionLoop,
  approvalsInput: readonly ArtProductionHumanApprovalReceipt[] | unknown,
  packagingPlan: ArtProductionPackagingPlan,
  assemblyRequest: unknown,
  handoffInput: unknown,
  sourcesInput: readonly ArtProductionSourceArtifactInput[] | unknown,
): ArtProductionSourceAdmissionReceipt {
  verifyArtProductionRuntimeAssemblyHandoff(
    plan,
    loop,
    approvalsInput,
    packagingPlan,
    assemblyRequest,
    handoffInput,
  );
  const handoff = handoffInput as ArtProductionRuntimeAssemblyHandoff;
  const sourceBytesByUnit = normalizeSourceArtifacts(handoff, sourcesInput);
  const admissions = freeze(
    handoff.sourceBindings.map((binding) => {
      const bytes = sourceBytesByUnit.get(binding.unitId);
      if (!bytes) {
        gated(`Source admission is missing exact source unit ${binding.unitId}.`);
      }
      return compileAdmission(binding, bytes);
    }),
  );
  const partial = {
    schemaVersion: "1.0" as const,
    kind: ART_PRODUCTION_SOURCE_ADMISSION_RECEIPT_KIND,
    protocolVersion: ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION,
    handoff: freeze({
      planId: handoff.plan.planId,
      planSha256: handoff.plan.planSha256,
      loopSha256: handoff.loop.loopSha256,
      profileSha256: handoff.loop.profileSha256,
      packagingSha256: handoff.packaging.packagingSha256,
      assemblyId: handoff.assembly.assemblyId,
      assemblyRequestSha256: handoff.assembly.requestSha256,
      assemblyManifestSha256: handoff.assembly.manifestSha256,
      handoffSha256: handoff.handoffSha256,
    }),
    admissions,
    totals: freeze({
      sources: admissions.length,
      sourceBytes: admissions.reduce((sum, entry) => sum + entry.sourceBytes, 0),
      decodedBytes: admissions.reduce((sum, entry) => sum + entry.png.decodedBytes, 0),
      visiblePixels: admissions.reduce((sum, entry) => sum + entry.png.visiblePixels, 0),
      opaquePixels: admissions.reduce((sum, entry) => sum + entry.png.opaquePixels, 0),
      translucentPixels: admissions.reduce(
        (sum, entry) => sum + entry.png.translucentPixels,
        0,
      ),
      transparentPixels: admissions.reduce(
        (sum, entry) => sum + entry.png.transparentPixels,
        0,
      ),
      unsafeTransparentPixels: 0 as const,
    }),
    authority: sourceAdmissionAuthority(),
  };
  return freeze({
    ...partial,
    receiptSha256: sha256(partial),
  });
}

export function verifyArtProductionSourceAdmissionReceipt(
  plan: CompiledLayeredProductionPlan,
  loop: ArtProductionLoop,
  approvalsInput: readonly ArtProductionHumanApprovalReceipt[] | unknown,
  packagingPlan: ArtProductionPackagingPlan,
  assemblyRequest: unknown,
  handoffInput: unknown,
  sourcesInput: readonly ArtProductionSourceArtifactInput[] | unknown,
  receiptInput: unknown,
): true {
  const submitted = validateSubmittedReceipt(receiptInput);
  const expected = compileArtProductionSourceAdmissionReceipt(
    plan,
    loop,
    approvalsInput,
    packagingPlan,
    assemblyRequest,
    handoffInput,
    sourcesInput,
  );
  if (expected.receiptSha256 !== submitted.receiptSha256) {
    invalid(
      "Source admission receipt is not the deterministic inspection of its exact handoff and caller-supplied PNG bytes.",
      {
        expectedReceiptSha256: expected.receiptSha256,
        submittedReceiptSha256: submitted.receiptSha256,
      },
    );
  }
  return true;
}
