import type {
  BookArtArtifactReceiptV1,
  BookArtIdentityV1,
  BookArtProvenanceV1,
} from "./book-production.js";
import { validateLegacyCompatibleBookArtArtifactReceipt } from "./book-production-legacy-compat.js";

export interface LegacyWebsiteBookArtStateImportInputV1 {
  outputKind: "evavo_legacy_website_book_art_state_import_input";
  schemaVersion: 1;
  identity: BookArtIdentityV1;
  sourceBriefFingerprint: string;
  qualityAuthority: unknown;
  candidateSetAuthority?: unknown;
  selectionBinding?: unknown;
}

export interface LegacyWebsiteBookArtSourceEvidenceV1 {
  qualityAuthoritySha256?: string;
  candidateSetAuthoritySha256?: string;
  selectionBindingSha256?: string;
  selectedBy?: string;
  selectedByRole?: string;
  selectedAt?: string;
}

export interface LegacyWebsiteBookArtStateImportResultV1 {
  outputKind: "evavo_legacy_website_book_art_state_import_result";
  schemaVersion: 1;
  status: "blocked" | "candidate_imported" | "selection_evidence_imported";
  identity: BookArtIdentityV1;
  receipt?: BookArtArtifactReceiptV1;
  sourceEvidence: LegacyWebsiteBookArtSourceEvidenceV1;
  blockers: string[];
  warnings: string[];
  promotionRequired: true;
  legacyApprovalPromotedAutomatically: false;
  artifactBytesRewritten: false;
  publicationPerformed: false;
}

const SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/tiff"]);
const QUALITY_STATUSES = new Set(["shortlisted", "approved_for_composition"]);
const RIGHTS_STATUSES = new Set<BookArtProvenanceV1["rightsStatus"]>([
  "approved_commercial",
  "review_required",
  "blocked",
]);
const LEGACY_ORIGIN_MAP: Readonly<Record<string, BookArtProvenanceV1["origin"]>> = {
  photographic_capture: "human_authored",
  commissioned_illustration: "commissioned",
  licensed_artwork: "licensed",
  human_digital_art: "human_authored",
  generative_assisted: "ai_assisted",
  generative_primary: "ai_generated",
  mixed_composite: "mixed_composite",
};

export function importLegacyWebsiteBookArtState(
  input: LegacyWebsiteBookArtStateImportInputV1,
): LegacyWebsiteBookArtStateImportResultV1 {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const sourceEvidence: LegacyWebsiteBookArtSourceEvidenceV1 = {};
  const identity = cloneIdentity(input?.identity);
  validateIdentity(identity, blockers);

  if (input?.outputKind !== "evavo_legacy_website_book_art_state_import_input" || input?.schemaVersion !== 1) {
    blockers.push("Legacy Website Book Art import kind or version is invalid.");
  }
  const sourceBriefFingerprint = text(input?.sourceBriefFingerprint);
  if (!isSha(sourceBriefFingerprint)) {
    blockers.push("Legacy Website Book Art import requires an exact sourceBriefFingerprint.");
  }

  const quality = record(input?.qualityAuthority);
  if (!quality) {
    return blocked(identity, sourceEvidence, [
      ...blockers,
      "Legacy Website Book Art quality authority must be an object.",
    ], warnings);
  }
  const candidate = record(quality.candidate) ?? {};
  const governed = record(quality.governedArtifact) ?? {};
  const provenance = record(candidate.provenance) ?? {};
  const humanReview = record(quality.humanReview) ?? {};
  const answers = record(humanReview.answers) ?? {};

  if (quality.outputKind !== "book_cover_artwork_quality_authority" || quality.version !== "book_cover_artwork_quality_authority_v1") {
    blockers.push("Legacy Website artwork quality authority kind or version is invalid.");
  }
  if (quality.projectId !== identity.projectId) {
    blockers.push("Legacy Website artwork quality authority belongs to a different project.");
  }
  const qualityDigest = text(quality.authorityDigestSha256);
  if (!isSha(qualityDigest)) blockers.push("Legacy Website artwork quality authority digest is invalid.");
  else sourceEvidence.qualityAuthoritySha256 = qualityDigest;
  if (quality.artDirectionDigestSha256 !== sourceBriefFingerprint || !isSha(quality.artDirectionDigestSha256)) {
    blockers.push("Legacy Website art direction does not match the imported source brief fingerprint.");
  }
  const qualityStatus = text(quality.status);
  if (!QUALITY_STATUSES.has(qualityStatus)) {
    blockers.push(`Legacy Website artwork quality status ${qualityStatus || "missing"} is not eligible for migration review.`);
  }
  blockers.push(...stringArray(quality.hardErrors).map((item) => `Legacy quality blocker: ${item}`));
  warnings.push(...stringArray(quality.warnings).map((item) => `Legacy quality warning: ${item}`));
  warnings.push(...stringArray(quality.requiredRevisions).map((item) => `Legacy required revision: ${item}`));

  const candidateId = text(candidate.candidateId);
  const artifactReference = text(candidate.artifactReference);
  const contentSha256 = text(candidate.expectedSha256);
  if (!isSafeId(candidateId)) blockers.push("Legacy Website candidateId is invalid.");
  if (!artifactReference) blockers.push("Legacy Website candidate artifact reference is missing.");
  if (!isSha(contentSha256)) blockers.push("Legacy Website candidate checksum is invalid.");
  if (governed.reference !== artifactReference) blockers.push("Legacy Website governed artifact reference differs from the candidate.");
  if (governed.checksumSha256 !== contentSha256) blockers.push("Legacy Website governed artifact checksum differs from the candidate.");

  const byteLength = numeric(governed.byteLength);
  const widthPx = numeric(governed.widthPx);
  const heightPx = numeric(governed.heightPx);
  const mimeType = text(governed.mimeType);
  if (!Number.isSafeInteger(byteLength) || byteLength <= 0) blockers.push("Legacy Website governed artifact byte length is invalid.");
  if (!Number.isInteger(widthPx) || widthPx <= 0 || !Number.isInteger(heightPx) || heightPx <= 0) {
    blockers.push("Legacy Website governed artifact dimensions are invalid.");
  }
  if (!MIME_TYPES.has(mimeType)) blockers.push("Legacy Website governed artifact MIME type is unsupported.");

  const legacyOrigin = text(provenance.origin);
  const mappedOrigin = LEGACY_ORIGIN_MAP[legacyOrigin];
  if (!mappedOrigin) blockers.push(`Legacy Website artwork origin ${legacyOrigin || "missing"} is not safely migratable.`);
  const rightsStatusText = text(provenance.rightsStatus);
  const rightsStatus = RIGHTS_STATUSES.has(rightsStatusText as BookArtProvenanceV1["rightsStatus"])
    ? rightsStatusText as BookArtProvenanceV1["rightsStatus"]
    : undefined;
  if (!rightsStatus) blockers.push("Legacy Website artwork rights status is invalid.");
  const rightsReference = text(provenance.rightsReference);
  if (!rightsReference) blockers.push("Legacy Website artwork rights reference is missing.");
  const generation = record(provenance.generation);

  const candidateSetRaw = input?.candidateSetAuthority;
  const candidateSet = candidateSetRaw === undefined ? undefined : record(candidateSetRaw);
  if (candidateSetRaw !== undefined && !candidateSet) blockers.push("Legacy Website candidate-set authority must be an object.");
  let selectionReceiptSha256: string | undefined;
  let candidateSetDigest: string | undefined;
  if (candidateSet) {
    if (candidateSet.outputKind !== "book_cover_artwork_candidate_set_authority" || candidateSet.version !== "book_cover_artwork_candidate_set_authority_v1") {
      blockers.push("Legacy Website candidate-set authority kind or version is invalid.");
    }
    if (candidateSet.status !== "selected_for_composition") blockers.push("Legacy Website candidate-set authority has not selected one candidate.");
    if (candidateSet.projectId !== identity.projectId) blockers.push("Legacy Website candidate-set authority belongs to a different project.");
    if (candidateSet.artDirectionDigestSha256 !== sourceBriefFingerprint) blockers.push("Legacy Website candidate-set art direction differs from the imported brief.");
    if (candidateSet.selectedCandidateId !== candidateId) blockers.push("Legacy Website candidate-set authority selected a different candidate.");
    if (candidateSet.selectedQualityAuthorityDigestSha256 !== qualityDigest) blockers.push("Legacy Website candidate-set authority selected a different quality authority.");
    candidateSetDigest = text(candidateSet.authorityDigestSha256);
    if (!isSha(candidateSetDigest)) blockers.push("Legacy Website candidate-set authority digest is invalid.");
    else {
      selectionReceiptSha256 = candidateSetDigest;
      sourceEvidence.candidateSetAuthoritySha256 = candidateSetDigest;
    }
    blockers.push(...stringArray(candidateSet.hardErrors).map((item) => `Legacy candidate-set blocker: ${item}`));
    warnings.push(...stringArray(candidateSet.warnings).map((item) => `Legacy candidate-set warning: ${item}`));
  }

  const bindingRaw = input?.selectionBinding;
  const binding = bindingRaw === undefined ? undefined : record(bindingRaw);
  if (bindingRaw !== undefined && !binding) blockers.push("Legacy Website selection binding must be an object.");
  if (binding) {
    if (!candidateSet) blockers.push("Legacy Website selection binding requires the matching candidate-set authority.");
    if (binding.outputKind !== "book_cover_artwork_selection_binding" || binding.version !== "book_cover_artwork_selection_binding_v1" || binding.status !== "selected_for_composition") {
      blockers.push("Legacy Website selection binding kind, version or status is invalid.");
    }
    if (binding.projectId !== identity.projectId || binding.candidateId !== candidateId) blockers.push("Legacy Website selection binding belongs to a different project or candidate.");
    if (binding.sourceArtifactReference !== artifactReference || binding.sourceArtifactSha256 !== contentSha256) blockers.push("Legacy Website selection binding identifies different artifact bytes.");
    if (binding.artworkQualityAuthorityDigestSha256 !== qualityDigest || binding.candidateSetAuthorityDigestSha256 !== candidateSetDigest) blockers.push("Legacy Website selection binding evidence digests do not match.");
    if (binding.artDirectionDigestSha256 !== sourceBriefFingerprint) blockers.push("Legacy Website selection binding uses different art direction.");
    const bindingDigest = text(binding.bindingDigestSha256);
    if (!isSha(bindingDigest)) blockers.push("Legacy Website selection binding digest is invalid.");
    else sourceEvidence.selectionBindingSha256 = bindingDigest;
    const selectedBy = text(binding.selectedBy);
    const selectedByRole = text(binding.selectedByRole);
    const selectedAt = text(binding.selectedAt);
    if (!selectedBy || !selectedByRole || !isTimestamp(selectedAt)) {
      blockers.push("Legacy Website selection binding lacks valid named selection authority.");
    } else {
      sourceEvidence.selectedBy = selectedBy;
      sourceEvidence.selectedByRole = selectedByRole;
      sourceEvidence.selectedAt = selectedAt;
    }
  }

  if (candidateSet && !binding) warnings.push("Legacy candidate selection exists but has no exact scene selection binding.");
  const generatedTextDetected = answers.generated_text_contamination !== "pass";
  if (generatedTextDetected) warnings.push("Legacy review does not prove the candidate is free of generated-text contamination.");
  warnings.push("A new Art Studio promotion is required; legacy shortlist or composition approval is not imported as final approval.");

  const uniqueBlockers = unique(blockers);
  const uniqueWarnings = unique(warnings);
  if (uniqueBlockers.length || !mappedOrigin || !rightsStatus || !isSha(qualityDigest) || !isSha(contentSha256)) {
    return blocked(identity, sourceEvidence, uniqueBlockers, uniqueWarnings);
  }

  const mappedProvenance = mapProvenance({
    mappedOrigin,
    legacyOrigin,
    rightsStatus,
    rightsReference,
    provenance,
    ...(generation === undefined ? {} : { generation }),
  });
  const receipt: BookArtArtifactReceiptV1 = {
    outputKind: "evavo_book_art_artifact_receipt",
    schemaVersion: 1,
    contract: "evavo_book_art_handoff_v1",
    identity,
    sourceBriefFingerprint,
    status: candidateSet && binding ? "review_required" : "candidate",
    artifactId: candidateId,
    artifactReference,
    contentSha256,
    byteLength,
    mimeType,
    widthPx,
    heightPx,
    provenance: mappedProvenance,
    technicalQualityReceiptSha256: qualityDigest,
    ...(selectionReceiptSha256 === undefined ? {} : { selectionReceiptSha256 }),
    generatedTextDetected,
    unresolvedRisks: uniqueWarnings,
    artifactFingerprint: contentSha256,
    publicationPerformed: false,
  };
  const receiptValidation = validateLegacyCompatibleBookArtArtifactReceipt(receipt);
  if (!receiptValidation.valid) return blocked(identity, sourceEvidence, receiptValidation.issues, uniqueWarnings);
  return {
    outputKind: "evavo_legacy_website_book_art_state_import_result",
    schemaVersion: 1,
    status: candidateSet && binding ? "selection_evidence_imported" : "candidate_imported",
    identity,
    receipt,
    sourceEvidence,
    blockers: [],
    warnings: uniqueWarnings,
    promotionRequired: true,
    legacyApprovalPromotedAutomatically: false,
    artifactBytesRewritten: false,
    publicationPerformed: false,
  };
}

function mapProvenance(input: {
  mappedOrigin: BookArtProvenanceV1["origin"];
  legacyOrigin: string;
  rightsStatus: BookArtProvenanceV1["rightsStatus"];
  rightsReference: string;
  provenance: Record<string, unknown>;
  generation?: Record<string, unknown>;
}): BookArtProvenanceV1 {
  const sourceArtifactIds = unique([
    ...stringArray(input.provenance.ingredientSha256s).map((item) => `sha256:${item.replace(/^sha256:/, "")}`),
    text(input.provenance.sourceReference),
  ]);
  const provider = optionalText(input.generation?.provider);
  const model = optionalText(input.generation?.model);
  const modelVersion = optionalText(input.generation?.modelVersion);
  const promptSha256 = isSha(input.generation?.promptSha256) ? text(input.generation?.promptSha256) : undefined;
  const seed = optionalText(input.generation?.seed);
  return {
    origin: input.mappedOrigin,
    ...(provider === undefined ? {} : { provider }),
    ...(model === undefined ? {} : { model }),
    ...(modelVersion === undefined ? {} : { modelVersion }),
    ...(promptSha256 === undefined ? {} : { promptSha256 }),
    ...(seed === undefined ? {} : { seed }),
    sourceArtifactIds,
    rightsEvidenceIds: [input.rightsReference],
    rightsStatus: input.rightsStatus,
    aiDisclosure: input.legacyOrigin === "generative_primary"
      ? "ai_generated"
      : input.legacyOrigin === "generative_assisted"
        ? "ai_assisted"
        : input.legacyOrigin === "mixed_composite"
          ? "review_required"
          : "not_applicable",
  };
}

function blocked(
  identity: BookArtIdentityV1,
  sourceEvidence: LegacyWebsiteBookArtSourceEvidenceV1,
  blockers: string[],
  warnings: string[],
): LegacyWebsiteBookArtStateImportResultV1 {
  return {
    outputKind: "evavo_legacy_website_book_art_state_import_result",
    schemaVersion: 1,
    status: "blocked",
    identity,
    sourceEvidence,
    blockers: unique(blockers),
    warnings: unique(warnings),
    promotionRequired: true,
    legacyApprovalPromotedAutomatically: false,
    artifactBytesRewritten: false,
    publicationPerformed: false,
  };
}

function cloneIdentity(value: BookArtIdentityV1 | undefined): BookArtIdentityV1 {
  return {
    workspaceId: text(value?.workspaceId),
    projectId: text(value?.projectId),
    bookId: text(value?.bookId),
    ...(value?.editionId === undefined ? {} : { editionId: text(value.editionId) }),
    requestId: text(value?.requestId),
  };
}
function validateIdentity(value: BookArtIdentityV1, blockers: string[]): void {
  for (const key of ["workspaceId", "projectId", "bookId", "requestId"] as const) {
    if (!isSafeId(value[key])) blockers.push(`Legacy Website Book Art identity ${key} is invalid.`);
  }
  if (value.editionId !== undefined && !isSafeId(value.editionId)) blockers.push("Legacy Website Book Art identity editionId is invalid.");
}
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function optionalText(value: unknown): string | undefined {
  const result = text(value).trim();
  return result ? result : undefined;
}
function numeric(value: unknown): number { return typeof value === "number" ? value : Number.NaN; }
function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}
function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim()))];
}
function isSha(value: unknown): value is string { return typeof value === "string" && SHA256.test(value); }
function isSafeId(value: unknown): value is string {
  return typeof value === "string"
    && SAFE_ID.test(value)
    && !["__proto__", "constructor", "prototype"].includes(value);
}
function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && ISO_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value));
}
