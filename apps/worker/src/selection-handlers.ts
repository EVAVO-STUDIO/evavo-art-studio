import type { ArtifactId, JsonValue } from "@evavo/art-artifacts";
import {
  CandidateSelectionError,
  executeCandidateSelection,
  promoteSelectedCandidate,
  validateCandidatePromotionRequest,
  validateCandidateSelectionRequest,
} from "@evavo/art-selection";
import {
  PermanentRuntimeError,
  type RuntimeJobHandler,
} from "@evavo/art-runtime";

import {
  createRepairedFamilyRankingHandlers,
  repairedFamilyRankingWorkerCapabilities,
} from "./revision-ranking-handlers.js";

const SELECT_CAPABILITIES = Object.freeze([
  "selection.compare",
  "evidence.bundle",
] as const);
const PROMOTE_CAPABILITIES = Object.freeze([
  "selection.promote",
  "artifacts.store",
  "evidence.bundle",
] as const);

function ensureCapabilities(
  required: readonly string[],
  declared: readonly string[],
  kind: string,
): void {
  for (const capability of required) {
    if (!declared.includes(capability)) {
      throw new PermanentRuntimeError(
        "SELECTION_RUNTIME_CAPABILITY_MISSING",
        `${kind} job must require ${capability}.`,
      );
    }
  }
}

function ensureInputs(
  required: readonly ArtifactId[],
  declared: readonly ArtifactId[],
  kind: string,
): void {
  const available = new Set(declared);
  const missing = required.filter((artifactId) => !available.has(artifactId));
  if (missing.length) {
    throw new PermanentRuntimeError(
      "SELECTION_RUNTIME_INPUT_LINEAGE_MISSING",
      `${kind} job inputArtifacts is missing: ${missing.join(", ")}`,
    );
  }
}

function selectionFailure(
  error: CandidateSelectionError,
): PermanentRuntimeError {
  return new PermanentRuntimeError(error.code, error.message, error.details);
}

export function createCandidateSelectionHandlers(): Readonly<
  Record<string, RuntimeJobHandler>
> {
  const select: RuntimeJobHandler = async (context) => {
    let request;
    try {
      request = validateCandidateSelectionRequest(context.job.spec.payload);
    } catch (error: unknown) {
      if (error instanceof CandidateSelectionError) throw selectionFailure(error);
      throw error;
    }
    ensureCapabilities(
      SELECT_CAPABILITIES,
      context.job.spec.requiredCapabilities,
      "art.candidate.select",
    );
    ensureInputs(
      [
        request.referenceArtifactId,
        ...request.candidateArtifactIds,
        ...request.externalEvidenceArtifactIds,
      ],
      context.job.spec.inputArtifacts,
      "art.candidate.select",
    );
    try {
      const result = await executeCandidateSelection(request, {
        artifacts: context.artifacts,
      });
      return {
        outputArtifacts: [result.evidenceArtifactId],
        result: result as unknown as JsonValue,
      };
    } catch (error: unknown) {
      if (error instanceof CandidateSelectionError) throw selectionFailure(error);
      throw error;
    }
  };

  const promote: RuntimeJobHandler = async (context) => {
    let request;
    try {
      request = validateCandidatePromotionRequest(context.job.spec.payload);
    } catch (error: unknown) {
      if (error instanceof CandidateSelectionError) throw selectionFailure(error);
      throw error;
    }
    ensureCapabilities(
      PROMOTE_CAPABILITIES,
      context.job.spec.requiredCapabilities,
      "art.candidate.promote",
    );
    ensureInputs(
      [request.selectionEvidenceArtifactId, request.candidateArtifactId],
      context.job.spec.inputArtifacts,
      "art.candidate.promote",
    );
    try {
      const result = await promoteSelectedCandidate(request, {
        artifacts: context.artifacts,
      });
      return {
        outputArtifacts: [
          result.masterArtifactId,
          result.authorizationEvidenceArtifactId,
        ],
        result: result as unknown as JsonValue,
      };
    } catch (error: unknown) {
      if (error instanceof CandidateSelectionError) throw selectionFailure(error);
      throw error;
    }
  };

  return Object.freeze({
    "art.candidate.select": select,
    "art.candidate.promote": promote,
    ...createRepairedFamilyRankingHandlers(),
  });
}

export function candidateSelectionWorkerCapabilities(): readonly string[] {
  return [
    ...new Set([
      ...SELECT_CAPABILITIES,
      ...PROMOTE_CAPABILITIES,
      ...repairedFamilyRankingWorkerCapabilities(),
    ]),
  ].sort();
}
