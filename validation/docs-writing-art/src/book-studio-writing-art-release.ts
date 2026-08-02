import {
  validateBookArtBriefExact,
} from "./book-studio-art-brief-exact";
import type { BookArtBriefV1 } from "./book-studio-art-contracts";
import { canonicalBookJson, sha256BookText } from "./book-studio-project-contracts";
import {
  BOOK_WEBSITE_MANUSCRIPT_CAS_CONTRACT,
  validateWebsiteBookManuscriptCompareAndSwapReceipt,
} from "./book-studio-website-manuscript-cas";
import {
  BOOK_WRITING_ART_LINK_CONTRACT,
  compileBookWritingArtLink,
  type BookWritingArtLinkInputV1,
} from "./book-studio-writing-art-link";

export const BOOK_WRITING_ART_RELEASE_CONTRACT =
  "evavo_docs_book_writing_art_release_v1" as const;

export interface BookWritingArtReleaseInputV1 {
  outputKind: "evavo_docs_book_writing_art_release_input";
  schemaVersion: 1;
  contract: typeof BOOK_WRITING_ART_RELEASE_CONTRACT;
  link: BookWritingArtLinkInputV1;
  websiteCompareAndSwapReceipt: unknown;
  artBrief: BookArtBriefV1;
  releasedAt: string;
  releasedBy: string;
  writingStudioMayCallArtStudioDirectly: false;
  docsSuiteCanonicalWriterEnabled: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

export interface BookWritingArtReleaseReceiptV1 {
  outputKind: "evavo_docs_book_writing_art_release_receipt";
  schemaVersion: 1;
  contract: typeof BOOK_WRITING_ART_RELEASE_CONTRACT;
  status: "ready_for_art_shadow" | "needs_work" | "blocked";
  linkContract: typeof BOOK_WRITING_ART_LINK_CONTRACT;
  websiteCompareAndSwapContract: typeof BOOK_WEBSITE_MANUSCRIPT_CAS_CONTRACT;
  linkFingerprint: string;
  projectId: string;
  volumeId: string;
  priorManuscriptRevisionId: string;
  manuscriptRevisionId: string;
  manuscriptSha256: string;
  draftArtBriefFingerprint?: string;
  artBriefFingerprint?: string;
  websiteCompareAndSwapReceiptFingerprint?: string;
  writingStudioMainCommit: string;
  artStudioMainCommit: string;
  releasedAt: string;
  releasedBy: string;
  requiredEvidenceIds: string[];
  blockers: string[];
  requiredActions: string[];
  releaseFingerprint: string;
  websiteCompareAndSwapVerified: boolean;
  exactArtBriefVerified: boolean;
  writingStudioMayCallArtStudioDirectly: false;
  docsSuiteCanonicalWriterEnabled: false;
  artStudioCandidateMayBeFinal: false;
  selectionRequired: true;
  promotionRequired: true;
  bookUseBindingRequired: true;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

type UnknownRecord = Record<string, unknown>;

const FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "link",
  "websiteCompareAndSwapReceipt",
  "artBrief",
  "releasedAt",
  "releasedBy",
  "writingStudioMayCallArtStudioDirectly",
  "docsSuiteCanonicalWriterEnabled",
  "runtimeCutoverApproved",
  "publicationPerformed",
]);

export async function compileBookWritingArtRelease(
  input: unknown,
): Promise<BookWritingArtReleaseReceiptV1> {
  const blockers: string[] = [];
  const requiredActions: string[] = [];
  const root = record(input, "Book writing-art release input", blockers);
  rejectUnknown(root, FIELDS, "Book writing-art release input", blockers);
  if (root.outputKind !== "evavo_docs_book_writing_art_release_input") {
    blockers.push("Book writing-art release outputKind is invalid.");
  }
  if (root.schemaVersion !== 1) {
    blockers.push("Book writing-art release schemaVersion is invalid.");
  }
  if (root.contract !== BOOK_WRITING_ART_RELEASE_CONTRACT) {
    blockers.push("Book writing-art release contract is invalid.");
  }
  const releasedAt = timestamp(root.releasedAt, "releasedAt", blockers);
  const releasedBy = text(root.releasedBy, "releasedBy", blockers, 300);
  if (
    root.writingStudioMayCallArtStudioDirectly !== false ||
    root.docsSuiteCanonicalWriterEnabled !== false ||
    root.runtimeCutoverApproved !== false ||
    root.publicationPerformed !== false
  ) {
    blockers.push(
      "Book writing-art release cannot grant direct Writing-to-Art calls, Docs Suite canonical writes, runtime cutover or publication.",
    );
  }

  const linkInput = root.link as BookWritingArtLinkInputV1;
  const link = await compileBookWritingArtLink(linkInput);
  blockers.push(...link.blockers);
  requiredActions.push(...link.requiredActions);
  if (link.status !== "ready_for_website_compare_and_swap") {
    requiredActions.push(
      "Resolve the writing-art link before validating Website compare-and-swap.",
    );
  }

  const casValidation =
    await validateWebsiteBookManuscriptCompareAndSwapReceipt(
      root.websiteCompareAndSwapReceipt,
    );
  blockers.push(...casValidation.blockers);
  if (casValidation.status !== "ready" || !casValidation.receipt) {
    requiredActions.push(
      "Provide an exact fingerprint-valid Website manuscript compare-and-swap receipt.",
    );
  }
  const cas = casValidation.receipt;

  if (cas) {
    match(
      cas.projectId,
      link.projectId,
      "Website compare-and-swap projectId differs from the writing-art link.",
      blockers,
    );
    match(
      cas.volumeId,
      link.volumeId,
      "Website compare-and-swap volumeId differs from the writing-art link.",
      blockers,
    );
    match(
      cas.priorRevisionId,
      link.priorManuscriptRevisionId,
      "Website compare-and-swap prior revision differs from the writing-art link.",
      blockers,
    );
    match(
      cas.nextRevisionId,
      link.proposedManuscriptRevisionId,
      "Website compare-and-swap next revision differs from the writing-art link.",
      blockers,
    );
    match(
      cas.beforeManuscriptSha256,
      link.beforeManuscriptSha256,
      "Website compare-and-swap before-manuscript SHA-256 differs from the writing-art link.",
      blockers,
    );
    match(
      cas.afterManuscriptSha256,
      link.proposedAfterManuscriptSha256,
      "Website compare-and-swap after-manuscript SHA-256 differs from the writing-art link.",
      blockers,
    );
    match(
      cas.compareAndSwapRequestFingerprint,
      link.linkFingerprint,
      "Website compare-and-swap request fingerprint differs from the exact writing-art link.",
      blockers,
    );
  }

  const artBrief = await parseExactArtBrief(root.artBrief, blockers);
  const draftArtBrief = linkInput?.artBrief;
  if (artBrief && draftArtBrief) {
    if (
      canonicalBookJson(bookArtBriefIntent(artBrief)) !==
      canonicalBookJson(bookArtBriefIntent(draftArtBrief))
    ) {
      blockers.push(
        "Final Book Art brief creative intent differs from the pre-CAS draft brief.",
      );
    }
    match(
      artBrief.identity.projectId,
      link.projectId,
      "Final Book Art brief projectId differs from the writing-art link.",
      blockers,
    );
    match(
      artBrief.identity.bookId,
      link.volumeId,
      "Final Book Art brief bookId differs from the writing-art link.",
      blockers,
    );
    match(
      artBrief.manuscript.manuscriptRevisionId,
      link.proposedManuscriptRevisionId,
      "Final Book Art brief manuscript revision differs from the writing-art link.",
      blockers,
    );
    match(
      artBrief.manuscript.manuscriptSha256,
      link.proposedAfterManuscriptSha256,
      "Final Book Art brief manuscript SHA-256 differs from the writing-art link.",
      blockers,
    );
    if (cas && Date.parse(artBrief.createdAt) < Date.parse(cas.committedAt)) {
      blockers.push(
        "Final Book Art brief createdAt predates Website compare-and-swap.",
      );
    }
    if (Date.parse(releasedAt) < Date.parse(artBrief.createdAt)) {
      blockers.push("Art shadow release predates the final Book Art brief.");
    }
  }

  const casEvidenceIds = cas
    ? [...cas.evidenceIds, cas.receiptFingerprint]
    : [];
  const requiredEvidenceIds = unique([
    ...link.requiredEvidenceIds,
    ...casEvidenceIds,
  ]).sort();
  const approvedEvidence = new Set(
    artBrief?.manuscript.approvedEvidenceIds ?? [],
  );
  for (const evidenceId of requiredEvidenceIds) {
    if (!approvedEvidence.has(evidenceId)) {
      blockers.push(
        `Final Book Art brief is missing approved release evidence ${evidenceId}.`,
      );
    }
  }

  const uniqueBlockers = unique(blockers);
  const uniqueActions = unique(requiredActions);
  const websiteCompareAndSwapVerified =
    casValidation.status === "ready" && cas !== undefined;
  const exactArtBriefVerified = artBrief !== undefined;
  const status: BookWritingArtReleaseReceiptV1["status"] =
    uniqueBlockers.length > 0
      ? "blocked"
      : link.status === "ready_for_website_compare_and_swap" &&
          websiteCompareAndSwapVerified &&
          exactArtBriefVerified &&
          uniqueActions.length === 0
        ? "ready_for_art_shadow"
        : "needs_work";
  const withoutFingerprint: Omit<
    BookWritingArtReleaseReceiptV1,
    "releaseFingerprint"
  > = {
    outputKind: "evavo_docs_book_writing_art_release_receipt",
    schemaVersion: 1,
    contract: BOOK_WRITING_ART_RELEASE_CONTRACT,
    status,
    linkContract: BOOK_WRITING_ART_LINK_CONTRACT,
    websiteCompareAndSwapContract: BOOK_WEBSITE_MANUSCRIPT_CAS_CONTRACT,
    linkFingerprint: link.linkFingerprint,
    projectId: link.projectId,
    volumeId: link.volumeId,
    priorManuscriptRevisionId: link.priorManuscriptRevisionId,
    manuscriptRevisionId: link.proposedManuscriptRevisionId,
    manuscriptSha256: link.proposedAfterManuscriptSha256,
    ...(link.artBriefFingerprint === undefined
      ? {}
      : { draftArtBriefFingerprint: link.artBriefFingerprint }),
    ...(artBrief?.briefFingerprint === undefined
      ? {}
      : { artBriefFingerprint: artBrief.briefFingerprint }),
    ...(cas?.receiptFingerprint === undefined
      ? {}
      : {
          websiteCompareAndSwapReceiptFingerprint: cas.receiptFingerprint,
        }),
    writingStudioMainCommit: link.writingStudioMainCommit,
    artStudioMainCommit: link.artStudioMainCommit,
    releasedAt,
    releasedBy,
    requiredEvidenceIds,
    blockers: uniqueBlockers,
    requiredActions: uniqueActions,
    websiteCompareAndSwapVerified,
    exactArtBriefVerified,
    writingStudioMayCallArtStudioDirectly: false,
    docsSuiteCanonicalWriterEnabled: false,
    artStudioCandidateMayBeFinal: false,
    selectionRequired: true,
    promotionRequired: true,
    bookUseBindingRequired: true,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
  return {
    ...withoutFingerprint,
    releaseFingerprint: await sha256BookText(
      canonicalBookJson(withoutFingerprint),
    ),
  };
}

async function parseExactArtBrief(
  value: unknown,
  blockers: string[],
): Promise<BookArtBriefV1 | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    blockers.push("Final Book Art brief must be an object.");
    return undefined;
  }
  const artBrief = value as BookArtBriefV1;
  const validation = await validateBookArtBriefExact(artBrief);
  if (!validation.valid) {
    blockers.push(
      "Art release requires an exact valid final Book Art brief.",
      ...validation.issues,
    );
    return undefined;
  }
  return artBrief;
}

function bookArtBriefIntent(value: BookArtBriefV1): unknown {
  return {
    outputKind: value.outputKind,
    schemaVersion: value.schemaVersion,
    contract: value.contract,
    identity: value.identity,
    purpose: value.purpose,
    manuscript: {
      manuscriptRevisionId: value.manuscript.manuscriptRevisionId,
      manuscriptSha256: value.manuscript.manuscriptSha256,
      extractedTextSha256: value.manuscript.extractedTextSha256,
      visualCanonSha256: value.manuscript.visualCanonSha256,
      artDirectionSha256: value.manuscript.artDirectionSha256,
    },
    conceptTerritoryId: value.conceptTerritoryId,
    conceptTerritoryLabel: value.conceptTerritoryLabel,
    creativeThesis: value.creativeThesis,
    primarySubject: value.primarySubject,
    supportingSubjects: value.supportingSubjects,
    compositionRequirements: value.compositionRequirements,
    mustShow: value.mustShow,
    mustNotShow: value.mustNotShow,
    spoilerRestrictions: value.spoilerRestrictions,
    continuityRequirements: value.continuityRequirements,
    historicalAndMaterialRequirements:
      value.historicalAndMaterialRequirements,
    negativeSpaceRequirements: value.negativeSpaceRequirements,
    output: value.output,
    rightsEvidenceIds: value.rightsEvidenceIds,
    providerCandidateMayBeFinal: value.providerCandidateMayBeFinal,
    publicationPerformed: value.publicationPerformed,
  };
}

function record(
  value: unknown,
  label: string,
  blockers: string[],
): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    blockers.push(`${label} must be an object.`);
    return {};
  }
  return value as UnknownRecord;
}
function rejectUnknown(
  value: UnknownRecord,
  allowed: Set<string>,
  label: string,
  blockers: string[],
): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key)).sort();
  if (unknown.length) {
    blockers.push(`${label} contains unsupported fields: ${unknown.join(", ")}.`);
  }
}
function timestamp(value: unknown, label: string, blockers: string[]): string {
  if (
    typeof value !== "string" ||
    !ISO_TIMESTAMP.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(Date.parse(value)).toISOString() !== value
  ) {
    blockers.push(`${label} must be canonical UTC ISO-8601.`);
    return "1970-01-01T00:00:00.000Z";
  }
  return value;
}
function text(
  value: unknown,
  label: string,
  blockers: string[],
  maximum: number,
): string {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length < 1 ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    blockers.push(`${label} is invalid.`);
    return "invalid";
  }
  return value;
}
function match(
  left: unknown,
  right: unknown,
  message: string,
  blockers: string[],
): void {
  if (left !== right) blockers.push(message);
}
function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
