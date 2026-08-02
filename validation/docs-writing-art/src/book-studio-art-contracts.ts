export type BookArtPurpose =
  | "front_cover_art"
  | "full_wrap_art"
  | "interior_full_page_illustration"
  | "interior_half_page_illustration"
  | "interior_spot_illustration"
  | "diagram"
  | "map"
  | "ornament";

export interface BookArtIdentityV1 {
  workspaceId: string;
  projectId: string;
  bookId: string;
  editionId?: string;
  requestId: string;
}

export interface BookArtBriefV1 {
  outputKind: "evavo_book_art_brief";
  schemaVersion: 1;
  contract: "evavo_book_art_handoff_v1";
  identity: BookArtIdentityV1;
  purpose: BookArtPurpose;
  manuscript: {
    manuscriptRevisionId: string;
    manuscriptSha256: string;
    extractedTextSha256: string;
    visualCanonSha256: string;
    artDirectionSha256: string;
    approvedEvidenceIds: string[];
  };
  conceptTerritoryId: string;
  conceptTerritoryLabel: string;
  creativeThesis: string;
  primarySubject: string;
  supportingSubjects: string[];
  compositionRequirements: string[];
  mustShow: string[];
  mustNotShow: string[];
  spoilerRestrictions: string[];
  continuityRequirements: string[];
  historicalAndMaterialRequirements: string[];
  negativeSpaceRequirements: string[];
  output: {
    widthPx: number;
    heightPx: number;
    minimumPpi?: number;
    allowedMimeTypes: Array<"image/png" | "image/jpeg" | "image/webp" | "image/tiff">;
    colourIntent: "rgb" | "grayscale" | "monochrome" | "cmyk_conversion_required";
    alpha: "required" | "forbidden" | "allowed";
    textPolicy: "text_free" | "exact_editable_labels_only";
    printUse: boolean;
    digitalUse: boolean;
  };
  rightsEvidenceIds: string[];
  createdAt: string;
  briefFingerprint: string;
  providerCandidateMayBeFinal: false;
  publicationPerformed: false;
}

export interface BookArtValidationResult {
  valid: boolean;
  issues: string[];
}

const SHA = /^sha256:[a-f0-9]{64}$/;

export function validateBookArtBrief(value: BookArtBriefV1): BookArtValidationResult {
  const issues: string[] = [];
  if (value?.outputKind !== "evavo_book_art_brief") issues.push("outputKind invalid");
  if (value?.schemaVersion !== 1) issues.push("schemaVersion invalid");
  if (value?.contract !== "evavo_book_art_handoff_v1") issues.push("contract invalid");
  if (!value?.identity?.projectId || !value?.identity?.bookId) issues.push("identity invalid");
  if (!value?.manuscript?.manuscriptRevisionId) issues.push("manuscript revision invalid");
  for (const digest of [
    value?.manuscript?.manuscriptSha256,
    value?.manuscript?.extractedTextSha256,
    value?.manuscript?.visualCanonSha256,
    value?.manuscript?.artDirectionSha256,
    value?.briefFingerprint,
  ]) {
    if (typeof digest !== "string" || !SHA.test(digest)) issues.push("digest invalid");
  }
  if (!Array.isArray(value?.manuscript?.approvedEvidenceIds) || value.manuscript.approvedEvidenceIds.length === 0) {
    issues.push("approved evidence invalid");
  }
  if (!Array.isArray(value?.compositionRequirements) || value.compositionRequirements.length === 0) {
    issues.push("composition requirements invalid");
  }
  if (!Array.isArray(value?.mustNotShow) || value.mustNotShow.length === 0) {
    issues.push("mustNotShow invalid");
  }
  if (!Array.isArray(value?.continuityRequirements) || value.continuityRequirements.length === 0) {
    issues.push("continuity requirements invalid");
  }
  if (value?.providerCandidateMayBeFinal !== false) issues.push("candidate finality invalid");
  if (value?.publicationPerformed !== false) issues.push("publication invalid");
  return { valid: issues.length === 0, issues };
}
