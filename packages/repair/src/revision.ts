import {
  normalizeJson,
  type ArtifactId,
  type ArtifactStore,
  type StoredArtifact,
} from "@evavo/art-artifacts";
import {
  analyseDecodedSpriteFrame,
  decodeSpriteFrame,
  SpriteQualityInputError,
  type SpriteFrameQualityReport,
} from "@evavo/art-quality";
import { decodeSelectionImage } from "@evavo/art-selection";
import {
  renderSpriteComposite,
  spriteFamilyManifestSha256,
  SpriteFamilyError,
  validateSpriteFamilyManifest,
  verifySpriteFamily,
  type ManifestBoundSpriteFamilyRunResult,
  type NormalizedSpriteFamilyFrame,
  type NormalizedSpriteFamilyManifest,
  type ResolvedSpriteLayer,
  type SpriteLayerRole,
  type SpriteLayerSourcePolicy,
} from "@evavo/art-sprite-family";

import {
  REPAIRED_FAMILY_REVISION_PROTOCOL_VERSION,
  RepairedFamilyRevisionError,
  type NormalizedRepairedFamilyRevisionRequest,
  type RepairedFamilyRevisionEvidence,
  type RepairedFamilyRevisionOptions,
  type RepairedFamilyRevisionReplacement,
  type RepairedFamilyRevisionRequestInput,
  type RepairedFamilyRevisionResult,
} from "./revision-types.js";
import {
  repairedFamilyRevisionRequestSha256,
  validateRepairedFamilyRevisionRequest,
} from "./revision-validation.js";
import {
  TARGETED_REPAIR_PROTOCOL_VERSION,
  type TargetedRepairPacket,
} from "./types.js";

const IMAGE_MEDIA_TYPES = new Set(["image/png", "image/webp", "image/jpeg"]);

interface LayerRepairPacket extends TargetedRepairPacket {
  readonly target: Readonly<{
    frameId: string;
    layerId: string;
    layerRole: SpriteLayerRole;
    sourcePolicy: SpriteLayerSourcePolicy;
    baseArtifactId: ArtifactId;
  }>;
  readonly sourceEvidence: TargetedRepairPacket["sourceEvidence"] &
    Readonly<{ manifestArtifactId: ArtifactId }>;
}

interface RepairExecutionEvidence {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof TARGETED_REPAIR_PROTOCOL_VERSION;
  readonly repairId: string;
  readonly repairPacketArtifactId: ArtifactId;
  readonly restoredCandidates: readonly Readonly<{
    providerCandidateArtifactId: ArtifactId;
    restoredCandidateArtifactId: ArtifactId;
    restorationEvidenceArtifactId: ArtifactId;
  }>[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function nowIso(now: () => Date): string {
  const value = now();
  if (!Number.isFinite(value.getTime())) {
    throw new RepairedFamilyRevisionError(
      "REPAIRED_FAMILY_REVISION_CLOCK_INVALID",
      "Repaired family revision clock returned an invalid date.",
    );
  }
  return value.toISOString();
}

async function verifiedArtifact(
  artifacts: ArtifactStore,
  artifactId: ArtifactId,
  role: string,
): Promise<StoredArtifact> {
  const [artifact, verification] = await Promise.all([
    artifacts.get(artifactId),
    artifacts.verify(artifactId),
  ]);
  if (!artifact || !verification.exists) {
    throw new RepairedFamilyRevisionError(
      "REPAIRED_FAMILY_REVISION_ARTIFACT_NOT_FOUND",
      `${role} artifact was not found: ${artifactId}`,
    );
  }
  if (!verification.descriptorValid || !verification.contentValid) {
    throw new RepairedFamilyRevisionError(
      "REPAIRED_FAMILY_REVISION_ARTIFACT_VERIFICATION_FAILED",
      `${role} artifact failed immutable descriptor or content verification: ${artifactId}`,
    );
  }
  return artifact;
}

async function readJson(
  artifacts: ArtifactStore,
  artifact: StoredArtifact,
  role: string,
): Promise<unknown> {
  if (artifact.mediaType !== "application/json") {
    throw new RepairedFamilyRevisionError(
      "REPAIRED_FAMILY_REVISION_JSON_REQUIRED",
      `${role} must contain application/json evidence.`,
    );
  }
  try {
    return JSON.parse((await artifacts.read(artifact.artifactId)).toString("utf8"));
  } catch (error: unknown) {
    throw new RepairedFamilyRevisionError(
      "REPAIRED_FAMILY_REVISION_JSON_INVALID",
      `${role} could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function parsePacket(value: unknown): LayerRepairPacket {
  if (
    !isRecord(value) ||
    value.schemaVersion !== "1.0" ||
    value.protocolVersion !== TARGETED_REPAIR_PROTOCOL_VERSION ||
    typeof value.repairId !== "string" ||
    typeof value.familyId !== "string" ||
    typeof value.familyManifestSha256 !== "string" ||
    value.disposition !== "ready" ||
    !isRecord(value.target) ||
    typeof value.target.frameId !== "string" ||
    typeof value.target.layerId !== "string" ||
    typeof value.target.layerRole !== "string" ||
    typeof value.target.sourcePolicy !== "string" ||
    typeof value.target.baseArtifactId !== "string" ||
    !Array.isArray(value.impactedFrameIds) ||
    !isRecord(value.sourceEvidence) ||
    typeof value.sourceEvidence.manifestArtifactId !== "string"
  ) {
    throw new RepairedFamilyRevisionError(
      "REPAIRED_FAMILY_REVISION_PACKET_INVALID",
      "Repair packet must be a ready, manifest-bound, layer-targeted packet.",
    );
  }
  return value as unknown as LayerRepairPacket;
}

function parseExecutionEvidence(value: unknown): RepairExecutionEvidence {
  if (
    !isRecord(value) ||
    value.schemaVersion !== "1.0" ||
    value.protocolVersion !== TARGETED_REPAIR_PROTOCOL_VERSION ||
    typeof value.repairId !== "string" ||
    typeof value.repairPacketArtifactId !== "string" ||
    !Array.isArray(value.restoredCandidates)
  ) {
    throw new RepairedFamilyRevisionError(
      "REPAIRED_FAMILY_REVISION_EXECUTION_EVIDENCE_INVALID",
      "Repair execution evidence is missing required protocol or candidate fields.",
    );
  }
  for (const [index, candidate] of value.restoredCandidates.entries()) {
    if (
      !isRecord(candidate) ||
      typeof candidate.providerCandidateArtifactId !== "string" ||
      typeof candidate.restoredCandidateArtifactId !== "string" ||
      typeof candidate.restorationEvidenceArtifactId !== "string"
    ) {
      throw new RepairedFamilyRevisionError(
        "REPAIRED_FAMILY_REVISION_EXECUTION_EVIDENCE_INVALID",
        `restoredCandidates[${index}] is invalid.`,
      );
    }
  }
  return value as unknown as RepairExecutionEvidence;
}

function manifestBound(
  result: Awaited<ReturnType<typeof verifySpriteFamily>>,
): ManifestBoundSpriteFamilyRunResult {
  if (
    !result.manifestArtifactId ||
    !result.kernelEvidenceArtifactId ||
    !result.evidence.manifestArtifactId ||
    !result.evidence.kernelEvidenceArtifactId ||
    result.manifestArtifactId !== result.evidence.manifestArtifactId ||
    result.kernelEvidenceArtifactId !== result.evidence.kernelEvidenceArtifactId
  ) {
    throw new RepairedFamilyRevisionError(
      "REPAIRED_FAMILY_REVISION_MANIFEST_BOUND_RESULT_REQUIRED",
      "Family verifier did not return a complete manifest-bound evidence envelope.",
    );
  }
  return result as ManifestBoundSpriteFamilyRunResult;
}

function targetLayerEvidence(packet: LayerRepairPacket) {
  const frame = packet.sourceEvidence.frameEvidence.find(
    (entry) => entry.frameId === packet.target.frameId,
  );
  const layer = frame?.layers.find((entry) => entry.layerId === packet.target.layerId);
  if (!frame || !layer) {
    throw new RepairedFamilyRevisionError(
      "REPAIRED_FAMILY_REVISION_TARGET_EVIDENCE_MISSING",
      "Repair packet source evidence does not contain the target frame and layer.",
    );
  }
  return layer;
}

function exactSet(left: readonly string[], right: readonly string[]): boolean {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function revisedFrame(
  frame: NormalizedSpriteFamilyFrame,
  layerId: string,
  replacementArtifactId: ArtifactId,
  declaredCompositeArtifactId: ArtifactId,
): NormalizedSpriteFamilyFrame {
  return {
    ...frame,
    layers: frame.layers.map((layer) =>
      layer.layerId === layerId
        ? { ...layer, artifactId: replacementArtifactId }
        : layer,
    ),
    declaredCompositeArtifactId,
  };
}

async function frameQuality(
  bytes: Buffer,
  frameId: string,
  width: number,
  height: number,
  request: NormalizedRepairedFamilyRevisionRequest,
  safePadding: number,
): Promise<SpriteFrameQualityReport> {
  try {
    return analyseDecodedSpriteFrame(await decodeSpriteFrame(bytes), {
      frameId,
      transparency: request.quality.transparency,
      expectedWidth: width,
      expectedHeight: height,
      expectedFormat: "png",
      safePadding,
      alphaVisibleThreshold: request.quality.alphaVisibleThreshold,
      knownMatteColours: request.quality.knownMatteColours,
      flatMatteBorderThreshold: request.quality.flatMatteBorderThreshold,
      checkerboardConfidenceThreshold:
        request.quality.checkerboardConfidenceThreshold,
      maximumHaloFraction: request.quality.maximumHaloFraction,
      maximumUnexpectedTransparentRgbFraction:
        request.quality.maximumUnexpectedTransparentRgbFraction,
    });
  } catch (error: unknown) {
    if (error instanceof SpriteQualityInputError) {
      throw new RepairedFamilyRevisionError(
        "REPAIRED_FAMILY_REVISION_QUALITY_INPUT_INVALID",
        error.message,
        { qualityCode: error.code, frameId },
      );
    }
    throw error;
  }
}

async function storeQualityEvidence(
  artifacts: ArtifactStore,
  report: SpriteFrameQualityReport,
  sourceArtifacts: readonly ArtifactId[],
  fileName: string,
  labels: Readonly<Record<string, string>>,
): Promise<StoredArtifact> {
  return artifacts.put(`${JSON.stringify(normalizeJson(report), null, 2)}\n`, {
    mediaType: "application/json",
    storageClass: "evidence",
    fileName,
    sourceArtifacts,
    labels: {
      artifactRole: "repaired-family-frame-quality-evidence",
      approvalState: "evidence-only",
      qualityState: report.passed ? "passed" : "rejected",
      ...labels,
    },
    metadata: normalizeJson({
      schemaVersion: report.schemaVersion,
      frameId: report.frameId,
      rawRgbaSha256: report.rawRgbaSha256,
      passed: report.passed,
      blockingFailureCount: report.gates.filter(
        (gate) => gate.blocking && gate.status === "fail",
      ).length,
    }),
  });
}

async function resolvedLayers(
  manifest: NormalizedSpriteFamilyManifest,
  frame: NormalizedSpriteFamilyFrame,
  artifacts: ArtifactStore,
): Promise<readonly ResolvedSpriteLayer[]> {
  const definitions = new Map(
    manifest.layerDefinitions.map((definition) => [definition.id, definition]),
  );
  return Promise.all(
    frame.layers.map(async (instance) => {
      const definition = definitions.get(instance.layerId);
      if (!definition) {
        throw new RepairedFamilyRevisionError(
          "REPAIRED_FAMILY_REVISION_LAYER_DEFINITION_MISSING",
          `${frame.id}.${instance.layerId} has no layer definition.`,
        );
      }
      const artifact = await verifiedArtifact(
        artifacts,
        instance.artifactId,
        `${frame.id}.${instance.layerId}`,
      );
      if (!IMAGE_MEDIA_TYPES.has(artifact.mediaType)) {
        throw new RepairedFamilyRevisionError(
          "REPAIRED_FAMILY_REVISION_LAYER_MEDIA_INVALID",
          `${frame.id}.${instance.layerId} must contain a supported raster image.`,
        );
      }
      const features = await decodeSelectionImage(
        await artifacts.read(artifact.artifactId),
        {
          alphaVisibleThreshold: manifest.policy.alphaVisibleThreshold,
          maximumInputBytes: manifest.policy.maximumInputBytes,
          maximumPixels: manifest.policy.maximumPixels,
        },
      );
      if (features.encodedSha256 !== artifact.contentSha256) {
        throw new RepairedFamilyRevisionError(
          "REPAIRED_FAMILY_REVISION_LAYER_HASH_MISMATCH",
          `${frame.id}.${instance.layerId} decoded bytes differ from the artifact descriptor.`,
        );
      }
      return {
        definition,
        instance,
        features,
        descriptorSha256: artifact.descriptorSha256,
        contentSha256: artifact.contentSha256,
      };
    }),
  );
}

async function storeRevisionEvidence(
  artifacts: ArtifactStore,
  evidence: RepairedFamilyRevisionEvidence,
  sourceArtifacts: readonly ArtifactId[],
): Promise<StoredArtifact> {
  return artifacts.put(`${JSON.stringify(normalizeJson(evidence), null, 2)}\n`, {
    mediaType: "application/json",
    storageClass: "evidence",
    fileName: `${evidence.revisionId}.repaired-family-revision.json`,
    sourceArtifacts: [...new Set(sourceArtifacts)].sort() as readonly ArtifactId[],
    labels: {
      artifactRole: "repaired-family-revision-evidence",
      approvalState: "evidence-only",
      qualityState: evidence.passed ? "passed" : "rejected",
      finalDeliverable: "false",
      revisionId: evidence.revisionId,
      repairId: evidence.repairId,
      familyId: evidence.familyId,
    },
    metadata: normalizeJson({
      requestSha256: evidence.requestSha256,
      sourceManifestSha256: evidence.sourceManifestSha256,
      revisedManifestSha256: evidence.revisedManifestSha256,
      impactedFrameCount: evidence.impactedFrameIds.length,
      replacementCount: evidence.replacements.length,
      passed: evidence.passed,
    }),
  });
}

export async function createRepairedFamilyRevision(
  input: RepairedFamilyRevisionRequestInput | unknown,
  options: RepairedFamilyRevisionOptions,
): Promise<RepairedFamilyRevisionResult> {
  const request = validateRepairedFamilyRevisionRequest(input);
  const now = options.now ?? (() => new Date());
  const completedAt = nowIso(now);
  const requestSha256 = repairedFamilyRevisionRequestSha256(request);
  const [packetArtifact, executionArtifact, restoredArtifact] = await Promise.all([
    verifiedArtifact(options.artifacts, request.repairPacketArtifactId, "repair packet"),
    verifiedArtifact(
      options.artifacts,
      request.repairExecutionEvidenceArtifactId,
      "repair execution evidence",
    ),
    verifiedArtifact(
      options.artifacts,
      request.restoredCandidateArtifactId,
      "restored repair candidate",
    ),
  ]);
  if (
    packetArtifact.storageClass !== "evidence" ||
    packetArtifact.labels.artifactRole !== "targeted-repair-packet" ||
    packetArtifact.labels.repairDisposition !== "ready"
  ) {
    throw new RepairedFamilyRevisionError(
      "REPAIRED_FAMILY_REVISION_PACKET_ROLE_INVALID",
      "repairPacketArtifactId must reference a ready targeted-repair-packet.",
    );
  }
  if (
    executionArtifact.storageClass !== "evidence" ||
    executionArtifact.labels.artifactRole !== "targeted-repair-execution-evidence"
  ) {
    throw new RepairedFamilyRevisionError(
      "REPAIRED_FAMILY_REVISION_EXECUTION_ROLE_INVALID",
      "repairExecutionEvidenceArtifactId must reference targeted-repair-execution-evidence.",
    );
  }
  if (
    restoredArtifact.storageClass !== "intermediate" ||
    restoredArtifact.mediaType !== "image/png" ||
    restoredArtifact.labels.artifactRole !== "targeted-repair-restored-candidate" ||
    restoredArtifact.labels.approvalState !== "unapproved" ||
    restoredArtifact.labels.finalDeliverable !== "false"
  ) {
    throw new RepairedFamilyRevisionError(
      "REPAIRED_FAMILY_REVISION_CANDIDATE_ROLE_INVALID",
      "restoredCandidateArtifactId must reference an unapproved, non-final restored PNG candidate.",
    );
  }
  const packet = parsePacket(
    await readJson(options.artifacts, packetArtifact, "repair packet"),
  );
  const execution = parseExecutionEvidence(
    await readJson(options.artifacts, executionArtifact, "repair execution evidence"),
  );
  if (
    packet.repairId !== execution.repairId ||
    packet.repairId !== restoredArtifact.labels.repairId ||
    execution.repairPacketArtifactId !== request.repairPacketArtifactId ||
    !executionArtifact.sourceArtifacts.includes(request.repairPacketArtifactId) ||
    !executionArtifact.sourceArtifacts.includes(request.restoredCandidateArtifactId)
  ) {
    throw new RepairedFamilyRevisionError(
      "REPAIRED_FAMILY_REVISION_EXECUTION_LINEAGE_MISMATCH",
      "Repair packet, execution evidence and restored candidate do not describe the same repair transaction.",
    );
  }
  const executionCandidate = execution.restoredCandidates.find(
    (candidate) =>
      candidate.restoredCandidateArtifactId === request.restoredCandidateArtifactId,
  );
  if (!executionCandidate) {
    throw new RepairedFamilyRevisionError(
      "REPAIRED_FAMILY_REVISION_CANDIDATE_NOT_IN_EXECUTION",
      "The selected restored candidate is not declared by the repair execution evidence.",
    );
  }
  if (
    restoredArtifact.labels.frameId !== packet.target.frameId ||
    restoredArtifact.labels.layerId !== packet.target.layerId
  ) {
    throw new RepairedFamilyRevisionError(
      "REPAIRED_FAMILY_REVISION_CANDIDATE_TARGET_MISMATCH",
      "Restored candidate frame or layer labels do not match the repair packet target.",
    );
  }

  const sourceManifestArtifactId = packet.sourceEvidence.manifestArtifactId;
  const sourceManifestArtifact = await verifiedArtifact(
    options.artifacts,
    sourceManifestArtifactId,
    "source family manifest",
  );
  if (
    sourceManifestArtifact.storageClass !== "manifest" ||
    sourceManifestArtifact.labels.artifactRole !==
      "sprite-family-normalized-manifest" ||
    sourceManifestArtifact.labels.manifestSha256 !== packet.familyManifestSha256 ||
    !packetArtifact.sourceArtifacts.includes(sourceManifestArtifactId)
  ) {
    throw new RepairedFamilyRevisionError(
      "REPAIRED_FAMILY_REVISION_MANIFEST_ROLE_INVALID",
      "Repair packet is not immutably bound to the declared normalized family manifest.",
    );
  }
  let sourceManifest: NormalizedSpriteFamilyManifest;
  try {
    sourceManifest = validateSpriteFamilyManifest(
      await readJson(options.artifacts, sourceManifestArtifact, "source family manifest"),
    );
  } catch (error: unknown) {
    if (error instanceof SpriteFamilyError) {
      throw new RepairedFamilyRevisionError(error.code, error.message, error.details);
    }
    throw error;
  }
  const sourceManifestSha256 = spriteFamilyManifestSha256(sourceManifest);
  if (
    sourceManifestSha256 !== packet.familyManifestSha256 ||
    sourceManifest.familyId !== packet.familyId
  ) {
    throw new RepairedFamilyRevisionError(
      "REPAIRED_FAMILY_REVISION_MANIFEST_HASH_MISMATCH",
      "Normalized source manifest hash or family ID does not match repair evidence.",
    );
  }

  const targetEvidence = targetLayerEvidence(packet);
  const definition = sourceManifest.layerDefinitions.find(
    (entry) => entry.id === packet.target.layerId,
  );
  if (
    !definition ||
    definition.role !== packet.target.layerRole ||
    definition.sourcePolicy !== packet.target.sourcePolicy
  ) {
    throw new RepairedFamilyRevisionError(
      "REPAIRED_FAMILY_REVISION_LAYER_CONTRACT_MISMATCH",
      "Repair packet layer role or source policy differs from the immutable source manifest.",
    );
  }
  const impactedFrameIds = [...new Set(packet.impactedFrameIds)].sort();
  if (!impactedFrameIds.length || !impactedFrameIds.includes(packet.target.frameId)) {
    throw new RepairedFamilyRevisionError(
      "REPAIRED_FAMILY_REVISION_IMPACT_INVALID",
      "Repair packet impacted frames must include the target frame.",
    );
  }
  const actualSharedFrames = sourceManifest.frames
    .filter((frame) =>
      frame.layers.some(
        (layer) =>
          layer.layerId === packet.target.layerId &&
          layer.artifactId === packet.target.baseArtifactId,
      ),
    )
    .map((frame) => frame.id)
    .sort();
  if (
    definition.sourcePolicy === "per-frame"
      ? impactedFrameIds.length !== 1 || impactedFrameIds[0] !== packet.target.frameId
      : !exactSet(impactedFrameIds, actualSharedFrames)
  ) {
    throw new RepairedFamilyRevisionError(
      "REPAIRED_FAMILY_REVISION_IMPACT_MISMATCH",
      "Impacted frames do not match the immutable layer-sharing contract.",
      normalizeJson({ impactedFrameIds, actualSharedFrames }),
    );
  }

  const restoredBytes = await options.artifacts.read(restoredArtifact.artifactId);
  const quality = await frameQuality(
    restoredBytes,
    `${packet.target.frameId}.${packet.target.layerId}.repair`,
    targetEvidence.width,
    targetEvidence.height,
    request,
    request.quality.safePadding,
  );
  const qualityEvidence = await storeQualityEvidence(
    options.artifacts,
    quality,
    [
      request.repairPacketArtifactId,
      request.repairExecutionEvidenceArtifactId,
      request.restoredCandidateArtifactId,
      executionCandidate.restorationEvidenceArtifactId,
    ],
    `${request.revisionId}.candidate-quality.json`,
    {
      revisionId: request.revisionId,
      repairId: packet.repairId,
      frameId: packet.target.frameId,
      layerId: packet.target.layerId,
      evidenceScope: "replacement-candidate",
    },
  );
  if (!quality.passed) {
    throw new RepairedFamilyRevisionError(
      "REPAIRED_FAMILY_REVISION_CANDIDATE_QUALITY_FAILED",
      "Restored candidate failed blocking sprite-frame quality gates.",
      {
        qualityEvidenceArtifactId: qualityEvidence.artifactId,
        failedGateIds: quality.gates
          .filter((gate) => gate.blocking && gate.status === "fail")
          .map((gate) => gate.id),
      },
    );
  }
  const qualityCandidate = await options.artifacts.put(restoredBytes, {
    mediaType: "image/png",
    storageClass: "intermediate",
    fileName: `${request.revisionId}.${packet.target.layerId}.quality-passed.png`,
    sourceArtifacts: [
      request.repairPacketArtifactId,
      request.repairExecutionEvidenceArtifactId,
      request.restoredCandidateArtifactId,
      qualityEvidence.artifactId,
    ],
    labels: {
      artifactRole: "repaired-family-quality-candidate",
      approvalState: "unapproved",
      qualityState: "passed",
      finalDeliverable: "false",
      revisionId: request.revisionId,
      repairId: packet.repairId,
      familyId: packet.familyId,
      frameId: packet.target.frameId,
      layerId: packet.target.layerId,
    },
    metadata: normalizeJson({
      qualityEvidenceArtifactId: qualityEvidence.artifactId,
      restoredCandidateArtifactId: request.restoredCandidateArtifactId,
      rawRgbaSha256: quality.rawRgbaSha256,
      requiresFamilyReverification: true,
      requiresSelection: true,
      requiresPromotion: true,
    }),
  });

  const replacements: RepairedFamilyRevisionReplacement[] = [];
  const revisedDeclaredCompositeArtifactIds: ArtifactId[] = [];
  const revisedDeclaredCompositeQualityEvidenceArtifactIds: ArtifactId[] = [];
  const provisionalFrames = sourceManifest.frames.map((frame) => {
    if (!impactedFrameIds.includes(frame.id)) return frame;
    const layer = frame.layers.find((entry) => entry.layerId === packet.target.layerId);
    if (!layer || layer.artifactId !== packet.target.baseArtifactId) {
      throw new RepairedFamilyRevisionError(
        "REPAIRED_FAMILY_REVISION_ORIGINAL_BINDING_MISMATCH",
        `${frame.id}.${packet.target.layerId} does not use the authorised original artifact.`,
      );
    }
    return {
      ...frame,
      layers: frame.layers.map((entry) =>
        entry.layerId === packet.target.layerId
          ? { ...entry, artifactId: qualityCandidate.artifactId }
          : entry,
      ),
    };
  });

  const revisedFrames: NormalizedSpriteFamilyFrame[] = [];
  for (const frame of provisionalFrames) {
    if (!impactedFrameIds.includes(frame.id)) {
      revisedFrames.push(frame);
      continue;
    }
    const layers = await resolvedLayers(sourceManifest, frame, options.artifacts);
    const rendered = await renderSpriteComposite(
      sourceManifest.canvas,
      layers,
      sourceManifest.policy.alphaVisibleThreshold,
    );
    const compositeQuality = await frameQuality(
      rendered.png,
      `${frame.id}.revised-composite`,
      sourceManifest.canvas.width,
      sourceManifest.canvas.height,
      request,
      0,
    );
    const layerArtifactIds = frame.layers.map((layer) => layer.artifactId);
    const compositeQualityEvidence = await storeQualityEvidence(
      options.artifacts,
      compositeQuality,
      [
        request.repairPacketArtifactId,
        qualityCandidate.artifactId,
        ...layerArtifactIds,
      ],
      `${request.revisionId}.${frame.id}.composite-quality.json`,
      {
        revisionId: request.revisionId,
        repairId: packet.repairId,
        frameId: frame.id,
        layerId: packet.target.layerId,
        evidenceScope: "revised-declared-composite",
      },
    );
    if (!compositeQuality.passed) {
      throw new RepairedFamilyRevisionError(
        "REPAIRED_FAMILY_REVISION_COMPOSITE_QUALITY_FAILED",
        `Revised declared composite for ${frame.id} failed blocking frame quality gates.`,
        {
          frameId: frame.id,
          qualityEvidenceArtifactId: compositeQualityEvidence.artifactId,
          failedGateIds: compositeQuality.gates
            .filter((gate) => gate.blocking && gate.status === "fail")
            .map((gate) => gate.id),
        },
      );
    }
    const composite = await options.artifacts.put(rendered.png, {
      mediaType: "image/png",
      storageClass: "intermediate",
      fileName: `${request.revisionId}.${frame.id}.declared-composite.png`,
      sourceArtifacts: [
        sourceManifestArtifactId,
        request.repairPacketArtifactId,
        qualityCandidate.artifactId,
        compositeQualityEvidence.artifactId,
        ...layerArtifactIds,
      ],
      labels: {
        artifactRole: "repaired-family-declared-composite",
        approvalState: "unapproved",
        qualityState: "passed",
        finalDeliverable: "false",
        revisionId: request.revisionId,
        repairId: packet.repairId,
        familyId: packet.familyId,
        frameId: frame.id,
      },
      metadata: normalizeJson({
        generatedCompositeSha256: rendered.sha256,
        qualityEvidenceArtifactId: compositeQualityEvidence.artifactId,
        targetLayerId: packet.target.layerId,
        replacementArtifactId: qualityCandidate.artifactId,
      }),
    });
    revisedDeclaredCompositeArtifactIds.push(composite.artifactId);
    revisedDeclaredCompositeQualityEvidenceArtifactIds.push(
      compositeQualityEvidence.artifactId,
    );
    replacements.push({
      frameId: frame.id,
      layerId: packet.target.layerId,
      layerRole: definition.role,
      sourcePolicy: definition.sourcePolicy,
      originalArtifactId: packet.target.baseArtifactId,
      replacementArtifactId: qualityCandidate.artifactId,
      ...(frame.declaredCompositeArtifactId === undefined
        ? {}
        : {
            originalDeclaredCompositeArtifactId:
              frame.declaredCompositeArtifactId,
          }),
      revisedDeclaredCompositeArtifactId: composite.artifactId,
      revisedDeclaredCompositeQualityEvidenceArtifactId:
        compositeQualityEvidence.artifactId,
    });
    revisedFrames.push(
      revisedFrame(
        frame,
        packet.target.layerId,
        qualityCandidate.artifactId,
        composite.artifactId,
      ),
    );
  }

  const revisedManifest = validateSpriteFamilyManifest({
    ...sourceManifest,
    frames: revisedFrames,
  });
  let familyResult: ManifestBoundSpriteFamilyRunResult;
  try {
    familyResult = manifestBound(
      await verifySpriteFamily(revisedManifest, {
        artifacts: options.artifacts,
        now,
      }),
    );
  } catch (error: unknown) {
    if (error instanceof SpriteFamilyError) {
      throw new RepairedFamilyRevisionError(error.code, error.message, error.details);
    }
    throw error;
  }
  const revisedManifestSha256 = spriteFamilyManifestSha256(revisedManifest);
  const evidence: RepairedFamilyRevisionEvidence = {
    schemaVersion: "1.0",
    protocolVersion: REPAIRED_FAMILY_REVISION_PROTOCOL_VERSION,
    revisionId: request.revisionId,
    repairId: packet.repairId,
    familyId: packet.familyId,
    requestSha256,
    sourceManifestArtifactId,
    sourceManifestSha256,
    repairPacketArtifactId: request.repairPacketArtifactId,
    repairExecutionEvidenceArtifactId:
      request.repairExecutionEvidenceArtifactId,
    restoredCandidateArtifactId: request.restoredCandidateArtifactId,
    qualityEvidenceArtifactId: qualityEvidence.artifactId,
    qualityCandidateArtifactId: qualityCandidate.artifactId,
    quality,
    impactedFrameIds,
    replacements,
    revisedManifestArtifactId: familyResult.manifestArtifactId,
    revisedManifestSha256,
    familyEvidenceArtifactId: familyResult.evidenceArtifactId,
    kernelFamilyEvidenceArtifactId: familyResult.kernelEvidenceArtifactId,
    generatedCompositeArtifactIds: familyResult.generatedCompositeArtifactIds,
    passed: familyResult.evidence.passed,
    completedAt,
    ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
  };
  const revisionEvidence = await storeRevisionEvidence(
    options.artifacts,
    evidence,
    [
      sourceManifestArtifactId,
      request.repairPacketArtifactId,
      request.repairExecutionEvidenceArtifactId,
      request.restoredCandidateArtifactId,
      qualityEvidence.artifactId,
      qualityCandidate.artifactId,
      ...revisedDeclaredCompositeArtifactIds,
      ...revisedDeclaredCompositeQualityEvidenceArtifactIds,
      familyResult.manifestArtifactId,
      familyResult.kernelEvidenceArtifactId,
      familyResult.evidenceArtifactId,
      ...familyResult.generatedCompositeArtifactIds,
    ],
  );
  if (!familyResult.evidence.passed) {
    throw new RepairedFamilyRevisionError(
      "REPAIRED_FAMILY_REVISION_FAMILY_VERIFICATION_FAILED",
      "Repaired family revision failed one or more blocking layered-family gates.",
      {
        revisionEvidenceArtifactId: revisionEvidence.artifactId,
        familyEvidenceArtifactId: familyResult.evidenceArtifactId,
        revisedManifestArtifactId: familyResult.manifestArtifactId,
      },
    );
  }
  return {
    revisionEvidenceArtifactId: revisionEvidence.artifactId,
    qualityEvidenceArtifactId: qualityEvidence.artifactId,
    qualityCandidateArtifactId: qualityCandidate.artifactId,
    revisedDeclaredCompositeArtifactIds,
    revisedDeclaredCompositeQualityEvidenceArtifactIds,
    family: familyResult,
    evidence,
    revisedManifest,
  };
}
