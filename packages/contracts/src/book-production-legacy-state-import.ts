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
const MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/tiff"]);
const QUALITY_STATUSES = new Set(["shortlisted", "approved_for_composition"]);
const LEGACY_ORIGINS = new Set([
  "photographic_capture",
  "commissioned_illustration",
  "licensed_artwork",
  "human_digital_art",
  "generative_assisted",
  "generative_primary",
  "mixed_composite",
]);

export function importLegacyWebsiteBookArtState(
  input: LegacyWebsiteBookArtStateImportInputV1,
): LegacyWebsiteBookArtStateImportResultV1 {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const sourceEvidence: LegacyWebsiteBookArtSourceEvidenceV1 = {};
  validateIdentity(input?.identity, blockers);
  if (input?.outputKind !== "evavo_legacy_website_book_art_state_import_input" || input?.schemaVersion !== 1) blockers.push("Legacy Website Book Art import kind or version is invalid.");
  if (!isSha(input?.sourceBriefFingerprint)) blockers.push("Legacy Website Book Art import requires an exact sourceBriefFingerprint.");

  const quality = object(input?.qualityAuthority);
  if (!quality) blockers.push("Legacy Website Book Art quality authority must be an object.");
  const candidate = object(quality?.candidate);
  const governed = object(quality?.governedArtifact);
  const provenance = object(candidate?.provenance);
  const humanReview = object(quality?.humanReview);
  const answers = object(humanReview?.answers);

  if (quality?.outputKind !== "book_cover_artwork_quality_authority" || quality?.version !== "book_cover_artwork_quality_authority_v1") blockers.push("Legacy Website artwork quality authority kind or version is invalid.");
  if (quality?.projectId !== input?.identity?.projectId) blockers.push("Legacy Website artwork quality authority belongs to a different project.");
  if (!isSha(quality?.authorityDigestSha256)) blockers.push("Legacy Website artwork quality authority digest is invalid.");
  else sourceEvidence.qualityAuthoritySha256 = quality.authorityDigestSha256;
  if (!isSha(quality?.artDirectionDigestSha256) || quality.artDirectionDigestSha256 !== input?.sourceBriefFingerprint) blockers.push("Legacy Website art direction does not match the imported source brief fingerprint.");
  if (!QUALITY_STATUSES.has(String(quality?.status))) blockers.push(`Legacy Website artwork quality status ${String(quality?.status ?? "missing")} is not eligible for migration review.`);
  blockers.push(...stringArray(quality?.hardErrors).map((item) => `Legacy quality blocker: ${item}`));
  warnings.push(...stringArray(quality?.warnings).map((item) => `Legacy quality warning: ${item}`));
  warnings.push(...stringArray(quality?.requiredRevisions).map((item) => `Legacy required revision: ${item}`));

  const candidateId = string(candidate?.candidateId);
  const artifactReference = string(candidate?.artifactReference);
  const contentSha256 = string(candidate?.expectedSha256);
  if (!isSafeId(candidateId)) blockers.push("Legacy Website candidateId is invalid.");
  if (!artifactReference) blockers.push("Legacy Website candidate artifact reference is missing.");
  if (!isSha(contentSha256)) blockers.push("Legacy Website candidate checksum is invalid.");
  if (governed?.reference !== artifactReference) blockers.push("Legacy Website governed artifact reference differs from the candidate.");
  if (governed?.checksumSha256 !== contentSha256) blockers.push("Legacy Website governed artifact checksum differs from the candidate.");
  const byteLength = number(governed?.byteLength);
  const widthPx = number(governed?.widthPx);
  const heightPx = number(governed?.heightPx);
  const mimeType = string(governed?.mimeType);
  if (!Number.isSafeInteger(byteLength) || byteLength <= 0) blockers.push("Legacy Website governed artifact byte length is invalid.");
  if (!Number.isInteger(widthPx) || widthPx <= 0 || !Number.isInteger(heightPx) || heightPx <= 0) blockers.push("Legacy Website governed artifact dimensions are invalid.");
  if (!MIME_TYPES.has(mimeType)) blockers.push("Legacy Website governed artifact MIME type is unsupported.");

  const origin = string(provenance?.origin);
  if (!LEGACY_ORIGINS.has(origin)) blockers.push(`Legacy Website artwork origin ${origin || "missing"} is not safely migratable.`);
  const rightsStatus = string(provenance?.rightsStatus);
  if (!new Set(["approved_commercial", "review_required", "blocked"]).has(rightsStatus)) blockers.push("Legacy Website artwork rights status is invalid.");
  const rightsReference = string(provenance?.rightsReference);
  if (!rightsReference) blockers.push("Legacy Website artwork rights reference is missing.");
  const generation = object(provenance?.generation);
  const mappedProvenance = mapProvenance({ origin, rightsStatus, rightsReference, provenance, generation });

  let selectionReceiptSha256: string | undefined;
  const candidateSet = input?.candidateSetAuthority === undefined ? undefined : object(input.candidateSetAuthority);
  if (input?.candidateSetAuthority !== undefined && !candidateSet) blockers.push("Legacy Website candidate-set authority must be an object.");
  if (candidateSet) {
    if (candidateSet.outputKind !== "book_cover_artwork_candidate_set_authority" || candidateSet.version !== "book_cover_artwork_candidate_set_authority_v1") blockers.push("Legacy Website candidate-set authority kind or version is invalid.");
    if (candidateSet.status !== "selected_for_composition") blockers.push("Legacy Website candidate-set authority has not selected one candidate.");
    if (candidateSet.projectId !== input.identity.projectId) blockers.push("Legacy Website candidate-set authority belongs to a different project.");
    if (candidateSet.artDirectionDigestSha256 !== input.sourceBriefFingerprint) blockers.push("Legacy Website candidate-set art direction differs from the imported brief.");
    if (candidateSet.selectedCandidateId !== candidateId) blockers.push("Legacy Website candidate-set authority selected a different candidate.");
    if (candidateSet.selectedQualityAuthorityDigestSha256 !== quality?.authorityDigestSha256) blockers.push("Legacy Website candidate-set authority selected a different quality authority.");
    if (!isSha(candidateSet.authorityDigestSha256)) blockers.push("Legacy Website candidate-set authority digest is invalid.");
    else { selectionReceiptSha256 = candidateSet.authorityDigestSha256; sourceEvidence.candidateSetAuthoritySha256 = candidateSet.authorityDigestSha256; }
    blockers.push(...stringArray(candidateSet.hardErrors).map((item) => `Legacy candidate-set blocker: ${item}`));
    warnings.push(...stringArray(candidateSet.warnings).map((item) => `Legacy candidate-set warning: ${item}`));
  }

  const binding = input?.selectionBinding === undefined ? undefined : object(input.selectionBinding);
  if (input?.selectionBinding !== undefined && !binding) blockers.push("Legacy Website selection binding must be an object.");
  if (binding) {
    if (!candidateSet) blockers.push("Legacy Website selection binding requires the matching candidate-set authority.");
    if (binding.outputKind !== "book_cover_artwork_selection_binding" || binding.version !== "book_cover_artwork_selection_binding_v1" || binding.status !== "selected_for_composition") blockers.push("Legacy Website selection binding kind, version or status is invalid.");
    if (binding.projectId !== input.identity.projectId || binding.candidateId !== candidateId) blockers.push("Legacy Website selection binding belongs to a different project or candidate.");
    if (binding.sourceArtifactReference !== artifactReference || binding.sourceArtifactSha256 !== contentSha256) blockers.push("Legacy Website selection binding identifies different artifact bytes.");
    if (binding.artworkQualityAuthorityDigestSha256 !== quality?.authorityDigestSha256 || binding.candidateSetAuthorityDigestSha256 !== candidateSet?.authorityDigestSha256) blockers.push("Legacy Website selection binding evidence digests do not match.");
    if (binding.artDirectionDigestSha256 !== input.sourceBriefFingerprint) blockers.push("Legacy Website selection binding uses different art direction.");
    if (!isSha(binding.bindingDigestSha256)) blockers.push("Legacy Website selection binding digest is invalid.");
    else sourceEvidence.selectionBindingSha256 = binding.bindingDigestSha256;
    sourceEvidence.selectedBy = string(binding.selectedBy) || undefined;
    sourceEvidence.selectedByRole = string(binding.selectedByRole) || undefined;
    sourceEvidence.selectedAt = string(binding.selectedAt) || undefined;
  }

  if (binding && !candidateSet) blockers.push("Legacy selection evidence is incomplete.");
  if (candidateSet && !binding) warnings.push("Legacy candidate selection exists but has no exact scene selection binding.");

  const generatedTextDetected = answers?.generated_text_contamination !== "pass";
  if (generatedTextDetected) warnings.push("Legacy review does not prove the candidate is free of generated-text contamination.");
  warnings.push("A new Art Studio promotion is required; legacy shortlist or composition approval is not imported as final approval.");
  const uniqueBlockers = unique(blockers);
  const uniqueWarnings = unique(warnings);
  if (uniqueBlockers.length) return blocked(input?.identity, sourceEvidence, uniqueBlockers, uniqueWarnings);

  const receipt: BookArtArtifactReceiptV1 = {
    outputKind: "evavo_book_art_artifact_receipt",
    schemaVersion: 1,
    contract: "evavo_book_art_handoff_v1",
    identity: structuredClone(input.identity),
    sourceBriefFingerprint: input.sourceBriefFingerprint,
    status: candidateSet && binding ? "review_required" : "candidate",
    artifactId: candidateId,
    artifactReference,
    contentSha256,
    byteLength,
    mimeType,
    widthPx,
    heightPx,
    provenance: mappedProvenance,
    technicalQualityReceiptSha256: quality.authorityDigestSha256,
    selectionReceiptSha256,
    generatedTextDetected,
    unresolvedRisks: uniqueWarnings,
    artifactFingerprint: contentSha256,
    publicationPerformed: false,
  };
  const receiptValidation = validateLegacyCompatibleBookArtArtifactReceipt(receipt);
  if (!receiptValidation.valid) return blocked(input.identity, sourceEvidence, receiptValidation.issues, uniqueWarnings);
  return {
    outputKind: "evavo_legacy_website_book_art_state_import_result",
    schemaVersion: 1,
    status: candidateSet && binding ? "selection_evidence_imported" : "candidate_imported",
    identity: structuredClone(input.identity),
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

function mapProvenance(input: { origin: string; rightsStatus: string; rightsReference: string; provenance: Record<string, unknown>; generation?: Record<string, unknown> }): BookArtProvenanceV1 {
  const originMap: Record<string, BookArtProvenanceV1["origin"]> = {
    photographic_capture: "human_authored",
    commissioned_illustration: "commissioned",
    licensed_artwork: "licensed",
    human_digital_art: "human_authored",
    generative_assisted: "ai_assisted",
    generative_primary: "ai_generated",
    mixed_composite: "mixed_composite",
  };
  const sourceArtifactIds = unique([
    ...stringArray(input.provenance.ingredientSha256s).map((item) => `sha256:${item.replace(/^sha256:/, "")}`),
    string(input.provenance.sourceReference),
  ]);
  return {
    origin: originMap[input.origin],
    provider: string(input.generation?.provider) || undefined,
    model: string(input.generation?.model) || undefined,
    modelVersion: string(input.generation?.modelVersion) || undefined,
    promptSha256: isSha(input.generation?.promptSha256) ? string(input.generation?.promptSha256) : undefined,
    seed: string(input.generation?.seed) || undefined,
    sourceArtifactIds,
    rightsEvidenceIds: [input.rightsReference],
    rightsStatus: input.rightsStatus as BookArtProvenanceV1["rightsStatus"],
    aiDisclosure: input.origin === "generative_primary" ? "ai_generated" : input.origin === "generative_assisted" ? "ai_assisted" : input.origin === "mixed_composite" ? "review_required" : "not_applicable",
  };
}

function blocked(identity: BookArtIdentityV1, sourceEvidence: LegacyWebsiteBookArtSourceEvidenceV1, blockers: string[], warnings: string[]): LegacyWebsiteBookArtStateImportResultV1 {
  return { outputKind: "evavo_legacy_website_book_art_state_import_result", schemaVersion: 1, status: "blocked", identity: structuredClone(identity), sourceEvidence, blockers: unique(blockers), warnings: unique(warnings), promotionRequired: true, legacyApprovalPromotedAutomatically: false, artifactBytesRewritten: false, publicationPerformed: false };
}
function validateIdentity(value: BookArtIdentityV1, blockers: string[]): void {
  for (const [key, item] of Object.entries(value || {})) if (key !== "editionId" && !isSafeId(item)) blockers.push(`Legacy Website Book Art identity ${key} is invalid.`);
  if (value?.editionId !== undefined && !isSafeId(value.editionId)) blockers.push("Legacy Website Book Art identity editionId is invalid.");
}
function object(value: unknown): Record<string, unknown> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function string(value: unknown): string { return typeof value === "string" ? value : ""; }
function number(value: unknown): number { return typeof value === "number" ? value : Number.NaN; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : []; }
function unique(values: Array<string | undefined>): string[] { return [...new Set(values.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()))]; }
function isSha(value: unknown): value is string { return typeof value === "string" && SHA256.test(value); }
function isSafeId(value: unknown): value is string { return typeof value === "string" && SAFE_ID.test(value) && !["__proto__", "constructor", "prototype"].includes(value); }
