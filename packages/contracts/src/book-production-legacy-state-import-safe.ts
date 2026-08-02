import type {
  LegacyWebsiteBookArtStateImportInputV1,
  LegacyWebsiteBookArtStateImportResultV1,
} from "./book-production-legacy-state-import.js";
import {
  importLegacyWebsiteBookArtState as importLegacyWebsiteBookArtStateUnchecked,
} from "./book-production-legacy-state-import.js";

export type {
  LegacyWebsiteBookArtSourceEvidenceV1,
  LegacyWebsiteBookArtStateImportInputV1,
  LegacyWebsiteBookArtStateImportResultV1,
} from "./book-production-legacy-state-import.js";

const ELIGIBLE_QUALITY_DECISIONS = new Map<string, string>([
  ["shortlisted", "shortlist"],
  ["approved_for_composition", "approve_for_composition"],
]);

/**
 * Public fail-closed entrypoint for Website Book Cover Studio state import.
 *
 * The lower-level translator preserves legacy evidence shape. This boundary
 * additionally rejects internally inconsistent legacy approval records before
 * any candidate receipt can leave the Art Studio contract package.
 */
export function importLegacyWebsiteBookArtState(
  input: LegacyWebsiteBookArtStateImportInputV1,
): LegacyWebsiteBookArtStateImportResultV1 {
  const safetyBlockers: string[] = [];
  const quality = record(input?.qualityAuthority);
  if (quality) {
    const candidate = record(quality.candidate);
    const provenance = record(candidate?.provenance);
    const governedArtifact = record(quality.governedArtifact);
    const humanReview = record(quality.humanReview);
    const rightsStatus = text(provenance?.rightsStatus);
    const qualityStatus = text(quality.status);
    const expectedDecision = ELIGIBLE_QUALITY_DECISIONS.get(qualityStatus);

    if (rightsStatus === "blocked") {
      safetyBlockers.push("Legacy Website artwork rights status is blocked and cannot be migrated into an Art Studio candidate.");
    }
    if (governedArtifact?.kind !== "source_artwork") {
      safetyBlockers.push("Legacy Website governed artwork must retain source_artwork kind before migration.");
    }
    const requiredRevisions = stringArray(quality.requiredRevisions);
    if (requiredRevisions.length) {
      safetyBlockers.push(...requiredRevisions.map((item) => `Legacy Website artwork retains an unresolved required revision: ${item}`));
    }
    if (expectedDecision && humanReview?.decision !== expectedDecision) {
      safetyBlockers.push(`Legacy Website artwork status ${qualityStatus} does not match human review decision ${text(humanReview?.decision) || "missing"}.`);
    }
  }

  const result = importLegacyWebsiteBookArtStateUnchecked(input);
  const uniqueBlockers = unique([...result.blockers, ...safetyBlockers]);
  if (!safetyBlockers.length) return result;
  const { receipt: _discardedReceipt, ...withoutReceipt } = result;
  return {
    ...withoutReceipt,
    status: "blocked",
    blockers: uniqueBlockers,
    warnings: unique(result.warnings),
    promotionRequired: true,
    legacyApprovalPromotedAutomatically: false,
    artifactBytesRewritten: false,
    publicationPerformed: false,
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}
function unique(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}
