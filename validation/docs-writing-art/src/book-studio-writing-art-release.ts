import { validateBookArtBriefExact } from "./book-studio-art-brief-exact";
import type { BookArtBriefV1 } from "./book-studio-art-contracts";
import { importWebsiteCanonicalMutationReceipt } from "./book-studio-canonical-mutation-receipt-import";
import { parseWebsiteCanonicalMutationReceipt } from "./book-studio-canonical-mutation-receipt-parse";
import type {
  BookCanonicalMutationPlanV1,
  WebsiteCanonicalMutationReceiptV1,
} from "./book-studio-canonical-mutation-types";
import { canonicalBookJson, sha256BookText } from "./book-studio-project-contracts";
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
  websiteMutationReceipt: WebsiteCanonicalMutationReceiptV1;
  receiptImportedAt: string;
  receiptImportedBy: string;
  finalArtBrief: BookArtBriefV1;
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
  linkFingerprint: string;
  mutationId: string;
  canonicalMutationPlanFingerprint: string;
  websiteMutationReceiptFingerprint?: string;
  websiteMutationImportFingerprint?: string;
  projectId: string;
  programmeId: string;
  volumeId: string;
  manuscriptRevisionId: string;
  manuscriptSha256: string;
  draftArtBriefFingerprint?: string;
  finalArtBriefFingerprint?: string;
  writingStudioMainCommit: string;
  artStudioMainCommit: string;
  releasedAt: string;
  releasedBy: string;
  requiredEvidenceIds: string[];
  blockers: string[];
  requiredActions: string[];
  releaseFingerprint: string;
  websiteCanonicalMutationVerified: boolean;
  exactFinalArtBriefVerified: boolean;
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

const INPUT_FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "link",
  "websiteMutationReceipt",
  "receiptImportedAt",
  "receiptImportedBy",
  "finalArtBrief",
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
  rejectUnknown(root, INPUT_FIELDS, "Book writing-art release input", blockers);
  if (
    root.outputKind !== "evavo_docs_book_writing_art_release_input" ||
    root.schemaVersion !== 1 ||
    root.contract !== BOOK_WRITING_ART_RELEASE_CONTRACT
  ) {
    blockers.push("Book writing-art release identity or version is invalid.");
  }
  const receiptImportedAt = timestamp(
    root.receiptImportedAt,
    "receiptImportedAt",
    blockers,
  );
  const receiptImportedBy = text(
    root.receiptImportedBy,
    "receiptImportedBy",
    blockers,
    300,
  );
  const releasedAt = timestamp(root.releasedAt, "releasedAt", blockers);
  const releasedBy = text(root.releasedBy, "releasedBy", blockers, 300);
  if (
    root.writingStudioMayCallArtStudioDirectly !== false ||
    root.docsSuiteCanonicalWriterEnabled !== false ||
    root.runtimeCutoverApproved !== false ||
    root.publicationPerformed !== false
  ) {
    blockers.push("Book writing-art release authority flags are invalid.");
  }

  const linkInput = isObject(root.link)
    ? (root.link as unknown as BookWritingArtLinkInputV1)
    : undefined;
  if (!linkInput) blockers.push("Book writing-art release link must be an object.");
  const link = await compileBookWritingArtLink(root.link);
  blockers.push(...link.blockers);
  requiredActions.push(...link.requiredActions);
  if (link.status !== "ready_for_website_compare_and_swap") {
    requiredActions.push("Resolve the writing-art link before Art release.");
  }

  const plan = linkInput?.canonicalMutationPlan as
    | BookCanonicalMutationPlanV1
    | undefined;
  const parsedReceipt = await parseWebsiteCanonicalMutationReceipt(
    root.websiteMutationReceipt,
    blockers,
  );
  const websiteImport = await importWebsiteCanonicalMutationReceipt({
    outputKind: "evavo_docs_website_canonical_mutation_receipt_import_input",
    schemaVersion: 1,
    plan,
    receipt: parsedReceipt,
    importedAt: receiptImportedAt,
    importedBy: receiptImportedBy,
  });
  blockers.push(...websiteImport.blockers);
  requiredActions.push(...websiteImport.requiredActions);
  if (websiteImport.status !== "ready_for_shadow_observation") {
    requiredActions.push(
      "Import one exact successful Website canonical-mutation receipt.",
    );
  }
  match(
    websiteImport.planFingerprint,
    link.canonicalMutationPlanFingerprint,
    "Imported Website receipt belongs to a different canonical mutation plan.",
    blockers,
  );
  match(
    websiteImport.receiptFingerprint,
    parsedReceipt.receiptFingerprint,
    "Imported Website receipt fingerprint differs from the parsed receipt.",
    blockers,
  );
  match(
    websiteImport.resultingSnapshotFingerprint,
    plan?.proposedSnapshot?.stateFingerprint,
    "Imported Website receipt resulting snapshot differs from the canonical plan.",
    blockers,
  );

  const finalArtBrief = await parseExactArtBrief(root.finalArtBrief, blockers);
  const draftArtBrief = linkInput?.draftArtBrief;
  if (finalArtBrief && draftArtBrief && plan?.proposedSnapshot) {
    if (
      canonicalBookJson(bookArtBriefIntent(finalArtBrief)) !==
      canonicalBookJson(bookArtBriefIntent(draftArtBrief))
    ) {
      blockers.push(
        "Final Book Art brief creative intent differs from the pre-mutation draft brief.",
      );
    }
    match(
      finalArtBrief.identity.projectId,
      plan.projectId,
      "Final Art brief project differs from canonical plan.",
      blockers,
    );
    match(
      finalArtBrief.identity.bookId,
      plan.volumeId,
      "Final Art brief book differs from canonical plan volume.",
      blockers,
    );
    match(
      finalArtBrief.manuscript.manuscriptRevisionId,
      plan.proposedSnapshot.manuscriptRevisionId,
      "Final Art brief revision differs from canonical proposed snapshot.",
      blockers,
    );
    match(
      finalArtBrief.manuscript.manuscriptSha256,
      plan.proposedSnapshot.manuscriptSha256,
      "Final Art brief manuscript differs from canonical proposed snapshot.",
      blockers,
    );
    match(
      finalArtBrief.manuscript.extractedTextSha256,
      link.proposedExtractedTextSha256,
      "Final Art brief extracted-text fingerprint differs from link.",
      blockers,
    );
    match(
      finalArtBrief.manuscript.visualCanonSha256,
      link.visualCanonSha256,
      "Final Art brief visual-canon fingerprint differs from link.",
      blockers,
    );
    match(
      finalArtBrief.manuscript.artDirectionSha256,
      link.artDirectionSha256,
      "Final Art brief art-direction fingerprint differs from link.",
      blockers,
    );
    if (Date.parse(finalArtBrief.createdAt) < Date.parse(parsedReceipt.persistedAt)) {
      blockers.push("Final Art brief predates Website canonical mutation.");
    }
    if (Date.parse(finalArtBrief.createdAt) < Date.parse(receiptImportedAt)) {
      blockers.push("Final Art brief predates Website receipt import.");
    }
    if (Date.parse(releasedAt) < Date.parse(finalArtBrief.createdAt)) {
      blockers.push("Art shadow release predates the final Art brief.");
    }
  }

  const requiredEvidenceIds = unique(
    [
      ...link.requiredEvidenceIds,
      link.linkFingerprint,
      link.draftArtBriefFingerprint ?? "",
      plan?.planFingerprint ?? "",
      ...(plan?.evidenceIds ?? []),
      websiteImport.importFingerprint,
      parsedReceipt.receiptFingerprint,
    ].filter(Boolean),
  ).sort();
  const approvedEvidence = new Set(
    finalArtBrief?.manuscript.approvedEvidenceIds ?? [],
  );
  for (const evidenceId of requiredEvidenceIds) {
    if (!approvedEvidence.has(evidenceId)) {
      blockers.push(
        `Final Art brief is missing approved release evidence ${evidenceId}.`,
      );
    }
  }

  const finalBlockers = unique(blockers);
  const finalActions = unique(requiredActions);
  const websiteCanonicalMutationVerified =
    websiteImport.status === "ready_for_shadow_observation" &&
    websiteImport.receiptFingerprint === parsedReceipt.receiptFingerprint;
  const exactFinalArtBriefVerified = finalArtBrief !== undefined;
  const status: BookWritingArtReleaseReceiptV1["status"] = finalBlockers.length
    ? "blocked"
    : finalActions.length ||
        link.status !== "ready_for_website_compare_and_swap" ||
        !websiteCanonicalMutationVerified ||
        !exactFinalArtBriefVerified
      ? "needs_work"
      : "ready_for_art_shadow";
  const unsigned: Omit<BookWritingArtReleaseReceiptV1, "releaseFingerprint"> = {
    outputKind: "evavo_docs_book_writing_art_release_receipt",
    schemaVersion: 1,
    contract: BOOK_WRITING_ART_RELEASE_CONTRACT,
    status,
    linkContract: BOOK_WRITING_ART_LINK_CONTRACT,
    linkFingerprint: link.linkFingerprint,
    mutationId: link.mutationId,
    canonicalMutationPlanFingerprint: link.canonicalMutationPlanFingerprint,
    ...(parsedReceipt.receiptFingerprint
      ? { websiteMutationReceiptFingerprint: parsedReceipt.receiptFingerprint }
      : {}),
    ...(websiteImport.importFingerprint
      ? { websiteMutationImportFingerprint: websiteImport.importFingerprint }
      : {}),
    projectId: link.projectId,
    programmeId: link.programmeId,
    volumeId: link.volumeId,
    manuscriptRevisionId: link.proposedManuscriptRevisionId,
    manuscriptSha256: link.proposedAfterManuscriptSha256,
    ...(link.draftArtBriefFingerprint === undefined
      ? {}
      : { draftArtBriefFingerprint: link.draftArtBriefFingerprint }),
    ...(finalArtBrief?.briefFingerprint === undefined
      ? {}
      : { finalArtBriefFingerprint: finalArtBrief.briefFingerprint }),
    writingStudioMainCommit: link.writingStudioMainCommit,
    artStudioMainCommit: link.artStudioMainCommit,
    releasedAt,
    releasedBy,
    requiredEvidenceIds,
    blockers: finalBlockers,
    requiredActions: finalActions,
    websiteCanonicalMutationVerified,
    exactFinalArtBriefVerified,
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
    ...unsigned,
    releaseFingerprint: await sha256BookText(canonicalBookJson(unsigned)),
  };
}

async function parseExactArtBrief(
  value: unknown,
  blockers: string[],
): Promise<BookArtBriefV1 | undefined> {
  if (!isObject(value)) {
    blockers.push("Final Book Art brief must be an object.");
    return undefined;
  }
  const brief = value as unknown as BookArtBriefV1;
  const validation = await validateBookArtBriefExact(brief);
  if (!validation.valid) {
    blockers.push("Final Book Art brief is invalid.", ...validation.issues);
    return undefined;
  }
  return brief;
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

function isObject(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function record(value: unknown, label: string, blockers: string[]): UnknownRecord {
  if (!isObject(value)) {
    blockers.push(`${label} must be an object.`);
    return {};
  }
  return value;
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
