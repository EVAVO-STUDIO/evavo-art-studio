/**
 * Versioned, dependency-light Book Studio <-> Art Studio handoff contracts.
 *
 * Docs Suite owns manuscript/edition intent and final book use. Art Studio owns
 * candidate execution, technical evidence, selection evidence and promotion.
 */

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

export type BookArtCandidateStatus = "candidate" | "review_required" | "approved" | "rejected";

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

export interface BookArtProvenanceV1 {
  origin:
    | "commissioned"
    | "licensed"
    | "human_authored"
    | "ai_assisted"
    | "ai_generated"
    | "mixed_composite";
  provider?: string;
  model?: string;
  modelVersion?: string;
  promptSha256?: string;
  seed?: string;
  sourceArtifactIds: string[];
  rightsEvidenceIds: string[];
  rightsStatus: "approved_commercial" | "review_required" | "blocked";
  aiDisclosure: "not_applicable" | "ai_assisted" | "ai_generated" | "review_required";
}

export interface BookArtArtifactReceiptV1 {
  outputKind: "evavo_book_art_artifact_receipt";
  schemaVersion: typeof BOOK_ART_HANDOFF_SCHEMA_VERSION;
  contract: typeof BOOK_ART_HANDOFF_CONTRACT;
  identity: BookArtIdentityV1;
  sourceBriefFingerprint: string;
  status: BookArtCandidateStatus;
  artifactId: string;
  artifactReference: string;
  contentSha256: string;
  byteLength: number;
  mimeType: string;
  widthPx: number;
  heightPx: number;
  provenance: BookArtProvenanceV1;
  technicalQualityReceiptSha256: string;
  selectionReceiptSha256?: string;
  promotionReceiptSha256?: string;
  promotedBy?: string;
  promotedAt?: string;
  generatedTextDetected: boolean;
  unresolvedRisks: string[];
  artifactFingerprint: string;
  publicationPerformed: false;
}

export interface BookArtworkUseBindingV1 {
  outputKind: "evavo_book_artwork_use_binding";
  schemaVersion: typeof BOOK_ART_HANDOFF_SCHEMA_VERSION;
  contract: typeof BOOK_ART_HANDOFF_CONTRACT;
  identity: BookArtIdentityV1;
  purpose: BookArtPurpose;
  sourceBriefFingerprint: string;
  approvedArtifactId: string;
  approvedArtifactReference: string;
  approvedArtifactSha256: string;
  promotionReceiptSha256: string;
  sceneOrPlacementId: string;
  cropOrPlacementSha256: string;
  boundAt: string;
  boundBy: string;
  useFingerprint: string;
  canonicalRendererMustVerifyBytes: true;
  publicationPerformed: false;
}

export interface BookArtValidationResult {
  valid: boolean;
  issues: string[];
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/;
const SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/;
const ARTIFACT_REFERENCE = /^(?:evavo-art|art-studio|book-artifact):\/\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/tiff"]);

function issue(issues: string[], condition: unknown, message: string): void { if (!condition) issues.push(message); }
function isSafeId(value: unknown): value is string { return typeof value === "string" && SAFE_ID.test(value) && !["__proto__", "constructor", "prototype"].includes(value); }
function isSha256(value: unknown): value is string { return typeof value === "string" && SHA256.test(value); }
function isTimestamp(value: unknown): value is string { return typeof value === "string" && ISO_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value)); }
function isNonEmptyStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.length > 0 && value.length <= 256 && value.every((entry) => typeof entry === "string" && entry.trim() === entry && entry.length > 0 && entry.length <= 2_000); }
function isStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.length <= 256 && value.every((entry) => typeof entry === "string" && entry.trim() === entry && entry.length > 0 && entry.length <= 2_000); }
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
  if (["front_cover_art", "full_wrap_art", "interior_full_page_illustration", "interior_half_page_illustration", "interior_spot_illustration"].includes(value?.purpose)) issue(issues, output?.textPolicy === "text_free", "Cover and narrative illustration artwork must remain text-free for editable book typography.");
  return { valid: issues.length === 0, issues };
}

export function validateBookArtArtifactReceipt(value: BookArtArtifactReceiptV1): BookArtValidationResult {
  const issues: string[] = [];
  issue(issues, value?.outputKind === "evavo_book_art_artifact_receipt", "Artifact receipt outputKind is invalid.");
  issue(issues, value?.schemaVersion === BOOK_ART_HANDOFF_SCHEMA_VERSION, "Artifact receipt schemaVersion is invalid.");
  issue(issues, value?.contract === BOOK_ART_HANDOFF_CONTRACT, "Artifact receipt contract is invalid.");
  validateIdentity(value?.identity, issues);
  issue(issues, isSha256(value?.sourceBriefFingerprint), "sourceBriefFingerprint is invalid.");
  issue(issues, isSafeId(value?.artifactId), "artifactId is invalid.");
  issue(issues, typeof value?.artifactReference === "string" && ARTIFACT_REFERENCE.test(value.artifactReference), "artifactReference is invalid.");
  issue(issues, isSha256(value?.contentSha256), "contentSha256 is invalid.");
  issue(issues, Number.isSafeInteger(value?.byteLength) && value.byteLength > 0, "byteLength is invalid.");
  issue(issues, typeof value?.mimeType === "string" && IMAGE_MIME_TYPES.has(value.mimeType), "mimeType is invalid.");
  issue(issues, Number.isInteger(value?.widthPx) && value.widthPx > 0, "widthPx is invalid.");
  issue(issues, Number.isInteger(value?.heightPx) && value.heightPx > 0, "heightPx is invalid.");
  issue(issues, isSha256(value?.technicalQualityReceiptSha256), "technicalQualityReceiptSha256 is invalid.");
  issue(issues, value?.selectionReceiptSha256 === undefined || isSha256(value.selectionReceiptSha256), "selectionReceiptSha256 is invalid.");
  issue(issues, value?.promotionReceiptSha256 === undefined || isSha256(value.promotionReceiptSha256), "promotionReceiptSha256 is invalid.");
  issue(issues, value?.promotedAt === undefined || isTimestamp(value.promotedAt), "promotedAt is invalid.");
  issue(issues, isStringArray(value?.unresolvedRisks), "unresolvedRisks is invalid.");
  issue(issues, isSha256(value?.artifactFingerprint), "artifactFingerprint is invalid.");
  issue(issues, value?.publicationPerformed === false, "An Art Studio artifact receipt cannot claim publication.");
  issue(issues, isStringArray(value?.provenance?.sourceArtifactIds), "provenance.sourceArtifactIds is invalid.");
  issue(issues, isNonEmptyStringArray(value?.provenance?.rightsEvidenceIds), "provenance.rightsEvidenceIds are required.");
  if (value?.status === "approved") {
    issue(issues, isSha256(value.promotionReceiptSha256), "Approved artwork requires a promotionReceiptSha256.");
    issue(issues, isSha256(value.selectionReceiptSha256), "Approved artwork requires a selectionReceiptSha256.");
    issue(issues, typeof value.promotedBy === "string" && value.promotedBy.trim().length > 0, "Approved artwork requires promotedBy.");
    issue(issues, isTimestamp(value.promotedAt), "Approved artwork requires promotedAt.");
    issue(issues, value.provenance?.rightsStatus === "approved_commercial", "Approved artwork requires approved commercial rights.");
    issue(issues, value.generatedTextDetected === false, "Approved artwork cannot retain generated text contamination.");
    issue(issues, value.unresolvedRisks.length === 0, "Approved artwork cannot retain unresolved risks.");
  }
  return { valid: issues.length === 0, issues };
}

export function validateBookArtworkUseBinding(value: BookArtworkUseBindingV1, artifact: BookArtArtifactReceiptV1): BookArtValidationResult {
  const issues = [...validateBookArtArtifactReceipt(artifact).issues];
  issue(issues, value?.outputKind === "evavo_book_artwork_use_binding", "Artwork use binding outputKind is invalid.");
  issue(issues, value?.schemaVersion === BOOK_ART_HANDOFF_SCHEMA_VERSION, "Artwork use binding schemaVersion is invalid.");
  issue(issues, value?.contract === BOOK_ART_HANDOFF_CONTRACT, "Artwork use binding contract is invalid.");
  validateIdentity(value?.identity, issues);
  issue(issues, artifact?.status === "approved", "Book use requires an approved Art Studio artifact.");
  issue(issues, value?.approvedArtifactId === artifact?.artifactId, "Binding artifactId differs from the approved artifact.");
  issue(issues, value?.approvedArtifactReference === artifact?.artifactReference, "Binding artifactReference differs from the approved artifact.");
  issue(issues, value?.approvedArtifactSha256 === artifact?.contentSha256, "Binding artifact SHA-256 differs from the approved artifact.");
  issue(issues, value?.promotionReceiptSha256 === artifact?.promotionReceiptSha256, "Binding promotion receipt differs from the approved artifact.");
  issue(issues, value?.sourceBriefFingerprint === artifact?.sourceBriefFingerprint, "Binding source brief differs from the approved artifact.");
  issue(issues, isSafeId(value?.sceneOrPlacementId), "sceneOrPlacementId is invalid.");
  issue(issues, isSha256(value?.cropOrPlacementSha256), "cropOrPlacementSha256 is invalid.");
  issue(issues, isTimestamp(value?.boundAt), "boundAt is invalid.");
  issue(issues, typeof value?.boundBy === "string" && value.boundBy.trim().length > 0, "boundBy is invalid.");
  issue(issues, isSha256(value?.useFingerprint), "useFingerprint is invalid.");
  issue(issues, value?.canonicalRendererMustVerifyBytes === true, "Canonical renderer byte verification is mandatory.");
  issue(issues, value?.publicationPerformed === false, "An artwork use binding cannot claim publication.");
  return { valid: issues.length === 0, issues };
}
