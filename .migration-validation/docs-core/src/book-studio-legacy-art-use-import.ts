import type {
  BookArtArtifactReceiptV1,
  BookArtIdentityV1,
  BookArtPurpose,
  BookArtworkUseBindingV1,
} from "./book-studio-art-contracts";
import type { LegacyBookArtReferenceTranslationV1 } from "./book-studio-art-legacy-compat";
import {
  validateLegacyCompatibleBookArtArtifactReceipt,
  validateLegacyCompatibleBookArtworkUseBinding,
} from "./book-studio-art-legacy-compat";

export interface LegacyWebsiteBookArtworkUseImportInputV1 {
  outputKind: "evavo_legacy_website_book_artwork_use_import_input";
  schemaVersion: 1;
  identity: BookArtIdentityV1;
  purpose: BookArtPurpose;
  sourceBriefFingerprint: string;
  legacySelectionBinding: unknown;
  promotedArtifact: BookArtArtifactReceiptV1;
  sceneOrPlacementId: string;
  cropOrPlacementSha256: string;
  boundAt: string;
  boundBy: string;
  useFingerprint: string;
}

export interface LegacyWebsiteBookArtworkUseImportResultV1 {
  outputKind: "evavo_legacy_website_book_artwork_use_import_result";
  schemaVersion: 1;
  status: "blocked" | "ready";
  identity: BookArtIdentityV1;
  binding?: BookArtworkUseBindingV1;
  legacySelectionBindingSha256?: string;
  referenceTranslations: LegacyBookArtReferenceTranslationV1[];
  blockers: string[];
  warnings: string[];
  canonicalRendererMustVerifyBytes: true;
  publicationPerformed: false;
}

const SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export function importLegacyWebsiteBookArtworkUse(
  input: LegacyWebsiteBookArtworkUseImportInputV1,
): LegacyWebsiteBookArtworkUseImportResultV1 {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const identity = cloneIdentity(input?.identity);
  validateIdentity(identity, blockers);
  if (input?.outputKind !== "evavo_legacy_website_book_artwork_use_import_input" || input?.schemaVersion !== 1) {
    blockers.push("Legacy Website Book artwork-use import kind or version is invalid.");
  }

  const sourceBriefFingerprint = text(input?.sourceBriefFingerprint);
  if (!isSha(sourceBriefFingerprint)) blockers.push("Artwork-use import sourceBriefFingerprint is invalid.");
  if (!isSafeId(input?.sceneOrPlacementId)) blockers.push("Artwork-use import sceneOrPlacementId is invalid.");
  if (!isSha(input?.cropOrPlacementSha256)) blockers.push("Artwork-use import cropOrPlacementSha256 is invalid.");
  if (!isTimestamp(input?.boundAt)) blockers.push("Artwork-use import boundAt is invalid.");
  if (!text(input?.boundBy).trim()) blockers.push("Artwork-use import boundBy is required.");
  if (!isSha(input?.useFingerprint)) blockers.push("Artwork-use import useFingerprint is invalid.");

  const artifact = input?.promotedArtifact;
  const artifactValidation = validateLegacyCompatibleBookArtArtifactReceipt(artifact);
  blockers.push(...artifactValidation.issues.map((item) => `Promoted Art Studio artifact: ${item}`));
  if (artifact?.status !== "approved") blockers.push("Legacy Website book use requires an approved Art Studio artifact.");
  if (!isSha(artifact?.promotionReceiptSha256)) blockers.push("Legacy Website book use requires a real Art Studio promotion receipt.");
  if (!isSha(artifact?.selectionReceiptSha256)) blockers.push("Legacy Website book use requires Art Studio selection evidence.");
  if (artifact?.sourceBriefFingerprint !== sourceBriefFingerprint) blockers.push("Promoted Art Studio artifact belongs to different Book Studio art direction.");
  if (!sameIdentity(identity, artifact?.identity)) blockers.push("Promoted Art Studio artifact belongs to a different workspace, project, book, edition or request.");

  const legacy = record(input?.legacySelectionBinding);
  let legacySelectionBindingSha256: string | undefined;
  if (!legacy) {
    blockers.push("Legacy Website artwork selection binding must be an object.");
  } else {
    if (legacy.outputKind !== "book_cover_artwork_selection_binding" || legacy.version !== "book_cover_artwork_selection_binding_v1" || legacy.status !== "selected_for_composition") {
      blockers.push("Legacy Website artwork selection binding kind, version or status is invalid.");
    }
    if (legacy.projectId !== identity.projectId) blockers.push("Legacy Website artwork selection belongs to a different project.");
    if (legacy.candidateId !== artifact?.artifactId) blockers.push("Legacy Website artwork selection names a different candidate than the promoted artifact.");
    if (legacy.sourceArtifactReference !== artifact?.artifactReference) blockers.push("Legacy Website artwork selection reference differs from the promoted artifact reference.");
    if (legacy.sourceArtifactSha256 !== artifact?.contentSha256) blockers.push("Legacy Website artwork selection checksum differs from the promoted artifact bytes.");
    if (legacy.artworkQualityAuthorityDigestSha256 !== artifact?.technicalQualityReceiptSha256) blockers.push("Legacy Website artwork quality evidence differs from the promoted Art Studio receipt.");
    if (legacy.candidateSetAuthorityDigestSha256 !== artifact?.selectionReceiptSha256) blockers.push("Legacy Website candidate-set evidence differs from the promoted Art Studio selection receipt.");
    if (legacy.artDirectionDigestSha256 !== sourceBriefFingerprint) blockers.push("Legacy Website artwork selection uses different art direction.");
    legacySelectionBindingSha256 = text(legacy.bindingDigestSha256);
    if (!isSha(legacySelectionBindingSha256)) blockers.push("Legacy Website artwork selection binding digest is invalid.");
    if (!text(legacy.selectedBy).trim() || !text(legacy.selectedByRole).trim() || !isTimestamp(legacy.selectedAt)) {
      blockers.push("Legacy Website artwork selection lacks valid named selection authority.");
    }
  }

  const uniqueBlockers = unique(blockers);
  if (uniqueBlockers.length || !artifact || !isSha(artifact.promotionReceiptSha256)) {
    return blocked(identity, legacySelectionBindingSha256, artifactValidation.referenceTranslations, uniqueBlockers, warnings);
  }

  const binding: BookArtworkUseBindingV1 = {
    outputKind: "evavo_book_artwork_use_binding",
    schemaVersion: 1,
    contract: "evavo_book_art_handoff_v1",
    identity,
    purpose: input.purpose,
    sourceBriefFingerprint,
    approvedArtifactId: artifact.artifactId,
    approvedArtifactReference: artifact.artifactReference,
    approvedArtifactSha256: artifact.contentSha256,
    promotionReceiptSha256: artifact.promotionReceiptSha256,
    sceneOrPlacementId: input.sceneOrPlacementId,
    cropOrPlacementSha256: input.cropOrPlacementSha256,
    boundAt: input.boundAt,
    boundBy: input.boundBy,
    useFingerprint: input.useFingerprint,
    canonicalRendererMustVerifyBytes: true,
    publicationPerformed: false,
  };
  const bindingValidation = validateLegacyCompatibleBookArtworkUseBinding(binding, artifact);
  if (!bindingValidation.valid) {
    return blocked(identity, legacySelectionBindingSha256, bindingValidation.referenceTranslations, bindingValidation.issues, warnings);
  }

  warnings.push("The legacy Website selection is retained as historical evidence; the Art Studio promotion receipt is the current approval authority.");
  return {
    outputKind: "evavo_legacy_website_book_artwork_use_import_result",
    schemaVersion: 1,
    status: "ready",
    identity,
    binding,
    ...(legacySelectionBindingSha256 === undefined ? {} : { legacySelectionBindingSha256 }),
    referenceTranslations: uniqueTranslations([
      ...artifactValidation.referenceTranslations,
      ...bindingValidation.referenceTranslations,
    ]),
    blockers: [],
    warnings: unique(warnings),
    canonicalRendererMustVerifyBytes: true,
    publicationPerformed: false,
  };
}

function blocked(
  identity: BookArtIdentityV1,
  legacySelectionBindingSha256: string | undefined,
  referenceTranslations: LegacyBookArtReferenceTranslationV1[],
  blockers: string[],
  warnings: string[],
): LegacyWebsiteBookArtworkUseImportResultV1 {
  return {
    outputKind: "evavo_legacy_website_book_artwork_use_import_result",
    schemaVersion: 1,
    status: "blocked",
    identity,
    ...(legacySelectionBindingSha256 === undefined ? {} : { legacySelectionBindingSha256 }),
    referenceTranslations: uniqueTranslations(referenceTranslations),
    blockers: unique(blockers),
    warnings: unique(warnings),
    canonicalRendererMustVerifyBytes: true,
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
    if (!isSafeId(value[key])) blockers.push(`Artwork-use import identity ${key} is invalid.`);
  }
  if (value.editionId !== undefined && !isSafeId(value.editionId)) blockers.push("Artwork-use import identity editionId is invalid.");
}
function sameIdentity(first: BookArtIdentityV1, second: BookArtIdentityV1 | undefined): boolean {
  return Boolean(second)
    && first.workspaceId === second?.workspaceId
    && first.projectId === second?.projectId
    && first.bookId === second?.bookId
    && first.editionId === second?.editionId
    && first.requestId === second?.requestId;
}
function uniqueTranslations(values: LegacyBookArtReferenceTranslationV1[]): LegacyBookArtReferenceTranslationV1[] {
  const byIdentity = new Map<string, LegacyBookArtReferenceTranslationV1>();
  for (const value of values) byIdentity.set(`${value.scheme}:${value.legacyReference}:${value.canonicalMigrationReference}`, value);
  return [...byIdentity.values()].sort((a, b) => a.legacyReference.localeCompare(b.legacyReference));
}
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function unique(values: string[]): string[] { return [...new Set(values.map((item) => item.trim()).filter(Boolean))]; }
function isSha(value: unknown): value is string { return typeof value === "string" && SHA256.test(value); }
function isSafeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value) && !["__proto__", "constructor", "prototype"].includes(value);
}
function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && ISO_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value));
}
