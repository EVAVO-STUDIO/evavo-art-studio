import {
  normalizeJson,
  type ArtifactId,
} from "@evavo/art-artifacts";
import {
  createRepairedFamilyRevision,
  REPAIRED_FAMILY_REVISION_CAPABILITIES,
  RepairedFamilyRevisionError,
  validateRepairedFamilyRevisionRequest,
} from "@evavo/art-repair";
import {
  PermanentRuntimeError,
  type RuntimeJobHandler,
} from "@evavo/art-runtime";

function revisionFailure(
  error: RepairedFamilyRevisionError,
): PermanentRuntimeError {
  return new PermanentRuntimeError(error.code, error.message, error.details);
}

function requiredInputs(
  request: ReturnType<typeof validateRepairedFamilyRevisionRequest>,
): readonly ArtifactId[] {
  return [
    request.repairPacketArtifactId,
    request.repairExecutionEvidenceArtifactId,
    request.restoredCandidateArtifactId,
  ];
}

export function createRepairedFamilyRevisionHandlers(): Readonly<
  Record<string, RuntimeJobHandler>
> {
  const revise: RuntimeJobHandler = async (context) => {
    let request;
    try {
      request = validateRepairedFamilyRevisionRequest(context.job.spec.payload);
    } catch (error: unknown) {
      if (error instanceof RepairedFamilyRevisionError) {
        throw revisionFailure(error);
      }
      throw error;
    }
    for (const capability of REPAIRED_FAMILY_REVISION_CAPABILITIES) {
      if (!context.job.spec.requiredCapabilities.includes(capability)) {
        throw new PermanentRuntimeError(
          "REPAIRED_FAMILY_REVISION_RUNTIME_CAPABILITY_MISSING",
          `art.repair.revise-family job must require ${capability}.`,
        );
      }
    }
    const declared = new Set(context.job.spec.inputArtifacts);
    const missing = requiredInputs(request).filter(
      (artifactId) => !declared.has(artifactId),
    );
    if (missing.length) {
      throw new PermanentRuntimeError(
        "REPAIRED_FAMILY_REVISION_RUNTIME_INPUT_LINEAGE_MISSING",
        `art.repair.revise-family inputArtifacts is missing: ${missing.join(", ")}`,
      );
    }
    try {
      const result = await createRepairedFamilyRevision(request, {
        artifacts: context.artifacts,
      });
      return {
        outputArtifacts: [
          result.qualityEvidenceArtifactId,
          result.qualityCandidateArtifactId,
          ...result.revisedDeclaredCompositeArtifactIds,
          ...result.revisedDeclaredCompositeQualityEvidenceArtifactIds,
          result.family.manifestArtifactId,
          result.family.kernelEvidenceArtifactId,
          ...result.family.generatedCompositeArtifactIds,
          result.family.evidenceArtifactId,
          result.revisionEvidenceArtifactId,
        ],
        result: normalizeJson(result),
      };
    } catch (error: unknown) {
      if (error instanceof RepairedFamilyRevisionError) {
        throw revisionFailure(error);
      }
      throw error;
    }
  };
  return Object.freeze({
    "art.repair.revise-family": revise,
  });
}

export function repairedFamilyRevisionWorkerCapabilities(): readonly string[] {
  return [...REPAIRED_FAMILY_REVISION_CAPABILITIES];
}
