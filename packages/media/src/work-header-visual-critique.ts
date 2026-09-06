export const WORK_HEADER_VISUAL_CRITIQUE_CONTRACT = "evavo.work-header-visual-critique.v1" as const;

export interface WorkHeaderVisualCritiqueInput {
  readonly candidateId: string;
  readonly candidateSha256: string;
  readonly candidateReviewEvidenceSha256: string;
  readonly semanticRelevance: number;
  readonly focalPointStrength: number;
  readonly cropStability: number;
  readonly hierarchyCompatibility: number;
  readonly brandFit: number;
  readonly authenticity: number;
  readonly detailCredibility: number;
  readonly supportImageDistinctness: number;
  readonly deliberateDesignerChoice: number;
  readonly looksGenericOrStock: boolean;
  readonly looksAiGeneratedOrMalformed: boolean;
  readonly looksBlurryOrCheap: boolean;
  readonly textOrLogoDamage: boolean;
  readonly mobileCropFailure: boolean;
  readonly notes: readonly string[];
}

export interface WorkHeaderVisualCritiqueResult {
  readonly contract: typeof WORK_HEADER_VISUAL_CRITIQUE_CONTRACT;
  readonly candidateId: string;
  readonly candidateSha256: string;
  readonly candidateReviewEvidenceSha256: string;
  readonly visualScore: number;
  readonly disqualifiers: readonly string[];
  readonly weaknesses: readonly string[];
  readonly strengths: readonly string[];
  readonly verdict: "reject" | "rework" | "visual-shortlist";
  readonly eligibleForFinalSelection: boolean;
  readonly humanOrVisionReviewPerformed: true;
  readonly exactImageHashBound: true;
  readonly exactReviewEvidenceHashBound: true;
  readonly automaticPublicationAllowed: false;
  readonly automaticCloudOverwriteAllowed: false;
  readonly finalSelectionStillRequiresComparativeReview: true;
}

const RATING_FIELDS = [
  "semanticRelevance",
  "focalPointStrength",
  "cropStability",
  "hierarchyCompatibility",
  "brandFit",
  "authenticity",
  "detailCredibility",
  "supportImageDistinctness",
  "deliberateDesignerChoice",
] as const;

function rating(value: unknown, label: string): number {
  if (!Number.isFinite(value) || Number(value) < 0 || Number(value) > 5) throw new Error(`${label} must be a number from 0 through 5.`);
  return Number(value);
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) throw new Error(`${label} must be a lowercase SHA-256 hex digest.`);
  return value;
}

export function judgeWorkHeaderVisualCritique(input: WorkHeaderVisualCritiqueInput): WorkHeaderVisualCritiqueResult {
  if (!input?.candidateId?.trim()) throw new Error("candidateId is required.");
  const candidateSha256 = sha256(input.candidateSha256, "candidateSha256");
  const candidateReviewEvidenceSha256 = sha256(input.candidateReviewEvidenceSha256, "candidateReviewEvidenceSha256");
  const values = RATING_FIELDS.map((field) => rating(input[field], field));
  if (!Array.isArray(input.notes) || input.notes.some((note) => typeof note !== "string" || !note.trim())) {
    throw new Error("notes must be an array of non-empty strings.");
  }

  const disqualifiers: string[] = [];
  if (input.looksGenericOrStock) disqualifiers.push("generic-or-stock-looking");
  if (input.looksAiGeneratedOrMalformed) disqualifiers.push("ai-looking-or-malformed");
  if (input.looksBlurryOrCheap) disqualifiers.push("blurry-or-cheap-looking");
  if (input.textOrLogoDamage) disqualifiers.push("text-or-logo-damage");
  if (input.mobileCropFailure) disqualifiers.push("mobile-crop-failure");

  const weaknesses: string[] = [];
  const strengths: string[] = [];
  RATING_FIELDS.forEach((field, index) => {
    const value = values[index]!;
    if (value <= 2) weaknesses.push(`${field}:${value.toFixed(1)}/5`);
    else if (value >= 4) strengths.push(`${field}:${value.toFixed(1)}/5`);
  });

  const weighted = (
    values[0]! * 1.35 +
    values[1]! * 1.10 +
    values[2]! * 1.25 +
    values[3]! * 1.15 +
    values[4]! * 1.10 +
    values[5]! * 1.15 +
    values[6]! * 1.00 +
    values[7]! * 0.95 +
    values[8]! * 1.45
  );
  const maximumWeighted = 5 * (1.35 + 1.10 + 1.25 + 1.15 + 1.10 + 1.15 + 1.00 + 0.95 + 1.45);
  const visualScore = Math.round((weighted / maximumWeighted) * 100);

  let verdict: WorkHeaderVisualCritiqueResult["verdict"];
  if (disqualifiers.length > 0 || values[0]! < 2.5 || values[2]! < 2.5 || values[8]! < 2.5 || visualScore < 62) verdict = "reject";
  else if (weaknesses.length > 0 || visualScore < 80) verdict = "rework";
  else verdict = "visual-shortlist";

  return Object.freeze({
    contract: WORK_HEADER_VISUAL_CRITIQUE_CONTRACT,
    candidateId: input.candidateId,
    candidateSha256,
    candidateReviewEvidenceSha256,
    visualScore,
    disqualifiers: Object.freeze(disqualifiers),
    weaknesses: Object.freeze(weaknesses),
    strengths: Object.freeze(strengths),
    verdict,
    eligibleForFinalSelection: verdict === "visual-shortlist",
    humanOrVisionReviewPerformed: true,
    exactImageHashBound: true,
    exactReviewEvidenceHashBound: true,
    automaticPublicationAllowed: false,
    automaticCloudOverwriteAllowed: false,
    finalSelectionStillRequiresComparativeReview: true,
  });
}
