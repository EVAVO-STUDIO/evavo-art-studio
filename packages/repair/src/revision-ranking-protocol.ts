import {
  REPAIRED_FAMILY_RANKING_PROTOCOL_VERSION,
} from "./revision-ranking-types.js";

export function repairedFamilyRankingProtocolSummary() {
  return {
    schemaVersion: "1.0" as const,
    protocolVersion: REPAIRED_FAMILY_RANKING_PROTOCOL_VERSION,
    inputArtifactRole: "repaired-family-selection-bridge-evidence",
    outputArtifactRole: "revision-bound-candidate-selection-evidence",
    kind: "art.repair.rank-revisions",
    requiredCapabilities: [
      "repair.revision-ranking",
      "selection.compare",
      "artifacts.store",
      "evidence.bundle",
    ],
    rules: [
      "Candidate, reference, policy, revision and family evidence are read only from passed immutable bridge evidence.",
      "The embedded selection request hash and selection job dependency closure are reverified before ranking.",
      "Ranking uses the existing deterministic candidate selector and retains its original evidence artifact.",
      "A revision-bound evidence wrapper links ranking back to every repaired family revision and full family verification.",
      "Ranking never creates a selected master or updates an approved reference; promotion remains a separate compare-and-swap transaction.",
    ],
  };
}
