import type { BookArtIdentityV1 } from "./book-studio-art-contracts";
import type {
  LegacyWebsiteBookArtworkUseImportInputV1,
  LegacyWebsiteBookArtworkUseImportResultV1,
} from "./book-studio-legacy-art-use-safe";
import { importLegacyWebsiteBookArtworkUse } from "./book-studio-legacy-art-use-safe";

export function importLegacyWebsiteBookArtworkUseFromUnknown(
  value: unknown,
): LegacyWebsiteBookArtworkUseImportResultV1 {
  const input = record(value);
  if (!input) return blocked(emptyIdentity(), ["Legacy Website Book artwork-use request must be one object."]);
  const identity = parseIdentity(input.identity);
  const blockers: string[] = [];
  if (!record(input.identity)) blockers.push("Legacy Website Book artwork-use request identity must be an object.");
  if (!record(input.promotedArtifact)) blockers.push("Legacy Website Book artwork-use request promotedArtifact must be an object.");
  if (!record(input.legacySelectionBinding)) blockers.push("Legacy Website Book artwork-use request legacySelectionBinding must be an object.");
  if (blockers.length) return blocked(identity, blockers);
  return importLegacyWebsiteBookArtworkUse(input as unknown as LegacyWebsiteBookArtworkUseImportInputV1);
}

function blocked(
  identity: BookArtIdentityV1,
  blockers: string[],
): LegacyWebsiteBookArtworkUseImportResultV1 {
  return {
    outputKind: "evavo_legacy_website_book_artwork_use_import_result",
    schemaVersion: 1,
    status: "blocked",
    identity,
    referenceTranslations: [],
    blockers,
    warnings: [],
    canonicalRendererMustVerifyBytes: true,
    publicationPerformed: false,
  };
}
function parseIdentity(value: unknown): BookArtIdentityV1 {
  const input = record(value) ?? {};
  return {
    workspaceId: text(input.workspaceId),
    projectId: text(input.projectId),
    bookId: text(input.bookId),
    ...(input.editionId === undefined ? {} : { editionId: text(input.editionId) }),
    requestId: text(input.requestId),
  };
}
function emptyIdentity(): BookArtIdentityV1 {
  return { workspaceId: "", projectId: "", bookId: "", requestId: "" };
}
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
