import {
  normalizeJson,
  type ArtifactId,
} from "@evavo/art-artifacts";
import {
  prepareRepairedFamilySelection,
  REPAIRED_FAMILY_SELECTION_CAPABILITIES,
  RepairedFamilySelectionError,
  validateRepairedFamilySelectionRequest,
} from "@evavo/art-repair";
import {
  PermanentRuntimeError,
  type RuntimeJobHandler,
} from "@evavo/art-runtime";

function bridgeFailure(
  error: RepairedFamilySelectionError,
): PermanentRuntimeError {
  return new PermanentRuntimeError(error.code, error.message, error.details);
}

function requiredInputs(
  request: ReturnType<typeof validateRepairedFamilySelectionRequest>,
): readonly ArtifactId[] {
  return [
    ...request.revisionEvidenceArtifactIds,
    ...request.externalEvidenceArtifactIds,
  ];
}

export function createRepairedFamilySelectionHandlers(): Readonly<
  Record<string, RuntimeJobHandler>
> {
  const prepare: RuntimeJobHandler = async (context) => {
    let request;
    try {
      request = validateRepairedFamilySelectionRequest(context.job.spec.payload);
    } catch (error: unknown) {
      if (error instanceof RepairedFamilySelectionError) {
        throw bridgeFailure(error);
      }
      throw error;
    }
    for (const capability of REPAIRED_FAMILY_SELECTION_CAPABILITIES) {
      if (!context.job.spec.requiredCapabilities.includes(capability)) {
        throw new PermanentRuntimeError(
          "REPAIRED_FAMILY_SELECTION_RUNTIME_CAPABILITY_MISSING",
          `art.repair.prepare-revision-selection job must require ${capability}.`,
        );
      }
    }
    const declared = new Set(context.job.spec.inputArtifacts);
    const missing = requiredInputs(request).filter(
      (artifactId) => !declared.has(artifactId),
    );
    if (missing.length > 0) {
      throw new PermanentRuntimeError(
        "REPAIRED_FAMILY_SELECTION_RUNTIME_INPUT_LINEAGE_MISSING",
        `art.repair.prepare-revision-selection inputArtifacts is missing: ${missing.join(", ")}`,
      );
    }
    try {
      const result = await prepareRepairedFamilySelection(request, {
        artifacts: context.artifacts,
      });
      return {
        outputArtifacts: [result.evidenceArtifactId],
        result: normalizeJson(result),
      };
    } catch (error: unknown) {
      if (error instanceof RepairedFamilySelectionError) {
        throw bridgeFailure(error);
      }
      throw error;
    }
  };
  return Object.freeze({
    "art.repair.prepare-revision-selection": prepare,
  });
}

export function repairedFamilySelectionWorkerCapabilities(): readonly string[] {
  return [...REPAIRED_FAMILY_SELECTION_CAPABILITIES];
}
