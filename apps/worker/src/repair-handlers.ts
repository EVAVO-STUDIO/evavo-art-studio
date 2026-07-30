import type { ArtifactId } from "@evavo/art-artifacts";
import {
  TargetedRepairError,
  planTargetedRepair,
  validateTargetedRepairRequest,
} from "@evavo/art-repair";
import {
  PermanentRuntimeError,
  type RuntimeJobHandler,
} from "@evavo/art-runtime";

const REQUIRED_CAPABILITIES = Object.freeze([
  "repair.plan",
  "artifacts.store",
  "evidence.bundle",
] as const);

function declaredInputs(input: ReturnType<typeof validateTargetedRepairRequest>) {
  return [
    input.familyEvidenceArtifactId,
    ...(input.maskArtifactId ? [input.maskArtifactId] : []),
    ...input.references.map((reference) => reference.artifactId),
  ];
}

function repairFailure(error: TargetedRepairError): PermanentRuntimeError {
  return new PermanentRuntimeError(error.code, error.message, error.details);
}

export function createTargetedRepairHandlers(): Readonly<
  Record<string, RuntimeJobHandler>
> {
  const plan: RuntimeJobHandler = async (context) => {
    let request;
    try {
      request = validateTargetedRepairRequest(context.job.spec.payload);
    } catch (error: unknown) {
      if (error instanceof TargetedRepairError) throw repairFailure(error);
      throw error;
    }
    for (const capability of REQUIRED_CAPABILITIES) {
      if (!context.job.spec.requiredCapabilities.includes(capability)) {
        throw new PermanentRuntimeError(
          "TARGETED_REPAIR_RUNTIME_CAPABILITY_MISSING",
          `art.repair.plan job must require ${capability}.`,
        );
      }
    }
    const declared = new Set(context.job.spec.inputArtifacts);
    const missing = declaredInputs(request).filter(
      (artifactId) => !declared.has(artifactId),
    );
    if (missing.length) {
      throw new PermanentRuntimeError(
        "TARGETED_REPAIR_RUNTIME_INPUT_LINEAGE_MISSING",
        `art.repair.plan inputArtifacts is missing: ${missing.join(", ")}`,
      );
    }
    try {
      const result = await planTargetedRepair(request, {
        artifacts: context.artifacts,
      });
      if (
        result.packet.disposition !== "ready" &&
        result.packet.providerPlan !== undefined
      ) {
        throw new PermanentRuntimeError(
          "TARGETED_REPAIR_BLOCKED_PACKET_HAS_EXECUTION_PLAN",
          "A blocked repair packet may not expose a provider execution plan.",
          {
            packetArtifactId: result.packetArtifactId,
            disposition: result.packet.disposition,
            blockers: result.packet.blockers,
          },
        );
      }
      return {
        outputArtifacts: [result.packetArtifactId] as readonly ArtifactId[],
        result: {
          schemaVersion: "1.0",
          repairId: result.packet.repairId,
          packetArtifactId: result.packetArtifactId,
          disposition: result.packet.disposition,
          impactedFrameIds: result.packet.impactedFrameIds,
          mutableArtifactIds: result.packet.mutableArtifactIds,
          protectedArtifactIds: result.packet.protectedArtifactIds,
          blockers: result.packet.blockers,
          providerPlanReady:
            result.packet.disposition === "ready" &&
            result.packet.providerPlan !== undefined,
        },
      };
    } catch (error: unknown) {
      if (error instanceof TargetedRepairError) throw repairFailure(error);
      throw error;
    }
  };
  return Object.freeze({
    "art.repair.plan": plan,
  });
}

export function targetedRepairWorkerCapabilities(): readonly string[] {
  return [...REQUIRED_CAPABILITIES];
}
