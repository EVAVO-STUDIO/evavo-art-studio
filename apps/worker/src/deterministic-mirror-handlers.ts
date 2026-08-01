import { createHash } from "node:crypto";

import {
  normalizeJson,
  type ArtifactId,
  type JsonValue,
  type StoredArtifact,
} from "@evavo/art-artifacts";
import {
  analyseDecodedSpriteFrame,
  decodeSpriteFrame,
  type DecodedSpriteFrame,
} from "@evavo/art-quality";
import {
  PermanentRuntimeError,
  type RuntimeJobHandler,
} from "@evavo/art-runtime";
import sharp from "sharp";

import {
  createGuardedAdaptiveFinalizerHandlers,
  guardedAdaptiveFinalizerWorkerCapabilities,
} from "./adaptive-finalizer-guarded-handlers.js";

const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const MIRROR_OPERATION = "mirror-horizontal";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, name: string, maximum = 512): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maximum ||
    value.includes("\0")
  ) {
    throw new PermanentRuntimeError(
      "DETERMINISTIC_MIRROR_PAYLOAD_INVALID",
      `${name} must be a non-empty string no longer than ${maximum} characters.`,
    );
  }
  return value.trim();
}

function requiredInteger(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new PermanentRuntimeError(
      "DETERMINISTIC_MIRROR_PAYLOAD_INVALID",
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return value;
}

function artifactId(value: unknown, name: string): ArtifactId {
  if (typeof value !== "string" || !ARTIFACT_ID.test(value)) {
    throw new PermanentRuntimeError(
      "DETERMINISTIC_MIRROR_ARTIFACT_ID_INVALID",
      `${name} must use artifact_<sha256> format.`,
    );
  }
  return value as ArtifactId;
}

function safeFileStem(value: string): string {
  const stem = value
    .replace(/\.[^.]+$/, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
  return stem || "mirrored-sprite";
}

function rgbaSha256(frame: DecodedSpriteFrame): string {
  return createHash("sha256")
    .update(`${frame.width}x${frame.height}x4\0`)
    .update(frame.data)
    .digest("hex");
}

export function mirrorHorizontalRgba(
  source: Uint8Array,
  width: number,
  height: number,
): Buffer {
  const expected = width * height * 4;
  if (source.byteLength !== expected) {
    throw new PermanentRuntimeError(
      "DETERMINISTIC_MIRROR_RGBA_LENGTH_INVALID",
      `RGBA byte length ${source.byteLength} does not match ${width}x${height}.`,
    );
  }
  const output = Buffer.allocUnsafe(expected);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (y * width + x) * 4;
      const targetOffset = (y * width + (width - 1 - x)) * 4;
      output[targetOffset] = source[sourceOffset]!;
      output[targetOffset + 1] = source[sourceOffset + 1]!;
      output[targetOffset + 2] = source[sourceOffset + 2]!;
      output[targetOffset + 3] = source[sourceOffset + 3]!;
    }
  }
  return output;
}

async function verifiedSource(
  sourceArtifactId: ArtifactId,
  context: Parameters<RuntimeJobHandler>[0],
): Promise<StoredArtifact> {
  const [artifact, verification] = await Promise.all([
    context.artifacts.get(sourceArtifactId),
    context.artifacts.verify(sourceArtifactId),
  ]);
  if (
    !artifact ||
    !verification.exists ||
    !verification.descriptorValid ||
    !verification.contentValid
  ) {
    throw new PermanentRuntimeError(
      "DETERMINISTIC_MIRROR_SOURCE_TAMPERED",
      `Source artifact failed immutable verification: ${sourceArtifactId}`,
    );
  }
  if (!context.job.spec.inputArtifacts.includes(sourceArtifactId)) {
    throw new PermanentRuntimeError(
      "DETERMINISTIC_MIRROR_INPUT_LINEAGE_MISSING",
      "sourceArtifactId must also be declared in inputArtifacts.",
    );
  }
  if (
    artifact.mediaType !== "image/png" ||
    artifact.storageClass !== "master" ||
    artifact.labels.qualityState !== "passed" ||
    !new Set(["selected", "approved"]).has(
      artifact.labels.approvalState ?? "",
    )
  ) {
    throw new PermanentRuntimeError(
      "DETERMINISTIC_MIRROR_SOURCE_STATE_INVALID",
      "Horizontal derivation accepts only immutable, quality-passed selected or approved PNG masters.",
    );
  }
  return artifact;
}

function ensureCapabilities(
  declared: readonly string[],
): void {
  for (const capability of [
    "media.adaptive-finalize",
    "media.sprite-mirror",
    "media.raster",
    "quality.sprite-frame",
    "evidence.bundle",
  ]) {
    if (!declared.includes(capability)) {
      throw new PermanentRuntimeError(
        "DETERMINISTIC_MIRROR_CAPABILITY_MISSING",
        `Mirror job must require ${capability}.`,
      );
    }
  }
}

async function executeMirror(
  context: Parameters<RuntimeJobHandler>[0],
  payload: Record<string, unknown>,
): Promise<NonNullable<Awaited<ReturnType<RuntimeJobHandler>>>> {
  ensureCapabilities(context.job.spec.requiredCapabilities);
  const sourceArtifactId = artifactId(
    payload.sourceArtifactId,
    "sourceArtifactId",
  );
  const sourceDirection = requiredString(
    payload.sourceDirection,
    "sourceDirection",
    128,
  );
  const targetDirection = requiredString(
    payload.targetDirection,
    "targetDirection",
    128,
  );
  const unitKind = requiredString(payload.unitKind, "unitKind", 64);
  const layerRole = requiredString(payload.layerRole, "layerRole", 128);
  const expectedWidth = requiredInteger(
    payload.expectedWidth,
    "expectedWidth",
    1,
    16_384,
  );
  const expectedHeight = requiredInteger(
    payload.expectedHeight,
    "expectedHeight",
    1,
    16_384,
  );
  const targetFrameId =
    payload.targetFrameId === null || payload.targetFrameId === undefined
      ? undefined
      : requiredString(payload.targetFrameId, "targetFrameId", 256);
  const sourceFrameId =
    payload.sourceFrameId === null || payload.sourceFrameId === undefined
      ? undefined
      : requiredString(payload.sourceFrameId, "sourceFrameId", 256);
  const qualityInput = isRecord(payload.quality) ? payload.quality : {};
  const source = await verifiedSource(sourceArtifactId, context);
  const sourceBytes = await context.artifacts.read(sourceArtifactId);
  const sourceDecoded = await decodeSpriteFrame(sourceBytes, {
    maximumInputBytes: 64 * 1024 * 1024,
    maximumPixels: expectedWidth * expectedHeight,
  });
  if (
    sourceDecoded.width !== expectedWidth ||
    sourceDecoded.height !== expectedHeight
  ) {
    throw new PermanentRuntimeError(
      "DETERMINISTIC_MIRROR_DIMENSIONS_INVALID",
      `Source dimensions ${sourceDecoded.width}x${sourceDecoded.height} do not match ${expectedWidth}x${expectedHeight}.`,
    );
  }
  if (!sourceDecoded.sourceHasAlpha) {
    throw new PermanentRuntimeError(
      "DETERMINISTIC_MIRROR_ALPHA_MISSING",
      "Deterministic sprite mirroring requires a real PNG alpha channel.",
    );
  }

  const expectedRgba = mirrorHorizontalRgba(
    sourceDecoded.data,
    sourceDecoded.width,
    sourceDecoded.height,
  );
  const encoded = await sharp(expectedRgba, {
    raw: {
      width: sourceDecoded.width,
      height: sourceDecoded.height,
      channels: 4,
    },
    limitInputPixels: expectedWidth * expectedHeight,
  })
    .png({
      compressionLevel: 9,
      adaptiveFiltering: false,
      palette: false,
    })
    .toBuffer();
  const mirroredDecoded = await decodeSpriteFrame(encoded, {
    maximumInputBytes: 64 * 1024 * 1024,
    maximumPixels: expectedWidth * expectedHeight,
  });
  if (!Buffer.from(mirroredDecoded.data).equals(expectedRgba)) {
    throw new PermanentRuntimeError(
      "DETERMINISTIC_MIRROR_ENCODED_PIXELS_CHANGED",
      "PNG encoding changed one or more reflected RGBA bytes.",
    );
  }
  const roundTrip = mirrorHorizontalRgba(
    mirroredDecoded.data,
    mirroredDecoded.width,
    mirroredDecoded.height,
  );
  const roundTripExact = roundTrip.equals(Buffer.from(sourceDecoded.data));
  if (!roundTripExact) {
    throw new PermanentRuntimeError(
      "DETERMINISTIC_MIRROR_ROUND_TRIP_FAILED",
      "Reflecting the derived RGBA canvas did not reconstruct the source exactly.",
    );
  }
  const quality = analyseDecodedSpriteFrame(mirroredDecoded, {
    ...qualityInput,
    frameId:
      typeof qualityInput.frameId === "string"
        ? qualityInput.frameId
        : targetFrameId ?? `direction-master-${targetDirection}`,
    transparency: "alpha-required",
    expectedWidth,
    expectedHeight,
    expectedFormat: "png",
  });
  if (!quality.passed) {
    throw new PermanentRuntimeError(
      "DETERMINISTIC_MIRROR_QUALITY_FAILED",
      "The exact reflected frame failed one or more unchanged blocking quality gates.",
      normalizeJson({
        failedGateIds: quality.gates
          .filter((gate) => gate.blocking && gate.status === "fail")
          .map((gate) => gate.id),
      }),
    );
  }

  const stem = safeFileStem(
    source.fileName ?? targetFrameId ?? `${targetDirection}-${layerRole}`,
  );
  const intermediate = await context.putArtifact(encoded, {
    mediaType: "image/png",
    storageClass: "intermediate",
    fileName: `${stem}.horizontal-mirror.base.png`,
    sourceArtifacts: [sourceArtifactId],
    labels: {
      artifactRole: "deterministic-horizontal-mirror-base",
      approvalState: "unapproved",
      qualityState: "passed",
      deterministicMirror: "true",
      sourceArtifactId,
      sourceDirection,
      targetDirection,
      unitKind,
      layerRole,
      ...(sourceFrameId ? { sourceFrameId } : {}),
      ...(targetFrameId ? { targetFrameId } : {}),
    },
    metadata: normalizeJson({
      schemaVersion: "1.0",
      operation: MIRROR_OPERATION,
      sourceRgbaSha256: rgbaSha256(sourceDecoded),
      mirroredRgbaSha256: rgbaSha256(mirroredDecoded),
      width: expectedWidth,
      height: expectedHeight,
      roundTripExact,
    }),
  });

  const evidenceBody = normalizeJson({
    schemaVersion: "1.0",
    operation: MIRROR_OPERATION,
    sourceArtifact: {
      artifactId: source.artifactId,
      descriptorSha256: source.descriptorSha256,
      contentSha256: source.contentSha256,
    },
    mirroredBaseArtifact: {
      artifactId: intermediate.artifactId,
      descriptorSha256: intermediate.descriptorSha256,
      contentSha256: intermediate.contentSha256,
    },
    sourceDirection,
    targetDirection,
    unitKind,
    layerRole,
    sourceFrameId: sourceFrameId ?? null,
    targetFrameId: targetFrameId ?? null,
    canvas: { width: expectedWidth, height: expectedHeight },
    transform: {
      axis: "full-canvas-horizontal",
      pixelMapping: "targetX=width-1-sourceX",
      trim: false,
      resample: false,
      preserveAlpha: true,
      preserveTransparentRgb: true,
    },
    proof: {
      sourceRgbaSha256: rgbaSha256(sourceDecoded),
      mirroredRgbaSha256: rgbaSha256(mirroredDecoded),
      encodedPixelsExact: true,
      roundTripExact,
      qualityPassed: quality.passed,
      qualityThresholdsRelaxed: false,
    },
    quality,
  });
  const evidence = await context.putArtifact(
    `${JSON.stringify(evidenceBody, null, 2)}\n`,
    {
      mediaType: "application/json",
      storageClass: "evidence",
      fileName: `${stem}.horizontal-mirror.evidence.json`,
      sourceArtifacts: [sourceArtifactId, intermediate.artifactId],
      labels: {
        artifactRole: "sprite-horizontal-mirror-evidence",
        approvalState: "evidence-only",
        qualityState: "passed",
        releaseReady: "true",
        sourceArtifactId,
        mirroredBaseArtifactId: intermediate.artifactId,
        sourceDirection,
        targetDirection,
        unitKind,
        layerRole,
        ...(sourceFrameId ? { sourceFrameId } : {}),
        ...(targetFrameId ? { targetFrameId } : {}),
      },
      metadata: normalizeJson({
        operation: MIRROR_OPERATION,
        sourceRgbaSha256: rgbaSha256(sourceDecoded),
        mirroredRgbaSha256: rgbaSha256(mirroredDecoded),
        roundTripExact,
      }),
    },
  );

  const master = await context.putArtifact(encoded, {
    mediaType: "image/png",
    storageClass: "master",
    fileName: `${stem}.horizontal-mirror.selected-master.png`,
    sourceArtifacts: [intermediate.artifactId, evidence.artifactId],
    labels: {
      artifactRole: "deterministic-mirrored-sprite-master",
      approvalState: "selected",
      qualityState: "passed",
      finalDeliverable: "false",
      deterministicMirror: "true",
      mirrorEvidenceArtifactId: evidence.artifactId,
      sourceArtifactId,
      sourceDirection,
      targetDirection,
      unitKind,
      layerRole,
      ...(sourceFrameId ? { sourceFrameId } : {}),
      ...(targetFrameId ? { targetFrameId } : {}),
    },
    metadata: normalizeJson({
      schemaVersion: "1.0",
      operation: MIRROR_OPERATION,
      sourceArtifactId,
      mirroredBaseArtifactId: intermediate.artifactId,
      evidenceArtifactId: evidence.artifactId,
      sourceRgbaSha256: rgbaSha256(sourceDecoded),
      mirroredRgbaSha256: rgbaSha256(mirroredDecoded),
      roundTripExact,
      qualityThresholdsRelaxed: false,
    }),
  });

  return {
    outputArtifacts: [master.artifactId, evidence.artifactId, intermediate.artifactId],
    result: normalizeJson({
      schemaVersion: "1.0",
      operation: MIRROR_OPERATION,
      sourceArtifactId,
      masterArtifactId: master.artifactId,
      evidenceArtifactId: evidence.artifactId,
      mirroredBaseArtifactId: intermediate.artifactId,
      sourceDirection,
      targetDirection,
      sourceFrameId: sourceFrameId ?? null,
      targetFrameId: targetFrameId ?? null,
      layerRole,
      qualityPassed: true,
      roundTripExact,
      qualityThresholdsRelaxed: false,
    }),
  };
}

export function createDeterministicMirrorAwareFinalizerHandlers(): Readonly<
  Record<string, RuntimeJobHandler>
> {
  const base = createGuardedAdaptiveFinalizerHandlers()[
    "art.candidate.finalize-adaptive"
  ];
  if (!base) {
    throw new Error("Guarded adaptive finalizer handler is unavailable.");
  }
  const handler: RuntimeJobHandler = async (context) => {
    const payload = context.job.spec.payload;
    if (
      isRecord(payload) &&
      payload.operation === MIRROR_OPERATION
    ) {
      return executeMirror(context, payload);
    }
    return base(context);
  };
  return Object.freeze({
    "art.candidate.finalize-adaptive": handler,
  });
}

export function deterministicMirrorAwareFinalizerWorkerCapabilities(): readonly string[] {
  return [
    ...new Set([
      ...guardedAdaptiveFinalizerWorkerCapabilities(),
      "media.sprite-mirror",
    ]),
  ].sort();
}
