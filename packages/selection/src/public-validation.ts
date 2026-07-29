import type { NormalizedCandidateSelectionRequest } from "./types.js";
import {
  promotionRequestSha256,
  selectionProtocolSummary,
  selectionRequestSha256,
  validateCandidatePromotionRequest,
  validateCandidateSelectionRequest as validateStrictCandidateSelectionRequest,
} from "./validation.js";

function canonicalSelectionInput(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const record = input as Record<string, unknown>;
  if (
    Array.isArray(record.externalEvidenceArtifactIds) &&
    record.externalEvidenceArtifactIds.length === 0
  ) {
    const { externalEvidenceArtifactIds: _empty, ...rest } = record;
    return rest;
  }
  return input;
}

export function validateCandidateSelectionRequest(
  input: unknown,
): NormalizedCandidateSelectionRequest {
  return validateStrictCandidateSelectionRequest(canonicalSelectionInput(input));
}

export {
  promotionRequestSha256,
  selectionProtocolSummary,
  selectionRequestSha256,
  validateCandidatePromotionRequest,
};
