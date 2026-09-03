export const FACTUAL_VISUAL_AUTHORITY_CONTRACT_VERSION = "evavo_art_factual_visual_authority_v1" as const;

export type FactualVisualClass =
  | "decorative"
  | "diagram"
  | "scientific-illustration"
  | "historical-reconstruction"
  | "technical-cutaway"
  | "data-derived-visual"
  | "documentary-derivative";

export type FactualVisualAuthority = Readonly<{
  contractVersion: typeof FACTUAL_VISUAL_AUTHORITY_CONTRACT_VERSION;
  visualId: string;
  visualClass: FactualVisualClass;
  factual: boolean;
  claimIds: readonly string[];
  sourceIds: readonly string[];
  protectedFacts: readonly string[];
  protectedGeometry: readonly string[];
  permittedSimplifications: readonly string[];
  uncertaintyNotes: readonly string[];
  origin: "human-authored" | "generated" | "mixed" | "data-derived" | "documentary-source";
  documentaryAppearance: boolean;
  disclosure: Readonly<{
    required: boolean;
    text: string | null;
  }>;
  review: Readonly<{
    factReviewed: boolean;
    geometryReviewed: boolean;
    disclosureReviewed: boolean;
    unresolvedBlockers: readonly string[];
  }>;
  approval: "candidate" | "review-required" | "approved" | "rejected";
  truth: Readonly<{
    generatedVisualDoesNotBecomeDocumentaryEvidence: true;
    visualApprovalDoesNotProveUnderlyingClaims: true;
    protectedFactsMustNotBeSilentlyChanged: true;
  }>;
}>;

export type FactualVisualAuthorityIssue = Readonly<{ code: string; path: string }>;
export type FactualVisualAuthorityValidation = Readonly<{
  valid: boolean;
  issues: readonly FactualVisualAuthorityIssue[];
}>;

const VISUAL_CLASSES = new Set<string>([
  "decorative", "diagram", "scientific-illustration", "historical-reconstruction",
  "technical-cutaway", "data-derived-visual", "documentary-derivative",
]);
const ORIGINS = new Set<string>(["human-authored", "generated", "mixed", "data-derived", "documentary-source"]);
const APPROVALS = new Set<string>(["candidate", "review-required", "approved", "rejected"]);

function issue(code: string, path: string): FactualVisualAuthorityIssue {
  return Object.freeze({ code, path });
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

export function validateFactualVisualAuthority(value: unknown): FactualVisualAuthorityValidation {
  const issues: FactualVisualAuthorityIssue[] = [];
  const root = record(value);
  if (!root) return Object.freeze({ valid: false, issues: [issue("ART_FACTUAL_VISUAL_DOCUMENT_INVALID", "$")] });

  if (root.contractVersion !== FACTUAL_VISUAL_AUTHORITY_CONTRACT_VERSION) issues.push(issue("ART_FACTUAL_VISUAL_CONTRACT_UNSUPPORTED", "$.contractVersion"));
  if (typeof root.visualId !== "string" || !root.visualId.trim()) issues.push(issue("ART_FACTUAL_VISUAL_ID_REQUIRED", "$.visualId"));
  if (typeof root.visualClass !== "string" || !VISUAL_CLASSES.has(root.visualClass)) issues.push(issue("ART_FACTUAL_VISUAL_CLASS_INVALID", "$.visualClass"));
  if (typeof root.factual !== "boolean") issues.push(issue("ART_FACTUAL_VISUAL_FACTUAL_FLAG_REQUIRED", "$.factual"));
  if (!stringArray(root.claimIds)) issues.push(issue("ART_FACTUAL_VISUAL_CLAIMS_INVALID", "$.claimIds"));
  if (!stringArray(root.sourceIds)) issues.push(issue("ART_FACTUAL_VISUAL_SOURCES_INVALID", "$.sourceIds"));
  if (!stringArray(root.protectedFacts)) issues.push(issue("ART_FACTUAL_VISUAL_PROTECTED_FACTS_INVALID", "$.protectedFacts"));
  if (!stringArray(root.protectedGeometry)) issues.push(issue("ART_FACTUAL_VISUAL_PROTECTED_GEOMETRY_INVALID", "$.protectedGeometry"));
  if (!stringArray(root.permittedSimplifications)) issues.push(issue("ART_FACTUAL_VISUAL_SIMPLIFICATIONS_INVALID", "$.permittedSimplifications"));
  if (!stringArray(root.uncertaintyNotes)) issues.push(issue("ART_FACTUAL_VISUAL_UNCERTAINTY_INVALID", "$.uncertaintyNotes"));
  if (typeof root.origin !== "string" || !ORIGINS.has(root.origin)) issues.push(issue("ART_FACTUAL_VISUAL_ORIGIN_INVALID", "$.origin"));
  if (typeof root.documentaryAppearance !== "boolean") issues.push(issue("ART_FACTUAL_VISUAL_DOCUMENTARY_APPEARANCE_REQUIRED", "$.documentaryAppearance"));

  if (root.factual === true) {
    if (!Array.isArray(root.claimIds) || root.claimIds.length === 0) issues.push(issue("ART_FACTUAL_VISUAL_FACTUAL_CLAIMS_REQUIRED", "$.claimIds"));
    if (!Array.isArray(root.sourceIds) || root.sourceIds.length === 0) issues.push(issue("ART_FACTUAL_VISUAL_FACTUAL_SOURCES_REQUIRED", "$.sourceIds"));
    if (!Array.isArray(root.protectedFacts) || root.protectedFacts.length === 0) issues.push(issue("ART_FACTUAL_VISUAL_PROTECTED_FACTS_REQUIRED", "$.protectedFacts"));
  }

  const disclosure = record(root.disclosure);
  if (!disclosure) {
    issues.push(issue("ART_FACTUAL_VISUAL_DISCLOSURE_REQUIRED", "$.disclosure"));
  } else {
    if (typeof disclosure.required !== "boolean") issues.push(issue("ART_FACTUAL_VISUAL_DISCLOSURE_FLAG_INVALID", "$.disclosure.required"));
    if (disclosure.text !== null && (typeof disclosure.text !== "string" || !disclosure.text.trim())) issues.push(issue("ART_FACTUAL_VISUAL_DISCLOSURE_TEXT_INVALID", "$.disclosure.text"));
    const generatedDocumentary = root.documentaryAppearance === true && ["generated", "mixed"].includes(String(root.origin));
    const reconstruction = root.visualClass === "historical-reconstruction";
    if ((generatedDocumentary || reconstruction) && disclosure.required !== true) issues.push(issue("ART_FACTUAL_VISUAL_DISCLOSURE_MUST_BE_REQUIRED", "$.disclosure.required"));
    if ((generatedDocumentary || reconstruction) && (typeof disclosure.text !== "string" || !disclosure.text.trim())) issues.push(issue("ART_FACTUAL_VISUAL_DISCLOSURE_TEXT_REQUIRED", "$.disclosure.text"));
  }

  const review = record(root.review);
  if (!review) {
    issues.push(issue("ART_FACTUAL_VISUAL_REVIEW_REQUIRED", "$.review"));
  } else {
    for (const field of ["factReviewed", "geometryReviewed", "disclosureReviewed"] as const) {
      if (typeof review[field] !== "boolean") issues.push(issue("ART_FACTUAL_VISUAL_REVIEW_FLAG_INVALID", `$.review.${field}`));
    }
    if (!stringArray(review.unresolvedBlockers)) issues.push(issue("ART_FACTUAL_VISUAL_BLOCKERS_INVALID", "$.review.unresolvedBlockers"));
    if (root.approval === "approved") {
      if (root.factual === true && review.factReviewed !== true) issues.push(issue("ART_FACTUAL_VISUAL_FACT_REVIEW_REQUIRED", "$.review.factReviewed"));
      if (Array.isArray(root.protectedGeometry) && root.protectedGeometry.length > 0 && review.geometryReviewed !== true) issues.push(issue("ART_FACTUAL_VISUAL_GEOMETRY_REVIEW_REQUIRED", "$.review.geometryReviewed"));
      if (disclosure?.required === true && review.disclosureReviewed !== true) issues.push(issue("ART_FACTUAL_VISUAL_DISCLOSURE_REVIEW_REQUIRED", "$.review.disclosureReviewed"));
      if (Array.isArray(review.unresolvedBlockers) && review.unresolvedBlockers.length > 0) issues.push(issue("ART_FACTUAL_VISUAL_UNRESOLVED_BLOCKERS", "$.review.unresolvedBlockers"));
    }
  }

  if (typeof root.approval !== "string" || !APPROVALS.has(root.approval)) issues.push(issue("ART_FACTUAL_VISUAL_APPROVAL_INVALID", "$.approval"));
  const truth = record(root.truth);
  if (!truth || truth.generatedVisualDoesNotBecomeDocumentaryEvidence !== true || truth.visualApprovalDoesNotProveUnderlyingClaims !== true || truth.protectedFactsMustNotBeSilentlyChanged !== true) {
    issues.push(issue("ART_FACTUAL_VISUAL_TRUTH_BOUNDARIES_REQUIRED", "$.truth"));
  }

  return Object.freeze({ valid: issues.length === 0, issues: Object.freeze(issues) });
}

export function assertFactualVisualAuthority(value: unknown): asserts value is FactualVisualAuthority {
  const result = validateFactualVisualAuthority(value);
  if (!result.valid) throw new Error(`ART_FACTUAL_VISUAL_INVALID:${result.issues.map((entry) => entry.code).join(",")}`);
}
