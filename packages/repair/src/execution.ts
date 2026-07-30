import {
  normalizeJson,
  sha256,
  stableStringify,
  type ArtifactId,
  type ArtifactStore,
  type JsonValue,
  type StoredArtifact,
} from "@evavo/art-artifacts";
import {
  ProviderCanvasError,
  preparePixelArtProviderCanvas,
  restorePixelArtProviderCanvas,
} from "@evavo/art-provider-canvas";
import {
  ProviderError,
  executeProviderCandidateRequest,
  validateProviderCandidateRequest,
  type NormalizedProviderCandidateRequest,
  type ProviderCandidateReferenceInput,
} from "@evavo/art-providers";

import {
  TARGETED_REPAIR_PROTOCOL_VERSION,
  TargetedRepairError,
  type ExecuteTargetedRepairOptions,
  type NormalizedTargetedRepairExecutionRequest,
  type TargetedRepairExecutionRequestInput,
  type TargetedRepairExecutionResult,
  type TargetedRepairPacket,
  type TargetedRepairProviderCanvasOptions,
  type TargetedRepairRestoredCandidate,
} from "./types.js";

const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const EXECUTION_OPTION_KEYS = new Set([
  "providerWidth",
  "providerHeight",
  "contentMarginPixels",
  "requireBinaryMask",
  "restorationSampling",
  "paletteMode",
  "alphaMode",
  "maximumPaletteColours",
  "maximumInputBytes",
  "maximumSourcePixels",
  "maximumProviderPixels",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string, details?: JsonValue): never {
  throw new TargetedRepairError(
    "TARGETED_REPAIR_EXECUTION_REQUEST_INVALID",
    message,
    details,
  );
}

function artifactId(value: unknown, name: string): ArtifactId {
  if (typeof value !== "string" || !ARTIFACT_ID.test(value)) {
    fail(`${name} must use artifact_<sha256> format.`);
  }
  return value as ArtifactId;
}

function optionalInteger(
  value: unknown,
  name: string,
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value)) fail(`${name} must be an integer.`);
  return value as number;
}

function providerCanvasOptions(value: unknown): TargetedRepairProviderCanvasOptions {
  if (value === undefined) return {};
  if (!isRecord(value)) fail("providerCanvas must be an object when supplied.");
  const unknownKeys = Object.keys(value).filter(
    (key) => !EXECUTION_OPTION_KEYS.has(key),
  );
  if (unknownKeys.length) {
    fail(`providerCanvas contains unsupported keys: ${unknownKeys.sort().join(", ")}.`);
  }
  const requireBinaryMask = value.requireBinaryMask;
  if (
    requireBinaryMask !== undefined &&
    typeof requireBinaryMask !== "boolean"
  ) {
    fail("providerCanvas.requireBinaryMask must be boolean.");
  }
  const restorationSampling = value.restorationSampling;
  if (
    restorationSampling !== undefined &&
    restorationSampling !== "nearest-center" &&
    restorationSampling !== "block-average"
  ) {
    fail(
      "providerCanvas.restorationSampling must be nearest-center or block-average.",
    );
  }
  const paletteMode = value.paletteMode;
  if (
    paletteMode !== undefined &&
    paletteMode !== "source" &&
    paletteMode !== "none"
  ) {
    fail("providerCanvas.paletteMode must be source or none.");
  }
  const alphaMode = value.alphaMode;
  if (
    alphaMode !== undefined &&
    alphaMode !== "source" &&
    alphaMode !== "candidate"
  ) {
    fail("providerCanvas.alphaMode must be source or candidate.");
  }
  const providerWidth = optionalInteger(
    value.providerWidth,
    "providerCanvas.providerWidth",
  );
  const providerHeight = optionalInteger(
    value.providerHeight,
    "providerCanvas.providerHeight",
  );
  const contentMarginPixels = optionalInteger(
    value.contentMarginPixels,
    "providerCanvas.contentMarginPixels",
  );
  const maximumPaletteColours = optionalInteger(
    value.maximumPaletteColours,
    "providerCanvas.maximumPaletteColours",
  );
  const maximumInputBytes = optionalInteger(
    value.maximumInputBytes,
    "providerCanvas.maximumInputBytes",
  );
  const maximumSourcePixels = optionalInteger(
    value.maximumSourcePixels,
    "providerCanvas.maximumSourcePixels",
  );
  const maximumProviderPixels = optionalInteger(
    value.maximumProviderPixels,
    "providerCanvas.maximumProviderPixels",
  );
  return {
    ...(providerWidth === undefined ? {} : { providerWidth }),
    ...(providerHeight === undefined ? {} : { providerHeight }),
    ...(contentMarginPixels === undefined ? {} : { contentMarginPixels }),
    ...(requireBinaryMask === undefined ? {} : { requireBinaryMask }),
    ...(restorationSampling === undefined ? {} : { restorationSampling }),
    ...(paletteMode === undefined ? {} : { paletteMode }),
    ...(alphaMode === undefined ? {} : { alphaMode }),
    ...(maximumPaletteColours === undefined
      ? {}
      : { maximumPaletteColours }),
    ...(maximumInputBytes === undefined ? {} : { maximumInputBytes }),
    ...(maximumSourcePixels === undefined ? {} : { maximumSourcePixels }),
    ...(maximumProviderPixels === undefined ? {} : { maximumProviderPixels }),
  };
}

export function validateTargetedRepairExecutionRequest(
  input: TargetedRepairExecutionRequestInput | unknown,
): NormalizedTargetedRepairExecutionRequest {
  if (!isRecord(input)) fail("Targeted repair execution request must be an object.");
  if (input.schemaVersion !== "1.0") fail('schemaVersion must be "1.0".');
  return {
    schemaVersion: "1.0",
    protocolVersion: TARGETED_REPAIR_PROTOCOL_VERSION,
    repairPacketArtifactId: artifactId(
      input.repairPacketArtifactId,
      "repairPacketArtifactId",
    ),
    providerCanvas: providerCanvasOptions(input.providerCanvas),
  };
}

async function verifiedArtifact(
  artifacts: ArtifactStore,
  id: ArtifactId,
  role: string,
): Promise<StoredArtifact> {
  const [artifact, verification] = await Promise.all([
    artifacts.get(id),
    artifacts.verify(id),
  ]);
  if (!artifact || !verification.exists) {
    throw new TargetedRepairError(
      "TARGETED_REPAIR_EXECUTION_ARTIFACT_NOT_FOUND",
      `${role} artifact was not found: ${id}`,
    );
  }
  if (!verification.descriptorValid || !verification.contentValid) {
    throw new TargetedRepairError(
      "TARGETED_REPAIR_EXECUTION_ARTIFACT_INVALID",
      `${role} artifact failed immutable verification: ${id}`,
    );
  }
  return artifact;
}

function parsePacket(value: unknown): TargetedRepairPacket {
  if (
    !isRecord(value) ||
    value.schemaVersion !== "1.0" ||
    value.protocolVersion !== TARGETED_REPAIR_PROTOCOL_VERSION ||
    typeof value.repairId !== "string" ||
    typeof value.familyId !== "string" ||
    typeof value.disposition !== "string" ||
    !isRecord(value.target) ||
    !Array.isArray(value.mutableArtifactIds) ||
    !Array.isArray(value.protectedArtifactIds)
  ) {
    throw new TargetedRepairError(
      "TARGETED_REPAIR_EXECUTION_PACKET_INVALID",
      "Repair packet is missing required protocol fields.",
    );
  }
  return value as unknown as TargetedRepairPacket;
}

async function readPacket(
  artifacts: ArtifactStore,
  id: ArtifactId,
): Promise<Readonly<{ artifact: StoredArtifact; packet: TargetedRepairPacket }>> {
  const artifact = await verifiedArtifact(artifacts, id, "repair packet");
  if (
    artifact.mediaType !== "application/json" ||
    artifact.storageClass !== "evidence" ||
    artifact.labels.artifactRole !== "targeted-repair-packet"
  ) {
    throw new TargetedRepairError(
      "TARGETED_REPAIR_EXECUTION_PACKET_ROLE_INVALID",
      "repairPacketArtifactId must reference targeted-repair-packet evidence JSON.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse((await artifacts.read(id)).toString("utf8"));
  } catch (error: unknown) {
    throw new TargetedRepairError(
      "TARGETED_REPAIR_EXECUTION_PACKET_JSON_INVALID",
      `Repair packet could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const packet = parsePacket(parsed);
  if (packet.disposition !== "ready" || !packet.providerPlan) {
    throw new TargetedRepairError(
      "TARGETED_REPAIR_EXECUTION_PACKET_NOT_READY",
      "Only a ready repair packet with a provider plan may execute.",
      normalizeJson({
        disposition: packet.disposition,
        blockers: packet.blockers,
      }),
    );
  }
  return { artifact, packet };
}

function requiredReference(
  request: NormalizedProviderCandidateRequest,
  role: "base-image" | "mask",
): ProviderCandidateReferenceInput {
  const reference = request.references.find((entry) => entry.role === role);
  if (!reference) {
    throw new TargetedRepairError(
      "TARGETED_REPAIR_EXECUTION_REFERENCE_MISSING",
      `Repair provider plan is missing ${role}.`,
    );
  }
  return reference;
}

function nowIso(now: () => Date): string {
  const value = now();
  if (!Number.isFinite(value.getTime())) {
    throw new TargetedRepairError(
      "TARGETED_REPAIR_EXECUTION_CLOCK_INVALID",
      "Repair execution clock returned an invalid date.",
    );
  }
  return value.toISOString();
}

function providerRequestForCanvas(
  packet: TargetedRepairPacket,
  providerBaseArtifactId: ArtifactId,
  providerMaskArtifactId: ArtifactId,
  providerManifestArtifactId: ArtifactId,
  width: number,
  height: number,
): NormalizedProviderCandidateRequest {
  const original = packet.providerPlan!.request;
  const references = original.references.map((reference) => {
    if (reference.role === "base-image") {
      return { ...reference, artifactId: providerBaseArtifactId };
    }
    if (reference.role === "mask") {
      return { ...reference, artifactId: providerMaskArtifactId };
    }
    return reference;
  });
  return validateProviderCandidateRequest({
    schemaVersion: "1.0",
    requestId: `${packet.repairId}:provider-canvas`,
    operation: original.operation,
    assetKind: original.assetKind,
    continuityPhase: original.continuityPhase,
    assetId: original.assetId,
    candidateFamilyId: `${original.candidateFamilyId}:provider-canvas`,
    ...(original.frameId === undefined ? {} : { frameId: original.frameId }),
    ...(original.layerId === undefined ? {} : { layerId: original.layerId }),
    creativeIntent: `${original.creativeIntent} Work on the integer-scaled provider canvas. Preserve hard pixel-block boundaries and do not alter protected mask regions.`,
    ...(original.negativeIntent === undefined
      ? {}
      : { negativeIntent: original.negativeIntent }),
    style: original.style,
    shot: original.shot,
    target: original.target,
    sourceCanvas: { width, height },
    background: original.background,
    quality: original.quality,
    candidateCount: original.candidateCount,
    ...(original.seed === undefined ? {} : { seed: original.seed }),
    references,
    selection: original.selection,
    metadata: {
      ...(isRecord(original.metadata) ? original.metadata : {}),
      targetedRepairPacketArtifactId: packet.familyEvidenceArtifactId,
      providerCanvasManifestArtifactId,
      providerCanvasSourceWidth: original.target.width,
      providerCanvasSourceHeight: original.target.height,
      providerCanvasWidth: width,
      providerCanvasHeight: height,
    },
  });
}

function executionRequestSha256(
  request: NormalizedTargetedRepairExecutionRequest,
): string {
  return sha256(stableStringify(normalizeJson(request)));
}

function wrapExecutionError(error: unknown): never {
  if (
    error instanceof TargetedRepairError ||
    error instanceof ProviderError ||
    error instanceof ProviderCanvasError
  ) {
    throw error;
  }
  throw new TargetedRepairError(
    "TARGETED_REPAIR_EXECUTION_FAILED",
    error instanceof Error ? error.message : String(error),
  );
}

export async function executeTargetedRepairProviderCanvas(
  input: TargetedRepairExecutionRequestInput | unknown,
  options: ExecuteTargetedRepairOptions,
): Promise<TargetedRepairExecutionResult> {
  try {
    if (options.signal.aborted) {
      throw new ProviderError(
        "PROVIDER_EXECUTION_CANCELLED",
        "Targeted repair execution was cancelled before it began.",
        "cancelled",
      );
    }
    const request = validateTargetedRepairExecutionRequest(input);
    const now = options.now ?? (() => new Date());
    const startedAt = nowIso(now);
    const packetRecord = await readPacket(
      options.artifacts,
      request.repairPacketArtifactId,
    );
    const packet = packetRecord.packet;
    const originalProviderRequest = packet.providerPlan!.request;
    if (originalProviderRequest.operation !== "inpaint") {
      throw new TargetedRepairError(
        "TARGETED_REPAIR_EXECUTION_OPERATION_INVALID",
        "Pixel-safe repair execution requires an inpaint provider plan.",
      );
    }
    if (
      originalProviderRequest.background.strategy !== "chroma-key" ||
      !originalProviderRequest.background.matteColour
    ) {
      throw new TargetedRepairError(
        "TARGETED_REPAIR_EXECUTION_MATTE_REQUIRED",
        "Pixel-safe repair execution requires a declared chroma-key matte.",
      );
    }
    const baseReference = requiredReference(originalProviderRequest, "base-image");
    const maskReference = requiredReference(originalProviderRequest, "mask");
    const declaredInputs = new Set(packet.providerPlan!.inputArtifacts);
    if (
      !declaredInputs.has(baseReference.artifactId) ||
      !declaredInputs.has(maskReference.artifactId)
    ) {
      throw new TargetedRepairError(
        "TARGETED_REPAIR_EXECUTION_INPUT_LINEAGE_MISSING",
        "Repair provider plan does not declare its base and mask artifacts.",
      );
    }
    await Promise.all(
      packet.providerPlan!.inputArtifacts.map((id) =>
        verifiedArtifact(options.artifacts, id, "repair provider input"),
      ),
    );
    const [sourceBase, sourceMask] = await Promise.all([
      options.artifacts.read(baseReference.artifactId),
      options.artifacts.read(maskReference.artifactId),
    ]);
    const prepared = await preparePixelArtProviderCanvas(
      sourceBase,
      sourceMask,
      {
        matteColour: originalProviderRequest.background.matteColour,
        alphaMode: "source",
        ...request.providerCanvas,
      },
    );
    const commonSources = [
      request.repairPacketArtifactId,
      baseReference.artifactId,
      maskReference.artifactId,
    ] as const;
    const providerBase = await options.artifacts.put(prepared.basePng, {
      mediaType: "image/png",
      storageClass: "intermediate",
      fileName: `${packet.repairId}.provider-canvas.base.png`,
      sourceArtifacts: commonSources,
      labels: {
        artifactRole: "targeted-repair-provider-canvas-base",
        approvalState: "unapproved",
        finalDeliverable: "false",
        repairId: packet.repairId,
      },
      metadata: normalizeJson({
        providerCanvas: prepared.manifest.provider,
        source: prepared.manifest.source,
      }),
    });
    const providerMask = await options.artifacts.put(prepared.maskPng, {
      mediaType: "image/png",
      storageClass: "intermediate",
      fileName: `${packet.repairId}.provider-canvas.mask.png`,
      sourceArtifacts: commonSources,
      labels: {
        artifactRole: "targeted-repair-provider-canvas-mask",
        approvalState: "unapproved",
        finalDeliverable: "false",
        repairId: packet.repairId,
      },
      metadata: normalizeJson({
        providerCanvas: prepared.manifest.provider,
        mask: prepared.manifest.mask,
      }),
    });
    const manifestBody = normalizeJson(prepared.manifest);
    const providerManifest = await options.artifacts.put(
      `${JSON.stringify(manifestBody, null, 2)}\n`,
      {
        mediaType: "application/json",
        storageClass: "manifest",
        fileName: `${packet.repairId}.provider-canvas.manifest.json`,
        sourceArtifacts: [
          ...commonSources,
          providerBase.artifactId,
          providerMask.artifactId,
        ],
        labels: {
          artifactRole: "targeted-repair-provider-canvas-manifest",
          approvalState: "evidence-only",
          repairId: packet.repairId,
        },
        metadata: normalizeJson({
          manifestSha256: sha256(stableStringify(manifestBody)),
          providerSize: prepared.manifest.provider.size,
          alphaMode: prepared.manifest.restoration.alphaMode,
        }),
      },
    );
    const providerRequest = providerRequestForCanvas(
      packet,
      providerBase.artifactId,
      providerMask.artifactId,
      providerManifest.artifactId,
      prepared.manifest.provider.width,
      prepared.manifest.provider.height,
    );
    const providerRun = await executeProviderCandidateRequest(providerRequest, {
      registry: options.registry,
      artifacts: options.artifacts,
      signal: options.signal,
      now,
    });
    const restoredCandidates: TargetedRepairRestoredCandidate[] = [];
    for (const [index, providerCandidateArtifactId] of
      providerRun.candidateArtifacts.entries()) {
      if (options.signal.aborted) {
        throw new ProviderError(
          "PROVIDER_EXECUTION_CANCELLED",
          "Targeted repair execution was cancelled during restoration.",
          "cancelled",
        );
      }
      const providerCandidate = await verifiedArtifact(
        options.artifacts,
        providerCandidateArtifactId,
        `provider candidate ${index + 1}`,
      );
      if (!providerCandidate.mediaType.startsWith("image/")) {
        throw new TargetedRepairError(
          "TARGETED_REPAIR_EXECUTION_CANDIDATE_MEDIA_INVALID",
          "Provider repair candidate must contain image bytes.",
        );
      }
      const restoration = await restorePixelArtProviderCanvas(
        sourceBase,
        sourceMask,
        await options.artifacts.read(providerCandidateArtifactId),
        prepared.manifest,
      );
      if (!restoration.evidence.protectedExact) {
        throw new TargetedRepairError(
          "TARGETED_REPAIR_EXECUTION_PROTECTED_PIXELS_CHANGED",
          "Provider canvas restoration did not preserve every protected pixel.",
        );
      }
      const restored = await options.artifacts.put(restoration.png, {
        mediaType: "image/png",
        storageClass: "intermediate",
        fileName: `${packet.repairId}.restored-${String(index + 1).padStart(2, "0")}.png`,
        sourceArtifacts: [
          request.repairPacketArtifactId,
          baseReference.artifactId,
          maskReference.artifactId,
          providerBase.artifactId,
          providerMask.artifactId,
          providerManifest.artifactId,
          providerCandidateArtifactId,
          providerRun.evidenceArtifact,
        ],
        labels: {
          artifactRole: "targeted-repair-restored-candidate",
          approvalState: "unapproved",
          qualityState: "unverified",
          finalDeliverable: "false",
          repairId: packet.repairId,
          candidateIndex: String(index + 1),
          frameId: packet.target.frameId,
          ...(packet.target.layerId
            ? { layerId: packet.target.layerId }
            : {}),
        },
        metadata: normalizeJson({
          providerCandidateArtifactId,
          providerCanvasManifestArtifactId: providerManifest.artifactId,
          restoration: restoration.evidence,
          requiresFamilyReverification: true,
          requiresSelection: true,
          requiresPromotion: true,
        }),
      });
      const restorationEvidence = await options.artifacts.put(
        `${JSON.stringify(normalizeJson(restoration.evidence), null, 2)}\n`,
        {
          mediaType: "application/json",
          storageClass: "evidence",
          fileName: `${packet.repairId}.restored-${String(index + 1).padStart(2, "0")}.evidence.json`,
          sourceArtifacts: [
            providerCandidateArtifactId,
            restored.artifactId,
            providerManifest.artifactId,
          ],
          labels: {
            artifactRole: "targeted-repair-restoration-evidence",
            approvalState: "evidence-only",
            repairId: packet.repairId,
            candidateIndex: String(index + 1),
            protectedExact: String(restoration.evidence.protectedExact),
          },
          metadata: normalizeJson({
            restoredPngSha256: restoration.evidence.restoredPngSha256,
            protectedChannelMismatches:
              restoration.evidence.protectedChannelMismatches,
            alphaMode: restoration.evidence.alphaMode,
          }),
        },
      );
      restoredCandidates.push({
        providerCandidateArtifactId,
        restoredCandidateArtifactId: restored.artifactId,
        restorationEvidenceArtifactId: restorationEvidence.artifactId,
        restoration: restoration.evidence,
      });
    }
    const completedAt = nowIso(now);
    const executionEvidenceBody = normalizeJson({
      schemaVersion: "1.0",
      protocolVersion: TARGETED_REPAIR_PROTOCOL_VERSION,
      repairId: packet.repairId,
      request,
      requestSha256: executionRequestSha256(request),
      repairPacketArtifactId: request.repairPacketArtifactId,
      providerRequest,
      providerCanvasBaseArtifactId: providerBase.artifactId,
      providerCanvasMaskArtifactId: providerMask.artifactId,
      providerCanvasManifestArtifactId: providerManifest.artifactId,
      providerEvidenceArtifactId: providerRun.evidenceArtifact,
      restoredCandidates,
      startedAt,
      completedAt,
      approvalState: "unapproved",
      finalDeliverable: false,
      nextRequiredStages: [
        "manifest-update",
        "family-reverify",
        "candidate-select",
        "candidate-promote",
      ],
    });
    const executionEvidence = await options.artifacts.put(
      `${JSON.stringify(executionEvidenceBody, null, 2)}\n`,
      {
        mediaType: "application/json",
        storageClass: "evidence",
        fileName: `${packet.repairId}.provider-canvas-execution.json`,
        sourceArtifacts: [
          request.repairPacketArtifactId,
          providerBase.artifactId,
          providerMask.artifactId,
          providerManifest.artifactId,
          providerRun.evidenceArtifact,
          ...restoredCandidates.flatMap((candidate) => [
            candidate.providerCandidateArtifactId,
            candidate.restoredCandidateArtifactId,
            candidate.restorationEvidenceArtifactId,
          ]),
        ],
        labels: {
          artifactRole: "targeted-repair-execution-evidence",
          approvalState: "evidence-only",
          repairId: packet.repairId,
          outcome: "candidates-restored",
        },
        metadata: normalizeJson({
          requestSha256: executionRequestSha256(request),
          candidateCount: restoredCandidates.length,
          allProtectedExact: restoredCandidates.every(
            (candidate) => candidate.restoration.protectedExact,
          ),
        }),
      },
    );
    return {
      schemaVersion: "1.0",
      protocolVersion: TARGETED_REPAIR_PROTOCOL_VERSION,
      repairId: packet.repairId,
      repairPacketArtifactId: request.repairPacketArtifactId,
      providerCanvasBaseArtifactId: providerBase.artifactId,
      providerCanvasMaskArtifactId: providerMask.artifactId,
      providerCanvasManifestArtifactId: providerManifest.artifactId,
      providerCanvasManifest: prepared.manifest,
      providerEvidenceArtifactId: providerRun.evidenceArtifact,
      restoredCandidates,
      executionEvidenceArtifactId: executionEvidence.artifactId,
    };
  } catch (error: unknown) {
    wrapExecutionError(error);
  }
}
