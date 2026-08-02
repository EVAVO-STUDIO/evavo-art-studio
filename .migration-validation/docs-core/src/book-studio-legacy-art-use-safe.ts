import type {
  LegacyWebsiteBookArtworkUseImportInputV1,
  LegacyWebsiteBookArtworkUseImportResultV1,
} from "./book-studio-legacy-art-use-import";
import {
  importLegacyWebsiteBookArtworkUse as importLegacyWebsiteBookArtworkUseUnchecked,
} from "./book-studio-legacy-art-use-import";

export type {
  LegacyWebsiteBookArtworkUseImportInputV1,
  LegacyWebsiteBookArtworkUseImportResultV1,
} from "./book-studio-legacy-art-use-import";

const PURPOSES = new Set([
  "front_cover_art",
  "full_wrap_art",
  "interior_full_page_illustration",
  "interior_half_page_illustration",
  "interior_spot_illustration",
  "diagram",
  "map",
  "ornament",
]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/;

/**
 * Public fail-closed entrypoint for binding migrated Website artwork to a book.
 *
 * It prevents malformed purpose or incomplete legacy selection evidence from
 * reaching the typed importer through an unchecked cast.
 */
export function importLegacyWebsiteBookArtworkUse(
  input: LegacyWebsiteBookArtworkUseImportInputV1,
): LegacyWebsiteBookArtworkUseImportResultV1 {
  const safetyBlockers: string[] = [];
  if (!PURPOSES.has(input?.purpose as string)) {
    safetyBlockers.push("Legacy Website Book artwork-use purpose is unsupported.");
  }
  const boundBy = text(input?.boundBy);
  if (!boundBy || boundBy !== boundBy.trim() || boundBy.length > 300 || /[\u0000-\u001f\u007f]/.test(boundBy)) {
    safetyBlockers.push("Legacy Website Book artwork-use boundBy must be bounded, trimmed reviewer identity text.");
  }

  const legacy = record(input?.legacySelectionBinding);
  if (legacy) {
    if (!isSafeId(legacy.assetId)) {
      safetyBlockers.push("Legacy Website artwork selection assetId is invalid.");
    }
    if (!isSafeId(legacy.conceptTerritoryId)) {
      safetyBlockers.push("Legacy Website artwork selection conceptTerritoryId is invalid.");
    }
    if (!nonEmptyStringArray(legacy.blockedClaims)) {
      safetyBlockers.push("Legacy Website artwork selection must retain its scope-limiting blockedClaims.");
    }
  }

  const result = importLegacyWebsiteBookArtworkUseUnchecked(input);
  if (!safetyBlockers.length) return result;
  const { binding: _discardedBinding, ...withoutBinding } = result;
  return {
    ...withoutBinding,
    status: "blocked",
    blockers: unique([...result.blockers, ...safetyBlockers]),
    warnings: unique(result.warnings),
    canonicalRendererMustVerifyBytes: true,
    publicationPerformed: false,
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function isSafeId(value: unknown): value is string {
  return typeof value === "string"
    && SAFE_ID.test(value)
    && !["__proto__", "constructor", "prototype"].includes(value);
}
function nonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length > 0
    && value.length <= 64
    && value.every((entry) => typeof entry === "string" && entry.trim() === entry && entry.length > 0 && entry.length <= 2_000);
}
function unique(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}
