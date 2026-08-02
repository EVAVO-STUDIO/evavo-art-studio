import type {
  BookArtArtifactReceiptV1,
  BookArtworkUseBindingV1,
  BookArtValidationResult,
} from "./book-studio-art-contracts";
import {
  validateBookArtArtifactReceipt,
  validateBookArtworkUseBinding,
} from "./book-studio-art-contracts";

export type LegacyBookArtArtifactScheme =
  | "book-cover-artifact"
  | "book-publication-artifact";

export interface LegacyBookArtReferenceTranslationV1 {
  outputKind: "evavo_legacy_book_art_reference_translation";
  schemaVersion: 1;
  scheme: LegacyBookArtArtifactScheme;
  legacyReference: string;
  canonicalMigrationReference: string;
  sourceReferenceRetained: true;
  bytesRewritten: false;
}

export interface LegacyCompatibleBookArtValidationResult extends BookArtValidationResult {
  referenceTranslations: LegacyBookArtReferenceTranslationV1[];
}

const LEGACY_REFERENCE = /^(book-cover-artifact|book-publication-artifact):\/\/([A-Za-z0-9._~!$&'()*+,;=:@%/-]+)$/;

export function translateLegacyBookArtArtifactReference(reference: string): {
  canonicalReference: string;
  translation?: LegacyBookArtReferenceTranslationV1;
} {
  const match = LEGACY_REFERENCE.exec(reference);
  if (!match) return { canonicalReference: reference };
  const scheme = match[1] as LegacyBookArtArtifactScheme;
  const category = scheme === "book-cover-artifact" ? "cover" : "publication";
  const canonicalMigrationReference = `book-artifact://legacy/${category}/${match[2]}`;
  return {
    canonicalReference: canonicalMigrationReference,
    translation: {
      outputKind: "evavo_legacy_book_art_reference_translation",
      schemaVersion: 1,
      scheme,
      legacyReference: reference,
      canonicalMigrationReference,
      sourceReferenceRetained: true,
      bytesRewritten: false,
    },
  };
}

export function validateLegacyCompatibleBookArtArtifactReceipt(
  value: BookArtArtifactReceiptV1,
): LegacyCompatibleBookArtValidationResult {
  const translated = translateLegacyBookArtArtifactReference(value.artifactReference);
  const result = validateBookArtArtifactReceipt({
    ...value,
    artifactReference: translated.canonicalReference,
  });
  return {
    ...result,
    referenceTranslations: translated.translation ? [translated.translation] : [],
  };
}

export function validateLegacyCompatibleBookArtworkUseBinding(
  value: BookArtworkUseBindingV1,
  artifact: BookArtArtifactReceiptV1,
): LegacyCompatibleBookArtValidationResult {
  const artifactTranslation = translateLegacyBookArtArtifactReference(artifact.artifactReference);
  const bindingTranslation = translateLegacyBookArtArtifactReference(value.approvedArtifactReference);
  const issues: string[] = [];
  if (value.approvedArtifactReference !== artifact.artifactReference) {
    issues.push("Binding legacy artifact reference differs from the exact approved artifact reference.");
  }
  const result = validateBookArtworkUseBinding(
    { ...value, approvedArtifactReference: bindingTranslation.canonicalReference },
    { ...artifact, artifactReference: artifactTranslation.canonicalReference },
  );
  return {
    valid: result.valid && issues.length === 0,
    issues: [...result.issues, ...issues],
    referenceTranslations: [artifactTranslation.translation, bindingTranslation.translation]
      .filter((entry): entry is LegacyBookArtReferenceTranslationV1 => Boolean(entry)),
  };
}
