import { createHash } from "node:crypto";

export const DOCS_BOOK_ART_RELEASE_V2_CONTRACT =
  "evavo_art_docs_book_release_v2" as const;
export const DOCS_BOOK_ART_RELEASE_V2_SCHEMA_VERSION = 2 as const;

export interface DocsBookArtReleaseV2Input {
  outputKind: "evavo_art_docs_book_release_v2_input";
  schemaVersion: typeof DOCS_BOOK_ART_RELEASE_V2_SCHEMA_VERSION;
  contract: typeof DOCS_BOOK_ART_RELEASE_V2_CONTRACT;
  projectId: string;
  bookId: string;
  manuscriptRevisionId: string;
  manuscriptSha256: string;
  docsReleaseContract: string;
  docsReleaseFingerprint: string;
  finalArtBriefFingerprint: string;
  coverManuscriptAuthorityContract: "evavo_art_book_cover_manuscript_authority_v1";
  coverManuscriptAuthorityFingerprint: string;
  writingCandidateEvidenceContract: string;
  writingCandidateEvidenceFingerprint: string;
  requiredEvidenceIds: string[];
  receivedAt: string;
  receivedBy: string;
  sourceRepository: "EVAVO-STUDIO/evavo-docs-suite";
  targetRepository: "EVAVO-STUDIO/evavo-art-studio";
  crossRepositoryRuntimeSourceImportAllowed: false;
  authoritativeBookWritesAllowed: false;
  automaticSelectionAllowed: false;
  automaticPromotionAllowed: false;
  publicationAllowed: false;
}

export interface DocsBookArtReleaseV2Authority {
  outputKind: "evavo_art_docs_book_release_v2_authority";
  schemaVersion: typeof DOCS_BOOK_ART_RELEASE_V2_SCHEMA_VERSION;
  contract: typeof DOCS_BOOK_ART_RELEASE_V2_CONTRACT;
  status: "blocked" | "ready_for_art_production";
  projectId: string;
  bookId: string;
  manuscriptRevisionId: string;
  manuscriptSha256: string;
  boundAuthorities: {
    docsReleaseContract: string;
    docsReleaseFingerprint: string;
    finalArtBriefFingerprint: string;
    coverManuscriptAuthorityContract: "evavo_art_book_cover_manuscript_authority_v1";
    coverManuscriptAuthorityFingerprint: string;
    writingCandidateEvidenceContract: string;
    writingCandidateEvidenceFingerprint: string;
  };
  requiredEvidenceIds: string[];
  receivedAt: string;
  receivedBy: string;
  blockers: string[];
  compatibility: {
    wholeRepositoryCommitAllowlistRequired: false;
    exactContractIdentityRequired: true;
    exactAuthorityFingerprintRequired: true;
    historicalV1CommitReceiptsRemainValidUnderV1: true;
  };
  authority: {
    candidateProductionOnly: true;
    canonicalBookState: "EVAVO-STUDIO/evavo-docs-suite";
    authoritativeBookWritesAllowed: false;
    automaticSelectionAllowed: false;
    automaticPromotionAllowed: false;
    publicationAllowed: false;
  };
  authorityFingerprint: string;
}

const SHA = /^sha256:[a-f0-9]{64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== "string" || !value.trim()) {
    blockers.push(`${label} must be non-empty text.`);
    return "invalid";
  }
  return value.trim();
}
function digest(value: unknown, label: string, blockers: string[]): string {
  const parsed = text(value, label, blockers).toLowerCase();
  if (!SHA.test(parsed)) blockers.push(`${label} must be a canonical sha256: digest.`);
  return parsed;
}
function canonical(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function hash(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonical(value), "utf8").digest("hex")}`;
}
function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export function compileDocsBookArtReleaseV2(value: unknown): DocsBookArtReleaseV2Authority {
  const blockers: string[] = [];
  const input = isRecord(value) ? value as Partial<DocsBookArtReleaseV2Input> : {};
  if (!isRecord(value)) blockers.push("Docs Book Art V2 input must be one object.");
  if (
    input.outputKind !== "evavo_art_docs_book_release_v2_input"
    || input.schemaVersion !== DOCS_BOOK_ART_RELEASE_V2_SCHEMA_VERSION
    || input.contract !== DOCS_BOOK_ART_RELEASE_V2_CONTRACT
  ) blockers.push("Docs Book Art V2 input identity is invalid.");
  if (input.sourceRepository !== "EVAVO-STUDIO/evavo-docs-suite"
      || input.targetRepository !== "EVAVO-STUDIO/evavo-art-studio") {
    blockers.push("Docs Book Art V2 source/target repositories are invalid.");
  }

  const projectId = text(input.projectId, "projectId", blockers);
  const bookId = text(input.bookId, "bookId", blockers);
  const manuscriptRevisionId = text(input.manuscriptRevisionId, "manuscriptRevisionId", blockers);
  const manuscriptSha256 = digest(input.manuscriptSha256, "manuscriptSha256", blockers);
  const docsReleaseContract = text(input.docsReleaseContract, "docsReleaseContract", blockers);
  const docsReleaseFingerprint = digest(input.docsReleaseFingerprint, "docsReleaseFingerprint", blockers);
  const finalArtBriefFingerprint = digest(input.finalArtBriefFingerprint, "finalArtBriefFingerprint", blockers);
  const coverManuscriptAuthorityFingerprint = digest(
    input.coverManuscriptAuthorityFingerprint,
    "coverManuscriptAuthorityFingerprint",
    blockers,
  );
  const writingCandidateEvidenceContract = text(
    input.writingCandidateEvidenceContract,
    "writingCandidateEvidenceContract",
    blockers,
  );
  const writingCandidateEvidenceFingerprint = digest(
    input.writingCandidateEvidenceFingerprint,
    "writingCandidateEvidenceFingerprint",
    blockers,
  );
  if (input.coverManuscriptAuthorityContract !== "evavo_art_book_cover_manuscript_authority_v1") {
    blockers.push("Cover manuscript authority contract is incompatible with Art Studio V2.");
  }
  const receivedAt = text(input.receivedAt, "receivedAt", blockers);
  if (!ISO.test(receivedAt)) blockers.push("receivedAt must be canonical UTC ISO-8601.");
  const receivedBy = text(input.receivedBy, "receivedBy", blockers);
  const requiredEvidenceIds = unique(
    (Array.isArray(input.requiredEvidenceIds) ? input.requiredEvidenceIds : [])
      .filter((item): item is string => typeof item === "string" && !!item.trim())
      .map((item) => item.trim()),
  );
  if (!requiredEvidenceIds.length) blockers.push("At least one required evidence ID is required.");

  for (const [label, actual] of [
    ["crossRepositoryRuntimeSourceImportAllowed", input.crossRepositoryRuntimeSourceImportAllowed],
    ["authoritativeBookWritesAllowed", input.authoritativeBookWritesAllowed],
    ["automaticSelectionAllowed", input.automaticSelectionAllowed],
    ["automaticPromotionAllowed", input.automaticPromotionAllowed],
    ["publicationAllowed", input.publicationAllowed],
  ] as const) {
    if (actual !== false) blockers.push(`${label} must remain false.`);
  }

  const unsigned = {
    outputKind: "evavo_art_docs_book_release_v2_authority" as const,
    schemaVersion: DOCS_BOOK_ART_RELEASE_V2_SCHEMA_VERSION,
    contract: DOCS_BOOK_ART_RELEASE_V2_CONTRACT,
    status: blockers.length ? "blocked" as const : "ready_for_art_production" as const,
    projectId,
    bookId,
    manuscriptRevisionId,
    manuscriptSha256,
    boundAuthorities: {
      docsReleaseContract,
      docsReleaseFingerprint,
      finalArtBriefFingerprint,
      coverManuscriptAuthorityContract: "evavo_art_book_cover_manuscript_authority_v1" as const,
      coverManuscriptAuthorityFingerprint,
      writingCandidateEvidenceContract,
      writingCandidateEvidenceFingerprint,
    },
    requiredEvidenceIds,
    receivedAt,
    receivedBy,
    blockers: unique(blockers),
    compatibility: {
      wholeRepositoryCommitAllowlistRequired: false as const,
      exactContractIdentityRequired: true as const,
      exactAuthorityFingerprintRequired: true as const,
      historicalV1CommitReceiptsRemainValidUnderV1: true as const,
    },
    authority: {
      candidateProductionOnly: true as const,
      canonicalBookState: "EVAVO-STUDIO/evavo-docs-suite" as const,
      authoritativeBookWritesAllowed: false as const,
      automaticSelectionAllowed: false as const,
      automaticPromotionAllowed: false as const,
      publicationAllowed: false as const,
    },
  };
  return { ...unsigned, authorityFingerprint: hash(unsigned) };
}

export function validateDocsBookArtReleaseV2(value: unknown): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!isRecord(value)) return { valid: false, issues: ["Docs Book Art V2 authority must be an object."] };
  const authority = value as Partial<DocsBookArtReleaseV2Authority>;
  if (
    authority.outputKind !== "evavo_art_docs_book_release_v2_authority"
    || authority.schemaVersion !== DOCS_BOOK_ART_RELEASE_V2_SCHEMA_VERSION
    || authority.contract !== DOCS_BOOK_ART_RELEASE_V2_CONTRACT
  ) issues.push("Docs Book Art V2 authority identity is invalid.");
  if (!SHA.test(String(authority.authorityFingerprint ?? ""))) {
    issues.push("Docs Book Art V2 authority fingerprint is invalid.");
  } else {
    const { authorityFingerprint: _ignored, ...unsigned } = authority as DocsBookArtReleaseV2Authority;
    if (hash(unsigned) !== authority.authorityFingerprint) {
      issues.push("Docs Book Art V2 authority fingerprint differs from canonical contents.");
    }
  }
  if (authority.status === "ready_for_art_production") {
    if ((authority.blockers ?? []).length) issues.push("Ready Docs Book Art V2 authority retains blockers.");
    if (authority.compatibility?.wholeRepositoryCommitAllowlistRequired !== false
        || authority.compatibility?.exactContractIdentityRequired !== true
        || authority.compatibility?.exactAuthorityFingerprintRequired !== true) {
      issues.push("Docs Book Art V2 compatibility policy is invalid.");
    }
    if (authority.authority?.authoritativeBookWritesAllowed !== false
        || authority.authority?.automaticSelectionAllowed !== false
        || authority.authority?.automaticPromotionAllowed !== false
        || authority.authority?.publicationAllowed !== false) {
      issues.push("Docs Book Art V2 authority flags are invalid.");
    }
  }
  return { valid: issues.length === 0, issues: unique(issues) };
}
