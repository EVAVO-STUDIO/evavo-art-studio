import { canonicalBookJson, sha256BookText } from "./book-studio-project-contracts";
import {
  validateAndNormalizeBookStoryState,
  type BookStoryStateV1,
} from "./book-studio-story-contracts";

export interface LegacyWebsiteBookStoryImportInputV1 {
  outputKind: "evavo_legacy_website_book_story_import_input";
  schemaVersion: 1;
  sourceRepository: "EVAVO-STUDIO/Website";
  sourceCommit: string;
  sourcePath: string;
  sourceGitBlobSha1: string;
  sourceRecordFingerprint: string;
  legacyStoryState: unknown;
  importedAt: string;
  importedBy: string;
}

export interface LegacyWebsiteBookStoryImportResultV1 {
  outputKind: "evavo_legacy_website_book_story_import_result";
  schemaVersion: 1;
  status: "ready_for_shadow_import" | "needs_resolution" | "blocked";
  sourceRepository: "EVAVO-STUDIO/Website";
  sourceCommit: string;
  sourcePath: string;
  sourceGitBlobSha1: string;
  sourceRecordFingerprint: string;
  importedStoryState?: BookStoryStateV1;
  storyStateFingerprint?: string;
  blockers: string[];
  requiredActions: string[];
  resultFingerprint: string;
  storyStatePersisted: false;
  canonicalAdmissionAllowed: false;
  canonicalManuscriptMutationPerformed: false;
  websiteCompatibilityRuntimeStillAuthoritative: true;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

const COMMIT_SHA = /^[a-f0-9]{40}$/;
const BLOB_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/@:-]+(?:\/[A-Za-z0-9._@:-]+)*$/;

export async function fingerprintLegacyWebsiteBookStoryImportSource(
  input: Omit<LegacyWebsiteBookStoryImportInputV1, "sourceRecordFingerprint"> | LegacyWebsiteBookStoryImportInputV1,
): Promise<string> {
  const { sourceRecordFingerprint: _discarded, ...unsigned } = input as LegacyWebsiteBookStoryImportInputV1;
  return sha256BookText(canonicalBookJson(unsigned));
}

export async function importLegacyWebsiteBookStoryState(
  input: LegacyWebsiteBookStoryImportInputV1,
): Promise<LegacyWebsiteBookStoryImportResultV1> {
  const blockers: string[] = [];
  if (!input || input.outputKind !== "evavo_legacy_website_book_story_import_input" || input.schemaVersion !== 1) blockers.push("Legacy story import kind or version is invalid.");
  if (input?.sourceRepository !== "EVAVO-STUDIO/Website") blockers.push("Legacy story import source repository is invalid.");
  if (!COMMIT_SHA.test(input?.sourceCommit ?? "")) blockers.push("Legacy story import source commit is invalid.");
  if (!BLOB_SHA.test(input?.sourceGitBlobSha1 ?? "")) blockers.push("Legacy story import source Git blob is invalid.");
  if (!SAFE_PATH.test(input?.sourcePath ?? "")) blockers.push("Legacy story import source path is invalid.");
  if (!SHA256.test(input?.sourceRecordFingerprint ?? "")) blockers.push("Legacy story import source fingerprint is invalid.");
  if (!input?.importedBy || input.importedBy !== input.importedBy.trim() || input.importedBy.length > 300) blockers.push("Legacy story import actor is invalid.");
  const importedTime = Date.parse(input?.importedAt ?? "");
  if (!Number.isFinite(importedTime) || new Date(importedTime).toISOString() !== input.importedAt) blockers.push("Legacy story import time must be canonical UTC ISO-8601.");
  if (input && SHA256.test(input.sourceRecordFingerprint)) {
    const expected = await fingerprintLegacyWebsiteBookStoryImportSource(input);
    if (expected !== input.sourceRecordFingerprint) blockers.push("Legacy story import source fingerprint differs from its exact canonical contents.");
  }
  if (blockers.length) return seal(input, "blocked", undefined, blockers, []);

  const validation = await validateAndNormalizeBookStoryState(input.legacyStoryState);
  if (validation.status === "blocked" || !validation.storyState) {
    return seal(input, "blocked", undefined, validation.blockers, validation.requiredActions);
  }
  return seal(
    input,
    validation.status === "ready" ? "ready_for_shadow_import" : "needs_resolution",
    validation.storyState,
    validation.blockers,
    validation.requiredActions,
  );
}

async function seal(
  input: LegacyWebsiteBookStoryImportInputV1,
  status: LegacyWebsiteBookStoryImportResultV1["status"],
  storyState: BookStoryStateV1 | undefined,
  blockers: string[],
  requiredActions: string[],
): Promise<LegacyWebsiteBookStoryImportResultV1> {
  const withoutFingerprint: Omit<LegacyWebsiteBookStoryImportResultV1, "resultFingerprint"> = {
    outputKind: "evavo_legacy_website_book_story_import_result",
    schemaVersion: 1,
    status,
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommit: input?.sourceCommit ?? "",
    sourcePath: input?.sourcePath ?? "",
    sourceGitBlobSha1: input?.sourceGitBlobSha1 ?? "",
    sourceRecordFingerprint: input?.sourceRecordFingerprint ?? "",
    ...(storyState === undefined ? {} : {
      importedStoryState: storyState,
      storyStateFingerprint: storyState.storyStateFingerprint,
    }),
    blockers: unique(blockers),
    requiredActions: unique(requiredActions),
    storyStatePersisted: false,
    canonicalAdmissionAllowed: false,
    canonicalManuscriptMutationPerformed: false,
    websiteCompatibilityRuntimeStillAuthoritative: true,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
  return { ...withoutFingerprint, resultFingerprint: await sha256BookText(canonicalBookJson(withoutFingerprint)) };
}

function unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))]; }
