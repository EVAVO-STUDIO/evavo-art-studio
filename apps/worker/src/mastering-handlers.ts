import sharp from "sharp";

import {
  normalizeJson,
  type ArtifactId,
  type JsonValue,
} from "@evavo/art-artifacts";
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
  type SpriteFrameQualityReport,
} from "@evavo/art-quality";
import {
  PermanentRuntimeError,
  type RuntimeJobHandler,
} from "@evavo/art-runtime";

const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const REQUIRED_CAPABILITIES = Object.freeze([
  "media.chroma-extract",
  "quality.sprite-frame",
  "evidence.bundle",
] as const);

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

function qualityExpectations(
  payload: Readonly<Record<string, JsonValue>>,
  width: number,
  height: number,
  frameId: string,
  matteColour: string,
): Readonly<Record<string, JsonValue>> {
  const supplied = isRecord(payload.quality) ? payload.quality : {};
  const existingMattes = Array.isArray(supplied.knownMatteColours)
    ? supplied.knownMatteColours
    : [];
  return {
    ...supplied,
    frameId,
    transparency: "alpha-required",
    expectedWidth:
      typeof supplied.expectedWidth === "number" ? supplied.expectedWidth : width,
    expectedHeight:
      typeof supplied.expectedHeight === "number" ? supplied.expectedHeight : height,
    expectedFormat: "png",
    safePadding:
      typeof supplied.safePadding === "number" ? supplied.safePadding : 1,
    knownMatteColours: [matteColour, ...existingMattes],
  };
}

function masteringError(error: unknown): never {
  if (
    error instanceof ChromaKeyExtractionError ||
    error instanceof SpriteQualityInputError
  ) {
    throw new PermanentRuntimeError(error.code, error.message);
  }
  throw error;
}

function targetDimensions(
  payload: Readonly<Record<string, JsonValue>>,
): Readonly<{ width?: number; height?: number; resampling: "nearest" | "lanczos3" }> {
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

async function resizeExtractedPng(
  extraction: ChromaKeyExtractionResult,
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
  const source = await decodeSpriteFrame(extraction.png);
  const width = target.width ?? source.width;
  const height = target.height ?? source.height;
  const resized = width !== source.width || height !== source.height;
  if (!resized) {
    return {
      png: Buffer.from(extraction.png),
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
  const png = await sharp(extraction.png, {
    animated: false,
    limitInputPixels: 64 * 1024 * 1024,
  })
    .resize(width, height, {
      fit: "fill",
      kernel,
      withoutEnlargement: false,
    })
    .png({
      compressionLevel: 9,
      adaptiveFiltering: false,
      palette: false,
    })
    .toBuffer();
  return {
    png,
    sourceWidth: source.width,
    sourceHeight: source.height,
    targetWidth: width,
    targetHeight: height,
    resized: true,
    resampling: target.resampling,
  };
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
    const matteColour = requiredString(payload.matteColour, "matteColour");
    const target = targetDimensions(payload);
    for (const capability of REQUIRED_CAPABILITIES) {
      if (!context.job.spec.requiredCapabilities.includes(capability)) {
        throw new PermanentRuntimeError(
          "MASTERING_CAPABILITY_MISSING",
          `Mastering job must require ${capability}.`,
        );
      }
    }
    if (
      target.width !== undefined &&
      !context.job.spec.requiredCapabilities.includes("media.raster")
    ) {
      throw new PermanentRuntimeError(
        "MASTERING_CAPABILITY_MISSING",
        "Target-size mastering must require media.raster.",
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
        "Alpha mastering accepts only unapproved provider-candidate intermediates.",
      );
    }

    const candidateBytes = await context.artifacts.read(candidateId);
    let extraction: ChromaKeyExtractionResult;
    try {
      extraction = await extractChromaKeyAlpha(
        candidateBytes,
        extractionOptions(payload, matteColour),
      );
    } catch (error: unknown) {
      masteringError(error);
    }

    let masteredImage: Awaited<ReturnType<typeof resizeExtractedPng>>;
    let quality: SpriteFrameQualityReport;
    try {
      masteredImage = await resizeExtractedPng(extraction, target);
      const decoded = await decodeSpriteFrame(masteredImage.png);
      quality = analyseDecodedSpriteFrame(
        decoded,
        qualityExpectations(
          payload,
          decoded.width,
          decoded.height,
          typeof payload.frameId === "string"
            ? payload.frameId
            : candidate.labels.frameId ?? candidate.artifactId,
          matteColour,
        ),
      );
    } catch (error: unknown) {
      masteringError(error);
    }

    const stem = safeFileStem(
      candidate.fileName ?? candidate.labels.candidateFamilyId ?? candidate.artifactId,
    );
    const mastered = await context.putArtifact(masteredImage.png, {
      mediaType: "image/png",
      storageClass: "intermediate",
      fileName: `${stem}.alpha-master.png`,
      sourceArtifacts: [candidateId],
      labels: {
        artifactRole: "provider-candidate-alpha-master",
        approvalState: "unapproved",
        qualityState: quality.passed ? "passed" : "rejected",
        finalDeliverable: "false",
        sourceCandidateArtifactId: candidateId,
        ...(candidate.labels.candidateFamilyId
          ? { candidateFamilyId: candidate.labels.candidateFamilyId }
          : {}),
        ...(candidate.labels.frameId ? { frameId: candidate.labels.frameId } : {}),
      },
      metadata: normalizeJson({
        schemaVersion: "1.0",
        jobId: context.job.id,
        stage: "chroma-alpha-mastering",
        requiresApproval: true,
        requiresBlockingQa: true,
        qualityPassed: quality.passed,
        extractionSha256: extraction.evidence.outputSha256,
        geometry: {
          sourceWidth: masteredImage.sourceWidth,
          sourceHeight: masteredImage.sourceHeight,
          targetWidth: masteredImage.targetWidth,
          targetHeight: masteredImage.targetHeight,
          resized: masteredImage.resized,
          resampling: masteredImage.resampling,
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
      extraction: extraction.evidence,
      geometry: {
        sourceWidth: masteredImage.sourceWidth,
        sourceHeight: masteredImage.sourceHeight,
        targetWidth: masteredImage.targetWidth,
        targetHeight: masteredImage.targetHeight,
        resized: masteredImage.resized,
        resampling: masteredImage.resampling,
      },
      quality,
      promotionEligible: quality.passed,
      approvalState: "unapproved",
    });
    const evidence = await context.putArtifact(
      `${JSON.stringify(evidenceBody, null, 2)}\n`,
      {
        mediaType: "application/json",
        storageClass: "evidence",
        fileName: `${stem}.alpha-master.evidence.json`,
        sourceArtifacts: [candidateId, mastered.artifactId],
        labels: {
          artifactRole: "candidate-alpha-mastering-evidence",
          approvalState: "evidence-only",
          qualityState: quality.passed ? "passed" : "rejected",
          sourceCandidateArtifactId: candidateId,
          masteredCandidateArtifactId: mastered.artifactId,
        },
        metadata: normalizeJson({
          schemaVersion: "1.0",
          jobId: context.job.id,
          extractionSha256: extraction.evidence.outputSha256,
          qualityReportSha256: quality.rawRgbaSha256,
          resized: masteredImage.resized,
          targetWidth: masteredImage.targetWidth,
          targetHeight: masteredImage.targetHeight,
          resampling: masteredImage.resampling,
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
        qualityPassed: quality.passed,
        promotionEligible: quality.passed,
        approvalState: "unapproved",
        resized: masteredImage.resized,
        targetWidth: masteredImage.targetWidth,
        targetHeight: masteredImage.targetHeight,
        resampling: masteredImage.resampling,
      }),
    };
  };

  return Object.freeze({
    "art.candidate.master-alpha": masterAlpha,
  });
}

export function candidateMasteringWorkerCapabilities(): readonly string[] {
  return [...new Set([...REQUIRED_CAPABILITIES, "media.raster"])].sort();
}
