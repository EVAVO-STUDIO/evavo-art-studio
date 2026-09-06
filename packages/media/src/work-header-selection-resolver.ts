import type { WorkHeaderCandidateReviewResult } from "./work-header-candidate-review.js";
import type { WorkHeaderVisualCritiqueResult } from "./work-header-visual-critique.js";

export const WORK_HEADER_SELECTION_RESOLVER_CONTRACT = "evavo.work-header-selection-resolver.v1" as const;

export interface WorkHeaderSelectionResolverSpec {
  readonly candidateReview: WorkHeaderCandidateReviewResult["evidence"];
  readonly critiques: readonly WorkHeaderVisualCritiqueResult[];
  readonly currentHeaderCritique?: WorkHeaderVisualCritiqueResult;
  readonly minimumVisualScore?: number;
  readonly minimumAdvantageOverCurrent?: number;
  readonly minimumTechnicalScore?: number;
  readonly maximumTechnicalDeficitToCurrent?: number;
  readonly requireCurrentHeaderBaseline?: boolean;
}

export interface WorkHeaderSelectionResolverResult {
  readonly contract: typeof WORK_HEADER_SELECTION_RESOLVER_CONTRACT;
  readonly recommendation: "retain-current" | "no-acceptable-candidate" | "candidate-recommended" | "needs-current-baseline";
  readonly recommendedCandidateId: string | null;
  readonly eligibleCandidateIds: readonly string[];
  readonly rejectedCandidateIds: readonly string[];
  readonly reasons: readonly string[];
  readonly currentHeaderBaselineProvided: boolean;
  readonly currentHeaderVisualScore: number | null;
  readonly currentHeaderTechnicalScore: number | null;
  readonly automaticPublicationAllowed: false;
  readonly automaticCloudOverwriteAllowed: false;
  readonly automaticWebsiteMutationAllowed: false;
  readonly finalHumanApprovalRequired: true;
}

function finite(value: number | undefined, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return value;
}

/**
 * Resolves comparative technical evidence + explicit visual critiques into a
 * conservative recommendation. The current header is treated as a baseline to
 * beat, not as disposable legacy media. Replacement requires both technical
 * safety and a material visual advantage. No recommendation grants mutation.
 */
export function resolveWorkHeaderSelection(spec: WorkHeaderSelectionResolverSpec): WorkHeaderSelectionResolverResult {
  if (!spec?.candidateReview || !Array.isArray(spec.candidateReview.candidates)) throw new Error("candidateReview evidence is required.");
  if (!Array.isArray(spec.critiques) || spec.critiques.length < 1) throw new Error("At least one candidate critique is required.");

  const minimumVisualScore = finite(spec.minimumVisualScore, 82, 0, 100, "minimumVisualScore");
  const minimumAdvantageOverCurrent = finite(spec.minimumAdvantageOverCurrent, 5, 0, 30, "minimumAdvantageOverCurrent");
  const minimumTechnicalScore = finite(spec.minimumTechnicalScore, 80, 0, 100, "minimumTechnicalScore");
  const maximumTechnicalDeficitToCurrent = finite(spec.maximumTechnicalDeficitToCurrent, 3, 0, 25, "maximumTechnicalDeficitToCurrent");
  const requireCurrentHeaderBaseline = spec.requireCurrentHeaderBaseline ?? true;

  const candidateById = new Map(spec.candidateReview.candidates.map((candidate) => [candidate.id, candidate] as const));
  const critiquesById = new Map<string, WorkHeaderVisualCritiqueResult>();
  for (const critique of spec.critiques) {
    if (!candidateById.has(critique.candidateId)) throw new Error(`Critique references unknown candidate ${JSON.stringify(critique.candidateId)}.`);
    if (critiquesById.has(critique.candidateId)) throw new Error(`Duplicate critique for candidate ${JSON.stringify(critique.candidateId)}.`);
    critiquesById.set(critique.candidateId, critique);
  }

  const currentVisualScore = spec.currentHeaderCritique?.visualScore ?? null;
  const currentTechnicalScore = spec.candidateReview.currentHeader?.technicalScore ?? null;
  const currentBaselineComplete = Boolean(spec.currentHeaderCritique) && currentTechnicalScore !== null;
  const reasons: string[] = [];
  if (requireCurrentHeaderBaseline && !spec.currentHeaderCritique) reasons.push("current-header-visual-baseline-required-before-replacement-recommendation");
  if (requireCurrentHeaderBaseline && currentTechnicalScore === null) reasons.push("current-header-technical-baseline-required-before-replacement-recommendation");

  const eligible: Array<{ id: string; score: number; technicalScore: number }> = [];
  const rejected = new Set<string>();
  for (const candidate of spec.candidateReview.candidates) {
    const critique = critiquesById.get(candidate.id);
    if (!candidate.technicallyEligibleForVisualReview) {
      rejected.add(candidate.id);
      continue;
    }
    if (!critique) {
      rejected.add(candidate.id);
      reasons.push(`missing-visual-critique:${candidate.id}`);
      continue;
    }
    if (critique.verdict !== "visual-shortlist" || !critique.eligibleForFinalSelection) {
      rejected.add(candidate.id);
      continue;
    }
    if (critique.disqualifiers.length > 0 || critique.visualScore < minimumVisualScore || candidate.technicalScore < minimumTechnicalScore) {
      rejected.add(candidate.id);
      continue;
    }
    if (candidate.nearDuplicateOfSupport || candidate.exactDuplicateOfSupport) {
      rejected.add(candidate.id);
      reasons.push(`candidate-too-similar-to-support:${candidate.id}`);
      continue;
    }
    if (currentTechnicalScore !== null && candidate.technicalScore < currentTechnicalScore - maximumTechnicalDeficitToCurrent) {
      rejected.add(candidate.id);
      reasons.push(`candidate-technically-worse-than-current:${candidate.id}:${candidate.technicalScore}<${currentTechnicalScore - maximumTechnicalDeficitToCurrent}`);
      continue;
    }
    eligible.push({ id: candidate.id, score: critique.visualScore, technicalScore: candidate.technicalScore });
  }

  eligible.sort((a, b) => b.score - a.score || b.technicalScore - a.technicalScore || a.id.localeCompare(b.id));

  if (requireCurrentHeaderBaseline && !currentBaselineComplete) {
    return Object.freeze({
      contract: WORK_HEADER_SELECTION_RESOLVER_CONTRACT,
      recommendation: "needs-current-baseline",
      recommendedCandidateId: null,
      eligibleCandidateIds: Object.freeze(eligible.map((item) => item.id)),
      rejectedCandidateIds: Object.freeze([...rejected]),
      reasons: Object.freeze(reasons),
      currentHeaderBaselineProvided: false,
      currentHeaderVisualScore: currentVisualScore,
      currentHeaderTechnicalScore,
      automaticPublicationAllowed: false,
      automaticCloudOverwriteAllowed: false,
      automaticWebsiteMutationAllowed: false,
      finalHumanApprovalRequired: true,
    });
  }

  if (eligible.length === 0) {
    reasons.push("no-candidate-cleared-technical-and-visual-selection-gates");
    return Object.freeze({
      contract: WORK_HEADER_SELECTION_RESOLVER_CONTRACT,
      recommendation: currentBaselineComplete ? "retain-current" : "no-acceptable-candidate",
      recommendedCandidateId: null,
      eligibleCandidateIds: Object.freeze([]),
      rejectedCandidateIds: Object.freeze([...rejected]),
      reasons: Object.freeze(reasons),
      currentHeaderBaselineProvided: currentBaselineComplete,
      currentHeaderVisualScore: currentVisualScore,
      currentHeaderTechnicalScore,
      automaticPublicationAllowed: false,
      automaticCloudOverwriteAllowed: false,
      automaticWebsiteMutationAllowed: false,
      finalHumanApprovalRequired: true,
    });
  }

  const best = eligible[0]!;
  if (currentVisualScore !== null && best.score < currentVisualScore + minimumAdvantageOverCurrent) {
    reasons.push(`best-candidate-does-not-beat-current-by-required-margin:${best.score}<${currentVisualScore + minimumAdvantageOverCurrent}`);
    return Object.freeze({
      contract: WORK_HEADER_SELECTION_RESOLVER_CONTRACT,
      recommendation: "retain-current",
      recommendedCandidateId: null,
      eligibleCandidateIds: Object.freeze(eligible.map((item) => item.id)),
      rejectedCandidateIds: Object.freeze([...rejected]),
      reasons: Object.freeze(reasons),
      currentHeaderBaselineProvided: currentBaselineComplete,
      currentHeaderVisualScore: currentVisualScore,
      currentHeaderTechnicalScore,
      automaticPublicationAllowed: false,
      automaticCloudOverwriteAllowed: false,
      automaticWebsiteMutationAllowed: false,
      finalHumanApprovalRequired: true,
    });
  }

  reasons.push(`candidate-proves-material-comparative-advantage:${best.id}`);
  return Object.freeze({
    contract: WORK_HEADER_SELECTION_RESOLVER_CONTRACT,
    recommendation: "candidate-recommended",
    recommendedCandidateId: best.id,
    eligibleCandidateIds: Object.freeze(eligible.map((item) => item.id)),
    rejectedCandidateIds: Object.freeze([...rejected]),
    reasons: Object.freeze(reasons),
    currentHeaderBaselineProvided: currentBaselineComplete,
    currentHeaderVisualScore: currentVisualScore,
    currentHeaderTechnicalScore,
    automaticPublicationAllowed: false,
    automaticCloudOverwriteAllowed: false,
    automaticWebsiteMutationAllowed: false,
    finalHumanApprovalRequired: true,
  });
}
