export const BOOK_ART_HANDOFF_SCHEMA_VERSION = 1 as const;
export const BOOK_ART_HANDOFF_CONTRACT = "evavo_book_art_handoff_v1" as const;

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

export interface BookArtManuscriptBindingV1 {
  manuscriptRevisionId: string;
  manuscriptSha256: string;
  extractedTextSha256: string;
  visualCanonSha256: string;
  artDirectionSha256: string;
  approvedEvidenceIds: string[];
}

export interface BookArtOutputRequirementV1 {
  widthPx: number;
  heightPx: number;
  minimumPpi?: number;
  allowedMimeTypes: Array<"image/png" | "image/jpeg" | "image/webp" | "image/tiff">;
  colourIntent: "rgb" | "grayscale" | "monochrome" | "cmyk_conversion_required";
  alpha: "required" | "forbidden" | "allowed";
  textPolicy: "text_free" | "exact_editable_labels_only";
  printUse: boolean;
  digitalUse: boolean;
}

export interface BookArtBriefV1 {
  outputKind: "evavo_book_art_brief";
  schemaVersion: typeof BOOK_ART_HANDOFF_SCHEMA_VERSION;
  contract: typeof BOOK_ART_HANDOFF_CONTRACT;
  identity: BookArtIdentityV1;
  purpose: BookArtPurpose;
  manuscript: BookArtManuscriptBindingV1;
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
  output: BookArtOutputRequirementV1;
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

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/;
const SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/tiff"]);

function issue(issues: string[], condition: unknown, message: string): void {
  if (!condition) issues.push(message);
}

function isSafeId(value: unknown): value is string {
  return typeof value === "string" &&
    SAFE_ID.test(value) &&
    !["__proto__", "constructor", "prototype"].includes(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" &&
    ISO_TIMESTAMP.test(value) &&
    !Number.isNaN(Date.parse(value));
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 256 &&
    value.every((entry) => typeof entry === "string" && entry.trim() === entry && entry.length > 0 && entry.length <= 2_000);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.length <= 256 &&
    value.every((entry) => typeof entry === "string" && entry.trim() === entry && entry.length > 0 && entry.length <= 2_000);
}

function validateIdentity(identity: BookArtIdentityV1, issues: string[]): void {
  issue(issues, isSafeId(identity?.workspaceId), "workspaceId is invalid.");
  issue(issues, isSafeId(identity?.projectId), "projectId is invalid.");
  issue(issues, isSafeId(identity?.bookId), "bookId is invalid.");
  issue(issues, identity?.editionId === undefined || isSafeId(identity.editionId), "editionId is invalid.");
  issue(issues, isSafeId(identity?.requestId), "requestId is invalid.");
}

export function validateBookArtBrief(value: BookArtBriefV1): BookArtValidationResult {
  const issues: string[] = [];
  issue(issues, value?.outputKind === "evavo_book_art_brief", "Book art brief outputKind is invalid.");
  issue(issues, value?.schemaVersion === BOOK_ART_HANDOFF_SCHEMA_VERSION, "Book art brief schemaVersion is invalid.");
  issue(issues, value?.contract === BOOK_ART_HANDOFF_CONTRACT, "Book art brief contract is invalid.");
  validateIdentity(value?.identity, issues);
  issue(issues, isSafeId(value?.conceptTerritoryId), "conceptTerritoryId is invalid.");
  issue(issues, typeof value?.conceptTerritoryLabel === "string" && value.conceptTerritoryLabel.trim().length >= 3, "conceptTerritoryLabel is invalid.");
  issue(issues, typeof value?.creativeThesis === "string" && value.creativeThesis.trim().length >= 20, "creativeThesis must be substantive.");
  issue(issues, typeof value?.primarySubject === "string" && value.primarySubject.trim().length >= 3, "primarySubject is invalid.");
  issue(issues, isStringArray(value?.supportingSubjects), "supportingSubjects is invalid.");
  issue(issues, isNonEmptyStringArray(value?.compositionRequirements), "compositionRequirements are required.");
  issue(issues, isStringArray(value?.mustShow), "mustShow is invalid.");
  issue(issues, isNonEmptyStringArray(value?.mustNotShow), "mustNotShow is required.");
  issue(issues, isStringArray(value?.spoilerRestrictions), "spoilerRestrictions is invalid.");
  issue(issues, isNonEmptyStringArray(value?.continuityRequirements), "continuityRequirements are required.");
  issue(issues, isStringArray(value?.historicalAndMaterialRequirements), "historicalAndMaterialRequirements is invalid.");
  issue(issues, isStringArray(value?.negativeSpaceRequirements), "negativeSpaceRequirements is invalid.");
  issue(issues, isNonEmptyStringArray(value?.rightsEvidenceIds), "rightsEvidenceIds are required.");
  issue(issues, isTimestamp(value?.createdAt), "createdAt is invalid.");
  issue(issues, isSha256(value?.briefFingerprint), "briefFingerprint is invalid.");
  issue(issues, value?.providerCandidateMayBeFinal === false, "A provider candidate may never be marked final.");
  issue(issues, value?.publicationPerformed === false, "A Book Art brief cannot claim publication.");

  const manuscript = value?.manuscript;
  issue(issues, isSafeId(manuscript?.manuscriptRevisionId), "manuscriptRevisionId is invalid.");
  issue(issues, isSha256(manuscript?.manuscriptSha256), "manuscriptSha256 is invalid.");
  issue(issues, isSha256(manuscript?.extractedTextSha256), "extractedTextSha256 is invalid.");
  issue(issues, isSha256(manuscript?.visualCanonSha256), "visualCanonSha256 is invalid.");
  issue(issues, isSha256(manuscript?.artDirectionSha256), "artDirectionSha256 is invalid.");
  issue(issues, isNonEmptyStringArray(manuscript?.approvedEvidenceIds), "approvedEvidenceIds are required.");

  const output = value?.output;
  issue(issues, Number.isInteger(output?.widthPx) && output.widthPx >= 64 && output.widthPx <= 100_000, "output.widthPx is invalid.");
  issue(issues, Number.isInteger(output?.heightPx) && output.heightPx >= 64 && output.heightPx <= 100_000, "output.heightPx is invalid.");
  issue(issues, output?.minimumPpi === undefined || (Number.isFinite(output.minimumPpi) && output.minimumPpi >= 72 && output.minimumPpi <= 2_400), "output.minimumPpi is invalid.");
  issue(issues, Array.isArray(output?.allowedMimeTypes) && output.allowedMimeTypes.length > 0 && output.allowedMimeTypes.every((mime) => IMAGE_MIME_TYPES.has(mime)), "output.allowedMimeTypes is invalid.");
  issue(issues, output?.textPolicy === "text_free" || output?.textPolicy === "exact_editable_labels_only", "output.textPolicy is invalid.");
  if (["front_cover_art", "full_wrap_art", "interior_full_page_illustration", "interior_half_page_illustration", "interior_spot_illustration"].includes(value?.purpose)) {
    issue(issues, output?.textPolicy === "text_free", "Cover and narrative illustration artwork must remain text-free for editable book typography.");
  }
  return { valid: issues.length === 0, issues };
}
