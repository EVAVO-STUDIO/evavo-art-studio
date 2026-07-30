import { normalizeJson, type ArtifactId } from "@evavo/art-artifacts";
import {
  executeRepairedFamilyRanking,
  REPAIRED_FAMILY_RANKING_CAPABILITIES,
  RepairedFamilyRankingError,
  validateRepairedFamilyRankingRequest,
} from "@evavo/art-repair";
import {
  PermanentRuntimeError,
  type RuntimeJobHandler,
} from "@evavo/art-runtime";

function rankingFailure(
  error: RepairedFamilyRankingError,
): PermanentRuntimeError {
  return new PermanentRuntimeError(error.code, error.message, error.details);
}

function requiredInputs(
  request: ReturnType<typeof validateRepairedFamilyRankingRequest>,
): readonly ArtifactId[] {
  return [request.bridgeEvidenceArtifactId];
}

export function createRepairedFamilyRankingHandlers(): Readonly<
  Record<string, RuntimeJobHandler>
> {
  const rank: RuntimeJobHandler = async (context) => {
    let request;
    try {
      request = validateRepairedFamilyRankingRequest(context.job.spec.payload);
    } catch (error: unknown) {
      if (error instanceof RepairedFamilyRankingError) {
        throw rankingFailure(error);
      }
      throw error;
    }
    for (const capability of REPAIRED_FAMILY_RANKING_CAPABILITIES) {
      if (!context.job.spec.requiredCapabilities.includes(capability)) {
        throw new PermanentRuntimeError(
          "REPAIRED_FAMILY_RANKING_RUNTIME_CAPABILITY_MISSING",
          `art.repair.rank-revisions job must require ${capability}.`,
        );
      }
    }
    const declared = new Set(context.job.spec.inputArtifacts);
    const missing = requiredInputs(request).filter(
      (artifactId) => !declared.has(artifactId),
    );
    if (missing.length > 0) {
      throw new PermanentRuntimeError(
        "REPAIRED_FAMILY_RANKING_RUNTIME_INPUT_LINEAGE_MISSING",
        `art.repair.rank-revisions inputArtifacts is missing: ${missing.join(", ")}`,
      );
    }
    try {
      const result = await executeRepairedFamilyRanking(request, {
        artifacts: context.artifacts,
      });
      return {
        outputArtifacts: [
          result.selectionEvidenceArtifactId,
          result.evidenceArtifactId,
        ],
        result: normalizeJson(result),
      };
    } catch (error: unknown) {
      if (error instanceof RepairedFamilyRankingError) {
        throw rankingFailure(error);
      }
      throw error;
    }
  };
  return Object.freeze({
    "art.repair.rank-revisions": rank,
  });
}

export function repairedFamilyRankingWorkerCapabilities(): readonly string[] {
  return [...REPAIRED_FAMILY_RANKING_CAPABILITIES];
}
