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

function hexColour(value: string): readonly [number, number, number] {
  if (!/^#[0-9a-f]{6}$/iu.test(value)) {
    throw new ProviderError(
      "PROVIDER_FIXTURE_MATTE_INVALID",
      "Fixture provider chroma matte must use #RRGGBB format.",
      "permanent",
    );
  }
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ] as const;
}

type FixtureBackground = Readonly<{
  red: number;
  green: number;
  blue: number;
  alpha: number;
  mode: "chroma-key" | "native-alpha" | "opaque";
}>;

function fixtureBackground(
  request: ResolvedProviderCandidateRequest["request"],
): FixtureBackground {
  const strategy = request.background.strategy;
  if (strategy === "chroma-key") {
    const [red, green, blue] = hexColour(request.background.matteColour!);
    return { red, green, blue, alpha: 255, mode: "chroma-key" };
  }
  if (strategy === "native-alpha") {
    return { red: 0, green: 0, blue: 0, alpha: 0, mode: "native-alpha" };
  }
  if (
    strategy === "provider-auto" &&
    request.target.transparency !== "opaque"
  ) {
    return { red: 0, green: 0, blue: 0, alpha: 0, mode: "native-alpha" };
  }
  return { red: 18, green: 20, blue: 24, alpha: 255, mode: "opaque" };
}

function fixturePng(
  width: number,
  height: number,
  identity: string,
  background: FixtureBackground,
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
      raw[pixelOffset] = accent ? red : background.red;
      raw[pixelOffset + 1] = accent ? green : background.green;
      raw[pixelOffset + 2] = accent ? blue : background.blue;
      raw[pixelOffset + 3] = accent ? 255 : background.alpha;
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

  const text = Buffer.from(
    `EVAVOFixture\0${identity};background=${background.mode}`,
    "utf8",
  );
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
  version: "1.2.0",
  priority: -10_000,
  capabilities: FIXTURE_CAPABILITIES,
  models: Object.freeze(["fixture-background-contract-v3"]),
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
    const background = fixtureBackground(resolved.request);
    const outputs: ProviderAdapterOutput[] = Array.from(
      { length: resolved.request.candidateCount },
      (_, index) => {
        const identity = [
          resolved.request.requestId,
          String(resolved.request.seed ?? 0),
          String(index + 1),
          `${resolved.request.target.width}x${resolved.request.target.height}`,
          resolved.request.background.strategy,
          resolved.request.background.matteColour ?? "none",
        ].join(":");
        return {
          bytes: fixturePng(
            resolved.request.target.width,
            resolved.request.target.height,
            identity,
            background,
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
            backgroundStrategy: resolved.request.background.strategy,
            matteColour: resolved.request.background.matteColour ?? null,
            fixtureBackgroundMode: background.mode,
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
