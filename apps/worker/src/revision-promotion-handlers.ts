import { normalizeJson, type ArtifactId } from "@evavo/art-artifacts";
import {
  promoteRepairedFamilyCandidate,
  REPAIRED_FAMILY_PROMOTION_CAPABILITIES,
  RepairedFamilyPromotionError,
  validateRepairedFamilyPromotionRequest,
} from "@evavo/art-repair";
import {
  PermanentRuntimeError,
  type RuntimeJobHandler,
} from "@evavo/art-runtime";

function promotionFailure(
  error: RepairedFamilyPromotionError,
): PermanentRuntimeError {
  return new PermanentRuntimeError(error.code, error.message, error.details);
}

function requiredInputs(
  request: ReturnType<typeof validateRepairedFamilyPromotionRequest>,
): readonly ArtifactId[] {
  return [request.rankingEvidenceArtifactId];
}

export function createRepairedFamilyPromotionHandlers(): Readonly<
  Record<string, RuntimeJobHandler>
> {
  const promote: RuntimeJobHandler = async (context) => {
    let request;
    try {
      request = validateRepairedFamilyPromotionRequest(context.job.spec.payload);
    } catch (error: unknown) {
      if (error instanceof RepairedFamilyPromotionError) {
        throw promotionFailure(error);
      }
      throw error;
    }
    for (const capability of REPAIRED_FAMILY_PROMOTION_CAPABILITIES) {
      if (!context.job.spec.requiredCapabilities.includes(capability)) {
        throw new PermanentRuntimeError(
          "REPAIRED_FAMILY_PROMOTION_RUNTIME_CAPABILITY_MISSING",
          `art.repair.promote-revision job must require ${capability}.`,
        );
      }
    }
    const declared = new Set(context.job.spec.inputArtifacts);
    const missing = requiredInputs(request).filter(
      (artifactId) => !declared.has(artifactId),
    );
    if (missing.length > 0) {
      throw new PermanentRuntimeError(
        "REPAIRED_FAMILY_PROMOTION_RUNTIME_INPUT_LINEAGE_MISSING",
        `art.repair.promote-revision inputArtifacts is missing: ${missing.join(", ")}`,
      );
    }
    try {
      const result = await promoteRepairedFamilyCandidate(request, {
        artifacts: context.artifacts,
      });
      return {
        outputArtifacts: [
          result.boundSelectionEvidenceArtifactId,
          result.masterArtifactId,
          result.authorizationEvidenceArtifactId,
          result.evidenceArtifactId,
        ],
        result: normalizeJson(result),
      };
    } catch (error: unknown) {
      if (error instanceof RepairedFamilyPromotionError) {
        throw promotionFailure(error);
      }
      throw error;
    }
  };
  return Object.freeze({
    "art.repair.promote-revision": promote,
  });
}

export function repairedFamilyPromotionWorkerCapabilities(): readonly string[] {
  return [...REPAIRED_FAMILY_PROMOTION_CAPABILITIES];
}
