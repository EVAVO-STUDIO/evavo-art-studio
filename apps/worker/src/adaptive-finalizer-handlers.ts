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
  SpriteFinalizerError,
  finalizeDecodedSpriteFrame,
  type SpriteFinalizationAssessment,
} from "@evavo/art-finalizer";
import {
  SpriteQualityInputError,
  decodeSpriteFrame,
  type DecodedSpriteFrame,
  type SpriteFrameQualityExpectations,
} from "@evavo/art-quality";
import {
  PermanentRuntimeError,
  type RuntimeJobHandler,
} from "@evavo/art-runtime";

const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const DELIVERY_PROFILES = new Set<DeliveryProfileId>([
  "retro-standing-character-576",
  "retro-ui-icon-256",
  "retro-overlay-720p",
  "godot-sprite-lossless",
]);
const REQUIRED_CAPABILITIES = Object.freeze([
  "media.adaptive-finalize",
  "media.raster",
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
      "ADAPTIVE_FINALIZER_PAYLOAD_INVALID",
      `${name} must be a non-empty string.`,
    );
  }
  return value.trim();
}

function artifactId(value: JsonValue | undefined): ArtifactId {
  const result = requiredString(value, "candidateArtifactId");
  if (!ARTIFACT_ID.test(result)) {
    throw new PermanentRuntimeError(
      "ADAPTIVE_FINALIZER_ARTIFACT_ID_INVALID",
      "candidateArtifactId must use artifact_<sha256> format.",
    );
  }
  return result as ArtifactId;
}

function integer(
  value: JsonValue | undefined,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const result = value === undefined ? fallback : value;
  if (
    typeof result !== "number" ||
    !Number.isInteger(result) ||
    result < minimum ||
    result > maximum
  ) {
    throw new PermanentRuntimeError(
      "ADAPTIVE_FINALIZER_PAYLOAD_INVALID",
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return result;
}

function profileId(value: JsonValue | undefined): DeliveryProfileId {
  const result = value ?? "godot-sprite-lossless";
  if (
    typeof result !== "string" ||
    !DELIVERY_PROFILES.has(result as DeliveryProfileId)
  ) {
    throw new PermanentRuntimeError(
      "ADAPTIVE_FINALIZER_PAYLOAD_INVALID",
      "deliveryProfileId is not supported by adaptive finalization.",
    );
  }
  return result as DeliveryProfileId;
}

function proofBackgrounds(value: JsonValue | undefined): readonly string[] {
  const source =
    value === undefined
      ? ["#000000", "#ffffff", "#808080", "#00ff00", "#ff00ff"]
      : value;
  if (!Array.isArray(source) || source.length < 1 || source.length > 16) {
    throw new PermanentRuntimeError(
      "ADAPTIVE_FINALIZER_PAYLOAD_INVALID",
      "proofBackgrounds must contain 1 to 16 #RRGGBB colours.",
    );
  }
  return [
    ...new Set(
      source.map((entry, index) => {
        if (typeof entry !== "string" || !HEX.test(entry)) {
          throw new PermanentRuntimeError(
            "ADAPTIVE_FINALIZER_PAYLOAD_INVALID",
            `proofBackgrounds[${index}] must use #RRGGBB format.`,
          );
        }
        return entry.toLowerCase();
      }),
    ),
  ];
}

function qualityExpectations(
  payload: Readonly<Record<string, JsonValue>>,
  candidate: Readonly<{ labels: Readonly<Record<string, string>> }>,
): SpriteFrameQualityExpectations | unknown {
  const supplied = isRecord(payload.quality) ? payload.quality : {};
  return {
    ...supplied,
    frameId:
      typeof supplied.frameId === "string"
        ? supplied.frameId
        : typeof payload.frameId === "string"
          ? payload.frameId
          : candidate.labels.frameId ?? "adaptive-finalizer-frame",
  };
}

function safeFileStem(value: string): string {
  return (
    value
      .replace(/\.[^.]+$/, "")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 160) || "candidate"
  );
}

async function encodeFrame(frame: DecodedSpriteFrame): Promise<Buffer> {
  return sharp(Buffer.from(frame.data), {
    raw: {
      width: frame.width,
      height: frame.height,
      channels: 4,
    },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
}

function rgb(value: string): Readonly<{ r: number; g: number; b: number }> {
  return {
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16),
  };
}

async function proofSheet(
  input: Buffer,
  backgrounds: readonly string[],
  nearest: boolean,
): Promise<Readonly<{
  png: Buffer;
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  previewWidth: number;
  previewHeight: number;
}>> {
  const metadata = await sharp(input, {
    failOn: "error",
    sequentialRead: true,
  }).metadata();
  if (!metadata.width || !metadata.height) {
    throw new PermanentRuntimeError(
      "ADAPTIVE_FINALIZER_PROOF_INVALID",
      "Finalized PNG has no decoded proof dimensions.",
    );
  }
  const scale = Math.min(1, 256 / Math.max(metadata.width, metadata.height));
  const previewWidth = Math.max(1, Math.round(metadata.width * scale));
  const previewHeight = Math.max(1, Math.round(metadata.height * scale));
  const preview = await sharp(input)
    .resize(previewWidth, previewHeight, {
      fit: "fill",
      withoutEnlargement: true,
      kernel: nearest ? sharp.kernel.nearest : sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
  const padding = 8;
  const cellWidth = previewWidth + padding * 2;
  const cellHeight = previewHeight + padding * 2;
  const columns = Math.min(4, backgrounds.length);
  const rows = Math.ceil(backgrounds.length / columns);
  const tiles = await Promise.all(
    backgrounds.map(async (background, index) => {
      const colour = rgb(background);
      const tile = await sharp({
        create: {
          width: cellWidth,
          height: cellHeight,
          channels: 4,
          background: { ...colour, alpha: 1 },
        },
      })
        .composite([{ input: preview, left: padding, top: padding }])
        .png({ compressionLevel: 9, palette: false })
        .toBuffer();
      return {
        input: tile,
        left: (index % columns) * cellWidth,
        top: Math.floor(index / columns) * cellHeight,
      };
    }),
  );
  const png = await sharp({
    create: {
      width: columns * cellWidth,
      height: rows * cellHeight,
      channels: 4,
      background: { r: 24, g: 24, b: 24, alpha: 1 },
    },
  })
    .composite(tiles)
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
  return {
    png,
    columns,
    rows,
    cellWidth,
    cellHeight,
    previewWidth,
    previewHeight,
  };
}

function finalizerFailure(error: unknown): never {
  if (
    error instanceof SpriteFinalizerError ||
    error instanceof SpriteQualityInputError ||
    error instanceof DeliveryOptimizerError
  ) {
    throw new PermanentRuntimeError(error.code, error.message);
  }
  throw error;
}

function providerRepairRequired(assessment: SpriteFinalizationAssessment): boolean {
  return assessment.disposition !== "ready";
}

export function createAdaptiveFinalizerHandlers(): Readonly<
  Record<string, RuntimeJobHandler>
> {
  const finalize: RuntimeJobHandler = async (context) => {
    if (!isRecord(context.job.spec.payload)) {
      throw new PermanentRuntimeError(
        "ADAPTIVE_FINALIZER_PAYLOAD_INVALID",
        "art.candidate.finalize-adaptive payload must be an object.",
      );
    }
    const payload = context.job.spec.payload;
    const sourceId = artifactId(payload.candidateArtifactId);
    const backgrounds = proofBackgrounds(payload.proofBackgrounds);
    const deliveryProfileId = profileId(payload.deliveryProfileId);
    for (const capability of REQUIRED_CAPABILITIES) {
      if (!context.job.spec.requiredCapabilities.includes(capability)) {
        throw new PermanentRuntimeError(
          "ADAPTIVE_FINALIZER_CAPABILITY_MISSING",
          `Adaptive finalization must require ${capability}.`,
        );
      }
    }
    if (!context.job.spec.inputArtifacts.includes(sourceId)) {
      throw new PermanentRuntimeError(
        "ADAPTIVE_FINALIZER_INPUT_LINEAGE_MISSING",
        "candidateArtifactId must also be declared in inputArtifacts.",
      );
    }
    const [source, verification] = await Promise.all([
      context.artifacts.get(sourceId),
      context.artifacts.verify(sourceId),
    ]);
    if (!source || !verification.exists) {
      throw new PermanentRuntimeError(
        "ADAPTIVE_FINALIZER_SOURCE_NOT_FOUND",
        `Mastered candidate was not found: ${sourceId}`,
      );
    }
    if (!verification.descriptorValid || !verification.contentValid) {
      throw new PermanentRuntimeError(
        "ADAPTIVE_FINALIZER_SOURCE_TAMPERED",
        "Mastered candidate failed immutable descriptor or content verification.",
      );
    }
    if (
      source.storageClass !== "intermediate" ||
      source.labels.artifactRole !== "provider-candidate-alpha-master" ||
      source.labels.approvalState !== "unapproved" ||
      source.mediaType !== "image/png"
    ) {
      throw new PermanentRuntimeError(
        "ADAPTIVE_FINALIZER_SOURCE_STATE_INVALID",
        "Adaptive finalization accepts only unapproved PNG provider-candidate-alpha-master intermediates.",
      );
    }

    const sourceBytes = await context.artifacts.read(sourceId);
    let decoded: DecodedSpriteFrame;
    let result: ReturnType<typeof finalizeDecodedSpriteFrame>;
    let finalizedPng: Buffer;
    let finalResult: ReturnType<typeof finalizeDecodedSpriteFrame>;
    try {
      decoded = await decodeSpriteFrame(sourceBytes);
      const expectations = qualityExpectations(payload, source);
      result = finalizeDecodedSpriteFrame(decoded, expectations, {
        maximumPasses: integer(
          payload.maximumRepairPasses,
          "maximumRepairPasses",
          2,
          0,
          8,
        ),
        transparentBleedRadius: integer(
          payload.transparentBleedRadius,
          "transparentBleedRadius",
          2,
          0,
          16,
        ),
        matteSearchRadius: integer(
          payload.matteSearchRadius,
          "matteSearchRadius",
          6,
          1,
          32,
        ),
        matteDistanceThreshold: integer(
          payload.matteDistanceThreshold,
          "matteDistanceThreshold",
          72,
          1,
          441,
        ),
      });
      const repairedPng = result.changed
        ? await encodeFrame(result.frame)
        : Buffer.from(sourceBytes);
      const optimization = await optimizeDeliveryImage(repairedPng, {
        profileId: deliveryProfileId,
        background: { mode: "preserve" },
      });
      finalizedPng = Buffer.from(optimization.bytes);
      finalResult = finalizeDecodedSpriteFrame(
        await decodeSpriteFrame(finalizedPng),
        expectations,
        { maximumPasses: 0 },
      );
    } catch (error: unknown) {
      finalizerFailure(error);
    }

    const ready = finalResult.ready;
    const stem = safeFileStem(source.fileName ?? source.artifactId);
    const proof = await proofSheet(
      finalizedPng,
      backgrounds,
      payload.resampling === "nearest",
    );
    const proofArtifact = await context.putArtifact(proof.png, {
      mediaType: "image/png",
      storageClass: "evidence",
      fileName: `${stem}.hostile-background-proof.png`,
      sourceArtifacts: [sourceId],
      labels: {
        artifactRole: "candidate-hostile-background-proof",
        approvalState: "evidence-only",
        qualityState: ready ? "passed" : "rejected",
        sourceCandidateArtifactId: sourceId,
      },
      metadata: normalizeJson({
        schemaVersion: "1.0",
        proofBackgrounds: backgrounds,
        columns: proof.columns,
        rows: proof.rows,
        cellWidth: proof.cellWidth,
        cellHeight: proof.cellHeight,
        previewWidth: proof.previewWidth,
        previewHeight: proof.previewHeight,
      }),
    });

    const finalizedArtifact = await context.putArtifact(finalizedPng, {
      mediaType: "image/png",
      storageClass: "intermediate",
      fileName: `${stem}.adaptive-finalized.png`,
      sourceArtifacts: [sourceId, proofArtifact.artifactId],
      labels: {
        artifactRole: "provider-candidate-alpha-master",
        approvalState: "unapproved",
        qualityState: ready ? "passed" : "rejected",
        finalDeliverable: "false",
        finalizationReady: ready ? "true" : "false",
        adaptiveFinalized: "true",
        proofArtifactId: proofArtifact.artifactId,
        sourceCandidateArtifactId: sourceId,
        ...(source.labels.candidateFamilyId
          ? { candidateFamilyId: source.labels.candidateFamilyId }
          : {}),
        ...(source.labels.frameId ? { frameId: source.labels.frameId } : {}),
      },
      metadata: normalizeJson({
        schemaVersion: "1.0",
        protocolVersion: finalResult.protocolVersion,
        deliveryProfileId,
        repairPasses: result.passes.length - 1,
        changedPixels: result.changedPixels,
        disposition: finalResult.assessment.disposition,
      }),
    });

    const repairPlan = providerRepairRequired(finalResult.assessment)
      ? await context.putArtifact(
          `${JSON.stringify(
            normalizeJson({
              schemaVersion: "1.0",
              sourceCandidateArtifactId: sourceId,
              finalizedCandidateArtifactId: finalizedArtifact.artifactId,
              proofArtifactId: proofArtifact.artifactId,
              assessment: finalResult.assessment,
              deterministicPasses: result.passes,
              nextAction:
                finalResult.assessment.disposition === "provider-repair"
                  ? "Compile the smallest bounded provider edit, inpaint, matte re-extraction, or padded regeneration described by assessment.actions."
                  : "Stop for a named human review. Do not weaken quality thresholds.",
              qualityThresholdsRelaxed: false,
            }),
            null,
            2,
          )}\n`,
          {
            mediaType: "application/json",
            storageClass: "evidence",
            fileName: `${stem}.adaptive-repair-plan.json`,
            sourceArtifacts: [
              sourceId,
              finalizedArtifact.artifactId,
              proofArtifact.artifactId,
            ],
            labels: {
              artifactRole: "candidate-finalization-repair-plan",
              approvalState: "evidence-only",
              qualityState: "rejected",
              disposition: finalResult.assessment.disposition,
            },
            metadata: normalizeJson({
              failedBlockingGateIds:
                finalResult.assessment.failedBlockingGateIds,
              repairableGateIds: finalResult.assessment.repairableGateIds,
              nonRepairableGateIds:
                finalResult.assessment.nonRepairableGateIds,
            }),
          },
        )
      : undefined;

    const evidenceBody = normalizeJson({
      schemaVersion: "1.0",
      protocolVersion: finalResult.protocolVersion,
      sourceCandidateArtifactId: sourceId,
      finalizedCandidateArtifactId: finalizedArtifact.artifactId,
      proofArtifactId: proofArtifact.artifactId,
      repairPlanArtifactId: repairPlan?.artifactId ?? null,
      deliveryProfileId,
      initialAssessment: result.passes[0]!.assessment,
      deterministicRepair: {
        changed: result.changed,
        changedPixels: result.changedPixels,
        passes: result.passes,
      },
      finalReport: finalResult.report,
      finalAssessment: finalResult.assessment,
      releaseReady: ready,
      qualityThresholdsRelaxed: false,
    });
    const evidenceArtifact = await context.putArtifact(
      `${JSON.stringify(evidenceBody, null, 2)}\n`,
      {
        mediaType: "application/json",
        storageClass: "evidence",
        fileName: `${stem}.adaptive-finalization.evidence.json`,
        sourceArtifacts: [
          sourceId,
          finalizedArtifact.artifactId,
          proofArtifact.artifactId,
          ...(repairPlan ? [repairPlan.artifactId] : []),
        ],
        labels: {
          artifactRole: "candidate-adaptive-finalization-evidence",
          approvalState: "evidence-only",
          qualityState: ready ? "passed" : "rejected",
          finalizationReady: ready ? "true" : "false",
        },
        metadata: normalizeJson({
          deliveryProfileId,
          repairPassCount: result.passes.length - 1,
          changedPixels: result.changedPixels,
          disposition: finalResult.assessment.disposition,
        }),
      },
    );

    if (!ready) {
      throw new PermanentRuntimeError(
        "ADAPTIVE_FINALIZER_REPAIR_REQUIRED",
        "The candidate remains outside the release contract after bounded deterministic repair.",
        normalizeJson({
          sourceCandidateArtifactId: sourceId,
          finalizedCandidateArtifactId: finalizedArtifact.artifactId,
          proofArtifactId: proofArtifact.artifactId,
          evidenceArtifactId: evidenceArtifact.artifactId,
          repairPlanArtifactId: repairPlan?.artifactId ?? null,
          disposition: finalResult.assessment.disposition,
          failedBlockingGateIds:
            finalResult.assessment.failedBlockingGateIds,
        }),
      );
    }

    return {
      outputArtifacts: [
        finalizedArtifact.artifactId,
        proofArtifact.artifactId,
        evidenceArtifact.artifactId,
      ],
      result: normalizeJson({
        schemaVersion: "1.0",
        sourceCandidateArtifactId: sourceId,
        finalizedCandidateArtifactId: finalizedArtifact.artifactId,
        proofArtifactId: proofArtifact.artifactId,
        evidenceArtifactId: evidenceArtifact.artifactId,
        releaseReady: true,
        changed: result.changed,
        changedPixels: result.changedPixels,
        repairPassCount: result.passes.length - 1,
        deliveryProfileId,
      }),
    };
  };

  return Object.freeze({
    "art.candidate.finalize-adaptive": finalize,
  });
}

export function adaptiveFinalizerWorkerCapabilities(): readonly string[] {
  return [...REQUIRED_CAPABILITIES];
}
