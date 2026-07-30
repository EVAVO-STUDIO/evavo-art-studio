import {
  REPAIRED_FAMILY_PROMOTION_PROTOCOL_VERSION,
} from "./revision-promotion-types.js";

export function repairedFamilyPromotionProtocolSummary() {
  return {
    schemaVersion: "1.0" as const,
    protocolVersion: REPAIRED_FAMILY_PROMOTION_PROTOCOL_VERSION,
    inputArtifactRole: "revision-bound-candidate-selection-evidence",
    outputArtifactRole: "revision-bound-promotion-evidence",
    kind: "art.repair.promote-revision",
    requiredCapabilities: [
      "repair.revision-promote",
      "selection.promote",
      "artifacts.store",
      "evidence.bundle",
    ],
    rules: [
      "The candidate and ordinary selection evidence are derived from immutable revision-bound ranking evidence.",
      "The target reference must currently point to the approved source layer declared by the repaired-family ranking.",
      "Automatic promotion requires an automatically selected, promotion-eligible candidate with complete evidence.",
      "Human approval may promote only the highest-ranked hard-gate-eligible candidate and requires a named approver and reason.",
      "A revision-bound selection envelope is inserted into selected-master lineage before compare-and-swap reference mutation.",
      "Stale reference generation or artifact state fails closed without overwriting the current reference.",
    ],
  };
}
