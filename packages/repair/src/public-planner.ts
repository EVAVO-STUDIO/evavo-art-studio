import {
  normalizeJson,
  type ArtifactId,
  type StoredArtifact,
} from "@evavo/art-artifacts";

import {
  TARGETED_REPAIR_PROTOCOL_VERSION,
  TargetedRepairError,
  type NormalizedTargetedRepairRequest,
  type PlanTargetedRepairOptions,
  type TargetedRepairPacket,
  type TargetedRepairRunResult,
} from "./types.js";
import { planTargetedRepair as planTargetedRepairInternal } from "./planner.js";

function withoutProviderPlan(packet: TargetedRepairPacket): TargetedRepairPacket {
  const { providerPlan: _providerPlan, ...safePacket } = packet;
  return safePacket;
}

async function verifiedManifest(
  manifestArtifactId: ArtifactId,
  packet: TargetedRepairPacket,
  options: PlanTargetedRepairOptions,
): Promise<StoredArtifact> {
  const [artifact, verification] = await Promise.all([
    options.artifacts.get(manifestArtifactId),
    options.artifacts.verify(manifestArtifactId),
  ]);
  if (!artifact || !verification.exists) {
    throw new TargetedRepairError(
      "TARGETED_REPAIR_MANIFEST_NOT_FOUND",
      `Family manifest artifact was not found: ${manifestArtifactId}`,
    );
  }
  if (!verification.descriptorValid || !verification.contentValid) {
    throw new TargetedRepairError(
      "TARGETED_REPAIR_MANIFEST_VERIFICATION_FAILED",
      "Family manifest artifact failed immutable descriptor or content verification.",
      { manifestArtifactId },
    );
  }
  if (
    artifact.mediaType !== "application/json" ||
    artifact.storageClass !== "manifest" ||
    artifact.labels.artifactRole !== "sprite-family-normalized-manifest" ||
    artifact.labels.manifestSha256 !== packet.familyManifestSha256
  ) {
    throw new TargetedRepairError(
      "TARGETED_REPAIR_MANIFEST_ROLE_INVALID",
      "Family evidence points to a manifest artifact with the wrong role or manifest hash.",
      {
        manifestArtifactId,
        expectedManifestSha256: packet.familyManifestSha256,
        actualManifestSha256: artifact.labels.manifestSha256 ?? null,
      },
    );
  }
  return artifact;
}

async function storePublicPacket(
  packet: TargetedRepairPacket,
  internalPacketArtifactId: ArtifactId,
  sourceArtifacts: readonly ArtifactId[],
  options: PlanTargetedRepairOptions,
  executionPlanSuppressed: boolean,
): Promise<TargetedRepairRunResult> {
  const stored = await options.artifacts.put(
    `${JSON.stringify(normalizeJson(packet), null, 2)}\n`,
    {
      mediaType: "application/json",
      storageClass: "evidence",
      fileName: `${packet.repairId}.targeted-repair${executionPlanSuppressed ? ".blocked" : ".manifest-bound"}.json`,
      sourceArtifacts: [
        internalPacketArtifactId,
        ...sourceArtifacts,
      ].filter((value, index, values) => values.indexOf(value) === index).sort() as readonly ArtifactId[],
      labels: {
        artifactRole: "targeted-repair-packet",
        approvalState: "evidence-only",
        repairDisposition: packet.disposition,
        familyId: packet.familyId,
        frameId: packet.target.frameId,
        ...(packet.target.layerId ? { layerId: packet.target.layerId } : {}),
        manifestBound: String(packet.sourceEvidence.manifestArtifactId !== undefined),
        ...(executionPlanSuppressed
          ? { executionPlanSuppressed: "true" }
          : {}),
      },
      metadata: normalizeJson({
        schemaVersion: "1.0",
        protocolVersion: TARGETED_REPAIR_PROTOCOL_VERSION,
        requestSha256: packet.requestSha256,
        familyManifestSha256: packet.familyManifestSha256,
        familyManifestArtifactId:
          packet.sourceEvidence.manifestArtifactId ?? null,
        impactedFrameCount: packet.impactedFrameIds.length,
        blockerCount: packet.blockers.length,
        providerPlanReady: packet.providerPlan !== undefined,
        replacedInternalPacketArtifactId: internalPacketArtifactId,
      }),
    },
  );
  return { packetArtifactId: stored.artifactId, packet };
}

export async function planTargetedRepair(
  input: NormalizedTargetedRepairRequest | unknown,
  options: PlanTargetedRepairOptions,
): Promise<TargetedRepairRunResult> {
  const internal = await planTargetedRepairInternal(input, options);
  const executionPlanSuppressed =
    internal.packet.disposition !== "ready" &&
    internal.packet.providerPlan !== undefined;
  let packet = executionPlanSuppressed
    ? withoutProviderPlan(internal.packet)
    : internal.packet;
  const original = await options.artifacts.get(internal.packetArtifactId);
  const originalSources = original?.sourceArtifacts ?? [
    packet.familyEvidenceArtifactId,
    ...packet.mutableArtifactIds,
    ...packet.protectedArtifactIds,
  ];
  const manifestArtifactId = packet.sourceEvidence.manifestArtifactId;
  if (manifestArtifactId === undefined) {
    if (!executionPlanSuppressed) return internal;
    return storePublicPacket(
      packet,
      internal.packetArtifactId,
      originalSources,
      options,
      true,
    );
  }
  await verifiedManifest(manifestArtifactId, packet, options);
  packet = {
    ...packet,
    protectedArtifactIds: [
      ...new Set([
        ...packet.protectedArtifactIds,
        manifestArtifactId,
      ]),
    ].sort() as readonly ArtifactId[],
  };
  return storePublicPacket(
    packet,
    internal.packetArtifactId,
    [...originalSources, manifestArtifactId],
    options,
    executionPlanSuppressed,
  );
}
