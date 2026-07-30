import {
  REPAIRED_FAMILY_SELECTION_PROTOCOL_VERSION,
} from "./revision-selection-types.js";

export function repairedFamilySelectionProtocolSummary() {
  return {
    schemaVersion: "1.0" as const,
    protocolVersion: REPAIRED_FAMILY_SELECTION_PROTOCOL_VERSION,
    input: {
      minimumRevisions: 2,
      maximumRevisions: 32,
      artifactRole: "repaired-family-revision-evidence",
      requiredState: "passed evidence-only non-final",
    },
    enforcedSelectionPolicy: {
      requireReferenceLineage: true,
      requireQualityPassed: true,
      allowedCandidateRoles: ["repaired-family-quality-candidate"],
      automaticSelectionDefault: false,
    },
    durablePreparationJob: "art.repair.prepare-revision-selection",
    laterRankingJob: "art.candidate.select",
    rules: [
      "Candidates and the reference layer are derived from immutable revision evidence rather than caller-supplied image IDs.",
      "Every revision must describe the same repair, source manifest, original layer and impacted frame set.",
      "Every repaired family revision and its complete manifest-bound family verification must have passed.",
      "Bridge preparation stores evidence and compiles selection work but never ranks, selects, promotes or updates references.",
      "Selection and compare-and-swap promotion remain separate durable transactions.",
    ],
  };
}
