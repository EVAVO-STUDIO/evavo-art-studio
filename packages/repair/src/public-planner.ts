import {
  normalizeJson,
  type ArtifactId,
} from "@evavo/art-artifacts";

import {
  TARGETED_REPAIR_PROTOCOL_VERSION,
  type NormalizedTargetedRepairRequest,
  type PlanTargetedRepairOptions,
  type TargetedRepairPacket,
  type TargetedRepairRunResult,
} from "./types.js";
import { planTargetedRepair as planTargetedRepairInternal } from "./planner.js";

function withoutProviderPlan(packet: TargetedRepairPacket): TargetedRepairPacket {
  const {
    providerPlan: _providerPlan,
    ...safePacket
  } = packet;
  return safePacket;
}

export async function planTargetedRepair(
  input: NormalizedTargetedRepairRequest | unknown,
  options: PlanTargetedRepairOptions,
): Promise<TargetedRepairRunResult> {
  const result = await planTargetedRepairInternal(input, options);
  if (
    result.packet.disposition === "ready" ||
    result.packet.providerPlan === undefined
  ) {
    return result;
  }
  const packet = withoutProviderPlan(result.packet);
  const original = await options.artifacts.get(result.packetArtifactId);
  const sourceArtifacts = original?.sourceArtifacts ?? [
    packet.familyEvidenceArtifactId,
    ...packet.mutableArtifactIds,
    ...packet.protectedArtifactIds,
  ];
  const stored = await options.artifacts.put(
    `${JSON.stringify(normalizeJson(packet), null, 2)}\n`,
    {
      mediaType: "application/json",
      storageClass: "evidence",
      fileName: `${packet.repairId}.targeted-repair.blocked.json`,
      sourceArtifacts: [...new Set(sourceArtifacts)].sort() as readonly ArtifactId[],
      labels: {
        artifactRole: "targeted-repair-packet",
        approvalState: "evidence-only",
        repairDisposition: packet.disposition,
        familyId: packet.familyId,
        frameId: packet.target.frameId,
        ...(packet.target.layerId ? { layerId: packet.target.layerId } : {}),
        executionPlanSuppressed: "true",
      },
      metadata: normalizeJson({
        schemaVersion: "1.0",
        protocolVersion: TARGETED_REPAIR_PROTOCOL_VERSION,
        requestSha256: packet.requestSha256,
        familyManifestSha256: packet.familyManifestSha256,
        impactedFrameCount: packet.impactedFrameIds.length,
        blockerCount: packet.blockers.length,
        providerPlanReady: false,
        replacedInternalPacketArtifactId: result.packetArtifactId,
      }),
    },
  );
  return { packetArtifactId: stored.artifactId, packet };
}
