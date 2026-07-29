import {
  executeCandidateSelection as executeStrictCandidateSelection,
} from "./select.js";
import type {
  CandidateSelectionOptions,
  CandidateSelectionRunResult,
} from "./types.js";

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

export function executeCandidateSelection(
  input: unknown,
  options: CandidateSelectionOptions,
): Promise<CandidateSelectionRunResult> {
  return executeStrictCandidateSelection(canonicalSelectionInput(input), options);
}
