import sharp from "sharp";

import {
  normalizeJson,
  type ArtifactId,
  type JsonValue,
} from "@evavo/art-artifacts";
import {
  DeliveryOptimizerError,
  optimizeDeliveryImage,
  type DeliveryProfileId,
} from "@evavo/art-delivery-optimizer";
import {
  ChromaKeyExtractionError,
  extractChromaKeyAlpha,
  type ChromaKeyExtractionOptions,
  type ChromaKeyExtractionResult,
} from "@evavo/art-media";
import {
  SpriteQualityInputError,
  analyseDecodedSpriteFrame,
  decodeSpriteFrame,
  type DecodedSpriteFrame,
  type SpriteFrameQualityReport,
} from "@evavo/art-quality";
import {
  PermanentRuntimeError,
  type RuntimeJobHandler,
} from "@evavo/art-runtime";

const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const REQUIRED_CAPABILITIES = Object.freeze([
  "quality.sprite-frame",
  "evidence.bundle",
] as const);
const DELIVERY_PROFILES = new Set<DeliveryProfileId>([
  "retro-standing-character-576",
  "retro-ui-icon-256",
  "retro-overlay-720p",
  "godot-sprite-lossless",
]);

type MasteringBackgroundMode =
  | "chroma-key"
  | "native-alpha"
  | "black-additive"
  | "opaque-preserve";

const isRecord = (
  value: JsonValue | undefined,
): value is Readonly<Record<string, JsonValue>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function requiredString(value: JsonValue | undefined, name: string): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
    throw new PermanentRuntimeError(
      "MASTERING_PAYLOAD_INVALID",
      `${name} must be a non-empty string.`,
    );
  }
  return value.trim();
}

function optionalString(
  value: JsonValue | undefined,
  name: string,
): string | undefined {
  return value === undefined ? undefined : requiredString(value, name);
}

function artifactId(value: JsonValue | undefined): ArtifactId {
  const normalized = requiredString(value, "candidateArtifactId");
  if (!ARTIFACT_ID.test(normalized)) {
    throw new PermanentRuntimeError(
      "MASTERING_ARTIFACT_ID_INVALID",
      "candidateArtifactId must use artifact_<sha256> format.",
    );
  }
  return normalized as ArtifactId;
}

function optionalNumber(
  value: JsonValue | undefined,
  name: string,
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new PermanentRuntimeError(
      "MASTERING_PAYLOAD_INVALID",
      `${name} must be a finite number.`,
    );
  }
  return value;
}

function optionalInteger(
  value: JsonValue | undefined,
  name: string,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new PermanentRuntimeError(
      "MASTERING_PAYLOAD_INVALID",
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return value;
}

function booleanValue(
  value: JsonValue | undefined,
  name: string,
  fallback: boolean,
): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    throw new PermanentRuntimeError(
      "MASTERING_PAYLOAD_INVALID",
      `${name} must be a boolean.`,
    );
  }
  return value;
}

function backgroundMode(
  value: JsonValue | undefined,
): MasteringBackgroundMode {
  const mode = value ?? "chroma-key";
  if (
    mode !== "chroma-key" &&
    mode !== "native-alpha" &&
    mode !== "black-additive" &&
    mode !== "opaque-preserve"
  ) {
    throw new PermanentRuntimeError(
      "MASTERING_PAYLOAD_INVALID",
      "backgroundMode must be chroma-key, native-alpha, black-additive or opaque-preserve.",
    );
  }
  return mode;
}

function profileId(value: JsonValue | undefined): DeliveryProfileId {
  const profile = value ?? "godot-sprite-lossless";
  if (typeof profile !== "string" || !DELIVERY_PROFILES.has(profile as DeliveryProfileId)) {
    throw new PermanentRuntimeError(
      "MASTERING_PAYLOAD_INVALID",
      "deliveryProfileId is not supported by automatic candidate finalization.",
    );
  }
  return profile as DeliveryProfileId;
}

function extractionOptions(
  payload: Readonly<Record<string, JsonValue>>,
  matteColour: string,
): ChromaKeyExtractionOptions {
  const connectionDistance = optionalNumber(
    payload.connectionDistance,
    "connectionDistance",
  );
  const opaqueSeedDistance = optionalNumber(
    payload.opaqueSeedDistance,
    "opaqueSeedDistance",
  );
  const edgeSearchRadius = optionalNumber(
    payload.edgeSearchRadius,
    "edgeSearchRadius",
  );
  const bleedRadius = optionalNumber(payload.bleedRadius, "bleedRadius");
  const minimumBorderMatteFraction = optionalNumber(
    payload.minimumBorderMatteFraction,
    "minimumBorderMatteFraction",
  );
  return {
    matteColour,
    ...(connectionDistance === undefined ? {} : { connectionDistance }),
    ...(opaqueSeedDistance === undefined ? {} : { opaqueSeedDistance }),
    ...(edgeSearchRadius === undefined ? {} : { edgeSearchRadius }),
    ...(bleedRadius === undefined ? {} : { bleedRadius }),
    ...(minimumBorderMatteFraction === undefined
      ? {}
      : { minimumBorderMatteFraction }),
  };
}

function safeFileStem(value: string): string {
  const normalized = value
    .replace(/\.[^.]+$/, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
  return normalized || "candidate";
}

function targetDimensions(
  payload: Readonly<Record<string, JsonValue>>,
): Readonly<{
  width?: number;
  height?: number;
  resampling: "nearest" | "lanczos3";
}> {
  const width = optionalInteger(payload.targetWidth, "targetWidth", 1, 8_192);
  const height = optionalInteger(payload.targetHeight, "targetHeight", 1, 8_192);
  if ((width === undefined) !== (height === undefined)) {
    throw new PermanentRuntimeError(
      "MASTERING_PAYLOAD_INVALID",
      "targetWidth and targetHeight must be supplied together.",
    );
  }
  const resampling = payload.resampling === undefined ? "nearest" : payload.resampling;
  if (resampling !== "nearest" && resampling !== "lanczos3") {
    throw new PermanentRuntimeError(
      "MASTERING_PAYLOAD_INVALID",
      "resampling must be nearest or lanczos3.",
    );
  }
  return {
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    resampling,
  };
}

function proofBackgrounds(value: JsonValue | undefined): readonly string[] {
  if (value === undefined) {
    return ["#000000", "#ffffff", "#808080", "#00ff00", "#ff00ff"];
  }
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) {
    throw new PermanentRuntimeError(
      "MASTERING_PAYLOAD_INVALID",
      "proofBackgrounds must contain 1 to 16 #RRGGBB colours.",
    );
  }
  return [
    ...new Set(
      value.map((entry, index) => {
        if (typeof entry !== "string" || !HEX.test(entry)) {
          throw new PermanentRuntimeError(
            "MASTERING_PAYLOAD_INVALID",
            `proofBackgrounds[${index}] must use #RRGGBB format.`,
          );
        }
        return entry.toLowerCase();
      }),
    ),
  ];
}

async function pngSource(
  candidateBytes: Buffer,
  mode: MasteringBackgroundMode,
  payload: Readonly<Record<string, JsonValue>>,
): Promise<Readonly<{
  png: Buffer;
  extraction: JsonValue | null;
  sourceDecoded: DecodedSpriteFrame;
}>> {
  const sourceDecoded = await decodeSpriteFrame(candidateBytes);
  if (mode === "native-alpha") {
    if (
      !sourceDecoded.sourceHasAlpha ||
      !sourceDecoded.data.some((_, index) => index % 4 === 3 && sourceDecoded.data[index]! < 255)
    ) {
      throw new PermanentRuntimeError(
        "MASTERING_NATIVE_ALPHA_MISSING",
        "Native-alpha mastering requires a decoded source alpha channel with at least one non-opaque pixel.",
      );
    }
    return {
      png: await sharp(candidateBytes).rotate().png({ compressionLevel: 9 }).toBuffer(),
      extraction: null,
      sourceDecoded,
    };
  }
  if (mode === "chroma-key") {
    const matteColour = requiredString(payload.matteColour, "matteColour");
    let extraction: ChromaKeyExtractionResult;
    try {
      extraction = await extractChromaKeyAlpha(
        candidateBytes,
        extractionOptions(payload, matteColour),
      );
    } catch (error: unknown) {
      if (error instanceof ChromaKeyExtractionError) {
        throw new PermanentRuntimeError(error.code, error.message);
      }
      throw error;
    }
    return {
      png: Buffer.from(extraction.png),
      extraction: normalizeJson(extraction.evidence),
      sourceDecoded,
    };
  }
  const flatten = mode === "black-additive" ? "#000000" : "#000000";
  return {
    png: await sharp(candidateBytes)
      .rotate()
      .flatten({ background: flatten })
      .png({ compressionLevel: 9, palette: false })
      .toBuffer(),
    extraction: null,
    sourceDecoded,
  };
}

async function resizePng(
  input: Buffer,
  target: ReturnType<typeof targetDimensions>,
): Promise<Readonly<{
  png: Buffer;
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  resized: boolean;
  resampling: "nearest" | "lanczos3";
}>> {
  const source = await decodeSpriteFrame(input);
  const width = target.width ?? source.width;
  const height = target.height ?? source.height;
  const resized = width !== source.width || height !== source.height;
  if (!resized) {
    return {
      png: Buffer.from(input),
      sourceWidth: source.width,
      sourceHeight: source.height,
      targetWidth: width,
      targetHeight: height,
      resized: false,
      resampling: target.resampling,
    };
  }
  const kernel =
    target.resampling === "nearest" ? sharp.kernel.nearest : sharp.kernel.lanczos3;
  return {
    png: await sharp(input, {
      animated: false,
      limitInputPixels: 64 * 1024 * 1024,
    })
      .resize(width, height, {
        fit: "fill",
        kernel,
        withoutEnlargement: false,
      })
      .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
      .toBuffer(),
    sourceWidth: source.width,
    sourceHeight: source.height,
    targetWidth: width,
    targetHeight: height,
    resized: true,
    resampling: target.resampling,
  };
}

function blackBackgroundEvidence(frame: DecodedSpriteFrame): Readonly<{
  borderPixels: number;
  blackBorderPixels: number;
  blackBorderFraction: number;
  nonBlackPixels: number;
  passed: boolean;
}> {
  let borderPixels = 0;
  let blackBorderPixels = 0;
  let nonBlackPixels = 0;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const offset = (y * frame.width + x) * 4;
      const r = frame.data[offset]!;
      const g = frame.data[offset + 1]!;
      const b = frame.data[offset + 2]!;
      if (Math.max(r, g, b) > 12) nonBlackPixels += 1;
      if (x === 0 || y === 0 || x === frame.width - 1 || y === frame.height - 1) {
        borderPixels += 1;
        if (Math.max(r, g, b) <= 12) blackBorderPixels += 1;
      }
    }
  }
  const blackBorderFraction = borderPixels
    ? blackBorderPixels / borderPixels
    : 0;
  return {
    borderPixels,
    blackBorderPixels,
    blackBorderFraction,
    nonBlackPixels,
    passed: blackBorderFraction >= 0.85 && nonBlackPixels > 0,
  };
}

function qualityExpectations(
  payload: Readonly<Record<string, JsonValue>>,
  width: number,
  height: number,
  frameId: string,
  mode: MasteringBackgroundMode,
  matteColour: string | undefined,
): Readonly<Record<string, JsonValue>> {
  const supplied = isRecord(payload.quality) ? payload.quality : {};
  const existingMattes = Array.isArray(supplied.knownMatteColours)
    ? supplied.knownMatteColours
    : [];
  const transparency =
    mode === "chroma-key" || mode === "native-alpha"
      ? "alpha-required"
      : "opaque";
  return {
    ...supplied,
    frameId,
    transparency,
    expectedWidth:
      typeof supplied.expectedWidth === "number" ? supplied.expectedWidth : width,
    expectedHeight:
      typeof supplied.expectedHeight === "number" ? supplied.expectedHeight : height,
    expectedFormat: "png",
    safePadding:
      typeof supplied.safePadding === "number"
        ? supplied.safePadding
        : transparency === "opaque"
          ? 0
          : 1,
    knownMatteColours: [
      ...(matteColour ? [matteColour] : []),
      ...existingMattes,
    ],
  };
}

function masteringError(error: unknown): never {
  if (
    error instanceof ChromaKeyExtractionError ||
    error instanceof DeliveryOptimizerError ||
    error instanceof SpriteQualityInputError
  ) {
    throw new PermanentRuntimeError(error.code, error.message);
  }
  throw error;
}

export function createCandidateMasteringHandlers(): Readonly<
  Record<string, RuntimeJobHandler>
> {
  const masterAlpha: RuntimeJobHandler = async (context) => {
    if (!isRecord(context.job.spec.payload)) {
      throw new PermanentRuntimeError(
        "MASTERING_PAYLOAD_INVALID",
        "art.candidate.master-alpha payload must be an object.",
      );
    }
    const payload = context.job.spec.payload;
    const candidateId = artifactId(payload.candidateArtifactId);
    const mode = backgroundMode(payload.backgroundMode);
    const matteColour = optionalString(payload.matteColour, "matteColour");
    const target = targetDimensions(payload);
    const deliveryProfileId = profileId(payload.deliveryProfileId);
    const matteProofs = proofBackgrounds(payload.proofBackgrounds);
    const requireFakeTransparencyRejection = booleanValue(
      payload.requireFakeTransparencyRejection,
      "requireFakeTransparencyRejection",
      true,
    );
    const requireMeaningfulAlpha = booleanValue(
      payload.requireMeaningfulAlpha,
      "requireMeaningfulAlpha",
      true,
    );
    for (const capability of REQUIRED_CAPABILITIES) {
      if (!context.job.spec.requiredCapabilities.includes(capability)) {
        throw new PermanentRuntimeError(
          "MASTERING_CAPABILITY_MISSING",
          `Mastering job must require ${capability}.`,
        );
      }
    }
    if (
      mode === "chroma-key" &&
      !context.job.spec.requiredCapabilities.includes("media.chroma-extract")
    ) {
      throw new PermanentRuntimeError(
        "MASTERING_CAPABILITY_MISSING",
        "Chroma-key mastering must require media.chroma-extract.",
      );
    }
    if (
      (target.width !== undefined || payload.deliveryProfileId !== undefined) &&
      !context.job.spec.requiredCapabilities.includes("media.raster")
    ) {
      throw new PermanentRuntimeError(
        "MASTERING_CAPABILITY_MISSING",
        "Resize or delivery finalization must require media.raster.",
      );
    }
    if (!context.job.spec.inputArtifacts.includes(candidateId)) {
      throw new PermanentRuntimeError(
        "MASTERING_INPUT_LINEAGE_MISSING",
        "candidateArtifactId must also be declared in inputArtifacts.",
      );
    }

    const [candidate, verification] = await Promise.all([
      context.artifacts.get(candidateId),
      context.artifacts.verify(candidateId),
    ]);
    if (!candidate || !verification.exists) {
      throw new PermanentRuntimeError(
        "MASTERING_CANDIDATE_NOT_FOUND",
        `Candidate artifact was not found: ${candidateId}`,
      );
    }
    if (!verification.descriptorValid || !verification.contentValid) {
      throw new PermanentRuntimeError(
        "MASTERING_CANDIDATE_TAMPERED",
        `Candidate artifact failed descriptor or content verification: ${candidateId}`,
      );
    }
    if (!candidate.mediaType.startsWith("image/")) {
      throw new PermanentRuntimeError(
        "MASTERING_CANDIDATE_MEDIA_INVALID",
        "Candidate artifact must contain a supported raster image.",
      );
    }
    if (
      candidate.storageClass !== "intermediate" ||
      candidate.labels.artifactRole !== "provider-candidate" ||
      candidate.labels.approvalState !== "unapproved"
    ) {
      throw new PermanentRuntimeError(
        "MASTERING_CANDIDATE_STATE_INVALID",
        "Finalization accepts only unapproved provider-candidate intermediates.",
      );
    }

    const candidateBytes = await context.artifacts.read(candidateId);
    let prepared: Awaited<ReturnType<typeof pngSource>>;
    let resized: Awaited<ReturnType<typeof resizePng>>;
    let optimization: Awaited<ReturnType<typeof optimizeDeliveryImage>>;
    let quality: SpriteFrameQualityReport;
    let blackEvidence: ReturnType<typeof blackBackgroundEvidence> | null = null;
    try {
      prepared = await pngSource(candidateBytes, mode, payload);
      resized = await resizePng(prepared.png, target);
      optimization = await optimizeDeliveryImage(resized.png, {
        profileId: deliveryProfileId,
        background: { mode: "preserve" },
      });
      const decoded = await decodeSpriteFrame(optimization.bytes);
      quality = analyseDecodedSpriteFrame(
        decoded,
        qualityExpectations(
          payload,
          decoded.width,
          decoded.height,
          typeof payload.frameId === "string"
            ? payload.frameId
            : candidate.labels.frameId ?? candidate.artifactId,
          mode,
          matteColour,
        ),
      );
      if (mode === "black-additive") {
        blackEvidence = blackBackgroundEvidence(decoded);
      }
    } catch (error: unknown) {
      masteringError(error);
    }

    const alphaPixels = quality.alpha.transparentPixels + quality.alpha.partialPixels;
    const meaningfulAlphaPassed =
      mode !== "chroma-key" && mode !== "native-alpha"
        ? true
        : !requireMeaningfulAlpha || alphaPixels > 0;
    const fakeTransparencyPassed =
      !requireFakeTransparencyRejection ||
      (!quality.fakeTransparency.checkerboardDetected &&
        !quality.fakeTransparency.flatMatteDetected);
    const blackBackgroundPassed = blackEvidence?.passed ?? true;
    const passed =
      quality.passed &&
      meaningfulAlphaPassed &&
      fakeTransparencyPassed &&
      blackBackgroundPassed;

    const stem = safeFileStem(
      candidate.fileName ?? candidate.labels.candidateFamilyId ?? candidate.artifactId,
    );
    const mastered = await context.putArtifact(optimization.bytes, {
      mediaType: "image/png",
      storageClass: "intermediate",
      fileName: `${stem}.finalized.png`,
      sourceArtifacts: [candidateId],
      labels: {
        artifactRole: "provider-candidate-alpha-master",
        approvalState: "unapproved",
        qualityState: passed ? "passed" : "rejected",
        finalDeliverable: "false",
        finalizationReady: passed ? "true" : "false",
        backgroundMode: mode,
        sourceCandidateArtifactId: candidateId,
        ...(candidate.labels.candidateFamilyId
          ? { candidateFamilyId: candidate.labels.candidateFamilyId }
          : {}),
        ...(candidate.labels.frameId ? { frameId: candidate.labels.frameId } : {}),
      },
      metadata: normalizeJson({
        schemaVersion: "1.0",
        jobId: context.job.id,
        stage: "candidate-finalization",
        requiresApproval: true,
        requiresBlockingQa: true,
        qualityPassed: passed,
        backgroundMode: mode,
        deliveryProfileId,
        proofBackgrounds: matteProofs,
        geometry: {
          sourceWidth: resized.sourceWidth,
          sourceHeight: resized.sourceHeight,
          targetWidth: resized.targetWidth,
          targetHeight: resized.targetHeight,
          resized: resized.resized,
          resampling: resized.resampling,
        },
      }),
    });

    const evidenceBody = normalizeJson({
      schemaVersion: "1.0",
      jobId: context.job.id,
      sourceCandidate: {
        artifactId: candidate.artifactId,
        descriptorSha256: candidate.descriptorSha256,
        contentSha256: candidate.contentSha256,
        mediaType: candidate.mediaType,
        labels: candidate.labels,
      },
      masteredCandidate: {
        artifactId: mastered.artifactId,
        descriptorSha256: mastered.descriptorSha256,
        contentSha256: mastered.contentSha256,
      },
      background: {
        mode,
        matteColour: matteColour ?? null,
        proofBackgrounds: matteProofs,
        extraction: prepared.extraction,
        blackEvidence,
      },
      geometry: {
        sourceWidth: resized.sourceWidth,
        sourceHeight: resized.sourceHeight,
        targetWidth: resized.targetWidth,
        targetHeight: resized.targetHeight,
        resized: resized.resized,
        resampling: resized.resampling,
      },
      optimization: optimization.evidence,
      quality,
      blockingProof: {
        qualityPassed: quality.passed,
        meaningfulAlphaPassed,
        fakeTransparencyPassed,
        blackBackgroundPassed,
      },
      promotionEligible: passed,
      approvalState: "unapproved",
    });
    const evidence = await context.putArtifact(
      `${JSON.stringify(evidenceBody, null, 2)}\n`,
      {
        mediaType: "application/json",
        storageClass: "evidence",
        fileName: `${stem}.finalization.evidence.json`,
        sourceArtifacts: [candidateId, mastered.artifactId],
        labels: {
          artifactRole: "candidate-finalization-evidence",
          approvalState: "evidence-only",
          qualityState: passed ? "passed" : "rejected",
          backgroundMode: mode,
          sourceCandidateArtifactId: candidateId,
          masteredCandidateArtifactId: mastered.artifactId,
        },
        metadata: normalizeJson({
          schemaVersion: "1.0",
          jobId: context.job.id,
          qualityReportSha256: quality.rawRgbaSha256,
          deliveryProfileId,
          resized: resized.resized,
          targetWidth: resized.targetWidth,
          targetHeight: resized.targetHeight,
          resampling: resized.resampling,
        }),
      },
    );

    return {
      outputArtifacts: [mastered.artifactId, evidence.artifactId],
      result: normalizeJson({
        schemaVersion: "1.0",
        sourceCandidateArtifactId: candidateId,
        masteredCandidateArtifactId: mastered.artifactId,
        evidenceArtifactId: evidence.artifactId,
        qualityPassed: passed,
        promotionEligible: passed,
        approvalState: "unapproved",
        backgroundMode: mode,
        deliveryProfileId,
        resized: resized.resized,
        targetWidth: resized.targetWidth,
        targetHeight: resized.targetHeight,
        resampling: resized.resampling,
      }),
    };
  };

  return Object.freeze({
    "art.candidate.master-alpha": masterAlpha,
  });
}

export function candidateMasteringWorkerCapabilities(): readonly string[] {
  return [
    "media.chroma-extract",
    "media.raster",
    "quality.sprite-frame",
    "evidence.bundle",
  ];
}
