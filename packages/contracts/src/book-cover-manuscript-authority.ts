import { createHash } from "node:crypto";

export const BOOK_COVER_MANUSCRIPT_AUTHORITY_SCHEMA_VERSION = 1 as const;
export const BOOK_COVER_MANUSCRIPT_AUTHORITY_CONTRACT =
  "evavo_art_book_cover_manuscript_authority_v1" as const;

export type BookCoverCanonEvidenceKind =
  | "theme"
  | "motif"
  | "setting"
  | "character"
  | "object"
  | "symbol"
  | "relationship"
  | "historical_detail"
  | "world_rule"
  | "series_identifier";

export interface BookCoverCanonEvidenceV1 {
  evidenceId: string;
  kind: BookCoverCanonEvidenceKind;
  label: string;
  sourceLocationIds: string[];
  sourceExcerptSha256: string;
  canonFactIds: string[];
  spoilerLevel: "none" | "minor" | "major" | "ending";
  approvedForCoverUse: boolean;
}

export interface BookCoverManuscriptAuthorityInputV1 {
  outputKind: "evavo_art_book_cover_manuscript_authority_input";
  schemaVersion: typeof BOOK_COVER_MANUSCRIPT_AUTHORITY_SCHEMA_VERSION;
  contract: typeof BOOK_COVER_MANUSCRIPT_AUTHORITY_CONTRACT;
  projectId: string;
  bookId: string;
  manuscriptRevisionId: string;
  manuscriptSha256: string;
  canonSnapshotFingerprint: string;
  seriesContextFingerprint?: string;
  sourcePlanFingerprint: string;
  title: string;
  subtitle?: string;
  seriesTitle?: string;
  seriesPosition?: number;
  authorDisplayName: string;
  evidence: BookCoverCanonEvidenceV1[];
  approvedSpoilerCeiling: "none" | "minor" | "major";
  approvedAt: string;
  approvedBy: string;
  approvedByKind: "human";
}

export interface BookCoverManuscriptAuthorityV1
  extends BookCoverManuscriptAuthorityInputV1 {
  outputKind: "evavo_art_book_cover_manuscript_authority";
  evidenceIds: string[];
  blockedEvidenceIds: string[];
  endingSpoilersExcluded: true;
  exactManuscriptBindingRequired: true;
  exactCanonBindingRequired: true;
  automaticCanonInferenceAllowed: false;
  automaticSpoilerEscalationAllowed: false;
  authorityFingerprint: string;
}

export interface BookCoverManuscriptAuthorityValidationV1 {
  valid: boolean;
  issues: string[];
}

const SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SPOILER_RANK = { none: 0, minor: 1, major: 2, ending: 3 } as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, label: string, issues: string[]): string {
  if (typeof value !== "string" || !value.trim()) {
    issues.push(`${label} must be a non-empty string.`);
    return "invalid";
  }
  return value.trim();
}

function digest(value: unknown, label: string, issues: string[]): string {
  const parsed = text(value, label, issues).toLowerCase();
  if (!SHA256.test(parsed)) issues.push(`${label} must be a SHA-256 digest.`);
  return parsed.startsWith("sha256:") ? parsed : `sha256:${parsed}`;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonical(value), "utf8").digest("hex")}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export function compileBookCoverManuscriptAuthority(
  value: unknown,
): BookCoverManuscriptAuthorityV1 {
  const issues: string[] = [];
  const input = isRecord(value)
    ? (value as Partial<BookCoverManuscriptAuthorityInputV1>)
    : {};

  if (!isRecord(value)) issues.push("Book-cover manuscript authority input must be one object.");
  if (
    input.outputKind !== "evavo_art_book_cover_manuscript_authority_input" ||
    input.schemaVersion !== BOOK_COVER_MANUSCRIPT_AUTHORITY_SCHEMA_VERSION ||
    input.contract !== BOOK_COVER_MANUSCRIPT_AUTHORITY_CONTRACT
  ) {
    issues.push("Book-cover manuscript authority identity is invalid.");
  }

  const projectId = text(input.projectId, "projectId", issues);
  const bookId = text(input.bookId, "bookId", issues);
  const manuscriptRevisionId = text(input.manuscriptRevisionId, "manuscriptRevisionId", issues);
  const manuscriptSha256 = digest(input.manuscriptSha256, "manuscriptSha256", issues);
  const canonSnapshotFingerprint = digest(
    input.canonSnapshotFingerprint,
    "canonSnapshotFingerprint",
    issues,
  );
  const sourcePlanFingerprint = digest(
    input.sourcePlanFingerprint,
    "sourcePlanFingerprint",
    issues,
  );
  const seriesContextFingerprint = input.seriesContextFingerprint === undefined
    ? undefined
    : digest(input.seriesContextFingerprint, "seriesContextFingerprint", issues);
  const title = text(input.title, "title", issues);
  const authorDisplayName = text(input.authorDisplayName, "authorDisplayName", issues);
  const approvedBy = text(input.approvedBy, "approvedBy", issues);
  const approvedAt = text(input.approvedAt, "approvedAt", issues);
  if (!ISO_TIME.test(approvedAt)) issues.push("approvedAt must be an ISO-8601 UTC timestamp.");
  if (input.approvedByKind !== "human") issues.push("Cover manuscript authority requires named human approval.");

  const ceiling = input.approvedSpoilerCeiling;
  if (ceiling !== "none" && ceiling !== "minor" && ceiling !== "major") {
    issues.push("approvedSpoilerCeiling must be none, minor or major; ending spoilers cannot be approved for cover use.");
  }

  const evidence = Array.isArray(input.evidence) ? input.evidence : [];
  if (!evidence.length) issues.push("At least one manuscript-backed cover evidence item is required.");
  const seen = new Set<string>();
  const blockedEvidenceIds: string[] = [];
  for (const item of evidence) {
    if (!isRecord(item)) {
      issues.push("Every cover evidence item must be an object.");
      continue;
    }
    const evidenceId = text(item.evidenceId, "evidence.evidenceId", issues);
    if (seen.has(evidenceId)) issues.push(`Duplicate cover evidence ID ${evidenceId}.`);
    seen.add(evidenceId);
    text(item.label, `evidence.${evidenceId}.label`, issues);
    digest(item.sourceExcerptSha256, `evidence.${evidenceId}.sourceExcerptSha256`, issues);
    const sourceLocationIds = Array.isArray(item.sourceLocationIds)
      ? item.sourceLocationIds.filter((entry): entry is string => typeof entry === "string" && !!entry.trim())
      : [];
    if (!sourceLocationIds.length) issues.push(`Cover evidence ${evidenceId} has no exact source locations.`);
    const canonFactIds = Array.isArray(item.canonFactIds)
      ? item.canonFactIds.filter((entry): entry is string => typeof entry === "string" && !!entry.trim())
      : [];
    if (!canonFactIds.length) issues.push(`Cover evidence ${evidenceId} is not bound to approved canon facts.`);
    const spoiler = item.spoilerLevel as keyof typeof SPOILER_RANK;
    if (!(spoiler in SPOILER_RANK)) issues.push(`Cover evidence ${evidenceId} has an invalid spoiler level.`);
    if (spoiler === "ending") {
      blockedEvidenceIds.push(evidenceId);
      issues.push(`Cover evidence ${evidenceId} exposes an ending spoiler and cannot be approved for cover use.`);
    } else if (ceiling && spoiler in SPOILER_RANK && SPOILER_RANK[spoiler] > SPOILER_RANK[ceiling]) {
      blockedEvidenceIds.push(evidenceId);
      issues.push(`Cover evidence ${evidenceId} exceeds the approved spoiler ceiling ${ceiling}.`);
    }
    if (item.approvedForCoverUse !== true) blockedEvidenceIds.push(evidenceId);
  }

  if (issues.length) {
    throw new Error(`Book-cover manuscript authority blocked: ${unique(issues).join(" | ")}`);
  }

  const unsigned = {
    outputKind: "evavo_art_book_cover_manuscript_authority" as const,
    schemaVersion: BOOK_COVER_MANUSCRIPT_AUTHORITY_SCHEMA_VERSION,
    contract: BOOK_COVER_MANUSCRIPT_AUTHORITY_CONTRACT,
    projectId,
    bookId,
    manuscriptRevisionId,
    manuscriptSha256,
    canonSnapshotFingerprint,
    ...(seriesContextFingerprint ? { seriesContextFingerprint } : {}),
    sourcePlanFingerprint,
    title,
    ...(input.subtitle ? { subtitle: input.subtitle.trim() } : {}),
    ...(input.seriesTitle ? { seriesTitle: input.seriesTitle.trim() } : {}),
    ...(input.seriesPosition ? { seriesPosition: input.seriesPosition } : {}),
    authorDisplayName,
    evidence: evidence as BookCoverCanonEvidenceV1[],
    approvedSpoilerCeiling: ceiling as "none" | "minor" | "major",
    approvedAt,
    approvedBy,
    approvedByKind: "human" as const,
    evidenceIds: unique([...seen]),
    blockedEvidenceIds: unique(blockedEvidenceIds),
    endingSpoilersExcluded: true as const,
    exactManuscriptBindingRequired: true as const,
    exactCanonBindingRequired: true as const,
    automaticCanonInferenceAllowed: false as const,
    automaticSpoilerEscalationAllowed: false as const,
  };

  return { ...unsigned, authorityFingerprint: sha256(unsigned) };
}

export function validateBookCoverManuscriptAuthority(
  value: unknown,
): BookCoverManuscriptAuthorityValidationV1 {
  const issues: string[] = [];
  if (!isRecord(value)) return { valid: false, issues: ["Authority must be an object."] };
  const authority = value as Partial<BookCoverManuscriptAuthorityV1>;
  if (
    authority.outputKind !== "evavo_art_book_cover_manuscript_authority" ||
    authority.schemaVersion !== BOOK_COVER_MANUSCRIPT_AUTHORITY_SCHEMA_VERSION ||
    authority.contract !== BOOK_COVER_MANUSCRIPT_AUTHORITY_CONTRACT
  ) issues.push("Authority identity is invalid.");
  if (!SHA256.test(String(authority.manuscriptSha256 ?? ""))) issues.push("Manuscript digest is invalid.");
  if (!SHA256.test(String(authority.canonSnapshotFingerprint ?? ""))) issues.push("Canon fingerprint is invalid.");
  if (!SHA256.test(String(authority.sourcePlanFingerprint ?? ""))) issues.push("Source-plan fingerprint is invalid.");
  if (authority.seriesContextFingerprint !== undefined && !SHA256.test(String(authority.seriesContextFingerprint))) {
    issues.push("Series-context fingerprint is invalid.");
  }
  if (authority.approvedByKind !== "human") issues.push("Named human approval is missing.");
  if (authority.endingSpoilersExcluded !== true) issues.push("Ending-spoiler exclusion is not asserted.");
  if (authority.exactManuscriptBindingRequired !== true || authority.exactCanonBindingRequired !== true) {
    issues.push("Exact manuscript/canon binding requirements are missing.");
  }
  if (authority.automaticCanonInferenceAllowed !== false || authority.automaticSpoilerEscalationAllowed !== false) {
    issues.push("Automatic canon inference or spoiler escalation is incorrectly enabled.");
  }
  if ((authority.blockedEvidenceIds ?? []).length) issues.push("Authority retains blocked cover evidence.");
  if (!SHA256.test(String(authority.authorityFingerprint ?? ""))) {
    issues.push("Authority fingerprint is invalid.");
  } else {
    const { authorityFingerprint: _ignored, ...unsigned } = authority as BookCoverManuscriptAuthorityV1;
    if (sha256(unsigned) !== authority.authorityFingerprint) {
      issues.push("Authority fingerprint differs from canonical contents.");
    }
  }
  return { valid: issues.length === 0, issues: unique(issues) };
}
