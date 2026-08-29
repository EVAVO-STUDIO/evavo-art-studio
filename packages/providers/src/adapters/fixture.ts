import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";

import {
  PROVIDER_PROTOCOL_VERSION,
  ProviderError,
  type ProviderAdapter,
  type ProviderAdapterExecutionContext,
  type ProviderAdapterExecutionResult,
  type ProviderAdapterOutput,
  type ProviderAdapterDescriptor,
  type ProviderCapability,
  type ResolvedProviderCandidateRequest,
} from "../types.js";

const FIXTURE_CAPABILITIES = Object.freeze([
  "generate",
  "edit",
  "inpaint",
  "reference-images",
  "multiple-reference-images",
  "identity-reference",
  "direction-reference",
  "temporal-reference",
  "palette-reference",
  "line-reference",
  "material-reference",
  "layer-context-reference",
  "pose-control",
  "edge-control",
  "depth-control",
  "mask",
  "seed",
  "native-alpha",
  "custom-size",
  "candidate-count",
  "cancellation",
] as const satisfies readonly ProviderCapability[]);

const MAXIMUM_FIXTURE_PIXELS = 16_777_216;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0
        ? 0xedb88320 ^ (value >>> 1)
        : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

function deterministicColour(identity: string): readonly [number, number, number] {
  const digest = createHash("sha256").update(identity, "utf8").digest();
  return [
    48 + (digest[0]! % 176),
    48 + (digest[1]! % 176),
    48 + (digest[2]! % 176),
  ] as const;
}

function fixturePng(
  width: number,
  height: number,
  identity: string,
  transparencyRequired: boolean,
): Buffer {
  if (width * height > MAXIMUM_FIXTURE_PIXELS) {
    throw new ProviderError(
      "PROVIDER_FIXTURE_CANVAS_TOO_LARGE",
      `Fixture provider limits generated test canvases to ${MAXIMUM_FIXTURE_PIXELS} pixels.`,
      "permanent",
    );
  }
  const [red, green, blue] = deterministicColour(identity);
  const rowBytes = width * 4;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  const accentSize = Math.max(1, Math.min(width, height, 8));
  const accentStartX = Math.max(0, Math.floor((width - accentSize) / 2));
  const accentStartY = Math.max(0, Math.floor((height - accentSize) / 2));

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (rowBytes + 1);
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const accent =
        x >= accentStartX &&
        x < accentStartX + accentSize &&
        y >= accentStartY &&
        y < accentStartY + accentSize;
      raw[pixelOffset] = accent ? red : 0;
      raw[pixelOffset + 1] = accent ? green : 0;
      raw[pixelOffset + 2] = accent ? blue : 0;
      raw[pixelOffset + 3] = transparencyRequired
        ? accent
          ? 255
          : 0
        : 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const text = Buffer.from(`EVAVOFixture\0${identity}`, "utf8");
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("tEXt", text),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export const FIXTURE_PROVIDER_DESCRIPTOR: ProviderAdapterDescriptor = Object.freeze({
  protocolVersion: PROVIDER_PROTOCOL_VERSION,
  id: "fixture-image",
  label: "Deterministic fixture image",
  version: "1.1.0",
  priority: -10_000,
  capabilities: FIXTURE_CAPABILITIES,
  models: Object.freeze(["fixture-deterministic-canvas-v2"]),
  maximumCandidates: 8,
  maximumReferenceImages: 16,
  maximumSourceBytes: 32 * 1024 * 1024,
  dataPolicy: Object.freeze({
    remote: false,
    retainedByProvider: false,
    usedForTraining: false,
  }),
});

export class FixtureImageProviderAdapter implements ProviderAdapter {
  public readonly descriptor = FIXTURE_PROVIDER_DESCRIPTOR;

  public async execute(
    resolved: ResolvedProviderCandidateRequest,
    context: ProviderAdapterExecutionContext,
  ): Promise<ProviderAdapterExecutionResult> {
    if (context.signal.aborted) {
      throw new ProviderError(
        "PROVIDER_EXECUTION_CANCELLED",
        "Fixture provider execution was cancelled.",
        "cancelled",
      );
    }
    const outputs: ProviderAdapterOutput[] = Array.from(
      { length: resolved.request.candidateCount },
      (_, index) => {
        const identity = [
          resolved.request.requestId,
          String(resolved.request.seed ?? 0),
          String(index + 1),
          `${resolved.request.target.width}x${resolved.request.target.height}`,
        ].join(":");
        return {
          bytes: fixturePng(
            resolved.request.target.width,
            resolved.request.target.height,
            identity,
            resolved.request.target.transparency === "required",
          ),
          mediaType: "image/png" as const,
          fileName: `${resolved.request.candidateFamilyId}-${String(index + 1).padStart(2, "0")}.png`,
          revisedPrompt: resolved.compiledPrompt,
          metadata: {
            fixture: true,
            candidateIndex: index + 1,
            targetWidth: resolved.request.target.width,
            targetHeight: resolved.request.target.height,
            referenceCount: resolved.references.length,
            deterministicIdentity: identity,
          },
        };
      },
    );
    return {
      adapterId: this.descriptor.id,
      model: this.descriptor.models[0]!,
      externalId: `fixture:${resolved.request.requestId}`,
      outputs,
      usage: { fixtureCandidates: outputs.length },
      metadata: {
        deterministic: true,
        requestedAt: context.requestedAt.toISOString(),
      },
    };
  }
}
